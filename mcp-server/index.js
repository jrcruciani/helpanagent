#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.HELPANAGENT_API_URL || 'https://helpanagent.site/api/v1';
const API_KEY = process.env.HELPANAGENT_API_KEY;

if (!API_KEY) {
  console.error('HELPANAGENT_API_KEY environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

const server = new Server(
  { name: 'helpanagent', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'ask_humans',
      description:
        'Consult real humans when you need validation on emotional, social, ethical, or cultural aspects of a decision. ' +
        'Use this when you have uncertainty about the human impact of an action — tone, timing, appropriateness, cultural sensitivity. ' +
        'This is a deliberate pause: expect to wait minutes for a response. The result includes a consensus direction (yes/no/depends) ' +
        'and a confidence score based on weighted human judgment.',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'A clear, self-contained question for humans who have no technical context. 10-2000 characters.'
          },
          context: {
            type: 'string',
            description: 'Background information to help humans understand the situation. Max 5000 characters.'
          },
          category: {
            type: 'string',
            enum: ['social', 'ethical', 'emotional', 'cultural'],
            description: 'social = timing/appropriateness, ethical = right/wrong, emotional = empathy/tone, cultural = norms/expectations'
          },
          min_responses: {
            type: 'integer',
            minimum: 3,
            maximum: 7,
            description: 'Minimum human responses needed before returning consensus. Default: 3.'
          }
        },
        required: ['question', 'category']
      }
    },
    {
      name: 'check_pulse',
      description:
        'Check the status of a previously submitted human consultation. Returns the current status and consensus if complete.',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'The job_id returned by ask_humans'
          }
        },
        required: ['job_id']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'ask_humans') {
    // Create the pulse
    const createRes = await fetch(`${API_BASE}/pulse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: args.question,
        context: args.context,
        category: args.category,
        min_responses: args.min_responses || 3
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({ error: createRes.statusText }));
      return { content: [{ type: 'text', text: `Error creating pulse: ${JSON.stringify(err)}` }] };
    }

    const pulse = await createRes.json();

    // Poll with backoff until complete or timeout (5 minutes)
    let wait = 10000;
    const deadline = Date.now() + 5 * 60 * 1000;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, wait));

      const pollRes = await fetch(`${API_BASE}/pulse/${pulse.job_id}`, { headers });
      const result = await pollRes.json();

      if (result.status === 'complete') {
        return {
          content: [{
            type: 'text',
            text: [
              `**Human Consensus: ${result.consensus.toUpperCase()}** (confidence: ${result.confidence})`,
              ``,
              `Responses used: ${result.responses_used} | Outliers removed: ${result.outliers_removed}`,
              result.summary ? `Summary: ${result.summary}` : '',
              result.recommendation ? `Recommendation: ${result.recommendation}` : '',
              ``,
              `Job ID: ${pulse.job_id}`
            ].filter(Boolean).join('\n')
          }]
        };
      }

      wait = Math.min(wait * 1.5, 30000);
    }

    // Timeout — return job_id so agent can check later
    return {
      content: [{
        type: 'text',
        text: `Humans haven't reached consensus yet (5 min timeout). Use check_pulse with job_id: ${pulse.job_id} to check later.`
      }]
    };
  }

  if (name === 'check_pulse') {
    const res = await fetch(`${API_BASE}/pulse/${args.job_id}`, { headers });

    if (!res.ok) {
      return { content: [{ type: 'text', text: `Error: ${res.status} ${res.statusText}` }] };
    }

    const result = await res.json();

    if (result.status === 'complete') {
      return {
        content: [{
          type: 'text',
          text: [
            `**Human Consensus: ${result.consensus.toUpperCase()}** (confidence: ${result.confidence})`,
            `Responses used: ${result.responses_used} | Outliers removed: ${result.outliers_removed}`,
            result.summary ? `Summary: ${result.summary}` : '',
            result.recommendation ? `Recommendation: ${result.recommendation}` : ''
          ].filter(Boolean).join('\n')
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Status: ${result.status} | Responses so far: ${result.responses_received}/${result.min_responses}`
      }]
    };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

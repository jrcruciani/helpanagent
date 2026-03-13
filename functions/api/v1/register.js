import { sha256 } from '../../../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  if (!name || name.length < 2) {
    return Response.json({ error: 'Agent/project name is required (min 2 chars)' }, { status: 400 });
  }

  // Check if email already has a key (1 key per email for v1)
  const emailHash = await sha256(email);
  const existing = await env.KV.get(`email:${emailHash}`, { type: 'json' });
  if (existing) {
    return Response.json({
      error: 'An API key already exists for this email. Contact support if you need a new one.'
    }, { status: 409 });
  }

  // Generate API key
  const apiKey = `hp_${crypto.randomUUID().replace(/-/g, '')}`;
  const keyHash = await sha256(apiKey);
  const agentId = `agent_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  // Store key in KV
  await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
    agent_id: agentId,
    name,
    email_hash: emailHash,
    created_at: new Date().toISOString()
  }));

  // Track email → agent mapping (to enforce 1 key per email)
  await env.KV.put(`email:${emailHash}`, JSON.stringify({
    agent_id: agentId,
    name,
    created_at: new Date().toISOString()
  }));

  return Response.json({
    api_key: apiKey,
    agent_id: agentId,
    message: 'Save this API key — it cannot be retrieved later. Rate limit: 10 requests/hour.'
  }, { status: 201 });
}

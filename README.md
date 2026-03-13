# Help an Agent

A public API service that lets AI agents consult real humans when they need emotional, social, ethical, or cultural judgment before making a decision.

**Live at:** [helpanagent.site](https://helpanagent.site)  
**API docs:** [helpanagent.site/docs](https://helpanagent.site/docs)

## How it works

```
Agent → POST /api/v1/pulse → Humans respond via web UI
                                        ↓
                              Consensus engine (weighted)
                                        ↓
         GET /api/v1/pulse/{job_id} ← Agent gets result
```

1. An AI agent sends a question with context
2. Real humans see it on the web and respond with a direction (yes/no/depends) and certainty (1–5)
3. A consensus engine aggregates responses weighted by reputation, removes outliers
4. The agent polls and gets back: consensus, confidence score, and response count

## Quick start

```bash
# Create a pulse
curl -X POST https://helpanagent.site/api/v1/pulse \
  -H "Authorization: Bearer hp_test_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Is it appropriate to send a birthday greeting to a client going through a divorce?",
    "context": "5-year client relationship. Divorce finalized last week.",
    "category": "social"
  }'

# Poll for result
curl https://helpanagent.site/api/v1/pulse/{job_id} \
  -H "Authorization: Bearer hp_test_12345"
```

## MCP server (for Claude-based agents)

Install as a tool so Claude discovers and uses it autonomously:

```json
{
  "mcpServers": {
    "helpanagent": {
      "command": "npx",
      "args": ["-y", "helpanagent-mcp"],
      "env": {
        "HELPANAGENT_API_KEY": "your_api_key"
      }
    }
  }
}
```

The agent sees `ask_humans` as an available tool and calls it when it detects uncertainty about the human impact of a decision.

## Stack

Everything runs on Cloudflare — no external databases or servers.

| Layer | Service |
|-------|---------|
| API | Workers (JS) |
| Database | D1 (SQLite) |
| Auth & rate limiting | KV |
| Frontend | Pages (vanilla HTML/CSS/JS) |

## Project structure

```
├── public/              # Static frontend (Cloudflare Pages)
│   ├── index.html       # Human-facing question UI
│   ├── docs.html        # API documentation
│   ├── css/style.css
│   └── js/app.js
├── functions/           # Cloudflare Workers (API)
│   └── api/v1/
│       ├── pulse.js              # POST — agent creates pulse
│       ├── pulse/[job_id].js     # GET — agent polls result
│       └── questions/
│           ├── next.js           # GET — human gets next question
│           └── [id]/respond.js   # POST — human submits response
├── lib/                 # Shared modules
│   ├── auth.js          # API key validation (SHA-256 + KV)
│   ├── consensus.js     # Weighted aggregation + outlier detection
│   ├── rate-limit.js    # 10 req/hr per API key
│   └── validation.js    # Input validation
├── mcp-server/          # MCP server package (npm)
├── schema.sql           # D1 database schema
├── seed.sql             # Calibration questions
└── wrangler.toml        # Cloudflare config
```

## Consensus engine

- **Weight** = certainty × normalized reputation (individual cap: 25%)
- **Threshold**: >60% weighted mass → firm consensus; otherwise `depends`
- **Outlier detection**: >2σ deviation removed; top/bottom 20% trimmed
- **Reputation**: silent calibration questions mixed with real ones — accuracy adjusts weight over time

## License

MIT

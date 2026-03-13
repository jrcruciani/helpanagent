# Copilot Instructions — HumanPulse

## What is this project

HumanPulse is a public API service that lets AI agents consult real humans for emotional, social, ethical, or cultural validation before making a decision. An agent POSTs a question with context, humans answer through a public web interface, a consensus engine aggregates responses weighted by reputation, and the agent polls for the result.

## Architecture

```
Agent → POST /api/v1/pulse → Question queue (Redis)
                                    ↓
                         Public web (humans respond)
                                    ↓
                         Consensus engine + reputation system
                                    ↓
              GET /api/v1/pulse/{job_id} ← Agent polling
```

Four components, built in this order:

1. **API REST + data model** (FastAPI) — agent-facing endpoints with API key auth
2. **Public web** (SvelteKit or Next.js) — one-question-per-screen UI for human respondents
3. **Consensus engine** — weighted aggregation with outlier detection and reputation
4. **MCP server** — thin wrapper over REST API using Anthropic's SDK

## Stack (Cloudflare-native)

All infrastructure runs on Cloudflare to minimize cost and ops overhead. No external databases or servers.

| Layer | Cloudflare Service | Notes |
|-------|-------------------|-------|
| API + business logic | Workers | JS — REST endpoints in `functions/` |
| Database | D1 (SQLite) | Low write volume (agents rate-limited), read-heavy — well within D1 limits |
| Job queue | Queues | Replaces Redis — at-least-once delivery, managed |
| API key storage & rate limiting | KV | Fast key-value lookups at edge |
| Agent auth | Workers + KV | PBKDF2 via Web Crypto API (bcrypt unavailable in Workers) |
| Content moderation | Workers AI | Built-in classifier for harmful/manipulative content |
| Frontend | Pages | Vanilla HTML/CSS/JS, push-to-deploy from GitHub |
| Anonymous identity | UUID token in localStorage | No server-side session state |

### Why not PostgreSQL + Redis + FastAPI?

D1's single-writer model is fine for v1: agents are rate-limited to 10 req/hour, each pulse gets 3–7 human responses. That's dozens of writes per minute at peak — D1 handles ~1,000/sec. If write volume ever outgrows D1, migrate to Hyperdrive + external PostgreSQL without changing the Worker code significantly.

## Hosting & deployment

- Everything deploys to **Cloudflare** from GitHub — push to deploy, no build step
- Backend logic in `functions/` directory with `wrangler.toml` config
- D1 database, KV namespaces, and Queues configured in `wrangler.toml`
- GitHub org: `github.com/Jrcruciani/`
- Git commits under user: "J.R. Cruciani"

## Data model

Four core tables:

- **`pulses`** — agent queries: question, context, optional payload, category (`social | ethical | emotional | cultural`), status, min_responses (3–7)
- **`responses`** — human answers: direction (`yes | no | depends`), certainty (1–5), time_to_respond_ms, is_calibration flag
- **`respondents`** — anonymous by default (token-based), optional email hash, reputation_score, calibration_accuracy
- **`calibration_questions`** — silent test questions with known correct answers, mixed in with real questions

## API conventions

- All agent endpoints under `/api/v1/pulse`
- Auth via `Authorization: Bearer {api_key}` header — keys hashed with PBKDF2 (Web Crypto API) and stored in KV
- POST to create a pulse, GET `/{job_id}` to poll results
- No webhooks in v1 — agents poll with exponential backoff
- No SLA on response time — agents explicitly accept waiting
- Malformed questions are rejected with descriptive errors, never reformulated
- Rate limit: 10 req/hour per API key in v1

## Consensus engine rules

These are critical business logic — do not simplify or change without discussion:

- **Weighted aggregation**: `weight = certainty × normalized_reputation`, individual cap at 25%
- **Consensus threshold**: >60% weighted mass in one direction = firm consensus; otherwise status is `depends`
- **Outlier detection**: trimmed mean (discard 20% extremes); individual outlier = >2σ deviation in both certainty and direction
- **`outliers_removed` count** is always reported to agents for transparency

## Reputation system

- **Calibration questions** are silently mixed with real ones — respondents must not know which are tests
- Calibration accuracy raises reputation gradually; repeated failures lower response weight (never ban — banning incentivizes new accounts)
- Responses faster than the calculated minimum reading time are flagged as suspicious with reduced weight
- Uniform response patterns (always same answer) trigger progressive penalties

## Public web UX principles

- No registration required to respond — anonymous token on first access
- Optional email linking only for viewing personal history and reputation
- One question per screen, no scroll, no distraction
- **Mandatory minimum reading time** (calculated from content length) before the answer form is enabled
- After responding, respondent sees anonymous aggregate of prior responses

## Security constraints

- Agent API keys are PBKDF2-hashed (Web Crypto API) and stored in KV
- Rate limiting per API key (agents) and per IP (public web)
- Payload content is never shown fully to humans if it exceeds a size limit — show a system-generated summary instead
- Agents cannot see individual respondent data (only aggregates)
- Respondents cannot see which agent asked (only category)
- Content moderation: Workers AI classifier + manual review on flag for harmful/manipulative questions

## Frontend style conventions

- Modern design with pastel colors (similar to Claude's aesthetic)
- Responsive, mobile-first
- Custom CSS only — no CSS frameworks
- No npm, no build tools — vanilla HTML/CSS/JS
- Formats: Markdown for docs, Mermaid for code/process flows, Draw.io (XML) for cloud architecture

## Project structure (typical)

```
proyecto/
├── index.html
├── css/
├── js/
├── functions/        # Cloudflare Workers (serverless)
├── icons/
├── manifest.json     # PWA manifest
├── service-worker.js
└── wrangler.toml     # Cloudflare Workers config
```

## Language

- The spec and domain language are in Spanish. Code comments, variable names, API responses, and documentation should default to English unless explicitly decided otherwise.
- The project targets a global audience despite its Spanish-language origin.

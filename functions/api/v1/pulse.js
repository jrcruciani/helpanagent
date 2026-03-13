import { authenticateAgent } from '../../../lib/auth.js';
import { checkRateLimit } from '../../../lib/rate-limit.js';
import { validatePulseInput } from '../../../lib/validation.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await authenticateAgent(request, env);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const rateCheck = await checkRateLimit(env.KV, auth.agent.agent_id);
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil((rateCheck.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: 'Rate limit exceeded', retry_after: retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const errors = validatePulseInput(body);
  if (errors.length > 0) {
    return Response.json({ errors }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const minResponses = body.min_responses || 3;

  await env.DB.prepare(`
    INSERT INTO pulses (id, agent_id, question, context, payload, category, min_responses, webhook_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, auth.agent.agent_id,
    body.question, body.context || null, body.payload || null,
    body.category, minResponses, body.webhook_url || null
  ).run();

  return Response.json({
    job_id: id,
    status: 'pending',
    min_responses: minResponses
  }, {
    status: 201,
    headers: { 'X-RateLimit-Remaining': String(rateCheck.remaining) }
  });
}

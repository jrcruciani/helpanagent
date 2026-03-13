import { authenticateAgent } from '../../../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const jobId = params.job_id;

  const auth = await authenticateAgent(request, env);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const pulse = await env.DB.prepare(
    'SELECT * FROM pulses WHERE id = ? AND agent_id = ?'
  ).bind(jobId, auth.agent.agent_id).first();

  if (!pulse) {
    return Response.json({ error: 'Pulse not found' }, { status: 404 });
  }

  const responseCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM responses WHERE pulse_id = ?'
  ).bind(jobId).first();

  const result = {
    status: pulse.status,
    responses_received: responseCount?.count || 0,
    min_responses: pulse.min_responses
  };

  if (pulse.status === 'complete') {
    result.consensus = pulse.consensus;
    result.confidence = pulse.confidence;
    result.summary = pulse.summary;
    result.recommendation = pulse.recommendation;
    result.responses_used = pulse.responses_used;
    result.outliers_removed = pulse.outliers_removed;
  }

  return Response.json(result);
}

import { calculateMinReadingTime } from '../../../../lib/consensus.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const respondentToken = request.headers.get('X-Respondent-Token');
  if (!respondentToken) {
    return Response.json({ error: 'Missing X-Respondent-Token header' }, { status: 400 });
  }

  // Auto-register respondent on first request
  const existing = await env.DB.prepare(
    'SELECT token FROM respondents WHERE token = ?'
  ).bind(respondentToken).first();

  if (!existing) {
    await env.DB.prepare('INSERT INTO respondents (token) VALUES (?)').bind(respondentToken).run();
  }

  // Find a pending pulse this respondent hasn't answered
  const pulse = await env.DB.prepare(`
    SELECT p.id, p.question, p.context, p.category
    FROM pulses p
    WHERE p.status = 'pending'
      AND p.id NOT IN (SELECT r.pulse_id FROM responses r WHERE r.respondent_token = ?)
    ORDER BY p.created_at ASC
    LIMIT 1
  `).bind(respondentToken).first();

  if (pulse) {
    return Response.json({
      id: pulse.id,
      question: pulse.question,
      context: pulse.context,
      category: pulse.category,
      min_reading_time_ms: calculateMinReadingTime(pulse.question, pulse.context),
      is_calibration: false
    });
  }

  // No real pulses — try a calibration question
  const calibration = await env.DB.prepare(`
    SELECT cq.id, cq.question, cq.context, cq.category
    FROM calibration_questions cq
    WHERE cq.active = 1
      AND cq.id NOT IN (SELECT r.pulse_id FROM responses r WHERE r.respondent_token = ?)
    ORDER BY RANDOM()
    LIMIT 1
  `).bind(respondentToken).first();

  if (!calibration) {
    return Response.json({ error: 'No questions available' }, { status: 404 });
  }

  // Return calibration question indistinguishable from real ones
  return Response.json({
    id: calibration.id,
    question: calibration.question,
    context: calibration.context,
    category: calibration.category,
    min_reading_time_ms: calculateMinReadingTime(calibration.question, calibration.context),
    is_calibration: false  // always false to the client
  });
}

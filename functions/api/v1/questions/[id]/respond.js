import { validateResponseInput } from '../../../../../lib/validation.js';
import { computeConsensus, calculateMinReadingTime } from '../../../../../lib/consensus.js';

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const pulseId = params.id;

  const respondentToken = request.headers.get('X-Respondent-Token');
  if (!respondentToken) {
    return Response.json({ error: 'Missing X-Respondent-Token header' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const errors = validateResponseInput(body);
  if (errors.length > 0) {
    return Response.json({ errors }, { status: 400 });
  }

  // Determine if this is a calibration question or real pulse
  const calibration = await env.DB.prepare(
    'SELECT * FROM calibration_questions WHERE id = ?'
  ).bind(pulseId).first();

  const pulse = calibration ? null : await env.DB.prepare(
    'SELECT * FROM pulses WHERE id = ?'
  ).bind(pulseId).first();

  if (!pulse && !calibration) {
    return Response.json({ error: 'Question not found' }, { status: 404 });
  }

  // Prevent duplicate responses
  const duplicate = await env.DB.prepare(
    'SELECT id FROM responses WHERE pulse_id = ? AND respondent_token = ?'
  ).bind(pulseId, respondentToken).first();

  if (duplicate) {
    return Response.json({ error: 'Already responded to this question' }, { status: 409 });
  }

  // Flag suspicious fast responses
  const question = pulse?.question || calibration?.question;
  const ctx = pulse?.context || calibration?.context;
  const minTime = calculateMinReadingTime(question, ctx);
  const isSuspicious = (body.time_to_respond_ms && body.time_to_respond_ms < minTime) ? 1 : 0;

  // Store response
  const responseId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO responses (id, pulse_id, respondent_token, direction, certainty, time_to_respond_ms, is_suspicious)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    responseId, pulseId, respondentToken,
    body.direction, body.certainty,
    body.time_to_respond_ms || null, isSuspicious
  ).run();

  // Update respondent stats
  await env.DB.prepare(
    'UPDATE respondents SET total_responses = total_responses + 1 WHERE token = ?'
  ).bind(respondentToken).run();

  // Handle calibration scoring
  if (calibration) {
    const isCorrect = body.direction === calibration.correct_direction;
    const respondent = await env.DB.prepare(
      'SELECT * FROM respondents WHERE token = ?'
    ).bind(respondentToken).first();

    const calCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM responses WHERE respondent_token = ? AND pulse_id LIKE 'cal_%'"
    ).bind(respondentToken).first();

    const total = calCount?.count || 1;
    const oldAcc = respondent?.calibration_accuracy ?? 0.5;
    const newAcc = oldAcc + ((isCorrect ? 1 : 0) - oldAcc) / total;

    const delta = isCorrect ? 0.05 : -0.03;
    const newRep = Math.max(0.1, Math.min(2.0, (respondent?.reputation_score || 1.0) + delta));

    await env.DB.prepare(
      'UPDATE respondents SET calibration_accuracy = ?, reputation_score = ? WHERE token = ?'
    ).bind(newAcc, newRep, respondentToken).run();
  }

  // For real pulses: check if consensus should be computed
  if (pulse) {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM responses WHERE pulse_id = ?'
    ).bind(pulseId).first();

    if (countResult.count >= pulse.min_responses) {
      const allResponses = await env.DB.prepare(
        'SELECT * FROM responses WHERE pulse_id = ?'
      ).bind(pulseId).all();

      const tokens = [...new Set(allResponses.results.map(r => r.respondent_token))];
      const placeholders = tokens.map(() => '?').join(',');
      const respondents = await env.DB.prepare(
        `SELECT * FROM respondents WHERE token IN (${placeholders})`
      ).bind(...tokens).all();

      const result = computeConsensus(allResponses.results, respondents.results);

      if (result) {
        await env.DB.prepare(`
          UPDATE pulses SET
            status = 'complete',
            consensus = ?,
            confidence = ?,
            responses_used = ?,
            outliers_removed = ?,
            completed_at = datetime('now')
          WHERE id = ?
        `).bind(
          result.consensus, result.confidence,
          result.responses_used, result.outliers_removed, pulseId
        ).run();
      }
    }
  }

  // Return aggregate for this question
  const aggregate = await env.DB.prepare(
    'SELECT direction, COUNT(*) as count FROM responses WHERE pulse_id = ? GROUP BY direction'
  ).bind(pulseId).all();

  const distribution = { yes: 0, no: 0, depends: 0 };
  let total = 0;
  for (const row of aggregate.results) {
    distribution[row.direction] = row.count;
    total += row.count;
  }

  return Response.json({
    submitted: true,
    aggregate: { total_responses: total, distribution }
  });
}

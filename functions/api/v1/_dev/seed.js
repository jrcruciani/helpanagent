import { sha256 } from '../../../../lib/auth.js';

// Dev-only endpoint to seed test data
export async function onRequestPost(context) {
  const { env } = context;

  // Create test API key
  const testKey = 'hp_test_12345';
  const keyHash = await sha256(testKey);

  await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
    agent_id: 'test-agent-001',
    created_at: new Date().toISOString()
  }));

  // Create a sample pulse for the web UI to show
  const pulseId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO pulses (id, agent_id, question, context, category, min_responses)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    pulseId, 'test-agent-001',
    'Is it appropriate to send this email to someone who just lost a family member?',
    'The email is about renewing a professional contract. The tone is neutral and professional. The relationship is 2 years old. The loss happened 3 days ago.',
    'social', 3
  ).run();

  return Response.json({
    message: 'Dev seed complete',
    test_api_key: testKey,
    agent_id: 'test-agent-001',
    sample_pulse_id: pulseId
  });
}

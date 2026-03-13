export async function onRequestGet(context) {
  const { env } = context;

  const { results } = await env.DB.prepare(`
    SELECT id, question, category, consensus, confidence, responses_used, completed_at
    FROM pulses
    WHERE status = 'complete' AND consensus IS NOT NULL AND completed_at IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 20
  `).all();

  const feed = results.map(p => ({
    id: p.id,
    question: p.question.length > 120 ? p.question.slice(0, 117) + '...' : p.question,
    category: p.category,
    consensus: p.consensus,
    confidence: p.confidence,
    responses_used: p.responses_used,
    completed_at: p.completed_at
  }));

  return Response.json({ results: feed }, {
    headers: { 'Cache-Control': 'public, max-age=30' }
  });
}

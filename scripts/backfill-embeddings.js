#!/usr/bin/env node

/**
 * Backfill script: generates embeddings for all completed pulses and upserts into Vectorize.
 *
 * Usage (via wrangler):
 *   npx wrangler d1 execute helpanagent-db --command "SELECT id, question, context, category, consensus, confidence FROM pulses WHERE status = 'complete'" --json > /tmp/completed-pulses.json
 *
 * Then run this as a Worker script via wrangler dev or deploy as a one-off cron trigger.
 * Alternatively, call POST /api/v1/_dev/backfill in a dev environment.
 */

export async function backfillEmbeddings(env) {
  const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
  const BATCH_SIZE = 10;

  const { results: pulses } = await env.DB.prepare(`
    SELECT p.id, p.question, p.context, p.category, p.consensus, p.confidence
    FROM pulses p
    WHERE p.status = 'complete'
  `).all();

  if (!pulses.length) {
    return { indexed: 0, message: 'No completed pulses to index' };
  }

  let indexed = 0;
  const errors = [];

  for (let i = 0; i < pulses.length; i += BATCH_SIZE) {
    const batch = pulses.slice(i, i + BATCH_SIZE);

    // Generate embeddings for the batch
    const texts = batch.map(p => `${p.question || ''} ${p.context || ''}`.trim());

    let embeddings;
    try {
      const result = await env.AI.run(EMBEDDING_MODEL, { text: texts });
      embeddings = result?.data;
    } catch (err) {
      errors.push({ batch: i, error: err.message });
      continue;
    }

    if (!embeddings || embeddings.length !== batch.length) {
      errors.push({ batch: i, error: 'Embedding count mismatch' });
      continue;
    }

    // Fetch direction mass for each pulse from responses
    const vectors = [];
    for (let j = 0; j < batch.length; j++) {
      const pulse = batch[j];
      const aggregate = await env.DB.prepare(
        'SELECT direction, COUNT(*) as count FROM responses WHERE pulse_id = ? GROUP BY direction'
      ).bind(pulse.id).all();

      const mass = { yes: 0, no: 0, depends: 0 };
      let total = 0;
      for (const row of aggregate.results) {
        mass[row.direction] = row.count;
        total += row.count;
      }
      if (total > 0) {
        mass.yes /= total;
        mass.no /= total;
        mass.depends /= total;
      }

      vectors.push({
        id: pulse.id,
        values: embeddings[j],
        metadata: {
          consensus: pulse.consensus,
          confidence: pulse.confidence,
          category: pulse.category,
          mass_yes: mass.yes,
          mass_no: mass.no,
          mass_depends: mass.depends,
          question_preview: (pulse.question || '').slice(0, 200)
        }
      });
    }

    try {
      await env.VECTORIZE.upsert(vectors);
      indexed += vectors.length;
    } catch (err) {
      errors.push({ batch: i, error: err.message });
    }
  }

  return {
    total: pulses.length,
    indexed,
    errors: errors.length > 0 ? errors : undefined,
    message: `Indexed ${indexed}/${pulses.length} pulses`
  };
}

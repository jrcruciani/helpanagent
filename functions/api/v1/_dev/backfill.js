import { backfillEmbeddings } from '../../../../scripts/backfill-embeddings.js';

// Dev-only endpoint to backfill Vectorize with existing completed pulses
export async function onRequestPost(context) {
  const { env } = context;

  if (!env.VECTORIZE || !env.AI) {
    return Response.json({ error: 'VECTORIZE and AI bindings required' }, { status: 500 });
  }

  const result = await backfillEmbeddings(env);
  return Response.json(result);
}

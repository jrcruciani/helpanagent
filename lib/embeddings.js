const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
const MIN_CALIBRATION_FOR_REPUTATION = 3;
const DEFAULT_TOP_K = 5;
const CONSENSUS_THRESHOLD = 0.60;

export { MIN_CALIBRATION_FOR_REPUTATION };

export async function embedQuestion(ai, question, context) {
  const text = `${question || ''} ${context || ''}`.trim();
  if (!text) return null;

  const result = await ai.run(EMBEDDING_MODEL, { text: [text] });
  if (!result?.data?.[0]) return null;
  return result.data[0];
}

export async function indexCompletedPulse(vectorize, ai, pulse, directionMass) {
  const embedding = await embedQuestion(ai, pulse.question, pulse.context);
  if (!embedding) return;

  await vectorize.upsert([{
    id: pulse.id,
    values: embedding,
    metadata: {
      consensus: pulse.consensus,
      confidence: pulse.confidence,
      category: pulse.category,
      mass_yes: directionMass?.yes ?? 0,
      mass_no: directionMass?.no ?? 0,
      mass_depends: directionMass?.depends ?? 0,
      question_preview: (pulse.question || '').slice(0, 200)
    }
  }]);
}

export async function predictFromSimilar(vectorize, ai, question, context, topK = DEFAULT_TOP_K) {
  const embedding = await embedQuestion(ai, question, context);
  if (!embedding) return null;

  const results = await vectorize.query(embedding, {
    topK,
    returnMetadata: 'all'
  });

  if (!results?.matches?.length) return null;

  // Filter to reasonably similar results (score > 0.5)
  const relevant = results.matches.filter(m => m.score > 0.5);
  if (relevant.length === 0) return null;

  // Weighted aggregation of direction probabilities by similarity score
  let totalWeight = 0;
  const weightedMass = { yes: 0, no: 0, depends: 0 };

  for (const match of relevant) {
    const w = match.score;
    totalWeight += w;
    weightedMass.yes += (match.metadata?.mass_yes ?? 0) * w;
    weightedMass.no += (match.metadata?.mass_no ?? 0) * w;
    weightedMass.depends += (match.metadata?.mass_depends ?? 0) * w;
  }

  if (totalWeight === 0) return null;

  const probabilities = {
    yes: Math.round((weightedMass.yes / totalWeight) * 100) / 100,
    no: Math.round((weightedMass.no / totalWeight) * 100) / 100,
    depends: Math.round((weightedMass.depends / totalWeight) * 100) / 100
  };

  const top = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
  const predictedConsensus = top[1] > CONSENSUS_THRESHOLD ? top[0] : 'depends';

  return {
    similar_questions_found: relevant.length,
    predicted_consensus: predictedConsensus,
    predicted_confidence: top[1],
    direction_probabilities: probabilities
  };
}

const INDIVIDUAL_CAP = 0.25;
const CONSENSUS_THRESHOLD = 0.60;
const TRIM_PERCENT = 0.20;

export function computeConsensus(responses, respondents) {
  if (responses.length === 0) return null;

  const reputationMap = {};
  for (const r of respondents) {
    reputationMap[r.token] = r.reputation_score;
  }

  const maxReputation = Math.max(...responses.map(r => reputationMap[r.respondent_token] || 1.0));

  let weighted = responses.map(r => {
    const reputation = (reputationMap[r.respondent_token] || 1.0) / maxReputation;
    return { ...r, weight: r.certainty * reputation };
  });

  // Outlier detection: >2σ in certainty AND different from majority direction
  const certainties = weighted.map(w => w.certainty);
  const mean = certainties.reduce((a, b) => a + b, 0) / certainties.length;
  const stdDev = Math.sqrt(
    certainties.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / certainties.length
  );

  const directionCounts = {};
  weighted.forEach(w => { directionCounts[w.direction] = (directionCounts[w.direction] || 0) + 1; });
  const majorityDirection = Object.entries(directionCounts).sort((a, b) => b[1] - a[1])[0][0];

  const outlierIndices = new Set();
  if (stdDev > 0) {
    weighted.forEach((w, i) => {
      if (Math.abs(w.certainty - mean) > 2 * stdDev && w.direction !== majorityDirection) {
        outlierIndices.add(i);
      }
    });
  }

  // Trimmed mean: discard top/bottom 20% by weight
  const sorted = weighted.map((w, i) => ({ w, i })).sort((a, b) => a.w.weight - b.w.weight);
  const trimCount = Math.floor(sorted.length * TRIM_PERCENT);
  const trimmedIndices = new Set();
  for (let i = 0; i < trimCount; i++) {
    trimmedIndices.add(sorted[i].i);
    trimmedIndices.add(sorted[sorted.length - 1 - i].i);
  }

  const removedIndices = new Set([...outlierIndices, ...trimmedIndices]);
  let kept = weighted.filter((_, i) => !removedIndices.has(i));

  if (kept.length === 0) {
    kept = weighted.filter((_, i) => !outlierIndices.has(i));
    if (kept.length === 0) return null;
  }

  return aggregate(kept, removedIndices.size);
}

function aggregate(kept, outliersRemoved) {
  const totalWeight = kept.reduce((sum, r) => sum + r.weight, 0);

  const capped = kept.map(r => ({
    ...r,
    cappedWeight: Math.min(r.weight, totalWeight * INDIVIDUAL_CAP)
  }));

  const cappedTotal = capped.reduce((sum, r) => sum + r.cappedWeight, 0);

  const mass = { yes: 0, no: 0, depends: 0 };
  for (const r of capped) {
    mass[r.direction] += r.cappedWeight / cappedTotal;
  }

  const top = Object.entries(mass).sort((a, b) => b[1] - a[1])[0];
  const consensus = top[1] > CONSENSUS_THRESHOLD ? top[0] : 'depends';
  const confidence = Math.round(top[1] * 100) / 100;

  return {
    consensus,
    confidence,
    responses_used: kept.length,
    outliers_removed: outliersRemoved,
    direction_mass: mass
  };
}

// Min reading time in ms (avg 200 words/min, floor 3s)
export function calculateMinReadingTime(question, context) {
  const text = `${question || ''} ${context || ''}`;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(Math.ceil((words / 200) * 60 * 1000), 3000);
}

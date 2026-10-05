/** Shared calculations for diagnostic scorers with identical response rules. */
export function scoreResponse(response: string, criteria: { required: RegExp[]; bonus: RegExp[] }): number {
  if (!response || response.trim().length < 20) return 0;

  let score = 0;
  const requiredWeight = 0.7 / Math.max(criteria.required.length, 1);
  const bonusWeight = 0.3 / Math.max(criteria.bonus.length, 1);

  for (const re of criteria.required) {
    if (re.test(response)) score += requiredWeight;
  }
  for (const re of criteria.bonus) {
    if (re.test(response)) score += bonusWeight;
  }

  const evidenceMatches = response.match(/\[ev:[^\]]+\]/g);
  if (evidenceMatches && evidenceMatches.length >= 2) score += 0.1;

  if (response.length > 200 && /\n/.test(response)) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

export function scoreToLevel(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score >= 10) return 1;
  return 0;
}

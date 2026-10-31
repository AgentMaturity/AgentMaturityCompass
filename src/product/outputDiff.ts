/**
 * Compare two agent output strings.
 */

export interface DiffResult {
  similarity: number;
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffOutputs(a: string, b: string): DiffResult {
  const aLines = a.split('\n').filter(l => l.trim());
  const bLines = b.split('\n').filter(l => l.trim());
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);

  const added: string[] = bLines.filter(l => !aSet.has(l));
  const removed: string[] = aLines.filter(l => !bSet.has(l));

  // Find changed lines (similar but not identical using simple Levenshtein-like comparison)
  const changed: string[] = [];
  for (const r of removed) {
    for (const ad of added) {
      if (r.length > 0 && ad.length > 0) {
        const shorter = Math.min(r.length, ad.length);
        const longer = Math.max(r.length, ad.length);
        let common = 0;
        for (let i = 0; i < shorter; i++) {
          if (r[i] === ad[i]) common++;
        }
        if (common / longer > 0.5) {
          changed.push(`"${r.slice(0, 60)}" → "${ad.slice(0, 60)}"`);
        }
      }
    }
  }

  // Compute similarity using Jaccard-like metric on words
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  let intersection = 0;
  for (const w of aWords) { if (bWords.has(w)) intersection++; }
  const union = new Set([...aWords, ...bWords]).size;
  // Identical empty token sets have similarity 1; this is set equality, not evaluated evidence coverage.
  const similarity = union === 0 ? 1 : intersection / union;

  return { similarity: Math.round(similarity * 1000) / 1000, added, removed, changed };
}

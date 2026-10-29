/**
 * conversationSummarizer.ts — Multi-strategy conversation summarization.
 *
 * Strategies:
 *  - extractive  — TF-IDF weighted sentence selection
 *  - sliding     — Rolling window with recency bias
 *  - topicChange — Detect topic boundaries and summarize segments
 */

export interface SummaryResult {
  summary: string;
  turnCount: number;
  strategy: 'extractive' | 'sliding' | 'topicChange';
  topicSegments?: string[];
}

export type SummaryStrategy = 'extractive' | 'sliding' | 'topicChange';

/* ── TF-IDF helpers ──────────────────────────────────────────────── */

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

function tfIdf(docs: string[]): Map<number, number> {
  const allTokens = docs.map(tokenize);
  const df = new Map<string, number>();
  for (const tokens of allTokens) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const scores = new Map<number, number>();
  const N = docs.length;
  for (let i = 0; i < docs.length; i++) {
    const tokens = allTokens[i]!;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const [t, count] of tf) {
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 1)));
      score += (count / Math.max(tokens.length, 1)) * idf;
    }
    scores.set(i, score);
  }
  return scores;
}

/* ── Extractive strategy ─────────────────────────────────────────── */

function extractiveSummary(messages: Array<{ role: string; content: string }>, maxSentences = 5): string {
  const docs = messages.map(m => m.content);
  const scores = tfIdf(docs);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topIdx = ranked.slice(0, maxSentences).map(([i]) => i).sort((a, b) => a - b);
  return topIdx.map(i => `${messages[i]!.role}: ${messages[i]!.content}`).join('\n');
}

/* ── Sliding window strategy ─────────────────────────────────────── */

function slidingSummary(messages: Array<{ role: string; content: string }>, windowSize = 6): string {
  if (messages.length <= windowSize) {
    return messages.map(m => `${m.role}: ${m.content.slice(0, 80)}`).join('\n');
  }
  const earlyPick = Math.max(1, Math.floor(windowSize * 0.3));
  const latePick = windowSize - earlyPick;
  const early = messages.slice(0, earlyPick);
  const late = messages.slice(-latePick);
  return [
    ...early.map(m => `${m.role}: ${m.content.slice(0, 80)}`),
    `... (${messages.length - windowSize} turns omitted) ...`,
    ...late.map(m => `${m.role}: ${m.content.slice(0, 80)}`),
  ].join('\n');
}

/* ── Topic-change detection ──────────────────────────────────────── */

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  // Identical empty token sets have similarity 1; this is set equality, not evaluated evidence coverage.
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union; // The empty-union identity was handled above.
}

function topicChangeSummary(messages: Array<{ role: string; content: string }>, threshold = 0.15): { summary: string; segments: string[] } {
  if (messages.length === 0) return { summary: '', segments: [] };

  const segments: Array<Array<{ role: string; content: string }>> = [[messages[0]!]];
  for (let i = 1; i < messages.length; i++) {
    const sim = jaccardSimilarity(messages[i - 1]!.content, messages[i]!.content);
    if (sim < threshold) {
      segments.push([messages[i]!]);
    } else {
      segments[segments.length - 1]!.push(messages[i]!);
    }
  }

  const segSummaries = segments.map((seg, idx) => {
    const rep = seg[0]!;
    return `[Topic ${idx + 1}] ${rep.role}: ${rep.content.slice(0, 100)}${seg.length > 1 ? ` (+${seg.length - 1} turns)` : ''}`;
  });

  return { summary: segSummaries.join('\n'), segments: segSummaries };
}

/* ── Public API ───────────────────────────────────────────────────── */

export function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  strategy?: SummaryStrategy,
): SummaryResult {
  if (messages.length === 0) return { summary: '', turnCount: 0, strategy: strategy ?? 'extractive' };

  const strat = strategy ?? (messages.length > 20 ? 'topicChange' : messages.length > 10 ? 'sliding' : 'extractive');

  switch (strat) {
    case 'extractive':
      return { summary: extractiveSummary(messages), turnCount: messages.length, strategy: 'extractive' };
    case 'sliding':
      return { summary: slidingSummary(messages), turnCount: messages.length, strategy: 'sliding' };
    case 'topicChange': {
      const { summary, segments } = topicChangeSummary(messages);
      return { summary, turnCount: messages.length, strategy: 'topicChange', topicSegments: segments };
    }
  }
}

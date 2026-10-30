/** Terms that tell a solver it is being measured (upstream BenchPrompts rejects them in agent-facing task text). */
const MEASUREMENT_TERMS = /\b(grad(?:e|ed|er|ers|ing)|rubrics?|scor(?:e|ed|es|ing)|benchmark(?:s|ed|ing)?|evaluat(?:e|ed|es|ing|ion|ions|or|ors)|judg(?:e|ed|es|ing)|oracles?|held[- ]?out|holdout)\b/gi;

/** Warning-level lint: one message per text naming the measurement terms it contains; never a refusal. */
export function measurementLanguageWarnings(label: string, text: string): string[] {
  const terms = [...new Set([...text.matchAll(MEASUREMENT_TERMS)].map((match) => match[0]!.toLowerCase()))].sort();
  return terms.length === 0 ? [] : [`${label}: agent-facing text uses measurement language (${terms.join(", ")}); the solver may learn it is being evaluated.`];
}

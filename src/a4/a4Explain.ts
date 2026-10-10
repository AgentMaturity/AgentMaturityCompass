/**
 * Explain at the user's level (P1-59; design §9.4), shared by every stage. Each fact is stored once with its sources and
 * three renderings; the level only picks one, so the facts behind "show me more" and "show me less" are identical. A
 * regulatory statement carries its data status as the register, catalog or clock table gives it. Nothing here names a
 * maturity level: a level is computed only by a scoring run, never by an explanation.
 */
export const A4_EXPLAIN_LEVELS = ["novice", "practitioner", "expert"] as const;
export type A4ExplainLevel = (typeof A4_EXPLAIN_LEVELS)[number];

export interface A4ExplainFact {
  readonly id: string;
  /** Where the fact comes from: answer ids, files, functions. */
  readonly sources: readonly string[];
  readonly dataStatus: "verified" | "unverified" | "experimental" | "pending" | null;
  /** Plain words, file and digest names, symbols. */
  readonly novice: string;
  readonly practitioner: string;
  readonly expert: string;
}

/** The facts rendered at `level`, in order, each with its sources and data status. */
export function explain(facts: readonly A4ExplainFact[], level: A4ExplainLevel): Array<{ id: string; text: string; sources: string[]; dataStatus: A4ExplainFact["dataStatus"] }> {
  return facts.map((fact) => ({ id: fact.id, text: fact[level], sources: [...fact.sources], dataStatus: fact.dataStatus }));
}

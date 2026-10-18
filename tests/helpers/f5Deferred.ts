import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0-26/P1-42: F5's proposed drops that Sid has not confirmed (decision keep or defer) stay in their packs with
 * main's text. The candidate's round-2 tests assumed all 30 were gone and that every question met the round-2
 * content rules; until Sid decides, those rules skip these questions (tests/f5DropReconciliation.test.ts pins them).
 */
const decisions = JSON.parse(readFileSync(join(process.cwd(), "docs", "program", "f5", "decisions.json"), "utf8")) as {
  items: Array<{ id: string; decision: string }>;
};
export const F5_KEPT_IDS: ReadonlySet<string> = new Set(decisions.items.filter((d) => d.decision !== "drop").map((d) => d.id));

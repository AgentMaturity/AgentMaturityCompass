import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0-26/P1-42: questions round 2 removed but Sid has not confirmed removing stay in their packs with main's text:
 * F5's proposed drops (decision keep or defer) and round 2's proposed merges with no reviewed decision (P1-42
 * review). The candidate's round-2 tests assumed both were gone and that every question met the round-2 content
 * rules; until Sid decides, those rules skip these questions. tests/f5DropReconciliation.test.ts and
 * tests/roundTwoMergeDecisions.test.ts pin their text.
 */
const readDecisions = (...parts: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8")) as {
  items: Array<{ id: string; decision: string }>;
};
export const F5_KEPT_IDS: ReadonlySet<string> = new Set(
  readDecisions("docs", "program", "f5", "decisions.json").items.filter((d) => d.decision !== "drop").map((d) => d.id));
const ROUND2_MERGE_KEPT_IDS = readDecisions("docs", "program", "round2", "merge-decisions.json").items
  .filter((d) => d.decision !== "merge").map((d) => d.id);
/** Every question kept on main until Sid decides. */
export const PENDING_SID_IDS: ReadonlySet<string> = new Set([...F5_KEPT_IDS, ...ROUND2_MERGE_KEPT_IDS]);

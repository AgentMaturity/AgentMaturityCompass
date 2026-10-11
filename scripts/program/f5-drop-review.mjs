#!/usr/bin/env node
/**
 * P0-26: writes the review packet for F5's 30 drop recommendations,
 * docs/program/f5-drop-review.md, from docs/program/f5/drops.json (F5, its
 * meta-review and the agent's draft recommendation), docs/program/f5/decisions.json
 * (Sid's decisions) and the built registry. It reads; it never edits pack content.
 *
 * Usage: pnpm run build && node scripts/program/f5-drop-review.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const OUT = "docs/program/f5-drop-review.md";
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const dist = (path) => pathToFileURL(join(root, "dist", path)).href;
const { listIndustryPacks } = await import(dist("domains/industryPacks.js"));
const { PACK_QUESTION_FLOOR, resolveRegulatoryRefParts } = await import(dist("domains/packs/regulatorySchema.js"));

const drops = readJson("docs/program/f5/drops.json");
const decisions = readJson("docs/program/f5/decisions.json");
const decisionOf = new Map(decisions.items.map((item) => [item.id, item]));
const packs = new Map(listIndustryPacks().map((pack) => [pack.id, pack]));
const SELF = [":!src/domains/industryPacks.ts", ":!docs/program/f5", `:!${OUT}`, ":!qualification/*-P0-26", ":!tests/f5DropDecisions.test.ts"];

const short = (sha) => sha.slice(0, 8);
const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
const pct = (part, whole) => `${((100 * part) / whole).toFixed(1)}%`;
const sumWeights = (questions) => questions.reduce((sum, q) => sum + q.weight, 0);

/** The live question, and its pack's count before and after F5's drops in that pack. */
function locate(item) {
  const pack = packs.get(item.packId);
  const question = pack?.questions.find((q) => q.id === item.id);
  const f5InPack = drops.items.filter((d) => d.packId === item.packId).map((d) => d.id);
  const count = pack?.questions.length ?? 0;
  return { pack, question, count, afterAll: count - pack.questions.filter((q) => f5InPack.includes(q.id)).length };
}

/** Tracked files, other than the definition and this packet, that name the id. */
function references(id) {
  const grep = spawnSync("git", ["grep", "-l", "-w", "-F", id, "--", ".", ...SELF], { cwd: root, encoding: "utf8" });
  // git grep exits 1 when nothing matches; anything else is a failure, never "no references".
  if (grep.status === 1 && !grep.stderr) return [];
  if (grep.status !== 0) throw new Error(`git grep ${id} failed: ${grep.error?.message ?? grep.stderr}`);
  return grep.stdout.trim().split("\n");
}

/**
 * Station tags (src/compliance/stationTags.ts) an instrument would lose if the
 * questions were removed. The real index is rebuilt over a registry without
 * them: the registry objects are edited in this process only and restored.
 */
let tagImports = 0;
async function lostStationTags(ids) {
  const instruments = new Set(drops.items.filter((d) => ids.includes(d.id)).flatMap((d) =>
    resolveRegulatoryRefParts(locate(d).question?.regulatoryRef ?? "").map((p) => p.instrument?.id).filter(Boolean)));
  const tags = async () => {
    const { stationsForInstrument } = await import(`${dist("compliance/stationTags.js")}?n=${tagImports++}`);
    return new Map([...instruments].map((id) => [id, stationsForInstrument(id)]));
  };
  const before = await tags();
  const saved = [...packs.values()].map((pack) => [pack, pack.questions]);
  for (const [pack, questions] of saved) pack.questions = questions.filter((q) => !ids.includes(q.id));
  try {
    const after = await tags();
    return [...before].flatMap(([id, stations]) => stations.filter((s) => !after.get(id).includes(s)).map((s) => `${id} loses ${s}`));
  } finally {
    for (const [pack, questions] of saved) pack.questions = questions;
  }
}

function refParts(ref) {
  return resolveRegulatoryRefParts(ref)
    .map(({ part, instrument }) => `"${part}" → ${instrument ? `\`${instrument.id}\` (${instrument.status})` : "not in the catalogue"}`)
    .join("; ");
}

function grouped(paths) {
  const kinds = [["tests", (p) => p.startsWith("tests/")], ["receipts", (p) => p.startsWith("qualification/")],
    ["council records", (p) => p.startsWith("docs/council/")], ["other", () => true]];
  const seen = new Set();
  const parts = kinds.map(([label, match]) => {
    const hit = paths.filter((p) => !seen.has(p) && match(p));
    hit.forEach((p) => seen.add(p));
    return hit.length ? `${label}: ${hit.map((p) => `\`${p}\``).join(", ")}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join("; ") : "none outside the pack definition";
}

const count = (values) => Object.entries(Object.groupBy(values, (v) => v)).map(([k, v]) => `${k} ${v.length}`).join(", ");
const rows = drops.items.map((item) => ({ item, ...locate(item), decision: decisionOf.get(item.id) }));
const missing = rows.filter((r) => !r.question);
const belowFloorPacks = [...new Set(rows.filter((r) => r.afterAll < PACK_QUESTION_FLOOR).map((r) => r.item.packId))];
const recDrops = rows.filter((r) => r.item.agentRecommendation.recommendation === "drop");
const recAfter = new Map([...new Set(recDrops.map((r) => r.item.packId))].map((id) =>
  [id, packs.get(id).questions.length - recDrops.filter((r) => r.item.packId === id && r.question).length]));
const recBelow = [...recAfter].filter(([, n]) => n < PACK_QUESTION_FLOOR);
const floorSafe = rows.filter((r) => r.question && r.count - 1 >= PACK_QUESTION_FLOOR).map((r) => r.item.id);
const lostAll = await lostStationTags(rows.map((r) => r.item.id));

const md = [];
const push = (...lines) => md.push(...lines);
push("# F5 drop review packet (P0-26)", "",
  `Generated by \`node scripts/program/f5-drop-review.mjs\` from \`docs/program/f5/drops.json\`, \`docs/program/f5/decisions.json\` and the built registry. Do not edit by hand; edit the JSON and re-run.`, "",
  decisions.reviewedBy
    ? `**Reviewed by ${decisions.reviewedBy} on ${decisions.reviewedAt}; floor policy: ${decisions.floorPolicy}.**`
    : "**Status: no decision recorded. Every item is \"deferred: awaiting Sid\" and no question has been dropped.**", "",
  "F5 (an AI editorial review of the station packs at `8f57ce63`) and its meta-review are AI reviews, and the \"Agent rec.\" column is an AI draft written by the P0-26 agent. None of them is a decision, and none has been reviewed by a qualified expert (truth rule 8). Only Sid's entry in `decisions.json` decides.", "",
  "## How to decide (about 45 minutes)", "",
  "1. Decide the floor policy (next section).",
  "2. Read the table, then the detail of any row you want to check. The rows the meta-review did not sample deserve the closer look.",
  "3. In `docs/program/f5/decisions.json` set each item's `decision` to `keep`, `drop` or `defer` with a `note`, and set `reviewedBy`, `reviewedAt` and `floorPolicy`. `defer` keeps the question on main, exactly like `keep`.",
  "4. Re-run this script, copy `decisions.json` into a new `qualification/<date>-P0-26/`, then apply the confirmed drops (spec steps 6 and 7). `tests/f5DropDecisions.test.ts` fails until the registry matches the decisions.", "",
  "## Floor policy (decide first)", "",
  `- Today \`PACK_QUESTION_FLOOR = ${PACK_QUESTION_FLOOR}\` (\`src/domains/packs/regulatorySchema.ts\`): \`validatePackRegulatoryCurrency\` reports an error for a smaller pack, \`tests/industryPackDepthFloor.test.ts\` and \`tests/publicQuestionCountDrift.test.ts\` pin it, and \`docs/DOMAIN_PACKS.md\` says no pack may fall below it.`,
  `- All 30 F5 drops would leave ${belowFloorPacks.length} packs below the floor: ${belowFloorPacks.map((p) => `\`${p}\``).join(", ")}.`,
  `- **\`retire-floor\` (proposed by the agent):** turn the floor error into a reported metric and update the two tests and \`docs/DOMAIN_PACKS.md\`, citing design rule 8 ("quality over count"). The floor is the median measured on 2026-10-03, a count target; keeping questions the review finds weak only to meet it is what rule 8 rules out. Under the agent's recommendations ${recDrops.length} questions would go and ${recBelow.length} packs would sit below ${PACK_QUESTION_FLOOR} (lowest ${Math.min(...recAfter.values())}).`,
  `- **\`defer-below-floor-drops\`:** keep the floor and apply only drops that leave a pack at ${PACK_QUESTION_FLOOR} or more: today ${floorSafe.length ? floorSafe.join(" and ") : "none"}. Every other confirmed drop becomes \`defer\` until replacement questions land, which the freeze forbids before Gate G0.`,
  `- Proposed in \`decisions.json\`: \`${decisions.proposedFloorPolicy}\`. Nothing is changed until Sid sets \`floorPolicy\`.`, "",
  "## Summary", "",
  `F5: ${count(rows.map((r) => r.item.f5.verdict))}. Meta-review: ${rows.filter((r) => r.item.metaReview).length} sampled, ${rows.filter((r) => r.item.metaReview?.agree).length} agreed. Agent rec.: ${count(rows.map((r) => r.item.agentRecommendation.recommendation))}. Decisions: ${count(rows.map((r) => r.decision?.decision ?? "missing"))}.`, "",
  `"After" is the pack's question count with all F5 drops in that pack removed; ⚠ marks a count below ${PACK_QUESTION_FLOOR}. "Share" is the question's weight as a share of its pack's total weight.`, "",
  "| # | ID | Pack | Wt (share) | F5 reason | Meta-review | Now → after | Agent rec. | Decision |",
  "|---|---|---|---|---|---|---|---|---|");
rows.forEach(({ item, question, pack, count: now, afterAll, decision }, i) => push(
  `| ${i + 1} | [${item.id}](#${item.id.toLowerCase()}) | ${item.packId} | ${item.weight} (${question ? pct(question.weight, sumWeights(pack.questions)) : "–"}) | ${cell(item.f5.issues.join("; "))} | ${item.metaReview ? (item.metaReview.agree ? "agreed" : "disagreed") : "not sampled"} | ${now} → ${afterAll}${afterAll < PACK_QUESTION_FLOOR ? " ⚠" : ""} | **${item.agentRecommendation.recommendation}**: ${cell(item.agentRecommendation.rationale)} | ${decision ? `${decision.decision} (${cell(decision.note)})` : "missing"} |`));
if (missing.length) push("", `**Not in the registry:** ${missing.map((r) => r.item.id).join(", ")}.`);
push("", "## What a drop changes", "",
  "- **Scores.** The question's weight leaves its pack's weighted total, so every later self-assessment of the pack is normalised over the remaining questions and is not comparable with earlier results. All scoring surfaces read the same registry (`listIndustryPacks`): the `amc domain` pack commands, the MCP server, Studio and the dashboard.",
  "- **Conformance.** The requirement `industry-pack:<packId>:<questionId>` disappears from conformance runs (`docs/CONFORMANCE_RUNS.md`).",
  "- **Paid packs.** All 41 sector packs sit behind the ADR-005 entitlement; the catalogue's `questionCount` for the pack falls.",
  "- **Counts.** `stationPackQuestions` in `scripts/freeze-baseline.json` and the station totals in `docs/DOMAIN_PACKS.md` fall; regenerate them and name `freeze-exception: P0-26` in the changeset.",
  `- **Station tags** (\`src/compliance/stationTags.ts\`): with all 30 dropped, ${lostAll.length ? lostAll.join("; ") : "no catalogue instrument loses a station tag"}. Per-item results are in the detail.`,
  "- **Candidate.** `37c1466b` already removed all 30 (commit per item below). Its content lands with P1-42, which must restore every `keep` and `defer`.", "",
  "## Hand-off to P1-42", "",
  `- Read \`decisions.json\` from the latest \`qualification/<date>-P0-26/\`. Today every item is \`defer\`: keep all 30 on main and restore each one the candidate's apply commits removed (with any P0-24 correction). Deferred ids: ${rows.filter((r) => r.decision?.decision === "defer").map((r) => r.item.id).join(", ") || "none"}. Kept ids: ${rows.filter((r) => r.decision?.decision === "keep").map((r) => r.item.id).join(", ") || "none"}.`,
  "- Only an item whose decision is `drop`, under a review that names Sid, may stay removed. `tests/f5DropDecisions.test.ts` fails if any other item is missing from its pack.", "",
  "## Detail");
let station = "";
for (const { item, question, count: now, afterAll, decision } of rows) {
  if (item.station !== station) push("", `### ${(station = item.station)[0].toUpperCase()}${station.slice(1)}`);
  const lost = question ? await lostStationTags([item.id]) : [];
  push("", `#### ${item.id}`, "",
    `\`${item.packId}\` · ${item.dimension} · weight ${item.weight}`, "");
  if (question) {
    push(`- **Question:** ${question.text}`, `- **L1:** ${question.l1}`, `- **L3:** ${question.l3}`, `- **L5:** ${question.l5}`,
      `- **regulatoryRef:** ${question.regulatoryRef} (${refParts(question.regulatoryRef)})`);
    if (question.regulatoryRef !== item.f5.regulatoryRef) push(`- **regulatoryRef F5 reviewed at \`8f57ce63\`:** ${item.f5.regulatoryRef}`);
  } else push("- **Not in the registry.**");
  push(`- **F5 (drop), verbatim:** ${item.f5.issues.map((s) => `"${s}"`).join("; ")}`,
    `- **Meta-review:** ${item.metaReview ? `${item.metaReview.agree ? "agreed" : "disagreed"} (${item.metaReview.verdict}): "${item.metaReview.note}"` : "not sampled"}`,
    `- **Pack count:** ${now} now; ${now - 1} if only this drops; ${afterAll} with all F5 drops in the pack${afterAll < PACK_QUESTION_FLOOR ? ` (below the floor of ${PACK_QUESTION_FLOOR})` : ""}`,
    `- **Score share:** ${question ? `${question.weight} of ${sumWeights(packs.get(item.packId).questions)} (${pct(question.weight, sumWeights(packs.get(item.packId).questions))})` : "–"}`,
    `- **Station tags lost if only this drops:** ${lost.length ? lost.join("; ") : "none"}`,
    `- **Referenced by:** ${grouped(references(item.id))}`,
    `- **Candidate:** removed by \`${short(item.candidateRemovedBy)}\``,
    `- **AI recommendation (F5):** ${item.f5.verdict}`,
    `- **Agent recommendation (AI draft):** **${item.agentRecommendation.recommendation}**. ${item.agentRecommendation.rationale}`,
    `- **Decision (keep, drop, defer):** ${decision?.decision ?? "missing"}`,
    `- **Note:** ${decision?.note ?? ""}`);
}
writeFileSync(join(root, OUT), `${md.join("\n")}\n`);
console.log(`wrote ${OUT}: ${rows.length} items, ${missing.length} missing from the registry`);

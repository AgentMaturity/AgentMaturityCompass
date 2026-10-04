// Rewrites the register table in docs/COMPLIANCE_FRAMEWORKS.md from register.json. Scratch tool.
import { readFileSync, writeFileSync } from "node:fs";

const WT = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-10";
const DOC = `${WT}/docs/COMPLIANCE_FRAMEWORKS.md`;
const reg = JSON.parse(readFileSync(`${WT}/src/compliance/regulatory/register.json`, "utf8"));
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const dates = (e) => e.keyDates.map((k) => `${k.date}${k.observation ? " (observation)" : k.verified ? "" : " (unverified)"}`).join(", ");
const row = (e) => {
  const s = e.sources.find((x) => x.fetched) ?? e.sources[0];
  return `| ${cell(e.instrument)} — ${cell(e.citation)} | ${cell(e.jurisdiction)} | ${e.taskStatus === "withdrawn" ? "superseded (withdrawn)" : e.status} | ${dates(e)} | [${cell(s.publisher)}](${s.url}) | ${s.retrievedAt.slice(0, 10)} | ${e.verified ? "yes" : "no"} |`;
};
const n = reg.entries.length;
const v = reg.entries.filter((e) => e.verified).length;
const byJ = {};
for (const e of reg.entries) {
  byJ[e.jurisdiction] ??= [0, 0];
  byJ[e.jurisdiction][0] += 1;
  if (e.verified) byJ[e.jurisdiction][1] += 1;
}
const header = `Register as applied on 2026-10-04 from the round-2 EU/international and US batches (\`lastReviewed\` 2026-10-03 on every entry): ${n} entries, ${v} verified, ${n - v} unverified, ${Object.keys(byJ).length} jurisdictions. Counts are from \`node scripts/check-regulatory-currency.mjs\` on 2026-10-04.`;
const jTable = ["| Jurisdiction | Entries | Verified |", "|---|---|---|", ...Object.entries(byJ).sort((a, b) => b[1][0] - a[1][0]).map(([j, [t, ok]]) => `| ${j} | ${t} | ${ok} |`)];
const table = ["| Instrument | Jurisdiction | Status | Key dates | Primary source | Retrieved | Verified |", "|---|---|---|---|---|---|---|", ...reg.entries.map(row)];
const unverifiedPara = "Why an entry is unverified is recorded in the entry itself: `openQuestions`, and each `keyDate` or obligation with `verified: false` (with a `note` or `basis` where the batch gave one). The main groups: ISO standards (iso.org answers this harness with HTTP 403, so editions and dates come from a dated receipt or are unconfirmed); China and Japan entries, which the program's root ruling allows only as unverified with no obligation asserted; guidance, soft-law and proposal texts not read in the review; conflicts between official sources that were not resolved; and US state statutes whose official sites refused the connection (Illinois, Utah, New York State Education Department, Ohio).";

const lines = readFileSync(DOC, "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("Register as reviewed on 2026-10-03"));
const end = lines.findIndex((l, i) => i > start && l.startsWith("Unverified entries and why:"));
if (start < 0 || end < 0) throw new Error("anchors not found");
const out = [...lines.slice(0, start), header, "", ...jTable, "", ...table, "", unverifiedPara, ...lines.slice(end + 1)];
writeFileSync(DOC, out.join("\n"));
console.log({ n, v, jurisdictions: Object.keys(byJ).length, byJ });

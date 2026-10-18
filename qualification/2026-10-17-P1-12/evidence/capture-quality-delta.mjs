// Diagnostic comparison only. The unchanged quality gates remain failed.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { scanSourceQuality } from "/Users/sid/.codex/worktrees/p2-07-scim-qualification/AgentMaturityCompass/scripts/source-quality.mjs";

const directory = "/private/tmp/p1-12-compiled-guard-qualification-20261017";
const roots = {
  baseline: "/private/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-clean-source-iqtnsd/checkout",
  current: "/Users/sid/.codex/worktrees/p2-07-scim-qualification/AgentMaturityCompass"
};
const reports = {};
for (const [role, root] of Object.entries(roots)) {
  const result = scanSourceQuality("dead-code", root);
  const data = JSON.stringify({ role, root, ...result }, null, 2) + "\n";
  const path = `${directory}/quality-${role}-full.json`;
  writeFileSync(path, data, { flag: "wx", mode: 0o600 });
  reports[role] = { ...result, path, bytes: Buffer.byteLength(data), sha256: createHash("sha256").update(data).digest("hex") };
}
const baseline = new Set(reports.baseline.findings);
const current = new Set(reports.current.findings);
const removed = reports.baseline.findings.filter(value => !current.has(value));
const added = reports.current.findings.filter(value => !baseline.has(value));
const summary = {
  schema: "p112-quality-finding-diagnostic/1", diagnosticOnly: true,
  qualityGateRemainsFailed: true, baselineAdopted: false,
  tools: { baseline: reports.baseline.version, current: reports.current.version },
  baseline: { root: roots.baseline, count: reports.baseline.findings.length, path: reports.baseline.path, bytes: reports.baseline.bytes, sha256: reports.baseline.sha256 },
  current: { root: roots.current, count: reports.current.findings.length, path: reports.current.path, bytes: reports.current.bytes, sha256: reports.current.sha256 },
  removed, added,
  boundary: "Two explicitly planned calls to the unchanged scanner export with retained full finding sets. Program completion is diagnostic execution only, not a successful dead-code quality gate. No source/config/baseline or finding was changed."
};
writeFileSync(`${directory}/quality-delta.json`, JSON.stringify(summary, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(summary));

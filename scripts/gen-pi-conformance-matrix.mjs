#!/usr/bin/env node
/**
 * Renders the Pi conformance matrix in docs/adapters/pi.md from the P1-22 qualification record
 * (qualification/2026-10-12-P1-22/pi-conformance.json, hashed by that folder's receipt.json).
 * --write rewrites the section between the markers; --check fails when it differs from the record.
 */
import { readFileSync, writeFileSync } from "node:fs";

const RECEIPT = "qualification/2026-10-12-P1-22/pi-conformance.json";
const DOC = "docs/adapters/pi.md";
const START = "<!-- pi-conformance-matrix:start -->";
const END = "<!-- pi-conformance-matrix:end -->";

const yesNo = (value) => (value ? "yes" : "no");
const ROWS = [
  ["Allowed `read` runs; recorded Pi version", (c) => `${yesNo(c.allowedRead?.ranTool)}; ${c.allowedRead?.piVersion ?? "none"}`],
  ["Session registered before its first call; claim", (c) => `${yesNo(c.allowedRead?.sessionRegistered)}; ${c.allowedRead?.claim ?? "none"}`],
  ["`write` needing approval: file created", (c) => yesNo(c.deniedWrite?.fileCreated)],
  ["Denied `bash`: effect", (c) => yesNo(c.deniedBash?.fileCreated)],
  ["Unmapped extension tool: effect", (c) => yesNo(c.unmappedExtensionTool?.effect)],
  ["`codemode` tool: effect", (c) => yesNo(c.codemode?.effect)],
  ["Codemode nested call emits `tool_call` (parent id)", (c) => (c.codemodeNestedToolCall?.parentToolCallId ? `yes (${c.codemodeNestedToolCall.nestedToolCallId})` : "no")],
  ["Bridge stopped: tool ran", (c) => yesNo(c.bridgeStopped?.ranTool)],
  ["Decision receipts verified cold", (c) => `${c.receiptsVerified?.decisions ?? 0} verified, ${c.receiptsVerified?.failures ?? "?"} failed`],
  ["Limit, untrusted project: write ran; AMC decisions; registrations", (c) => `${yesNo(c.untrustedProjectLimit?.fileCreated)}; ${c.untrustedProjectLimit?.amcDecisions ?? "?"}; ${c.untrustedProjectLimit?.newRegistrations ?? "?"}`],
  ["Decision latency p50 / p95 (ms, n)", (c) => `${c.latencyMs?.p50} / ${c.latencyMs?.p95} (${c.latencyMs?.n})`],
];

function renderMatrix(receipt) {
  const versions = receipt.pi.map((entry) => entry.version);
  const lines = [
    `Run ${receipt.recordedAt} on ${receipt.environment.label}, AMC commit \`${receipt.amcCommit.slice(0, 12)}\`.`,
    "",
    `| Case | ${versions.map((version) => `Pi ${version}`).join(" | ")} |`,
    `|---|${versions.map(() => "---").join("|")}|`,
    ...ROWS.map(([label, cell]) => `| ${label} | ${receipt.pi.map((entry) => cell(entry.cases)).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function main(argv) {
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  const doc = readFileSync(DOC, "utf8");
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${DOC} has no conformance matrix markers`);
  const next = `${doc.slice(0, start + START.length)}\n${renderMatrix(receipt)}\n${doc.slice(end)}`;
  if (argv.includes("--write")) {
    writeFileSync(DOC, next);
    return 0;
  }
  if (next !== doc) {
    console.error(`${DOC} conformance matrix is stale: run node scripts/gen-pi-conformance-matrix.mjs --write`);
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));

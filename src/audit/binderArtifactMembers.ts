import { collectFiles } from "../utils/archiveFiles.js";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { benchProofFileBytes } from "../bench/benchProofs.js";
import type { AuditMapFile } from "./auditMapSchema.js";
import type { AuditPolicy } from "./auditPolicySchema.js";
import type { AuditBinderJson } from "./binderSchema.js";
import type { signBinderJson } from "./binderSigner.js";
import type { scanBinderForPii } from "./binderRedaction.js";
import type { buildBinderProofs } from "./binderProofs.js";
import type { collectAuditBinderData } from "./binderCollector.js";

function markdownSummary(params: {
  binder: AuditBinderJson;
  map: AuditMapFile;
}): string {
  const familyLines = params.binder.sections.controls.families
    .map((family) => {
      return `- ${family.title}: PASS ${family.statusSummary.pass}, FAIL ${family.statusSummary.fail}, INSUFFICIENT ${family.statusSummary.insufficient}`;
    })
    .join("\n");
  return [
    "# AMC Audit Binder Summary",
    "",
    "_Engineering control/evidence crosswalk. This artifact is not legal advice._",
    "",
    `- Binder ID: \`${params.binder.binderId}\``,
    `- Generated: \`${new Date(params.binder.generatedTs).toISOString()}\``,
    `- Scope: \`${params.binder.scope.type}\``,
    `- Trust Label: \`${params.binder.trust.trustLabel}\``,
    `- Integrity Index: \`${params.binder.trust.integrityIndex.toFixed(3)}\``,
    `- Correlation Ratio: \`${params.binder.trust.correlationRatio.toFixed(3)}\``,
    `- Compliance Map: \`${params.map.auditMap.id}\``,
    "",
    "## Control Families",
    familyLines.length > 0 ? familyLines : "- None",
    "",
    "## Maturity",
    `- Status: \`${params.binder.sections.maturity.status}\``,
    `- Overall: \`${params.binder.sections.maturity.overall === null ? "N/A" : params.binder.sections.maturity.overall.toFixed(3)}\``,
    `- Unknown Questions: \`${params.binder.sections.maturity.unknownQuestionsCount}\``,
    "",
    "## Assurance",
    `- Last Cert Status: \`${params.binder.sections.assurance.lastCert.status ?? "N/A"}\``,
    `- Risk Assurance Score: \`${params.binder.sections.assurance.riskAssuranceScore ?? "N/A"}\``,
    "",
    "## Privacy Notes",
    "- Export contains allowlisted numeric/categorical fields, hashes, signatures, and deterministic summaries.",
    "- Export excludes raw prompts, raw tool payloads, secrets, and PII."
  ].join("\n");
}

function escapePdfText(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function renderSummaryPdf(markdown: string): Buffer {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .slice(0, 40);
  const contentLines = ["BT", "/F1 10 Tf", "40 800 Td"];
  let first = true;
  for (const rawLine of lines) {
    const line = rawLine.length === 0 ? " " : rawLine;
    if (!first) {
      contentLines.push("0 -14 Td");
    }
    first = false;
    contentLines.push(`(${escapePdfText(line.slice(0, 110))}) Tj`);
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
  );
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}


/** Existing archive member recipes: canonical JSON + LF, pretty proof JSON, and optional original PDF bytes. */
export function writeAuditBinderStaging(input: { root: string; binder: AuditBinderJson; signature: ReturnType<typeof signBinderJson>;
  publicKeyPem: string; piiScan: ReturnType<typeof scanBinderForPii>; policy: AuditPolicy; map: AuditMapFile;
  scopeId: string; collected: Awaited<ReturnType<typeof collectAuditBinderData>>; proofs: ReturnType<typeof buildBinderProofs> }) {
  const { root, binder, signature, publicKeyPem, piiScan, policy, map, scopeId, collected, proofs } = input;
  const rows = benchProofFileBytes(proofs).files;
  const add = (path: string, bytes: string | Buffer) => rows.push({ path, bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes) });
  add("binder.json", `${canonicalize(binder)}\n`); add("binder.sig", `${canonicalize(signature)}\n`); add("signer.pub", `${publicKeyPem}\n`);
  const scan = `${canonicalize(piiScan)}\n`; add("checks/pii-scan.json", scan); add("checks/pii-scan.sha256", `${sha256Hex(scan)}\n`);
  for (const [path, sha] of [["policy", binder.bindings.auditPolicySha256], ["map", binder.bindings.auditMapSha256], ["canon", binder.bindings.canonSha256],
    ["bank", binder.bindings.bankSha256], ["cgx.pack", binder.bindings.cgxPackSha256], ["prompt.policy", binder.bindings.promptPolicySha256], ["mechanic.targets", binder.bindings.mechanicTargetsSha256]] as const)
    add(`meta/${path}.sha256`, `${sha}\n`);
  add("meta/calculation-manifest.json", `${canonicalize(collected.calculationManifest)}\n`);
  const build = `${canonicalize({ v: 1, generatedTs: binder.generatedTs, binderId: binder.binderId, scopeType: binder.scope.type, scopeId,
    includedEventKinds: collected.includedEventKinds, sourceEventHashes: collected.sourceEventHashes })}\n`;
  add("meta/build.json", build); add("meta/build.sha256", `${sha256Hex(build)}\n`);
  const summary = markdownSummary({ binder, map }); add("summaries/summary.md", `${summary}\n`);
  if (policy.auditPolicy.export.allowPdfSummary) add("summaries/summary.pdf", renderSummaryPdf(summary));
  if (collected.conformanceFiles) { add("checks/conformance-run.json", collected.conformanceFiles.json); add("summaries/conformance-run.md", collected.conformanceFiles.markdown); }
  for (const row of rows) { const file = join(root, row.path); ensureDir(dirname(file)); writeFileAtomic(file, row.bytes, 0o644); }
}
export function createStagedAuditTar(sourceDir: string, outFile: string): void {
  const files = collectFiles(sourceDir), out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) throw new Error("audit binder staging archive failed", { cause: out.error ?? new Error(`${out.stdout ?? ""}${out.stderr ?? ""}`) });
}

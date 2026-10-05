import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import YAML from "yaml";
import ts from "typescript";
import { afterEach, describe, expect, test, vi } from "vitest";
import { escapePdfText, renderPdfFromLines } from "../src/utils/textPdf.js";
import {
  collectVerifierEvidence, defaultEvidenceExportPath, exportVerifierEvidence, hashFile,
  renderVerifierEvidence, renderVerifierEvidencePdf, type VerifierEvidenceDataset,
} from "../src/evidence/exporter.js";
import {
  passportBadgeCli, passportCreateCli, passportExportLatestCli, passportInitCli,
  passportPolicyApplyCli, passportPolicyPrintCli, passportShareCli, passportShowCli,
  passportVerifyCli, passportVerifyPolicyCli,
} from "../src/passport/passportCli.js";
import { initWorkspace } from "../src/workspace.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../src/passport/passportStore.js";

const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const archive = "unused-code/2026-10-01-main/pdf-renderer";
const restoration = JSON.parse(read(`${archive}/restoration.json`)) as {
  files: Array<{ originalPath: string; archivePath: string; sha256: string }>;
};
const parse = (source: string) => ts.createSourceFile("pdf.ts", source, ts.ScriptTarget.ES2022, true);
function originalFunctions(source: string) {
  const file = parse(source);
  const statements = file.statements.filter(node => ts.isFunctionDeclaration(node)
    && ["escapePdfText", "renderPdfFromLines", "renderVerifierEvidencePdf"].includes(node.name?.text ?? ""));
  const code = statements.map(node => node.getText(file)).join("\n")
    + "\nexports.escapePdfText = escapePdfText; exports.renderPdfFromLines = renderPdfFromLines;";
  const result = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  expect(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports = {} as { escapePdfText: typeof escapePdfText; renderPdfFromLines: typeof renderPdfFromLines; renderVerifierEvidencePdf?: typeof renderVerifierEvidencePdf };
  runInNewContext(result.outputText, { exports, Buffer, Date }, { timeout: 1_000 });
  return exports;
}
function unchangedDeclarations(source: string) {
  const file = parse(source);
  return file.statements.filter(node => !(ts.isFunctionDeclaration(node)
    && ["escapePdfText", "renderPdfFromLines"].includes(node.name?.text ?? "")))
    .filter(node => !(ts.isImportDeclaration(node) && node.moduleSpecifier.getText(file).includes("textPdf.js")))
    .map(node => node.getText(file)).join("\n");
}
function byteStructure(pdf: Buffer) {
  const text = pdf.toString("utf8");
  const start = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  expect(pdf.subarray(start, start + 4).toString()).toBe("xref");
  const rows = pdf.subarray(start).toString("utf8").split("\n");
  expect(rows[1]).toBe("0 6");
  for (let object = 1; object <= 5; object++) {
    const offset = Number(rows[object + 2]!.slice(0, 10));
    expect(pdf.subarray(offset, offset + 7).toString()).toBe(`${object} 0 obj`);
  }
  const length = Number(text.match(/5 0 obj\n<< \/Length (\d+) >>\nstream\n/)?.[1]);
  const streamStart = pdf.indexOf(Buffer.from("stream\n")) + 7;
  expect(pdf.subarray(streamStart + length, streamStart + length + 11).toString()).toBe("\nendstream\n");
}
function failure(fn: () => unknown) {
  try { return { result: fn() }; } catch (error) { const e = error as Error; return { name: e.name, message: e.message }; }
}
const fixtures: Array<[string, string[]]> = [
  ["empty", []], ["blank lines", ["", " ", "\t"]],
  ["multiple lines", ["first", "second", "third"]],
  ["escaping", ["parentheses (closed) and backslash \\", ") Tj ET BT (inert text"]],
  ["UTF-8 and trailing whitespace", ["研究 ગુજરાત é 😀 ", "trailing\t\r\n"]],
  ["width boundary", ["a".repeat(109), "b".repeat(110), "c".repeat(111)]],
  ["line boundary", Array.from({ length: 112 }, (_, index) => `line-${index}`)],
  ["UTF-16 truncation", ["a".repeat(106) + "😀" + "b".repeat(10)]],
];

const originals = restoration.files.map(row => {
  const source = read(row.archivePath);
  if (createHash("sha256").update(source).digest("hex") !== row.sha256) throw new Error(`Original changed: ${row.originalPath}`);
  return { ...row, source, functions: originalFunctions(source) };
});
for (const original of originals) {
  describe(`text PDF parity against ${original.originalPath}`, () => {
    test("preserves all caller declarations, crypto policy and public APIs", () => {
      expect(unchangedDeclarations(read(original.originalPath))).toBe(unchangedDeclarations(original.source));
      expect(escapePdfText.length).toBe(original.functions.escapePdfText.length);
      expect(renderPdfFromLines.length).toBe(original.functions.renderPdfFromLines.length);
    });
    for (const [label, lines] of fixtures) {
      test(`preserves ${label} bytes and valid UTF-8 object offsets`, () => {
        const actual = renderPdfFromLines(lines);
        expect(actual.equals(original.functions.renderPdfFromLines(lines))).toBe(true);
        byteStructure(actual);
        for (const line of lines) expect(escapePdfText(line)).toBe(original.functions.escapePdfText(line));
      });
    }
    test("retains malformed input errors, including ignored rows processed before truncation", () => {
      for (const input of [null, {}, [null], [...Array.from({ length: 111 }, () => "valid"), undefined]]) {
        expect(failure(() => renderPdfFromLines(input as string[]))).toEqual(failure(() => original.functions.renderPdfFromLines(input as string[])));
      }
    });
  });
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-pdf-public-parity-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  savePassportPolicy(root, defaultPassportPolicy());
  return root;
}
function dataset(count: number): VerifierEvidenceDataset {
  const ts = 1_700_000_000_000;
  return {
    schemaVersion: 1, generatedTs: ts, workspace: "owned metadata fixture", agentFilter: "agent (fixture) \\",
    includeChain: true, includeRationale: true, eventCount: count, chainInvalidCount: count,
    records: Array.from({ length: count }, (_, index) => ({
      eventId: `fixture-${index}`, ts, isoTs: new Date(ts).toISOString(), sessionId: "fixture-session",
      runtime: "fixture", eventType: "fixture (event)", actorId: 'actor,"fixture"', payloadSha256: "a".repeat(64),
      prevEventHash: "b".repeat(64), eventHash: "c".repeat(64), writerSignature: "fixture-unverified",
      chainIndex: index, chainValid: false, chainExpectedPrevHash: "b".repeat(64), incidentIds: [], correctionIds: [],
      correctionStatuses: [], corrected: false, correctedTs: null, rationale: "fixture \\ (reason)", rationaleChain: [], meta: {},
    })),
  };
}
describe("actual public evidence and passport rendering", () => {
  for (const count of [0, 1, 112]) {
    test(`public evidence PDF preserves archived bytes for ${count} supplied metadata rows`, () => {
      const value = dataset(count), original = originals.find(row => row.originalPath === "src/evidence/exporter.ts")!;
      const expected = original.functions.renderVerifierEvidencePdf!(value), actual = renderVerifierEvidencePdf(value);
      expect(actual.equals(expected)).toBe(true);
      expect((renderVerifierEvidence(value, "pdf") as Buffer).equals(expected)).toBe(true);
      byteStructure(actual);
    });
  }
  test("public format dispatch retains JSON data and CSV quote escaping", () => {
    const value = dataset(1);
    expect(JSON.parse(renderVerifierEvidence(value, "json") as string)).toEqual(value);
    expect(renderVerifierEvidence(value, "csv")).toContain('"actor,""fixture"""');
  });
  test("public exports write each actual format with a matching file hash", () => {
    const ws = workspace(), before = collectVerifierEvidence({ workspace: ws });
    expect(hashFile(join(ws, "missing"))).toBe("");
    expect(defaultEvidenceExportPath(ws, "pdf", 1_700_000_000_000)).toBe(join(ws, ".amc", "exports", "evidence-2023-11-14T22-13-20-000Z.pdf"));
    for (const format of ["json", "csv", "pdf"] as const) {
      const outFile = join(ws, `owned-export.${format}`), result = exportVerifierEvidence({ workspace: ws, format, outFile });
      const bytes = readFileSync(result.outFile);
      expect(result.eventCount).toBe(before.eventCount);
      expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(hashFile(result.outFile)).toBe(result.sha256);
      if (format === "pdf") byteStructure(bytes);
      if (format === "json") expect(JSON.parse(bytes.toString()).eventCount).toBe(before.eventCount);
    }
  });
  test("actual passport CLI policies, creation, verification, badges and shared PDF remain usable", () => {
    const ws = workspace(), init = passportInitCli(ws);
    expect(init.signature.valid).toBe(true);
    expect(passportVerifyPolicyCli(ws).valid).toBe(true);
    expect(passportPolicyPrintCli(ws)).toEqual(init.policy);
    for (const [name, content] of [["policy.json", JSON.stringify(init.policy)], ["policy.yaml", YAML.stringify(init.policy)]]) {
      const file = join(ws, name!); writeFileSync(file, content!);
      const applied = passportPolicyApplyCli({ workspace: ws, file });
      expect(applied.transparencyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(readFileSync(applied.path, "utf8")).toContain("passportPolicy:");
      expect(passportVerifyPolicyCli(ws).valid).toBe(true);
      expect(passportPolicyPrintCli(ws)).toEqual(init.policy);
    }
    const created = passportCreateCli({ workspace: ws, scope: "agent", id: "default", outFile: join(ws, "owned.amcpass") });
    expect(passportVerifyCli({ workspace: ws, file: created.outFile }).ok).toBe(true);
    expect(passportShowCli({ file: created.outFile, format: "json" })).toHaveProperty("passport.passportId", created.passport.passportId);
    expect(passportShowCli({ file: created.outFile, format: "badge" })).toContain("AMC ");
    expect(passportBadgeCli({ workspace: ws, agentId: "default" }).badge).toContain("AMC ");
    expect(passportExportLatestCli({ workspace: ws, scope: "agent", id: "default", outFile: join(ws, "latest.amcpass") }).outFile).toBe(join(ws, "latest.amcpass"));
    vi.useFakeTimers(); vi.setSystemTime(new Date(Date.now() + 1_000));
    const shared = passportShareCli({ workspace: ws, agentId: "default", format: "pdf", outFile: join(ws, "shared.pdf") });
    const passport = passportBadgeCli({ workspace: ws, agentId: "default" }).passport;
    const lines = [
      "AMC Passport Share Certificate", `Generated: ${new Date().toISOString()}`, "Agent: default",
      `Passport ID: ${passport.passportId}`, `Status: ${passport.status.label}`, `Maturity Overall: ${passport.maturity.overall ?? "UNKNOWN"}`,
      `Strategic Ops: ${passport.maturity.byFiveLayers.strategicOps ?? "UNKNOWN"}`, `Leadership: ${passport.maturity.byFiveLayers.leadership ?? "UNKNOWN"}`,
      `Culture: ${passport.maturity.byFiveLayers.culture ?? "UNKNOWN"}`, `Resilience: ${passport.maturity.byFiveLayers.resilience ?? "UNKNOWN"}`,
      `Skills: ${passport.maturity.byFiveLayers.skills ?? "UNKNOWN"}`, `Public URL: ${shared.publicUrl}`, `Verify URL: ${shared.verificationUrl}`, `QR URL: ${shared.qrCodeUrl}`,
    ];
    const expected = originals.find(row => row.originalPath === "src/passport/passportCli.ts")!.functions.renderPdfFromLines(lines);
    const actual = readFileSync(shared.file!); expect(actual.equals(expected)).toBe(true); byteStructure(actual);
  });
});

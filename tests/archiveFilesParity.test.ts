import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanupDir, collectFiles } from "../src/utils/archiveFiles.js";
import { pathExists } from "../src/utils/fs.js";
import { initWorkspace } from "../src/workspace.js";
import { createAuditBinderArtifact, inspectAuditBinder, listExportedAuditBinders } from "../src/audit/binderArtifact.js";
import { createBenchArtifact, inspectBenchArtifact, listExportedBenchArtifacts } from "../src/bench/benchArtifact.js";
import { initBenchPolicy } from "../src/bench/benchPolicyStore.js";
import { createPassportArtifact, inspectPassportArtifact, listExportedPassportArtifacts } from "../src/passport/passportArtifact.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../src/passport/passportStore.js";
import { extractValidatedTarGzipArchive } from "../src/security/safeTarArchive.js";
import * as benchCollector from "../src/bench/benchCollector.js";
import * as passportCollector from "../src/passport/passportCollector.js";
import * as benchSigner from "../src/bench/benchSigner.js";
import * as passportSigner from "../src/passport/passportSigner.js";

const archive = "unused-code/2026-10-01-main/archive-files";
const sources = [
  ["src/audit/binderArtifact.ts", "bb816036887454abaca9fd3d9d1acaadad09aa2f80ab9d8328e5040135bc2f2a"],
  ["src/bench/benchArtifact.ts", "9ec275d57ccce6aeaf30d84a76ad2802f7d6789dfc54a0971f933cadc682b605"],
  ["src/passport/passportArtifact.ts", "2a0b7808df5a52452cdf8e22b947b3dcc7a4835384a7fbaf21ab3fc617fe5cef"],
] as const;
const owned: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true });
});
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function parsed(source: string) { return ts.createSourceFile("artifact.ts", source, ts.ScriptTarget.ES2022, true); }
function untouched(source: string): string {
  const file = parsed(source);
  return file.statements.filter(node => !(ts.isFunctionDeclaration(node)
    && ["collectFiles", "cleanupDir"].includes(node.name?.text ?? "")))
    .filter(node => !(ts.isImportDeclaration(node) && node.moduleSpecifier.getText(file).includes("archiveFiles.js")))
    .map(node => node.getText(file).replace("readdirSync, rmSync", "readdirSync")
      .replace("dirname, join, relative, resolve", "dirname, join, resolve")).join("\n");
}

interface ArtifactDomain {
  name: string;
  archiveRoot: string;
  jsonName: string;
  extension: string;
  exportDir: string;
  create(workspace: string, outFile: string): Promise<{ outFile: string }>;
  inspect(file: string): { id: string; generatedTs: number; piiScanPresent: boolean; sha256: string };
  list(workspace: string): Array<{ file: string; generatedTs: number; sha256: string }>;
}
const domains: ArtifactDomain[] = [
  {
    name: "audit binder", archiveRoot: "amc-audit", jsonName: "binder.json", extension: ".amcaudit",
    exportDir: ".amc/audit/binders/exports/workspace/workspace",
    create: (workspace, outFile) => createAuditBinderArtifact({ workspace, scopeType: "WORKSPACE", outFile, nowTs: 1_700_000_000_000 }),
    inspect: file => {
      const value = inspectAuditBinder(file);
      return { id: value.binder.binderId, generatedTs: value.binder.generatedTs, piiScanPresent: value.piiScan !== null, sha256: value.sha256 };
    },
    list: listExportedAuditBinders,
  },
  {
    name: "bench", archiveRoot: "amc-bench", jsonName: "bench.json", extension: ".amcbench",
    exportDir: ".amc/bench/exports/nested/agent",
    create: async (workspace, outFile) => createBenchArtifact({ workspace, scope: "workspace", outFile }),
    inspect: file => {
      const value = inspectBenchArtifact(file);
      return { id: value.bench.benchId, generatedTs: value.bench.generatedTs, piiScanPresent: value.piiScan !== null, sha256: value.sha256 };
    },
    list: listExportedBenchArtifacts,
  },
  {
    name: "passport", archiveRoot: "amc-passport", jsonName: "passport.json", extension: ".amcpass",
    exportDir: ".amc/passport/exports/nested/agent",
    create: async (workspace, outFile) => createPassportArtifact({ workspace, scopeType: "WORKSPACE", outFile }),
    inspect: file => {
      const value = inspectPassportArtifact(file);
      return { id: value.passport.passportId, generatedTs: value.passport.generatedTs, piiScanPresent: value.piiScan !== null, sha256: value.sha256 };
    },
    list: listExportedPassportArtifacts,
  },
];

function artifactWorkspace() {
  const root = fixture();
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  initBenchPolicy(root);
  savePassportPolicy(root, defaultPassportPolicy());
  return root;
}
function unpackOwnedArtifact(file: string) {
  const root = fixture();
  extractValidatedTarGzipArchive({
    file, destination: root, label: "owned test artifact",
    limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 },
  });
  return root;
}
function repackOwnedArtifact(root: string, file: string) {
  const result = spawnSync("tar", ["-czf", file, "-C", root, "."], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

describe("artifact privacy enforcement before signing", () => {
  test("bench rejects schema-valid unsafe collector output before signing or exporting", () => {
    const ws = artifactWorkspace(), outFile = join(fixture(), "refused.amcbench");
    const collect = benchCollector.collectBenchData;
    vi.spyOn(benchCollector, "collectBenchData").mockImplementation(params => {
      const result = collect(params);
      result.bench.metrics.forecastSummary.reasons = ["fixture@example.invalid"];
      return result;
    });
    const sign = vi.spyOn(benchSigner, "signBenchJson");
    expect(() => createBenchArtifact({ workspace: ws, scope: "workspace", outFile }))
      .toThrow(/bench pii scan failed: .*EMAIL:metrics\.forecastSummary\.reasons\[\d+\]/);
    expect(sign).not.toHaveBeenCalled();
    expect(existsSync(outFile)).toBe(false);
  });
  test("passport rejects schema-valid unsafe collector output before the first signature", () => {
    const ws = artifactWorkspace(), outFile = join(fixture(), "refused.amcpass");
    const collect = passportCollector.collectPassportData;
    vi.spyOn(passportCollector, "collectPassportData").mockImplementation(params => {
      const result = collect(params);
      result.passport.status.reasons = ["fixture@example.invalid"];
      return result;
    });
    const sign = vi.spyOn(passportSigner, "signPassportJson");
    expect(() => createPassportArtifact({ workspace: ws, scopeType: "WORKSPACE", outFile }))
      .toThrow("passport pii scan failed: EMAIL:status.reasons[0]");
    expect(sign).not.toHaveBeenCalled();
    expect(existsSync(outFile)).toBe(false);
  });
});

for (const domain of domains) {
  describe(`${domain.name} public archive inspection and listing`, () => {
    test("inspects canonical, alternate and flat layouts with optional privacy report", async () => {
      const ws = artifactWorkspace();
      const created = await domain.create(ws, join(fixture(), `source${domain.extension}`));
      const expected = domain.inspect(created.outFile);
      expect(expected.piiScanPresent).toBe(true);
      expect(expected.sha256).toBe(createHash("sha256").update(readFileSync(created.outFile)).digest("hex"));
      for (const layout of ["alternate", "flat"] as const) {
        const root = unpackOwnedArtifact(created.outFile);
        const canonical = join(root, domain.archiveRoot);
        const content = layout === "alternate" ? join(root, "renamed-export") : root;
        if (layout === "alternate") renameSync(canonical, content);
        else {
          for (const entry of readdirSync(canonical)) renameSync(join(canonical, entry), join(root, entry));
          rmSync(canonical, { recursive: true });
        }
        // Inspection reads metadata, and does not verify the payload signature.
        rmSync(join(content, "checks", "pii-scan.json"));
        writeFileSync(join(root, "ignore.txt"), "non-directory entry");
        mkdirSync(join(root, "incomplete-child"));
        writeFileSync(join(root, "incomplete-child", domain.jsonName), "{}");
        const file = join(fixture(), `${layout}${domain.extension}`);
        repackOwnedArtifact(root, file);
        const actual = domain.inspect(file);
        expect(actual.id).toBe(expected.id);
        expect(actual.generatedTs).toBe(expected.generatedTs);
        expect(actual.piiScanPresent).toBe(false);
        expect(actual.sha256).toBe(createHash("sha256").update(readFileSync(file)).digest("hex"));
      }
    });
    test("lists nested exports, skips broken and linked entries, and orders metadata deterministically", async () => {
      const ws = artifactWorkspace(), dir = join(ws, domain.exportDir);
      mkdirSync(dir, { recursive: true });
      const original = await domain.create(ws, join(dir, `b${domain.extension}`));
      const source = domain.inspect(original.outFile);
      const a = join(dir, `a${domain.extension}`), newer = join(dir, `newer${domain.extension}`);
      copyFileSync(original.outFile, a);
      const content = unpackOwnedArtifact(original.outFile);
      const payload = join(content, domain.archiveRoot, domain.jsonName);
      const metadata = JSON.parse(readFileSync(payload, "utf8")) as { generatedTs: number };
      metadata.generatedTs = source.generatedTs + 1;
      writeFileSync(payload, JSON.stringify(metadata));
      // A modified inspection fixture is not qualified as a verified artifact.
      repackOwnedArtifact(content, newer);
      writeFileSync(join(dir, `broken${domain.extension}`), "not a gzip archive");
      copyFileSync(original.outFile, join(dir, "wrong-extension.txt"));
      symlinkSync(original.outFile, join(dir, `link${domain.extension}`));
      const rows = domain.list(ws);
      expect(rows.map(row => row.file)).toEqual([newer, a, original.outFile]);
      expect(rows.map(row => row.generatedTs)).toEqual([source.generatedTs + 1, source.generatedTs, source.generatedTs]);
      for (const row of rows) expect(row.sha256).toBe(createHash("sha256").update(readFileSync(row.file)).digest("hex"));
    });
    test("missing exports return an empty list and malformed archives fail visibly", () => {
      expect(domain.list(fixture())).toEqual([]);
      const file = join(fixture(), `invalid${domain.extension}`);
      writeFileSync(file, "invalid gzip bytes");
      expect(() => domain.inspect(file)).toThrow();
    });
  });
}
function originalHelpers(source: string) {
  const file = parsed(source);
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node)
    && ["collectFiles", "cleanupDir"].includes(node.name?.text ?? ""));
  expect(nodes).toHaveLength(2);
  const text = nodes.map(node => node.getText(file)).join("\n")
    + "\nexports.collectFiles = collectFiles; exports.cleanupDir = cleanupDir;";
  const result = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  expect(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports = {} as { collectFiles: typeof collectFiles; cleanupDir: typeof cleanupDir };
  runInNewContext(result.outputText, { exports, pathExists, readdirSync, rmSync, join, relative }, { timeout: 1_000 });
  return exports;
}
function fixture(files: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "amc-archive-files-parity-")); owned.push(root);
  for (const file of files) { const full = join(root, file); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, file); }
  return root;
}
function failure(fn: () => unknown) {
  try { return { value: JSON.stringify(fn()) }; }
  catch (error) { const value = error as NodeJS.ErrnoException; return { name: value.name, code: value.code }; }
}

for (const [path, expectedHash] of sources) {
  const originalSource = read(`${archive}/originals/${path}.original`);
  if (createHash("sha256").update(originalSource).digest("hex") !== expectedHash) throw new Error(`Original changed: ${path}`);
  const original = originalHelpers(originalSource);
  describe(`archive file utility parity: ${path}`, () => {
    test("preserves extraction bounds, all verifiers, domain errors and public APIs", () => {
      expect(untouched(read(path))).toBe(untouched(originalSource));
      expect(collectFiles.length).toBe(original.collectFiles.length);
      expect(cleanupDir.length).toBe(original.cleanupDir.length);
    });
    for (const [name, files] of [
      ["empty", []],
      ["nested deterministic paths", ["z.txt", "nested/b.txt", "nested/deep/a.txt", ".hidden", "a.txt"]],
      ["unicode and whitespace", ["ગુજરાતી.txt", "研究/é.txt", "space name/a file.txt"]],
    ] as const) {
      test(`collect ${name}`, () => {
        const root = fixture([...files]);
        expect(collectFiles(root)).toEqual([...original.collectFiles(root)]);
        expect(collectFiles(root)).toHaveLength(files.length);
      });
    }
    test("ignores file and directory symlinks, including cycles", () => {
      const root = fixture(["real.txt", "nested/child.txt"]);
      symlinkSync(join(root, "real.txt"), join(root, "file-link"));
      symlinkSync(join(root, "nested"), join(root, "directory-link"));
      symlinkSync(root, join(root, "nested", "cycle"));
      expect(collectFiles(root)).toEqual([...original.collectFiles(root)]);
      expect(collectFiles(root)).toHaveLength(2);
    });
    test("missing root retains filesystem error", () => {
      const missing = join(fixture(), "missing");
      expect(failure(() => collectFiles(missing))).toEqual(failure(() => original.collectFiles(missing)));
      expect(failure(() => collectFiles(missing))).toEqual({ name: "Error", code: "ENOENT" });
    });
    test("recursive cleanup removes the owned tree and remains idempotent", () => {
      const before = fixture(["nested/child.txt"]), after = fixture(["nested/child.txt"]);
      expect(failure(() => cleanupDir(after))).toEqual(failure(() => original.cleanupDir(before)));
      expect(existsSync(before)).toBe(false); expect(existsSync(after)).toBe(false);
      expect(failure(() => cleanupDir(after))).toEqual(failure(() => original.cleanupDir(before)));
    });
  });
}


const additionalArchive = "unused-code/2026-10-01-main/archive-files-additional";
const additionalRestoration = JSON.parse(read(`${additionalArchive}/restoration.json`)) as {
  files: Array<{ originalPath: string; archivePath: string; sha256: string }>;
};
function additionalUntouched(source: string): string {
  const file = parsed(source);
  return file.statements.filter(node => !(ts.isFunctionDeclaration(node) && node.name?.text === "collectFiles"))
    .filter(node => !(ts.isImportDeclaration(node) && node.moduleSpecifier.getText(file).includes("archiveFiles.js")))
    .map(node => node.getText(file).replace("dirname, join, relative, resolve", "dirname, join, resolve")).join("\n");
}
function additionalCollector(source: string) {
  const file = parsed(source);
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "collectFiles");
  expect(nodes).toHaveLength(1);
  const result = ts.transpileModule(`${nodes[0]!.getText(file)}\nexports.collectFiles = collectFiles;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  });
  expect(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports = {} as { collectFiles: typeof collectFiles };
  runInNewContext(result.outputText, { exports, readdirSync, join, relative, collectArchiveFiles: collectFiles }, { timeout: 1_000 });
  return exports.collectFiles;
}
for (const row of additionalRestoration.files.filter(item => item.originalPath.startsWith("src/"))) {
  const originalSource = read(row.archivePath);
  if (createHash("sha256").update(originalSource).digest("hex") !== row.sha256) throw new Error(`Original changed: ${row.originalPath}`);
  const original = additionalCollector(originalSource), current = additionalCollector(read(row.originalPath));
  describe(`additional archive file utility: ${row.originalPath}`, () => {
    test("retains all other declarations, cleanup, crypto, extraction guards and public APIs", () => {
      expect(additionalUntouched(read(row.originalPath))).toBe(additionalUntouched(originalSource));
      expect(current.length).toBe(original.length);
    });
    for (const [label, files] of [
      ["empty", []], ["nested deterministic paths", ["z.txt", "nested/b.txt", "nested/deep/a.txt", ".hidden", "a.txt"]],
      ["unicode and whitespace", ["ગુજરાતી.txt", "研究/é.txt", "space name/a file.txt"]],
    ] as const) {
      test(`collect ${label}`, () => {
        const root = fixture([...files]);
        expect(current(root)).toEqual([...original(root)]);
        expect(current(root)).toHaveLength(files.length);
      });
    }
    test("retains exclusion of file/directory symlinks and cycles", () => {
      const root = fixture(["real.txt", "nested/child.txt"]);
      symlinkSync(join(root, "real.txt"), join(root, "file-link"));
      symlinkSync(join(root, "nested"), join(root, "directory-link"));
      symlinkSync(root, join(root, "nested", "cycle"));
      expect(current(root)).toEqual([...original(root)]);
      expect(current(root)).toHaveLength(2);
    });
    test("retains missing and regular-file root filesystem failures", () => {
      const root = fixture(["regular.txt"]);
      for (const input of [join(root, "missing"), join(root, "regular.txt")]) {
        expect(failure(() => current(input))).toEqual(failure(() => original(input)));
      }
    });
  });
}

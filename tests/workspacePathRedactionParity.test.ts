import { createHash } from "node:crypto";
import { ARCHIVED_PACKAGE_ENTRIES_SHA256, ARCHIVED_PACKAGE_MANIFEST_SHA256, packageEntriesSha256, withPackageEntriesPin } from "./helpers/packageEntries.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { redactNullableWorkspacePath, redactWorkspacePath } from "../src/utils/workspacePathRedaction.js";
import { redactLifecycleChangeReceipt } from "../src/lifecycle/changeReceipt.js";
import { redactReasoningMemoryItem } from "../src/learning/reasoningMemory.js";
import { redactFixerRcaReport } from "../src/mechanic/fixerRca.js";
import { redactOrgRunArtifact } from "../src/org/orgRun.js";
import { redactObservabilityLaneRecord } from "../src/lifecycle/observabilityLane.js";
import { restoreWorkspacePathSharing } from "./helpers/restoreWorkspacePathSharing.js";

type RuntimeFunction = (...args: unknown[]) => unknown;
type Row = { originalPath: string; archivePath: string; sha256: string; currentSha256: string;
  name: string; nullable: boolean; importLine: string; beforeBody: string; afterBody: string;
  originalDeclaration: string; currentDeclaration: string };
const prefix = "unused-code/2026-10-02-main/workspace-path-redaction";
const map = JSON.parse(readFileSync(resolve(prefix, "restoration.json"), "utf8")) as {
  sourceCommit: string; files: Row[]; utility: { path: string; sha256: string };
  priorTests: Array<{ originalPath: string; archivePath: string; sha256: string }>;
  packageManifestSha256: string;
  compiledContracts: Array<{ source: string; file: string; sha256: string }>;
};
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function archived(row: Row): string {
  const bytes = readFileSync(resolve(row.archivePath));
  if (hash(bytes) !== row.sha256) throw new Error("Complete path-redaction original changed: " + row.originalPath);
  return bytes.toString("utf8");
}

// Execute each entire archived/current source module. Unchanged runtime imports
// resolve through its real built module location; the new shared helper is the
// actual source import above. No fabricated dependency responses or provider calls.
function moduleFunctions(row: Row, source: string): Record<string, RuntimeFunction> {
  const compiled = ts.transpileModule(source + "\nexports.__privatePath = " + row.name + ";", {
    fileName: row.originalPath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    reportDiagnostics: true
  });
  if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error("Full redaction module did not transpile: " + row.originalPath);
  }
  const filename = resolve(row.originalPath.replace(/^src\//, "dist/").replace(/\.ts$/, ".js"));
  const requireActual = createRequire(filename);
  const exports: Record<string, RuntimeFunction> = {};
  runInNewContext(compiled.outputText, { exports, module: { exports }, process, Buffer, console,
    setTimeout, clearTimeout, setInterval, clearInterval, __filename: filename, __dirname: resolve(filename, ".."),
    require(specifier: string) {
      if (specifier === "../utils/workspacePathRedaction.js") {
        return { redactWorkspacePath, redactNullableWorkspacePath };
      }
      return requireActual(specifier);
    }
  }, { timeout: 10_000 });
  return exports;
}
const modules = new Map(map.files.map(row => [row.originalPath, {
  before: moduleFunctions(row, archived(row)),
  after: moduleFunctions(row, readFileSync(resolve(row.originalPath), "utf8"))
}]));
function outcome(fn: RuntimeFunction, ...args: unknown[]) {
  try { return { value: JSON.stringify(fn(...args)) }; }
  catch (error) { const failure = error as Error & { code?: string };
    return { name: failure.name, message: failure.message, code: failure.code }; }
}
const workspace = "/tmp/amc-path-owner";
const pathCases: Array<{ label: string; make: () => unknown }> = [
  ...[workspace, workspace + "/", workspace + "/file.json", workspace + "/nested/file.json",
    workspace + "-sibling/file.json", "/tmp/outside/file.json", workspace + "/../outside/file.json",
    workspace + "//nested/../file.json", workspace + "/漢字/space name", "src/file.json", ".", "./", "..", "",
    "/", "$WORKSPACE/file.json", "C:\\workspace\\file.json", "\\server\\share\\file.json", "\0", "a%2Fb"].map(value => ({
      label: JSON.stringify(value), make: () => value
    })),
  ...[null, undefined, false, true, 0, 1, NaN, {}, [], Symbol("path")].map((value, index) => ({
    label: "native malformed path " + index, make: () => value
  }))
];
for (const row of map.files) {
  const pair = modules.get(row.originalPath)!;
  describe("full-module native path parity: " + row.originalPath, () => {
    it("retains the private function name and arity", () => {
      expect(pair.after.__privatePath.name).toBe(row.name);
      expect(pair.after.__privatePath.length).toBe(pair.before.__privatePath.length);
      expect(pair.after.__privatePath.length).toBe(2);
    });
    for (const fixture of pathCases) {
      it(fixture.label, () => {
        expect(outcome(pair.after.__privatePath, fixture.make(), workspace))
          .toEqual(outcome(pair.before.__privatePath, fixture.make(), workspace));
      });
    }
    it("retains workspace-first native refusals and nullable early return", () => {
      for (const invalidWorkspace of [null, undefined, false, true, 0, {}, [], Symbol("workspace")]) {
        for (const path of [null, undefined, false, 0, NaN, "", workspace, {}, Symbol("path")]) {
          expect(outcome(pair.after.__privatePath, path, invalidWorkspace))
            .toEqual(outcome(pair.before.__privatePath, path, invalidWorkspace));
        }
      }
    });
    it("retains native non-coercion of path and workspace objects", () => {
      function observed() {
        const accesses: string[] = [];
        const value = new Proxy({}, { get(_target, key) { accesses.push(String(key)); throw new Error("unexpected coercion"); } });
        return { value, accesses };
      }
      for (const invalidWorkspace of [false, true]) {
        const before = observed(), after = observed();
        const argsBefore = invalidWorkspace ? [workspace, before.value] : [before.value, workspace];
        const argsAfter = invalidWorkspace ? [workspace, after.value] : [after.value, workspace];
        expect(outcome(pair.after.__privatePath, ...argsAfter)).toEqual(outcome(pair.before.__privatePath, ...argsBefore));
        expect(after.accesses).toEqual(before.accesses);
        expect(after.accesses).toEqual(["constructor"]);
      }
    });
    it("redacts exact roots and descendants without treating sibling prefixes as owned", () => {
      expect(pair.after.__privatePath(workspace, workspace)).toBe("$WORKSPACE");
      expect(pair.after.__privatePath(workspace + "/nested/file.json", workspace)).toBe("$WORKSPACE/nested/file.json");
      expect(pair.after.__privatePath(workspace + "-sibling/file.json", workspace)).toBe(workspace + "-sibling/file.json");
    });
  });
}

const pipelines: Array<{ name: string; file: string; run: RuntimeFunction; fixture: (path: unknown, root: unknown) => unknown }> = [
  { name: "redactLifecycleChangeReceipt", file: "src/lifecycle/changeReceipt.ts",
    run: redactLifecycleChangeReceipt as RuntimeFunction,
    fixture: (path, root) => ({ marker: "retained", workspace: root, rollback: { marker: "rollback", restoreReceiptPath: path } }) },
  { name: "redactReasoningMemoryItem", file: "src/learning/reasoningMemory.ts",
    run: redactReasoningMemoryItem as RuntimeFunction,
    fixture: path => ({ marker: "retained", evidenceRefs: [{ ref: workspace + "/evidence.json", extra: "retained" }, { ref: "ev:relative" }],
      affectedResource: { path, marker: "affected" }, signaturePath: path }) },
  { name: "redactFixerRcaReport", file: "src/mechanic/fixerRca.ts", run: redactFixerRcaReport as RuntimeFunction,
    fixture: (path, root) => ({ marker: "retained", workspace: root, signaturePath: path,
      callRecords: [{ outputSnippet: " bearer abcdefghijklm  sk-abcdefghijklmnop\n tail ", marker: "call" }],
      proposals: [{ resourcePath: path, marker: "proposal" }] }) },
  { name: "redactOrgRunArtifact", file: "src/org/orgRun.ts", run: redactOrgRunArtifact as RuntimeFunction,
    fixture: (path, root) => ({ marker: "retained", workspace: root, roles: [{ roleWorkspace: path,
      scope: { allowedWriteRoots: [path] }, publicStateRef: { path, visibility: "public", sha256: "public-hash" },
      privateGraderStateRef: { path, visibility: "private", sha256: "private-hash" }, handoffNoteRefs: [{ path }],
      episodeRecordRef: { path }, lifecycleArtifactRef: { path, signaturePath: path } }],
      parentEpisodeRecordRef: { path }, parentLifecycleArtifactRef: { path, signaturePath: path } }) },
  { name: "redactObservabilityLaneRecord", file: "src/lifecycle/observabilityLane.ts", run: redactObservabilityLaneRecord as RuntimeFunction,
    fixture: (path, root) => ({ marker: "retained", workspace: root, componentAttribution: [{ marker: "component", refs: [path] }] }) }
];
function publicArgs(pipeline: typeof pipelines[number], path: unknown, root: unknown): unknown[] {
  const input = pipeline.fixture(path, root);
  return pipeline.name === "redactReasoningMemoryItem" ? [input, root] : [input];
}
function observeDeep(value: unknown, accesses: string[], at = "input"): unknown {
  if (!value || typeof value !== "object") return value;
  return new Proxy(value, { get(target, key, receiver) {
    accesses.push(at + "." + String(key));
    return observeDeep(Reflect.get(target, key, receiver), accesses, at + "." + String(key));
  }});
}
for (const pipeline of pipelines) {
  const before = modules.get(pipeline.file)!.before[pipeline.name];
  describe("actual public redaction pipeline: " + pipeline.name, () => {
    for (const fixture of pathCases) {
      it(fixture.label, () => {
        expect(outcome(pipeline.run, ...publicArgs(pipeline, fixture.make(), workspace)))
          .toEqual(outcome(before, ...publicArgs(pipeline, fixture.make(), workspace)));
      });
    }
    it("preserves malformed workspace errors and optional path guards", () => {
      for (const root of [undefined, null, true, 0, {}, Symbol("workspace")]) {
        for (const path of [null, "", workspace + "/file.json", {}]) {
          expect(outcome(pipeline.run, ...publicArgs(pipeline, path, root)))
            .toEqual(outcome(before, ...publicArgs(pipeline, path, root)));
        }
      }
    });
    it("preserves property access order through the actual exported pipeline", () => {
      const originalAccesses: string[] = [], currentAccesses: string[] = [];
      const originalArgs = publicArgs(pipeline, workspace + "/file.json", workspace).map(arg => observeDeep(arg, originalAccesses));
      const currentArgs = publicArgs(pipeline, workspace + "/file.json", workspace).map(arg => observeDeep(arg, currentAccesses));
      expect(outcome(pipeline.run, ...currentArgs)).toEqual(outcome(before, ...originalArgs));
      expect(currentAccesses).toEqual(originalAccesses);
    });
    it("public privacy: keeps absolute workspace paths out of exported artifacts", () => {
      const result = pipeline.run(...publicArgs(pipeline, workspace + "/file.json", workspace));
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(workspace);
      expect(serialized).toContain("$WORKSPACE/file.json");
      expect(serialized).toContain('"marker":"retained"');
      expect(serialized).toBe(JSON.stringify(before(...publicArgs(pipeline, workspace + "/file.json", workspace))));
    });
  });
}
it("retains private-state suppression and distinct secret-snippet policies", () => {
  const org = pipelines[3].run(...publicArgs(pipelines[3], workspace + "/file.json", workspace)) as {
    roles: Array<{ privateGraderStateRef: { path: string; sha256: string | null }; publicStateRef: { sha256: string } }> };
  expect(org.roles[0].privateGraderStateRef).toEqual({ path: "$PRIVATE/grader-state.json", visibility: "private", sha256: null });
  expect(org.roles[0].publicStateRef.sha256).toBe("public-hash");
  const fixer = pipelines[2].run(...publicArgs(pipelines[2], workspace + "/file.json", workspace)) as { callRecords: Array<{ outputSnippet: string }> };
  expect(fixer.callRecords[0].outputSnippet).toBe("[REDACTED] [REDACTED] tail");
});
it("preserves required empty-path resolution and nullable early return", () => {
  expect(redactWorkspacePath("", process.cwd())).toBe("$WORKSPACE");
  expect(redactNullableWorkspacePath("", undefined as unknown as string)).toBeNull();
});

it("freezes every actual source byte outside the declared imports and private bodies", () => {
  expect(map.sourceCommit).toBe("49f81c339ca4f62da2e9342f2dd846e3610c90ae");
  expect(map.files).toHaveLength(10);
  expect(map.files.filter(row => row.nullable)).toHaveLength(6);
  expect(map.compiledContracts).toHaveLength(15);
  for (const row of map.files) {
    const original = archived(row), current = readFileSync(resolve(row.originalPath), "utf8");
    expect(hash(current)).toBe(row.currentSha256);
    const ast = ts.createSourceFile(row.originalPath, original, ts.ScriptTarget.ES2022, true);
    const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === row.name);
    expect(nodes).toHaveLength(1);
    const node = nodes[0] as ts.FunctionDeclaration;
    expect(node.getText(ast)).toBe(row.originalDeclaration);
    expect(node.body!.getText(ast)).toBe(row.beforeBody);
    expect(current).toBe(row.importLine + original.slice(0, node.body!.getStart(ast)) + row.afterBody + original.slice(node.body!.end));
    expect(restoreWorkspacePathSharing(row.originalPath, current)).toBe(original);
    expect(() => restoreWorkspacePathSharing(row.originalPath, current + "\n")).toThrow("Source changed beyond declared");
    expect(() => restoreWorkspacePathSharing(row.originalPath, current.replace(row.afterBody, row.beforeBody))).toThrow();
  }
  expect(hash(readFileSync(resolve(map.utility.path)))).toBe(map.utility.sha256);
  expect(map.packageManifestSha256).toBe(ARCHIVED_PACKAGE_MANIFEST_SHA256);
  expect(packageEntriesSha256(readFileSync(resolve("package.json")))).toBe(ARCHIVED_PACKAGE_ENTRIES_SHA256);
  for (const contract of map.compiledContracts) {
    expect(hash(readFileSync(resolve(contract.file)))).toBe(contract.sha256);
  }
});
it("retains all previous freeze assertions with only the bounded reversal inserted", () => {
  for (const row of map.priorTests) {
    const bytes = readFileSync(resolve(row.archivePath));
    expect(hash(bytes)).toBe(row.sha256);
    const original = bytes.toString("utf8");
    const expected = row.originalPath.includes("/helpers/")
      ? 'import { restoreWorkspacePathSharing } from "./restoreWorkspacePathSharing.js";\n' + original.replace(
        "  const row = manifest.files.find(value => value.originalPath === file);",
        "  source = restoreWorkspacePathSharing(file, source);\n  const row = manifest.files.find(value => value.originalPath === file);")
      : 'import { restoreWorkspacePathSharing } from "./helpers/restoreWorkspacePathSharing.js";\n' + original.replace(
        'current = readFileSync(resolve(row.originalPath), "utf8");',
        'current = restoreWorkspacePathSharing(row.originalPath, readFileSync(resolve(row.originalPath), "utf8"));');
    expect(readFileSync(resolve(row.originalPath), "utf8"))
      .toBe(row.originalPath.includes("/helpers/") ? expected : withPackageEntriesPin(expected));
  }
});

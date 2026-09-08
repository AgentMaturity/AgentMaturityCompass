import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { redactComparisonText } from "../src/benchmarks/harnessComparisonArtifacts.js";

type Snapshot = {
  schemaVersion: number; path: string; limitBytes: number;
  status: "captured" | "unavailable"; reason: string | null;
  original: { sha256: string; bytes: number } | null;
  retained: { sourceText: string; sha256: string; bytes: number } | null;
  fidelity: { atAdapterCapture: string; digestScope: string; publicationMayRedact: boolean } | null;
};
const common = pathToFileURL(resolve("examples/harness-comparison/codingCommon.mjs")).href;
const { captureCodingOutputSnapshot } = await import(common) as {
  captureCodingOutputSnapshot(workspace: string, options?: { secrets?: readonly string[] }): Snapshot;
};
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture(bytes: string | Buffer = "export const value = 17;\n") {
  const root = mkdtempSync(join(tmpdir(), "amc-coding-output-")); directories.push(root);
  const repo = join(root, "repo"), path = join(repo, "solution.mjs"); mkdirSync(repo); writeFileSync(path, bytes);
  return { root, repo, path };
}

// Captures real temporary files. No harness, model, oracle or target output
// module is executed. Execution remains deferred until the batch ends.
describe("bounded final coding source receipt", () => {
  test.each(["", "export const text = 'λ雪🧭';\n", "\ufeffexport const bom = true;\r\n", "x".repeat(128 * 1024)])(
    "retains exact valid UTF-8 bytes including empty/BOM/boundary content (case %#)", source => {
      const trial = fixture(source), before = readFileSync(trial.path);
      const snapshot = captureCodingOutputSnapshot(trial.root);
      expect(snapshot).toEqual({ schemaVersion: 1, path: "repo/solution.mjs", limitBytes: 128 * 1024,
        status: "captured", reason: null, original: { sha256: hash(before), bytes: before.length },
        retained: { sourceText: source, sha256: hash(before), bytes: before.length },
        fidelity: { atAdapterCapture: "byte-identical", digestScope: "before-outer-publication-redaction", publicationMayRedact: true } });
      expect(Buffer.from(snapshot.retained!.sourceText, "utf8")).toEqual(before);
      expect(readFileSync(trial.path)).toEqual(before);
    }
  );

  test("records source as text without importing its top-level effects or inventing an oracle verdict", () => {
    const trial = fixture(), marker = join(trial.root, "must-not-exist");
    const source = `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)},'executed'); throw new Error('not a repair');`;
    writeFileSync(trial.path, source);
    const snapshot = captureCodingOutputSnapshot(trial.root);
    expect(snapshot.status).toBe("captured"); expect(snapshot.retained?.sourceText).toBe(source);
    expect(existsSync(marker)).toBe(false); expect(snapshot).not.toHaveProperty("verdict"); expect(snapshot).not.toHaveProperty("passed");
  });

  test("an exited child can leave final source even when its execution failed", async () => {
    const trial = fixture(), writer = join(trial.root, "fixture-writer.mjs"), finalSource = "export const finalValue = 23;\n";
    writeFileSync(writer, `import {writeFileSync} from 'node:fs'; setTimeout(()=>{writeFileSync(${JSON.stringify(trial.path)},${JSON.stringify(finalSource)});process.exitCode=17;},10);`);
    const { invoke } = await import(common) as { invoke(cli: string, args: string[], options: {
      cwd: string; env: Record<string, string>; timeoutMs: number;
    }): Promise<{ exitCode: number; signal: string | null; timedOut: boolean }> };
    const execution = await invoke(writer, [], { cwd: trial.root, env: { LANG: "C.UTF-8" }, timeoutMs: 3000 });
    expect(execution).toMatchObject({ exitCode: 17, signal: null, timedOut: false });
    const snapshot = captureCodingOutputSnapshot(trial.root);
    expect(snapshot.status).toBe("captured"); expect(snapshot.retained?.sourceText).toBe(finalSource);
    expect(snapshot.original?.sha256).toBe(hash(finalSource));
  });

  test.each(["file-missing", "repository-missing", "file-symlink", "repository-symlink", "file-not-regular", "file-too-large"])(
    "returns an explicit unavailable result without partial source: %s", kind => {
      const trial = fixture();
      if (kind === "file-missing") rmSync(trial.path);
      else if (kind === "repository-missing") rmSync(trial.repo, { recursive: true });
      else if (kind === "file-too-large") writeFileSync(trial.path, Buffer.alloc(128 * 1024 + 1, 65));
      else if (kind === "file-not-regular") { rmSync(trial.path); mkdirSync(trial.path); }
      else if (kind === "file-symlink") {
        const target = join(trial.root, "secret-outside.mjs"); writeFileSync(target, "must never retain linked bytes");
        rmSync(trial.path); symlinkSync(target, trial.path);
      } else {
        rmSync(trial.repo, { recursive: true }); const target = join(trial.root, "elsewhere"); mkdirSync(target);
        writeFileSync(join(target, "solution.mjs"), "must never retain linked repository bytes"); symlinkSync(target, trial.repo);
      }
      const snapshot = captureCodingOutputSnapshot(trial.root);
      expect(snapshot).toMatchObject({ status: "unavailable", reason: kind, original: null, retained: null, fidelity: null });
      expect(JSON.stringify(snapshot)).not.toContain("must never retain");
    }
  );

  test.each([Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xe2, 0x82]), Buffer.from([0xed, 0xa0, 0x80])])(
    "invalid UTF-8 preserves only the original byte identity, never replacement text (case %#)", bytes => {
      const trial = fixture(bytes), snapshot = captureCodingOutputSnapshot(trial.root);
      expect(snapshot).toMatchObject({ status: "unavailable", reason: "invalid-utf8", original: { sha256: hash(bytes), bytes: bytes.length }, retained: null });
      expect(JSON.stringify(snapshot)).not.toContain("�");
    }
  );

  test("known synthetic secrets are removed before text serialization, with truthful separate digests", () => {
    const credential = 'synthetic-key-"quoted"\\line\nend';
    const source = `// ${credential}\n// overlapping synthetic-key marker\nexport const value = 17;\n`;
    const trial = fixture(source), snapshot = captureCodingOutputSnapshot(trial.root, { secrets: ["synthetic-key", credential] });
    const retained = "// [REDACTED]\n// overlapping [REDACTED] marker\nexport const value = 17;\n";
    expect(snapshot).toMatchObject({ status: "captured", original: { sha256: hash(source), bytes: Buffer.byteLength(source) },
      retained: { sourceText: retained, sha256: hash(retained), bytes: Buffer.byteLength(retained) },
      fidelity: { atAdapterCapture: "synthetic-secrets-redacted", digestScope: "before-outer-publication-redaction", publicationMayRedact: true } });
    expect(snapshot.original!.sha256).not.toBe(snapshot.retained!.sha256);
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-key");
    expect(Object.keys(snapshot.retained!).sort()).toEqual(["bytes", "sha256", "sourceText"]);
    expect(readFileSync(trial.path, "utf8")).toBe(source);
  });

  test("redaction expansion remains bounded and does not publish a truncated or encoded substitute", () => {
    const source = "x".repeat(128 * 1024), trial = fixture(source);
    const snapshot = captureCodingOutputSnapshot(trial.root, { secrets: ["x"] });
    expect(snapshot).toMatchObject({ status: "unavailable", reason: "retained-text-too-large",
      original: { sha256: hash(source), bytes: 128 * 1024 }, retained: null, fidelity: null });
    expect(JSON.stringify(snapshot).length).toBeLessThan(1024);
  });

  test("outer publication redaction remains possible and distinguishable from adapter-stage fidelity", () => {
    const secret = "publication-only-synthetic-token", source = `// ${secret}\nexport const value = 17;`;
    const trial = fixture(source), snapshot = captureCodingOutputSnapshot(trial.root);
    const published = JSON.parse(redactComparisonText(JSON.stringify(snapshot), [secret])) as Snapshot;
    expect(published.retained!.sourceText).not.toContain(secret);
    expect(published.original).toEqual(snapshot.original);
    expect(published.fidelity).toEqual({ atAdapterCapture: "byte-identical", digestScope: "before-outer-publication-redaction", publicationMayRedact: true });
    expect(hash(published.retained!.sourceText)).not.toBe(published.retained!.sha256);
  });

  test.each(["replace", "append", "read-error"] as const)("refuses a changed/unreadable file and closes the actual descriptor: %s", mode => {
    const trial = fixture(), runner = join(trial.root, "snapshot-race.mjs");
    // Controlled fault at the read boundary, using real fds/files. No production
    // test hook, concurrent timing gamble or replacement snapshot implementation.
    writeFileSync(runner, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const path=fs.realpathSync(${JSON.stringify(trial.path)}), mode=${JSON.stringify(mode)};
const originalRead=fs.readSync, originalOpen=fs.openSync, originalClose=fs.closeSync;
let ownedFd=null, closed=false, changed=false;
fs.openSync=function(file,...args){const fd=originalOpen.call(this,file,...args);if(file===path && ownedFd===null)ownedFd=fd;return fd;};
fs.closeSync=function(fd){if(fd===ownedFd)closed=true;return originalClose.call(this,fd);};
fs.readSync=function(fd,...args){
 if(fd===ownedFd && mode==='read-error'){const e=new Error('private fixture detail must not publish');e.code='EACCES';throw e;}
 const count=originalRead.call(this,fd,...args);
 if(fd===ownedFd && !changed && count){changed=true;if(mode==='replace'){fs.renameSync(path,path+'.old');fs.writeFileSync(path,'export const value = 17;\\n');}else fs.appendFileSync(path,'x');}
 return count;
};syncBuiltinESMExports();
const {captureCodingOutputSnapshot}=await import(${JSON.stringify(common)});
process.stdout.write(JSON.stringify({snapshot:captureCodingOutputSnapshot(${JSON.stringify(trial.root)}),closed})+'\\n');`);
    const result = spawnSync(process.execPath, [runner], { encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024, env: { LANG: "C.UTF-8" } });
    expect(result.error, result.stderr).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    const observed = JSON.parse(result.stdout) as { snapshot: Snapshot; closed: boolean };
    expect(observed.closed).toBe(true);
    expect(observed.snapshot).toMatchObject({ status: "unavailable", reason: mode === "read-error" ? "file-unreadable" : "file-changed", retained: null });
    expect(result.stdout).not.toContain("private fixture detail");
  });

  test("the actual adapter reports not-captured when setup never reaches a native child", () => {
    const trial = fixture();
    const result = spawnSync(process.execPath, [resolve("examples/harness-comparison/codingAdapter.mjs")], {
      cwd: trial.root, encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024, env: { LANG: "C.UTF-8" }
    });
    expect(result.error, result.stderr).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout) as { outputSnapshot: unknown; modelRequests: number };
    expect(output.outputSnapshot).toEqual({ schemaVersion: 1, path: "repo/solution.mjs", status: "not-captured", reason: "native-process-not-completed" });
    expect(output.modelRequests).toBe(0);
  });
});

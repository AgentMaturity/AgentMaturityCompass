import { spawnSync } from "node:child_process";
import { verify } from "node:crypto";
import { copyFileSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync,
  rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { auditBinderVerifyForApi } from "../src/audit/auditApi.js";
import { buildIndustryPackAudit, signIndustryPackAudit, verifyIndustryPackAuditFile,
  type IndustryPackAudit } from "../src/domains/industryPackAudit.js";
import { getPackById } from "../src/domains/industryPacks.js";
import { loadTrustContext, verifierReportSchema, type TrustContext } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyPem } from "./helpers/trustContext.js";

const roots: string[] = [], records: Array<Record<string, unknown>> = [];
const secretMarker = "P0-20 owned outside content must not be disclosed";
const errorSchema = z.object({ code: z.string(), message: z.string() });
const resultSchema = z.object({ ok: z.boolean(), errors: z.array(errorSchema), fileSha256: z.string(),
  report: verifierReportSchema }).passthrough();
let producer: string, home: string, pinFile: string, publicPem: string, trust: TrustContext;
let signed: IndustryPackAudit, bytes: Buffer, evidenceRoot: string;

type Row = { path: string; kind: string; mode: number; inode: number; links: number; modifiedMs: number;
  size?: number; sha256?: string; target?: string };
function snapshot(root: string): Row[] {
  const rows: Row[] = [];
  const walk = (path: string) => {
    const stat = lstatSync(path);
    const row: Row = { path: relative(root, path) || ".", kind: stat.isDirectory() ? "directory" : stat.isSymbolicLink()
      ? "symlink" : stat.isFile() ? "file" : stat.isFIFO() ? "fifo" : "other", mode: stat.mode, inode: stat.ino,
      links: stat.nlink, modifiedMs: stat.mtimeMs };
    if (stat.isSymbolicLink()) row.target = readlinkSync(path);
    else if (stat.isFile()) { row.size = stat.size; row.sha256 = sha256Hex(readFileSync(path)); }
    rows.push(row);
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root); return rows;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-p0-20-reader-")); roots.push(root);
  const workspace = join(root, "workspace"), exports = join(workspace, ".amc/audit/binders/exports");
  mkdirSync(exports, { recursive: true }); mkdirSync(join(root, "outside"));
  writeFileSync(join(root, "outside/sentinel.txt"), secretMarker, { mode: 0o600 });
  return { root, workspace, exports };
}

function put(file: string) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes, { mode: 0o600 }); return file; }
function observe(name: string, f: ReturnType<typeof fixture>, file: string, context = trust) {
  const before = snapshot(f.root);
  let result: unknown, error: unknown;
  try { result = auditBinderVerifyForApi({ workspace: f.workspace, file, trust: context }); } catch (caught) { error = caught; }
  const after = snapshot(f.root);
  records.push({ name, file, before, after, result, error: error instanceof Error ? error.message : error ?? null });
  expect(after).toEqual(before); expect(error).toBeUndefined();
  return resultSchema.parse(result);
}

function genuine(result: unknown) {
  const actual = resultSchema.parse(result);
  expect(actual).toMatchObject({ ok: true, signed: true, checksumOk: true, signatureOk: true,
    keyFingerprint: `sha256:${sha256Hex(publicPem)}`, fileSha256: sha256Hex(bytes), errors: [] });
  expect(actual.report).toMatchObject({ trusted: true, integrity: { status: "pass" }, issuerAdmission: { status: "pass" },
    satisfaction: { status: "not-evaluated" }, completeness: { status: "not-evaluated" } });
  expect(actual.audit).toMatchObject({ schemaVersion: "amc.industry-pack-audit/3",
    overall: { claimKind: "self_reported", eligibleLevel: 1 } });
}

function unreadable(result: unknown) {
  const actual = resultSchema.parse(result);
  expect(actual).toMatchObject({ ok: false, signed: false, checksumOk: false, signatureOk: false, keyFingerprint: null,
    audit: null, fileSha256: "0".repeat(64), errors: [{ code: "UNREADABLE", message: "cannot read audit file" }] });
  expect(actual.errors).toHaveLength(1);
  expect(actual.report).toMatchObject({ trusted: false, integrity: { status: "fail", errors: ["UNREADABLE: cannot read audit file"] },
    issuerAdmission: { status: "not-evaluated", signatures: [] } });
  const encoded = JSON.stringify(actual);
  expect(encoded).not.toContain(secretMarker); expect(encoded).not.toContain(signed.receiptHash);
  expect(encoded).not.toMatch(/ENOENT|EACCES|ELOOP|errno|syscall/);
}

beforeAll(() => {
  expect([22, 24]).toContain(Number(process.versions.node.split(".")[0]));
  evidenceRoot = process.env.AMC_P0_20_READER_EFFECTS_DIR ?? mkdtempSync(join(tmpdir(), "amc-p0-20-reader-evidence-"));
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  const state = mkdtempSync(join(tmpdir(), "amc-p0-20-audit-producer-")); roots.push(state);
  producer = join(state, "producer"); home = join(state, "operator-home"); mkdirSync(home);
  vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_AGENT_ID", "");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-p0-20-audit-reader-fixture");
  initWorkspace({ workspacePath: producer, trustBoundaryMode: "isolated" });
  // Capture the operator key before constructing or signing an artifact; never pin its embedded candidate key.
  publicPem = workspaceKeyPem(producer, "auditor"); pinFile = join(home, "operator-auditor.pub");
  writeFileSync(pinFile, publicPem); copyFileSync(pinFile, join(evidenceRoot, "operator-auditor.pub"));
  trust = loadTrustContext({ amcHome: home, env: {}, pubkey: { path: pinFile, purposes: ["artifact-seal"] } });
  const pack = getPackById("clinical-trials"); if (!pack) throw new Error("The current clinical-trials fixture pack is required.");
  const responses = Object.fromEntries(pack.questions.map(q => [q.id, 3]));
  signed = signIndustryPackAudit(producer, buildIndustryPackAudit({ pack, responses, now: Date.now() }));
  expect(signed.signature).not.toBeNull();
  const { signature, ...unsigned } = signed;
  expect(signature).not.toBeNull();
  const digest = sha256Hex(canonicalize(unsigned)); expect(signature!.digestSha256).toBe(digest);
  expect(verify(null, Buffer.from(digest, "hex"), publicPem, Buffer.from(signature!.signature, "base64"))).toBe(true);
  bytes = Buffer.from(JSON.stringify(signed, null, 2) + "\n"); writeFileSync(join(evidenceRoot, "genuine-audit.json"), bytes);
  const inputs = ["src/audit/auditApi.ts", "src/domains/industryPackAudit.ts", "src/audit/binderVerifier.ts",
    "src/audit/binderSigner.ts", "dist/audit/auditApi.js", "dist/trust/trustContext.js"]
    .map(path => ({ path, sha256: sha256Hex(readFileSync(resolve(path))) }));
  records.push({ kind: "inputs", inputs, publicPinSha256: sha256Hex(publicPem), artifactSha256: sha256Hex(bytes),
    pinCapturedBeforeArtifact: true, independentEd25519DigestVerification: true, node: process.version, executable: process.execPath });
}, 60_000);

afterAll(() => {
  if (evidenceRoot) writeFileSync(join(evidenceRoot, "reader-effects.json"), JSON.stringify(records, null, 2) + "\n");
  if (producer) lockVault(producer);
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("P0-20 actual industry-pack audit helper containment", () => {
  test("admits a genuine /3 signed file under an independently captured operator pin", () => {
    const f = fixture(), file = put(join(f.exports, "signed.json"));
    genuine(verifyIndustryPackAuditFile({ file, trust })); genuine(observe("genuine", f, file));
  });

  test("admits a regular nested file without promoting self-reported answers", () => {
    const f = fixture(); genuine(observe("nested", f, put(join(f.exports, "nested/signed.json"))));
  });

  test("preserves a caller workspace-root alias while rejecting internal links separately", () => {
    const f = fixture(); put(join(f.exports, "signed.json"));
    const alias = join(f.root, "workspace-alias"); symlinkSync(f.workspace, alias);
    genuine(observe("workspace-alias", { ...f, workspace: alias }, join(alias, ".amc/audit/binders/exports/signed.json")));
  });

  test("does not let the embedded genuine signer vouch for itself without the operator pin", () => {
    const f = fixture(), file = put(join(f.exports, "signed.json"));
    const unknown = loadTrustContext({ amcHome: home, env: {} });
    const actual = observe("unpinned", f, file, unknown);
    expect(actual).toMatchObject({ ok: false, checksumOk: true, signatureOk: true });
    expect(actual.report).toMatchObject({ trusted: false, integrity: { status: "pass" }, issuerAdmission: { status: "fail" } });
    expect(actual.errors).toContainEqual({ code: "SIGNER_UNTRUSTED", message: expect.any(String) });
  });

  test("refuses an otherwise genuine and verifiable signed file outside exports", () => {
    const f = fixture(), file = put(join(f.root, "outside/signed.json"));
    genuine(verifyIndustryPackAuditFile({ file, trust })); unreadable(observe("outside", f, file));
  });

  test("returns the same generic unreadable semantics for a missing file", () => {
    const f = fixture(); unreadable(observe("missing", f, join(f.exports, "missing.json")));
  });

  test.each([false, true])("refuses a leaf symlink to an owned signed file, outside=%s", outside => {
    const f = fixture(), target = put(join(outside ? join(f.root, "outside") : f.exports, "target.json"));
    const file = join(f.exports, "linked.json"); symlinkSync(target, file);
    unreadable(observe(`leaf-link-${outside}`, f, file));
  });

  test("refuses a hardlinked signed file after its regular control was admitted", () => {
    const f = fixture(), target = put(join(f.exports, "target.json")); genuine(observe("hardlink-control", f, target));
    const file = join(f.exports, "hardlinked.json"); linkSync(target, file);
    unreadable(observe("hardlink", f, file));
  });

  test("refuses a directory without reading it as an audit", () => {
    const f = fixture(), file = join(f.exports, "directory.json"); mkdirSync(file);
    unreadable(observe("directory", f, file));
  });

  test("rejects a genuine path escaping exports through parent segments", () => {
    const f = fixture(), target = put(join(f.exports, "../escaped.json")); genuine(verifyIndustryPackAuditFile({ file: target, trust }));
    unreadable(observe("path-escape", f, join(f.exports, "../escaped.json")));
  });

  test.each([false, true])("refuses a static parent link to an owned genuine signed file, outside=%s", outside => {
    const f = fixture(), directory = outside ? join(f.root, "outside") : join(f.exports, "real-directory");
    const target = put(join(directory, "signed.json")); genuine(verifyIndustryPackAuditFile({ file: target, trust }));
    const alias = join(f.exports, "linked-directory"); symlinkSync(directory, alias);
    unreadable(observe(`parent-link-${outside}`, f, join(alias, "signed.json")));
  });

  test("refuses an exports-directory parent link even when its signed target is genuine", () => {
    const f = fixture(), target = put(join(f.root, "outside/signed.json")); genuine(verifyIndustryPackAuditFile({ file: target, trust }));
    rmSync(f.exports, { recursive: true }); symlinkSync(join(f.root, "outside"), f.exports);
    unreadable(observe("exports-parent-link", f, join(f.exports, "signed.json")));
  });

  test.each(["not JSON", "null"])("refuses readable malformed content %j using its current verifier result", content => {
    const f = fixture(), file = join(f.exports, "malformed.json"); writeFileSync(file, content);
    const actual = observe(`malformed-${content}`, f, file);
    expect(actual.ok).toBe(false); expect(actual.errors).toContainEqual({ code: "VERIFY_EXCEPTION", message: expect.any(String) });
    expect(actual.report).toMatchObject({ trusted: false, integrity: { status: "fail" } });
    expect(JSON.stringify(actual)).not.toContain(secretMarker);
  });

  test("refuses a malformed signature block without inventing a readable-file UNREADABLE verdict", () => {
    const f = fixture(), file = join(f.exports, "malformed-signature.json");
    writeFileSync(file, JSON.stringify({ ...signed, signature: "owned invalid signature" }));
    const actual = observe("malformed-signature", f, file);
    expect(actual).toMatchObject({ ok: false, checksumOk: true, signatureOk: false });
    expect(actual.errors).toContainEqual({ code: "SIGNATURE_INVALID", message: "the signature block is malformed" });
  });

  test("refuses changed signed body bytes under the same independently captured pin", () => {
    const f = fixture(), file = join(f.exports, "tampered.json");
    writeFileSync(file, JSON.stringify({ ...signed, packName: "owned altered pack name" }));
    const actual = observe("tampered", f, file);
    expect(actual).toMatchObject({ ok: false, checksumOk: false, signatureOk: false });
    expect(actual.errors.map(error => error.code)).toEqual(expect.arrayContaining(["CHECKSUM_MISMATCH", "DIGEST_MISMATCH", "SIGNATURE_INVALID"]));
  });

  test("refuses an actual FIFO without a writer using a bounded compiled-reader child", () => {
    const f = fixture(), file = join(f.exports, "fifo.json");
    const made = spawnSync("/usr/bin/mkfifo", [file], { encoding: "utf8", timeout: 5_000 });
    expect(made.error).toBeUndefined(); expect(made.status).toBe(0); expect(lstatSync(file).isFIFO()).toBe(true);
    const before = snapshot(f.root), compiled = resolve("dist/audit/auditApi.js"), compiledTrust = resolve("dist/trust/trustContext.js");
    const code = `import { auditBinderVerifyForApi } from ${JSON.stringify(pathToFileURL(compiled).href)};\n`
      + `import { loadTrustContext } from ${JSON.stringify(pathToFileURL(compiledTrust).href)};\n`
      + `const trust = loadTrustContext({ amcHome: ${JSON.stringify(home)}, env: {}, pubkey: { path: ${JSON.stringify(pinFile)}, purposes: ["artifact-seal"] } });\n`
      + `console.log(JSON.stringify(auditBinderVerifyForApi({ workspace: ${JSON.stringify(f.workspace)}, file: ${JSON.stringify(file)}, trust })));\n`;
    const actual = spawnSync(process.execPath, ["--input-type=module", "--eval", code], { encoding: "utf8", timeout: 8_000,
      killSignal: "SIGKILL", cwd: f.workspace, env: { HOME: home, AMC_HOME: home, PATH: dirname(process.execPath), LANG: "C", TZ: "UTC" } });
    const after = snapshot(f.root);
    writeFileSync(join(evidenceRoot, "fifo-stdout.json"), actual.stdout ?? "");
    writeFileSync(join(evidenceRoot, "fifo-stderr.log"), actual.stderr ?? "");
    records.push({ name: "fifo-child", file, before, after, executable: process.execPath, codeSha256: sha256Hex(code),
      compiledSha256: sha256Hex(readFileSync(compiled)), exit: actual.status, signal: actual.signal,
      error: actual.error?.message ?? null, stdoutSha256: sha256Hex(actual.stdout ?? ""), stderrSha256: sha256Hex(actual.stderr ?? "") });
    expect(after).toEqual(before); expect(actual.error).toBeUndefined(); expect(actual.signal).toBeNull();
    expect(actual.status).toBe(0); expect(actual.stderr).toBe("");
    unreadable(JSON.parse(actual.stdout) as unknown);
  }, 15_000);
});

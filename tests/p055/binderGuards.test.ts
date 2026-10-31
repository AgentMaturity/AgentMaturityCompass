/**
 * P0-55 cases 8 and 14 (P0-20 residual): Studio's binder verify reads only a regular, singly linked file whose real
 * path lies under the workspace's own `.amc/audit/binders/exports` with no link on the way; anything else is the
 * generic UNREADABLE with `audit: null`. The CLI's auditBinderVerifyFile still verifies a file anywhere.
 */
import { execFileSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { auditBinderVerifyFile, auditBinderVerifyForApi } from "../../src/audit/auditApi.js";
import { buildIndustryPackAudit, signIndustryPackAudit } from "../../src/domains/industryPackAudit.js";
import { getPackById } from "../../src/domains/industryPacks.js";
import { loadTrustContext, type TrustContext } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { initWorkspace } from "../../src/workspace.js";
import { workspaceKeyPem } from "../helpers/trustContext.js";

let state: string;
let bytes: Buffer;
let trust: TrustContext;
let root: string;
let workspace: string;
let exportsDir: string;
let outside: string;

beforeAll(() => {
  state = mkdtempSync(join(tmpdir(), "amc-p055-binder-state-"));
  const home = join(state, "home"); mkdirSync(home);
  vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_VAULT_PASSPHRASE", "p055-binder-fixture"); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(state, "checkpoints"));
  const producer = join(state, "producer");
  initWorkspace({ workspacePath: producer, trustBoundaryMode: "isolated" });
  const pin = join(home, "auditor.pub"); writeFileSync(pin, workspaceKeyPem(producer, "auditor"));
  trust = loadTrustContext({ amcHome: home, env: {}, pubkey: { path: pin, purposes: ["artifact-seal"] } });
  const pack = getPackById("clinical-trials")!;
  const signed = signIndustryPackAudit(producer, buildIndustryPackAudit({ pack, responses: Object.fromEntries(pack.questions.map((q) => [q.id, 3])), now: Date.now() }));
  bytes = Buffer.from(JSON.stringify(signed, null, 2) + "\n");
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(state, { recursive: true, force: true }); });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "amc-p055-binder-"));
  workspace = join(root, "workspace"); exportsDir = join(workspace, ".amc/audit/binders/exports"); outside = join(root, "outside");
  mkdirSync(exportsDir, { recursive: true }); mkdirSync(outside);
  writeFileSync(join(outside, "a.json"), bytes); writeFileSync(join(exportsDir, "inside.json"), bytes);
  return () => rmSync(root, { recursive: true, force: true });
});

const api = (file: string, ws = workspace) => auditBinderVerifyForApi({ workspace: ws, file, trust });
function unreadable(result: ReturnType<typeof api>) {
  expect(result).toMatchObject({ ok: false, audit: null, errors: [{ code: "UNREADABLE" }] });
  expect(result.errors).toHaveLength(1);
}
function verifies(result: ReturnType<typeof api>) {
  expect(result).toMatchObject({ ok: true, fileSha256: sha256Hex(bytes), errors: [] });
}

test("a regular file inside exports, or in a subdirectory, verifies; its fileSha256 is the digest of the bytes read", () => {
  verifies(api(join(exportsDir, "inside.json")));
  mkdirSync(join(exportsDir, "sub")); writeFileSync(join(exportsDir, "sub/a.json"), bytes);
  verifies(api(join(exportsDir, "sub/a.json")));
});

test("a workspace path given through a symlink still verifies", () => {
  const alias = join(root, "alias"); symlinkSync(workspace, alias);
  verifies(api(join(alias, ".amc/audit/binders/exports/inside.json"), alias));
});

test.each([["outside", () => join(outside, "a.json")], ["inside", () => join(exportsDir, "inside.json")]])(
  "exports/link.json, a symlink to a file %s exports, is UNREADABLE", (_where, target) => {
    symlinkSync(target(), join(exportsDir, "link.json"));
    unreadable(api(join(exportsDir, "link.json")));
  });

test.each([["outside", () => outside], ["inside", () => join(exportsDir, "real")]])(
  "exports/dirlink/a.json through a directory link %s exports is UNREADABLE", (_where, target) => {
    mkdirSync(join(exportsDir, "real")); writeFileSync(join(exportsDir, "real/a.json"), bytes);
    symlinkSync(target(), join(exportsDir, "dirlink"));
    unreadable(api(join(exportsDir, "dirlink/a.json")));
  });

test.each(["exports", "binders", "audit"])("a %s directory that is a symlink to an outside directory is UNREADABLE", (level) => {
  const linked = level === "exports" ? exportsDir : level === "binders" ? join(workspace, ".amc/audit/binders") : join(workspace, ".amc/audit");
  const target = join(root, `moved-${level}`);
  rmSync(linked, { recursive: true, force: true });
  mkdirSync(join(target, ...(level === "audit" ? ["binders", "exports"] : level === "binders" ? ["exports"] : [])), { recursive: true });
  writeFileSync(join(target, ...(level === "audit" ? ["binders", "exports"] : level === "binders" ? ["exports"] : []), "a.json"), bytes);
  symlinkSync(target, linked);
  unreadable(api(join(exportsDir, "a.json")));
});

test("a hard link inside exports is UNREADABLE", () => {
  linkSync(join(outside, "a.json"), join(exportsDir, "hard.json"));
  unreadable(api(join(exportsDir, "hard.json")));
});

test("a FIFO inside exports is UNREADABLE and returns at once", () => {
  execFileSync("/usr/bin/mkfifo", [join(exportsDir, "pipe.json")]);
  const started = Date.now();
  unreadable(api(join(exportsDir, "pipe.json")));
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("a missing file is UNREADABLE at auditBinderVerifyForApi (the Studio route answers 404 before it)", () => {
  unreadable(api(join(exportsDir, "missing.json")));
});

test("the CLI's auditBinderVerifyFile still verifies a file outside exports", () => {
  verifies(auditBinderVerifyFile({ file: join(outside, "a.json"), trust }));
});

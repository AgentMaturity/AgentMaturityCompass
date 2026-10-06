import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { admitKey, loadTrustContext, signTrustList, workspaceSelfTrust, type KeyPurpose } from "../../src/trust/index.js";
import { initWorkspace } from "../../src/workspace.js";
import { distrustEntry, listEntry, testKey, trustList } from "./trustFixtures.js";

const NOW = new Date("2026-10-06T00:00:00.000Z");
const root = testKey();
const auditor = testKey();
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-trust-home-"));
  dirs.push(dir);
  return dir;
}
function put(file: string, value: unknown): string {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  return file;
}
function codeOf(run: () => unknown): string {
  try { run(); } catch (error) { return (error as { code?: string }).code ?? (error as Error).message; }
  return "no error";
}
const roots = (...keyIds: string[]) => ({ type: "amc.trust-roots", version: 1, roots: keyIds });
const shipped = JSON.parse(readFileSync("src/trust/amc-distrust.json", "utf8")) as { distrust: unknown[] };

describe("loadTrustContext", () => {
  it("starts from the built-in distrust list, with no pins and no allow flags from the environment", () => {
    const context = loadTrustContext({ amcHome: home(), now: NOW,
      env: { AMC_ALLOW_UNPINNED: "1", AMC_ALLOW_UNANCHORED: "1", ALLOW_UNPINNED: "true" } });
    expect(context).toEqual({ mode: "pinned", asOf: NOW, lists: [], explicitPins: [], distrust: shipped.distrust,
      allowUnpinned: false, allowUnanchored: false });
    expect(loadTrustContext({ amcHome: home(), allowUnpinned: true, allowUnanchored: true })).toMatchObject({ allowUnpinned: true, allowUnanchored: true });
  });

  it("pins a --pubkey file for the purposes the command checks", () => {
    const pub = put(join(home(), "auditor.pub"), auditor.publicKeyPem);
    const purposes: KeyPurpose[] = ["artifact-seal", "revocation-list"];
    expect(loadTrustContext({ amcHome: home(), pubkey: { path: pub, purposes } }).explicitPins)
      .toEqual([{ keyId: auditor.keyId, purposes, origin: `--pubkey ${pub}` }]);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => loadTrustContext({ amcHome: home(), pubkey: { path: put(join(home(), "rsa.pub"), rsa), purposes } })).toThrow("Ed25519");
  });

  it("pins the key, not the PEM text: a CRLF --pubkey file gets the canonical key id, and a private key is refused", () => {
    const purposes: KeyPurpose[] = ["artifact-seal"];
    const crlf = put(join(home(), "auditor.pub"), auditor.publicKeyPem.replaceAll("\n", "\r\n"));
    expect(loadTrustContext({ amcHome: home(), pubkey: { path: crlf, purposes } }).explicitPins.map(pin => pin.keyId)).toEqual([auditor.keyId]);
    const key = put(join(home(), "auditor.key"), auditor.privateKeyPem);
    expect(() => loadTrustContext({ amcHome: home(), pubkey: { path: key, purposes } })).toThrow("Ed25519");
  });

  it("pins ledger-row from --expect-monitor, else from AMC_EXPECTED_MONITOR_FINGERPRINT", () => {
    const fingerprint = "a".repeat(64);
    expect(loadTrustContext({ amcHome: home(), expectMonitor: fingerprint, env: { AMC_EXPECTED_MONITOR_FINGERPRINT: "b".repeat(64) } }).explicitPins)
      .toEqual([{ keyId: fingerprint, purposes: ["ledger-row"], origin: "--expect-monitor" }]);
    expect(loadTrustContext({ amcHome: home(), env: { AMC_EXPECTED_MONITOR_FINGERPRINT: "B".repeat(64) } }).explicitPins)
      .toEqual([{ keyId: "b".repeat(64), purposes: ["ledger-row"], origin: "AMC_EXPECTED_MONITOR_FINGERPRINT" }]);
    expect(() => loadTrustContext({ amcHome: home(), expectMonitor: "abc" })).toThrow("64 hex");
  });

  it("loads the default trust list under pinned roots from the AMC home and merges its distrust entries", () => {
    const amcHome = home();
    const listDistrust = distrustEntry(testKey().keyId);
    const list = trustList([listEntry(auditor)], { distrust: [listDistrust] });
    put(join(amcHome, "trust", "amc-trust-list.json"), signTrustList(list, root.privateKeyPem));
    put(join(amcHome, "trust", "trust-roots.json"), roots(root.keyId));
    const context = loadTrustContext({ amcHome, now: NOW });
    expect(context.lists).toEqual([list]);
    expect(context.distrust).toEqual([...shipped.distrust, listDistrust]);
    expect(admitKey({ publicKeyPem: auditor.publicKeyPem, purpose: "artifact-seal", signature: "s", context }).status).toBe("admitted");
  });

  it("uses --trust-list and --trust-root instead of the defaults", () => {
    const amcHome = home();
    put(join(amcHome, "trust", "amc-trust-list.json"), signTrustList(trustList([]), testKey().privateKeyPem));
    const file = put(join(home(), "ops.json"), signTrustList(trustList([listEntry(auditor)], { listId: "ops" }), root.privateKeyPem));
    const context = loadTrustContext({ amcHome, now: NOW, trustLists: [file], trustRoots: [root.keyId] });
    expect(context.lists.map(list => list.listId)).toEqual(["ops"]);
  });

  it("fails hard, never skips, on a bad signature, an expired list, missing roots or a malformed roots file", () => {
    const signed = signTrustList(trustList([listEntry(auditor)]), root.privateKeyPem);
    const file = put(join(home(), "list.json"), signed);
    expect(codeOf(() => loadTrustContext({ amcHome: home(), now: NOW, trustLists: [file], trustRoots: [testKey().keyId] }))).toBe("TRUST_LIST_SIGNATURE_INVALID");
    expect(codeOf(() => loadTrustContext({ amcHome: home(), now: new Date("2028-01-01T00:00:00.000Z"), trustLists: [file], trustRoots: [root.keyId] })))
      .toBe("TRUST_LIST_EXPIRED");
    expect(codeOf(() => loadTrustContext({ amcHome: home(), now: NOW, trustLists: [file] }))).toBe("TRUST_LIST_SIGNATURE_INVALID");
    const amcHome = home();
    put(join(amcHome, "trust", "amc-trust-list.json"), signed);
    put(join(amcHome, "trust", "trust-roots.json"), { ...roots(root.keyId), extra: true });
    expect(codeOf(() => loadTrustContext({ amcHome, now: NOW }))).toBe("TRUST_LIST_INVALID");
    expect(codeOf(() => loadTrustContext({ amcHome: home(), now: NOW, trustLists: [join(home(), "missing.json")], trustRoots: [root.keyId] })))
      .toBe("TRUST_LIST_INVALID");
  });
});

describe("workspaceSelfTrust", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-trust-self-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const self = workspaceSelfTrust(workspace);
  const pem = (role: string) => readFileSync(join(workspace, ".amc", "keys", `${role}_ed25519.pub`), "utf8");
  const admit = (role: string, purpose: KeyPurpose) => admitKey({ publicKeyPem: pem(role), purpose, signature: "s", context: self });

  it("admits the workspace's own role keys for their role purposes, labelled workspace-self", () => {
    expect(self).toMatchObject({ mode: "workspace-self", lists: [], distrust: shipped.distrust, allowUnpinned: false, allowUnanchored: false });
    expect(admit("auditor", "artifact-seal")).toMatchObject({ status: "admitted", source: "workspace-self" });
    expect(admit("monitor", "ledger-row")).toMatchObject({ status: "admitted", source: "workspace-self" });
    expect(admit("monitor", "artifact-seal").status).toBe("not-pinned"); // a pin admits only for its purposes (step 6 order)
  });

  it("never admits a workspace key as an independent or third-party issuer", () => {
    for (const purpose of ["independent-attestation", "evidence-authority", "trust-list-root", "release", "notary"] as const) {
      expect(admit("auditor", purpose).status, purpose).not.toBe("admitted");
    }
  });
});

describe("package surface", () => {
  it("exports ./trust and ships the built-in distrust file", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { exports: Record<string, unknown>; files: string[] };
    expect(pkg.exports["./trust"]).toEqual({ types: "./dist/trust/index.d.ts", import: "./dist/trust/index.js" });
    expect(pkg.files).toContain("dist/trust/amc-distrust.json");
    expect(readFileSync("scripts/copy-build-assets.mjs", "utf8")).toContain("src/trust/amc-distrust.json");
    expect(shipped).toEqual({ distrust: [] });
  });
});

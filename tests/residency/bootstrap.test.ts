/** P2-01 bootstrap notary /pubkey GET (src/bootstrap/bootstrap.ts: admission before the notary secret write, recheck in fetchNotaryPubkey). */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runBootstrap, type BootstrapOptions } from "../../src/bootstrap/bootstrap.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { getVaultSecret } from "../../src/vault/vault.js";
import { blockResidency, closeFixtures, listen, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

const vaultHook = vi.hoisted(() => ({ onSet: (_workspace: string, _key: string) => undefined as void }));
vi.mock("../../src/vault/vault.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/vault/vault.js")>();
  return { ...actual, setVaultSecret: (workspace: string, key: string, value: string) => { vaultHook.onSet(workspace, key); return actual.setVaultSecret(workspace, key, value); } };
});

vi.setConfig({ testTimeout: 120_000 });
let root: string, notary: Listener;
beforeEach(async () => {
  root = tempRoot();
  notary = await listen((_req, res) => { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ pubkeyPem: "x", fingerprint: "y" })); });
  vaultHook.onSet = () => undefined;
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

const options = (workspace: string, notaryBaseUrl: string): BootstrapOptions => ({ workspace, vaultPassphrase: "bootstrap-residency-passphrase",
  ownerUsername: "owner", ownerPassword: "bootstrap-residency-owner", lanMode: false, bind: "127.0.0.1", studioPort: 0, allowedCidrs: [],
  enableNotary: true, notaryBaseUrl, notaryRequiredAttestation: "SOFTWARE", notaryAuthSecret: "notary-secret" });
const blockedWorkspace = (name: string): string => {
  const workspace = join(root, name);
  mkdirSync(workspace);
  blockResidency(workspace);
  return workspace;
};

describe("bootstrap notary", () => {
  test("a denied /pubkey endpoint is refused before the notary secret is written and before any socket", async () => {
    const workspace = blockedWorkspace("blocked");
    await expect(runBootstrap(options(workspace, notary.url))).rejects.toBeInstanceOf(EgressBlocked);
    expect(notary.connections).toBe(0);
    expect(getVaultSecret(workspace, "notary/auth")).toBeNull();
  });

  test("the captured workspace is read once and rechecked before the GET: blocked after admission, the GET is refused", async () => {
    let reads = 0;
    const workspace = join(root, "open");
    const blocked = blockedWorkspace("blocked-carrier");
    const opts = { ...options(workspace, notary.url) };
    Object.defineProperty(opts, "workspace", { enumerable: true, get: () => { reads += 1; return reads === 1 ? workspace : blocked; } });
    vaultHook.onSet = (target, key) => { if (key === "notary/auth") blockResidency(target); };
    await expect(runBootstrap(opts)).rejects.toBeInstanceOf(EgressBlocked);
    expect(reads).toBe(1);
    // The first admission passed (the secret was written), the GET's own recheck refused it.
    expect(getVaultSecret(workspace, "notary/auth")).toBe("notary-secret");
    expect(notary.connections).toBe(0);
  });

  test("a 3xx from the notary fails the bootstrap, never followed", async () => {
    const redirector = await redirectTo(notary);
    await expect(runBootstrap(options(join(root, "redirected"), redirector.url))).rejects.toThrow(/notary \/pubkey failed \(302\)/);
    expect(notary.connections).toBe(0);
  });
});

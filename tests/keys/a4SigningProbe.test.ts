import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Live roles come from signed users.yaml and session records; this test is about the signing probe, so the actor is an
// OWNER by fiat. Everything else (approval policy, vault, key set, revocation list, ledger) is real.
vi.mock("../../src/a4/a4Identity.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Identity.js")>()),
  liveRolesFor: () => ["OWNER"]
}));

import { a4ProjectsRoot } from "../../src/a4/a4Blobs.js";
import { openA4Store } from "../../src/a4/a4Store.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import type { A4Principal } from "../../src/contracts/v1/a4Project.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { encodeSignedRevocationList, nextRevocationList, readAnchoredRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

const owner = {
  key: "LOCAL_USER:owner", authSource: "LOCAL_USER", userId: "owner", username: "owner", roles: ["OWNER"], admission: "native_login_token",
  identityCheck: "users_yaml", provenance: { usersYamlSignerFingerprint: null, createdTs: null, createdBy: null }
} as unknown as A4Principal;

describe("A4 fail-early probes check the purpose keys their signers use (P1-08 review, agreed with the A4 lane)", () => {
  it("a refused receipt key stops project creation before any A4 side effect, though the monitor role key still works", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-a4-probe-"));
    roots.push(root);
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    initApprovalPolicy(root);
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS }); // receipt gets a key of its own
    // A validly signed newer key revocation list names the receipt key in use (amc keys revoke refuses a key in use).
    const location = { workspace: root, rel: ".amc/keys/revocations.signed.json", listId: "keys:default", trustedPublicKeyPems: getPurposeKeyHistory(root, "revocation-list") };
    const current = readAnchoredRevocationList(location)!;
    const list = nextRevocationList("keys:default", { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
      [{ id: ed25519KeyId(getSigningPublicKeyPem(root, "receipt"))!, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise: receipt" }], 0);
    writeFileSync(join(root, location.rel), encodeSignedRevocationList(signRevocationList(list, getSigningKey(root, "revocation-list"))));
    expect(getSigningKey(root, "ledger-row")).toBeTruthy(); // what the old probe (the monitor role key) checked
    expect(() => getSigningKey(root, "receipt")).toThrow(/revoked/);

    const store = openA4Store(root);
    try {
      expect(() => store.createProject({ actor: owner, agentId: "agent-1", name: "Probe", hostedRouter: false })).toThrow(/revoked/);
    } finally {
      store.close();
    }
    expect(existsSync(a4ProjectsRoot(root))).toBe(false); // no lock, project key or blob was written
  });
});

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// What these tests are about is the key probe at the top of each Activate effect. Everything the effects check before it
// (the project's live state, the readiness evaluation, the engine grant's quorum) is stubbed; the vault, the purpose keys,
// the key revocation list, the lease store and the approval engine are real.
const stub = vi.hoisted(() => ({ state: null as unknown, chain: [] as unknown[], head: null as unknown }));
vi.mock("../../src/a4/a4Gates.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Gates.js")>()),
  livePrincipal: (_store: unknown, call: { principal: unknown }) => call.principal,
  loadA4State: () => stub.state,
  evaluateFor: () => ({ readiness: {} }),
  assertAllowed: () => undefined,
  signedA4Floor: () => ({})
}));
vi.mock("../../src/a4/a4Effects.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Effects.js")>()),
  sweepA4Effects: () => [],
  verifyAndConsumeEffect: () => ["LOCAL_USER:approver"]
}));
vi.mock("../../src/a4/a4Readiness.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Readiness.js")>()),
  isRegulated: () => false
}));
vi.mock("../../src/a4/a4Store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Store.js")>()),
  openA4Store: () => ({ readHead: () => stub.head, readChain: () => stub.chain, close: () => undefined })
}));

// a4Rollback first: the A4 modules import one another in a cycle, and a module first reached inside a mock factory's
// importOriginal would bind the unmocked a4Gates and a4Effects.
import { rollbackRelease } from "../../src/a4/a4Rollback.js";
import { assertStagingRevocable } from "../../src/a4/a4Deploy.js";
import { PRODUCTION_LEASE_EFFECT } from "../../src/a4/a4Package.js";
import type { A4Store } from "../../src/a4/a4Store.js";
import type { A4EffectContext } from "../../src/a4/a4Effects.js";
import { ROLLBACK_EFFECT_ID } from "../../src/a4/spec/activate.js";
import { loadApprovalConsumed } from "../../src/approvals/approvalChainStore.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import type { A4Principal } from "../../src/contracts/v1/a4Project.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
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
const PROJECT = "a4p_probe";
const RELEASE = `a4r_${"1".repeat(32)}`;
const STAGING_LEASE = "lease_staging_probe";
const link = (seq: number, kind: string, body: Record<string, unknown>) => ({ seq, kind, body });

/**
 * A workspace where `revoked` has a key of its own (apart from the other auditor-role purposes) and a validly signed newer
 * key revocation list names it; every other purpose key stays usable.
 */
function workspaceWithRevokedKey(revoked: "revocation-list" | "artifact-seal" = "revocation-list"): string {
  const root = mkdtempSync(join(tmpdir(), "amc-a4-activate-probe-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  initApprovalPolicy(root);
  rotatePurposeKeys({ workspace: root, purposes: [revoked], passphrase: PASS });
  const location = { workspace: root, rel: ".amc/keys/revocations.signed.json", listId: "keys:default", trustedPublicKeyPems: getPurposeKeyHistory(root, "revocation-list") };
  const current = readAnchoredRevocationList(location)!;
  const list = nextRevocationList("keys:default", { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
    [{ id: ed25519KeyId(getSigningPublicKeyPem(root, revoked))!, kind: "key", revokedAt: new Date().toISOString(), reason: `key-compromise: ${revoked}` }], 0);
  writeFileSync(join(root, location.rel), encodeSignedRevocationList(signRevocationList(list, getSigningKey(root, "revocation-list"))));
  const kept = revoked === "revocation-list" ? "artifact-seal" : "revocation-list";
  expect(getSigningKey(root, kept)).toBeTruthy(); // artifact-seal is what the auditor-role probes checked
  expect(() => getSigningKey(root, revoked)).toThrow(/revoked/);
  return root;
}
const leaseRevocationsWritten = (root: string): boolean => existsSync(join(root, ".amc", "studio", "leases", "revocations.signed.json"));

describe("Activate's key probes name the purpose their later signer uses (P1-08 x P1-62)", () => {
  it("A4_PACKAGE and A4_RECORD sign with the artifact-seal key, which the store and gate probes check", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-a4-activate-probe-"));
    roots.push(root);
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal"], passphrase: PASS }); // apart from the other auditor purposes
    for (const kind of ["A4_PACKAGE", "A4_RECORD"] as const) {
      const signed = signDigestWithVault({ workspace: root, kind, digestHex: "a".repeat(64) });
      expect(Buffer.from(signed.envelope!.pubkeyB64, "base64").toString("utf8")).toBe(getSigningPublicKeyPem(root, "artifact-seal"));
    }
  });

  it("a DENY of the deployment approval refuses before anything while the key that revokes its staging lease is revoked", () => {
    const root = workspaceWithRevokedKey();
    const chain = [
      link(1, "RELEASE", { releaseId: RELEASE, leases: [{ leaseId: STAGING_LEASE, scope: "staging" }] }),
      link(2, "GATE_REQUESTED", { gateId: "gate_completion", stage: "activate", gate: "completion" })
    ];
    const store = { workspace: root, readChain: () => chain } as unknown as A4Store;
    expect(() => assertStagingRevocable(store, PROJECT, "gate_completion")).toThrow(/A4_VAULT_LOCKED|revoked/);
    expect(leaseRevocationsWritten(root)).toBe(false);
  });

  it("the production-lease effect refuses before it revokes or mints a lease while the revocation-list key is revoked", async () => {
    const root = workspaceWithRevokedKey();
    const gate = { gate_id: "gate_completion", stage: "activate", gate: "completion", revision_no: 1 };
    stub.chain = [
      link(1, "RELEASE", { releaseId: RELEASE, leases: [{ leaseId: STAGING_LEASE, scope: "staging" }], rollbackReleaseId: null }),
      link(2, "GATE_REQUESTED", { gateId: gate.gate_id, stage: "activate", gate: "completion" }),
      link(3, "GATE_CONSUMED", { gateId: gate.gate_id, stage: "activate", gate: "completion" })
    ];
    stub.head = { stage: "activate", step: "completion_approved", revision_no: 1 };
    const answers = Object.entries({ leaseScopes: ["gateway:llm"], modelAllowlist: ["gpt-probe"], budgetRequestsPerMinute: "10", budgetTokensPerMinute: "1000",
      stagingRoutes: ["/v1/chat"], productionRoutes: ["/v1/chat"] }).map(([questionId, value]) => ({ questionId, value, source: "user", answeredAtRevision: 1, dependencyDigest: "0".repeat(64) }));
    const state = { project: { project_id: PROJECT, agent_id: "default", workspace_id: "default", stage: "activate" }, chain: stub.chain,
      revisions: [{ revision_no: 1, stage: "activate", spec_json: JSON.stringify({ answers }) }], gates: [gate], decisions: [], members: [], refs: [], effects: [] };
    const ctx = { workspace: root, state, gate, executionId: "exec_probe", approvalRequestId: "apr_probe", heartbeat: () => undefined, principal: owner } as unknown as A4EffectContext;
    await expect(PRODUCTION_LEASE_EFFECT.run(ctx)).rejects.toThrow(/revoked/);
    expect(existsSync(join(root, "a4-releases", PROJECT, `${RELEASE}.leases.json`))).toBe(false); // nothing minted or journaled
    expect(leaseRevocationsWritten(root)).toBe(false);
  });

  it.each(["revocation-list", "artifact-seal"] as const)("a rollback refuses before its EFFECT_STARTED, grant, freeze, restore or revocation while the %s key is revoked", (revoked) => {
    const root = workspaceWithRevokedKey(revoked);
    const gate = { gate_id: "gate_direction", stage: "activate", gate: "direction", revision_no: 1 };
    const intent = { releaseId: RELEASE, toReleaseId: null, confirmManifestId: null, environment: "staging" };
    stub.state = {
      project: { project_id: PROJECT, agent_id: "default", workspace_id: "default", stage: "activate", head_seq: 3 },
      chain: [
        link(1, "RELEASE", { releaseId: RELEASE, executionId: "exec_release", leases: [{ leaseId: STAGING_LEASE, scope: "staging" }] }),
        link(2, "EFFECT_STARTED", { executionId: "exec_release", gateId: gate.gate_id, effectId: "a4e_release" }),
        link(3, "EFFECT_GATE_OPENED", { gateId: gate.gate_id, effect: ROLLBACK_EFFECT_ID, approvalRequestId: "apr_rollback", intent,
          preview: { leaseIds: [STAGING_LEASE], preparedCommands: [], target: "compose", restore: {} } })
      ],
      revisions: [], gates: [gate], decisions: [], members: [], refs: [], effects: []
    };
    const transition = vi.fn(() => { throw new Error("EFFECT_STARTED reached"); });
    const store = { workspace: root, readChain: () => (stub.state as { chain: unknown[] }).chain, transition } as unknown as A4Store;
    expect(() => rollbackRelease(store, PROJECT, RELEASE, { principal: owner,
      body: { expectedHeadSeq: 3, toReleaseId: null, confirmManifestId: null, environment: "staging", reason: "probe the signing keys first", clientRequestId: "req_probe" } })).toThrow(/A4_VAULT_LOCKED|revoked/);
    expect(transition).not.toHaveBeenCalled();
    expect(loadApprovalConsumed({ workspace: root, agentId: "default", approvalRequestId: "apr_rollback" })).toBeNull();
    expect(leaseRevocationsWritten(root)).toBe(false);
  });
});

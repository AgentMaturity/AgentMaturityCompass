import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  delegationChainDigest, extendDelegation, issueRootDelegation, verifyChain, type ChainTrust, type DelegationChain, type UnsignedLink
} from "../../src/agent/delegationChain.js";
import { revokedLeaseIdSet, revokeLease } from "../../src/leases/leaseStore.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P2-25: a delegation chain is signed by the lease authority, starts at a human or a declared service, and only
 * narrows: scopes, resources and notAfter shrink or stay, and depth stays within DEFAULT_MAX_DELEGATION_DEPTH (3).
 */
let workspace = "";
const HOUR = 3_600_000;
const now = Date.now();
const trust = (overrides: Partial<ChainTrust> = {}): ChainTrust =>
  ({ workspace, declaredServices: ["svc-nightly"], revokedIds: new Set(), ...overrides });
const delegate = (agentId: string, runAs = agentId) => ({ agentId, runAs, spiffeId: null });
const root: UnsignedLink = {
  principal: { kind: "human", providerId: "okta", subject: "00u-alice" }, delegate: delegate("payments"),
  scopes: ["READ_ONLY", "WRITE_LOW"], resources: ["ledger:acme", "crm:acme"], purpose: "month-end close",
  notBefore: now - 60_000, notAfter: now + HOUR, approvalId: null
};
const child = (agentId: string, overrides: Partial<Omit<UnsignedLink, "principal">> = {}): Omit<UnsignedLink, "principal"> => ({
  delegate: delegate("payments", agentId), scopes: ["READ_ONLY"], resources: ["ledger:acme"], purpose: null,
  notBefore: now - 60_000, notAfter: now + HOUR / 2, approvalId: null, ...overrides
});

beforeAll(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-delegation-chain-")));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "delegation-chain-fixture-passphrase");
  initWorkspace({ workspacePath: workspace, agentId: "payments", trustBoundaryMode: "isolated" });
});
afterAll(() => {
  lockVault(workspace);
  rmSync(workspace, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("roots", () => {
  it("starts at an authenticated human", async () => {
    const chain = await issueRootDelegation(workspace, root, trust());
    expect(verifyChain(chain, trust())).toEqual({ ok: true });
    expect(chain.digest).toBe(delegationChainDigest(chain.links));
  });

  it("starts at a declared service, and refuses one the trust config does not declare", async () => {
    const service = { ...root, principal: { kind: "service" as const, serviceId: "svc-nightly" } };
    await expect(issueRootDelegation(workspace, service, trust())).resolves.toBeDefined();
    await expect(issueRootDelegation(workspace, { ...service, principal: { kind: "service", serviceId: "svc-unknown" } }, trust()))
      .rejects.toThrow(/svc-unknown is not declared/);
  });

  it("refuses an agent as the root", async () => {
    await expect(issueRootDelegation(workspace, { ...root, principal: { kind: "agent", ...delegate("payments") } }, trust()))
      .rejects.toThrow(/must start at a human or a declared service/);
  });
});

describe("narrowing", () => {
  it("extends to a child that only narrows", async () => {
    const chain = await extendDelegation(workspace, await issueRootDelegation(workspace, root, trust()), child("payments/sub-1"), trust());
    expect(chain.links.map((link) => link.depth)).toEqual([0, 1]);
    expect(chain.links[1]!.principal).toEqual({ kind: "agent", ...delegate("payments") });
    expect(verifyChain(chain, trust())).toEqual({ ok: true });
  });

  it.each([
    ["wider scopes", { scopes: ["READ_ONLY", "WRITE_HIGH"] }, /widens its parent's scopes/],
    ["wider resources", { resources: ["ledger:acme", "bank:acme"] }, /widens its parent's resources/],
    ["a later notAfter", { notAfter: now + 2 * HOUR }, /outlives its parent/]
  ])("refuses %s", async (_name, overrides, reason) => {
    const parent = await issueRootDelegation(workspace, root, trust());
    await expect(extendDelegation(workspace, parent, child("payments/sub-1", overrides), trust())).rejects.toThrow(reason);
  });

  it("refuses depth 4", async () => {
    let chain = await issueRootDelegation(workspace, root, trust());
    for (const depth of [1, 2, 3]) chain = await extendDelegation(workspace, chain, child(`payments/d${depth}`), trust());
    expect(verifyChain(chain, trust())).toEqual({ ok: true });
    await expect(extendDelegation(workspace, chain, child("payments/d4"), trust())).rejects.toThrow(/depth 4 exceeds maxDepth 3/);
  });
});

describe("integrity", () => {
  async function twoLinks(): Promise<DelegationChain> {
    return extendDelegation(workspace, await issueRootDelegation(workspace, root, trust()), child("payments/sub-1"), trust());
  }

  it("fails a tampered link even when the digest is recomputed", async () => {
    const chain = await twoLinks();
    const links = chain.links.map((link, index) => index === 1 ? { ...link, scopes: ["READ_ONLY", "WRITE_LOW"] } : link);
    expect(verifyChain({ links, digest: chain.digest }, trust())).toMatchObject({ ok: false, reason: /digest does not match/ });
    expect(verifyChain({ links, digest: delegationChainDigest(links) }, trust())).toMatchObject({ ok: false, reason: /not signed by this workspace's lease authority/ });
  });

  it("refuses an unsigned link an agent appended", async () => {
    const chain = await twoLinks();
    const forged = { ...chain.links[1]!, linkId: `dlink_${"a".repeat(32)}`, parentLinkId: chain.links[1]!.linkId, depth: 2,
      principal: { kind: "agent" as const, ...chain.links[1]!.delegate }, delegate: delegate("payments", "payments/forged"),
      signature: Buffer.from("agent-says-so").toString("base64url") };
    const links = [...chain.links, forged];
    expect(verifyChain({ links, digest: delegationChainDigest(links) }, trust())).toMatchObject({ ok: false, reason: /not signed/ });
  });

  it("refuses a revoked link and an expired one", async () => {
    const chain = await twoLinks();
    expect(verifyChain(chain, trust({ nowMs: now + HOUR }))).toMatchObject({ ok: false, reason: /is not valid now/ });
    revokeLease(workspace, `link:${chain.links[0]!.linkId}`, "delegation fixture revocation");
    expect(verifyChain(chain, trust({ revokedIds: revokedLeaseIdSet(workspace) }))).toMatchObject({ ok: false, reason: /is revoked/ });
  });
});

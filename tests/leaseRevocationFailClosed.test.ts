import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import {
  leaseRevocationPaths,
  revokeLease,
  revokedLeaseIdSet,
  signLeaseRevocations,
  verifyLeaseRevocationsSignature
} from "../src/leases/leaseStore.js";
import { ensureLeaseRevocationStore, issueLeaseForCli, verifyLeaseForCli } from "../src/leases/leaseCli.js";

/**
 * The revocation store is what stands between a revoked lease and its
 * continued use. Three fail-open defects lived around it:
 *
 *   `revokedLeaseIdSet` answered an unverifiable store with an EMPTY SET, so
 *   tampering with one file un-revoked every lease ever revoked;
 *
 *   `verifyLeaseForCli` built its set from `loadLeaseRevocations` without
 *   checking the store's signature at all, so `amc lease verify` honoured a
 *   tampered list;
 *
 *   `ensureLeaseRevocationStore` SIGNED the store and then verified the
 *   signature it had just written — laundering any tampering and making the
 *   CLI's "signature invalid" branch unreachable.
 *
 * These tests pin the closed-fail behavior of all three.
 */

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-lease-revocation-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "lease-revocation-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Sign a healthy store holding one revocation, then corrupt the file body. */
function tamperedStore(workspace: string): void {
  revokeLease(workspace, "lease-gone", "test");
  const paths = leaseRevocationPaths(workspace);
  const body = JSON.parse(readFileSync(paths.file, "utf8"));
  writeFileSync(paths.file, JSON.stringify({ ...body, revocations: [] }, null, 2));
}

describe("revokedLeaseIdSet fails closed", () => {
  test("returns the revoked ids from a healthy signed store", () => {
    const workspace = newWorkspace();
    revokeLease(workspace, "lease-a", "compromised");
    expect(revokedLeaseIdSet(workspace)).toEqual(new Set(["lease-a"]));
  });

  test("throws on a tampered store instead of answering an empty set", () => {
    const workspace = newWorkspace();
    tamperedStore(workspace);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(false);
    expect(() => revokedLeaseIdSet(workspace)).toThrow(/revocation/i);
  });
});

describe("verifyLeaseForCli checks the store it trusts", () => {
  function issue(workspace: string): string {
    return issueLeaseForCli({
      workspace,
      workspaceId: workspaceIdFromDirectory(workspace),
      agentId: "agent-under-test",
      ttl: "1h",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 10,
      tpm: 1000,
      maxCostUsdPerDay: null,
      workOrderId: undefined
    }).token;
  }

  test("accepts a valid lease and rejects a revoked one on a healthy store", () => {
    const workspace = newWorkspace();
    const token = issue(workspace);
    expect(verifyLeaseForCli({ workspace, token }).ok).toBe(true);

    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    revokeLease(workspace, payload.leaseId, "test revocation");
    const rejected = verifyLeaseForCli({ workspace, token });
    expect(rejected.ok).toBe(false);
  });

  test("refuses to verify anything against a tampered revocation store", () => {
    const workspace = newWorkspace();
    const token = issue(workspace);
    tamperedStore(workspace);
    const result = verifyLeaseForCli({ workspace, token });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/revocation/i);
  });
});

describe("ensureLeaseRevocationStore does not launder tampering", () => {
  test("bootstraps a missing store as signed and valid", () => {
    const workspace = newWorkspace();
    const ensured = ensureLeaseRevocationStore(workspace);
    expect(ensured.signatureValid).toBe(true);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(true);
  });

  test("reports a tampered store invalid and leaves the evidence in place", () => {
    const workspace = newWorkspace();
    tamperedStore(workspace);
    const sigBefore = readFileSync(leaseRevocationPaths(workspace).sig, "utf8");

    const ensured = ensureLeaseRevocationStore(workspace);
    expect(ensured.signatureValid).toBe(false);
    // The stale signature is evidence of what was tampered with; re-signing
    // over it would certify the tampered content as authentic.
    expect(readFileSync(leaseRevocationPaths(workspace).sig, "utf8")).toBe(sigBefore);
  });

  test("re-running on a healthy store keeps it valid", () => {
    const workspace = newWorkspace();
    signLeaseRevocations(workspace);
    expect(ensureLeaseRevocationStore(workspace).signatureValid).toBe(true);
  });
});

describe("resignLeaseRevocationsForCli is the one deliberate repair path", () => {
  test("re-signing a tampered store restores verification and reports what was vouched for", async () => {
    const { resignLeaseRevocationsForCli } = await import("../src/leases/leaseCli.js");
    const workspace = newWorkspace();
    tamperedStore(workspace);
    const result = resignLeaseRevocationsForCli(workspace);
    expect(result.wasValid).toBe(false);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(true);
    // The tampered content emptied the list; the report says so.
    expect(result.revocationCount).toBe(0);
  });
});

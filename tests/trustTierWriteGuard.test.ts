import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P0-18 step 5: the ledger refuses a tier the producer cannot have. Only AMC's runtime writes OBSERVED, and ATTESTED
 * needs an attestation record that readers re-verify against the pinned trust list.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE = "trust-tier-guard-test-passphrase";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-tier-guard-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const ATTESTATION = { keyId: "a".repeat(64), sigB64: "c2ln", digestSha256: sha256Hex("bundle"), attestedBy: "Example Audit LLP" };

function append(dir: string, meta: Record<string, unknown>, withReceipt = false): void {
  const ledger = openLedger(dir);
  try {
    const sessionId = `guard-${Math.random().toString(36).slice(2)}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "/bin/true", binarySha256: "0".repeat(64) });
    const input = { sessionId, runtime: "unknown" as const, eventType: "metric" as const, payload: "{}", payloadExt: "json" as const, inline: true, meta };
    if (withReceipt) {
      ledger.appendEvidenceWithReceipt({ ...input, receipt: { kind: "tool_result", agentId: "default", providerId: "fixture", model: null, bodySha256: sha256Hex("{}") } });
    } else {
      ledger.appendEvidence(input);
    }
  } finally {
    ledger.close();
  }
}

describe("the ledger derives allowed tiers from provenance", () => {
  test("ATTESTED without an attestation record is refused, for every producer", () => {
    const dir = workspace();
    for (const meta of [{ trustTier: "ATTESTED" }, { source: "attested_ingest", trustTier: "ATTESTED" },
      { source: "manual", trustTier: "ATTESTED", attestation: { kind: "self_attested" } }]) {
      expect(() => append(dir, meta), JSON.stringify(meta)).toThrow(/trust tier ATTESTED is not allowed for .* evidence; tiers derive from provenance \(docs\/EVIDENCE_TRUST\.md\)/);
    }
  });

  test("OBSERVED and OBSERVED_HARDENED are refused for imported, manual, external and synthetic evidence", () => {
    const dir = workspace();
    expect(() => append(dir, { source: "eval_import", trustTier: "OBSERVED" }))
      .toThrow("trust tier OBSERVED is not allowed for import evidence; tiers derive from provenance (docs/EVIDENCE_TRUST.md)");
    expect(() => append(dir, { source: "webhook", trustTier: "OBSERVED_HARDENED" })).toThrow(/OBSERVED_HARDENED is not allowed for external-report/);
    expect(() => append(dir, { source: "operator", trustTier: "OBSERVED" })).toThrow(/not allowed for manual/);
    expect(() => append(dir, { provenance: "dogfood", trustTier: "OBSERVED" })).toThrow(/not allowed for synthetic/);
    expect(() => append(dir, { source: "eval_import", trustTier: "OBSERVED" }, true)).toThrow(/not allowed for import/);
  });

  test("SELF_REPORTED, runtime OBSERVED and an attested row with its record are accepted", () => {
    const dir = workspace();
    expect(() => append(dir, { source: "eval_import", trustTier: "SELF_REPORTED" })).not.toThrow();
    expect(() => append(dir, { source: "gateway", trustTier: "OBSERVED" })).not.toThrow();
    expect(() => append(dir, { trustTier: "OBSERVED_HARDENED" }, true)).not.toThrow();
    expect(() => append(dir, { source: "attested_ingest", trustTier: "ATTESTED", attestation: ATTESTATION })).not.toThrow();
    expect(() => append(dir, { source: "eval_import" })).not.toThrow();
  });
});

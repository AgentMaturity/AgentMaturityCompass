import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * A tier nobody recognises must be refused, not quietly downgraded.
 *
 * `trustTier` rides in `AppendEvidenceInput.meta`, which is
 * `Record<string, unknown>` — nothing checked it against the union in
 * src/types.ts. `trustTierFromMeta` (src/diagnostic/gates.ts:27) returns
 * `SELF_REPORTED` for any unrecognised value, so a typo like "OBSERVED_HARDNED"
 * or a lower-case "observed" did not fail anywhere: it silently became the
 * weakest tier at scoring time, arbitrarily far from the write that caused it.
 *
 * Refusing on write is the only place the mistake is still attributable.
 */
const PASS = "trust-tier-validation-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-tier-validate-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  return dir;
}

let seq = 0;

function appendWith(dir: string, trustTier: unknown): string {
  const ledger = openLedger(dir);
  const sessionId = `tier-validate-session-${(seq += 1)}`;
  ledger.startSession({ sessionId, runtime: "any", binaryPath: "/bin/true", binarySha256: "0".repeat(64) });
  return ledger.appendEvidence({
    sessionId,
    runtime: "any",
    eventType: "metric",
    payload: JSON.stringify({ n: 1 }),
    payloadExt: "json",
    inline: true,
    meta: { metricKey: "k", value: 1, trustTier }
  });
}

describe("trustTier is validated where it is written", () => {
  it("refuses a tier outside the union", () => {
    const dir = workspace();
    expect(() => appendWith(dir, "OBSERVED_HARDNED")).toThrow(/trustTier/i);
  });

  it("refuses a tier that is only the wrong case", () => {
    // The most likely real mistake, and the one that reads most convincingly
    // right at the call site.
    const dir = workspace();
    expect(() => appendWith(dir, "observed")).toThrow(/trustTier/i);
  });

  it("refuses a non-string tier", () => {
    const dir = workspace();
    expect(() => appendWith(dir, 3)).toThrow(/trustTier/i);
  });

  it("accepts every tier in the union, and rows with no tier at all", () => {
    // Absence stays legal: plenty of rows are not evidence about an agent, and
    // forcing a tier onto them would be its own false claim.
    const dir = workspace();
    for (const tier of ["OBSERVED", "OBSERVED_HARDENED", "ATTESTED", "SELF_REPORTED"]) {
      expect(() => appendWith(dir, tier), tier).not.toThrow();
    }
    expect(() => appendWith(dir, undefined)).not.toThrow();
  });
});

describe("the receipt-bearing writer is guarded too", () => {
  it("refuses an invalid tier through appendEvidenceWithReceipt", () => {
    // This method builds its own row instead of going through
    // `buildEvidenceInsert`, so a guard placed only there would miss every
    // receipt-bearing writer -- assurance audits included.
    const dir = workspace();
    const ledger = openLedger(dir);
    const sessionId = "tier-receipt-session";
    ledger.startSession({ sessionId, runtime: "any", binaryPath: "/bin/true", binarySha256: "0".repeat(64) });

    expect(() =>
      ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "any",
        eventType: "metric",
        payload: JSON.stringify({ n: 1 }),
        payloadExt: "json",
        inline: true,
        meta: { metricKey: "k", value: 1, trustTier: "observed" },
        receipt: { kind: "tool_result", agentId: "payments-agent", providerId: "fixture", model: null,
          bodySha256: sha256Hex(JSON.stringify({ n: 1 })) }
      })
    ).toThrow(/trustTier/i);
  });
});

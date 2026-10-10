import { describe, expect, it, vi } from "vitest";
import type { AgentRunVerification } from "../src/agent/runReport.js";
import { nativeEvidenceVerdict, verifyNativeTaskEvidence } from "../src/studio/nativeTaskVerdict.js";

// Studio's native-task verify (P0-14): the only caller that enables the live scope, and fail-closed on every branch.
const base: AgentRunVerification = {
  sessionId: "s1", ok: true, prefixVerified: false, integrityOk: true, ledgerOk: true, ledgerErrors: [], sessionChainErrors: [],
  unsignedRowIds: [], requests: [], scope: "complete-ledger", unfinalizedSessions: [],
  trustRoot: { anchored: true, monitorFingerprint: "f".repeat(64), expectedFingerprint: "f".repeat(64) }
};
const prefix: AgentRunVerification = { ...base, ok: false, prefixVerified: true, scope: "verified-prefix", unfinalizedSessions: ["gw-1"] };

describe("Studio native-task evidence verdict", () => {
  it("maps a complete anchored verification and a verified prefix to different states", () => {
    expect(nativeEvidenceVerdict(base)).toEqual({ verification: "externally-anchored", scope: { scope: "complete-ledger", unfinalizedSessions: [] }, error: null });
    expect(nativeEvidenceVerdict(prefix)).toEqual({ verification: "anchored-prefix", scope: { scope: "verified-prefix", unfinalizedSessions: ["gw-1"] }, error: null });
  });

  it("fails closed on an unanchored prefix, a failed prefix and every inconsistent or unexpected shape", () => {
    const unanchored = { ...prefix, prefixVerified: false, trustRoot: { ...base.trustRoot, anchored: false, monitorAdmission: { status: "not-pinned" } } };
    expect(nativeEvidenceVerdict(unanchored)).toMatchObject({ verification: "failed", scope: null, error: expect.stringMatching(/^UNTRUSTED/) });
    expect(nativeEvidenceVerdict({ ...prefix, prefixVerified: false, integrityOk: false })).toMatchObject({ verification: "failed", scope: null });
    for (const odd of [
      null, undefined, "verified", 1, {}, [], { ...base, scope: undefined }, { ...base, scope: "whole-ledger" },
      { ...base, ok: "true" }, { ...base, prefixVerified: undefined }, { ...base, unfinalizedSessions: undefined },
      { ...base, unfinalizedSessions: ["gw-1"] }, { ...base, prefixVerified: true },
      { ...prefix, ok: true }, { ...prefix, unfinalizedSessions: [] }, { ...prefix, unfinalizedSessions: [1] }, { ...prefix, scope: "complete-ledger" }
    ]) {
      expect(nativeEvidenceVerdict(odd), JSON.stringify(odd)).toMatchObject({ verification: "failed", scope: null });
    }
  });

  it("is the only place the live scope is enabled, and a thrown verifier is failed, not verified", async () => {
    const verify = vi.fn(async () => prefix);
    const trust = { mode: "pinned" } as never;
    expect(await verifyNativeTaskEvidence("/w", "s1", trust, verify)).toMatchObject({ verification: "anchored-prefix" });
    expect(verify).toHaveBeenCalledWith("/w", "s1", trust, { allowLiveLegacySessions: true });
    const thrown = await verifyNativeTaskEvidence("/w", "s1", trust, async () => { throw new Error("unable to open database file"); });
    expect(thrown).toEqual({ verification: "failed", scope: null, error: "Cold native verification did not complete. No verified result is claimed." });
  });
});

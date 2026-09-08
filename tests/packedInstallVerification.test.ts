import { describe, expect, it } from "vitest";
import { verifyPackedRun } from "../scripts/packed-evidence-verification.mjs";

function fixture() {
  return {
    summary: { sessionId: "installed-session", driverStatus: "idle", unsignedRows: 0,
      events: 24, turns: 1, requests: 2, toolCalls: 1,
      endings: [{ turn: 1, reason: "complete", interrupted: false }] },
    ledger: { ok: true, chain: { ok: true }, errors: [] as string[], sessions: { closed: ["installed-session"] } },
    run: { ok: true, sessionId: "installed-session", ledgerOk: true, ledgerErrors: [] as string[],
      sessionChainErrors: [] as string[], unsignedRowIds: [] as string[],
      requests: [{ status: "reconstructed" }, { status: "reconstructed" }] }
  };
}

describe("packed runtime evidence gate", () => {
  it("invokes both cold verifiers for the exact completed tool session", () => {
    const f = fixture();
    const calls: string[][] = [];
    expect(verifyPackedRun({ summary: f.summary, runCommand: (_label: string, args: string[]) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify(calls.length === 1 ? f.ledger : f.run) };
    } })).toBe(true);
    expect(calls).toEqual([["session", "verify", "--json"], ["agent-loop", "verify", "installed-session", "--json"]]);
  });

  it("refuses a completed signed summary when payload verification failed", () => {
    const f = fixture();
    f.ledger.ok = false; f.ledger.chain.ok = false; f.ledger.errors = ["payload authentication failed"];
    expect(verifyPackedRun({ summary: f.summary, runCommand: () => ({ ok: true, stdout: JSON.stringify(f.ledger) }) })).toBe(false);
  });

  it.each(["exit", "malformed", "session", "unsigned", "unreconstructed", "missing-request", "null-request"])("rejects %s verifier results", (kind) => {
    const f = fixture();
    if (kind === "session") f.run.sessionId = "different-session";
    if (kind === "unsigned") f.run.unsignedRowIds = ["unsigned-row"];
    if (kind === "unreconstructed") f.run.requests[0]!.status = "payload-pruned";
    if (kind === "missing-request") f.run.requests.pop();
    if (kind === "null-request") (f.run.requests as unknown[])[0] = null;
    let count = 0;
    expect(verifyPackedRun({ summary: f.summary, runCommand: () => {
      count += 1;
      return count === 1 ? { ok: true, stdout: JSON.stringify(f.ledger) }
        : { ok: kind !== "exit", stdout: kind === "malformed" ? "VERIFIED unsigned 0" : JSON.stringify(f.run) };
    } })).toBe(false);
  });

  it("cannot qualify an unsigned, empty or tool-free run from reassuring assistant text", () => {
    for (const change of [{ unsignedRows: 1 }, { events: 0 }, { toolCalls: 0 }, { requests: 0 }, { endings: [null] }]) {
      const f = fixture();
      const summary = { ...f.summary, ...change, assistantText: ["unsigned 0; turn 1 ended: complete"] };
      expect(verifyPackedRun({ summary, runCommand: () => { throw new Error("invalid summary must not reach verifiers"); } })).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { liveBudgetRefusalCause, liveNativeFailureGuidance, projectNativeRunDiagnostics, renderNativeRunDiagnostics } from "../src/agent/nativeFailureGuidance.js";
import { NativeBudgetRefusal } from "../src/budgets/nativeBudgetAdmission.js";
import type { EvidenceEvent } from "../src/types.js";

const sid = "guidance-cause-session";
const row = (id: string, type: EvidenceEvent["event_type"], meta: unknown) =>
  ({ id, session_id: sid, event_type: type, meta_json: typeof meta === "string" ? meta : JSON.stringify(meta) }) as EvidenceEvent;

describe("recorded failure diagnostics: projection and rendering", () => {
  it("a failure row whose metadata is not JSON reads as METADATA_UNAVAILABLE with unknown position", () => {
    expect(projectNativeRunDiagnostics([row("f1", "request/failure", "{not json")], sid)).toEqual([
      expect.objectContaining({ eventId: "f1", source: "request-failure", turn: null, step: null, guidance: expect.objectContaining({ code: "METADATA_UNAVAILABLE" }) })
    ]);
  });

  it("only error-ending turns without a recorded request failure get an UNKNOWN turn row", () => {
    const failure = row("f1", "request/failure", { headerEventId: "missing", turn: 2, step: 1, outcome: "failed", finishReason: "error", failure: { code: "AUTH" } });
    const rows = projectNativeRunDiagnostics([
      failure,
      row("end-1", "turn/end", { turn: 1, reason: "complete" }),
      row("end-2", "turn/end", { turn: 2, reason: "error" }),
      row("end-3", "turn/end", { turn: 3, reason: "error" }),
      row("bad-end", "turn/end", "nope")
    ], sid);
    expect(rows.map(item => [item.eventId, item.source, item.turn, item.guidance.code])).toEqual([
      ["f1", "request-failure", 2, "METADATA_UNAVAILABLE"],
      ["end-3", "turn-error", 3, "UNKNOWN"]
    ]);
  });

  it("renders a provider origin without its path, and AMC's budget cause, and drops an origin that is not an http(s) URL", () => {
    const text = renderNativeRunDiagnostics([
      { eventId: "a", source: "request-failure", turn: 1, step: 2, guidance: { code: "TRANSPORT", httpStatus: null }, origin: "https://models.example:8443/v1/chat?key=secret" },
      { eventId: "b", source: "request-failure", turn: 1, step: 3, guidance: { code: "AMC_NATIVE_BUDGET_REFUSED", httpStatus: null }, budgetCause: "daily cap\u0007 reached", origin: "not a url" },
      { eventId: "c", source: "turn-error", turn: 2, step: null, guidance: { code: "TIMEOUT", httpStatus: null }, origin: "file:///etc/passwd" }
    ]);
    expect(text).toContain("  address: https://models.example:8443\n");
    expect(text).not.toContain("key=secret");
    expect(text).toContain("  why: daily cap  reached");
    expect(text.match(/address:/g)).toHaveLength(1);
    expect(text).not.toContain("passwd");
  });
});

describe("liveBudgetRefusalCause: AMC's own budget refusal text only", () => {
  it("returns the text of AMC's budget refusal", () => {
    const refusal = new NativeBudgetRefusal("native model request budget exhausted: 1 of 1 requests used today");
    expect(liveBudgetRefusalCause(refusal)).toBe("native model request budget exhausted: 1 of 1 requests used today");
  });

  it("flattens control characters and newlines to spaces and caps the text at 700 characters", () => {
    const cause = liveBudgetRefusalCause(new NativeBudgetRefusal(`limit\u001b[2J\nreached\t${"x".repeat(1000)}`));
    expect(cause).toMatch(/^limit \[2J reached x+$/);
    expect(cause).toHaveLength(700);
  });

  it("returns null for an empty refusal message", () => {
    expect(liveBudgetRefusalCause(new NativeBudgetRefusal(""))).toBeNull();
  });

  it("returns null for any error that is not AMC's budget refusal, even with the same text", () => {
    expect(liveBudgetRefusalCause(Object.assign(new Error("budget exhausted"), { code: "QUOTA" }))).toBeNull();
    expect(liveBudgetRefusalCause(new Error("budget exhausted"))).toBeNull();
    expect(liveBudgetRefusalCause("AMC_NATIVE_BUDGET_REFUSED")).toBeNull();
    expect(liveBudgetRefusalCause(null)).toBeNull();
    expect(liveBudgetRefusalCause(undefined)).toBeNull();
  });

  it("reads only own data properties: a code getter is not invoked", () => {
    let calls = 0;
    const error = Object.defineProperty(new Error("text"), "code", { get: () => { calls++; return "AMC_NATIVE_BUDGET_REFUSED"; } });
    expect(liveBudgetRefusalCause(error)).toBeNull();
    expect(calls).toBe(0);
  });

  it("a hostile proxy whose property lookup throws is treated as having no code", () => {
    const hostile = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error("trap"); } });
    expect(liveBudgetRefusalCause(hostile)).toBeNull();
    expect(liveNativeFailureGuidance(hostile).code).toBe("UNKNOWN");
  });
});

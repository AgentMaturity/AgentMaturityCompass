import { describe, expect, it } from "vitest";
import { parseNativeChatResult } from "../src/setup/nativeChatResult.js";

const summary = (extra: Record<string, unknown> = {}) => ({ sessionId: "known-session", driverStatus: "idle",
  assistantText: ["Recorded text"], endings: [{ reason: "complete" }], validation: { status: "not-requested" }, ...extra });
const parse = (value: unknown, selection: { requestedSessionId?: string | null; forkFrom?: string | null; truncated?: boolean } = {}) =>
  parseNativeChatResult({ stdout: JSON.stringify(value), truncated: selection.truncated ?? false,
    requestedSessionId: selection.requestedSessionId ?? null, forkFrom: selection.forkFrom ?? null });

describe("native chat closed-child result contract", () => {
  it("accepts a new reference and an exact resumed reference without claiming verification", () => {
    expect(parse(summary())).toMatchObject({ ok: true, summary: { sessionId: "known-session", driverStatus: "idle" } });
    const resumed = parse(summary(), { requestedSessionId: "known-session" });
    expect(resumed).toMatchObject({ ok: true, summary: { sessionId: "known-session" } });
    expect(JSON.stringify(resumed)).not.toContain('"verified"');
  });
  it("rejects another session on an explicitly resumed command, without echoing its data", () => {
    const result = parse(summary({ sessionId: "unexpected-session", assistantText: ["secret-fixture-body"] }), { requestedSessionId: "known-session" });
    expect(result).toMatchObject({ ok: false, code: "SESSION_MISMATCH" });
    expect(JSON.stringify(result)).not.toMatch(/unexpected-session|secret-fixture-body/);
  });
  it("requires a distinct fork child whether or not chat already knew the parent", () => {
    expect(parse(summary({ sessionId: "child-session" }), { forkFrom: "known-session" })).toMatchObject({ ok: true });
    expect(parse(summary(), { forkFrom: "known-session" })).toMatchObject({ ok: false, code: "FORK_IDENTITY_INVALID" });
    expect(parse(summary(), { requestedSessionId: "known-session", forkFrom: "known-session" })).toMatchObject({ ok: false, code: "FORK_IDENTITY_INVALID" });
    expect(parse(summary({ sessionId: "child-session" }), { requestedSessionId: "known-session", forkFrom: "known-session" })).toMatchObject({ ok: true });
  });
  it("rejects a truncated buffer even when its retained prefix is valid JSON", () => {
    expect(parse(summary(), { truncated: true })).toMatchObject({ ok: false, code: "OUTPUT_TRUNCATED" });
  });
  it.each(["running", "passed", "complete", "", null, 0])("does not accept unsupported closed-child driver state %j", driverStatus => {
    expect(parse(summary({ driverStatus }))).toMatchObject({ ok: false, code: "RESULT_STATE_INVALID" });
  });
  it.each([null, [], {}, { sessionId: "   " }, { sessionId: "known-session\u001b[2J" }, { assistantText: [42] },
    { endings: "complete" }, { endings: [{ reason: "verified" }] }, { endings: [null] }, { validation: { status: "approved" } }, { validation: null }])("rejects malformed display fields: %j", extra => {
    const value = extra !== null && !Array.isArray(extra) && Object.keys(extra).length > 0 ? summary(extra) : extra;
    expect(parse(value)).toMatchObject({ ok: false, code: "RESULT_INVALID" });
  });
  it("rejects missing or concatenated JSON without returning a guessed reference", () => {
    for (const stdout of ["", "not-json", JSON.stringify(summary()) + JSON.stringify(summary())]) {
      expect(parseNativeChatResult({ stdout, truncated: false, requestedSessionId: null, forkFrom: null })).toMatchObject({ ok: false, code: "RESULT_INVALID" });
    }
  });
  it("preserves valid failed, cancelled and bounded endings rather than relabeling success", () => {
    const failed = parse(summary({ driverStatus: "failed", endings: [{ reason: "error" }], validation: { status: "unavailable" } }));
    expect(failed).toMatchObject({ ok: true, summary: { driverStatus: "failed", endings: [{ reason: "error" }], validation: { status: "unavailable" } } });
    for (const reason of ["cancelled", "interrupted", "blocked", "max_tokens", "max_steps"]) {
      expect(parse(summary({ endings: [{ reason }] }))).toMatchObject({ ok: true, summary: { endings: [{ reason }] } });
    }
  });
  it("leaves older missing usage/validation data unavailable instead of fabricating results", () => {
    const result = parse({ sessionId: "legacy-session", driverStatus: "idle", assistantText: [] });
    expect(result).toEqual({ ok: true, summary: { sessionId: "legacy-session", driverStatus: "idle", assistantText: [], endings: [] } });
  });
});

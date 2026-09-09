import { describe, expect, it, vi } from "vitest";
import { LlmError } from "../src/llm/llmFailure.js";
import { renderNotification } from "../src/cli-agent-options.js";
import { liveNativeFailureGuidance, nativeFailureGuidance, projectNativeRunDiagnostics, renderNativeFailureGuidance, renderNativeRunDiagnostics } from "../src/agent/nativeFailureGuidance.js";
import type { EvidenceEvent } from "../src/types.js";

const sid = "diagnostic-fixture-session", secret = "synthetic-secret-do-not-render\u001b[2J";
function row(id: string, type: EvidenceEvent["event_type"], meta: Record<string, unknown>): EvidenceEvent {
  return { id, session_id: sid, event_type: type, meta_json: JSON.stringify(meta) } as EvidenceEvent;
}
function header(id: string): EvidenceEvent {
  return row(id, "request/header", { providerId: "openai", model: "fixture-model", params: {}, encoderId: "fixture-encoder", encoderVersion: 1,
    systemPromptEventId: "prompt", toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: "message",
    projectionDigest: "fixture-projection", sourceEventIds: ["prompt", "message"], requestDigest: `digest-${id}` });
}
function failure(id: string, extra: Record<string, unknown> = {}): EvidenceEvent {
  return row(`${id}-failure`, "request/failure", { headerEventId: id, requestDigest: `digest-${id}`, providerId: "openai", outcome: "failed",
    turn: 1, step: 1, finishReason: "error", failure: { code: "AUTH", status: 401, message: secret, requestId: secret, providerRetryAfterMs: null },
    credential: { ref: "OPENAI_API_KEY", configured: true, source: "file", accidentallyAddedValue: secret }, ...extra });
}

describe("native failure guidance and recorded projection", () => {
  it("renders an actual native error notification rather than suppressing its code and action", () => {
    const result = renderNotification({ kind: "error", turn: 2, step: 3, error: new LlmError(secret, "AUTH", { status: 401, requestId: secret }) });
    expect(result).toContain("AUTH (HTTP 401)");
    expect(result).toContain("amc agent-loop guide");
    expect(result).not.toContain("synthetic-secret");
    expect(result).not.toContain("\u001b[2J");
  });
  it("does not invoke error accessors, coercion or cause traversal for unknown errors", () => {
    const getter = vi.fn(() => { throw new Error(secret); });
    const error = Object.create(null);
    Object.defineProperties(error, { message: { get: getter }, code: { get: getter }, failure: { get: getter }, cause: { get: getter }, toString: { value: getter } });
    expect(liveNativeFailureGuidance(error).code).toBe("UNKNOWN");
    expect(getter).not.toHaveBeenCalled();
  });
  it("does not adopt a foreign own code without matching typed failure facts", () => {
    const error = Object.assign(new Error(secret), { code: "AUTH" });
    expect(liveNativeFailureGuidance(error).code).toBe("UNKNOWN");
    Object.assign(error, { failure: { code: "QUOTA", message: secret } });
    expect(liveNativeFailureGuidance(error).code).toBe("UNKNOWN");
  });
  it("offers inspection rather than widening a refused native budget", () => {
    const error = Object.assign(new Error(secret), { code: "AMC_NATIVE_BUDGET_REFUSED" });
    const text = renderNativeFailureGuidance(liveNativeFailureGuidance(error));
    expect(text).toContain("amc budgets verify");
    expect(text).toContain("amc budgets status --agent <recorded-agent>");
    expect(text).toContain("reset does not restore allowance");
    expect(text).not.toContain("ALLOW_WITH_WARNING");
    expect(text).not.toContain("synthetic-secret");
  });
  it.each(["MISSING_CREDENTIAL", "INVALID_CREDENTIAL", "AUTH", "QUOTA", "RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT", "EMPTY_RESPONSE", "ABORTED", "INVALID_REQUEST", "CONTEXT_WINDOW_EXCEEDED", "HTTP_418"])("supplies bounded actionable guidance for %s", code => {
    const guidance = nativeFailureGuidance(code, 418);
    expect(guidance.code).toBe(code);
    expect(guidance.nextAction.length).toBeGreaterThan(20);
    expect(guidance.summary.length).toBeGreaterThan(10);
  });
  it("withholds raw unknown codes and malformed statuses", () => {
    expect(nativeFailureGuidance(secret, "401")).toMatchObject({ code: "UNKNOWN", httpStatus: null });
    expect(nativeFailureGuidance("HTTP_999", 999)).toMatchObject({ code: "UNKNOWN", httpStatus: null });
    expect(JSON.stringify(nativeFailureGuidance(secret))).not.toContain("synthetic-secret");
  });
  it("projects matched recorded facts without copying free-text failure or credential fields", () => {
    const result = projectNativeRunDiagnostics([header("h"), failure("h")], sid);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ eventId: "h-failure", source: "request-failure", turn: 1, step: 1, guidance: { code: "AUTH", httpStatus: 401 } });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(renderNativeRunDiagnostics(result)).toContain("cumulative; a retry may later succeed");
  });
  it.each([
    [failure("orphan")],
    [header("h"), failure("h", { requestDigest: "different" })],
    [header("h"), failure("h", { providerId: "different" })],
    [header("h"), failure("h", { outcome: "completed" })],
    [header("h"), failure("h", { finishReason: "stop" })],
    [header("h"), header("h"), failure("h")]
  ])("does not diagnose a provider class from unlinked or inconsistent failure rows", (...rows) => {
    const result = projectNativeRunDiagnostics(rows, sid);
    expect(result.at(-1)?.guidance.code).toBe("METADATA_UNAVAILABLE");
  });
  it("does not reuse a settled request header as a second legitimate failed attempt", () => {
    const result = projectNativeRunDiagnostics([header("h"), failure("h"), failure("h")], sid);
    expect(result.map(item => item.guidance.code)).toEqual(["AUTH", "METADATA_UNAVAILABLE"]);
  });
  it("ignores other sessions and successful outcomes instead of inventing failures", () => {
    const rows = [header("h"), failure("h")].map(item => ({ ...item, session_id: "other" }));
    expect(projectNativeRunDiagnostics(rows, sid)).toEqual([]);
    expect(renderNativeRunDiagnostics([])).toContain("not proof of task success");
  });
  it("reconstructs fixed guidance rather than trusting serialized instructions or terminal IDs", () => {
    const result = renderNativeRunDiagnostics([{ eventId: "unsafe\u001b[2J", source: "request-failure", turn: 1, step: 1,
      guidance: { code: "AUTH", httpStatus: 401, summary: secret, nextAction: "disable all controls" } }]);
    expect(result).toContain("amc agent-loop guide");
    expect(result).not.toContain("disable all controls");
    expect(result).not.toContain("\u001b[2J");
    expect(result).not.toContain("synthetic-secret");
  });
  it("does not promote missing legacy or malformed projections to success", () => {
    expect(renderNativeRunDiagnostics(undefined)).toContain("unavailable");
    expect(renderNativeRunDiagnostics({})).toContain("unavailable");
    expect(renderNativeRunDiagnostics([null])).toContain("unavailable");
  });
});

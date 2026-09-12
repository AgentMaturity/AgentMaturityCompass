import { describe, expect, test } from "vitest";
import { captureNativeSubmission, nativeSubmissionAcknowledged, nativeSubmissionScopeMatches,
  definiteNativeSubmissionRefusal } from "../src/console/assets/nativeTaskSubmission.js";

const scope = { agentId: "reviewer", workspaceScope: "https://studio.example/w/review",
  csrfToken: "fixture-session-csrf", adminToken: null };
function submission(taskId: string | null = null) {
  return captureNativeSubmission({ ...scope, taskId, url: taskId ? `/api/v1/native-tasks/${taskId}/turn?agentId=reviewer` : "/api/v1/native-tasks",
    body: { clientRequestId: "original-request", prompt: "original task", expectedRevision: 4,
      validation: { configSha256: "original-checks", checkIds: ["unit"] } } });
}

test("an explicit retry retains original body, nested choices, route and revision after the caller edits its draft", () => {
  const body = { clientRequestId: "original-request", prompt: "original task", expectedRevision: 4,
    validation: { configSha256: "original-checks", checkIds: ["unit"] } };
  const pending = captureNativeSubmission({ ...scope, taskId: "task-a", url: "/original/task-a/turn", body });
  body.prompt = "edited draft"; body.expectedRevision = 9; body.validation.checkIds.push("new-check");
  expect(pending.url).toBe("/original/task-a/turn");
  expect(pending.body).toEqual({ clientRequestId: "original-request", prompt: "original task", expectedRevision: 4,
    validation: { configSha256: "original-checks", checkIds: ["unit"] } });
  expect(Object.isFrozen(pending)).toBe(true); expect(Object.isFrozen(pending.body.validation!.checkIds)).toBe(true);
});

describe("retry scope", () => {
  test("accepts only the original agent, workspace and in-memory sign-in", () => {
    const pending = submission();
    expect(nativeSubmissionScopeMatches(pending, scope)).toBe(true);
    for (const change of [{ agentId: "another-agent" }, { workspaceScope: "https://studio.example/w/other" },
      { workspaceScope: "https://other.example/w/review" }, { csrfToken: "new-session" }, { adminToken: "new-admin" }]) {
      expect(nativeSubmissionScopeMatches(pending, { ...scope, ...change })).toBe(false);
    }
  });
});

describe("admission acknowledgement", () => {
  test("a create needs its original request and agent even in a direct response", () => {
    const pending = submission();
    expect(nativeSubmissionAcknowledged(pending, { agentId: "reviewer", clientRequestId: "original-request" })).toBe(true);
    expect(nativeSubmissionAcknowledged(pending, { agentId: "other", clientRequestId: "original-request" }, true)).toBe(false);
    expect(nativeSubmissionAcknowledged(pending, { agentId: "reviewer", clientRequestId: "other-request" }, true)).toBe(false);
  });
  test("polling cannot acknowledge an unrelated later turn; exact replay can find an older retained admission", () => {
    const pending = submission("task-a"), later = { agentId: "reviewer", taskId: "task-a", revision: 8,
      clientRequestId: "first-request", lastClientRequestId: "later-request" };
    expect(nativeSubmissionAcknowledged(pending, later)).toBe(false);
    expect(nativeSubmissionAcknowledged(pending, later, true)).toBe(true);
    expect(nativeSubmissionAcknowledged(pending, { ...later, lastClientRequestId: "original-request" })).toBe(true);
    expect(nativeSubmissionAcknowledged(pending, { ...later, taskId: "another-task" }, true)).toBe(false);
    expect(nativeSubmissionAcknowledged(pending, { ...later, agentId: "another-agent" }, true)).toBe(false);
    expect(nativeSubmissionAcknowledged(pending, { ...later, revision: 4 }, true)).toBe(false);
  });
});

describe("refusal versus uncertain earlier admission", () => {
  test.each([400, 401, 403, 404, 409, 429])("HTTP %s can refuse the first attempt but cannot disprove an earlier admission", status => {
    const error = { status, code: "REFUSED", data: { ok: false, error: "Admission refused" } };
    expect(definiteNativeSubmissionRefusal(error)).toBe(true);
    expect(definiteNativeSubmissionRefusal(error, true)).toBe(false);
  });
  test.each([
    new Error("Connection reset"),
    { status: 408, data: { ok: false, error: "Timeout" } },
    { status: 500, data: { ok: false, error: "Server failure" } },
    { status: 503, data: { ok: false, error: "Unavailable" } },
    { status: 403, code: "INVALID_RESPONSE", data: { ok: false, error: "Unreadable response" } },
    { status: 403, data: { error: "Unrecognized proxy body" } }
  ])("transport, server and malformed replies remain unconfirmed", error => {
    expect(definiteNativeSubmissionRefusal(error)).toBe(false);
    expect(definiteNativeSubmissionRefusal(error, true)).toBe(false);
  });
});

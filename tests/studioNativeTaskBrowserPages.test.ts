import { expect, test } from "vitest";
import { validateNativeTaskPoll } from "../src/console/assets/nativeTasks.js";

const task = { taskId: "task_12345678", sessionId: "session-page-id", agentId: "default", revision: 1, state: "released", provider: "stub",
  nextCursor: 2, firstCursor: 1, droppedEvents: 0, canResume: false, resumeBlockedReason: null, archived: false,
  history: { status: "authenticated", backend: "sqlite", headEventHash: "a".repeat(64), eventCount: 11, message: "Authenticated fixture" },
  validation: { status: "not-requested", turn: null, checks: [] }, validationOutputs: [], approvals: [], approvalError: null, verification: "not-verified" };
const event = (cursor: number) => ({ cursor, kind: "assistant", text: `Committed ${cursor}`, evidence: "committed" });
function response() {
  return { task, events: [event(2), event(4)], truncated: false, page: { format: "amc-session-event-page-v1", sessionId: task.sessionId,
    agentId: "default", committed: true, backend: "sqlite", headEventHash: "a".repeat(64), storeHeadEventHash: "b".repeat(64),
    headSeq: 10, firstSeq: 0, nextSeq: 5, nextCursor: "opaque-next-page", resumeCursor: "opaque-reconnect", sealed: false } };
}

test("browser accepts sparse projected updates within a contiguous verified source page", () => {
  const value = validateNativeTaskPoll(response(), task, -1);
  expect(value.events.map(event => event.cursor)).toEqual([2, 4]);
  expect(value.page?.nextSeq).toBe(5);
});

test("browser refuses forged page identity, bounds, omitted recovery cursor and unexplained truncation before displaying any prefix", () => {
  for (const fields of [{ sessionId: "different" }, { agentId: "other" }, { committed: false }, { firstSeq: 1 }, { nextSeq: 4 },
    { nextSeq: 12 }, { nextCursor: "" }, { resumeCursor: "" }, { headEventHash: "draft" }]) {
    const value = response(); Object.assign(value.page, fields);
    expect(() => validateNativeTaskPoll(value, task, -1), JSON.stringify(fields)).toThrow();
  }
  expect(() => validateNativeTaskPoll({ ...response(), truncated: true }, task, -1)).toThrow();
  expect(() => validateNativeTaskPoll({ ...response(), events: [event(2), event(6)] }, task, -1)).toThrow();
});

test("browser admits only authenticated current-record list snapshots alongside verified history", () => {
  const plan = { kind: "todo", revision: 1, recordSha256: "c".repeat(64), text: "[pending] Inspect", evidence: "committed", scope: "current-record" };
  const withPlan = { ...response(), task: { ...task, plans: [plan] } };
  expect(validateNativeTaskPoll(withPlan, task, -1).task.plans).toEqual([plan]);
  for (const change of [{ evidence: "provisional" }, { scope: "durable-history" }, { recordSha256: "draft" }, { revision: 0 }, { text: {} }, { kind: "authority" }]) {
    expect(() => validateNativeTaskPoll({ ...withPlan, task: { ...task, plans: [{ ...plan, ...change }] } }, task, -1)).toThrow();
  }
});

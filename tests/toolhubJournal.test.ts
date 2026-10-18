import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  classifyToolhubOutcome,
  isJournaledToolhubExecution,
  toolhubExecutionId,
  type ToolhubOutcome
} from "../src/toolhub/toolhubJournal.js";
import type { ActionClass, ExecutionMode } from "../src/types.js";

// Algorithm fixtures only. No service, journal, authorization, executor or effect is exercised here.
// Result fields are supplied unit inputs, never execution receipts or proof that an effect occurred.
const journalCases: ReadonlyArray<readonly [ExecutionMode, ActionClass, boolean]> = [
  ["EXECUTE", "READ_ONLY", false],
  ["EXECUTE", "WRITE_LOW", false],
  ["EXECUTE", "WRITE_HIGH", true],
  ["EXECUTE", "DEPLOY", true],
  ["EXECUTE", "SECURITY", true],
  ["EXECUTE", "FINANCIAL", true],
  ["EXECUTE", "NETWORK_EXTERNAL", true],
  ["EXECUTE", "DATA_EXPORT", true],
  ["EXECUTE", "IDENTITY", true],
  ["SIMULATE", "READ_ONLY", false],
  ["SIMULATE", "WRITE_LOW", false],
  ["SIMULATE", "WRITE_HIGH", false],
  ["SIMULATE", "DEPLOY", false],
  ["SIMULATE", "SECURITY", false],
  ["SIMULATE", "FINANCIAL", false],
  ["SIMULATE", "NETWORK_EXTERNAL", false],
  ["SIMULATE", "DATA_EXPORT", false],
  ["SIMULATE", "IDENTITY", false]
];

const idVectors = [
  {
    name: "the initial workspace and intent",
    workspaceId: "p154-workspace-a",
    intentId: "intent_00000000000000000000000000000001",
    message: "toolhub:p154-workspace-a:intent_00000000000000000000000000000001"
  },
  {
    name: "a different workspace with the same intent",
    workspaceId: "p154-workspace-b",
    intentId: "intent_00000000000000000000000000000001",
    message: "toolhub:p154-workspace-b:intent_00000000000000000000000000000001"
  },
  {
    name: "the same workspace with a different intent",
    workspaceId: "p154-workspace-a",
    intentId: "intent_00000000000000000000000000000002",
    message: "toolhub:p154-workspace-a:intent_00000000000000000000000000000002"
  }
] as const;

interface OutcomeCase {
  name: string;
  actionClass: ActionClass;
  input: Record<string, unknown>;
  expected: Omit<ToolhubOutcome, "result">;
  resultAdditions: Record<string, unknown>;
}

const outcomeCases: readonly OutcomeCase[] = [
  {
    name: "an ordinary returned process result completes without an effect claim",
    actionClass: "WRITE_HIGH", input: { code: 0, signal: null, errorCode: null },
    expected: { state: "completed", effect: null, reasonCode: "completed", bodySucceeded: true },
    resultAdditions: {}
  },
  {
    name: "a normal nonzero exit completes without claiming body success",
    actionClass: "WRITE_HIGH", input: { code: 7, signal: null, errorCode: null },
    expected: { state: "completed", effect: null, reasonCode: "completed", bodySucceeded: false },
    resultAdditions: {}
  },
  {
    name: "a declared financial applied effect is retained",
    actionClass: "FINANCIAL", input: { code: 0, effect: "applied" },
    expected: { state: "completed", effect: "applied", reasonCode: "completed", bodySucceeded: true },
    resultAdditions: {}
  },
  {
    name: "a declared data export applied effect is retained",
    actionClass: "DATA_EXPORT", input: { code: 0, effect: "applied" },
    expected: { state: "completed", effect: "applied", reasonCode: "completed", bodySucceeded: true },
    resultAdditions: {}
  },
  {
    name: "a declared identity applied effect is retained",
    actionClass: "IDENTITY", input: { code: 0, effect: "applied" },
    expected: { state: "completed", effect: "applied", reasonCode: "completed", bodySucceeded: true },
    resultAdditions: {}
  },
  {
    name: "a declared not-applied effect is not promoted by a zero exit",
    actionClass: "FINANCIAL", input: { code: 0, effect: "not_applied" },
    expected: { state: "completed", effect: "not_applied", reasonCode: "completed", bodySucceeded: true },
    resultAdditions: {}
  },
  {
    name: "a declared applied effect does not make a nonzero exit successful",
    actionClass: "WRITE_HIGH", input: { code: 7, effect: "applied" },
    expected: { state: "completed", effect: "applied", reasonCode: "completed", bodySucceeded: false },
    resultAdditions: {}
  },
  {
    name: "a financial result without an effect declaration stays unknown",
    actionClass: "FINANCIAL", input: { code: 0 },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "effect_not_declared", bodySucceeded: true },
    resultAdditions: { outcomeUnknown: true, reasonCode: "effect_not_declared" }
  },
  {
    name: "a data export result without an effect declaration stays unknown",
    actionClass: "DATA_EXPORT", input: { code: 0 },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "effect_not_declared", bodySucceeded: true },
    resultAdditions: { outcomeUnknown: true, reasonCode: "effect_not_declared" }
  },
  {
    name: "an identity result without an effect declaration stays unknown",
    actionClass: "IDENTITY", input: { code: 0 },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "effect_not_declared", bodySucceeded: true },
    resultAdditions: { outcomeUnknown: true, reasonCode: "effect_not_declared" }
  },
  {
    name: "an explicit unknown effect overrides caller-supplied completion markers",
    actionClass: "FINANCIAL", input: { code: 0, effect: "unknown", outcomeUnknown: false, reasonCode: "caller_completed" },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "effect_declared_unknown", bodySucceeded: true },
    resultAdditions: { outcomeUnknown: true, reasonCode: "effect_declared_unknown" }
  },
  {
    name: "an explicit null effect is invalid rather than an omitted declaration",
    actionClass: "DATA_EXPORT", input: { code: 0, effect: null },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "effect_declaration_invalid", bodySucceeded: true },
    resultAdditions: { outcomeUnknown: true, reasonCode: "effect_declaration_invalid" }
  },
  {
    name: "an unsupported effect value cannot claim an identity effect",
    actionClass: "IDENTITY", input: { code: 0, effect: "caller_claimed_applied" },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "effect_declaration_invalid", bodySucceeded: true },
    resultAdditions: { outcomeUnknown: true, reasonCode: "effect_declaration_invalid" }
  },
  {
    name: "a termination signal takes precedence over a spawn code and claimed effect",
    actionClass: "WRITE_HIGH", input: { code: 0, signal: "SIGTERM", errorCode: "ENOENT", effect: "applied" },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "process_terminated", bodySucceeded: false },
    resultAdditions: { outcomeUnknown: true, reasonCode: "process_terminated" }
  },
  {
    name: "an abnormal spawn error cannot claim that the effect was not applied",
    actionClass: "WRITE_HIGH", input: { code: 0, signal: null, errorCode: "ENOBUFS", effect: "applied" },
    expected: { state: "outcome_unknown", effect: null, reasonCode: "process_terminated", bodySucceeded: false },
    resultAdditions: { outcomeUnknown: true, reasonCode: "process_terminated" }
  },
  {
    name: "ENOENT records a definite spawn failure despite a claimed applied effect",
    actionClass: "WRITE_HIGH", input: { code: 0, signal: null, errorCode: "ENOENT", effect: "applied" },
    expected: { state: "completed", effect: "not_applied", reasonCode: "definite_failure", bodySucceeded: false },
    resultAdditions: {}
  },
  {
    name: "EACCES records a definite spawn failure despite a declared unknown effect",
    actionClass: "WRITE_HIGH", input: { code: 0, signal: null, errorCode: "EACCES", effect: "unknown" },
    expected: { state: "completed", effect: "not_applied", reasonCode: "definite_failure", bodySucceeded: false },
    resultAdditions: {}
  }
];

describe("ToolHub journal selection on algorithm fixtures", () => {
  it.each(journalCases)("%s %s journals=%s", (mode, actionClass, expected) => {
    expect(isJournaledToolhubExecution(mode, actionClass)).toBe(expected);
  });
});

describe("ToolHub execution ID binding", () => {
  it.each(idVectors)("binds $name", ({ workspaceId, intentId, message }) => {
    // The fixed message is an independent vector, not assembled from the function's arguments or return value.
    const expected = `exec_${createHash("sha256").update(message, "utf8").digest("hex").slice(0, 32)}`;
    const first = toolhubExecutionId(workspaceId, intentId);
    expect(first).toBe(expected);
    expect(first).toMatch(/^exec_[0-9a-f]{32}$/);
    expect(toolhubExecutionId(workspaceId, intentId)).toBe(first);
  });
});

describe("ToolHub returned-result classification on algorithm fixtures", () => {
  it.each(outcomeCases)("$name", ({ actionClass, input, expected, resultAdditions }) => {
    const result = Object.freeze({ unitPayload: "p1-54-algorithm-fixture", ...input });
    const before = { ...result };
    expect(classifyToolhubOutcome(actionClass, result)).toEqual({
      ...expected,
      result: { ...before, ...resultAdditions }
    });
    expect(result).toEqual(before);
  });
});

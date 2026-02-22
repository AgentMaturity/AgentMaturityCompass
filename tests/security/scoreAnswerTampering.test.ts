import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  closeScoreSessionStores,
  createScoreSession,
  getScoreSession,
  recordScoreAnswer
} from "../../src/api/scoreStore.js";
import { questionBank } from "../../src/diagnostic/questionBank.js";

const workspaces: string[] = [];

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-score-security-"));
  workspaces.push(root);
  return root;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (!workspace) {
      continue;
    }
    closeScoreSessionStores(workspace);
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("security: score answer tampering", () => {
  test("rejects out-of-range score values", () => {
    const workspace = newWorkspace();
    const session = createScoreSession(workspace, "agent-1");
    const questionId = questionBank[0]!.id;

    expect(() =>
      recordScoreAnswer({
        workspace,
        sessionId: session.id,
        questionId,
        value: 999
      })
    ).toThrow(/Invalid score answer/);

    const after = getScoreSession(workspace, session.id);
    expect(after?.answers[questionId]).toBeUndefined();
  });

  test("rejects unknown question IDs", () => {
    const workspace = newWorkspace();
    const session = createScoreSession(workspace, "agent-1");

    expect(() =>
      recordScoreAnswer({
        workspace,
        sessionId: session.id,
        questionId: "AMC-FAKE-QUESTION",
        value: 5
      })
    ).toThrow(/Invalid score answer/);
  });

  test("accepts valid bounded answers", () => {
    const workspace = newWorkspace();
    const session = createScoreSession(workspace, "agent-1");
    const questionId = questionBank[0]!.id;

    const updated = recordScoreAnswer({
      workspace,
      sessionId: session.id,
      questionId,
      value: 5,
      notes: "Observed evidence chain and independent verification."
    });

    expect(updated).not.toBeNull();
    expect(updated?.answers[questionId]?.value).toBe(5);
  });
});

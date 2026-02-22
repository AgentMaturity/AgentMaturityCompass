import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  closeScoreSessionStores,
  countActiveScoreSessions,
  createScoreSession,
  getScoreSession,
  markScoreSessionCompleted,
  recordScoreAnswer
} from "../src/api/scoreStore.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-score-store-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  closeScoreSessionStores();
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("scoreStore persistence", () => {
  test("persists sessions and answers across store reopen", () => {
    const workspace = newWorkspace();
    const session = createScoreSession(workspace, "agent-test");
    const updated = recordScoreAnswer({
      workspace,
      sessionId: session.id,
      questionId: "AMC-1.1",
      value: 4,
      notes: "good control coverage"
    });
    expect(updated).not.toBeNull();
    expect(updated?.answers["AMC-1.1"]?.value).toBe(4);
    expect(countActiveScoreSessions(workspace)).toBe(1);

    closeScoreSessionStores(workspace);
    const reloaded = getScoreSession(workspace, session.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.answers["AMC-1.1"]?.notes).toBe("good control coverage");

    markScoreSessionCompleted(workspace, session.id);
    expect(countActiveScoreSessions(workspace)).toBe(0);
  });
});

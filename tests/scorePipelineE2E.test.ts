import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { closeScoreSessionStores } from "../src/api/scoreStore.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-score-pipeline-"));
  roots.push(dir);
  return dir;
}

async function callScoreRoute(params: {
  workspace: string;
  pathname: string;
  method: string;
  body?: unknown;
}): Promise<{ handled: boolean; statusCode: number; json: unknown }> {
  const req = new PassThrough() as unknown as IncomingMessage;
  req.method = params.method;
  req.headers = { "content-type": "application/json" };

  let statusCode = 200;
  let payload = "";
  const res = {
    writeHead(code: number): ServerResponse {
      statusCode = code;
      return this as unknown as ServerResponse;
    },
    end(chunk?: string | Buffer): void {
      payload = chunk ? String(chunk) : "";
    }
  } as unknown as ServerResponse;

  setImmediate(() => {
    if (params.body !== undefined) {
      req.write(JSON.stringify(params.body));
    }
    req.end();
  });

  const handled = await handleScoreRoute(params.pathname, params.method, req, res, params.workspace);
  return {
    handled,
    statusCode,
    json: payload.length > 0 ? (JSON.parse(payload) as unknown) : null
  };
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

describe("score pipeline end-to-end", () => {
  test("session -> question -> answer -> result flow completes and marks session inactive", async () => {
    const ws = workspace();

    const created = await callScoreRoute({
      workspace: ws,
      pathname: "/api/v1/score/session",
      method: "POST",
      body: { agentId: "agent-e2e" }
    });
    expect(created.handled).toBe(true);
    expect(created.statusCode).toBe(201);
    const createData = (created.json as { ok: boolean; data: { sessionId: string } }).data;
    expect(createData.sessionId.length).toBeGreaterThan(10);

    const question = await callScoreRoute({
      workspace: ws,
      pathname: `/api/v1/score/question/${createData.sessionId}`,
      method: "GET"
    });
    expect(question.statusCode).toBe(200);
    const questionData = (question.json as { ok: boolean; data: { complete: boolean; question?: { id: string } } }).data;
    expect(questionData.complete).toBe(false);
    expect(questionData.question?.id).toBeTruthy();

    const answered = await callScoreRoute({
      workspace: ws,
      pathname: "/api/v1/score/answer",
      method: "POST",
      body: {
        sessionId: createData.sessionId,
        questionId: questionData.question!.id,
        value: 5,
        notes: "e2e"
      }
    });
    expect(answered.statusCode).toBe(200);
    expect((answered.json as { ok: boolean; data: { recorded: boolean } }).data.recorded).toBe(true);

    const result = await callScoreRoute({
      workspace: ws,
      pathname: `/api/v1/score/result/${createData.sessionId}`,
      method: "GET"
    });
    expect(result.statusCode).toBe(200);
    const resultData = (result.json as { ok: boolean; data: { answeredCount: number; totalScore: number; level: number } }).data;
    expect(resultData.answeredCount).toBe(1);
    expect(resultData.totalScore).toBe(5);
    expect(resultData.level).toBe(5);

    const status = await callScoreRoute({
      workspace: ws,
      pathname: "/api/v1/score/status",
      method: "GET"
    });
    expect(status.statusCode).toBe(200);
    const statusData = (status.json as { ok: boolean; data: { activeSessions: number } }).data;
    expect(statusData.activeSessions).toBe(0);
  });
});

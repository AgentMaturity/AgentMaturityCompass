import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import {
  askUserAnswerDigest,
  askUserTool,
  signAskUserAnswer,
  type AskUserAnswerer
} from "../src/tools/builtin/askUserTool.js";

/**
 * ask_user never answers itself (AMC-1549).
 *
 * The tool pauses the loop on a composition-supplied answerer and returns an
 * answer ONLY when it arrives as a record signed with the workspace auditor
 * key, bound to the exact question it asked. Everything else — no answerer,
 * no answer, an unsigned, re-bound, tampered or monitor-signed answer — is a
 * call that returns no answer text.
 */
const PASS = "ask-user-tool-pass";
const SESSION = "sess-ask-1";
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = process.env["AMC_VAULT_PASSPHRASE"] ?? PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-ask-user-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function run(dir: string, answerer: AskUserAnswerer | undefined, args: Record<string, unknown> = { question: "Ship to prod?" }, mode: "EXECUTE" | "SIMULATE" = "EXECUTE") {
  const registry = new ToolRegistry();
  registry.define(askUserTool({ sessionId: SESSION, ...(answerer ? { answerer } : {}), timeoutMs: 2_000 }));
  return new ToolPipeline({ registry, workspace: dir })
    .execute({ name: "ask_user", agentId: "default", arguments: args, requestedMode: mode });
}

describe("ask_user", () => {
  it("refuses when no answerer is composed", async () => {
    const outcome = await run(workspace(), undefined);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no human answerer");
  });

  it("returns the answer only from a signed answer record bound to the question", async () => {
    const dir = workspace();
    let asked: unknown = null;
    const outcome = await run(dir, async (question) => {
      asked = question;
      return signAskUserAnswer(dir, question, "yes, after review", "operator@example.test");
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("yes, after review");
    const q = asked as { questionId: string; sessionId: string; question: string };
    expect(q.sessionId).toBe(SESSION);
    expect(q.question).toBe("Ship to prod?");
    const recordDir = join(dir, ".amc", "native-tools", SESSION, "ask-user");
    expect(existsSync(join(recordDir, `${q.questionId}.question.json`))).toBe(true);
    const answerFile = JSON.parse(readFileSync(join(recordDir, `${q.questionId}.answer.json`), "utf8")) as { record: { answer: string } };
    expect(answerFile.record.answer).toBe("yes, after review");
  });

  it("returns no answer for an unsigned or garbage-signed answer", async () => {
    const dir = workspace();
    const outcome = await run(dir, async (question) => ({
      record: { kind: "amc.native.ask_user.answer", questionId: question.questionId, questionSha256: question.questionSha256, sessionId: SESSION, answer: "AUTO-YES", answeredBy: "model", answeredAt: 1 },
      signature: "bm90LWEtc2lnbmF0dXJl"
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("AUTO-YES");
    expect(outcome.output).toContain("signature");
  });

  it("returns no answer when the signed text is tampered after signing", async () => {
    const dir = workspace();
    const outcome = await run(dir, async (question) => {
      const signed = signAskUserAnswer(dir, question, "no", "operator@example.test");
      return { ...signed, record: { ...signed.record, answer: "TAMPERED-YES" } };
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("TAMPERED-YES");
  });

  it("returns no answer for a validly signed answer to a DIFFERENT question", async () => {
    const dir = workspace();
    const outcome = await run(dir, async (question) =>
      signAskUserAnswer(dir, { ...question, questionId: "q-other" }, "REPLAYED-YES", "operator@example.test"));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("REPLAYED-YES");
  });

  it("returns no answer for an answer signed with the monitor (machine) key", async () => {
    const dir = workspace();
    const outcome = await run(dir, async (question) => {
      const record = { kind: "amc.native.ask_user.answer" as const, questionId: question.questionId, questionSha256: question.questionSha256, sessionId: SESSION, answer: "MACHINE-YES", answeredBy: "monitor", answeredAt: Date.now() };
      return { record, signature: signHexDigest(askUserAnswerDigest(record), getPrivateKeyPem(dir, "monitor")) };
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("MACHINE-YES");
  });

  it("returns no answer when the answerer gives none, throws, or times out", async () => {
    const dir = workspace();
    expect((await run(dir, async () => null)).ok).toBe(false);
    expect((await run(dir, async () => { throw new Error("terminal closed"); })).ok).toBe(false);
    const slow = await run(dir, (_q, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    expect(slow.ok).toBe(false);
    expect(slow.output).toContain("no answer");
  });

  it("rejects an answer outside the offered choices", async () => {
    const dir = workspace();
    const outcome = await run(dir, async (question) => signAskUserAnswer(dir, question, "maybe", "operator@example.test"),
      { question: "Proceed?", choices: ["yes", "no"] });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("maybe");
  });

  it("SIMULATE never asks", async () => {
    const dir = workspace();
    let calls = 0;
    const outcome = await run(dir, async () => { calls += 1; return null; }, { question: "Ship?" }, "SIMULATE");
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("SIMULATE");
    expect(calls).toBe(0);
  });
});

import type { ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { signAskUserAnswer, type AskUserAnswerer, type AskUserItem, type AskUserQuestion, type AskUserQuestionRecord, type SignedAskUserAnswer } from "../tools/builtin/askUserTool.js";
import { readSignedRecord, sessionRecordDir } from "../tools/builtin/nativeToolBreadth/signedSessionRecords.js";

/**
 * `ask_user` in native chat (DXC-24).
 *
 * Each chat turn runs `agent-loop run` as a child. The child's answerer sends
 * the question's id over the dedicated Node IPC channel and waits; the chat
 * parent re-reads the question from the child's MONITOR-signed record (never
 * from the IPC payload), asks on the terminal, and signs what the person typed
 * with the workspace AUDITOR key through `signAskUserAnswer`. The tool then
 * verifies that signature and binding itself, so nothing the IPC carries is
 * trusted on its own. A blank answer, a cancelled turn or a lost channel is no
 * answer, and the call fails.
 */

const ASKED = "amc/native-ask-user";
const ANSWERED = "amc/native-ask-user-answer";
const CANCELLED = "amc/native-ask-user-cancel";
const QUESTION_ID = /^q_[0-9a-f-]{36}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

interface Asked { readonly type: typeof ASKED; readonly v: 1; readonly sessionId: string; readonly questionId: string }

function message(value: unknown, type: string): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && (value as { type?: unknown }).type === type && (value as { v?: unknown }).v === 1
    ? value as Record<string, unknown> : null;
}

/** Child side: relay the question id to the chat parent and await its signed answer. */
export function ipcAskUserAnswerer(): AskUserAnswerer {
  return (question, signal) => new Promise<SignedAskUserAnswer | null>((resolveAnswer, rejectAnswer) => {
    if (typeof process.send !== "function" || !process.connected) {
      rejectAnswer(new Error("the native chat parent is not connected")); return;
    }
    const cleanup = (): void => {
      process.removeListener("message", onMessage);
      process.removeListener("disconnect", onDisconnect);
      signal.removeEventListener("abort", onAbort);
    };
    const onMessage = (value: unknown): void => {
      const reply = message(value, ANSWERED);
      if (reply?.questionId !== question.questionId) return;
      cleanup();
      resolveAnswer((reply.answer ?? null) as SignedAskUserAnswer | null);
    };
    const onDisconnect = (): void => { cleanup(); rejectAnswer(new Error("the native chat parent disconnected")); };
    const onAbort = (): void => {
      cleanup();
      try { process.send?.({ type: CANCELLED, v: 1, questionId: question.questionId }); } catch { /* the parent is gone either way */ }
      resolveAnswer(null);
    };
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
    signal.addEventListener("abort", onAbort, { once: true });
    const asked: Asked = { type: ASKED, v: 1, sessionId: question.sessionId, questionId: question.questionId };
    process.send(asked, (error) => { if (error) { cleanup(); rejectAnswer(new Error("could not deliver the question to native chat")); } });
  });
}

/**
 * Read typed input as one question's selections, or null when it does not fit.
 * Numbers pick offered choices; with allowOther any other text is kept as typed;
 * multiSelect splits on commas.
 */
export function parseAskUserInput(item: AskUserItem, typed: string): string[] | null {
  const text = typed.trim();
  if (text.length === 0) return null;
  const tokens = item.multiSelect ? text.split(",").map((one) => one.trim()).filter((one) => one.length > 0) : [text];
  const selected: string[] = [];
  for (const token of tokens) {
    const index = /^[0-9]+$/.test(token) ? Number(token) - 1 : -1;
    const choice = item.choices?.[index] ?? item.choices?.find((one) => one === token);
    if (choice !== undefined) selected.push(choice);
    else if (item.choices === null || item.allowOther) selected.push(token);
    else return null;
  }
  return selected.length > 0 && new Set(selected).size === selected.length ? selected : null;
}

export interface NativeAskUserPromptOptions {
  readonly child: ChildProcess;
  readonly workspace: string;
  readonly question: (prompt: string, signal?: AbortSignal) => Promise<string | null>;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

/** Parent side: answer the child's signed questions on the terminal, one at a time. */
export function createNativeInteractiveAskUser(options: NativeAskUserPromptOptions): { close(): void } {
  const workspace = resolve(options.workspace);
  const aborts = new Map<string, AbortController>();
  let closed = false;
  let queue = Promise.resolve();
  const reply = (questionId: string, answer: SignedAskUserAnswer | null): void => {
    if (!options.child.connected) return;
    try { options.child.send({ type: ANSWERED, v: 1, questionId, answer }); } catch { /* the tool fails on its own timeout or close */ }
  };
  const ask = async (asked: Asked, signal: AbortSignal): Promise<SignedAskUserAnswer | null> => {
    const file = readSignedRecord<AskUserQuestionRecord>(workspace, join(sessionRecordDir(workspace, asked.sessionId), "ask-user", `${asked.questionId}.question.json`), "monitor");
    if (!file || file.record.kind !== "amc.native.ask_user.question" || file.record.questionId !== asked.questionId || file.record.sessionId !== asked.sessionId) {
      throw new Error("the question has no matching signed record");
    }
    const question: AskUserQuestion = { ...file.record, questionSha256: file.digestSha256 };
    options.log(`The agent asks (${question.questionId}, signed question sha256 ${question.questionSha256}):`);
    const answers: string[][] = [];
    for (const [index, item] of question.questions.entries()) {
      options.log(`${question.questions.length === 1 ? "" : `${index + 1}/${question.questions.length} `}${item.question}`);
      item.choices?.forEach((choice, at) => options.log(`  ${at + 1}. ${choice}`));
      const hint = item.choices === null ? "your answer" : `${item.multiSelect ? "numbers separated by commas" : "a number"}${item.allowOther ? " or your own text" : ""}`;
      for (;;) {
        const typed = await options.question(`Answer with ${hint} (blank gives no answer): `, signal);
        if (typed === null || typed.trim().length === 0) return null;
        const selected = parseAskUserInput(item, typed);
        if (selected) { answers.push(selected); break; }
        options.error("That does not match the offered choices; try again.");
      }
    }
    return signAskUserAnswer(workspace, question, answers, "native-chat-terminal");
  };
  const onMessage = (value: unknown): void => {
    if (closed) return;
    const cancel = message(value, CANCELLED);
    if (cancel) { aborts.get(String(cancel.questionId))?.abort(); return; }
    const asked = message(value, ASKED) as Asked | null;
    if (!asked) return;
    if (typeof asked.questionId !== "string" || !QUESTION_ID.test(asked.questionId) || typeof asked.sessionId !== "string" || !SESSION_ID.test(asked.sessionId)) {
      options.error("ask_user IPC named an invalid question; no answer was given."); return;
    }
    if (aborts.has(asked.questionId) || aborts.size >= 8) { reply(asked.questionId, null); return; }
    const controller = new AbortController();
    aborts.set(asked.questionId, controller);
    queue = queue.then(() => ask(asked, controller.signal)).then(
      (answer) => { if (!answer) options.log("No answer given; the agent's ask_user call fails."); reply(asked.questionId, closed ? null : answer); },
      (error: unknown) => { options.error(`ask_user refused: ${error instanceof Error ? error.message : "question unavailable"}. No answer was given.`); reply(asked.questionId, null); }
    ).finally(() => { aborts.delete(asked.questionId); });
  };
  options.child.on("message", onMessage);
  return {
    close: () => {
      if (closed) return;
      closed = true;
      options.child.removeListener("message", onMessage);
      for (const controller of aborts.values()) controller.abort();
    }
  };
}

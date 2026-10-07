import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { receiptedBody, type NativeReceiptRecorder } from "./nativeToolBreadth/nativeReceipt.js";
import { NativeToolRefusal } from "./nativeToolBreadth/originPolicy.js";
import {
  recordDigest,
  sessionRecordDir,
  sessionIdResolver,
  signRecord,
  verifyRecord,
  writeSignedRecord,
  type SessionIdSource
} from "./nativeToolBreadth/signedSessionRecords.js";
import { writeFileAtomic } from "../../utils/fs.js";

/**
 * `ask_user` — pause the loop on a human, never answer for one (AMC-1549).
 *
 * The body awaits a composition-supplied `answerer` (CLI prompt, Studio
 * inbox). While it waits the turn is blocked on this call; that IS the pause.
 * The tool returns answer text ONLY when the answerer hands back a record that
 *   - is signed with the workspace AUDITOR key (the approvals role, not the
 *     monitor key the agent process signs its own records with),
 *   - names this question's id, digest and session, and
 *   - picks one of the offered choices when choices were offered.
 * No answerer, a null answer, a thrown or timed-out answerer, or any record
 * that fails those checks is a failed call whose output carries no answer.
 * There is no default answerer and no code path that synthesizes one.
 *
 * RECEIPT. Every call leaves one `NATIVE_ASK_USER` ledger row: on an answer,
 * the question id and the question and answer digests (never the answer
 * text), written before the answer is returned; otherwise the refusal.
 *
 * BOUNDARY. A valid signature proves the answer passed through a holder of
 * this workspace's auditor key — the same trust the approvals store rests on.
 * It does not identify which human; `answeredBy` is the answering surface's
 * claim, recorded, not verified.
 */

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const MAX_ANSWER_CHARS = 10_000;

const argsSchema = z.object({
  question: z.string().min(1).max(2_000),
  choices: z.array(z.string().min(1).max(200)).min(2).max(10).optional()
}).strict();

export interface AskUserQuestionRecord {
  readonly schemaVersion: "2026-10-03";
  readonly kind: "amc.native.ask_user.question";
  readonly questionId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly callId: string;
  readonly question: string;
  readonly choices: readonly string[] | null;
  readonly askedAt: number;
}

/** What an answerer is shown: the signed question plus its digest to bind to. */
export interface AskUserQuestion extends AskUserQuestionRecord {
  readonly questionSha256: string;
}

export interface AskUserAnswerRecord {
  readonly kind: "amc.native.ask_user.answer";
  readonly questionId: string;
  readonly questionSha256: string;
  readonly sessionId: string;
  readonly answer: string;
  readonly answeredBy: string;
  readonly answeredAt: number;
}

export interface SignedAskUserAnswer {
  readonly record: AskUserAnswerRecord;
  readonly signature: string;
}

export type AskUserAnswerer = (question: AskUserQuestion, signal: AbortSignal) => Promise<SignedAskUserAnswer | null>;

export function askUserAnswerDigest(record: AskUserAnswerRecord): string {
  return recordDigest(record);
}

/**
 * For the HUMAN-FACING surface only: sign what a person typed. The tool never
 * calls this.
 */
export function signAskUserAnswer(workspace: string, question: AskUserQuestion, answer: string, answeredBy: string): SignedAskUserAnswer {
  const record: AskUserAnswerRecord = {
    kind: "amc.native.ask_user.answer",
    questionId: question.questionId,
    questionSha256: question.questionSha256,
    sessionId: question.sessionId,
    answer,
    answeredBy,
    answeredAt: Date.now()
  };
  return { record, signature: signRecord(workspace, record, "auditor").signature };
}

/** The reason an answer is unusable, or null when it binds and verifies. */
function answerProblem(workspace: string, question: AskUserQuestion, answer: SignedAskUserAnswer): string | null {
  const record = answer.record as Partial<AskUserAnswerRecord> | undefined;
  if (!record || record.kind !== "amc.native.ask_user.answer" || typeof record.answer !== "string") return "the answer record is malformed";
  if (record.questionId !== question.questionId || record.questionSha256 !== question.questionSha256
    || record.sessionId !== question.sessionId) return "the answer is bound to a different question or session";
  if (!verifyRecord(workspace, { record, digestSha256: recordDigest(record), signature: answer.signature, signer: "auditor" }, "auditor")) {
    return "the answer's auditor signature does not verify";
  }
  if (record.answer.length > MAX_ANSWER_CHARS) return "the answer exceeds the size limit";
  if (question.choices && !question.choices.includes(record.answer)) return "the answer is not one of the offered choices";
  return null;
}

function awaitAnswer(answerer: AskUserAnswerer, question: AskUserQuestion, signal: AbortSignal): Promise<SignedAskUserAnswer | null> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(new Error("the wait was cancelled or timed out"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    answerer(question, signal).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export interface AskUserToolOptions {
  readonly sessionId: SessionIdSource;
  readonly record: NativeReceiptRecorder;
  /** Omitted means no human is reachable, and every call refuses. */
  readonly answerer?: AskUserAnswerer;
  readonly timeoutMs?: number;
}

export function askUserTool(options: AskUserToolOptions): ToolDefinition {
  const currentSession = sessionIdResolver(options.sessionId);
  return defineTool({
    name: "ask_user",
    actionClass: "READ_ONLY",
    description: "Ask the human operator a question and wait for their signed answer. Never auto-answered.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        choices: { type: "array", items: { type: "string" } }
      },
      required: ["question"],
      additionalProperties: false
    },
    body: receiptedBody("NATIVE_ASK_USER", options.record, async (execution, allow) => {
      const args = argsSchema.parse(execution.arguments);
      if (execution.effectiveMode === "SIMULATE") return { output: "[amc: SIMULATE ask_user; no question asked]" };
      const answerer = options.answerer;
      if (!answerer) throw new NativeToolRefusal("ask_user", "no human answerer is composed for this session; ask_user never auto-answers");

      const sessionId = currentSession();
      const dir = join(sessionRecordDir(execution.workspace, sessionId), "ask-user");
      const record: AskUserQuestionRecord = {
        schemaVersion: "2026-10-03",
        kind: "amc.native.ask_user.question",
        questionId: `q_${randomUUID()}`,
        sessionId,
        agentId: execution.agentId,
        callId: execution.callId,
        question: args.question,
        choices: args.choices ?? null,
        askedAt: Date.now()
      };
      const signedQuestion = writeSignedRecord(execution.workspace, join(dir, `${record.questionId}.question.json`), record, "monitor");
      const question: AskUserQuestion = { ...record, questionSha256: signedQuestion.digestSha256 };

      const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const signal = execution.signal ? AbortSignal.any([execution.signal, timeout]) : timeout;
      let given: SignedAskUserAnswer | null;
      try {
        given = await awaitAnswer(answerer, question, signal);
      } catch (error: unknown) {
        throw new Error(`ask_user: no answer (${error instanceof Error ? error.message : "answerer failed"})`);
      }
      if (!given) throw new Error("ask_user: no answer was given");
      // Checked and used as one plain-data copy, so nothing the answerer handed
      // back can read differently after it verified.
      const answer = JSON.parse(JSON.stringify(given)) as SignedAskUserAnswer;
      const problem = answerProblem(execution.workspace, question, answer);
      if (problem) throw new NativeToolRefusal("ask_user", `${problem}; no answer is returned`);

      const answerSha256 = recordDigest(answer.record);
      allow({ questionId: record.questionId, questionSha256: question.questionSha256, answerSha256 });
      writeFileAtomic(join(dir, `${record.questionId}.answer.json`), JSON.stringify({
        record: answer.record, digestSha256: answerSha256, signature: answer.signature, signer: "auditor"
      }, null, 2), 0o600);
      return { output: `${answer.record.answer}\n[amc: signed answer to ${record.questionId}]` };
    })
  });
}

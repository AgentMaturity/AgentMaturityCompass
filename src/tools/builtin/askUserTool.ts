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
 *   - answers every question it asked, one selection unless multiSelect, and
 *     only offered choices unless allowOther.
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

const MAX_QUESTIONS = 4;

const itemSchema = z.object({
  question: z.string().min(1).max(2_000),
  choices: z.array(z.string().min(1).max(200)).min(2).max(10).optional(),
  allowOther: z.boolean().optional(),
  multiSelect: z.boolean().optional()
}).strict();

/** One question inline, or up to four in `questions`; either way one signed question and one signed answer. */
const argsSchema = z.union([itemSchema, z.object({ questions: z.array(itemSchema).min(1).max(MAX_QUESTIONS) }).strict()]);

export interface AskUserItem {
  readonly question: string;
  readonly choices: readonly string[] | null;
  /** Free text is accepted alongside the choices. */
  readonly allowOther: boolean;
  /** More than one selection is accepted. */
  readonly multiSelect: boolean;
}

export interface AskUserQuestionRecord {
  readonly schemaVersion: "2026-10-29";
  readonly kind: "amc.native.ask_user.question";
  readonly questionId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly callId: string;
  readonly questions: readonly AskUserItem[];
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
  /** One list of selections per question, in question order. */
  readonly answers: readonly (readonly string[])[];
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
export function signAskUserAnswer(workspace: string, question: AskUserQuestion, answers: readonly (readonly string[])[], answeredBy: string): SignedAskUserAnswer {
  const record: AskUserAnswerRecord = {
    kind: "amc.native.ask_user.answer",
    questionId: question.questionId,
    questionSha256: question.questionSha256,
    sessionId: question.sessionId,
    answers,
    answeredBy,
    answeredAt: Date.now()
  };
  return { record, signature: signRecord(workspace, record, "auditor").signature };
}

/** The reason an answer is unusable, or null when it binds and verifies. */
function answerProblem(workspace: string, question: AskUserQuestion, answer: SignedAskUserAnswer): string | null {
  const record = answer.record as Partial<AskUserAnswerRecord> | undefined;
  if (!record || record.kind !== "amc.native.ask_user.answer" || !Array.isArray(record.answers)
    || !record.answers.every((selected) => Array.isArray(selected) && selected.every((one) => typeof one === "string"))) return "the answer record is malformed";
  if (record.questionId !== question.questionId || record.questionSha256 !== question.questionSha256
    || record.sessionId !== question.sessionId) return "the answer is bound to a different question or session";
  if (!verifyRecord(workspace, { record, digestSha256: recordDigest(record), signature: answer.signature, signer: "auditor" }, "auditor")) {
    return "the answer's auditor signature does not verify";
  }
  if (record.answers.length !== question.questions.length) return `the answer covers ${record.answers.length} of ${question.questions.length} questions`;
  if (record.answers.flat().reduce((total, one) => total + one.length, 0) > MAX_ANSWER_CHARS) return "the answer exceeds the size limit";
  for (const [index, item] of question.questions.entries()) {
    const selected = record.answers[index]!;
    const which = question.questions.length === 1 ? "the answer" : `the answer to question ${index + 1}`;
    if (selected.length === 0 || selected.some((one) => one.trim().length === 0)) return `${which} is empty`;
    if (!item.multiSelect && selected.length !== 1) return `${which} has ${selected.length} selections; one was asked for`;
    if (new Set(selected).size !== selected.length) return `${which} repeats a selection`;
    if (item.choices && !item.allowOther && selected.some((one) => !item.choices!.includes(one))) return `${which} is not one of the offered choices`;
  }
  return null;
}

function renderAnswer(question: AskUserQuestion, answers: readonly (readonly string[])[]): string {
  if (question.questions.length === 1) return answers[0]!.join("\n");
  return question.questions.map((item, index) => `${index + 1}. ${item.question}\n   ${answers[index]!.join("; ")}`).join("\n");
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
        choices: { type: "array", items: { type: "string" } },
        allowOther: { type: "boolean" },
        multiSelect: { type: "boolean" },
        questions: {
          type: "array",
          maxItems: MAX_QUESTIONS,
          description: "Several questions answered together; use instead of question/choices.",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              choices: { type: "array", items: { type: "string" } },
              allowOther: { type: "boolean" },
              multiSelect: { type: "boolean" }
            },
            required: ["question"],
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    body: receiptedBody("NATIVE_ASK_USER", options.record, async (execution, allow) => {
      const args = argsSchema.parse(execution.arguments);
      const questions: AskUserItem[] = ("questions" in args ? args.questions : [args]).map((item) => ({
        question: item.question, choices: item.choices ?? null, allowOther: item.allowOther ?? false, multiSelect: item.multiSelect ?? false
      }));
      if (execution.effectiveMode === "SIMULATE") return { ok: true, output: "[amc: SIMULATE ask_user; no question asked]" };
      const answerer = options.answerer;
      if (!answerer) throw new NativeToolRefusal("ask_user", "no human answerer is composed for this session; ask_user never auto-answers");

      const sessionId = currentSession();
      const dir = join(sessionRecordDir(execution.workspace, sessionId), "ask-user");
      const record: AskUserQuestionRecord = {
        schemaVersion: "2026-10-29",
        kind: "amc.native.ask_user.question",
        questionId: `q_${randomUUID()}`,
        sessionId,
        agentId: execution.agentId,
        callId: execution.callId,
        questions,
        askedAt: Date.now()
      };
      const signedQuestion = writeSignedRecord(execution.workspace, join(dir, `${record.questionId}.question.json`), record, "monitor");
      const question: AskUserQuestion = { ...record, questionSha256: signedQuestion.digestSha256 };

      const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const signal = execution.signal ? AbortSignal.any([execution.signal, timeout]) : timeout;
      let given: SignedAskUserAnswer | null;
      try {
        // The answerer gets a copy, so it cannot change the question its answer is checked against.
        given = await awaitAnswer(answerer, structuredClone(question), signal);
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
      allow({ questionId: record.questionId, questionSha256: question.questionSha256, answerSha256, questionCount: questions.length });
      writeFileAtomic(join(dir, `${record.questionId}.answer.json`), JSON.stringify({
        record: answer.record, digestSha256: answerSha256, signature: answer.signature, signer: "auditor"
      }, null, 2), 0o600);
      return { ok: true, output: `${renderAnswer(question, answer.record.answers)}\n[amc: signed answer to ${record.questionId}]` };
    })
  });
}

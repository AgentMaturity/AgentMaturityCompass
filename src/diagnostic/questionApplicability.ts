import { join } from "node:path";
import { z } from "zod";
import type { DiagnosticQuestion } from "../types.js";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { verifyRawConfigSignature } from "../config/configSignaturePair.js";
import { getAgentPaths } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

/**
 * Which questions a person said do not apply to one agent (P1). A question marked not applicable is left out of the
 * layer and overall averages and out of evidence coverage, and every report lists it with the person's reason. Nothing
 * changes until someone answers: with no file, every question counts, as before. The file is signed with the
 * config-signature key, because leaving a question out can raise a score; a file that does not verify is ignored (every
 * question counts) and the report says so.
 */
export const MAX_APPLICABILITY_REASON = 500;

const fileSchema = z.object({
  v: z.literal(1),
  agentId: z.string(),
  updatedTs: z.number(),
  notApplicable: z.record(z.string(), z.string().min(1).max(MAX_APPLICABILITY_REASON)),
  signature: z.string()
}).strict();

type ApplicabilityFile = z.infer<typeof fileSchema>;

export interface QuestionApplicability {
  /** not_answered: no file, every question counts. answered: the signed file is in use. ignored: a file exists but does not verify. */
  status: "not_answered" | "answered" | "ignored";
  notApplicable: Array<{ questionId: string; title: string; reason: string }>;
}

export function applicabilityPath(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "question-applicability.json");
}

function digestOf(file: Omit<ApplicabilityFile, "signature">): string {
  return sha256Hex(canonicalize(file));
}

function readFile(workspace: string, agentId: string): ApplicabilityFile | "unreadable" | null {
  const path = applicabilityPath(workspace, agentId);
  if (!pathExists(path)) return null;
  try {
    return fileSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  } catch {
    return "unreadable";
  }
}

/** The file's answers when it is this agent's and its signature verifies; otherwise null. */
function verifiedAnswers(workspace: string, agentId: string, file: ApplicabilityFile | "unreadable"): Record<string, string> | null {
  if (file === "unreadable") return null;
  const { signature, ...body } = file;
  return body.agentId === agentId && verifyRawConfigSignature(workspace, digestOf(body), signature) ? body.notApplicable : null;
}

/** The answers in force for this agent and question set. A marked question the set does not contain is left out. */
export function loadQuestionApplicability(
  workspace: string,
  agentId: string,
  questions: ReadonlyArray<Pick<DiagnosticQuestion, "id" | "title">>
): QuestionApplicability {
  const file = readFile(workspace, agentId);
  if (file === null) return { status: "not_answered", notApplicable: [] };
  const answers = verifiedAnswers(workspace, agentId, file);
  if (answers === null) return { status: "ignored", notApplicable: [] };
  const notApplicable = questions
    .filter((question) => Object.hasOwn(answers, question.id))
    .map((question) => ({ questionId: question.id, title: question.title, reason: answers[question.id]! }));
  return { status: "answered", notApplicable };
}

/** The questions that count toward the score: every question, less the ones marked not applicable. */
export function scoredQuestions<T extends Pick<DiagnosticQuestion, "id">>(questions: readonly T[], applicability: QuestionApplicability): T[] {
  const excluded = new Set(applicability.notApplicable.map((row) => row.questionId));
  return questions.filter((question) => !excluded.has(question.id));
}

/**
 * Marks one question not applicable (with the person's reason) or applicable again (`reason` null), and signs the file.
 * Needs the vault unlocked. Refuses an unknown question id and an empty or overlong reason.
 */
export function setQuestionApplicability(params: {
  workspace: string;
  agentId: string;
  question: Pick<DiagnosticQuestion, "id">;
  reason: string | null;
  now?: number;
}): { path: string; notApplicableCount: number } {
  const reason = params.reason === null ? null : params.reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (reason !== null && (reason.length === 0 || reason.length > MAX_APPLICABILITY_REASON)) {
    throw new Error(`Give a reason of 1 to ${MAX_APPLICABILITY_REASON} characters, so a reader of the report knows why the question was left out.`);
  }
  const existing = readFile(params.workspace, params.agentId);
  const kept = existing === null ? {} : verifiedAnswers(params.workspace, params.agentId, existing) ?? {};
  const notApplicable = Object.fromEntries(Object.entries(kept).filter(([id]) => id !== params.question.id));
  if (reason !== null) notApplicable[params.question.id] = reason;
  const body = { v: 1 as const, agentId: params.agentId, updatedTs: params.now ?? Date.now(), notApplicable };
  const signature = signHexDigest(digestOf(body), getSigningKey(params.workspace, "config-signature"));
  const path = applicabilityPath(params.workspace, params.agentId);
  ensureDir(getAgentPaths(params.workspace, params.agentId).rootDir);
  writeFileAtomic(path, `${JSON.stringify({ ...body, signature }, null, 2)}\n`, 0o644);
  return { path, notApplicableCount: Object.keys(notApplicable).length };
}

/** One plain line for reports: what the applicability answers did to this score. */
export function applicabilityLine(applicability: QuestionApplicability | undefined): string {
  if (!applicability || applicability.status === "not_answered") {
    return "Every question counts: nobody has marked a question as not applying to this agent (amc explain <questionId> --not-applicable \"<reason>\").";
  }
  if (applicability.status === "ignored") {
    return "Every question counts: the list of questions marked not applicable does not verify against this workspace's signing key, so it was ignored.";
  }
  const count = applicability.notApplicable.length;
  return count === 0
    ? "Every question counts: no question is marked as not applying to this agent."
    : `${count} question${count === 1 ? " is" : "s are"} marked as not applying to this agent and left out of the averages and evidence coverage:`;
}

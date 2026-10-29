import { signAskUserAnswer, type AskUserAnswerer } from "../tools/builtin/askUserTool.js";

/**
 * `ask_user` over ACP (DXC-24, WP40).
 *
 * The question goes to the client as the extension request `_amc/ask_user`
 * with the signed question's id, digest and items. The client answers
 * `{ outcome: "answered", answers: string[][] }` (one list of selections per
 * question) or `{ outcome: "cancelled" }`. The AMC process (the host) signs an
 * answer with the workspace auditor key through `signAskUserAnswer`; the tool
 * then checks binding, signature and choices itself, so a malformed or
 * off-choice reply is still refused there. A cancel, an error reply, a lost
 * connection or a malformed reply is no answer, and the call fails.
 *
 * BOUNDARY. Opted in per process with `amc acp --ask-user`: the operator is
 * saying the connected client is the human surface, the same trust the chat
 * terminal gets. The signature says the answer came through this host, not
 * which person typed it; `answeredBy` records the surface.
 */

export const ACP_ASK_USER_METHOD = "_amc/ask_user";

const MAX_SELECTIONS = 10;

function answersFrom(result: unknown, questionCount: number): string[][] | null {
  const reply = result as { outcome?: unknown; answers?: unknown } | null;
  if (reply?.outcome !== "answered" || !Array.isArray(reply.answers) || reply.answers.length !== questionCount) return null;
  const answers: string[][] = [];
  for (const selected of reply.answers as unknown[]) {
    if (!Array.isArray(selected) || selected.length === 0 || selected.length > MAX_SELECTIONS || !selected.every((one) => typeof one === "string")) return null;
    answers.push([...selected as string[]]);
  }
  return answers;
}

export function acpAskUserAnswerer(options: {
  readonly workspace: string;
  readonly request: (method: string, params: unknown, signal: AbortSignal) => Promise<unknown>;
}): AskUserAnswerer {
  return async (question, signal) => {
    const result = await options.request(ACP_ASK_USER_METHOD, {
      sessionId: question.sessionId, questionId: question.questionId, questionSha256: question.questionSha256, questions: question.questions
    }, signal);
    const answers = answersFrom(result, question.questions.length);
    return answers === null ? null : signAskUserAnswer(options.workspace, question, answers, "acp-client");
  };
}

/**
 * `amc explain <questionId> --not-applicable "<reason>"` and `--applicable` (P1): record, signed, whether a question
 * applies to this folder's agent. Kept out of cli.ts (under a line cap).
 */
import chalk from "chalk";
import { resolveAgentId } from "../fleet/paths.js";
import { setQuestionApplicability } from "../diagnostic/questionApplicability.js";
import { toErrorMessage } from "../utils/errors.js";

export function markQuestionApplicability(
  workspace: string,
  explicitAgentId: string | undefined,
  question: { questionId: string; title: string },
  reason: string | null
): void {
  const agentId = resolveAgentId(workspace, explicitAgentId);
  try {
    const result = setQuestionApplicability({ workspace, agentId, question: { id: question.questionId }, reason });
    console.log(reason === null
      ? chalk.green(`${question.title} (${question.questionId}) counts in ${agentId}'s score again.`)
      : chalk.green(`${question.title} (${question.questionId}) is marked as not applying to ${agentId}. It is left out of the score and listed, with your reason, in every report.`));
    console.log(chalk.gray(`  Questions marked not applicable for this agent: ${result.notApplicableCount}. The change shows in the next score: run amc`));
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    console.error(chalk.red(/vault|locked|passphrase|key/i.test(message)
      ? "This change is signed with the vault, and the vault is locked. Unlock it with amc vault unlock, then run this again."
      : message));
    process.exit(1);
  }
}

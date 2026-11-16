/**
 * Small first-run guards and lines for bare `amc`, `amc score` and `amc doctor`, kept out of cli.ts (under a line cap).
 */
import chalk from "chalk";
import { agentExists } from "../fleet/paths.js";
import type { DiagnosticReport, QuestionScore } from "../types.js";

/** A score for an agent nobody added describes nothing, and scoring it used to create its folder as a side effect (CLI-17). */
export function refuseUnknownAgent(workspace: string, agentId: string): void {
  if (agentExists(workspace, agentId)) return;
  console.error(chalk.red(`There is no agent named '${agentId}' in this folder.`));
  console.error("List the agents here with: amc agent list. Add one with: amc agent add. Leave --agent out to use this folder's own agent.");
  process.exit(1);
}

/** No terminal means nobody saw a question, so bare amc sets up a new folder only on an explicit --yes (L-03). */
export function refuseNewFolderWithoutTerminal(workspace: string): void {
  console.error("AMC has not set up this folder yet, and there is no terminal here to ask you first.");
  console.error(`Setting it up creates a .amc/ folder in ${workspace} (AMC's settings, signing keys and records for this folder) and then prints an empty score.`);
  console.error("To go ahead without a terminal, run: amc --yes");
  console.error("Or run amc in a terminal and pick what to do from its menu.");
  process.exit(1);
}

/**
 * The lowest questions by title, with the id in small print for `amc explain`; flag codes stay in the JSON (CLI-20).
 * Only questions below the highest level AMC can evaluate for them, and not marked not applicable (P12): a gap no step
 * can close is not a gap to work on.
 */
export async function printTopGaps(scores: readonly QuestionScore[], applicability?: DiagnosticReport["questionApplicability"]): Promise<void> {
  const { allKnownQuestions } = await import("../diagnostic/questionSets.js");
  const { reachableLevel } = await import("../diagnostic/levelSemantics.js");
  const questions = new Map(allKnownQuestions().map((question) => [question.id, question]));
  const excluded = new Set((applicability?.notApplicable ?? []).map((row) => row.questionId));
  const gaps = scores
    .filter((score) => !excluded.has(score.questionId) && score.finalLevel < Math.min(3, reachableLevel(questions.get(score.questionId))))
    .slice(0, 5);
  console.log("");
  if (gaps.length === 0) {
    console.log(chalk.gray("  Every question is at the highest level AMC can evaluate for it today."));
    return;
  }
  console.log(chalk.yellow("  Top gaps (each can move up a level):"));
  for (const gap of gaps) console.log(chalk.gray(`    ${questions.get(gap.questionId)?.title ?? gap.questionId}: L${gap.finalLevel} (${gap.questionId})`));
  console.log(chalk.gray(`  Why a question is at its level: amc explain ${gaps[0]!.questionId}`));
}

/** The doctor's closing step: once this folder has a score, scoring again, not a "first" score (CLI-21). */
export async function scoreStep(workspace: string): Promise<{ cmd: string; desc: string }> {
  const { hasAnyRun } = await import("../startup/startupGuidance.js");
  return { cmd: "amc", desc: hasAnyRun(workspace) ? "Score again and see what changed" : "Get your first full maturity score" };
}

/** `amc guide --go` without a terminal and with no agent instruction file: nothing is written unless one is named (CLI-18). */
export function printNoAgentInstructionFile(): void {
  console.log(chalk.yellow("  No agent instruction file was found here (AGENTS.md, CLAUDE.md and the like), so nothing was written."));
  console.log(chalk.gray("  To create AGENTS.md with these guardrails:"), chalk.hex("#4AEF79")("amc guide --go --apply AGENTS.md"));
  console.log("");
}

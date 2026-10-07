import type { Command } from "commander";
import { claimLabelRecorded, resetClaimLabelRecord } from "./claimOutput.js";
import { RESULT_COMMAND_BY_PATH } from "./resultCommandRegistry.js";

export const UNLABELLED_RESULT_LINE = "Claim: not labelled — treat as self-reported";
/** EX_SOFTWARE: the command ran, but its output broke the labelling contract. */
export const UNLABELLED_EXIT_CODE = 70;

/** The registered path of a command, e.g. "score fail-secure" (aliases resolve to names). */
export function commandPath(command: Command): string {
  const names: string[] = [];
  let cursor: Command | null = command;
  while (cursor && cursor.parent) {
    if (cursor.name() && cursor.name() !== "amc") {
      names.unshift(cursor.name());
    }
    cursor = cursor.parent;
  }
  return names.join(" ").trim();
}

function jsonRequested(command: Command): boolean {
  const opts = command.optsWithGlobals<{ json?: boolean; format?: string }>();
  return opts.json === true || opts.format === "json";
}

/**
 * After a registered result command succeeds without a claim label: strict mode (AMC_CLAIM_LABELS_STRICT=1)
 * fails it with exit code 70; otherwise text output gets a fallback line. A command that already failed or
 * refused is left alone. `process.exit()` skips postAction, so registered commands set `process.exitCode`.
 */
export function installClaimLabelHooks(program: Command): void {
  program.hook("preAction", () => resetClaimLabelRecord());
  program.hook("postAction", (_thisCommand, actionCommand) => {
    const path = commandPath(actionCommand);
    const entry = RESULT_COMMAND_BY_PATH.get(path);
    if (!entry || claimLabelRecorded() || (entry.when && !entry.when(actionCommand.opts()))) return;
    if (process.exitCode !== undefined && process.exitCode !== 0) return;
    if (process.env.AMC_CLAIM_LABELS_STRICT === "1") {
      process.stderr.write(`amc: ${path} printed a result without a claim label\n`);
      process.exitCode = UNLABELLED_EXIT_CODE;
      return;
    }
    if (!jsonRequested(actionCommand)) console.log(UNLABELLED_RESULT_LINE);
  });
}

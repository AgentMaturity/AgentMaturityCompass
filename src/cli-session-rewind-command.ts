/**
 * `amc session rewind <session> --to-turn N` (HP-06): put back the files a session's native file tools changed after
 * turn N, then continue the conversation from turn N with `amc agent-loop chat --fork-from <session>`. The library is
 * src/session/sessionRewind.ts; this file only parses, gates and prints.
 *
 * A person's act: agent mode refuses the whole command, --dry-run included (OWNER_ONLY_COMMAND_PATHS), and the rewind
 * itself needs a person at an interactive terminal with no agent marker set; --dry-run only reads, so it needs neither of those.
 */
import type { Command } from "commander";
import chalk from "chalk";
import { escapeTerminalControls } from "./utils/terminalEscape.js";

/** Printed every time: what a rewind never puts back. */
const REWIND_NOT_COVERED = [
  "A rewind never undoes: changes made by shell commands or background jobs, files outside this workspace,",
  "anything sent or done elsewhere (network calls, MCP tools, messages sent), files too large to keep a copy of,",
  "file permissions, and folders the session created."
];

interface RewindOptions { readonly toTurn: string; readonly dryRun?: boolean; readonly onlyClean?: boolean; readonly json?: boolean }

const short = (digest: string | null): string => digest === null ? "(no file)" : digest.slice(0, 12);

export function registerSessionRewindCommand(session: Command): void {
  session
    .command("rewind")
    .description("Put back the files a session's file tools changed after a turn, then continue from that turn as a new session")
    .argument("<id>", "session id")
    .requiredOption("--to-turn <n>", "the last turn to keep (0 means before the first turn)")
    .option("--dry-run", "show what would be put back and what cannot be, and change nothing")
    .option("--only-clean", "put back the files that have no conflict and leave the others as they are")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: RewindOptions) => {
      const { planSessionRewind, executeSessionRewind, REWIND_CONFLICT_WORDS, SessionRewindRefused } = await import("./session/sessionRewind.js");
      const { interactiveOperator, operatorRefusalText } = await import("./vault/operatorContext.js");
      const say = (line: string) => { if (!opts.json) console.log(escapeTerminalControls(line)); };
      try {
        if (!/^(0|[1-9][0-9]{0,8})$/.test(opts.toTurn)) throw new SessionRewindRefused("TURN", "--to-turn takes a turn number: 0, 1, 2 and so on.");
        if (!opts.dryRun) {
          const operator = interactiveOperator({ workspace: process.cwd() });
          if (!operator.ok) throw new SessionRewindRefused("PERSON", `A rewind changes files, so a person at an interactive terminal runs it, and ${operatorRefusalText(operator)}. Nothing was changed. --dry-run shows the plan.`);
        }
        const plan = planSessionRewind(process.cwd(), id, Number(opts.toTurn));
        say(`${opts.dryRun ? "Rewind plan" : "Rewind"} for session ${id}: keep turns up to ${plan.toTurn}.`);
        for (const file of plan.files) say(`  ${file.toSha256 === null ? "remove (the session created it)" : "put back"}  ${file.path}  ${short(file.fromSha256)} -> ${short(file.toSha256)}`);
        for (const conflict of plan.conflicts) say(`  cannot put back  ${conflict.path}: ${REWIND_CONFLICT_WORDS[conflict.reason]}`);
        if (plan.files.length === 0 && plan.conflicts.length === 0) say("  No file changed by this session's file tools after that turn.");
        if (plan.uncoveredCalls > 0) say(`  ${plan.uncoveredCalls} shell or background command(s) ran after turn ${plan.toTurn}; whatever they changed stays as it is.`);
        for (const line of REWIND_NOT_COVERED) say(line);
        if (opts.dryRun) {
          if (plan.conflicts.length > 0) say(`With conflicts, a rewind changes nothing unless you add --only-clean.`);
          if (opts.json) console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
          return;
        }
        const outcome = executeSessionRewind(process.cwd(), plan, { onlyClean: opts.onlyClean === true });
        for (const result of outcome.results) say(`  ${result.status === "failed" ? chalk.red("not changed (it changed while the rewind ran)") : result.status === "removed" ? "removed" : "put back"}  ${result.path}`);
        say(`Recorded as rewind ${outcome.finishedEventId}. The session's own rows are unchanged.`);
        say(`Continue from turn ${plan.toTurn}: amc agent-loop chat --fork-from ${id}`);
        if (opts.json) console.log(JSON.stringify({ dryRun: false, plan, outcome }, null, 2));
        if (outcome.results.some((result) => result.status === "failed")) process.exitCode = 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(escapeTerminalControls(error instanceof SessionRewindRefused ? message : `Rewind refused: ${message}`)));
        process.exitCode = 1;
      }
    });
}

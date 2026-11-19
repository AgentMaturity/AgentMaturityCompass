/**
 * `amc session rewind <session> --to-turn N` (HP-06): put back the files a session's native file tools changed after
 * turn N, then continue the conversation from turn N with `amc agent-loop chat --fork-from <session>`. The library is
 * src/session/sessionRewind.ts (plan) and sessionRewindApply.ts (apply); this file only parses, gates, asks and prints.
 *
 * A person's act: agent mode refuses the whole command, --dry-run included (OWNER_ONLY_COMMAND_PATHS), and the rewind
 * itself needs a person at an interactive terminal with no agent marker set, who reads the plan and types the word
 * `rewind` (read with plain readline; end of input or anything else writes nothing). There is no flag that skips it.
 * --dry-run only reads, so it needs neither the terminal nor the answer.
 */
import type { Command } from "commander";
import chalk from "chalk";
import { escapeTerminalControls } from "./utils/terminalEscape.js";

/** Printed every time: what a rewind never puts back. */
const REWIND_NOT_COVERED = [
  "A rewind never undoes: changes made by shell commands, background jobs, terminals, child agents, workflows, MCP tools",
  "or code runs; files outside this workspace; anything sent or done elsewhere (network calls, messages sent); files too",
  "large to keep a copy of; folders the session created. Like AMC's file tools, it checks each file's place and content",
  "right before writing it, but another program running at that same instant can still race that last check."
];
const CONFIRM_WORD = "rewind";

interface RewindOptions { readonly toTurn: string; readonly dryRun?: boolean; readonly onlyClean?: boolean; readonly json?: boolean }

const short = (digest: string | null): string => digest === null ? "(no file)" : digest.slice(0, 12);
const DONE_WORDS = { restored: "put back", recreated: "re-created", removed: "removed", already: "already back" } as const;
const ACTION_WORDS = { restore: "put back", recreate: "re-create (the session deleted it)", remove: "remove (the session created it)", already: "already back" } as const;

export function registerSessionRewindCommand(session: Command, readLine?: (prompt: string) => Promise<string | null>): void {
  session
    .command("rewind")
    .description("Put back the files a session's file tools changed after a turn, then continue from that turn as a new session")
    .argument("<id>", "session id")
    .requiredOption("--to-turn <n>", "the last turn to keep (0 means before the first turn)")
    .option("--dry-run", "show what would be put back and what cannot be, and change nothing")
    .option("--only-clean", "put back the files that have no conflict and leave the others as they are")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: RewindOptions) => {
      const { planSessionRewind, REWIND_CONFLICT_WORDS, SessionRewindRefused } = await import("./session/sessionRewind.js");
      const { executeSessionRewind, RECREATED_DEFAULT_MODE } = await import("./session/sessionRewindApply.js");
      const { unfinishedRewindOf } = await import("./session/sessionRewindEvidence.js");
      const { interactiveOperator, operatorRefusalText } = await import("./vault/operatorContext.js");
      const say = (line: string) => { if (!opts.json) console.log(escapeTerminalControls(line)); };
      try {
        if (!/^(0|[1-9][0-9]{0,8})$/.test(opts.toTurn)) throw new SessionRewindRefused("TURN", "--to-turn takes a turn number: 0, 1, 2 and so on.");
        if (!opts.dryRun) {
          const operator = interactiveOperator({ workspace: process.cwd() });
          if (!operator.ok) throw new SessionRewindRefused("PERSON", `A rewind changes files, so a person at an interactive terminal runs it, and ${operatorRefusalText(operator)}. Nothing was changed. --dry-run shows the plan.`);
        }
        const plan = planSessionRewind(process.cwd(), id, Number(opts.toTurn), unfinishedRewindOf(process.cwd(), id));
        say(`${opts.dryRun ? "Rewind plan" : "Rewind"} for session ${id}: keep turns up to ${plan.toTurn}.`);
        if (plan.unfinishedIntendedEventId !== null) say(`An earlier rewind of this session did not finish (record ${plan.unfinishedIntendedEventId}); files already back count as done.`);
        for (const file of plan.files) {
          const flags = file.flags.length === 0 ? "" : `  [look twice: ${file.flags.join(", ")}]`;
          say(`  ${ACTION_WORDS[file.action]}  ${file.path}  ${short(file.fromSha256)} -> ${short(file.toSha256)}  ${file.toSha256 === null ? "" : `${file.bytes} bytes`}${flags}`);
          if (file.action === "recreate" && file.mode === null) say(`    no permissions were recorded for it, so it comes back readable by you only (${RECREATED_DEFAULT_MODE.toString(8)})`);
        }
        for (const conflict of plan.conflicts) say(`  cannot put back  ${conflict.path}: ${REWIND_CONFLICT_WORDS[conflict.reason]}`);
        if (plan.files.length === 0 && plan.conflicts.length === 0) say("  No file changed by this session's file tools after that turn.");
        if (plan.uncoveredCalls > 0) say(`  ${plan.uncoveredCalls} other tool call(s) that can change things ran after turn ${plan.toTurn}; whatever they changed stays as it is.`);
        for (const line of REWIND_NOT_COVERED) say(line);
        say("An open chat on this session cannot be detected (between turns it holds no writer); if one is open, its next turn continues the old conversation.");
        if (opts.dryRun) {
          if (plan.conflicts.length > 0) say(`With conflicts, a rewind changes nothing unless you add --only-clean.`);
          if (opts.json) console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
          return;
        }
        if (plan.conflicts.length > 0 && opts.onlyClean !== true) {
          throw new SessionRewindRefused("CONFLICTS", `${plan.conflicts.length} file(s) cannot be put back safely, so nothing was written. Add --only-clean to put back only the others.`);
        }
        const read = readLine ?? (await import("./setup/codingAdoption.js")).readTypedLine;
        const answer = await read(`Type ${CONFIRM_WORD} to change these files, anything else changes nothing: `);
        if (answer?.trim() !== CONFIRM_WORD) throw new SessionRewindRefused("CONFIRM", "Not confirmed. Nothing was changed.");
        const outcome = executeSessionRewind(plan, { onlyClean: opts.onlyClean === true });
        for (const result of outcome.results) {
          say(`  ${result.status === "failed" ? chalk.red("not changed (its place or content changed while the rewind ran)") : DONE_WORDS[result.status]}  ${result.path}`
            + (result.modeDefaulted ? `  (permissions ${RECREATED_DEFAULT_MODE.toString(8)})` : ""));
        }
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

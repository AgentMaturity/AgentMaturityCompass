import chalk from "chalk";
import type { Command } from "commander";
import { assertOwnerMode } from "../mode/mode.js";
import { inspectGuardrailControlState, recoverGuardrailControlState } from "./guardrailControlState.js";
import { applyGuardrailControlProfileAsync, setGuardrailRequestedAsync } from "./guardrailControlAsync.js";
import { listGuardrailsWithRuntimeStatus } from "./guardrailRuntimeBindings.js";
import { INPUT_GUARD_CLAIM, INPUT_GUARD_PROFILE, inputGuardModeArg } from "./inputGuardProfile.js";

/** What a person reads after switching the untrusted-input guard: what it now does, what it does not, and the other modes. */
function reportInputGuard(mode: string, revision: number): void {
  const said = mode === "enforce"
    ? "On. After the agent reads untrusted content (a web page, an MCP tool, a file outside this project), AMC asks you before it "
      + "sends data out or makes a high-impact change, and blocks a send when the session has also read private data."
    : mode === "log_only"
      ? "Log only. AMC changes no decision; each hook decision record says what the guard would have done."
      : "Off. Hook decisions are what your signed policies alone decide.";
  console.log(chalk.green(`Untrusted-input guard: ${said} (signed revision ${revision})`));
  console.log(chalk.gray(`What it covers: ${INPUT_GUARD_CLAIM}`));
  console.log(chalk.gray("It works only where AMC's hooks run in control mode (amc connect hooks install --provider claude-code --mode control)."
    + " Codex is observed only: AMC records what the guard would have done there."));
  if (mode !== "log_only") console.log(chalk.gray(`To watch first without blocking anything: amc guardrails profile ${INPUT_GUARD_PROFILE} --mode log-only`));
  if (mode !== "off") console.log(chalk.gray(`To switch it off: amc guardrails profile ${INPUT_GUARD_PROFILE} --mode off`));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportCommandError(error: unknown): void {
  console.error(chalk.red(message(error)));
  process.exitCode = 1;
}

function reportEffectiveStatus(name: string): void {
  try {
    const guardrail = listGuardrailsWithRuntimeStatus(process.cwd()).find((row) => row.name === name);
    console.log(chalk.gray(`  Effective: ${guardrail?.effective ? "yes" : "no"}; ${guardrail?.reason ?? "status unavailable"}`));
  } catch (error) {
    console.log(chalk.yellow(`  Request committed, but effective status could not be refreshed: ${message(error)}`));
  }
}

function registerRequestedStateCommand(guardrails: Command, enabled: boolean): void {
  guardrails
    .command(`${enabled ? "enable" : "disable"} <name>`)
    .description(enabled
      ? "Request a signed, runtime-bound guardrail"
      : "Remove an additive guardrail request without weakening signed policy")
    .action(async (name: string) => {
      try {
        assertOwnerMode(process.cwd(), enabled ? "guardrails enable" : "guardrails disable");
        recoverGuardrailControlState(process.cwd());
        listGuardrailsWithRuntimeStatus(process.cwd());
        const state = await setGuardrailRequestedAsync({
          workspace: process.cwd(),
          name,
          enabled,
          source: "cli",
          actor: "local-cli"
        });
        const action = enabled ? "saved" : "removed";
        console.log((enabled ? chalk.green : chalk.yellow)(
          `Signed guardrail request ${action}: ${name} (revision ${state.revision})`
        ));
        reportEffectiveStatus(name);
      } catch (error) {
        reportCommandError(error);
      }
    });
}

export function registerGuardrailControlCommands(program: Command): void {
  const guardrails = program.command("guardrails").description("Signed runtime guardrail controls");

  guardrails
    .command("list")
    .description("List signed requested state and effective runtime guardrail bindings")
    .option("--json", "Output as JSON")
    .action((options: { json?: boolean }) => {
      try {
        const rows = listGuardrailsWithRuntimeStatus(process.cwd());
        if (options.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }
        console.log(chalk.bold("\nGuardrail Runtime Bindings\n"));
        for (const guardrail of rows) {
          const status = !guardrail.mutable
            ? guardrail.enforcement === "enforced" ? chalk.green("PIPELINE ") : chalk.gray("CATALOG  ")
            : guardrail.effective
              ? chalk.green("EFFECTIVE")
              : guardrail.requestedEnabled
                ? chalk.yellow("REQUESTED")
                : chalk.gray("INACTIVE ");
          console.log(`  ${status}  ${guardrail.name.padEnd(30)} ${chalk.gray(guardrail.reason)}`);
        }
        console.log(chalk.gray("\nRequested state is additive. A signed Runtime Firewall policy cannot be weakened by this command."));
        const guard = inspectGuardrailControlState(process.cwd());
        const mode = guard.integrity === "invalid" ? "setting unreadable, so treated as on" : guard.state?.untrustedInputGuard === "log_only" ? "log only"
          : guard.state?.untrustedInputGuard === "enforce" ? "on" : "off";
        console.log(`\nUntrusted-input guard (${INPUT_GUARD_PROFILE}): ${mode}. Change it with: amc guardrails profile ${INPUT_GUARD_PROFILE} --mode enforce|log-only|off`);
      } catch (error) {
        reportCommandError(error);
      }
    });

  registerRequestedStateCommand(guardrails, true);
  registerRequestedStateCommand(guardrails, false);

  guardrails
    .command("profile <name>")
    .description(`Apply bound controls from a signed additive profile, or switch the ${INPUT_GUARD_PROFILE} preset (${INPUT_GUARD_CLAIM})`)
    .option("--mode <mode>", `Only for ${INPUT_GUARD_PROFILE}: enforce (default), log-only (changes no decision, records what it would do) or off`)
    .action(async (profileName: string, options: { mode?: string }) => {
      try {
        assertOwnerMode(process.cwd(), "guardrails profile");
        if (options.mode !== undefined && profileName !== INPUT_GUARD_PROFILE) throw new Error(`--mode applies only to ${INPUT_GUARD_PROFILE}.`);
        if (profileName === INPUT_GUARD_PROFILE) {
          const mode = inputGuardModeArg(options.mode);
          recoverGuardrailControlState(process.cwd());
          const result = await applyGuardrailControlProfileAsync({ workspace: process.cwd(), profileName, source: "cli", actor: "local-cli", mode });
          reportInputGuard(mode, result.state.revision);
          return;
        }
        recoverGuardrailControlState(process.cwd());
        listGuardrailsWithRuntimeStatus(process.cwd());
        const result = await applyGuardrailControlProfileAsync({
          workspace: process.cwd(),
          profileName,
          source: "cli",
          actor: "local-cli"
        });
        let effectiveSummary = "status pending";
        let rows: ReturnType<typeof listGuardrailsWithRuntimeStatus> = [];
        try {
          rows = listGuardrailsWithRuntimeStatus(process.cwd());
          effectiveSummary = `${rows.filter((guardrail) => guardrail.effective).length} effective`;
        } catch (error) {
          console.log(chalk.yellow(`Profile committed, but effective status could not be refreshed: ${message(error)}`));
        }
        console.log(chalk.green(
          `Applied signed profile: ${profileName} (${result.state.requestedGuardrails.length} bound requests, ${effectiveSummary})`
        ));
        for (const name of result.state.requestedGuardrails) console.log(`  - ${name}`);
        for (const name of result.unsupported) {
          const row = rows.find((candidate) => candidate.name === name);
          console.log(row?.enforcement === "enforced"
            ? chalk.gray(`  - ${name} (enforced at ${row.boundary}; not set by profiles)`)
            : chalk.yellow(`  - ${name} (not enforced)`));
        }
      } catch (error) {
        reportCommandError(error);
      }
    });
}

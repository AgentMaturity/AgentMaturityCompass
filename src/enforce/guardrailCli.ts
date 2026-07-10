import chalk from "chalk";
import type { Command } from "commander";
import { applyGuardrailControlProfile, recoverGuardrailControlState, setGuardrailRequested } from "./guardrailControlState.js";
import { listGuardrailsWithRuntimeStatus } from "./guardrailRuntimeBindings.js";

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
    .action((name: string) => {
      try {
        recoverGuardrailControlState(process.cwd());
        listGuardrailsWithRuntimeStatus(process.cwd());
        const state = setGuardrailRequested({
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
            ? chalk.gray("CATALOG  ")
            : guardrail.effective
              ? chalk.green("EFFECTIVE")
              : guardrail.requestedEnabled
                ? chalk.yellow("REQUESTED")
                : chalk.gray("INACTIVE ");
          console.log(`  ${status}  ${guardrail.name.padEnd(30)} ${chalk.gray(guardrail.reason)}`);
        }
        console.log(chalk.gray("\nRequested state is additive. A signed Runtime Firewall policy cannot be weakened by this command."));
      } catch (error) {
        reportCommandError(error);
      }
    });

  registerRequestedStateCommand(guardrails, true);
  registerRequestedStateCommand(guardrails, false);

  guardrails
    .command("profile <name>")
    .description("Apply bound controls from a signed additive profile")
    .action((profileName: string) => {
      try {
        recoverGuardrailControlState(process.cwd());
        listGuardrailsWithRuntimeStatus(process.cwd());
        const result = applyGuardrailControlProfile({
          workspace: process.cwd(),
          profileName,
          source: "cli",
          actor: "local-cli"
        });
        let effectiveSummary = "status pending";
        try {
          const count = listGuardrailsWithRuntimeStatus(process.cwd()).filter((guardrail) => guardrail.effective).length;
          effectiveSummary = `${count} effective`;
        } catch (error) {
          console.log(chalk.yellow(`Profile committed, but effective status could not be refreshed: ${message(error)}`));
        }
        console.log(chalk.green(
          `Applied signed profile: ${profileName} (${result.state.requestedGuardrails.length} bound requests, ${effectiveSummary})`
        ));
        for (const name of result.state.requestedGuardrails) console.log(`  - ${name}`);
        if (result.unsupported.length > 0) {
          console.log(chalk.yellow(`  Catalog-only, not activated: ${result.unsupported.join(", ")}`));
        }
      } catch (error) {
        reportCommandError(error);
      }
    });
}

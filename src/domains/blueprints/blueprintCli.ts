import chalk from "chalk";
import type { Command } from "commander";
import type { ActionClass } from "../../types.js";
import { toErrorMessage } from "../../utils/errors.js";
import { renderBlueprintFiles } from "./blueprintRender.js";
import { BlueprintRefusedError } from "./blueprintTypes.js";

/**
 * `amc blueprint render <station> [--pack id] [--out dir] ...`
 *
 * Not yet registered: src/cli.ts is a serial-only surface. The one-line wiring
 * is in docs/INDUSTRY_BLUEPRINTS.md ("Ready to wire").
 */

function splitClasses(value: string): ActionClass[] {
  return value.split(",").map((part) => part.trim()).filter((part) => part.length > 0) as ActionClass[];
}

export function registerBlueprintCommand(program: Command): void {
  const blueprint = program.command("blueprint").description("Regulated-agent blueprints derived from industry packs");
  blueprint
    .command("render <station>")
    .description("Compose a governed agent definition for a station (or one pack) and write yaml, json and a summary")
    .option("--pack <id>", "render one industry pack instead of the whole station")
    .option("--out <dir>", "output directory (never under .amc/)", "blueprints")
    .option("--tool-classes <list>", "comma-separated action classes to grant, e.g. READ_ONLY,WRITE_LOW", splitClasses)
    .option("--approvals <n>", "required approvals for gated classes (never below the workspace default for WRITE_HIGH)", (v) => Number.parseInt(v, 10))
    .option("--json", "print the blueprint as JSON instead of a summary")
    .action((station: string, opts: { pack?: string; out: string; toolClasses?: ActionClass[]; approvals?: number; json?: boolean }) => {
      try {
        const result = renderBlueprintFiles(
          {
            station,
            ...(opts.pack === undefined ? {} : { packId: opts.pack }),
            ...(opts.toolClasses === undefined ? {} : { toolClasses: opts.toolClasses }),
            ...(opts.approvals === undefined || Number.isNaN(opts.approvals) ? {} : { approvals: { requiredApprovals: opts.approvals } })
          },
          { outDir: opts.out }
        );
        if (opts.json) {
          console.log(JSON.stringify({ files: result.files, blueprint: result.blueprint }, null, 2));
          return;
        }
        console.log(chalk.green(`Blueprint ${result.blueprint.name} -- ${result.blueprint.guardrails.length} guardrails under ${result.blueprint.profile.ruleId}`));
        for (const file of result.files) console.log(chalk.gray("  wrote"), file);
        console.log(chalk.gray("Review, then register into .amc/agents.yaml (signed); this command never writes .amc/."));
      } catch (error: unknown) {
        if (error instanceof BlueprintRefusedError) {
          console.error(chalk.red("Blueprint refused:"));
          for (const refusal of error.refusals) console.error(chalk.red(`  ${refusal.rule}`), refusal.message);
        } else {
          console.error(chalk.red(toErrorMessage(error)));
        }
        process.exitCode = 1;
      }
    });
}

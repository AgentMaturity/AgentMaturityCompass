/**
 * CLI handler for `amc transparency report`
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { listAgents } from "../fleet/registry.js";
import {
  generateTransparencyReport,
  renderTransparencyReportMarkdown,
  renderTransparencyReportJson,
} from "./transparencyReport.js";

export function registerTransparencyReportCommands(program: Command): void {
  // Attach to the existing "transparency" command if it exists, or create new
  let transparency = program.commands.find((c) => c.name() === "transparency") as Command | undefined;
  if (!transparency) {
    transparency = program
      .command("transparency")
      .description("Agent transparency and auditability tools");
  }

  transparency
    .command("report [agentId]")
    .description("Generate an Agent Transparency Report — what the agent does, can access, and how trustworthy it is")
    .option("--format <fmt>", "Output format: md | json", "md")
    .option("--out <file>", "Write report to file instead of stdout")
    .option("--all", "Generate reports for all registered agents")
    .option("--workspace <path>", "AMC workspace path", process.cwd())
    .action(
      async (
        agentId: string | undefined,
        opts: {
          format: string;
          out?: string;
          all?: boolean;
          workspace: string;
        }
      ) => {
        const workspace = resolve(opts.workspace);

        if (opts.all) {
          const agents = listAgents(workspace);
          if (agents.length === 0) {
            console.error(chalk.yellow("No agents registered in this workspace."));
            process.exit(1);
          }
          console.log(
            chalk.cyan(`Generating transparency reports for ${agents.length} agents...\n`)
          );
          for (const a of agents) {
            try {
              const report = generateTransparencyReport(a.id, workspace);
              const content =
                opts.format === "json"
                  ? renderTransparencyReportJson(report)
                  : renderTransparencyReportMarkdown(report);
              const filename = opts.out
                ? opts.out.replace("{agentId}", a.id)
                : `transparency-${a.id}.${opts.format === "json" ? "json" : "md"}`;
              writeFileSync(filename, content, "utf8");
              console.log(
                chalk.green(`✓ ${a.id}`) +
                  chalk.gray(` → ${filename} (trust: ${report.identity.trustScore}/100, ${report.identity.maturityLabel})`)
              );
            } catch (err) {
              console.error(chalk.red(`✗ ${a.id}: ${(err as Error).message}`));
            }
          }
          return;
        }

        const targetId: string = agentId ?? (() => {
          const agents = listAgents(workspace);
          if (agents.length === 1) return agents[0]!.id;
          if (agents.length === 0) {
            console.error(chalk.red("No agents registered. Run `amc init` first."));
            process.exit(1);
          }
          console.error(
            chalk.red(
              `Multiple agents registered. Specify agentId or use --all.\nAgents: ${agents.map((a) => a.id).join(", ")}` as string
            )
          );
          process.exit(1);
        })();

        try {
          const report = generateTransparencyReport(targetId, workspace);
          const content =
            opts.format === "json"
              ? renderTransparencyReportJson(report)
              : renderTransparencyReportMarkdown(report);

          if (opts.out) {
            const outPath = resolve(opts.out);
            writeFileSync(outPath, content, "utf8");
            console.log(chalk.green(`✓ Report written to ${outPath}`));
            console.log(
              chalk.cyan(
                `  Trust Score: ${report.identity.trustScore}/100 · ${report.identity.maturityLabel} · ${report.identity.certificationStatus}`
              )
            );
          } else {
            console.log(content);
          }
        } catch (err) {
          console.error(chalk.red(`Failed to generate report: ${(err as Error).message}`));
          process.exit(1);
        }
      }
    );
}

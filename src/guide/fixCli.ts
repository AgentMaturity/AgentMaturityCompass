/**
 * `amc fix` — the command a first-timer can guess.
 *
 * One command: look at the agent, score it, explain the top gaps in plain
 * language, ask once, write guardrails into the agent's own config file, and
 * leave a hash-sealed receipt. Never touches API keys or credentials.
 */
import type { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { getRapidQuestions } from "../diagnostic/rapidQuickscore.js";
import { runOneClickFix, type OneClickFixResult } from "./oneClickFix.js";

const ACCENT = "#4AEF79";

function severityBadge(severity: string): string {
  if (severity === "critical") return chalk.red("[critical]");
  if (severity === "high") return chalk.yellow("[high]    ");
  return chalk.gray("[medium]  ");
}

function printPlan(result: OneClickFixResult): void {
  console.log("");
  console.log(chalk.bold("  Looking at your agent…"));
  console.log(
    `    Framework:         ${result.framework ? chalk.hex(ACCENT)(result.framework) + chalk.gray(` (${result.detectedFrom})`) : chalk.gray("none detected — generic guardrails")}`
  );
  console.log(
    `    Instruction files: ${result.instructionSources.length > 0 ? result.instructionSources.join(", ") : chalk.gray("none yet — AMC will create AGENTS.md")}`
  );
  console.log("");
  console.log(
    chalk.bold(`  Quick score: ${chalk.hex(ACCENT)(result.score.level)} (${result.score.totalScore}/${result.score.maxScore})`) +
      chalk.gray("  — grows as AMC collects real evidence")
  );
  console.log("");

  if (result.gaps.length === 0) {
    console.log(chalk.hex(ACCENT)("  No gaps below target. Nothing to fix — verify with `amc` (full score)."));
    console.log("");
    return;
  }

  console.log(chalk.bold("  Top gaps to fix now:"));
  for (const [i, gap] of result.gaps.entries()) {
    console.log(`    ${i + 1}. ${severityBadge(gap.severity)} ${chalk.bold(gap.questionId)} ${gap.title} ${chalk.gray(`(L${gap.currentLevel} → L${gap.targetLevel})`)}`);
    console.log(chalk.gray(`       Why: ${gap.why}`));
    console.log(chalk.hex(ACCENT)(`       Fix: ${gap.how}`));
  }
  console.log("");
  const change = result.changes[0];
  console.log(
    chalk.bold(`  Plan: write ${result.gapsGuarded} guardrail rule${result.gapsGuarded === 1 ? "" : "s"} into `) +
      chalk.hex(ACCENT)(result.guardrailsTarget) +
      chalk.gray(` (~${((change?.bytes ?? 0) / 1024).toFixed(1)} KB between AMC markers; the rest of the file is untouched)`)
  );
  console.log("");
}

function printApplied(result: OneClickFixResult): void {
  const change = result.changes[0];
  const verb = change?.action === "created" ? "created" : change?.action === "updated" ? "refreshed in" : "appended to";
  console.log(chalk.hex(ACCENT)(`  ✔ Guardrails ${verb} ${result.guardrailsTarget}`));
  if (result.receiptPath) {
    console.log(chalk.hex(ACCENT)(`  ✔ Hash-sealed receipt: ${result.receiptPath}`));
  }
  console.log("");
  console.log(chalk.bold(`  ${result.gapsGuarded} gap${result.gapsGuarded === 1 ? "" : "s"} now ${result.gapsGuarded === 1 ? "has" : "have"} enforced guardrails.`));
  console.log("");
  console.log(chalk.gray("  Prove it with real evidence:   ") + chalk.hex(ACCENT)("amc") + chalk.gray("        (full 244-question score)"));
  console.log(chalk.gray("  Watch it live in your browser: ") + chalk.hex(ACCENT)("amc up"));
  console.log(chalk.gray("  Re-run after changes:          ") + chalk.hex(ACCENT)("amc fix"));
  console.log("");
}

export function registerFixCommand(program: Command): void {
  program
    .command("fix")
    .description("Score your agent, explain the top gaps in plain language, and write guardrail fixes into your agent's own config file")
    .option("--yes", "apply the fixes without asking", false)
    .option("--dry-run", "show the full plan and change nothing", false)
    .option("--interactive", "answer the 5 quick questions instead of assuming a fresh agent", false)
    .option("--agent <id>", "agent ID", "default")
    .option("--target <level>", "target maturity level 1-5 (default 3 — review-ready)")
    .option("--target-level <level>", "alias for --target; accepts L1-L5 form")
    .option("--framework <name>", "framework override (default: auto-detect)")
    .option("--ci", "also add a GitHub Actions trust-gate workflow", false)
    .option("--file <path>", "agent config file to write (default: auto-detect from 15 known locations)")
    .option("--json", "machine-readable output", false)
    .action(
      async (opts: {
        yes: boolean;
        dryRun: boolean;
        interactive: boolean;
        agent: string;
        target?: string;
        targetLevel?: string;
        framework?: string;
        ci: boolean;
        file?: string;
        json: boolean;
      }) => {
        const workspace = process.cwd();
        const rawTarget = opts.target ?? opts.targetLevel;
        const parsedTarget = rawTarget ? Number.parseInt(rawTarget.replace(/\D/g, ""), 10) : undefined;
        if (rawTarget !== undefined && (!Number.isInteger(parsedTarget) || parsedTarget! < 1 || parsedTarget! > 5)) {
          console.error("--target must be a level from 1 to 5 (or L1-L5).");
          process.exitCode = 1;
          return;
        }

        // Optional 5-question interactive score (default: fresh-agent baseline).
        let answers: Record<string, number> = {};
        if (opts.interactive && process.stdin.isTTY && !opts.json) {
          for (const question of getRapidQuestions()) {
            const { level } = await inquirer.prompt([
              {
                type: "select",
                name: "level",
                message: `${question.id}: ${question.title}`,
                choices: question.options.map((option) => ({
                  name: `L${option.level} - ${option.label}`,
                  value: option.level
                }))
              }
            ]);
            answers[question.id] = level as number;
          }
        }

        const base = {
          workspace,
          agentId: opts.agent,
          targetLevel: parsedTarget,
          answers,
          filePath: opts.file,
          framework: opts.framework,
          ci: opts.ci
        };

        const plan = runOneClickFix({ ...base, apply: false });

        if (!opts.json) {
          printPlan(plan);
        }

        if (plan.gaps.length === 0 || opts.dryRun) {
          if (opts.json) {
            console.log(JSON.stringify(plan, null, 2));
          } else if (opts.dryRun && plan.gaps.length > 0) {
            console.log(chalk.gray("  Dry run — nothing written. Re-run without --dry-run to apply."));
            console.log("");
          }
          return;
        }

        let approved = opts.yes;
        if (!approved && !opts.json && process.stdin.isTTY) {
          const { ok } = await inquirer.prompt([
            { type: "confirm", name: "ok", message: `Apply these fixes to ${plan.guardrailsTarget}?`, default: true }
          ]);
          approved = Boolean(ok);
        }

        if (!approved) {
          if (opts.json) {
            console.log(JSON.stringify(plan, null, 2));
          } else {
            console.log(chalk.gray("  Not applied. Re-run with --yes to apply without asking."));
            console.log("");
          }
          return;
        }

        const applied = runOneClickFix({ ...base, apply: true });
        if (opts.json) {
          console.log(JSON.stringify(applied, null, 2));
          return;
        }
        printApplied(applied);
      }
    );
}

import { resolve } from "node:path";
import chalk from "chalk";
import { writeFileAtomic } from "../utils/fs.js";
import { buildPostureScorecard } from "./posture.js";

export function runPostureCli(params: { dir?: string; now: number; json?: boolean; out?: string }): void {
  const root = resolve(params.dir ?? process.cwd());
  const card = buildPostureScorecard({ root, now: params.now });
  if (params.out) {
    writeFileAtomic(resolve(params.out), JSON.stringify(card, null, 2), 0o644);
    console.log(chalk.green(`Posture scorecard saved to: ${params.out}`));
  }
  if (params.json) {
    console.log(JSON.stringify(card, null, 2));
    if (card.verdict === "BLOCK") process.exitCode = 1;
    return;
  }
  const levelColors: Record<string, string> = { L5: "#2ecc40", L4: "#3d9970", L3: "#7fdbff", L2: "#ff851b", L1: "#e4811b", L0: "#e05d44" };
  const verdictColors: Record<string, string> = { CLEAN: "#2ecc40", REVIEW: "#ff851b", BLOCK: "#e05d44" };
  console.log(chalk.bold.cyan("\n🛡️  Agent Security Posture"));
  console.log(chalk.gray("Path:"), root);
  console.log(chalk.gray("Overall:"), chalk.hex(levelColors[card.overallLevel] ?? "#555").bold(`${card.overallLevel} (${card.overallScore}/100)`),
    chalk.gray("| Verdict:"), chalk.hex(verdictColors[card.verdict] ?? "#555").bold(card.verdict));
  console.log("");
  for (const d of card.dimensions) {
    const sc = d.status === "PASS" ? chalk.green : d.status === "FAIL" ? chalk.red : chalk.yellow;
    console.log(`  ${sc(d.status.padEnd(6))} ${chalk.hex(levelColors[d.level] ?? "#555")(d.level)} ${chalk.bold(d.id)}`);
    console.log(chalk.gray(`         ${d.summary}`));
  }
  if (card.topActions.length > 0) {
    console.log(chalk.bold("\nTop actions:"));
    for (const a of card.topActions) console.log(chalk.cyan(`  → ${a}`));
  }
  console.log(chalk.gray("\nReceipt hash:"), card.receiptHash.slice(0, 16) + "...");
  console.log(chalk.gray("Verify posture over time; export signed evidence with `amc bundle export`."));
  if (card.verdict === "BLOCK") process.exitCode = 1;
}

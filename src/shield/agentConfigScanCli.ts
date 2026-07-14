import { resolve } from "node:path";
import chalk from "chalk";
import { writeFileAtomic } from "../utils/fs.js";
import { scanAgentConfig } from "./agentConfigScanner.js";

export function runAgentConfigScanCli(params: {
  dir?: string;
  now: number;
  json?: boolean;
  out?: string;
}): void {
  const root = resolve(params.dir ?? process.cwd());
  const result = scanAgentConfig({ root, now: params.now });
  if (params.out) {
    writeFileAtomic(resolve(params.out), JSON.stringify(result, null, 2), 0o644);
    console.log(chalk.green(`Agent-config scan saved to: ${params.out}`));
  }
  if (params.json) {
    console.log(JSON.stringify(result, null, 2));
    if (result.aggregateRisk === "BLOCK") process.exitCode = 1;
    return;
  }
  const levelColors: Record<string, string> = { L5: "#2ecc40", L4: "#3d9970", L3: "#7fdbff", L2: "#ff851b", L1: "#e4811b", L0: "#e05d44" };
  console.log(chalk.bold.cyan("\n🛡️  Agent Config Security Scan"));
  console.log(chalk.gray("Path:"), root);
  console.log(chalk.gray("Files scanned:"), result.filesScanned.length);
  console.log(chalk.gray("Security level:"), chalk.hex(levelColors[result.securityLevel] ?? "#555").bold(`${result.securityLevel} — ${result.riskLabel}`));
  console.log(chalk.gray("Score:"), `${result.securityScore}/100`);
  const riskColor: Record<string, string> = { CLEAN: "#2ecc40", REVIEW: "#ff851b", BLOCK: "#e05d44" };
  console.log(chalk.gray("Aggregate:"), chalk.hex(riskColor[result.aggregateRisk] ?? "#555").bold(result.aggregateRisk));
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 } as const;
  for (const f of result.findings) {
    const sc = f.severity === "CRITICAL" ? chalk.red : f.severity === "HIGH" ? chalk.yellow : chalk.gray;
    console.log(`  ${sc(f.severity)} [${f.category}] ${f.title} — ${f.file}`);
  }
  void order;
  console.log(chalk.gray("Receipt hash:"), result.receiptHash.slice(0, 16) + "...");
  if (result.aggregateRisk === "BLOCK") process.exitCode = 1;
}

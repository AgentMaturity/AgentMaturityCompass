import { resolve } from "node:path";
import chalk from "chalk";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { buildMcpTrustReceipt, previousHashMap, type McpTrustReceipt } from "./mcpTrustLedger.js";

export function runMcpLedgerCli(params: {
  workspace: string;
  targets: string[];
  now: number;
  json?: boolean;
  out?: string;
  previous?: string;
}): void {
  let previous: Record<string, string> | null = null;
  if (params.previous) {
    const priorPath = resolve(params.workspace, params.previous);
    if (pathExists(priorPath)) {
      const prior = JSON.parse(readUtf8(priorPath)) as McpTrustReceipt;
      if (prior && Array.isArray(prior.entries)) {
        previous = previousHashMap(prior);
      }
    }
  }
  const receipt = buildMcpTrustReceipt({ targets: params.targets, generatedAt: params.now, previous });
  if (params.out) {
    writeFileAtomic(resolve(params.workspace, params.out), JSON.stringify(receipt, null, 2), 0o644);
    console.log(chalk.green(`MCP trust receipt saved to: ${params.out}`));
  }
  if (params.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  const riskColor: Record<string, string> = { CLEAN: "#2ecc40", REVIEW: "#ff851b", BLOCK: "#e05d44" };
  console.log(chalk.bold.cyan("\n🔐  MCP Trust Ledger"));
  console.log(chalk.gray("Servers:"), receipt.serverCount);
  console.log(chalk.gray("Lowest level:"), receipt.lowestLevel);
  console.log(chalk.gray("Aggregate:"), chalk.hex(riskColor[receipt.aggregateRisk] ?? "#555").bold(receipt.aggregateRisk));
  for (const entry of receipt.entries) {
    const badge = entry.criticalFindings > 0 ? chalk.red("CRITICAL") : entry.highFindings > 0 ? chalk.yellow("HIGH") : chalk.green("ok");
    console.log(`  ${entry.securityLevel} ${badge} ${entry.serverName ?? entry.path} (${entry.toolCount} tools)`);
  }
  if (receipt.changedSincePrevious) {
    console.log(chalk.gray("Changed since previous:"),
      receipt.changedSincePrevious.length === 0 ? chalk.green("nothing") : receipt.changedSincePrevious.join(", "));
  }
  console.log(chalk.gray("Receipt hash:"), receipt.receiptHash.slice(0, 16) + "...");
  if (receipt.aggregateRisk === "BLOCK") process.exitCode = 1;
}

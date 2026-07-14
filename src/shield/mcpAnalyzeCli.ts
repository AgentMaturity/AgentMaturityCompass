import { resolve } from "node:path";
import chalk from "chalk";
import { writeFileAtomic } from "../utils/fs.js";
import { analyzeMcpSecurity } from "./mcpSecurityAnalyzer.js";

export function runMcpAnalyzeCli(params: { pathOrUrl: string; json?: boolean; out?: string }): void {
  const result = analyzeMcpSecurity(params.pathOrUrl);
  if (params.out) {
    writeFileAtomic(resolve(process.cwd(), params.out), JSON.stringify(result, null, 2), 0o644);
    console.log(chalk.green(`MCP security scan saved to: ${params.out}`));
  }
  if (params.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const levelColors: Record<string, string> = { L5: "#4c1", L4: "#2ecc40", L3: "#3d9970", L2: "#ff851b", L1: "#e4811b", L0: "#e05d44" };
  const lc = levelColors[result.securityLevel] ?? "#555";
  console.log(chalk.bold.cyan("\n🛡️  MCP Security Scan"));
  console.log(chalk.gray("Path:"), params.pathOrUrl);
  console.log(chalk.gray("Security Level:"), chalk.hex(lc).bold(`${result.securityLevel} — ${result.riskLabel}`));
  console.log(chalk.gray("Score:"), `${result.securityScore}/100`);
  if (result.serverInfo.name) {
    console.log(chalk.gray("Server:"), result.serverInfo.name, result.serverInfo.version ? `v${result.serverInfo.version}` : "");
  }
  console.log(chalk.gray("Tools:"), result.serverInfo.toolCount);
  console.log("");
  const critical = result.findings.filter((f) => f.severity === "CRITICAL");
  const high = result.findings.filter((f) => f.severity === "HIGH");
  const other = result.findings.filter((f) => f.severity !== "CRITICAL" && f.severity !== "HIGH");
  if (result.findings.length > 0) {
    console.log(chalk.bold(`Findings (${result.findings.length}):`));
    for (const finding of [...critical, ...high, ...other]) {
      const icon = finding.severity === "CRITICAL" ? chalk.red("🔴")
        : finding.severity === "HIGH" ? chalk.yellow("🟠")
        : finding.severity === "MEDIUM" ? chalk.gray("🟡")
        : chalk.gray("🔵");
      console.log(`  ${icon} [${finding.severity}] ${chalk.bold(finding.id)}: ${finding.title}`);
      console.log(chalk.gray(`       ${finding.description}`));
      console.log(chalk.cyan(`       → ${finding.recommendation}`));
      if (finding.evidence) console.log(chalk.gray(`       Evidence: ${finding.evidence}`));
      console.log("");
    }
  } else {
    console.log(chalk.green("  ✓ No security findings detected."));
    console.log("");
  }
  if (result.recommendations.length > 0) {
    console.log(chalk.bold("Recommendations:"));
    result.recommendations.forEach((r) => console.log(`  ${r}`));
    console.log("");
  }
  console.log(result.summary);
}

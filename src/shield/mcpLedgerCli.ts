import { join, resolve } from "node:path";
import chalk from "chalk";
import { MCP_HASHES_AUDIT, recordedMcpHashScans } from "../enforce/untrustedInputGuard.js";
import { openLedger } from "../ledger/ledger.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { buildMcpTrustReceipt, previousHashMap, type McpLedgerEntry, type McpTrustReceipt } from "./mcpTrustLedger.js";

type RecordedServers = Array<Pick<McpLedgerEntry, "path" | "serverName" | "tools">>;

/** The servers and tool digests the last scan recorded in this workspace's ledger, or null when there is none; throws when unreadable. */
function lastRecorded(workspace: string): RecordedServers | null {
  const ledger = openLedger(workspace);
  try {
    return recordedMcpHashScans(ledger).at(-1)?.servers ?? null;
  } finally {
    ledger.close();
  }
}

/**
 * Record every tool's description and schema digests in the ledger (MCP_TOOL_HASHES_RECORDED), with the tools that changed.
 * A changed tool's next consequential call asks a person while the untrusted-input guard is on (untrustedInputGuard.ts).
 */
function recordHashes(workspace: string, receipt: McpTrustReceipt): string {
  appendOpsAuditEvent({ workspace, auditType: MCP_HASHES_AUDIT, severity: (receipt.changedTools ?? []).length > 0 ? "HIGH" : "LOW",
    payload: { receiptHash: receipt.receiptHash, servers: receipt.entries.map((entry) => ({ path: entry.path, serverName: entry.serverName, tools: entry.tools })),
      changedTools: (receipt.changedTools ?? []).map(({ server, tool, changed }) => ({ server, tool, changed })) } });
  return "recorded in this workspace's AMC ledger";
}

export function runMcpLedgerCli(params: {
  workspace: string;
  targets: string[];
  now: number;
  json?: boolean;
  out?: string;
  previous?: string;
}): void {
  let previous: Record<string, string> | null = null;
  let previousEntries: RecordedServers | "unreadable" | null = null;
  if (params.previous) {
    const priorPath = resolve(params.workspace, params.previous);
    if (pathExists(priorPath)) {
      const prior = JSON.parse(readUtf8(priorPath)) as McpTrustReceipt;
      if (prior && Array.isArray(prior.entries)) {
        previous = previousHashMap(prior);
        previousEntries = prior.entries;
      }
    }
  }
  const workspaceLedger = pathExists(join(params.workspace, ".amc"));
  let recordNote = "not recorded: no AMC workspace here";
  if (!previousEntries && workspaceLedger) {
    // An unreadable last scan counts every tool as changed (fail closed), never as "no earlier scan".
    try { previousEntries = lastRecorded(params.workspace); } catch { previousEntries = "unreadable"; }
  }
  const receipt = buildMcpTrustReceipt({ targets: params.targets, generatedAt: params.now, previous, previousEntries });
  if (workspaceLedger) {
    try { recordNote = recordHashes(params.workspace, receipt); } catch (error) { recordNote = `not recorded: ${error instanceof Error ? error.message : String(error)}`; }
  }
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
  if (previousEntries === "unreadable") console.log(chalk.yellow("AMC could not read the last recorded scan, so every tool counts as changed."));
  if (receipt.changedTools && receipt.changedTools.length > 0) {
    console.log(chalk.yellow("Tool definitions that changed since the last scan (the server's own names):"));
    for (const tool of receipt.changedTools) {
      console.log(chalk.yellow(`  ${escapeTerminalControls(tool.server)} / ${escapeTerminalControls(tool.tool)}: ${tool.changed.join(" and ")} changed`));
    }
    console.log(chalk.gray("  With the untrusted-input guard on, AMC asks a person before the next consequential call of each changed tool."));
  }
  console.log(chalk.gray("Tool digests:"), recordNote);
  console.log(chalk.gray("Receipt hash:"), receipt.receiptHash.slice(0, 16) + "...");
  if (receipt.aggregateRisk === "BLOCK") process.exitCode = 1;
}

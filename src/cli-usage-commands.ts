/**
 * `amc usage` (SH-OBS-02): usage and cost across native sessions from verified signed rows. Exit 2 when the evidence
 * does not verify (no partial numbers), 1 on any other error.
 */
import type { Command } from "commander";
import chalk from "chalk";

interface UsageOptions { since?: string; until?: string; by?: string; agent?: string; utc?: boolean; json?: boolean; expectMonitor?: string }

/** `7d`, `12h`, `30m` relative to now, or an ISO timestamp. */
export function parseSince(value: string, now: number): number {
  const relative = /^(\d+)([dhm])$/.exec(value.trim());
  if (relative) {
    const unit = { d: 86_400_000, h: 3_600_000, m: 60_000 }[relative[2] as "d" | "h" | "m"];
    return now - Number(relative[1]) * unit;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Cannot parse time "${value}": use 7d, 12h, 30m or an ISO timestamp.`);
  return parsed;
}

export function registerUsageCommand(program: Command): void {
  program
    .command("usage")
    .description("Usage and cost across native sessions from verified signed rows (tokens, cost, latency; unknowns stay unknown)")
    .option("--since <when>", "window start: 7d, 12h, 30m or an ISO timestamp", "7d")
    .option("--until <iso>", "window end (default now)")
    .option("--by <key>", "bucket by day | session | model | provider | agent", "day")
    .option("--agent <agentId>", "only sessions opened for this agent (default: all agents)")
    .option("--utc", "bucket days in UTC instead of the local calendar day budgets use")
    .option("--expect-monitor <sha256>", "pin the monitor key (ledger-row) by a fingerprint recorded outside what is verified")
    .option("--json", "Output as JSON (schema amc.usage-report/v1)")
    .action(async (opts: UsageOptions) => {
      const { buildUsageReport, renderUsageReport } = await import("./observability/usageReport.js");
      const { BudgetEvidenceIntegrityError } = await import("./budgets/nativeBudgetUsage.js");
      try {
        const by = opts.by ?? "day";
        if (!["day", "session", "model", "provider", "agent"].includes(by)) throw new Error(`--by must be day, session, model, provider or agent (got ${by}).`);
        const now = Date.now();
        const until = opts.until === undefined ? now : parseSince(opts.until, now);
        const since = parseSince(opts.since ?? "7d", now);
        if (since > until) throw new Error("--since must not be after --until.");
        const explicitAgent = opts.agent;
        const report = buildUsageReport({ workspace: process.cwd(), since, until, by: by as "day", utc: opts.utc === true,
          ...(opts.expectMonitor === undefined ? {} : { expectedMonitorFingerprint: opts.expectMonitor }),
          ...(explicitAgent === undefined ? {} : { agentId: explicitAgent }) });
        console.log(opts.json ? JSON.stringify(report, null, 2) : renderUsageReport(report));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof BudgetEvidenceIntegrityError) {
          console.error(chalk.red(`Usage unavailable: the evidence did not verify. ${message}`));
          process.exitCode = 2;
          return;
        }
        console.error(chalk.red(`Usage unavailable: ${message}`));
        process.exitCode = 1;
      }
    });
}

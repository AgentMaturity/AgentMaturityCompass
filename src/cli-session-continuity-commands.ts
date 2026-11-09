/**
 * `amc session latest` (SH-LOOP-01): which session `--continue` would pick, and why the others
 * were passed over. Read-only; it never claims a writer.
 */
import type { Command } from "commander";
import chalk from "chalk";
import { resolveAgentId } from "./fleet/paths.js";
import { resolveLatestSession } from "./session/latestSession.js";
import { escapeTerminalControls } from "./tools/builtin/askUserTool.js";

export function registerSessionContinuityCommands(session: Command): void {
  session.command("latest")
    .description("Show the most recent session `agent-loop run --continue` would continue for this agent, or why none qualifies")
    .option("--agent <id>", "agent identity; defaults to AMC_AGENT_ID, the current agent, then default")
    .option("--json", "Output as JSON")
    .action((opts: { agent?: string; json?: boolean }) => {
      const workspace = process.cwd();
      const agentId = resolveAgentId(workspace, opts.agent);
      const latest = resolveLatestSession({ workspace, agentId });
      if (opts.json) { console.log(JSON.stringify({ agentId, ...latest }, null, 2)); if (!latest.ok) process.exitCode = 1; return; }
      if (latest.ok) {
        const row = latest.session;
        // Session ids and agent ids come from the ledger (imported sessions included): escaped like the chat picker's rows.
        console.log(escapeTerminalControls(`${row.sessionId} · ${row.state} · agent ${row.agentId} · ${row.turns} turns · head ${row.headEventId}`));
        console.log(chalk.dim("continue it with: amc agent-loop run --continue \"<prompt>\" (the original run's flags are required)"));
        return;
      }
      console.error(chalk.red(escapeTerminalControls(`${latest.code}: ${latest.reason}`)));
      for (const row of latest.skipped) console.error(chalk.dim(escapeTerminalControls(`  skipped ${row.sessionId}: ${row.reason}`)));
      process.exitCode = 1;
    });
}

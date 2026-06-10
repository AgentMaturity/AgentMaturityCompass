/**
 * CLI commands for trace exploration and SIEM/webhook alerting.
 * Gap 1: Trace explorer — inspect agent execution traces
 * Gap 7: SIEM/webhook alerting from incidents
 */

import type { Command } from "commander";
import chalk from "chalk";

export function registerTraceCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const trace = program
    .command("trace")
    .description("Trace explorer — inspect agent execution traces, sessions, and tool calls");

  /* ── trace list ────────────────────────────────────────────── */
  trace
    .command("list")
    .description("List recent agent sessions with evidence summary")
    .option("--agent <agentId>", "agent ID")
    .option("--since <hours>", "hours back", "24")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; since: string; json?: boolean }) => {
      try {
        const { openLedger } = await import("./ledger/ledger.js");
        const ledger = openLedger(process.cwd());
        const sinceTs = Date.now() - parseInt(opts.since, 10) * 3600_000;
        const sessions = ledger.getSessionsBetween(sinceTs, Date.now());
        if (opts.json) {
          console.log(JSON.stringify(sessions, null, 2));
          return;
        }
        console.log(chalk.bold(`\n🔍 Sessions (last ${opts.since}h): ${sessions.length}\n`));
        for (const s of sessions) {
          const ts = new Date(s.started_ts).toISOString().slice(0, 19);
          console.log(`  ${chalk.cyan(s.session_id.slice(0, 12))}  ${ts}  ${s.runtime}  agent=${s.runtime}`);
        }
        ledger.close();
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── trace inspect ─────────────────────────────────────────── */
  trace
    .command("inspect")
    .description("Inspect evidence events — show tool calls, decisions, and trust tiers")
    .option("--since <hours>", "hours back", "24")
    .option("--type <eventType>", "filter by event type")
    .option("--limit <n>", "max events", "50")
    .option("--json", "JSON output")
    .action(async (opts: { since: string; type?: string; limit: string; json?: boolean }) => {
      try {
        const { openLedger } = await import("./ledger/ledger.js");
        const ledger = openLedger(process.cwd());
        const sinceTs = Date.now() - parseInt(opts.since, 10) * 3600_000;
        let events = ledger.getEventsBetween(sinceTs, Date.now());
        if (opts.type) {
          events = events.filter((e: any) => e.eventType === opts.type);
        }
        events = events.slice(0, parseInt(opts.limit, 10));
        if (opts.json) {
          console.log(JSON.stringify(events, null, 2));
          ledger.close();
          return;
        }
        if (events.length === 0) {
          console.log(chalk.dim("No events found."));
          ledger.close();
          return;
        }
        console.log(chalk.bold(`\n🔎 ${events.length} evidence events:\n`));
        for (const ev of events) {
          const ts = new Date(ev.ts).toISOString().slice(0, 19);
          const meta = JSON.parse(ev.meta_json || "{}");
          const tier = meta.trustTier ?? "UNKNOWN";
          const trustColor = tier === "OBSERVED" ? chalk.green : tier === "ATTESTED" ? chalk.cyan : chalk.dim;
          console.log(`  ${chalk.dim(ts)}  ${trustColor(tier.padEnd(20))}  ${chalk.bold(ev.event_type)}`);
          
          try {
            const payload = typeof ev.payload_inline === "string" ? JSON.parse(ev.payload_inline) : ev.payload_inline;
            if (payload?.toolName) console.log(`    Tool: ${chalk.yellow(payload.toolName)}${payload.decision ? ` → ${payload.decision}` : ""}`);
            if (payload?.model) console.log(`    Model: ${payload.model}`);
            if (payload?.reason) console.log(`    Reason: ${payload.reason}`);
          } catch {}
        }
        ledger.close();
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── trace stats ───────────────────────────────────────────── */
  trace
    .command("stats")
    .description("Show trace statistics — event counts by type, trust tier, tool usage")
    .option("--since <hours>", "time window in hours", "24")
    .option("--json", "JSON output")
    .action(async (opts: { since: string; json?: boolean }) => {
      try {
        const { openLedger } = await import("./ledger/ledger.js");
        const ledger = openLedger(process.cwd());
        const sinceTs = Date.now() - parseInt(opts.since, 10) * 3600_000;
        const events = ledger.getEventsBetween(sinceTs, Date.now());
        
        const byType: Record<string, number> = {};
        const byTrust: Record<string, number> = {};
        const byTool: Record<string, number> = {};
        
        for (const ev of events) {
          byType[ev.event_type] = (byType[ev.event_type] ?? 0) + 1;
          const tier = JSON.parse(ev.meta_json || "{}").trustTier ?? "UNKNOWN";
          byTrust[tier] = (byTrust[tier] ?? 0) + 1;
          try {
            const p = typeof ev.payload_inline === "string" ? JSON.parse(ev.payload_inline) : ev.payload_inline;
            if (p?.toolName) byTool[p.toolName] = (byTool[p.toolName] ?? 0) + 1;
          } catch {}
        }
        
        const stats = { totalEvents: events.length, byType, byTrust, byTool, windowHours: parseInt(opts.since, 10) };
        ledger.close();
        
        if (opts.json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }
        console.log(chalk.bold(`\n📊 Trace Stats (last ${opts.since}h): ${events.length} events\n`));
        console.log(chalk.bold("  By Type:"));
        for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${k.padEnd(25)} ${v}`);
        }
        console.log(chalk.bold("\n  By Trust Tier:"));
        for (const [k, v] of Object.entries(byTrust).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${k.padEnd(25)} ${v}`);
        }
        if (Object.keys(byTool).length > 0) {
          console.log(chalk.bold("\n  By Tool:"));
          for (const [k, v] of Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
            console.log(`    ${k.padEnd(25)} ${v}`);
          }
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  trace
    .command("index")
    .description("List or inspect distilled trace failure indexes")
    .option("--agent <agentId>", "agent ID")
    .option("--run <runId>", "run id, episode id, or trace-index id to inspect")
    .option("--limit <n>", "max indexes", "10")
    .option("--redacted", "hide local workspace paths", true)
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; run?: string; limit: string; redacted?: boolean; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const { listTraceFailureIndexes, loadTraceFailureIndex } = await import("./watch/traceFailureIndex.js");
        if (opts.run) {
          const index = loadTraceFailureIndex({
            workspace: process.cwd(),
            agentId,
            selector: opts.run,
            redacted: opts.redacted !== false
          });
          if (opts.json) {
            console.log(JSON.stringify(index, null, 2));
            return;
          }
          console.log(chalk.bold(`Trace index ${index.indexId}`));
          console.log(`  Run: ${index.runId}`);
          console.log(`  Entries: ${index.summary.entryCount}`);
          console.log(`  Clusters: ${index.summary.clusterCount}`);
          for (const cluster of index.clusters.slice(0, 10)) {
            console.log(`  - ${cluster.failureClass} count=${cluster.count} impact=${cluster.scoreImpact} ${cluster.sampleSnippet}`);
          }
          return;
        }
        const limit = Number.parseInt(opts.limit, 10);
        const indexes = listTraceFailureIndexes({
          workspace: process.cwd(),
          agentId,
          limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
          redacted: opts.redacted !== false
        });
        if (opts.json) {
          console.log(JSON.stringify({ indexes, total: indexes.length }, null, 2));
          return;
        }
        if (indexes.length === 0) {
          console.log(chalk.dim("No trace failure indexes found. Run a full score with trace evidence first."));
          return;
        }
        for (const index of indexes) {
          console.log(`${index.generatedAt} ${index.indexId} entries=${index.summary.entryCount} clusters=${index.summary.clusterCount} top=${index.summary.topFailureClass ?? "-"}`);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  trace
    .command("failures")
    .description("Show top recurring failure clusters mined from trace indexes")
    .option("--agent <agentId>", "agent ID")
    .option("--limit <n>", "max clusters", "10")
    .option("--redacted", "hide local workspace paths", true)
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; limit: string; redacted?: boolean; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const limit = Number.parseInt(opts.limit, 10);
        const { topTraceFailureClusters } = await import("./watch/traceFailureIndex.js");
        const clusters = topTraceFailureClusters({
          workspace: process.cwd(),
          agentId,
          limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
          redacted: opts.redacted !== false
        });
        if (opts.json) {
          console.log(JSON.stringify({ agentId, clusters, total: clusters.length }, null, 2));
          return;
        }
        if (clusters.length === 0) {
          console.log(chalk.dim("No recurring failure clusters found."));
          return;
        }
        console.log(chalk.bold(`Top trace failure clusters for ${agentId}`));
        for (const cluster of clusters) {
          console.log(`- ${cluster.failureClass} count=${cluster.count} impact=${cluster.scoreImpact} agents=${cluster.agents.join(",")}`);
          console.log(`  ${cluster.sampleSnippet}`);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

export function registerAlertCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const alert = program
    .command("alert")
    .description("SIEM/webhook alerting — configure and send alerts from anomalies");

  /* ── alert send ────────────────────────────────────────────── */
  alert
    .command("send")
    .description("Send an alert to a webhook endpoint")
    .requiredOption("--url <url>", "webhook URL")
    .requiredOption("--message <text>", "alert message")
    .option("--severity <level>", "severity: info|warn|high|critical", "high")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { url: string; message: string; severity: string; agent?: string; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const payload = { source: "amc", agentId, severity: opts.severity, message: opts.message, ts: new Date().toISOString(), type: "manual_alert" };
        const resp = await fetch(opts.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (opts.json) {
          console.log(JSON.stringify({ sent: resp.ok, status: resp.status, payload }, null, 2));
          return;
        }
        console.log(resp.ok ? chalk.green(`✅ Alert sent (${resp.status})`) : chalk.red(`❌ Failed (${resp.status})`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── alert config ──────────────────────────────────────────── */
  alert
    .command("config")
    .description("Configure alert destinations (webhooks, Slack, PagerDuty)")
    .option("--set-webhook <url>", "set default webhook URL")
    .option("--set-slack <url>", "set Slack webhook URL")
    .option("--set-pagerduty <key>", "set PagerDuty integration key")
    .option("--show", "show current config")
    .option("--json", "JSON output")
    .action(async (opts: { setWebhook?: string; setSlack?: string; setPagerduty?: string; show?: boolean; json?: boolean }) => {
      try {
        const { join } = await import("node:path");
        const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
        const configPath = join(process.cwd(), ".amc", "alerts.json");
        let config: Record<string, string> = {};
        if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath, "utf-8"));
        let changed = false;
        if (opts.setWebhook) { config.webhook = opts.setWebhook; changed = true; }
        if (opts.setSlack) { config.slack = opts.setSlack; changed = true; }
        if (opts.setPagerduty) { config.pagerduty = opts.setPagerduty; changed = true; }
        if (changed) {
          mkdirSync(join(process.cwd(), ".amc"), { recursive: true });
          writeFileSync(configPath, JSON.stringify(config, null, 2));
        }
        if (opts.json) { console.log(JSON.stringify(config, null, 2)); return; }
        console.log(chalk.bold("\n🔔 Alert Configuration:\n"));
        console.log(`  Webhook:    ${config.webhook ?? chalk.dim("not set")}`);
        console.log(`  Slack:      ${config.slack ?? chalk.dim("not set")}`);
        console.log(`  PagerDuty:  ${config.pagerduty ?? chalk.dim("not set")}`);
        if (changed) console.log(chalk.green("\n  ✅ Updated."));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── alert test ────────────────────────────────────────────── */
  alert
    .command("test")
    .description("Send a test alert to all configured destinations")
    .action(async () => {
      try {
        const { join } = await import("node:path");
        const { existsSync, readFileSync } = await import("node:fs");
        const configPath = join(process.cwd(), ".amc", "alerts.json");
        if (!existsSync(configPath)) { console.log(chalk.yellow("No destinations configured.")); return; }
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const payload = { source: "amc", type: "test_alert", severity: "info", message: "AMC test alert — alerting is working!", ts: new Date().toISOString() };
        for (const [name, url] of Object.entries(config)) {
          if (typeof url === "string" && url.startsWith("http")) {
            try {
              const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
              console.log(`  ${resp.ok ? chalk.green("✅") : chalk.red("❌")} ${name}: ${resp.status}`);
            } catch (e: any) { console.log(`  ${chalk.red("❌")} ${name}: ${e.message}`); }
          }
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── alert watch ───────────────────────────────────────────── */
  alert
    .command("watch")
    .description("Watch for anomalies and auto-send alerts to configured destinations")
    .option("--agent <agentId>", "agent ID")
    .option("--interval <seconds>", "check interval", "60")
    .action(async (opts: { agent?: string; interval: string }) => {
      try {
        const { join } = await import("node:path");
        const { existsSync, readFileSync } = await import("node:fs");
        const { buildAgentTimelineData } = await import("./observability/timeline.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const intervalMs = parseInt(opts.interval, 10) * 1000;
        const configPath = join(process.cwd(), ".amc", "alerts.json");
        console.log(chalk.bold(`\n👁️  Watching ${agentId} every ${opts.interval}s — Ctrl+C to stop\n`));
        const check = async () => {
          const data = buildAgentTimelineData({ workspace: process.cwd(), agentId, maxRuns: 50 });
          const critical = data.anomalies.filter(a => a.severity === "CRITICAL" || a.severity === "HIGH");
          if (critical.length > 0) {
            console.log(chalk.red(`  ⚠️  ${new Date().toISOString().slice(11, 19)} — ${critical.length} anomalies!`));
            if (existsSync(configPath)) {
              const config = JSON.parse(readFileSync(configPath, "utf-8"));
              const payload = { source: "amc", agentId, type: "anomaly_detected", severity: critical[0]!.severity.toLowerCase(), anomalies: critical.map(a => ({ type: a.type, severity: a.severity, message: a.message })), ts: new Date().toISOString() };
              for (const [name, url] of Object.entries(config)) {
                if (typeof url === "string" && url.startsWith("http")) {
                  try { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); console.log(chalk.dim(`    → sent to ${name}`)); } catch {}
                }
              }
            }
            for (const a of critical) console.log(`    ${chalk.red(a.severity)} ${a.type}: ${a.message}`);
          } else {
            console.log(chalk.dim(`  ✓ ${new Date().toISOString().slice(11, 19)} — no anomalies`));
          }
        };
        await check();
        setInterval(check, intervalMs);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

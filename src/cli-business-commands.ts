/**
 * CLI commands for business KPI correlation and benchmark leaderboards.
 *
 * Gap 4: Business KPI / ROI dashboard
 * Gap 10: Public benchmark / leaderboard surface
 * Gap 6: AI asset inventory (basic discovery)
 * Gap 5: Comms firewall (policy check command)
 */

import type { Command } from "commander";
import chalk from "chalk";

export function registerBusinessCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const business = program
    .command("business")
    .description("Business impact — KPI correlation, ROI tracking, and maturity-to-outcome mapping");

  /* ── business kpi ──────────────────────────────────────────── */
  business
    .command("kpi")
    .description("Show business KPIs correlated with maturity levels")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; json?: boolean }) => {
      try {
        const { openLedger } = await import("./ledger/ledger.js");
        const { runDiagnostic } = await import("./diagnostic/runner.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        
        const report = await runDiagnostic({
          workspace: process.cwd(),
          window: "30d",
          targetName: agentId,
        });
        
        // Calculate business-relevant metrics
        const avgLevel = report.layerScores.length > 0
          ? report.layerScores.reduce((s, l) => s + l.avgFinalLevel, 0) / report.layerScores.length
          : 0;
        
        // Business impact estimates based on maturity level
        const riskReductionPct = Math.min(avgLevel * 18, 90); // L5 = ~90% risk reduction
        const complianceReadiness = Math.min(avgLevel * 20, 100);
        const incidentLikelihood = Math.max(100 - avgLevel * 20, 5); // Lower is better
        const auditReadiness = avgLevel >= 3 ? "Ready" : avgLevel >= 2 ? "Partial" : "Not Ready";
        const regulatoryRisk = avgLevel >= 3 ? "Low" : avgLevel >= 2 ? "Medium" : "High";
        
        const kpis = {
          agentId,
          maturityLevel: `L${Math.round(avgLevel)}`,
          avgLevel,
          integrityIndex: report.integrityIndex,
          businessImpact: {
            riskReductionPct: Math.round(riskReductionPct),
            complianceReadinessPct: Math.round(complianceReadiness),
            incidentLikelihoodPct: Math.round(incidentLikelihood),
            auditReadiness,
            regulatoryRisk,
            estimatedAnnualRiskReduction: `$${Math.round(riskReductionPct * 1000)}k`,
          },
          dimensions: report.layerScores.map(l => ({
            name: l.layerName,
            level: l.avgFinalLevel.toFixed(1),
            status: l.avgFinalLevel >= 3 ? "✅ On track" : l.avgFinalLevel >= 2 ? "⚠️ Needs attention" : "❌ Critical gap",
          })),
          recommendations: [] as string[],
        };
        
        // Generate recommendations
        if (avgLevel < 2) kpis.recommendations.push("Critical: Agent below L2 — not production-ready for regulated environments");
        if (report.evidenceCoverage < 0.5) kpis.recommendations.push("Evidence coverage below 50% — add more instrumented test runs");
        if (!report.verificationPassed) kpis.recommendations.push("Verification failed — evidence integrity compromised");
        for (const l of report.layerScores) {
          if (l.avgFinalLevel < 1.5) kpis.recommendations.push(`${l.layerName}: Level ${l.avgFinalLevel.toFixed(1)} — prioritize improvement`);
        }
        
        if (opts.json) {
          console.log(JSON.stringify(kpis, null, 2));
          return;
        }
        
        console.log(chalk.bold(`\n📊 Business KPIs for ${agentId}\n`));
        console.log(`  Maturity Level:           ${chalk.bold(kpis.maturityLevel)} (${avgLevel.toFixed(2)}/5)`);
        console.log(`  Integrity Index:          ${(report.integrityIndex * 100).toFixed(1)}%`);
        console.log(`  Risk Reduction:           ${chalk.green(`${kpis.businessImpact.riskReductionPct}%`)}`);
        console.log(`  Compliance Readiness:     ${kpis.businessImpact.complianceReadinessPct}%`);
        console.log(`  Incident Likelihood:      ${kpis.businessImpact.incidentLikelihoodPct}%`);
        console.log(`  Audit Readiness:          ${auditReadiness}`);
        console.log(`  Regulatory Risk:          ${regulatoryRisk}`);
        console.log(`  Est. Annual Risk Savings: ${kpis.businessImpact.estimatedAnnualRiskReduction}`);
        
        console.log(chalk.bold("\n  Dimension Status:"));
        for (const d of kpis.dimensions) {
          console.log(`    ${d.name.padEnd(30)} L${d.level}  ${d.status}`);
        }
        
        if (kpis.recommendations.length > 0) {
          console.log(chalk.bold("\n  Recommendations:"));
          for (const r of kpis.recommendations) {
            console.log(`    → ${r}`);
          }
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── business track ────────────────────────────────────────── */
  business
    .command("track")
    .description("Record a business outcome event (incident, audit finding, cost)")
    .requiredOption("--type <type>", "event type: incident|audit-finding|cost-saving|compliance-pass|compliance-fail")
    .option("--agent <agentId>", "agent ID")
    .option("--description <text>", "event description")
    .option("--value <n>", "monetary value ($)")
    .option("--severity <level>", "severity: low|medium|high|critical")
    .option("--json", "JSON output")
    .action(async (opts: { type: string; agent?: string; description?: string; value?: string; severity?: string; json?: boolean }) => {
      try {
        const { join } = await import("node:path");
        const { mkdirSync, readFileSync, writeFileSync, existsSync } = await import("node:fs");
        const { randomUUID } = await import("node:crypto");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const eventsPath = join(process.cwd(), ".amc", "business-events.jsonl");
        mkdirSync(join(process.cwd(), ".amc"), { recursive: true });
        
        const event = {
          id: randomUUID(),
          agentId,
          type: opts.type,
          description: opts.description ?? "",
          value: opts.value ? parseFloat(opts.value) : null,
          severity: opts.severity ?? null,
          ts: new Date().toISOString(),
        };
        
        const { appendFileSync } = await import("node:fs");
        appendFileSync(eventsPath, JSON.stringify(event) + "\n");
        
        if (opts.json) {
          console.log(JSON.stringify(event, null, 2));
          return;
        }
        console.log(chalk.green(`✅ Business event tracked: ${opts.type}${opts.value ? ` ($${opts.value})` : ""}`));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── business report ───────────────────────────────────────── */
  business
    .command("report")
    .description("Generate business impact report with maturity correlation")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; json?: boolean }) => {
      try {
        const { join } = await import("node:path");
        const { readFileSync, existsSync } = await import("node:fs");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const eventsPath = join(process.cwd(), ".amc", "business-events.jsonl");
        
        let events: any[] = [];
        if (existsSync(eventsPath)) {
          events = readFileSync(eventsPath, "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l));
        }
        
        const agentEvents = events.filter(e => e.agentId === agentId);
        const incidents = agentEvents.filter(e => e.type === "incident");
        const savings = agentEvents.filter(e => e.type === "cost-saving");
        const auditFindings = agentEvents.filter(e => e.type === "audit-finding");
        const compliancePass = agentEvents.filter(e => e.type === "compliance-pass");
        const complianceFail = agentEvents.filter(e => e.type === "compliance-fail");
        
        const totalSavings = savings.reduce((s, e) => s + (e.value ?? 0), 0);
        const totalIncidentCost = incidents.reduce((s, e) => s + (e.value ?? 0), 0);
        
        const report = {
          agentId,
          period: { events: agentEvents.length, from: agentEvents[0]?.ts, to: agentEvents[agentEvents.length - 1]?.ts },
          incidents: { count: incidents.length, totalCost: totalIncidentCost },
          costSavings: { count: savings.length, totalValue: totalSavings },
          auditFindings: { count: auditFindings.length },
          compliance: { passes: compliancePass.length, failures: complianceFail.length, rate: compliancePass.length + complianceFail.length > 0 ? compliancePass.length / (compliancePass.length + complianceFail.length) : 0 },
          netImpact: totalSavings - totalIncidentCost,
        };
        
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        
        console.log(chalk.bold(`\n💰 Business Impact Report — ${agentId}\n`));
        console.log(`  Total events:       ${agentEvents.length}`);
        console.log(`  Incidents:          ${incidents.length} ($${totalIncidentCost} cost)`);
        console.log(`  Cost savings:       ${savings.length} ($${totalSavings} saved)`);
        console.log(`  Audit findings:     ${auditFindings.length}`);
        console.log(`  Compliance rate:    ${(report.compliance.rate * 100).toFixed(1)}%`);
        console.log(`  Net impact:         ${chalk.bold(`$${report.netImpact}`)}`);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

export function registerLeaderboardCommands(program: Command): void {
  const leaderboard = program
    .command("leaderboard")
    .description("Benchmark leaderboard — compare agent maturity scores");

  /* ── leaderboard show ──────────────────────────────────────── */
  leaderboard
    .command("show")
    .description("Show fleet-wide maturity leaderboard")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      try {
        const { readdirSync, readFileSync, existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        const { getAgentPaths } = await import("./fleet/paths.js");
        
        const agentsDir = join(process.cwd(), ".amc", "agents");
        if (!existsSync(agentsDir)) {
          console.log(chalk.dim("No agents found. Run 'amc quickscore' to generate first score."));
          return;
        }
        
        const agents = readdirSync(agentsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        
        const scores: Array<{ agentId: string; integrityIndex: number; avgLevel: number; level: string; ts: number }> = [];
        
        for (const agentId of agents) {
          const runsDir = join(agentsDir, agentId, "runs");
          if (!existsSync(runsDir)) continue;
          
          const files = readdirSync(runsDir).filter(f => f.endsWith(".json")).sort();
          if (files.length === 0) continue;
          
          try {
            const latest = JSON.parse(readFileSync(join(runsDir, files[files.length - 1]!), "utf-8"));
            const avgLevel = latest.layerScores?.reduce((s: number, l: any) => s + l.avgFinalLevel, 0) / (latest.layerScores?.length || 1) || 0;
            scores.push({
              agentId,
              integrityIndex: latest.integrityIndex ?? 0,
              avgLevel,
              level: `L${Math.round(avgLevel)}`,
              ts: latest.ts,
            });
          } catch {}
        }
        
        // Sort by integrity index descending
        scores.sort((a, b) => b.integrityIndex - a.integrityIndex);
        
        if (opts.json) {
          console.log(JSON.stringify(scores, null, 2));
          return;
        }
        
        console.log(chalk.bold(`\n🏆 Agent Maturity Leaderboard (${scores.length} agents)\n`));
        console.log(`  ${"#".padEnd(4)} ${"Agent".padEnd(30)} ${"Level".padEnd(8)} ${"Score".padEnd(10)} Last Scored`);
        console.log(`  ${"─".repeat(4)} ${"─".repeat(30)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(20)}`);
        
        for (let i = 0; i < scores.length; i++) {
          const s = scores[i]!;
          const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          const scoreBar = "█".repeat(Math.floor(s.integrityIndex * 10));
          const ts = new Date(s.ts).toISOString().slice(0, 10);
          console.log(`  ${rank.padEnd(4)} ${s.agentId.padEnd(30)} ${s.level.padEnd(8)} ${scoreBar.padEnd(10)} ${ts}`);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── leaderboard export ────────────────────────────────────── */
  leaderboard
    .command("export")
    .description("Export leaderboard as JSON/HTML for public sharing")
    .option("--format <fmt>", "output format: json|html|markdown", "json")
    .option("--output <path>", "output file path")
    .action(async (opts: { format: string; output?: string }) => {
      try {
        const { readdirSync, readFileSync, writeFileSync, existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        
        const agentsDir = join(process.cwd(), ".amc", "agents");
        const agents = existsSync(agentsDir) ? readdirSync(agentsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
        
        const scores: any[] = [];
        for (const agentId of agents) {
          const runsDir = join(agentsDir, agentId, "runs");
          if (!existsSync(runsDir)) continue;
          const files = readdirSync(runsDir).filter(f => f.endsWith(".json")).sort();
          if (files.length === 0) continue;
          try {
            const latest = JSON.parse(readFileSync(join(runsDir, files[files.length - 1]!), "utf-8"));
            const avgLevel = latest.layerScores?.reduce((s: number, l: any) => s + l.avgFinalLevel, 0) / (latest.layerScores?.length || 1) || 0;
            scores.push({ rank: 0, agentId, integrityIndex: latest.integrityIndex ?? 0, avgLevel, level: `L${Math.round(avgLevel)}`, ts: latest.ts, status: latest.status });
          } catch {}
        }
        scores.sort((a, b) => b.integrityIndex - a.integrityIndex);
        scores.forEach((s, i) => s.rank = i + 1);
        
        let output = "";
        if (opts.format === "json") {
          output = JSON.stringify({ generatedAt: new Date().toISOString(), agents: scores }, null, 2);
        } else if (opts.format === "markdown") {
          output = `# AMC Maturity Leaderboard\n\nGenerated: ${new Date().toISOString()}\n\n| # | Agent | Level | Score | Status |\n|---|---|---|---|---|\n`;
          for (const s of scores) {
            output += `| ${s.rank} | ${s.agentId} | ${s.level} | ${(s.integrityIndex * 100).toFixed(1)}% | ${s.status} |\n`;
          }
        } else if (opts.format === "html") {
          output = `<!DOCTYPE html><html><head><title>AMC Leaderboard</title><style>body{font-family:system-ui;max-width:800px;margin:2em auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}tr:nth-child(even){background:#fafafa}</style></head><body><h1>🏆 AMC Maturity Leaderboard</h1><p>Generated: ${new Date().toISOString()}</p><table><tr><th>#</th><th>Agent</th><th>Level</th><th>Score</th><th>Status</th></tr>`;
          for (const s of scores) {
            output += `<tr><td>${s.rank}</td><td>${s.agentId}</td><td>${s.level}</td><td>${(s.integrityIndex * 100).toFixed(1)}%</td><td>${s.status}</td></tr>`;
          }
          output += `</table></body></html>`;
        }
        
        if (opts.output) {
          writeFileSync(opts.output, output);
          console.log(chalk.green(`✅ Leaderboard exported to ${opts.output}`));
        } else {
          console.log(output);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

export function registerInventoryCommands(program: Command): void {
  /* ── inventory ─────────────────────────────────────────────── */
  const inventory = program
    .command("inventory")
    .description("AI asset inventory — discover and catalog AI agents, models, and tools");

  inventory
    .command("scan")
    .description("Scan workspace for AI assets (agents, models, configs, API keys)")
    .option("--deep", "deep scan (check common AI framework configs)")
    .option("--json", "JSON output")
    .action(async (opts: { deep?: boolean; json?: boolean }) => {
      try {
        const { readdirSync, readFileSync, existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        
        const workspace = process.cwd();
        const assets: any[] = [];
        
        // 1. AMC-registered agents
        const agentsDir = join(workspace, ".amc", "agents");
        if (existsSync(agentsDir)) {
          const agents = readdirSync(agentsDir, { withFileTypes: true }).filter(d => d.isDirectory());
          for (const a of agents) {
            assets.push({ type: "agent", id: a.name, source: "amc-registered", status: "enrolled", path: join(agentsDir, a.name) });
          }
        }
        
        // 2. Check for common AI framework configs
        const frameworkConfigs = [
          { pattern: ".env", check: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"], type: "api-key" },
          { pattern: "pyproject.toml", check: ["langchain", "crewai", "autogen", "openai", "anthropic"], type: "framework" },
          { pattern: "requirements.txt", check: ["langchain", "crewai", "autogen", "openai", "anthropic", "transformers"], type: "framework" },
          { pattern: "package.json", check: ["langchain", "@langchain", "openai", "@anthropic-ai", "semantic-kernel"], type: "framework" },
        ];
        
        for (const fc of frameworkConfigs) {
          const filePath = join(workspace, fc.pattern);
          if (existsSync(filePath)) {
            try {
              const content = readFileSync(filePath, "utf-8").toLowerCase();
              for (const kw of fc.check) {
                if (content.includes(kw.toLowerCase())) {
                  assets.push({ type: fc.type, id: kw, source: fc.pattern, status: "detected", path: filePath });
                }
              }
            } catch {}
          }
        }
        
        // 3. Check for model files
        if (opts.deep) {
          const modelExtensions = [".pkl", ".pt", ".pth", ".onnx", ".safetensors", ".gguf", ".bin"];
          try {
            const scanDir = (dir: string, depth: number) => {
              if (depth > 3) return;
              try {
                const entries = readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                  if (e.isFile() && modelExtensions.some(ext => e.name.endsWith(ext))) {
                    assets.push({ type: "model-file", id: e.name, source: "filesystem", status: "detected", path: join(dir, e.name) });
                  }
                  if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
                    scanDir(join(dir, e.name), depth + 1);
                  }
                }
              } catch {}
            };
            scanDir(workspace, 0);
          } catch {}
        }
        
        if (opts.json) {
          if (assets.length === 0) {
            console.log(JSON.stringify({ assets: [], hint: "No AI assets found. Run 'amc init' to register an agent, or 'amc inventory scan --deep' for filesystem detection." }, null, 2));
          } else {
            console.log(JSON.stringify(assets, null, 2));
          }
          return;
        }
        
        console.log(chalk.bold(`\n🔍 AI Asset Inventory (${assets.length} assets found)\n`));
        if (assets.length === 0) {
          console.log(chalk.gray("  No AI assets detected in this workspace."));
          console.log(chalk.gray("\n  💡 Next steps:"));
          console.log(chalk.gray("    amc init                        # Initialize workspace and register an agent"));
          console.log(chalk.gray("    amc inventory scan --deep       # Deep scan for model files and configs"));
          console.log(chalk.gray("    amc connect                     # Connect an existing agent runtime"));
        }
        
        const byType: Record<string, any[]> = {};
        for (const a of assets) {
          byType[a.type] = byType[a.type] ?? [];
          byType[a.type]!.push(a);
        }
        
        for (const [type, items] of Object.entries(byType)) {
          console.log(chalk.bold(`  ${type} (${items.length}):`));
          for (const item of items) {
            const statusIcon = item.status === "enrolled" ? chalk.green("●") : chalk.yellow("○");
            console.log(`    ${statusIcon} ${item.id}  [${item.source}]`);
          }
        }
        
        const unenrolled = assets.filter(a => a.status !== "enrolled");
        if (unenrolled.length > 0) {
          console.log(chalk.yellow(`\n  ⚠️  ${unenrolled.length} assets detected but not enrolled in AMC.`));
          console.log(chalk.dim("  Enroll with: amc init --agent <id>"));
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  // Blocker #9: "inventory list" alias for "inventory scan"
  inventory
    .command("list")
    .description("List AI assets (alias for 'inventory scan')")
    .option("--deep", "deep scan")
    .option("--json", "JSON output")
    .action(async (opts: { deep?: boolean; json?: boolean }) => {
      // Delegate to scan
      await inventory.parseAsync(["scan", ...(opts.deep ? ["--deep"] : []), ...(opts.json ? ["--json"] : [])], { from: "user" });
    });
}

export function registerCommsCheckCommands(program: Command): void {
  /* ── comms-check ───────────────────────────────────────────── */
  program
    .command("comms-check")
    .description("Check a message/communication against compliance policies (lightweight communications firewall)")
    .requiredOption("--text <message>", "message text to check")
    .option("--domain <domain>", "regulatory domain: wealth|health|governance|technology", "technology")
    .option("--json", "JSON output")
    .action(async (opts: { text: string; domain: string; json?: boolean }) => {
      try {
        const text = opts.text;
        const violations: Array<{ rule: string; severity: string; description: string }> = [];
        
        // PII detection
        const piiPatterns = [
          { pattern: /\b\d{3}-\d{2}-\d{4}\b/, rule: "PII-SSN", description: "Social Security Number detected" },
          { pattern: /\b\d{16}\b|\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/, rule: "PII-CC", description: "Credit card number detected" },
          { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, rule: "PII-EMAIL", description: "Email address detected" },
          { pattern: /\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/, rule: "PII-PHONE", description: "Phone number detected" },
        ];
        
        for (const pp of piiPatterns) {
          if (pp.pattern.test(text)) {
            violations.push({ rule: pp.rule, severity: "high", description: pp.description });
          }
        }
        
        // Domain-specific checks
        if (opts.domain === "wealth") {
          const finPatterns = [
            { pattern: /guaranteed\s+(return|profit|income)/i, rule: "FIN-GUARANTEE", description: "Guaranteed returns claim (SEC/FINRA violation)" },
            { pattern: /risk[\s-]?free/i, rule: "FIN-RISKFREE", description: "Risk-free claim (misleading)" },
            { pattern: /insider\s+(tip|information|knowledge)/i, rule: "FIN-INSIDER", description: "Insider information reference (SEC violation)" },
            { pattern: /can't\s+lose|sure\s+thing|no\s+risk/i, rule: "FIN-MISLEADING", description: "Misleading investment claim" },
          ];
          for (const fp of finPatterns) {
            if (fp.pattern.test(text)) {
              violations.push({ rule: fp.rule, severity: "critical", description: fp.description });
            }
          }
        }
        
        if (opts.domain === "health") {
          const healthPatterns = [
            { pattern: /patient\s+name|patient\s+id|medical\s+record/i, rule: "HIPAA-PHI", description: "Protected Health Information reference" },
            { pattern: /diagnosis|prognosis|treatment\s+plan/i, rule: "HIPAA-CLINICAL", description: "Clinical information in communication" },
          ];
          for (const hp of healthPatterns) {
            if (hp.pattern.test(text)) {
              violations.push({ rule: hp.rule, severity: "high", description: hp.description });
            }
          }
        }
        
        // General checks
        const generalPatterns = [
          { pattern: /confidential|internal\s+only|do\s+not\s+distribute/i, rule: "CONF-LEAK", description: "Confidential information marker in external communication" },
          { pattern: /password|secret\s+key|api[_\s]?key|private\s+key/i, rule: "SEC-CRED", description: "Credential/secret reference in communication" },
        ];
        for (const gp of generalPatterns) {
          if (gp.pattern.test(text)) {
            violations.push({ rule: gp.rule, severity: "high", description: gp.description });
          }
        }
        
        const result = {
          text: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
          domain: opts.domain,
          violations,
          passed: violations.length === 0,
          checkedAt: new Date().toISOString(),
        };
        
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        
        if (violations.length === 0) {
          console.log(chalk.green("✅ Message passed all compliance checks."));
        } else {
          console.log(chalk.red(`\n❌ ${violations.length} compliance violation(s) detected:\n`));
          for (const v of violations) {
            const sev = v.severity === "critical" ? chalk.red(v.severity) : chalk.yellow(v.severity);
            console.log(`  ${sev}  ${v.rule}: ${v.description}`);
          }
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

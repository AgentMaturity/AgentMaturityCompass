/**
 * CLI commands for observability, corrections, and feedback loops.
 * Wires existing src/observability/, src/corrections/, src/learning/ to CLI.
 */

import type { Command } from "commander";
import chalk from "chalk";
import { aggregateClaim, emitClaimResult, runIdClaim } from "./cli/claimOutput.js";

export function registerObservabilityCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const observe = program
    .command("observe")
    .description("Observability — timeline, anomaly detection, and tracing");

  /* ── observe timeline ──────────────────────────────────────────── */
  observe
    .command("timeline")
    .description("Show agent evidence timeline with score progression")
    .option("--agent <agentId>", "agent ID")
    .option("--limit <n>", "max runs", "10")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; limit: string; json?: boolean }) => {
      try {
        const { buildAgentTimelineData } = await import("./observability/timeline.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const data = buildAgentTimelineData({
          workspace: process.cwd(),
          agentId,
          maxRuns: parseInt(opts.limit, 10),
        });
        // Each score point is a stored run: the timeline claims no more than its weakest run.
        const claim = aggregateClaim("observe:timeline", data.scoreSeries.map((point) => runIdClaim(point.runId, agentId)));
        if (emitClaimResult(chalk.bold(`\n📊 Timeline for agent: ${agentId}\n`), data, claim, opts)) return;
        console.log(`  Score points:    ${data.scoreSeries.length}`);
        console.log(`  Evidence points: ${data.evidenceSeries.length}`);
        console.log(`  Timeline events: ${data.timeline.length}`);
        if (data.scoreSeries.length > 0) {
          console.log(chalk.bold("\n  Score Progression:"));
          for (const sp of data.scoreSeries.slice(-10)) {
            const bar = "█".repeat(Math.floor(sp.score * 20));
            const ts = new Date(sp.ts).toISOString().slice(0, 19);
            console.log(`    ${ts}  ${bar} ${(sp.score * 100).toFixed(1)}%  (${sp.runId.slice(0, 8)})`);
          }
        }
        if (data.timeline.length > 0) {
          console.log(chalk.bold("\n  Recent Events:"));
          for (const ev of data.timeline.slice(-15)) {
            const ts = new Date(ev.ts).toISOString().slice(0, 19);
            const sev = ev.severity === "CRITICAL" ? chalk.red(ev.severity) :
                        ev.severity === "HIGH" ? chalk.yellow(ev.severity) :
                        chalk.dim(ev.severity);
            console.log(`    ${ts}  ${sev}  ${ev.kind}  ${ev.eventType ?? ev.questionId ?? ""}`);
          }
        }
        if (data.anomalies.length > 0) {
          console.log(chalk.bold(`\n  ⚠️ Anomalies: ${data.anomalies.length}`));
          for (const a of data.anomalies) {
            console.log(`    ${chalk.yellow(a.severity)} ${a.type}: ${a.message}`);
          }
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── observe anomalies ─────────────────────────────────────────── */
  observe
    .command("anomalies")
    .description("Detect observability anomalies (evidence rate drops, trust regressions, score volatility)")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; json?: boolean }) => {
      try {
        const { buildAgentTimelineData } = await import("./observability/timeline.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const data = buildAgentTimelineData({
          workspace: process.cwd(),
          agentId,
          maxRuns: 50,
        });
        // Anomalies are already computed by buildAgentTimelineData
        const anomalies = data.anomalies;
        if (opts.json) {
          console.log(JSON.stringify(anomalies, null, 2));
          return;
        }
        if (anomalies.length === 0) {
          console.log(chalk.green("✅ No observability anomalies detected."));
          return;
        }
        console.log(chalk.bold(`\n⚠️  ${anomalies.length} anomalies detected:\n`));
        for (const a of anomalies) {
          const sev = a.severity === "CRITICAL" ? chalk.red(a.severity) :
                      a.severity === "HIGH" ? chalk.yellow(a.severity) :
                      a.severity === "WARN" ? chalk.hex("#FFA500")(a.severity) :
                      chalk.dim(a.severity);
          console.log(`  ${sev}  ${a.type}`);
          console.log(`    ${a.message}`);
          console.log();
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

export function registerCorrectionCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const correction = program
    .command("correction")
    .description("Human feedback, corrections, and feedback loop tracking");

  /* ── correction list ───────────────────────────────────────────── */
  correction
    .command("list")
    .description("List corrections for an agent")
    .option("--agent <agentId>", "agent ID")
    .option("--status <status>", "filter by status: APPLIED|PENDING_VERIFICATION|VERIFIED_EFFECTIVE|VERIFIED_INEFFECTIVE")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; status?: string; json?: boolean }) => {
      try {
        const Database = (await import("better-sqlite3")).default;
        const { join } = await import("node:path");
        const { existsSync } = await import("node:fs");
        const { initCorrectionTables, getCorrectionsByAgent, getPendingCorrections, getVerifiedCorrections } = await import("./corrections/correctionStore.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const dbPath = join(process.cwd(), ".amc", "corrections.sqlite");
        if (!existsSync(dbPath)) {
          console.log(chalk.dim("No corrections database. Add a correction first: amc correction add ..."));
          return;
        }
        const db = new Database(dbPath);
        initCorrectionTables(db);
        let corrections;
        if (opts.status === "PENDING_VERIFICATION") {
          corrections = getPendingCorrections(db, agentId);
        } else if (opts.status === "VERIFIED_EFFECTIVE" || opts.status === "VERIFIED_INEFFECTIVE") {
          corrections = getVerifiedCorrections(db, agentId);
        } else {
          corrections = getCorrectionsByAgent(db, agentId);
        }
        db.close();
        if (opts.json) {
          console.log(JSON.stringify(corrections, null, 2));
          return;
        }
        if (corrections.length === 0) {
          console.log(chalk.dim("No corrections found."));
          return;
        }
        console.log(chalk.bold(`\n📝 Corrections for ${agentId} (${corrections.length}):\n`));
        for (const c of corrections) {
          const status = c.status === "VERIFIED_EFFECTIVE" ? chalk.green(c.status) :
                         c.status === "PENDING_VERIFICATION" ? chalk.yellow(c.status) :
                         c.status === "VERIFIED_INEFFECTIVE" ? chalk.red(c.status) :
                         chalk.dim(c.status);
          console.log(`  ${status.padEnd(30)}  ${c.triggerType}  Q:${c.questionIds.join(",")}`);
          console.log(`    ${c.correctionDescription.slice(0, 80)}`);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── correction add ────────────────────────────────────────────── */
  correction
    .command("add")
    .description("Add a human correction/feedback for an agent")
    .requiredOption("--questions <qids>", "question IDs comma-separated (e.g. AMC-1.1,AMC-2.3)")
    .requiredOption("--description <text>", "what was corrected")
    .requiredOption("--action <text>", "what action was taken")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { questions: string; description: string; action: string; agent?: string; json?: boolean }) => {
      try {
        const { randomUUID } = await import("node:crypto");
        const Database = (await import("better-sqlite3")).default;
        const { join } = await import("node:path");
        const { mkdirSync } = await import("node:fs");
        const { initCorrectionTables, insertCorrection, getLastCorrectionHash } = await import(
          "./corrections/correctionStore.js"
        );
        const { buildOwnerCorrection } = await import("./corrections/correctionTracker.js");
        const { latestRunForAgent } = await import("./governor/actionPolicyEngine.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const questionIds = opts.questions.split(",").map(q => q.trim()).filter(Boolean);
        if (questionIds.length === 0) {
          throw new Error("--questions must name at least one question ID, e.g. --questions AMC-1.1");
        }

        // A correction records what changed relative to a baseline; without a
        // run to compare against, effectiveness can never be verified. The
        // schema enforces this with NOT NULL on baseline_run_id, so say why
        // rather than surfacing the constraint error.
        const baseline = latestRunForAgent(process.cwd(), agentId);
        if (!baseline) {
          throw new Error(
            `No diagnostic run found for agent "${agentId}". A correction is measured against a ` +
              `baseline run, so record one first:\n  amc score --agent ${agentId}`
          );
        }
        const baselineLevels: Record<string, number> = {};
        for (const question of baseline.questionScores) {
          if (questionIds.includes(question.questionId)) {
            baselineLevels[question.questionId] = question.finalLevel;
          }
        }
        const unknown = questionIds.filter(id => !(id in baselineLevels));
        if (unknown.length > 0) {
          throw new Error(
            `Run ${baseline.runId} has no score for: ${unknown.join(", ")}. ` +
              `A correction can only target questions the baseline actually scored.`
          );
        }

        const dbDir = join(process.cwd(), ".amc");
        mkdirSync(dbDir, { recursive: true });
        const dbPath = join(dbDir, "corrections.sqlite");
        const db = new Database(dbPath);
        try {
          initCorrectionTables(db);
          const correction = buildOwnerCorrection({
            agentId,
            questionIds,
            description: opts.description,
            appliedAction: opts.action,
            baselineRunId: baseline.runId,
            baselineLevels,
            previousCorrectionHash: getLastCorrectionHash(db, agentId),
            correctionId: randomUUID(),
            triggerId: randomUUID(),
            now: Date.now()
          });
          insertCorrection(db, correction);
          if (opts.json) {
            console.log(JSON.stringify(correction, null, 2));
            return;
          }
          console.log(
            chalk.green(`✅ Correction added: ${questionIds.join(", ")} (${correction.correctionId.slice(0, 8)})`)
          );
          console.log(
            chalk.gray(`   Baseline run ${baseline.runId.slice(0, 12)} — verify with: amc correction verify --agent ${agentId}`)
          );
        } finally {
          db.close();
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── correction report ─────────────────────────────────────────── */
  correction
    .command("report")
    .description("Generate feedback closure report")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; json?: boolean }) => {
      try {
        const Database = (await import("better-sqlite3")).default;
        const { join } = await import("node:path");
        const { existsSync } = await import("node:fs");
        const { initCorrectionTables } = await import("./corrections/correctionStore.js");
        const { generateFeedbackClosureReport, renderFeedbackClosureReport } = await import("./corrections/feedbackClosure.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const dbPath = join(process.cwd(), ".amc", "corrections.sqlite");
        if (!existsSync(dbPath)) {
          console.log(chalk.dim("No corrections database."));
          return;
        }
        const db = new Database(dbPath);
        initCorrectionTables(db);
        const report = generateFeedbackClosureReport(db, agentId);
        db.close();
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        console.log(renderFeedbackClosureReport(report));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  /* ── correction effectiveness ──────────────────────────────────── */
  correction
    .command("effectiveness")
    .description("Show correction effectiveness metrics")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; json?: boolean }) => {
      try {
        const Database = (await import("better-sqlite3")).default;
        const { join } = await import("node:path");
        const { existsSync } = await import("node:fs");
        const { initCorrectionTables } = await import("./corrections/correctionStore.js");
        const { computeEffectivenessReport } = await import("./corrections/correctionTracker.js");
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const dbPath = join(process.cwd(), ".amc", "corrections.sqlite");
        if (!existsSync(dbPath)) {
          console.log(chalk.dim("No corrections database."));
          return;
        }
        const db = new Database(dbPath);
        initCorrectionTables(db);
        const report = computeEffectivenessReport(db, agentId, 0, Date.now());
        db.close();
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        console.log(chalk.bold(`\n📈 Correction Effectiveness for ${agentId}:\n`));
        console.log(JSON.stringify(report, null, 2));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}

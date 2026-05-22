/**
 * Continuous Production Monitoring for AMC
 * 
 * Real-time agent observability that continuously scores agents,
 * detects drift, and alerts on regressions — closing the LangSmith/LangFuse gap.
 */

import { EventEmitter } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DiagnosticReport, TrustTier } from "../types.js";
import { runDiagnostic } from "../diagnostic/runner.js";
import { runDriftCheck, type DriftCheckResult } from "../drift/driftDetector.js";
import { dispatchAlert, loadAlertsConfig, type AlertPayload } from "../drift/alerts.js";
import { detectEvidenceStreamAnomalies, type ObservabilityAnomaly } from "../observability/anomalyDetector.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { getAgentPaths } from "../fleet/paths.js";
import { initWorkspace } from "../workspace.js";

export interface ContinuousMonitorConfig {
  workspace: string;
  agentId: string;
  /** Scoring interval in milliseconds (default: 5 minutes) */
  scoringIntervalMs?: number;
  /** Drift check interval in milliseconds (default: 15 minutes) */
  driftCheckIntervalMs?: number;
  /** Anomaly detection window in milliseconds (default: 1 hour) */
  anomalyWindowMs?: number;
  /** Enable webhook notifications */
  enableWebhooks?: boolean;
  /** Score drop threshold for alerts (0-1, default: 0.1 = 10% drop) */
  scoreDropThreshold?: number;
  /** Evidence window used for fresh realtime diagnostic runs */
  diagnosticWindow?: string;
}

export interface MonitoringMetrics {
  agentId: string;
  currentScore: number | null;
  previousScore: number | null;
  scoreDelta: number | null;
  lastScoredAt: number | null;
  lastDriftCheckAt: number | null;
  activeIncidents: number;
  anomaliesDetected: number;
  totalScores: number;
  uptime: number;
}

export interface MonitoringEvent {
  type: "score" | "drift" | "anomaly" | "alert" | "error";
  ts: number;
  agentId: string;
  data: unknown;
}

function ensureLocalMonitorVaultPassphrase(workspace: string): void {
  if (process.env.AMC_VAULT_PASSPHRASE && process.env.AMC_VAULT_PASSPHRASE.length > 0) {
    return;
  }

  const amcDir = join(workspace, ".amc");
  const localPassphrasePath = join(amcDir, "local-vault-passphrase");
  if (pathExists(localPassphrasePath)) {
    const localPassphrase = readUtf8(localPassphrasePath).trim();
    if (localPassphrase.length >= 8) {
      process.env.AMC_VAULT_PASSPHRASE = localPassphrase;
    }
    return;
  }

  const vaultFile = join(amcDir, "vault.amcvault");
  if (pathExists(vaultFile)) {
    return;
  }

  ensureDir(amcDir);
  const generated = `amc-monitor-${randomBytes(32).toString("base64url")}`;
  writeFileAtomic(localPassphrasePath, `${generated}\n`, 0o600);
  process.env.AMC_VAULT_PASSPHRASE = generated;
}

export class ContinuousMonitor extends EventEmitter {
  private config: Required<ContinuousMonitorConfig>;
  private scoringTimer: NodeJS.Timeout | null = null;
  private driftTimer: NodeJS.Timeout | null = null;
  private startedAt: number = 0;
  private metrics: MonitoringMetrics;
  private scoreHistory: Array<{ ts: number; score: number; runId: string }> = [];
  private running = false;
  private scoringInFlight = false;
  private driftInFlight = false;

  constructor(config: ContinuousMonitorConfig) {
    super();
    this.config = {
      workspace: config.workspace,
      agentId: config.agentId,
      scoringIntervalMs: config.scoringIntervalMs ?? 5 * 60 * 1000, // 5 min
      driftCheckIntervalMs: config.driftCheckIntervalMs ?? 15 * 60 * 1000, // 15 min
      anomalyWindowMs: config.anomalyWindowMs ?? 60 * 60 * 1000, // 1 hour
      enableWebhooks: config.enableWebhooks ?? true,
      scoreDropThreshold: config.scoreDropThreshold ?? 0.1,
      diagnosticWindow: config.diagnosticWindow ?? "30d"
    };

    this.metrics = {
      agentId: config.agentId,
      currentScore: null,
      previousScore: null,
      scoreDelta: null,
      lastScoredAt: null,
      lastDriftCheckAt: null,
      activeIncidents: 0,
      anomaliesDetected: 0,
      totalScores: 0,
      uptime: 0
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Monitor already running");
    }

    this.running = true;
    this.startedAt = Date.now();
    try {
      ensureLocalMonitorVaultPassphrase(this.config.workspace);
      initWorkspace({
        workspacePath: this.config.workspace,
        agentId: this.config.agentId
      });
      this.emit("started", { agentId: this.config.agentId, ts: this.startedAt });

      // Load existing score history before generating the first fresh score.
      await this.loadScoreHistory();

      // Generate an immediate fresh score so monitoring begins with live state,
      // not a stale snapshot from a prior run.
      const initialReport = await this.runScoringCycle();
      await this.runDriftCheckCycle(initialReport?.runId);

      // Start continuous scoring only after the first run completes to avoid
      // overlapping diagnostics on short intervals.
      this.scoringTimer = setInterval(() => {
        this.runScoringCycle()
          .then((report) => this.runDriftIfDue(report?.runId))
          .catch((error) => {
            this.emitError("scoring_cycle_failed", error);
          });
      }, this.config.scoringIntervalMs);

      // Keep a separate drift cadence for deployments that want slower drift
      // evaluation than scoring.
      this.driftTimer = setInterval(() => {
        this.runDriftCheckCycle().catch((error) => {
          this.emitError("drift_check_failed", error);
        });
      }, this.config.driftCheckIntervalMs);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.scoringTimer) {
      clearInterval(this.scoringTimer);
      this.scoringTimer = null;
    }

    if (this.driftTimer) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }

    this.emit("stopped", { agentId: this.config.agentId, ts: Date.now() });
  }

  getMetrics(): MonitoringMetrics {
    return {
      ...this.metrics,
      uptime: this.running ? Date.now() - this.startedAt : 0
    };
  }

  private async loadScoreHistory(): Promise<void> {
    const runsDir = getAgentPaths(this.config.workspace, this.config.agentId).runsDir;
    if (!pathExists(runsDir)) {
      return;
    }

    // Load last 100 runs for anomaly detection
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(runsDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(-100);

    for (const file of files) {
      try {
        const report = JSON.parse(readUtf8(join(runsDir, file))) as DiagnosticReport;
        this.scoreHistory.push({
          ts: report.ts,
          score: report.integrityIndex,
          runId: report.runId
        });
      } catch {
        // Skip invalid files
      }
    }

    if (this.scoreHistory.length > 0) {
      const latest = this.scoreHistory[this.scoreHistory.length - 1]!;
      this.metrics.currentScore = latest.score;
      this.metrics.lastScoredAt = latest.ts;
      this.metrics.totalScores = this.scoreHistory.length;
    }
  }

  private async runFreshDiagnostic(): Promise<DiagnosticReport> {
    const forceNoSign = process.env.AMC_NO_SIGN === "1";
    try {
      return await runDiagnostic({
        workspace: this.config.workspace,
        agentId: this.config.agentId,
        window: this.config.diagnosticWindow,
        targetName: "default",
        claimMode: "auto",
        noSign: forceNoSign
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (forceNoSign || !/Vault unlock failed|Vault locked|passphrase/i.test(message)) {
        throw error;
      }
      return runDiagnostic({
        workspace: this.config.workspace,
        agentId: this.config.agentId,
        window: this.config.diagnosticWindow,
        targetName: "default",
        claimMode: "auto",
        noSign: true
      });
    }
  }

  private async runScoringCycle(): Promise<DiagnosticReport | null> {
    if (this.scoringInFlight) {
      return null;
    }
    this.scoringInFlight = true;
    try {
      const report = await this.runFreshDiagnostic();

      // Update metrics
      this.metrics.previousScore = this.metrics.currentScore;
      this.metrics.currentScore = report.integrityIndex;
      this.metrics.lastScoredAt = report.ts;
      this.metrics.totalScores += 1;

      if (this.metrics.previousScore !== null) {
        this.metrics.scoreDelta = this.metrics.currentScore - this.metrics.previousScore!;

        // Check for score drops
        if (this.metrics.scoreDelta < -this.config.scoreDropThreshold) {
          await this.handleScoreDrop(report);
        }
      } else {
        this.metrics.scoreDelta = null;
      }

      // Add to history
      this.scoreHistory.push({
        ts: report.ts,
        score: report.integrityIndex,
        runId: report.runId
      });

      // Keep only last 100 scores
      if (this.scoreHistory.length > 100) {
        this.scoreHistory = this.scoreHistory.slice(-100);
      }

      // Run anomaly detection
      await this.runAnomalyDetection();

      this.emit("score", {
        type: "score",
        ts: report.ts,
        agentId: this.config.agentId,
        data: {
          score: report.integrityIndex,
          runId: report.runId,
          delta: this.metrics.scoreDelta,
          status: report.status,
          questionCount: report.questionScores.length
        }
      } as MonitoringEvent);

      return report;
    } finally {
      this.scoringInFlight = false;
    }
  }

  private async runDriftIfDue(currentRunId?: string): Promise<void> {
    if (!currentRunId) {
      return;
    }
    if (
      this.metrics.lastDriftCheckAt !== null &&
      Date.now() - this.metrics.lastDriftCheckAt < this.config.driftCheckIntervalMs
    ) {
      return;
    }
    await this.runDriftCheckCycle(currentRunId);
  }

  private async runDriftCheckCycle(currentRunId?: string): Promise<void> {
    if (this.driftInFlight) {
      return;
    }
    this.driftInFlight = true;
    const ts = Date.now();
    try {
      const result = await runDriftCheck({
        workspace: this.config.workspace,
        agentId: this.config.agentId,
        currentRunId
      });

      this.metrics.lastDriftCheckAt = ts;

      if (result.triggered) {
        this.metrics.activeIncidents += 1;
        await this.handleDriftDetected(result);
      }

      this.emit("drift", {
        type: "drift",
        ts,
        agentId: this.config.agentId,
        data: result
      } as MonitoringEvent);
    } finally {
      this.driftInFlight = false;
    }
  }

  private async runAnomalyDetection(): Promise<void> {
    const anomalies = detectEvidenceStreamAnomalies({
      evidencePoints: [],
      scorePoints: this.scoreHistory,
      nowTs: Date.now()
    });

    if (anomalies.length > 0) {
      this.metrics.anomaliesDetected += anomalies.length;

      for (const anomaly of anomalies) {
        this.emit("anomaly", {
          type: "anomaly",
          ts: anomaly.ts,
          agentId: this.config.agentId,
          data: anomaly
        } as MonitoringEvent);

        if (anomaly.severity === "CRITICAL" || anomaly.severity === "HIGH") {
          await this.sendAnomalyAlert(anomaly);
        }
      }
    }
  }

  private async handleScoreDrop(report: DiagnosticReport): Promise<void> {
    const payload: AlertPayload = {
      type: "AMC_ALERT",
      ruleId: "continuous-monitor-score-drop",
      agentId: this.config.agentId,
      runId: report.runId,
      summary: `Score dropped ${Math.abs(this.metrics.scoreDelta! * 100).toFixed(1)}% (${this.metrics.previousScore?.toFixed(2)} → ${this.metrics.currentScore?.toFixed(2)})`,
      links: {
        dashboard: "http://127.0.0.1:4173",
        report: `.amc/agents/${this.config.agentId}/reports/${report.runId}.md`
      },
      hashes: {
        reportSha256: report.reportJsonSha256 ?? sha256Hex(JSON.stringify(report)),
        bundleSha256: sha256Hex(`${this.config.agentId}:${report.runId}`)
      }
    };

    if (this.config.enableWebhooks) {
      try {
        await dispatchAlert(this.config.workspace, payload);
        this.emit("alert", {
          type: "alert",
          ts: Date.now(),
          agentId: this.config.agentId,
          data: payload
        } as MonitoringEvent);
      } catch (error) {
        this.emitError("alert_dispatch_failed", error);
      }
    }

    // Log to ledger
    const ledger = openLedger(this.config.workspace);
    const sessionId = `monitor-${randomUUID()}`;
    try {
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-watch",
        binarySha256: sha256Hex("amc-watch")
      });

      ledger.appendEvidence({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "SCORE_DROP_DETECTED",
          severity: "HIGH",
          agentId: this.config.agentId,
          runId: report.runId,
          previousScore: this.metrics.previousScore,
          currentScore: this.metrics.currentScore,
          delta: this.metrics.scoreDelta
        }),
        payloadExt: "json",
        inline: true,
        meta: {
          auditType: "SCORE_DROP_DETECTED",
          severity: "HIGH",
          agentId: this.config.agentId,
          trustTier: "OBSERVED"
        }
      });

      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }
  }

  private async handleDriftDetected(result: DriftCheckResult): Promise<void> {
    const payload: AlertPayload = {
      type: "AMC_ALERT",
      ruleId: result.ruleId ?? "continuous-monitor-drift",
      agentId: this.config.agentId,
      runId: result.currentRunId ?? "unknown",
      summary: `Drift detected: ${result.reasons.join(" | ")}`,
      links: {
        dashboard: "http://127.0.0.1:4173",
        report: `.amc/agents/${this.config.agentId}/incidents/${result.incidentId}.md`
      },
      hashes: {
        reportSha256: sha256Hex(JSON.stringify(result)),
        bundleSha256: sha256Hex(`${this.config.agentId}:${result.currentRunId}`)
      }
    };

    if (this.config.enableWebhooks) {
      try {
        await dispatchAlert(this.config.workspace, payload);
      } catch (error) {
        this.emitError("drift_alert_failed", error);
      }
    }
  }

  private async sendAnomalyAlert(anomaly: ObservabilityAnomaly): Promise<void> {
    const payload: AlertPayload = {
      type: "AMC_ALERT",
      ruleId: `continuous-monitor-${anomaly.type.toLowerCase()}`,
      agentId: this.config.agentId,
      runId: "anomaly-detection",
      summary: anomaly.message,
      links: {
        dashboard: "http://127.0.0.1:4173",
        report: `.amc/agents/${this.config.agentId}/anomalies/${anomaly.ts}.md`
      },
      hashes: {
        reportSha256: sha256Hex(JSON.stringify(anomaly)),
        bundleSha256: sha256Hex(`${this.config.agentId}:${anomaly.ts}`)
      }
    };

    if (this.config.enableWebhooks) {
      try {
        await dispatchAlert(this.config.workspace, payload);
      } catch (error) {
        this.emitError("anomaly_alert_failed", error);
      }
    }
  }

  private emitError(code: string, error: unknown): void {
    this.emit("error", {
      type: "error",
      ts: Date.now(),
      agentId: this.config.agentId,
      data: {
        code,
        message: error instanceof Error ? error.message : String(error)
      }
    } as MonitoringEvent);
  }
}

export function createContinuousMonitor(config: ContinuousMonitorConfig): ContinuousMonitor {
  return new ContinuousMonitor(config);
}

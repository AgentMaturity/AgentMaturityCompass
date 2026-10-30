import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openActionJournal, type ActionJournal } from "../../../src/actions/actionJournal.js";
import { initAlertsConfig, loadAlertsConfig, signAlertsConfig } from "../../../src/drift/alerts.js";
import { runDriftCheck } from "../../../src/drift/driftDetector.js";
import { activeFreezeStatus } from "../../../src/drift/freezeEngine.js";
import { getAgentPaths } from "../../../src/fleet/paths.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest } from "../../../src/crypto/keys.js";
import { IncidentInputError, loadIncidentClocks, recordIncidentClockEvent } from "../../../src/incidents/incidentClockEvents.js";
import { computeIncidentHash, createIncidentStore } from "../../../src/incidents/incidentStore.js";
import type { Incident } from "../../../src/incidents/incidentTypes.js";
import { openLedger } from "../../../src/ledger/ledger.js";
import { ToolPipeline } from "../../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../../src/tools/toolRegistry.js";
import type { ActionClass, DiagnosticReport, LayerName } from "../../../src/types.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { canonicalize } from "../../../src/utils/json.js";
import type { Domain } from "../../../src/domains/domainRegistry.js";
import { fixturesFor } from "./harness.js";
import { newWorkspace } from "./workspaces.js";
import { writeSealedReport } from "../../helpers/sealedRun.js";

/**
 * L0-MON-01 and L0-MON-02 against the real drift detector, freeze and incident clock store (P1-14). The drift oracle is
 * the DRIFT_REGRESSION_DETECTED ledger event, the signed freeze and the pipeline's refusal of a frozen class; the clock
 * oracle is the clocks attached from the F4 table and the store's refusals. The agent's reply is never read.
 */
type Scores = { overallHundredths: number; integrityPercent: number; correlationPercent: number };
type Thresholds = { overallDropGteHundredths: number; layerDropGteHundredths: number; integrityDropGtePercent: number; correlationBelowPercent: number };
type DriftSetup = { thresholds: Thresholds; previous: Scores; current: Scores; thenCall: { tool: string; actionClass: ActionClass } };
/** `clock` names a clock for NOTIFIED and a trigger for TRIGGER; `due` pins a started clock's deadline, in hours after the incident opened. */
type ClockSetup = { station: Domain; events: Array<{ kind: "NOTIFIED" | "TRIGGER"; clock: string; atHours: number }>;
  due?: Array<{ clock: string; hoursAfterCreated: number }> };

/** A sealed diagnostic run report with the fixture's scores (the drift detector's input). */
function writeRun(ws: string, runId: string, ts: number, s: Scores): void {
  const overall = s.overallHundredths / 100;
  const layer = (layerName: LayerName) => ({ layerName, avgFinalLevel: overall, confidenceWeightedFinalLevel: overall });
  const report = {
    agentId: "default", runId, ts, windowStartTs: ts - 86_400_000, windowEndTs: ts, status: "VALID", verificationPassed: true,
    trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex: s.integrityPercent / 100,
    trustLabel: s.integrityPercent >= 60 ? "HIGH TRUST" : "LOW TRUST", targetProfileId: "default",
    layerScores: (["Strategic Agent Operations", "Leadership & Autonomy", "Culture & Alignment", "Resilience", "Skills"] as LayerName[]).map(layer),
    questionScores: Array.from({ length: 48 }, (_u, i) => ({ questionId: `Q${i + 1}`, claimedLevel: 5, supportedMaxLevel: 5, finalLevel: 5,
      confidence: 0.9, evidenceEventIds: ["ev"], flags: [], narrative: "layer0 fixture" })),
    inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: s.correlationPercent / 100,
    invalidReceiptsCount: 0, correlationWarnings: [], evidenceCoverage: 1, evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [], runSealSig: "sig", reportJsonSha256: "hash"
  } satisfies Partial<DiagnosticReport>;
  // Sealed: since WP37 the drift detector reads only runs whose seal verifies.
  writeSealedReport(ws, getAgentPaths(ws, "default").runsDir, runId, report);
}

describe("L0-MON-01 drift alarms with a recorded response", () => {
  const fixtures = fixturesFor("drift", "L0-MON-01");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as DriftSetup;
      const ws = newWorkspace();
      const webhook = createServer((_req, res) => { res.statusCode = 200; res.end("ok"); });
      await new Promise<void>((done) => webhook.listen(0, "127.0.0.1", () => done()));
      try {
        initAlertsConfig(ws);
        const alerts = loadAlertsConfig(ws);
        alerts.alerts.channels[0]!.url = `http://127.0.0.1:${(webhook.address() as { port: number }).port}/webhook`;
        const t = s.thresholds;
        alerts.alerts.rules[0]!.when = { overallDropGte: t.overallDropGteHundredths / 100, layerDropGte: t.layerDropGteHundredths / 100,
          integrityDropGte: t.integrityDropGtePercent / 100, correlationDropBelow: t.correlationBelowPercent / 100, assuranceDropBelow: {} };
        writeFileSync(join(ws, ".amc", "alerts.yaml"), JSON.stringify(alerts, null, 2));
        signAlertsConfig(ws);
        const now = Date.now();
        writeRun(ws, "run_prev", now - 200_000, s.previous);
        writeRun(ws, "run_curr", now - 100_000, s.current);
        const drift = await runDriftCheck({ workspace: ws, agentId: "default" });

        // The response: a breach freezes classes, and the pipeline's recheck refuses a frozen class before the body.
        let bodyRuns = 0;
        const registry = new ToolRegistry();
        registry.define(defineTool({ name: s.thenCall.tool, actionClass: s.thenCall.actionClass, description: "fixture tool",
          body: () => { bodyRuns += 1; return { ok: true, output: "ran", effect: "applied" }; } }));
        let journal: ActionJournal | undefined;
        const pipeline = new ToolPipeline({ registry, workspace: ws, journal: () => (journal ??= openActionJournal(ws)) });
        const outcome = await pipeline.execute({ name: s.thenCall.tool, agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
        const chain = journal!.verifyReceiptChain(outcome.action!.executionId);
        journal!.close();
        expect(chain.ok, chain.errors.join("; ")).toBe(true);

        const ledger = openLedger(ws);
        const alarms = ledger.getAllEvents().filter((e) => String(e.payload_inline ?? "").includes("DRIFT_REGRESSION_DETECTED")
          || JSON.parse(e.meta_json || "{}").auditType === "DRIFT_REGRESSION_DETECTED");
        ledger.close();
        if (f.envelope.expected.result === "pass") {
          expect(drift.triggered, drift.reasons.join("; ")).toBe(false);
          expect(alarms).toHaveLength(0);
          expect(outcome.ok, JSON.stringify(outcome.denied)).toBe(true);
          return;
        }
        expect(drift.triggered, drift.reasons.join("; ")).toBe(true);
        expect(alarms.length, "the alarm is a ledger event").toBeGreaterThan(0);
        expect(activeFreezeStatus(ws, "default").actionClasses).toContain(s.thenCall.actionClass);
        expect(outcome.ok).toBe(false);
        expect(bodyRuns, "a frozen class never runs its body").toBe(0);
        expect(chain.receipts.at(-1)?.reasonCode).toBe(f.envelope.expected.reasonCode);
      } finally {
        await new Promise<void>((done) => webhook.close(() => done()));
      }
    });
  }
});

function openIncident(ws: string, store: ReturnType<typeof createIncidentStore>, createdTs: number): Incident {
  const base: Omit<Incident, "incident_hash" | "signature"> = {
    incidentId: "incident_layer0", agentId: "default", severity: "CRITICAL", state: "OPEN", title: "layer0 fixture incident",
    description: "fixture", triggerType: "MANUAL", triggerId: "trigger_layer0", rootCauseClaimIds: [], affectedQuestionIds: [], causalEdges: [],
    timelineEventIds: [], createdTs, updatedTs: createdTs, resolvedTs: null, postmortemRef: null, prev_incident_hash: store.getLastIncidentHash("default")
  };
  const incidentHash = computeIncidentHash(base);
  const signature = signHexDigest(sha256Hex(canonicalize({ ...base, incident_hash: incidentHash })), getPrivateKeyPem(ws, "monitor"));
  const incident = { ...base, incident_hash: incidentHash, signature };
  store.insertIncident(incident);
  return incident;
}

const refusalCode = (message: string): string =>
  /backdated/.test(message) ? "backdated" : /future-dated/.test(message) ? "future_dated" : /unknown clock/.test(message) ? "unknown_clock"
    : /already recorded/.test(message) ? "duplicate_notice" : /before its trigger/.test(message) ? "notice_before_trigger" : `unmapped: ${message}`;

describe("L0-MON-02, L1-WLT-US-05 and L1-WLT-US-11: incidents start regulatory clocks (F4 clock store)", () => {
  const fixtures = fixturesFor("incident_clocks");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const s = f.envelope.setup as unknown as ClockSetup;
      const ws = newWorkspace();
      const ledger = openLedger(ws);
      try {
        const store = createIncidentStore(ledger.db);
        store.initTables();
        const createdTs = Date.now() - 2 * 3_600_000;
        const incident = openIncident(ws, store, createdTs);
        const keys = { privateKeyPem: getPrivateKeyPem(ws, "monitor"), publicKeys: getPublicKeyHistory(ws, "monitor") };
        let refused: string | null = null;
        for (const e of s.events) {
          try {
            recordIncidentClockEvent(store, { incidentId: incident.incidentId, station: s.station, kind: e.kind, triggerOrClockId: e.clock,
              ts: createdTs + e.atHours * 3_600_000, recordedBy: "layer0-fixture", ...keys });
          } catch (error) {
            if (!(error instanceof IncidentInputError)) throw error;
            refused = refusalCode(error.message);
            break;
          }
        }
        const loaded = loadIncidentClocks(store, incident.incidentId, s.station, Date.now(), keys.publicKeys);
        if (f.envelope.expected.result === "deny") {
          expect(refused).toBe(f.envelope.expected.reasonCode);
          return;
        }
        expect(refused).toBeNull();
        const started = loaded.clocks.filter((c) => c.status !== "NOT_STARTED");
        expect(started.length, "awareness starts the station's clocks").toBeGreaterThan(0);
        for (const c of started) expect(c.dueTs, `${c.clockId} has a deadline`).toBeGreaterThan(createdTs);
        for (const e of s.events.filter((x) => x.kind === "NOTIFIED")) expect(loaded.clocks.find((c) => c.clockId === e.clock)?.status).toBe("SATISFIED");
        for (const d of s.due ?? []) expect(loaded.clocks.find((c) => c.clockId === d.clock)?.dueTs, d.clock).toBe(createdTs + d.hoursAfterCreated * 3_600_000);
      } finally {
        ledger.close();
      }
    });
  }
});

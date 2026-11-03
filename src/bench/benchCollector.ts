import { median as arithmeticMedian } from "../experiments/stats.js";
import { countBenchAuditRows, countReadonlyBenchAuditEvents, latestReadonlyBenchAssuranceByPack } from "./benchReadOnlyInputs.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { DiagnosticReport, LayerName, OutcomeReport } from "../types.js";
import { parseWindowToMs } from "../utils/time.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { listTrustedRuns } from "../governor/runTrust.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { loadVerifiedLatestOrgScorecard, type loadLatestOrgScorecard } from "../org/orgScorecard.js";
import { collectForecastSignals, captureForecastSignals, type ForecastSignalBundle } from "../forecast/forecastSignals.js";
import { forecastScopeLatestPath, loadVerifiedForecastArtifact } from "../forecast/forecastStore.js";
import { openLedger } from "../ledger/ledger.js";
import { readTransparencyEntries } from "../transparency/logChain.js";
import { canonicalize } from "../utils/json.js";
import { hashId } from "./benchRedaction.js";
import { benchArtifactSchema, type BenchArtifact, type BenchBuildMeta } from "./benchSchema.js";
import type { BenchPolicy } from "./benchPolicySchema.js";

const LAYER_KEY_BY_NAME: Record<LayerName, "strategicOps" | "leadership" | "culture" | "resilience" | "skills"> = {
  "Strategic Agent Operations": "strategicOps",
  "Leadership & Autonomy": "leadership",
  "Culture & Alignment": "culture",
  "Resilience": "resilience",
  "Skills": "skills"
};

function parseOutcomeReport(file: string): OutcomeReport | null {
  try {
    return JSON.parse(readUtf8(file)) as OutcomeReport;
  } catch {
    return null;
  }
}

/** Trusted runs only, oldest first: an edited, copied or unanchored run, or a thinned history, refuses a signed bench. */
function listAgentRuns(workspace: string, agentId: string): DiagnosticReport[] {
  return listTrustedRuns(workspace, agentId).reverse();
}

function listAgentOutcomeReports(workspace: string, agentId: string): OutcomeReport[] {
  const dir = join(getAgentPaths(workspace, agentId).rootDir, "outcomes", "reports");
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => parseOutcomeReport(join(dir, name)))
    .filter((row): row is OutcomeReport => row !== null)
    .sort((a, b) => a.ts - b.ts);
}

function latestInWindow<T extends { ts: number }>(rows: T[], startTs: number, endTs: number): T | null {
  let latest: T | null = null;
  for (const row of rows) {
    if (row.ts < startTs || row.ts > endTs) {
      continue;
    }
    if (!latest || row.ts > latest.ts) {
      latest = row;
    }
  }
  return latest;
}

type LayerMap = Record<"strategicOps" | "leadership" | "culture" | "resilience" | "skills", number | null>;
/** Every layer not evaluated (null) until a run or scorecard measures it. */
const unmeasuredLayers = (): LayerMap => ({ strategicOps: null, leadership: null, culture: null, resilience: null, skills: null });

function layerMapFromRun(run: DiagnosticReport): LayerMap {
  const base = unmeasuredLayers();
  for (const layer of run.layerScores) {
    const key = LAYER_KEY_BY_NAME[layer.layerName as LayerName];
    if (!key) {
      continue;
    }
    base[key] = Number(layer.avgFinalLevel.toFixed(6));
  }
  return base;
}

function layerMapFromNode(node: NonNullable<ReturnType<typeof loadLatestOrgScorecard>>["nodes"][number]): LayerMap {
  const base = unmeasuredLayers();
  for (const layer of node.layerScores) {
    const key = LAYER_KEY_BY_NAME[layer.layerName as LayerName];
    if (!key) {
      continue;
    }
    base[key] = Number(layer.median.toFixed(6));
  }
  return base;
}

function mapTrustLabel(input: string): "LOW" | "MEDIUM" | "HIGH" {
  const text = input.toUpperCase();
  if (text.includes("HIGH")) {
    return "HIGH";
  }
  if (text.includes("LOW") || text.includes("UNRELIABLE")) {
    return "LOW";
  }
  return "MEDIUM";
}

/** Trust label from the evidence gates; shared with the audit binder. */
export function derivedTrustLabel(params: {
  integrityIndex: number | null;
  correlationRatio: number | null;
  observedShare: number | null;
}): "LOW" | "MEDIUM" | "HIGH" {
  // An unmeasured signal never earns a label above LOW.
  if (params.integrityIndex === null || params.correlationRatio === null || params.observedShare === null) return "LOW";
  if (params.observedShare >= 0.7 && params.integrityIndex >= 0.9 && params.correlationRatio >= 0.9) {
    return "HIGH";
  }
  if (params.observedShare >= 0.5 && params.integrityIndex >= 0.75 && params.correlationRatio >= 0.75) {
    return "MEDIUM";
  }
  return "LOW";
}

type ValueDims = Record<"emotionalValue" | "functionalValue" | "economicValue" | "brandValue" | "lifetimeValue" | "valueScore", number | null>;
const round6 = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)) : null;

/** A category the outcome report did not score is not evaluated (null), never 0. */
function valueDimensionsFromOutcome(report: OutcomeReport): ValueDims {
  return {
    emotionalValue: round6(report.categoryScores.Emotional),
    functionalValue: round6(report.categoryScores.Functional),
    economicValue: round6(report.categoryScores.Economic),
    brandValue: round6(report.categoryScores.Brand),
    lifetimeValue: round6(report.categoryScores.Lifetime),
    valueScore: round6(report.valueScore)
  };
}

function countAuditEvents(params: {
  workspace: string;
  startTs: number;
  endTs: number;
  auditTypes: string[];
}): number {
  const ledger = openLedger(params.workspace);
  try {
    return countBenchAuditRows(ledger.getEventsBetween(params.startTs, params.endTs), params.auditTypes);
  } finally {
    ledger.close();
  }
}

// Bench artifacts retain six-decimal serialization around experiments/stats.ts midpoint median.
function median(values: number[]): number {
  return Number(arithmeticMedian(values).toFixed(6));
}

const mean6 = (values: number[]): number => Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
const nullableMap = <T>(value: number | null, map: (value: number) => T): T | null => (value === null ? null : map(value));

function resolveWindow(windowDays: number): { startTs: number; endTs: number; days: number } {
  const ms = parseWindowToMs(`${windowDays}d`);
  const endTs = Date.now();
  return {
    startTs: endTs - ms,
    endTs,
    days: windowDays
  };
}

/** The newest point of a series; null (not measured) when the series has none. */
function latestSeriesValue(series: Array<{ ts: number; value: number }> | undefined): number | null {
  return round6(series?.[series.length - 1]?.value);
}

/** A risk index with no series is unmeasured: score it as worst-case risk, never as risk 0 (= a perfect 100) (WP37). */
const UNMEASURED_RISK = 100;

function determineIncludedEventKinds(workspace: string, startTs: number, endTs: number): string[] {
  const allow = new Set([
    "ORG_SCORECARD_UPDATED",
    "FORECAST_CREATED",
    "APPROVAL_DECIDED",
    "PLUGIN_INSTALLED",
    "PLUGIN_UPGRADED",
    "PLUGIN_REMOVED",
    "NOTARY_ATTESTATION_OBSERVED",
    "BENCH_CREATED",
    "BENCH_PUBLISHED",
    "BENCH_IMPORTED",
    "BENCH_COMPARISON_CREATED"
  ]);
  const kinds = new Set<string>();
  for (const entry of readTransparencyEntries(workspace)) {
    if (entry.ts < startTs || entry.ts > endTs) {
      continue;
    }
    if (allow.has(entry.type)) {
      kinds.add(entry.type);
    }
  }
  return [...kinds].sort((a, b) => a.localeCompare(b));
}

function buildCalculationManifest(params: {
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeIdHash: string;
  runRefs: string[];
  sourceEventHashes: string[];
  policySha256: string;
}): Record<string, unknown> {
  return {
    v: 1,
    scope: {
      type: params.scopeType,
      idHash: params.scopeIdHash
    },
    runRefs: [...new Set(params.runRefs)].sort((a, b) => a.localeCompare(b)),
    sourceEventHashes: [...new Set(params.sourceEventHashes)].sort((a, b) => a.localeCompare(b)),
    policySha256: params.policySha256
  };
}

export interface CollectedBenchData {
  bench: BenchArtifact;
  buildMeta: BenchBuildMeta;
  includedEventKinds: string[];
  calculationManifest: Record<string, unknown>;
  evidenceGateReasons: string[];
  runRefs: string[];
}

type BenchCollectionInput = {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  windowDays: number;
  policy: BenchPolicy;
  named?: boolean;
  labels?: {
    industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
    agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
    deployment?: "single" | "host" | "k8s" | "compose";
  };
};
export function collectBenchData(params: BenchCollectionInput): CollectedBenchData {
  const window = resolveWindow(params.windowDays), identity = collectionIdentity(params), signals = collectForecastSignals({workspace:params.workspace,scope:{type:params.scopeType,id:params.scopeId},lookbackDays:Math.max(90,params.windowDays)});
  return collectBenchDataWithInputs(params,window,signals,identity);
}
/** Internal selected-value capture: original window and actual forecast selector are retained, not refreshed after signing. */
export function captureBenchData(input: BenchCollectionInput) {
  const params = structuredClone(input);
  const window = resolveWindow(params.windowDays), identity = collectionIdentity(params);
  const signals = captureForecastSignals({workspace:params.workspace,scope:{type:params.scopeType,id:params.scopeId},lookbackDays:Math.max(90,params.windowDays)});
  const collected = collectBenchDataWithInputs(params,window,signals.signals,identity,true), selected = canonicalize(collected);
  return {collected,assertCurrent(){signals.assertCurrent();if(canonicalize(collectBenchDataWithInputs(params,window,signals.signals,identity,true))!==selected)throw new Error("selected bench inputs changed while signing");}};
}
function collectionIdentity(params:BenchCollectionInput){return {scopeIdHash:hashId(params.scopeId,params.policy.benchPolicy.privacy.hashTruncBytes),workspaceHash:hashId(params.workspace,params.policy.benchPolicy.privacy.hashTruncBytes)};}
function collectBenchDataWithInputs(params: BenchCollectionInput, window: ReturnType<typeof resolveWindow>, signals: ForecastSignalBundle, identity:ReturnType<typeof collectionIdentity>, readOnly = false): CollectedBenchData {
  const {scopeIdHash,workspaceHash} = identity;
  const countSelectedAudit = readOnly ? countReadonlyBenchAuditEvents : countAuditEvents, selectedAssurance = readOnly ? latestReadonlyBenchAssuranceByPack : latestAssuranceByPack;
  const scope = { type: params.scopeType, id: params.scopeId };
  // Signed inputs only: an unsigned or tampered forecast, scorecard or signal file is absent and named as a gate reason.
  const latestForecast = loadVerifiedForecastArtifact(params.workspace, scope);
  const evidenceGateReasons: string[] = signals.ignoredInputs.map((input) => `UNVERIFIED_INPUT_IGNORED:${input}`);
  if (latestForecast === null && pathExists(forecastScopeLatestPath(params.workspace, scope))) evidenceGateReasons.push("UNVERIFIED_INPUT_IGNORED:latest forecast");
  // No run in the lookback measured the evidence mix or an integrity index: null (not evaluated), not the bundle's 0.
  const measuredRuns = signals.runRefs.length > 0;
  const evidenceCoverage = measuredRuns ? { observedShare: Number(signals.evidence.observedShare.toFixed(6)),
    attestedShare: Number(signals.evidence.attestedShare.toFixed(6)),
    selfReportedShare: Number(signals.evidence.selfReportedShare.toFixed(6)) } : null;
  const observedShare = evidenceCoverage?.observedShare ?? null;
  const integrityIndex = measuredRuns ? Number(signals.evidence.latestIntegrityIndex.toFixed(6)) : null;
  const correlationRatio = round6(signals.evidence.latestCorrelationRatio);
  const observedRuns = signals.evidence.observedRuns; // a real count: 0 runs is a measurement
  const runRefs = signals.runRefs;

  if (observedRuns < params.policy.benchPolicy.privacy.minRunsForAnyExport) {
    evidenceGateReasons.push("MIN_RUNS_NOT_MET");
  }
  const firstPointTs = signals.points.maturityOverall[0]?.ts ?? 0;
  const lastPointTs = signals.points.maturityOverall[signals.points.maturityOverall.length - 1]?.ts ?? 0;
  const coveredDays = firstPointTs > 0 && lastPointTs > firstPointTs ? Math.max(1, Math.round((lastPointTs - firstPointTs) / 86_400_000)) : 0;
  if (coveredDays < params.policy.benchPolicy.privacy.minDaysCoverage) {
    evidenceGateReasons.push("MIN_DAYS_COVERAGE_NOT_MET");
  }

  let trustLabel = derivedTrustLabel({
    integrityIndex,
    correlationRatio,
    observedShare
  });

  const maturityOverall = latestSeriesValue(signals.points.maturityOverall);
  const layers = unmeasuredLayers();
  const maturityQuestions: Array<{ qIdHash: string; score: number }> = [];

  if (params.scopeType === "AGENT") {
    const agentId = resolveAgentId(params.workspace, params.scopeId);
    const runs = listAgentRuns(params.workspace, agentId).filter((run) => run.ts >= window.startTs && run.ts <= window.endTs);
    const latestRun = runs[runs.length - 1] ?? null;
    if (latestRun) {
      const mapped = layerMapFromRun(latestRun);
      layers.strategicOps = mapped.strategicOps;
      layers.leadership = mapped.leadership;
      layers.culture = mapped.culture;
      layers.resilience = mapped.resilience;
      layers.skills = mapped.skills;
      trustLabel = mapTrustLabel(latestRun.trustLabel);
      if (params.policy.benchPolicy.includedMetrics.maturity.includeBy42Questions) {
        for (const question of latestRun.questionScores) {
          maturityQuestions.push({
            qIdHash: `q_${hashId(question.questionId, params.policy.benchPolicy.privacy.hashTruncBytes)}`,
            score: Number(question.finalLevel.toFixed(6))
          });
        }
      }
    }
  } else {
    const { scorecard, ignored } = loadVerifiedLatestOrgScorecard(params.workspace);
    if (ignored !== null) evidenceGateReasons.push(`UNVERIFIED_INPUT_IGNORED:${ignored}`);
    const node =
      params.scopeType === "WORKSPACE"
        ? scorecard?.summary.enterpriseRollup
        : scorecard?.nodes.find((row) => row.nodeId === params.scopeId) ?? null;
    if (node) {
      const mapped = layerMapFromNode(node);
      layers.strategicOps = mapped.strategicOps;
      layers.leadership = mapped.leadership;
      layers.culture = mapped.culture;
      layers.resilience = mapped.resilience;
      layers.skills = mapped.skills;
      trustLabel = mapTrustLabel(node.trustLabel);
      if (params.policy.benchPolicy.includedMetrics.maturity.includeBy42Questions) {
        for (const question of node.questionScores) {
          maturityQuestions.push({
            qIdHash: `q_${hashId(question.questionId, params.policy.benchPolicy.privacy.hashTruncBytes)}`,
            score: Number(question.median.toFixed(6))
          });
        }
      }
    }
  }

  const risk = {
    ecosystemFocusRisk: latestSeriesValue(signals.points.indices.EcosystemFocusRisk) ?? UNMEASURED_RISK,
    clarityPathRisk: latestSeriesValue(signals.points.indices.ClarityPathRisk) ?? UNMEASURED_RISK,
    economicSignificanceRisk: latestSeriesValue(signals.points.indices.EconomicSignificanceRisk) ?? UNMEASURED_RISK,
    riskAssuranceRisk: latestSeriesValue(signals.points.indices.RiskAssuranceRisk) ?? UNMEASURED_RISK,
    digitalDualityRisk: latestSeriesValue(signals.points.indices.DigitalDualityRisk) ?? UNMEASURED_RISK
  };

  const seriesDims = {
    emotionalValue: latestSeriesValue(signals.points.value.EmotionalValue),
    functionalValue: latestSeriesValue(signals.points.value.FunctionalValue),
    economicValue: latestSeriesValue(signals.points.value.EconomicValue),
    brandValue: latestSeriesValue(signals.points.value.BrandValue),
    lifetimeValue: latestSeriesValue(signals.points.value.LifetimeValue)
  };
  // The score averages the measured dimensions only; with none measured it is not evaluated.
  const measuredDims = Object.values(seriesDims).filter((value): value is number => value !== null);
  let values: ValueDims = { ...seriesDims, valueScore: measuredDims.length > 0 ? mean6(measuredDims) : null };

  if (params.scopeType === "AGENT") {
    const agentId = resolveAgentId(params.workspace, params.scopeId);
    const latestOutcome = latestInWindow(listAgentOutcomeReports(params.workspace, agentId), window.startTs, window.endTs);
    if (latestOutcome) {
      values = valueDimensionsFromOutcome(latestOutcome);
    }
  }

  const pluginState = verifyPluginWorkspace({ workspace: params.workspace, readonly: readOnly });
  const operating = {
    // No run in the window measured the approval backlog: not evaluated, not an empty queue.
    approvalsBacklogCount: nullableMap(latestSeriesValue(signals.points.operating.approval_backlog_size), (value) => Math.max(0, Math.round(value))),
    approvalsMedianAgeHours: latestSeriesValue(signals.points.operating.approval_backlog_age_hours),
    budgetExceedEvents: countSelectedAudit({
      workspace: params.workspace,
      startTs: window.startTs,
      endTs: window.endTs,
      auditTypes: ["BUDGET_EXCEEDED", "LEASE_RATE_LIMITED"]
    }),
    // No run in the window measured a denial rate (no ToolHub actions): not measured, not a clean 0.
    toolhubDenialRate: latestSeriesValue(signals.points.operating.toolhub_denial_rate),
    freezeEvents: countSelectedAudit({
      workspace: params.workspace,
      startTs: window.startTs,
      endTs: window.endTs,
      auditTypes: ["FREEZE_APPLIED", "EXECUTE_FROZEN_ACTIVE"]
    }),
    // No assurance pack run in the window: not evaluated (null), never a 0 score or 0 failures.
    assurance: {
      latestScore: null as number | null,
      injectionFailures: null as number | null,
      exfilAttemptsDetected: null as number | null
    },
    plugins: {
      integrity: pluginState.ok ? "PASS" as const : "FAIL" as const,
      installedCount: pluginState.integrity.installedCount
    },
    notary: {
      enabled: false,
      downEvents: 0,
      attestationAgeMinutes: null as number | null
    }
  };

  if (params.scopeType === "AGENT") {
    const agentId = resolveAgentId(params.workspace, params.scopeId);
    const assurance = selectedAssurance({
      workspace: params.workspace,
      agentId,
      windowStartTs: window.startTs,
      windowEndTs: window.endTs
    });
    const packRows = [...assurance.values()];
    if (packRows.length > 0) {
      operating.assurance.latestScore = Number(
        (packRows.reduce((sum, row) => sum + row.score0to100, 0) / packRows.length).toFixed(6)
      );
      const injectionPack = assurance.get("injection");
      const exfilPack = assurance.get("exfiltration");
      operating.assurance.injectionFailures = injectionPack ? injectionPack.failCount : null;
      operating.assurance.exfilAttemptsDetected = exfilPack ? exfilPack.failCount : null;
    }
  }

  try {
    const trust = loadTrustConfig(params.workspace);
    operating.notary.enabled = trust.trust.mode === "NOTARY";
    // Collector remains deterministic and synchronous; detailed notary status
    // is surfaced in runtime APIs and health checks.
  } catch {
    // notary status remains defaults
  }

  const includedEventKinds = determineIncludedEventKinds(params.workspace, window.startTs, window.endTs);
  const sourceEventHashes = readTransparencyEntries(params.workspace)
    .filter((entry) => includedEventKinds.includes(entry.type))
    .map((entry) => entry.hash)
    .sort((a, b) => a.localeCompare(b));

  if (evidenceGateReasons.length > 0 && !params.policy.benchPolicy.integrityGates.allowExportWhenInsufficientEvidence) {
    throw new Error(`bench export blocked by evidence gates: ${evidenceGateReasons.join(", ")}`);
  }

  const forecastStatus = latestForecast?.status ?? (evidenceGateReasons.length > 0 ? "INSUFFICIENT_EVIDENCE" : "OK");
  const forecastReasons = latestForecast?.reasons ?? (evidenceGateReasons.length > 0 ? evidenceGateReasons : []);
  const maturityNow = latestSeriesValue(signals.points.maturityOverall);
  const maturityShort = latestForecast?.series.maturityOverall.forecast.short?.value ?? null;
  const riskNow = median(Object.values(risk));
  const riskShortValues = [
    latestForecast?.series.indices.EcosystemFocusRisk?.forecast.short?.value ?? null,
    latestForecast?.series.indices.ClarityPathRisk?.forecast.short?.value ?? null,
    latestForecast?.series.indices.EconomicSignificanceRisk?.forecast.short?.value ?? null,
    latestForecast?.series.indices.RiskAssuranceRisk?.forecast.short?.value ?? null,
    latestForecast?.series.indices.DigitalDualityRisk?.forecast.short?.value ?? null
  ].filter((value): value is number => typeof value === "number");
  const riskShort = riskShortValues.length > 0 ? median(riskShortValues) : null;
  const confidenceLabel =
    forecastStatus !== "OK"
      ? "NONE"
      : derivedTrustLabel({
            integrityIndex,
            correlationRatio,
            observedShare
          }) === "HIGH"
        ? "HIGH"
        : derivedTrustLabel({
              integrityIndex,
              correlationRatio,
              observedShare
            }) === "MEDIUM"
          ? "MEDIUM"
          : "LOW";

  const bench = benchArtifactSchema.parse({
    v: 1,
    benchId: `bench_${hashId(`${params.scopeType}:${params.scopeId}:${window.endTs}`)}`,
    generatedTs: window.endTs,
    scope: {
      type: params.scopeType,
      idHash: scopeIdHash
    },
    publisher: {
      mode: params.named ? "NAMED" : "ANONYMIZED",
      workspaceIdHash: workspaceHash,
      hostInstanceHash: null,
      attestation: {
        trustMode: "LOCAL_VAULT",
        attestationLevel: "NONE",
        notaryFingerprint: null,
        lastAttestationTs: null
      }
    },
    evidence: {
      window: {
        days: window.days,
        startTs: window.startTs,
        endTs: window.endTs
      },
      integrityIndex,
      correlationRatio,
      trustLabel: evidenceGateReasons.length > 0 ? "LOW" : trustLabel,
      evidenceCoverage
    },
    metrics: {
      maturity: {
        overall: maturityOverall,
        fiveLayers: {
          strategicOps: layers.strategicOps,
          leadership: layers.leadership,
          culture: layers.culture,
          resilience: layers.resilience,
          skills: layers.skills
        },
        fiveDimensions: {
          d1: layers.strategicOps,
          d2: layers.leadership,
          d3: layers.culture,
          d4: layers.resilience,
          d5: layers.skills
        },
        ...(params.policy.benchPolicy.includedMetrics.maturity.includeBy42Questions
          ? {
              questions42: maturityQuestions
                .slice()
                .sort((a, b) => a.qIdHash.localeCompare(b.qIdHash))
            }
          : {})
      },
      strategyFailureRisks: risk,
      valueDimensions: {
        emotionalValue: values.emotionalValue,
        functionalValue: values.functionalValue,
        economicValue: values.economicValue,
        brandValue: values.brandValue,
        lifetimeValue: values.lifetimeValue,
        valueScore: values.valueScore
      },
      operatingHealth: operating,
      forecastSummary: {
        status: forecastStatus,
        maturityDeltaShort: maturityShort === null || maturityNow === null ? null : Number((maturityShort - maturityNow).toFixed(6)),
        riskDeltaShort: riskShort === null ? null : Number((riskShort - riskNow).toFixed(6)),
        confidenceLabel,
        reasons: forecastReasons.map((reason) => reason.replace(/\s+/g, "_").slice(0, 64))
      }
    },
    proofBindings: {
      transparencyRootSha256: "0".repeat(64),
      merkleRootSha256: "0".repeat(64),
      includedEventKinds,
      includedEventProofIds: [],
      calculationManifestSha256: "0".repeat(64)
    },
    labels: params.labels ?? {}
  });

  const buildMeta: BenchBuildMeta = {
    v: 1,
    generatedTs: bench.generatedTs,
    modelVersion: "bench_collector_v1",
    scope: {
      type: bench.scope.type,
      idHash: bench.scope.idHash
    },
    sourceRefs: {
      runId: runRefs[runRefs.length - 1] ?? null,
      orgScorecardComputedTs: params.scopeType === "AGENT" ? null : loadVerifiedLatestOrgScorecard(params.workspace).scorecard?.computedAt ?? null,
      outcomeReportId: null,
      forecastGeneratedTs: latestForecast?.generatedTs ?? null
    }
  };

  return {
    bench,
    buildMeta,
    includedEventKinds,
    calculationManifest: buildCalculationManifest({
      scopeType: bench.scope.type,
      scopeIdHash: bench.scope.idHash,
      runRefs,
      sourceEventHashes,
      policySha256: hashId(JSON.stringify(params.policy), 32)
    }),
    evidenceGateReasons,
    runRefs
  };
}

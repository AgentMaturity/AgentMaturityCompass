import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { LayerName, OutcomeReport } from "../types.js";
import { parseWindowToMs } from "../utils/time.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { loadLatestOrgScorecard } from "../org/orgScorecard.js";
import { collectForecastSignals, captureForecastSignals, type ForecastSignalBundle } from "../forecast/forecastSignals.js";
import { loadLatestForecastArtifact } from "../forecast/forecastStore.js";
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

function listAgentRuns(workspace: string, agentId: string): Array<ReturnType<typeof loadRunReport>> {
  const dir = getAgentPaths(workspace, agentId).runsDir;
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(readUtf8(join(dir, name))) as ReturnType<typeof loadRunReport>;
      } catch {
        return null;
      }
    })
    .filter((row): row is ReturnType<typeof loadRunReport> => row !== null)
    .sort((a, b) => a.ts - b.ts);
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

function layerMapFromRun(run: ReturnType<typeof loadRunReport>): Record<"strategicOps" | "leadership" | "culture" | "resilience" | "skills", number> {
  const base = {
    strategicOps: 0,
    leadership: 0,
    culture: 0,
    resilience: 0,
    skills: 0
  };
  for (const layer of run.layerScores) {
    const key = LAYER_KEY_BY_NAME[layer.layerName as LayerName];
    if (!key) {
      continue;
    }
    base[key] = Number(layer.avgFinalLevel.toFixed(6));
  }
  return base;
}

function layerMapFromNode(node: NonNullable<ReturnType<typeof loadLatestOrgScorecard>>["nodes"][number]): Record<"strategicOps" | "leadership" | "culture" | "resilience" | "skills", number> {
  const base = {
    strategicOps: 0,
    leadership: 0,
    culture: 0,
    resilience: 0,
    skills: 0
  };
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

function derivedTrustLabel(params: {
  integrityIndex: number;
  correlationRatio: number;
  observedShare: number;
}): "LOW" | "MEDIUM" | "HIGH" {
  if (params.observedShare >= 0.7 && params.integrityIndex >= 0.9 && params.correlationRatio >= 0.9) {
    return "HIGH";
  }
  if (params.observedShare >= 0.5 && params.integrityIndex >= 0.75 && params.correlationRatio >= 0.75) {
    return "MEDIUM";
  }
  return "LOW";
}

function valueDimensionsFromOutcome(report: OutcomeReport | null): {
  emotionalValue: number;
  functionalValue: number;
  economicValue: number;
  brandValue: number;
  lifetimeValue: number;
  valueScore: number;
} {
  if (!report) {
    return {
      emotionalValue: 0,
      functionalValue: 0,
      economicValue: 0,
      brandValue: 0,
      lifetimeValue: 0,
      valueScore: 0
    };
  }
  return {
    emotionalValue: Number((report.categoryScores.Emotional ?? 0).toFixed(6)),
    functionalValue: Number((report.categoryScores.Functional ?? 0).toFixed(6)),
    economicValue: Number((report.categoryScores.Economic ?? 0).toFixed(6)),
    brandValue: Number((report.categoryScores.Brand ?? 0).toFixed(6)),
    lifetimeValue: Number((report.categoryScores.Lifetime ?? 0).toFixed(6)),
    valueScore: Number(report.valueScore.toFixed(6))
  };
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function countAuditEvents(params: {
  workspace: string;
  startTs: number;
  endTs: number;
  auditTypes: string[];
}): number {
  const ledger = openLedger(params.workspace);
  try {
    const events = ledger.getEventsBetween(params.startTs, params.endTs);
    const auditSet = new Set(params.auditTypes);
    return events
      .filter((event) => event.event_type === "audit")
      .filter((event) => {
        const meta = parseMeta(event.meta_json);
        const auditType = typeof meta.auditType === "string" ? meta.auditType : null;
        return Boolean(auditType && auditSet.has(auditType));
      })
      .length;
  } finally {
    ledger.close();
  }
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number((((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2).toFixed(6));
  }
  return Number((sorted[mid] ?? 0).toFixed(6));
}

function resolveWindow(windowDays: number): { startTs: number; endTs: number; days: number } {
  const ms = parseWindowToMs(`${windowDays}d`);
  const endTs = Date.now();
  return {
    startTs: endTs - ms,
    endTs,
    days: windowDays
  };
}

function latestSeriesValue(
  series:
    | Array<{ ts: number; value: number }>
    | undefined
): number {
  if (!series || series.length === 0) {
    return 0;
  }
  return Number((series[series.length - 1]?.value ?? 0).toFixed(6));
}

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
  const closed = () => {const ledger=openLedger(params.workspace);try{if(ledger.db.inTransaction)throw new Error("async bench collection cannot borrow an open SQL transaction");}finally{ledger.close();}};
  closed(); const window = resolveWindow(params.windowDays), identity = collectionIdentity(params);
  const signals = captureForecastSignals({workspace:params.workspace,scope:{type:params.scopeType,id:params.scopeId},lookbackDays:Math.max(90,params.windowDays)});
  const collected = collectBenchDataWithInputs(params,window,signals.signals,identity), selected = canonicalize(collected);
  return {collected,assertCurrent(){closed();signals.assertCurrent();if(canonicalize(collectBenchDataWithInputs(params,window,signals.signals,identity))!==selected)throw new Error("selected bench inputs changed while signing");}};
}
function collectionIdentity(params:BenchCollectionInput){return {scopeIdHash:hashId(params.scopeId,params.policy.benchPolicy.privacy.hashTruncBytes),workspaceHash:hashId(params.workspace,params.policy.benchPolicy.privacy.hashTruncBytes)};}
function collectBenchDataWithInputs(params: BenchCollectionInput, window: ReturnType<typeof resolveWindow>, signals: ForecastSignalBundle, identity:ReturnType<typeof collectionIdentity>): CollectedBenchData {
  const {scopeIdHash,workspaceHash} = identity;
  const scope = { type: params.scopeType, id: params.scopeId };
  const latestForecast = loadLatestForecastArtifact(params.workspace, scope);

  const evidenceGateReasons: string[] = [];
  const observedShare = Number((signals.evidence.observedShare ?? 0).toFixed(6));
  const attestedShare = Number((signals.evidence.attestedShare ?? 0).toFixed(6));
  const selfReportedShare = Number((signals.evidence.selfReportedShare ?? 0).toFixed(6));
  const integrityIndex = Number((signals.evidence.latestIntegrityIndex ?? 0).toFixed(6));
  const correlationRatio = Number((signals.evidence.latestCorrelationRatio ?? 0).toFixed(6));
  const observedRuns = signals.evidence.observedRuns ?? 0;
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
  const layers = {
    strategicOps: 0,
    leadership: 0,
    culture: 0,
    resilience: 0,
    skills: 0
  };
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
    const scorecard = loadLatestOrgScorecard(params.workspace);
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
    ecosystemFocusRisk: latestSeriesValue(signals.points.indices.EcosystemFocusRisk),
    clarityPathRisk: latestSeriesValue(signals.points.indices.ClarityPathRisk),
    economicSignificanceRisk: latestSeriesValue(signals.points.indices.EconomicSignificanceRisk),
    riskAssuranceRisk: latestSeriesValue(signals.points.indices.RiskAssuranceRisk),
    digitalDualityRisk: latestSeriesValue(signals.points.indices.DigitalDualityRisk)
  };

  let values = {
    emotionalValue: latestSeriesValue(signals.points.value.EmotionalValue),
    functionalValue: latestSeriesValue(signals.points.value.FunctionalValue),
    economicValue: latestSeriesValue(signals.points.value.EconomicValue),
    brandValue: latestSeriesValue(signals.points.value.BrandValue),
    lifetimeValue: latestSeriesValue(signals.points.value.LifetimeValue),
    valueScore: 0
  };
  values.valueScore = Number(
    (
      (values.emotionalValue + values.functionalValue + values.economicValue + values.brandValue + values.lifetimeValue) /
      5
    ).toFixed(6)
  );

  if (params.scopeType === "AGENT") {
    const agentId = resolveAgentId(params.workspace, params.scopeId);
    const latestOutcome = latestInWindow(listAgentOutcomeReports(params.workspace, agentId), window.startTs, window.endTs);
    if (latestOutcome) {
      values = valueDimensionsFromOutcome(latestOutcome);
    }
  }

  const pluginState = verifyPluginWorkspace({ workspace: params.workspace });
  const operating = {
    approvalsBacklogCount: Math.max(0, Math.round(latestSeriesValue(signals.points.operating.approval_backlog_size))),
    approvalsMedianAgeHours: Number(latestSeriesValue(signals.points.operating.approval_backlog_age_hours).toFixed(6)),
    budgetExceedEvents: countAuditEvents({
      workspace: params.workspace,
      startTs: window.startTs,
      endTs: window.endTs,
      auditTypes: ["BUDGET_EXCEEDED", "LEASE_RATE_LIMITED"]
    }),
    toolhubDenialRate: Number(latestSeriesValue(signals.points.operating.toolhub_denial_rate).toFixed(6)),
    freezeEvents: countAuditEvents({
      workspace: params.workspace,
      startTs: window.startTs,
      endTs: window.endTs,
      auditTypes: ["FREEZE_APPLIED", "EXECUTE_FROZEN_ACTIVE"]
    }),
    assurance: {
      latestScore: 0,
      injectionFailures: 0,
      exfilAttemptsDetected: 0
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
    const assurance = latestAssuranceByPack({
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
      operating.assurance.injectionFailures = injectionPack ? injectionPack.failCount : 0;
      operating.assurance.exfilAttemptsDetected = exfilPack ? exfilPack.failCount : 0;
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
      evidenceCoverage: {
        observedShare,
        attestedShare,
        selfReportedShare
      }
    },
    metrics: {
      maturity: {
        overall: Number(maturityOverall.toFixed(6)),
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
        maturityDeltaShort: maturityShort === null ? null : Number((maturityShort - maturityNow).toFixed(6)),
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
      orgScorecardComputedTs: params.scopeType === "AGENT" ? null : loadLatestOrgScorecard(params.workspace)?.computedAt ?? null,
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

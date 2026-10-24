import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { join } from "node:path";
import { captureOrgPairsAuthority, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { canonicalize } from "../utils/json.js";
import { valuePolicySchema } from "./valuePolicySchema.js";
import { valueContractSchema } from "./valueContracts.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { sha256Hex } from "../utils/hash.js";
import { loadTrustConfig, checkNotaryTrust } from "../trust/trustConfig.js";
import { latestAssuranceRun } from "../assurance/assuranceStore.js";
import { collectForecastSignals } from "../forecast/forecastSignals.js";
import { evaluateValueEvidenceGates } from "./valueEvidenceGates.js";
import { attributeValue } from "./valueAttribution.js";
import { collectObservedValueEvents } from "./valueCollector.js";
import { scoreValueDimensions } from "./valueScoring.js";
import { computeEconomicSignificance, detectValueRegression } from "./valueRisk.js";
import {
  appendValueEvents,
  listValueReports,
  loadValuePolicyAttemptAsync, valueEventsDir, valuePolicyPath, valueWorkspaceContractPath, valueAgentContractPath, valueSnapshotLatestPath,
  readValueEvents,
  prepareValueSnapshotAsync, prepareValueReportAsync
} from "./valueStore.js";
import { valueReportSchema, valueSnapshotSchema, type ValueReport, type ValueSnapshot } from "./valueSchema.js";

function scopeIdHash(scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): string {
  return sha256Hex(`${scope.type}:${scope.id}`).slice(0, 16);
}

function summaryTrust(events: Array<{ source: { trustKind: "OBSERVED" | "ATTESTED" | "SELF_REPORTED" } }>): {
  observed: number;
  attested: number;
  selfReported: number;
} {
  if (events.length === 0) {
    return { observed: 0, attested: 0, selfReported: 0 };
  }
  const observed = events.filter((event) => event.source.trustKind === "OBSERVED").length;
  const attested = events.filter((event) => event.source.trustKind === "ATTESTED").length;
  const self = events.filter((event) => event.source.trustKind === "SELF_REPORTED").length;
  return {
    observed: Number((observed / events.length).toFixed(6)),
    attested: Number((attested / events.length).toFixed(6)),
    selfReported: Number((self / events.length).toFixed(6))
  };
}

function nowWindow(days: number, nowTs: number): {
  startTs: number;
  endTs: number;
} {
  const duration = Math.max(1, days) * 24 * 60 * 60 * 1000;
  return {
    startTs: nowTs - duration,
    endTs: nowTs
  };
}

function previousWindow(days: number, nowTs: number): {
  startTs: number;
  endTs: number;
} {
  const duration = Math.max(1, days) * 24 * 60 * 60 * 1000;
  return {
    startTs: nowTs - duration * 2,
    endTs: nowTs - duration
  };
}

function nullifySnapshotNumbers(snapshot: ValueSnapshot): ValueSnapshot {
  return valueSnapshotSchema.parse({
    ...snapshot,
    kpis: snapshot.kpis.map((kpi) => ({
      ...kpi,
      normalizedScore: null,
      delta: null
    })),
    valueDimensions: {
      emotional: null,
      functional: null,
      economic: null,
      brand: null,
      lifetime: null,
      valueScore: null
    },
    economicSignificance: {
      score: null,
      risk: snapshot.economicSignificance.risk,
      reasons: snapshot.economicSignificance.reasons
    }
  });
}

async function createValueSnapshotRun(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  windowDays?: number;
  nowTs?: number;
}, options: OrgPairsOptions = {}) {
  options = { ...options }; params = { ...params }; const initial = captureOrgPairsAuthority(params.workspace, options.beforePublish);
  const policyAttempt = await loadValuePolicyAttemptAsync(params.workspace, { beforePublish: initial }), beforePublish = policyAttempt.assertCurrent; beforePublish();
  const nowTs = params.nowTs ?? Date.now();
  const scope = {
    type: params.scopeType,
    id: params.scopeType === "WORKSPACE" ? "workspace" : params.scopeId
  } as const;

  const policyPath = valuePolicyPath(params.workspace), contractPath = scope.type === "AGENT" ? valueAgentContractPath(params.workspace, scope.id) : valueWorkspaceContractPath(params.workspace);
  const sourcePairs = captureOrgPairs([policyPath, contractPath]);
  const policyBytes = orgPairBytes(sourcePairs, policyPath), contractBytes = orgPairBytes(sourcePairs, contractPath);
  if (policyBytes === null || contractBytes === null) throw new Error("value policy or contract missing");
  const policy = valuePolicySchema.parse(YAML.parse(policyBytes.toString("utf8"))), contract = valueContractSchema.parse(YAML.parse(contractBytes.toString("utf8")));
  const policySignature = orgPairBytes(sourcePairs, `${policyPath}.sig`);
  if (policy.valuePolicy.enforceSignedInputs && (policySignature === null || !verifyAuditorSignatureBytes(params.workspace, "BUNDLE", policyBytes, policySignature).valid))
    throw new Error("VALUE_POLICY_UNTRUSTED:invalid captured policy signature");
  const snapshotPrevious = captureOrgPairs([valueSnapshotLatestPath(params.workspace, scope)]);

  const windowDays = Math.max(1, params.windowDays ?? contract.valueContract.baselines.baselineWindowDays);
  const currentWindow = nowWindow(windowDays, nowTs);
  const baselineWindow = previousWindow(windowDays, nowTs);

  const observed = collectObservedValueEvents({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id,
    contract,
    startTs: currentWindow.startTs,
    endTs: currentWindow.endTs
  });
  const observedPaths: string[] = [];
  if (observed.length > 0) {
    beforePublish?.();
    appendValueEvents(params.workspace, observed);
    for (const month of [...new Set(observed.map(event => new Date(event.ts).toISOString().slice(0, 7)))].sort()) {
      const path = join(valueEventsDir(params.workspace), month, "events.ndjson"); observedPaths.push(path, `${path}.sha256`);
    }
  }
  try {
  const idHash = scopeIdHash(scope);
  const currentEvents = readValueEvents({
    workspace: params.workspace,
    scope,
    startTs: currentWindow.startTs,
    endTs: currentWindow.endTs,
    idHash
  });
  const baselineEvents = readValueEvents({
    workspace: params.workspace,
    scope,
    startTs: baselineWindow.startTs,
    endTs: baselineWindow.endTs,
    idHash
  });

  const scoring = scoreValueDimensions({
    contract,
    policy,
    currentEvents,
    baselineEvents
  });

  const trustSummary = summaryTrust(currentEvents);
  const forecastSignals = collectForecastSignals({
    workspace: params.workspace,
    scope,
    lookbackDays: Math.max(30, windowDays)
  });
  const trustPolicy = canonicalize(loadTrustConfig(params.workspace));
  const trustMode = loadTrustConfig(params.workspace).trust.mode;
  const assurance = latestAssuranceRun(params.workspace);
  const notaryRequired = trustMode === "NOTARY";
  beforePublish();
  const notaryState = notaryRequired ? await checkNotaryTrust(params.workspace).catch(() => ({ ok: false })) : { ok: true };
  beforePublish();
  const gates = evaluateValueEvidenceGates(policy, {
    integrityIndex: forecastSignals.evidence.latestIntegrityIndex,
    correlationRatio: forecastSignals.evidence.latestCorrelationRatio,
    observedShare: trustSummary.observed,
    selfReportedShare: trustSummary.selfReported,
    notaryRequired,
    notaryHealthy: notaryState.ok
  });

  const costKpi = scoring.kpis.find((row) => row.kpiId === "cost_usd") ?? null;
  const economic = computeEconomicSignificance({
    policy,
    valueScore: scoring.dimensions.valueScore,
    economicValue: scoring.dimensions.economic,
    costScore: costKpi?.normalizedScore ?? null,
    assuranceScore: assurance?.score.riskAssuranceScore ?? null,
    insufficientEvidence: !gates.ok,
    valueRegressing: false,
    costRising: typeof costKpi?.delta === "number" && costKpi.delta > 0,
    noValueEventsLast30d: currentEvents.length === 0
  });

  const attributionEntries = contract.valueContract.kpis.map((kpi) =>
    attributeValue({
      contract,
      kpiId: kpi.kpiId,
      events: currentEvents,
      startTs: currentWindow.startTs,
      endTs: currentWindow.endTs
    })
  );

  const snapshotBase = valueSnapshotSchema.parse({
    v: 1,
    generatedTs: nowTs,
    scope,
    status: gates.ok ? "OK" : "INSUFFICIENT_EVIDENCE",
    reasons: gates.ok ? [] : gates.reasons,
    gates: {
      integrityIndex: Number(forecastSignals.evidence.latestIntegrityIndex.toFixed(6)),
      correlationRatio: Number(forecastSignals.evidence.latestCorrelationRatio.toFixed(6)),
      observedShare: trustSummary.observed,
      selfReportedShare: trustSummary.selfReported
    },
    baselines: {
      windowDays,
      startTs: currentWindow.startTs,
      endTs: currentWindow.endTs
    },
    kpis: scoring.kpis,
    valueDimensions: {
      emotional: scoring.dimensions.emotional,
      functional: scoring.dimensions.functional,
      economic: scoring.dimensions.economic,
      brand: scoring.dimensions.brand,
      lifetime: scoring.dimensions.lifetime,
      valueScore: scoring.dimensions.valueScore
    },
    economicSignificance: economic,
    attributionSummary: {
      status: attributionEntries.some((row) => row.status === "OK") ? "OK" : "INSUFFICIENT_EVIDENCE",
      method: contract.valueContract.constraints.attributionMethod,
      entries: attributionEntries.map((row) => ({
        kpiId: row.kpiId,
        attributedTo: row.attributedTo
      }))
    },
    notes: scoring.notes
  });

  const previousBytes = orgPairBytes(snapshotPrevious, valueSnapshotLatestPath(params.workspace, scope));
  const previousSnapshot = previousBytes === null ? null : valueSnapshotSchema.parse(JSON.parse(previousBytes.toString("utf8")));
  const regression = detectValueRegression({
    previousValueScore: previousSnapshot?.valueDimensions.valueScore ?? null,
    nextValueScore: snapshotBase.valueDimensions.valueScore,
    previousEconomicValue: previousSnapshot?.valueDimensions.economic ?? null,
    nextEconomicValue: snapshotBase.valueDimensions.economic,
    previousCost: previousSnapshot?.kpis.find((row) => row.kpiId === "cost_usd")?.currentValue ?? null,
    nextCost: snapshotBase.kpis.find((row) => row.kpiId === "cost_usd")?.currentValue ?? null
  });

  const finalized = gates.ok ? snapshotBase : nullifySnapshotNumbers(snapshotBase);
  const selected = canonicalize({ currentEvents, baselineEvents, integrityIndex: forecastSignals.evidence.latestIntegrityIndex,
    correlationRatio: forecastSignals.evidence.latestCorrelationRatio, assuranceScore: assurance?.score.riskAssuranceScore ?? null });
  const assertInputsCurrent = () => {
    options.assertInputsCurrent?.(); assertOrgPairsCurrent(sourcePairs);
    if (canonicalize(loadTrustConfig(params.workspace)) !== trustPolicy) throw new Error("value trust inputs changed while signing");
    const signals = collectForecastSignals({ workspace: params.workspace, scope, lookbackDays: Math.max(30, windowDays) });
    const current = canonicalize({ currentEvents: readValueEvents({ workspace: params.workspace, scope, startTs: currentWindow.startTs, endTs: currentWindow.endTs, idHash }),
      baselineEvents: readValueEvents({ workspace: params.workspace, scope, startTs: baselineWindow.startTs, endTs: baselineWindow.endTs, idHash }),
      integrityIndex: signals.evidence.latestIntegrityIndex, correlationRatio: signals.evidence.latestCorrelationRatio,
      assuranceScore: latestAssuranceRun(params.workspace)?.score.riskAssuranceScore ?? null });
    if (current !== selected) throw new Error("selected value calculation inputs changed while signing");
  };
  const prepared = await prepareValueSnapshotAsync(params.workspace, finalized, { beforePublish, assertInputsCurrent }, snapshotPrevious);
  const saved = prepared.publish(), transparencyHashes: string[] = [];
  try {
  prepared.assertCurrent(); const created = await appendTransparencyEntryAsync({
    workspace: params.workspace,
    type: "VALUE_SNAPSHOT_CREATED",
    agentId: scope.type === "AGENT" ? scope.id : "workspace",
    artifact: {
      kind: "policy",
      sha256: saved.sha256,
      id: `${scope.type}:${scope.id}`
    }
  }, { beforeCommit: prepared.assertCurrent }); transparencyHashes.push(created.hash);

  if (!gates.ok) {
    prepared.assertCurrent(); const insufficientEntry = await appendTransparencyEntryAsync({
      workspace: params.workspace,
      type: "VALUE_EVIDENCE_INSUFFICIENT",
      agentId: scope.type === "AGENT" ? scope.id : "workspace",
      artifact: {
        kind: "policy",
        sha256: saved.sha256,
        id: `${scope.type}:${scope.id}`
      }
    }, { beforeCommit: prepared.assertCurrent }); transparencyHashes.push(insufficientEntry.hash);
    void dispatchIntegrationEvent({
      workspace: params.workspace,
      eventName: "VALUE_EVIDENCE_INSUFFICIENT",
      agentId: scope.type === "AGENT" ? scope.id : "workspace",
      summary: "Value strong-claim evidence gates failed",
      details: {
        scope,
        reasons: gates.reasons
      }
    }).catch(() => undefined);
  }

  if (regression.regressed) {
    prepared.assertCurrent(); const regressionEntry = await appendTransparencyEntryAsync({
      workspace: params.workspace,
      type: "VALUE_REGRESSION_DETECTED",
      agentId: scope.type === "AGENT" ? scope.id : "workspace",
      artifact: {
        kind: "policy",
        sha256: saved.sha256,
        id: `${scope.type}:${scope.id}`
      }
    }, { beforeCommit: prepared.assertCurrent }); transparencyHashes.push(regressionEntry.hash);
    void dispatchIntegrationEvent({
      workspace: params.workspace,
      eventName: "VALUE_REGRESSION_DETECTED",
      agentId: scope.type === "AGENT" ? scope.id : "workspace",
      summary: "Value regression detected",
      details: {
        scope,
        reasons: regression.reasons,
        previousValueScore: previousSnapshot?.valueDimensions.valueScore ?? null,
        currentValueScore: finalized.valueDimensions.valueScore
      }
    }).catch(() => undefined);
  }

  return { result: { snapshot: finalized, saved, transparencyHash: created.hash, regressionDetected: regression.regressed }, assertCurrent: prepared.assertCurrent };
  } catch (error) { throw new ValueOutputsPartialError([saved.path, saved.sigPath], "snapshot-transparency", error, transparencyHashes); }
  } catch (error) {
    if (observedPaths.length === 0) throw error;
    throw new ValueOutputsPartialError([...observedPaths, ...(error instanceof ValueOutputsPartialError ? error.publishedPaths : [])],
      error instanceof ValueOutputsPartialError ? error.phase : "snapshot-after-value-events", error,
      error instanceof ValueOutputsPartialError ? error.transparencyHashes : []);
  }
}

export async function createValueReportRun(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  windowDays?: number;
  nowTs?: number;
}, options: OrgPairsOptions = {}) {
  options = { ...options }; params = { ...params };
  const original = captureOrgPairsAuthority(params.workspace, options.beforePublish); options = { ...options, beforePublish: original };
  const nowTs = params.nowTs ?? Date.now();
  const snapshotAttempt = await createValueSnapshotRun(params, options), snapshotRun = snapshotAttempt.result;
  try {
  const scope = {
    type: params.scopeType,
    id: params.scopeType === "WORKSPACE" ? "workspace" : params.scopeId
  } as const;
  const reports = listValueReports(params.workspace, scope);
  const history = reports
    .slice(-29)
    .map((row) => ({
      ts: row.generatedTs,
      value: row.snapshot.valueDimensions.valueScore
    }))
    .filter((row): row is { ts: number; value: number } => typeof row.value === "number");

  const report = valueReportSchema.parse({
    v: 1,
    reportId: `vr_${randomUUID().replace(/-/g, "")}`,
    generatedTs: nowTs,
    windowDays: params.windowDays ?? snapshotRun.snapshot.baselines.windowDays,
    scope,
    snapshot: snapshotRun.snapshot,
    series: {
      valueScore: [...history, ...(typeof snapshotRun.snapshot.valueDimensions.valueScore === "number" ? [{ ts: nowTs, value: snapshotRun.snapshot.valueDimensions.valueScore }] : [])],
      economic: [
        ...reports
          .slice(-29)
          .map((row) => ({ ts: row.generatedTs, value: row.snapshot.valueDimensions.economic }))
          .filter((row): row is { ts: number; value: number } => typeof row.value === "number"),
        ...(typeof snapshotRun.snapshot.valueDimensions.economic === "number" ? [{ ts: nowTs, value: snapshotRun.snapshot.valueDimensions.economic }] : [])
      ],
      risk: [
        ...reports
          .slice(-29)
          .map((row) => ({ ts: row.generatedTs, value: row.snapshot.economicSignificance.risk }))
          .filter((row): row is { ts: number; value: number } => typeof row.value === "number"),
        ...(typeof snapshotRun.snapshot.economicSignificance.risk === "number" ? [{ ts: nowTs, value: snapshotRun.snapshot.economicSignificance.risk }] : [])
      ]
    }
  });

  const historyInput = canonicalize(reports.slice(-29));
  const prepared = await prepareValueReportAsync(params.workspace, report, {
    beforePublish: () => { options.beforePublish?.(); snapshotAttempt.assertCurrent(); },
    assertInputsCurrent: () => { options.assertInputsCurrent?.(); if (canonicalize(listValueReports(params.workspace, scope).slice(-29)) !== historyInput) throw new Error("selected value report history changed while signing"); }
  });
  const saved = prepared.publish();
  try {
  prepared.assertCurrent(); const entry = await appendTransparencyEntryAsync({
    workspace: params.workspace,
    type: "VALUE_REPORT_CREATED",
    agentId: scope.type === "AGENT" ? scope.id : "workspace",
    artifact: {
      kind: "policy",
      sha256: saved.sha256,
      id: report.reportId
    }
  }, { beforeCommit: prepared.assertCurrent });
  return { result: { report, saved, snapshot: snapshotRun.snapshot, transparencyHash: entry.hash }, assertCurrent: prepared.assertCurrent };
  } catch (error) { throw new ValueOutputsPartialError([snapshotRun.saved.path, snapshotRun.saved.sigPath, saved.path, saved.sigPath], "report-transparency", error, [snapshotRun.transparencyHash]); }
  } catch (error) { if (error instanceof ValueOutputsPartialError) throw error;
    throw new ValueOutputsPartialError([snapshotRun.saved.path, snapshotRun.saved.sigPath], "report-after-snapshot", error, [snapshotRun.transparencyHash]); }
}

export class ValueOutputsPartialError extends Error {
  readonly code = "VALUE_OUTPUTS_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly phase: string, cause: unknown, readonly transparencyHashes: readonly string[] = []) {
    super("value publication has committed earlier outputs; inspect state before retrying", { cause }); this.name = "ValueOutputsPartialError";
  }
}
export async function createValueSnapshot(params: Parameters<typeof createValueSnapshotRun>[0], options: OrgPairsOptions = {}) {
  return (await createValueSnapshotRun(params, options)).result;
}
export async function createValueReport(params: Parameters<typeof createValueReportRun>[0], options: OrgPairsOptions = {}) {
  return (await createValueReportRun(params, options)).result;
}

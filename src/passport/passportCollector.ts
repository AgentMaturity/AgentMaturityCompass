import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { DiagnosticReport, LayerScore } from "../types.js";
import { readUtf8, pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonPath } from "../canon/canonLoader.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { cgxLatestGraphPath, cgxLatestPackPath } from "../cgx/cgxStore.js";
import { promptLatestPackPath, loadPromptPolicy } from "../prompt/promptPolicyStore.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { latestAssuranceCertificateSummary } from "../assurance/assuranceStore.js";
import { loadLatestForecastArtifact } from "../forecast/forecastStore.js";
import { listExportedBenchArtifacts } from "../bench/benchArtifact.js";
import { loadBinderCache } from "../audit/binderStore.js";
import { loadValueSnapshot } from "../value/valueStore.js";
import { loadBridgeConfig, verifyBridgeConfigSignature } from "../bridge/bridgeConfigStore.js";
import { loadToolsConfig, verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyLeaseRevocationsSignature } from "../leases/leaseStore.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { hashPassportId } from "./passportRedaction.js";
import type { PassportPolicy } from "./passportPolicySchema.js";
import { passportJsonSchema, type PassportJson } from "./passportSchema.js";

function fileSha(path: string): string {
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readUtf8(path));
}

function normalizedScope(scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId?: string | null): {
  type: "WORKSPACE" | "NODE" | "AGENT";
  id: string;
  agentIdForDiagnostic: string;
} {
  if (scopeType === "AGENT") {
    const id = (scopeId ?? "").trim() || "default";
    return {
      type: "AGENT",
      id,
      agentIdForDiagnostic: id
    };
  }
  if (scopeType === "NODE") {
    const id = (scopeId ?? "").trim() || "default";
    return {
      type: "NODE",
      id,
      agentIdForDiagnostic: "default"
    };
  }
  return {
    type: "WORKSPACE",
    id: "workspace",
    agentIdForDiagnostic: "default"
  };
}

function readLatestDiagnosticRun(workspace: string, agentId: string): DiagnosticReport | null {
  const dir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(dir)) {
    return null;
  }
  let best: DiagnosticReport | null = null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    try {
      const parsed = JSON.parse(readUtf8(join(dir, entry.name))) as DiagnosticReport;
      if (!best || parsed.ts > best.ts) {
        best = parsed;
      }
    } catch {
      // ignore broken run files
    }
  }
  return best;
}

function mapTrustLabel(input: string | undefined): "LOW" | "MEDIUM" | "HIGH" {
  const text = (input ?? "").toLowerCase();
  if (text.includes("high")) return "HIGH";
  if (text.includes("med")) return "MEDIUM";
  return "LOW";
}

function readLayerValue(layers: LayerScore[] | undefined, key: "strategicOps" | "leadership" | "culture" | "resilience" | "skills"): number | null {
  if (!layers || layers.length === 0) {
    return null;
  }
  const matcher =
    key === "strategicOps"
      ? /strategic/i
      : key === "leadership"
        ? /leadership/i
        : key === "culture"
          ? /culture/i
          : key === "resilience"
            ? /resilience/i
            : /skills?/i;
  const found = layers.find((row) => matcher.test(row.layerName));
  return typeof found?.avgFinalLevel === "number" ? Number(found.avgFinalLevel.toFixed(4)) : null;
}

function avg(values: Array<number | null>): number | null {
  const filtered = values.filter((row): row is number => typeof row === "number" && Number.isFinite(row));
  if (filtered.length === 0) {
    return null;
  }
  const total = filtered.reduce((sum, row) => sum + row, 0);
  return Number((total / filtered.length).toFixed(4));
}

function latestForecastRisk(
  workspace: string,
  scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }
): {
  ecosystemFocusRisk: number | null;
  clarityPathRisk: number | null;
  economicSignificanceRisk: number | null;
  riskAssuranceRisk: number | null;
  digitalDualityRisk: number | null;
  evidenceCoverage: { observedShare: number; attestedShare: number; selfReportedShare: number } | null;
} {
  const forecast = loadLatestForecastArtifact(workspace, scope);
  if (!forecast) {
    return {
      ecosystemFocusRisk: null,
      clarityPathRisk: null,
      economicSignificanceRisk: null,
      riskAssuranceRisk: null,
      digitalDualityRisk: null,
      evidenceCoverage: null
    };
  }
  const fromSeries = (id: keyof typeof forecast.series.indices): number | null => {
    const series = forecast.series.indices[id];
    if (!series || series.points.length === 0) {
      return null;
    }
    const last = [...series.points].sort((a, b) => a.ts - b.ts).slice(-1)[0];
    return Number(last?.value ?? null);
  };
  return {
    ecosystemFocusRisk: fromSeries("EcosystemFocusRisk"),
    clarityPathRisk: fromSeries("ClarityPathRisk"),
    economicSignificanceRisk: fromSeries("EconomicSignificanceRisk"),
    riskAssuranceRisk: fromSeries("RiskAssuranceRisk"),
    digitalDualityRisk: fromSeries("DigitalDualityRisk"),
    evidenceCoverage: {
      observedShare: forecast.evidenceCoverage.observedShare,
      attestedShare: forecast.evidenceCoverage.attestedShare,
      selfReportedShare: forecast.evidenceCoverage.selfReportedShare
    }
  };
}

function trustRank(label: "LOW" | "MEDIUM" | "HIGH"): number {
  if (label === "HIGH") return 3;
  if (label === "MEDIUM") return 2;
  return 1;
}

export function collectPassportData(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string | null;
  policy: PassportPolicy;
}): {
  passport: PassportJson;
  includedEventKinds: string[];
  calculationManifest: Record<string, unknown>;
  sourceHashes: {
    policySha256: string;
    canonSha256: string;
    bankSha256: string;
    cgxPackSha256: string;
    promptPackSha256: string | null;
    assuranceCertSha256: string | null;
    benchSha256: string | null;
    auditBinderSha256: string | null;
    valueSnapshotSha256: string | null;
    mechanicTargetsSha256: string | null;
  };
} {
  const scope = normalizedScope(params.scopeType, params.scopeId);
  const truncBytes = params.policy.passportPolicy.privacy.hashTruncBytes;
  const scopeIdHash = hashPassportId(`${scope.type}:${scope.id}`, truncBytes);

  const report = readLatestDiagnosticRun(params.workspace, scope.agentIdForDiagnostic);
  const trustLabel = mapTrustLabel(report?.trustLabel);
  const integrityIndex = Number((report?.integrityIndex ?? 0).toFixed(4));
  const correlationRatio = Number((report?.correlationRatio ?? 0).toFixed(4));

  const reportCoverage = report?.evidenceTrustCoverage
    ? {
        observedShare: Number((report.evidenceTrustCoverage.observed ?? 0).toFixed(4)),
        attestedShare: Number((report.evidenceTrustCoverage.attested ?? 0).toFixed(4)),
        selfReportedShare: Number((report.evidenceTrustCoverage.selfReported ?? 0).toFixed(4))
      }
    : null;

  const forecastRisk = latestForecastRisk(params.workspace, {
    type: scope.type,
    id: scope.id
  });
  const evidenceCoverage = reportCoverage ?? forecastRisk.evidenceCoverage ?? {
    observedShare: 0,
    attestedShare: 0,
    selfReportedShare: 1
  };

  const layers = {
    strategicOps: readLayerValue(report?.layerScores, "strategicOps"),
    leadership: readLayerValue(report?.layerScores, "leadership"),
    culture: readLayerValue(report?.layerScores, "culture"),
    resilience: readLayerValue(report?.layerScores, "resilience"),
    skills: readLayerValue(report?.layerScores, "skills")
  };
  const overall = avg([layers.strategicOps, layers.leadership, layers.culture, layers.resilience, layers.skills]);
  const unknownQuestionsCount = report
    ? report.questionScores.filter((row) => !Array.isArray(row.evidenceEventIds) || row.evidenceEventIds.length === 0).length
    : questionBank.length;

  const valueSnapshot = loadValueSnapshot(params.workspace, {
    type: scope.type,
    id: scope.id
  }) ?? loadValueSnapshot(params.workspace, { type: "WORKSPACE", id: "workspace" });
  const valueDimensions = valueSnapshot?.valueDimensions ?? {
    emotional: null,
    functional: null,
    economic: null,
    brand: null,
    lifetime: null,
    valueScore: null
  };

  const trustConfig = loadTrustConfig(params.workspace);
  const notaryEnabled = trustConfig.trust.mode === "NOTARY";

  const cgxPackSha256 = scope.type === "AGENT"
    ? fileSha(cgxLatestPackPath(params.workspace, scope.id))
    : fileSha(
      cgxLatestGraphPath(params.workspace, {
        type: "workspace",
        id: "workspace"
      })
    );
  const promptPackSha256 = fileSha(promptLatestPackPath(params.workspace, scope.agentIdForDiagnostic));
  const promptPackPresent = promptPackSha256 !== "0".repeat(64);

  const assurance = latestAssuranceCertificateSummary(params.workspace);
  const bench = listExportedBenchArtifacts(params.workspace)[0] ?? null;
  const auditCache = loadBinderCache({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id
  }) ?? loadBinderCache({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    scopeId: "workspace"
  });
  const auditCacheSha = auditCache ? sha256Hex(Buffer.from(canonicalize(auditCache), "utf8")) : null;
  const valueSnapshotSha = valueSnapshot ? sha256Hex(Buffer.from(canonicalize(valueSnapshot), "utf8")) : null;

  const promptPolicy = (() => {
    try {
      return loadPromptPolicy(params.workspace);
    } catch {
      return null;
    }
  })();

  const providerSummary = (() => {
    try {
      const verify = verifyBridgeConfigSignature(params.workspace);
      if (!verify.valid) {
        return { provider: "FAIL", model: "FAIL" } as const;
      }
      const cfg = loadBridgeConfig(params.workspace);
      const providers = Object.values(cfg.bridge.providers);
      const enabled = providers.filter((row) => row.enabled);
      const provider = enabled.length > 0 ? "PASS" : "FAIL";
      const model = enabled.every((row) => row.modelAllowlist.length > 0) ? "PASS" : "FAIL";
      return { provider, model } as const;
    } catch {
      return { provider: "UNKNOWN", model: "UNKNOWN" } as const;
    }
  })();

  const toolSummary = (() => {
    try {
      const verify = verifyToolsConfigSignature(params.workspace);
      if (!verify.valid) {
        return "FAIL" as const;
      }
      const cfg = loadToolsConfig(params.workspace);
      return cfg.tools.allowedTools.length > 0 ? "PASS" as const : "FAIL" as const;
    } catch {
      return "UNKNOWN" as const;
    }
  })();

  const approvalsSummary = verifyApprovalPolicySignature(params.workspace).valid ? "PASS" : "FAIL";
  const leasesSummary = verifyLeaseRevocationsSignature(params.workspace).valid ? "PASS" : "FAIL";
  const pluginSummary = verifyPluginWorkspace({ workspace: params.workspace }).ok ? "PASS" : "FAIL";

  const reasons = new Set<string>();
  const gates = params.policy.passportPolicy.integrityGates;
  const trustGateMet = trustRank(trustLabel) >= trustRank(gates.requireTrustLabelForVerified);
  if (integrityIndex < gates.minIntegrityIndexForVerified) reasons.add("GATE_FAIL_LOW_INTEGRITY");
  if (correlationRatio < gates.minCorrelationRatioForVerified) reasons.add("GATE_FAIL_LOW_CORRELATION");
  if (!trustGateMet) reasons.add("GATE_FAIL_LOW_TRUST_LABEL");
  if (gates.requireAssuranceCertPassForVerified && assurance?.cert.status !== "PASS") reasons.add("MISSING_ASSURANCE_CERT_PASS");
  if (gates.requireNotaryWhenEnabled && notaryEnabled && !trustConfig.trust.notary.pinnedPubkeyFingerprint) reasons.add("NOTARY_FINGERPRINT_MISSING");
  if (cgxPackSha256 === "0".repeat(64)) reasons.add("MISSING_CGX_PACK");
  if (!promptPolicy || promptPolicy.promptPolicy.enforcement.mode !== "ENFORCE") reasons.add("PROMPT_ENFORCEMENT_OFF");

  const includedEventKinds = [
    "DIAGNOSTIC_COMPLETED",
    "CGX_PACK_UPDATED",
    ...(promptPackPresent ? ["PROMPT_PACK_CREATED", "PROMPT_PACK_ENFORCED"] : []),
    ...(assurance ? ["ASSURANCE_CERT_ISSUED"] : []),
    ...(bench ? ["BENCH_CREATED"] : []),
    ...(auditCacheSha ? ["AUDIT_BINDER_CREATED"] : []),
    ...(valueSnapshotSha ? ["VALUE_SNAPSHOT_CREATED"] : [])
  ].sort((a, b) => a.localeCompare(b));

  const maturityStatus = report ? "OK" : "INSUFFICIENT_EVIDENCE";
  if (!report) {
    reasons.add("MISSING_DIAGNOSTIC_REPORT");
  }

  const verifiedEligible =
    reasons.size === 0 &&
    maturityStatus === "OK";
  const label: "VERIFIED" | "INFORMATIONAL" | "UNTRUSTED" = verifiedEligible ? "VERIFIED" : "INFORMATIONAL";

  const questionScores42 = params.policy.passportPolicy.contents.includeQuestionLevelScores && report
    ? report.questionScores
      .map((row) => ({
        qIdHash: `q_${hashPassportId(row.questionId, truncBytes)}`,
        score: Math.max(0, Math.min(5, Number(row.finalLevel)))
      }))
      .sort((a, b) => a.qIdHash.localeCompare(b.qIdHash))
    : undefined;

  const policySha256 = fileSha(join(params.workspace, ".amc", "passport", "policy.yaml"));
  const canonSha256 = fileSha(canonPath(params.workspace));
  const bankSha256 = fileSha(diagnosticBankPath(params.workspace));
  const mechanicSha = params.policy.passportPolicy.contents.includeMechanicTargetsHashOnly
    ? fileSha(mechanicTargetsPath(params.workspace))
    : null;

  const passport = passportJsonSchema.parse({
    v: 1,
    passportId: `pass_${hashPassportId(`${scope.type}:${scope.id}:${Date.now()}`, 16)}`,
    generatedTs: Date.now(),
    scope: {
      type: scope.type,
      idHash: scopeIdHash
    },
    trust: {
      integrityIndex,
      correlationRatio,
      trustLabel,
      evidenceCoverage,
      notary: {
        enabled: notaryEnabled,
        fingerprint: notaryEnabled ? trustConfig.trust.notary.pinnedPubkeyFingerprint : null,
        attestationAgeMinutes: null
      }
    },
    status: {
      label,
      reasons: [...reasons].sort((a, b) => a.localeCompare(b))
    },
    maturity: {
      status: maturityStatus,
      overall: params.policy.passportPolicy.contents.includeMaturity ? overall : null,
      byFiveLayers: params.policy.passportPolicy.contents.includeMaturity
        ? layers
        : {
            strategicOps: null,
            leadership: null,
            culture: null,
            resilience: null,
            skills: null
          },
      unknownQuestionsCount,
      ...(questionScores42 ? { questionScores42 } : {})
    },
    strategyFailureRisks: params.policy.passportPolicy.contents.includeFiveStrategyRisks
      ? {
          ecosystemFocusRisk: forecastRisk.ecosystemFocusRisk,
          clarityPathRisk: forecastRisk.clarityPathRisk,
          economicSignificanceRisk: forecastRisk.economicSignificanceRisk,
          riskAssuranceRisk: forecastRisk.riskAssuranceRisk,
          digitalDualityRisk: forecastRisk.digitalDualityRisk
        }
      : {
          ecosystemFocusRisk: null,
          clarityPathRisk: null,
          economicSignificanceRisk: null,
          riskAssuranceRisk: null,
          digitalDualityRisk: null
        },
    valueDimensions: params.policy.passportPolicy.contents.includeFiveValueDims
      ? {
          emotionalValue: valueDimensions.emotional,
          functionalValue: valueDimensions.functional,
          economicValue: valueDimensions.economic,
          brandValue: valueDimensions.brand,
          lifetimeValue: valueDimensions.lifetime,
          valueScore: valueDimensions.valueScore
        }
      : {
          emotionalValue: null,
          functionalValue: null,
          economicValue: null,
          brandValue: null,
          lifetimeValue: null,
          valueScore: null
        },
    checkpoints: {
      cgxPackSha256,
      promptPackSha256: promptPackPresent ? promptPackSha256 : null,
      lastAssuranceCert: {
        status: assurance?.cert.status ?? "INSUFFICIENT_EVIDENCE",
        sha256: assurance?.sha256 ?? null,
        issuedTs: assurance?.cert.issuedTs ?? null,
        riskAssuranceScore: assurance?.cert.riskAssuranceScore ?? null
      },
      lastBench: {
        sha256: bench?.sha256 ?? null,
        generatedTs: bench?.generatedTs ?? null
      },
      lastAuditBinder: {
        sha256: auditCacheSha,
        generatedTs: auditCache?.generatedTs ?? null
      },
      lastValueSnapshot: {
        sha256: valueSnapshotSha,
        generatedTs: valueSnapshot?.generatedTs ?? null
      }
    },
    governanceSummary: {
      promptEnforcement: promptPolicy
        ? promptPolicy.promptPolicy.enforcement.mode === "ENFORCE" ? "ON" : "OFF"
        : "UNKNOWN",
      truthguard: promptPolicy
        ? promptPolicy.promptPolicy.truth.enforcementMode
        : "UNKNOWN",
      providerAllowlist: providerSummary.provider,
      modelAllowlist: providerSummary.model,
      toolAllowlist: toolSummary,
      approvals: approvalsSummary,
      leases: leasesSummary,
      pluginsIntegrity: pluginSummary
    },
    bindings: {
      passportPolicySha256: policySha256,
      canonSha256,
      bankSha256,
      mechanicTargetsSha256: mechanicSha,
      trustMode: trustConfig.trust.mode,
      notaryFingerprint: trustConfig.trust.mode === "NOTARY" ? trustConfig.trust.notary.pinnedPubkeyFingerprint : null
    },
    proofBindings: {
      transparencyRootSha256: "0".repeat(64),
      merkleRootSha256: "0".repeat(64),
      includedEventProofIds: [],
      calculationManifestSha256: "0".repeat(64)
    }
  });

  const calculationManifest = {
    v: 1,
    scope,
    sourceHashes: {
      policySha256,
      canonSha256,
      bankSha256,
      cgxPackSha256,
      promptPackSha256: promptPackPresent ? promptPackSha256 : null,
      assuranceCertSha256: assurance?.sha256 ?? null,
      benchSha256: bench?.sha256 ?? null,
      auditBinderSha256: auditCacheSha,
      valueSnapshotSha256: valueSnapshotSha,
      mechanicTargetsSha256: mechanicSha
    },
    reportRunId: report?.runId ?? null,
    forecastGeneratedTs: loadLatestForecastArtifact(params.workspace, { type: scope.type, id: scope.id })?.generatedTs ?? null,
    generatedTs: passport.generatedTs
  };

  return {
    passport,
    includedEventKinds,
    calculationManifest,
    sourceHashes: calculationManifest.sourceHashes
  };
}

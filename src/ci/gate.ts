import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { DiagnosticReport, GatePolicy, LayerName } from "../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signHexDigest, verifyHexDigestAny, getPrivateKeyPem, getPublicKeyHistory } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadBundleRunAndTrustMap, verifyEvidenceBundle } from "../bundles/bundle.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";

const layerNames: LayerName[] = [
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills"
];

const gatePolicySchema = z.object({
  minIntegrityIndex: z.number().min(0).max(1),
  minOverall: z.number().min(0).max(5),
  minLayer: z.object({
    "Strategic Agent Operations": z.number().min(0).max(5),
    "Leadership & Autonomy": z.number().min(0).max(5),
    "Culture & Alignment": z.number().min(0).max(5),
    Resilience: z.number().min(0).max(5),
    Skills: z.number().min(0).max(5)
  }),
  requireObservedForLevel5: z.boolean(),
  denyIfLowTrust: z.boolean(),
  minValueScore: z.number().min(0).max(100).optional(),
  minEconomicSignificanceIndex: z.number().min(0).max(100).optional(),
  denyIfValueRegression: z.boolean().optional(),
  maxCostIncreaseRatio: z.number().positive().optional(),
  requireExperimentPass: z
    .object({
      enabled: z.boolean(),
      experimentId: z.string().min(1),
      minUpliftSuccessRate: z.number(),
      minUpliftValuePoints: z.number()
    })
    .optional()
});

interface SignaturePayload {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export function defaultGatePolicy(): GatePolicy {
  return {
    minIntegrityIndex: 0.8,
    minOverall: 3.5,
    minLayer: {
      "Strategic Agent Operations": 3,
      "Leadership & Autonomy": 3,
      "Culture & Alignment": 3,
      Resilience: 3,
      Skills: 3
    },
    requireObservedForLevel5: true,
    denyIfLowTrust: true
  };
}

export function parseGatePolicy(raw: unknown): GatePolicy {
  return gatePolicySchema.parse(raw);
}

function signPolicyContent(workspace: string, bytes: Buffer): SignaturePayload {
  const digestSha256 = sha256Hex(bytes);
  return {
    digestSha256,
    signature: signHexDigest(digestSha256, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
}

export function writeSignedGatePolicy(params: {
  workspace: string;
  policyPath: string;
  policy: GatePolicy;
}): { policyPath: string; sigPath: string } {
  const resolved = resolve(params.workspace, params.policyPath);
  ensureDir(dirname(resolved));
  const bytes = Buffer.from(JSON.stringify(params.policy, null, 2), "utf8");
  writeFileAtomic(resolved, bytes, 0o644);
  const signature = signPolicyContent(params.workspace, bytes);
  const sigPath = `${resolved}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(signature, null, 2), 0o644);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "GATE_POLICY_SIGNED",
    agentId: "system",
    artifact: {
      kind: "policy",
      sha256: signature.digestSha256,
      id: "gate-policy"
    }
  });
  return {
    policyPath: resolved,
    sigPath
  };
}

export function verifyGatePolicySignature(params: {
  workspace: string;
  policyPath: string;
}): { valid: boolean; signatureExists: boolean; reason: string | null; sigPath: string } {
  const resolved = resolve(params.workspace, params.policyPath);
  const sigPath = `${resolved}.sig`;
  if (!pathExists(resolved)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "policy file missing",
      sigPath
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "policy signature missing",
      sigPath
    };
  }

  try {
    const payload = JSON.parse(readFileSync(sigPath, "utf8")) as SignaturePayload;
    const bytes = readFileSync(resolved);
    const digest = sha256Hex(bytes);
    if (digest !== payload.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "policy digest mismatch",
        sigPath
      };
    }
    const keys = getPublicKeyHistory(params.workspace, "auditor");
    const valid = verifyHexDigestAny(digest, payload.signature, keys);
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature payload: ${String(error)}`,
      sigPath
    };
  }
}

function overallScore(report: DiagnosticReport): number {
  if (report.layerScores.length === 0) {
    return 0;
  }
  const total = report.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0);
  return total / report.layerScores.length;
}

export function evaluateGatePolicy(params: {
  report: DiagnosticReport;
  policy: GatePolicy;
  eventTrustTier?: Map<string, string>;
}): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (params.report.integrityIndex < params.policy.minIntegrityIndex) {
    reasons.push(
      `IntegrityIndex ${params.report.integrityIndex.toFixed(3)} is below minimum ${params.policy.minIntegrityIndex.toFixed(3)}`
    );
  }

  const overall = overallScore(params.report);
  if (overall < params.policy.minOverall) {
    reasons.push(`Overall maturity ${overall.toFixed(3)} is below minimum ${params.policy.minOverall.toFixed(3)}`);
  }

  for (const layerName of layerNames) {
    const actual = params.report.layerScores.find((layer) => layer.layerName === layerName)?.avgFinalLevel ?? 0;
    const required = params.policy.minLayer[layerName];
    if (actual < required) {
      reasons.push(`${layerName} score ${actual.toFixed(3)} is below minimum ${required.toFixed(3)}`);
    }
  }

  if (params.policy.denyIfLowTrust && params.report.trustLabel !== "HIGH TRUST") {
    reasons.push(`Trust label ${params.report.trustLabel} is disallowed by gate policy.`);
  }

  if (params.policy.requireObservedForLevel5) {
    const trustMap = params.eventTrustTier ?? new Map<string, string>();
    for (const question of params.report.questionScores) {
      if (question.finalLevel !== 5) {
        continue;
      }
      if (question.evidenceEventIds.length === 0) {
        reasons.push(`${question.questionId} is level 5 but has no evidence event IDs.`);
        continue;
      }
      const nonObserved = question.evidenceEventIds.filter((eventId) => {
        const tier = trustMap.get(eventId);
        return tier !== "OBSERVED" && tier !== "OBSERVED_HARDENED";
      });
      if (nonObserved.length > 0) {
        reasons.push(
          `${question.questionId} is level 5 but has non-OBSERVED evidence: ${nonObserved.slice(0, 5).join(",")}`
        );
      }
    }
  }

  return {
    pass: reasons.length === 0,
    reasons
  };
}

function relativeAgentPathFromWorkspace(workspace: string, path: string): string {
  const resolved = resolve(path);
  return resolved.startsWith(resolve(workspace)) ? resolved.slice(resolve(workspace).length + 1).replace(/\\/g, "/") : path;
}

export function initCiForAgent(params: {
  workspace: string;
  agentId?: string;
}): {
  workflowPath: string;
  policyPath: string;
  policySigPath: string;
  suggestedBundlePath: string;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const agentPaths = getAgentPaths(params.workspace, agentId);

  const policy = defaultGatePolicy();
  const savedPolicy = writeSignedGatePolicy({
    workspace: params.workspace,
    policyPath: agentPaths.gatePolicy,
    policy
  });

  const workflowPath = join(params.workspace, ".github", "workflows", "amc.yml");
  ensureDir(dirname(workflowPath));

  const suggestedBundlePath = join(agentPaths.bundlesDir, "latest.amcbundle");
  const relBundle = relativeAgentPathFromWorkspace(params.workspace, suggestedBundlePath);
  const relPolicy = relativeAgentPathFromWorkspace(params.workspace, savedPolicy.policyPath);
  const relOutcomeReport = relativeAgentPathFromWorkspace(
    params.workspace,
    join(agentPaths.rootDir, "outcomes", "reports", "ci-latest.json")
  );
  const relExperimentPolicy = relativeAgentPathFromWorkspace(
    params.workspace,
    join(agentPaths.rootDir, "experimentGate.json")
  );

  const workflow = [
    "name: AMC Release Gate",
    "",
    "on:",
    "  push:",
    "  pull_request:",
    "",
    "jobs:",
    "  amc-gate:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: '20'",
    "      - name: Install dependencies",
    "        run: npm ci",
    "      - name: Build",
    "        run: npm run build",
    "      - name: Verify evidence bundle",
    `        run: node dist/cli.js bundle verify ${relBundle}`,
    "      - name: Generate outcomes report",
    `        run: node dist/cli.js outcomes report --agent ${agentId} --window 14d --out ${relOutcomeReport}`,
    "      - name: Optional experiment gate",
    `        run: if [ -n \"${"$"}AMC_EXPERIMENT_ID\" ] && [ -f \"${relExperimentPolicy}\" ]; then node dist/cli.js experiment gate --agent ${agentId} --experiment \"${"$"}AMC_EXPERIMENT_ID\" --policy ${relExperimentPolicy}; else echo \"Experiment gate skipped (set AMC_EXPERIMENT_ID and commit ${relExperimentPolicy})\"; fi`,
    "      - name: Enforce AMC gate policy",
    `        run: node dist/cli.js gate --bundle ${relBundle} --policy ${relPolicy}`,
    "      - name: Generate maturity BOM",
    `        run: node dist/cli.js bom generate --agent ${agentId} --run latest --out amc-bom.json`,
    "      - name: Sign maturity BOM",
    "        run: node dist/cli.js bom sign --in amc-bom.json --out amc-bom.json.sig",
    ""
  ].join("\n");

  writeFileAtomic(workflowPath, workflow, 0o644);

  return {
    workflowPath,
    policyPath: savedPolicy.policyPath,
    policySigPath: savedPolicy.sigPath,
    suggestedBundlePath
  };
}

export function printCiSteps(params: {
  workspace: string;
  agentId?: string;
}): string[] {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const agentPaths = getAgentPaths(params.workspace, agentId);
  const bundlePath = join(agentPaths.bundlesDir, "latest.amcbundle");
  return [
    "npm ci",
    "npm run build",
    `node dist/cli.js bundle verify ${relativeAgentPathFromWorkspace(params.workspace, bundlePath)}`,
    `node dist/cli.js outcomes report --agent ${agentId} --window 14d --out ${relativeAgentPathFromWorkspace(
      params.workspace,
      join(agentPaths.rootDir, "outcomes", "reports", "ci-latest.json")
    )}`,
    `if [ -n "$AMC_EXPERIMENT_ID" ] && [ -f "${relativeAgentPathFromWorkspace(
      params.workspace,
      join(agentPaths.rootDir, "experimentGate.json")
    )}" ]; then node dist/cli.js experiment gate --agent ${agentId} --experiment "$AMC_EXPERIMENT_ID" --policy ${relativeAgentPathFromWorkspace(
      params.workspace,
      join(agentPaths.rootDir, "experimentGate.json")
    )}; fi`,
    `node dist/cli.js gate --bundle ${relativeAgentPathFromWorkspace(params.workspace, bundlePath)} --policy ${relativeAgentPathFromWorkspace(params.workspace, agentPaths.gatePolicy)}`
  ];
}

export async function runBundleGate(params: {
  workspace: string;
  bundlePath: string;
  policyPath: string;
}): Promise<{ pass: boolean; reasons: string[]; report: DiagnosticReport; policy: GatePolicy }> {
  const verification = await verifyEvidenceBundle(resolve(params.workspace, params.bundlePath));
  const reasons: string[] = [];
  if (!verification.ok) {
    reasons.push(...verification.errors.map((error) => `bundle verify failed: ${error}`));
  }

  const policyRaw = JSON.parse(readFileSync(resolve(params.workspace, params.policyPath), "utf8")) as unknown;
  const policy = parseGatePolicy(policyRaw);
  const signature = verifyGatePolicySignature({
    workspace: params.workspace,
    policyPath: params.policyPath
  });
  if (!signature.valid) {
    reasons.push(`gate policy signature invalid: ${signature.reason ?? "unknown"}`);
  }

  const loaded = loadBundleRunAndTrustMap(resolve(params.workspace, params.bundlePath));
  const evaluation = evaluateGatePolicy({
    report: loaded.run,
    policy,
    eventTrustTier: loaded.eventTrustTier
  });
  reasons.push(...evaluation.reasons);

  const outcome = loaded.outcomeReport;
  if (typeof policy.minValueScore === "number") {
    const measured = typeof outcome?.valueScore === "number" ? outcome.valueScore : null;
    if (measured === null) {
      reasons.push("Value gate configured but outcomes/report.json is missing in bundle.");
    } else if (measured < policy.minValueScore) {
      reasons.push(`ValueScore ${measured.toFixed(3)} is below minimum ${policy.minValueScore.toFixed(3)}.`);
    }
  }
  if (typeof policy.minEconomicSignificanceIndex === "number") {
    const measured = typeof outcome?.economicSignificanceIndex === "number" ? outcome.economicSignificanceIndex : null;
    if (measured === null) {
      reasons.push("Economic significance gate configured but outcomes/report.json is missing in bundle.");
    } else if (measured < policy.minEconomicSignificanceIndex) {
      reasons.push(
        `EconomicSignificanceIndex ${measured.toFixed(3)} is below minimum ${policy.minEconomicSignificanceIndex.toFixed(3)}.`
      );
    }
  }
  if (policy.denyIfValueRegression) {
    const regression = typeof outcome?.valueRegressionRisk === "number" ? outcome.valueRegressionRisk : null;
    if (regression === null) {
      reasons.push("Value regression gate configured but outcomes/report.json is missing in bundle.");
    } else if (regression > 0) {
      reasons.push(`Value regression detected (ValueRegressionRisk=${regression.toFixed(3)}).`);
    }
  }

  const experiment = loaded.experimentReport;
  if (policy.requireExperimentPass?.enabled) {
    if (!experiment) {
      reasons.push("Experiment gate enabled but experiments/report.json is missing in bundle.");
    } else {
      const experimentId = typeof experiment.experimentId === "string" ? experiment.experimentId : null;
      const upliftSuccessRate =
        typeof experiment.upliftSuccessRate === "number" ? experiment.upliftSuccessRate : Number.NaN;
      const upliftValuePoints =
        typeof experiment.upliftValuePoints === "number" ? experiment.upliftValuePoints : Number.NaN;
      if (!experimentId) {
        reasons.push("Experiment report is present but missing experimentId.");
      } else if (experimentId !== policy.requireExperimentPass.experimentId) {
        reasons.push(
          `Experiment ID mismatch: expected ${policy.requireExperimentPass.experimentId}, got ${experimentId}.`
        );
      }
      if (!Number.isFinite(upliftSuccessRate)) {
        reasons.push("Experiment report missing upliftSuccessRate.");
      } else if (upliftSuccessRate < policy.requireExperimentPass.minUpliftSuccessRate) {
        reasons.push(
          `Experiment upliftSuccessRate ${upliftSuccessRate.toFixed(4)} is below ${policy.requireExperimentPass.minUpliftSuccessRate.toFixed(4)}.`
        );
      }
      if (!Number.isFinite(upliftValuePoints)) {
        reasons.push("Experiment report missing upliftValuePoints.");
      } else if (upliftValuePoints < policy.requireExperimentPass.minUpliftValuePoints) {
        reasons.push(
          `Experiment upliftValuePoints ${upliftValuePoints.toFixed(4)} is below ${policy.requireExperimentPass.minUpliftValuePoints.toFixed(4)}.`
        );
      }
    }
  }
  if (typeof policy.maxCostIncreaseRatio === "number" && experiment) {
    const baseline =
      typeof experiment.baselineCostPerSuccess === "number" ? experiment.baselineCostPerSuccess : Number.NaN;
    const candidate =
      typeof experiment.candidateCostPerSuccess === "number" ? experiment.candidateCostPerSuccess : Number.NaN;
    if (Number.isFinite(baseline) && Number.isFinite(candidate) && baseline > 0) {
      const ratio = candidate / baseline;
      if (ratio > policy.maxCostIncreaseRatio) {
        reasons.push(`Experiment cost increase ratio ${ratio.toFixed(4)} exceeds ${policy.maxCostIncreaseRatio.toFixed(4)}.`);
      }
    }
  }

  return {
    pass: reasons.length === 0,
    reasons,
    report: loaded.run,
    policy
  };
}

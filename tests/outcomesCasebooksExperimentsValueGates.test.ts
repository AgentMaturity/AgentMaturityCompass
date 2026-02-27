import { createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  initOutcomeContract,
  verifyOutcomeContractSignature,
  upsertOutcomeContract,
  runOutcomeReport,
  openLedger,
  initCasebook,
  verifyCasebook,
  createExperiment,
  setExperimentBaseline,
  setExperimentCandidate,
  runExperiment,
  analyzeExperiment,
  gateExperiment,
  deterministicSeed,
  bootstrapDifferenceCI,
  effectSizeDifference,
  runDiagnostic,
  exportEvidenceBundle,
  runBundleGate,
  writeSignedGatePolicy,
  initBudgets,
  ingestOutcomeWebhook,
  verifyOutcomeIngestHmac
} from "../src/index.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { createWorkOrder } from "../src/workorders/workorderEngine.js";
import { initIntegrationsConfig, integrationsConfigPath } from "../src/integrations/integrationStore.js";
import { getVaultSecret } from "../src/vault/vault.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-outcomes-test-"));
  roots.push(dir);
  const _savedVaultPass = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "outcome-tests-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  return dir;
}

function signFileWithAuditor(workspace: string, filePath: string): void {
  const digest = sha256Hex(readFileSync(filePath));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  writeFileSync(
    `${filePath}.sig`,
    JSON.stringify(
      {
        digestSha256: digest,
        signature,
        signedTs: Date.now(),
        signer: "auditor"
      },
      null,
      2
    )
  );
}

function appendOutcomeSignal(params: {
  workspace: string;
  agentId?: string;
  metricId: string;
  category: "Emotional" | "Functional" | "Economic" | "Brand" | "Lifetime";
  value: number | string | boolean;
  trustTier: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
}): void {
  const ledger = openLedger(params.workspace);
  try {
    ledger.appendOutcomeEvent({
      agentId: params.agentId ?? "default",
      workOrderId: null,
      category: params.category,
      metricId: params.metricId,
      value: params.value,
      unit: null,
      trustTier: params.trustTier,
      source: "manual",
      meta: {
        fixture: true
      }
    });
  } finally {
    ledger.close();
  }
}

function appendLlmUsage(workspace: string, agentId = "default", totalTokens = 100): void {
  const ledger = openLedger(workspace);
  const sessionId = `usage-${Date.now()}`;
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "vitest",
      binarySha256: "vitest"
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "llm_response",
      payload: JSON.stringify({ ok: true }),
      payloadExt: "json",
      inline: true,
      meta: {
        agentId,
        usage: {
          total_tokens: totalTokens
        },
        trustTier: "OBSERVED"
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

function writeSimpleContract(params: {
  workspace: string;
  agentId: string;
  minObservedRatio: number;
  metricId: string;
  numeratorSignal: string;
  denominatorSignal: string;
  trustTierAtLeast: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
  level3?: number;
  level4?: number;
  level5?: number;
}): void {
  upsertOutcomeContract(
    params.workspace,
    {
      outcomeContract: {
        version: 1,
        agentId: params.agentId,
        title: "Fixture Contract",
        description: "Deterministic fixture contract",
        windowDefaults: {
          reportingWindowDays: 14,
          minObservedRatioForClaims: params.minObservedRatio
        },
        metrics: [
          {
            metricId: params.metricId,
            category: "Functional",
            description: "Fixture ratio metric",
            type: "ratio",
            numeratorSignal: params.numeratorSignal,
            denominatorSignal: params.denominatorSignal,
            target: {
              level3: params.level3 ?? 0.5,
              level4: params.level4 ?? 0.7,
              level5: params.level5 ?? 0.9
            },
            evidenceRules: {
              trustTierAtLeast: params.trustTierAtLeast
            }
          }
        ]
      }
    },
    params.agentId
  );
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("outcome compass", () => {
  test("outcome contract is signed, tamper invalidates signature, low observed coverage yields UNKNOWN", () => {
    const workspace = newWorkspace();
    const created = initOutcomeContract(workspace, "default");
    expect(created.path).toContain("contract.yaml");
    expect(verifyOutcomeContractSignature(workspace, "default").valid).toBe(true);

    writeFileSync(created.path, `${readFileSync(created.path, "utf8")}\n# tampered`);
    const tampered = verifyOutcomeContractSignature(workspace, "default");
    expect(tampered.valid).toBe(false);

    writeSimpleContract({
      workspace,
      agentId: "default",
      minObservedRatio: 0.8,
      metricId: "fixture.coverage_ratio",
      numeratorSignal: "fixture.ok",
      denominatorSignal: "fixture.total",
      trustTierAtLeast: "ATTESTED"
    });

    appendOutcomeSignal({
      workspace,
      metricId: "fixture.ok",
      category: "Functional",
      value: true,
      trustTier: "ATTESTED"
    });
    appendOutcomeSignal({
      workspace,
      metricId: "fixture.total",
      category: "Functional",
      value: true,
      trustTier: "ATTESTED"
    });

    const out = runOutcomeReport({
      workspace,
      agentId: "default",
      window: "14d"
    });
    const metric = out.report.metrics.find((row) => row.metricId === "fixture.coverage_ratio");
    expect(metric).toBeDefined();
    expect(metric?.status).toBe("UNKNOWN");
    expect(metric?.reasons.some((reason) => reason.includes("observed coverage"))).toBe(true);
  });

  test("self-reported only evidence cannot satisfy above level 2", () => {
    const workspace = newWorkspace();

    writeSimpleContract({
      workspace,
      agentId: "default",
      minObservedRatio: 0,
      metricId: "fixture.self_ratio",
      numeratorSignal: "fixture.self_ok",
      denominatorSignal: "fixture.self_total",
      trustTierAtLeast: "SELF_REPORTED",
      level3: 0.1,
      level4: 0.2,
      level5: 0.3
    });

    appendOutcomeSignal({
      workspace,
      metricId: "fixture.self_ok",
      category: "Functional",
      value: true,
      trustTier: "SELF_REPORTED"
    });
    appendOutcomeSignal({
      workspace,
      metricId: "fixture.self_total",
      category: "Functional",
      value: true,
      trustTier: "SELF_REPORTED"
    });

    const out = runOutcomeReport({
      workspace,
      agentId: "default",
      window: "14d"
    });
    const metric = out.report.metrics.find((row) => row.metricId === "fixture.self_ratio");
    expect(metric).toBeDefined();
    expect(metric?.trustCoverage.selfReported).toBe(1);
    expect(metric?.status).toBe("PARTIAL");
    expect(metric?.reasons.some((reason) => reason.includes("caps metric at level 2"))).toBe(true);
  });

  test("toolhub execution emits OBSERVED outcome signals with receipts", async () => {
    const workspace = newWorkspace();
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    const service = new ToolHubService(workspace);

    const workDir = join(workspace, "workspace");
    mkdirSync(workDir, { recursive: true });
    const samplePath = join(workDir, "sample.txt");
    writeFileSync(samplePath, "hello outcome world");

    const wo = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Read sample",
      description: "read sample file",
      riskTier: "low",
      requestedMode: "SIMULATE",
      allowedActionClasses: ["READ_ONLY"]
    });

    const intent = service.createIntent({
      agentId: "default",
      workOrderId: wo.workOrder.workOrderId,
      toolName: "fs.read",
      args: { path: "./workspace/sample.txt" },
      requestedMode: "SIMULATE"
    });
    const execution = await service.executeIntent({ intentId: intent.intentId });
    expect(execution.allowed).toBe(true);

    const ledger = openLedger(workspace);
    try {
      const events = ledger.getOutcomeEventsBetween(Date.now() - 86_400_000, Date.now(), "default");
      const metricIds = events.map((row) => row.metric_id);
      expect(metricIds).toContain("workorder.started");
      expect(metricIds).toContain("workorder.completed");
      const success = events.find((row) => row.metric_id === "toolhub.execute_success");
      expect(success?.trust_tier).toBe("OBSERVED");
      expect(typeof success?.receipt).toBe("string");
      expect((success?.receipt ?? "").length).toBeGreaterThan(20);
    } finally {
      ledger.close();
    }
  });

  test("feedback/outcome ingest enforces HMAC and stores secrets in vault only", () => {
    const workspace = newWorkspace();
    initIntegrationsConfig(workspace);

    const cfgText = readFileSync(integrationsConfigPath(workspace), "utf8");
    const webhookSecret = getVaultSecret(workspace, "integrations/ops-webhook");
    expect(webhookSecret).toBeTruthy();
    expect(cfgText.includes(String(webhookSecret))).toBe(false);

    const payload = {
      agentId: "default",
      signalId: "feedback.rating",
      category: "Emotional" as const,
      value: 5,
      unit: "1-5"
    };
    const body = JSON.stringify(payload);
    const sig = createHmac("sha256", String(webhookSecret)).update(body, "utf8").digest("hex");
    expect(verifyOutcomeIngestHmac(body, String(webhookSecret), "deadbeef")).toBe(false);
    expect(verifyOutcomeIngestHmac(body, String(webhookSecret), sig)).toBe(true);

    const ingested = ingestOutcomeWebhook({
      workspace,
      payload,
      trustTier: "OBSERVED",
      sourceLabel: "vitest.outcomes.webhook"
    });
    expect(typeof ingested.outcomeEventId).toBe("string");
    expect(typeof ingested.receiptId).toBe("string");

    const ledger = openLedger(workspace);
    try {
      const rows = ledger.getOutcomeEventsBetween(Date.now() - 86_400_000, Date.now(), "default");
      const found = rows.find((row) => row.metric_id === "feedback.rating");
      expect(found).toBeDefined();
      expect((found?.receipt ?? "").length).toBeGreaterThan(20);
    } finally {
      ledger.close();
    }
  });

  test("value engine computation is deterministic for identical fixtures", () => {
    const workspaceA = newWorkspace();
    const workspaceB = newWorkspace();

    for (const workspace of [workspaceA, workspaceB]) {
      upsertOutcomeContract(
        workspace,
        {
          outcomeContract: {
            version: 1,
            agentId: "default",
            title: "Deterministic value fixture",
            description: "fixture",
            windowDefaults: {
              reportingWindowDays: 14,
              minObservedRatioForClaims: 0
            },
            metrics: [
              {
                metricId: "functional.task_success_rate",
                category: "Functional",
                description: "success ratio",
                type: "ratio",
                numeratorSignal: "workorder.completed",
                denominatorSignal: "workorder.started",
                target: {
                  level3: 0.5,
                  level4: 0.7,
                  level5: 0.9
                },
                evidenceRules: {
                  trustTierAtLeast: "OBSERVED"
                }
              },
              {
                metricId: "economic.cost_per_success",
                category: "Economic",
                description: "tokens per success",
                type: "derived",
                inputs: ["llm.tokens", "workorder.completed"],
                target: {
                  level3: "<=baseline",
                  level4: "<=baseline*0.9",
                  level5: "<=baseline*0.8"
                },
                evidenceRules: {
                  trustTierAtLeast: "OBSERVED"
                }
              }
            ]
          }
        },
        "default"
      );
      appendOutcomeSignal({
        workspace,
        metricId: "workorder.started",
        category: "Functional",
        value: true,
        trustTier: "OBSERVED"
      });
      appendOutcomeSignal({
        workspace,
        metricId: "workorder.completed",
        category: "Functional",
        value: true,
        trustTier: "OBSERVED"
      });
      appendLlmUsage(workspace, "default", 120);
    }

    const reportA = runOutcomeReport({ workspace: workspaceA, agentId: "default", window: "14d" }).report;
    const reportB = runOutcomeReport({ workspace: workspaceB, agentId: "default", window: "14d" }).report;

    expect(reportA.valueScore).toBe(reportB.valueScore);
    expect(reportA.economicSignificanceIndex).toBe(reportB.economicSignificanceIndex);
    expect(reportA.metrics.map((m) => m.metricId)).toEqual(reportB.metrics.map((m) => m.metricId));
    expect(Number.isFinite(reportA.economicSignificanceIndex)).toBe(true);
  });

  test("casebooks and experiments are signed, deterministic, and gate failures are enforced", () => {
    const workspace = newWorkspace();

    initCasebook(workspace, "default", "default");
    expect(verifyCasebook(workspace, "default", "default").valid).toBe(true);

    const caseFile = join(workspace, ".amc", "casebooks", "default", "cases", "case_1.json");
    writeFileSync(caseFile, `${readFileSync(caseFile, "utf8")}\n`);
    expect(verifyCasebook(workspace, "default", "default").valid).toBe(false);

    initCasebook(workspace, "default", "expbook");
    const created = createExperiment({
      workspace,
      agentId: "default",
      name: "candidate-check",
      casebookId: "expbook"
    });
    setExperimentBaseline({
      workspace,
      agentId: "default",
      experimentId: created.experimentId,
      config: "current"
    });

    const candidateFile = join(workspace, "candidate.yaml");
    writeFileSync(candidateFile, "candidate:\n  mode: safe\n", "utf8");
    signFileWithAuditor(workspace, candidateFile);
    setExperimentCandidate({
      workspace,
      agentId: "default",
      experimentId: created.experimentId,
      candidateFile
    });

    const run = runExperiment({
      workspace,
      agentId: "default",
      experimentId: created.experimentId,
      mode: "sandbox"
    });
    expect(typeof run.report.baselineCostPerSuccess).toBe("number");
    expect(typeof run.report.upliftSuccessRate).toBe("number");
    expect(typeof run.report.upliftValuePoints).toBe("number");

    const analysis = analyzeExperiment({
      workspace,
      agentId: "default",
      experimentId: created.experimentId
    });
    expect(analysis.report.runId).toBe(run.report.runId);

    const seed = deterministicSeed(["fixture", 42]);
    const ciA = bootstrapDifferenceCI({
      baseline: [1, 2, 3],
      candidate: [2, 3, 4],
      seed
    });
    const ciB = bootstrapDifferenceCI({
      baseline: [1, 2, 3],
      candidate: [2, 3, 4],
      seed
    });
    expect(ciA).toEqual(ciB);
    expect(effectSizeDifference([1, 2, 3], [2, 3, 4])).toBe(1);

    const gatePolicyPath = join(workspace, "exp-gate.json");
    writeFileSync(
      gatePolicyPath,
      JSON.stringify(
        {
          minUpliftSuccessRate: 0.99,
          minUpliftValuePoints: 50,
          denyIfRegression: true
        },
        null,
        2
      )
    );
    const gate = gateExperiment({
      workspace,
      agentId: "default",
      experimentId: created.experimentId,
      policyPath: gatePolicyPath
    });
    expect(gate.pass).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  test("bundle gate enforces value score and regression policy and passes when configured", async () => {
    const workspace = newWorkspace();

    const run = await runDiagnostic({
      workspace,
      agentId: "default",
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    writeSimpleContract({
      workspace,
      agentId: "default",
      minObservedRatio: 0,
      metricId: "gate.metric",
      numeratorSignal: "gate.ok",
      denominatorSignal: "gate.total",
      trustTierAtLeast: "OBSERVED",
      level3: 0.9,
      level4: 0.95,
      level5: 1
    });
    appendOutcomeSignal({
      workspace,
      metricId: "gate.ok",
      category: "Functional",
      value: true,
      trustTier: "OBSERVED"
    });
    appendOutcomeSignal({
      workspace,
      metricId: "gate.total",
      category: "Functional",
      value: true,
      trustTier: "OBSERVED"
    });
    runOutcomeReport({ workspace, agentId: "default", window: "14d" });

    writeSimpleContract({
      workspace,
      agentId: "default",
      minObservedRatio: 0,
      metricId: "gate.metric",
      numeratorSignal: "gate.ok",
      denominatorSignal: "gate.total",
      trustTierAtLeast: "OBSERVED",
      level3: 1.1,
      level4: 1.2,
      level5: 1.3
    });
    const lowReport = runOutcomeReport({ workspace, agentId: "default", window: "14d" }).report;
    expect(lowReport.valueRegressionRisk).toBeGreaterThan(0);

    const bundlePath = join(workspace, ".amc", "agents", "default", "bundles", "value-gate.amcbundle");
    exportEvidenceBundle({
      workspace,
      runId: run.runId,
      outFile: bundlePath,
      agentId: "default"
    });

    const lowValuePolicyPath = join(workspace, ".amc", "agents", "default", "gate-low-value.json");
    writeSignedGatePolicy({
      workspace,
      policyPath: lowValuePolicyPath,
      policy: {
        minIntegrityIndex: 0,
        minOverall: 0,
        minLayer: {
          "Strategic Agent Operations": 0,
          "Leadership & Autonomy": 0,
          "Culture & Alignment": 0,
          Resilience: 0,
          Skills: 0
        },
        requireObservedForLevel5: false,
        denyIfLowTrust: false,
        minValueScore: 80
      }
    });
    const lowValue = await runBundleGate({
      workspace,
      bundlePath,
      policyPath: lowValuePolicyPath
    });
    expect(lowValue.pass).toBe(false);
    expect(lowValue.reasons.some((reason) => reason.includes("ValueScore"))).toBe(true);

    const regressionPolicyPath = join(workspace, ".amc", "agents", "default", "gate-regression.json");
    writeSignedGatePolicy({
      workspace,
      policyPath: regressionPolicyPath,
      policy: {
        minIntegrityIndex: 0,
        minOverall: 0,
        minLayer: {
          "Strategic Agent Operations": 0,
          "Leadership & Autonomy": 0,
          "Culture & Alignment": 0,
          Resilience: 0,
          Skills: 0
        },
        requireObservedForLevel5: false,
        denyIfLowTrust: false,
        denyIfValueRegression: true
      }
    });
    const regression = await runBundleGate({
      workspace,
      bundlePath,
      policyPath: regressionPolicyPath
    });
    expect(regression.pass).toBe(false);
    expect(regression.reasons.some((reason) => reason.includes("Value regression detected"))).toBe(true);

    const passPolicyPath = join(workspace, ".amc", "agents", "default", "gate-pass.json");
    writeSignedGatePolicy({
      workspace,
      policyPath: passPolicyPath,
      policy: {
        minIntegrityIndex: 0,
        minOverall: 0,
        minLayer: {
          "Strategic Agent Operations": 0,
          "Leadership & Autonomy": 0,
          "Culture & Alignment": 0,
          Resilience: 0,
          Skills: 0
        },
        requireObservedForLevel5: false,
        denyIfLowTrust: false,
        minValueScore: 0,
        minEconomicSignificanceIndex: 0,
        denyIfValueRegression: false
      }
    });
    const passed = await runBundleGate({
      workspace,
      bundlePath,
      policyPath: passPolicyPath
    });
    expect(passed.pass).toBe(true);
  });
});

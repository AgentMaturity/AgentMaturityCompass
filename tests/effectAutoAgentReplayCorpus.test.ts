import { describe, expect, test } from "vitest";
import {
  runEffectAutoAgentReplayCorpus,
  verifyEffectAutoAgentReplayReceipt,
} from "../src/eval/effectAutoAgentReplayCorpus.js";

const liveEvidence = {
  sourceRefHash: "72927a3a31c7112d597cff64c8ed608a4a05e93e",
  repositorySnapshotHash: "523f2cdf427af42d621d474e3f78dd76fca88060",
  licenseRefHash: "b346896c56ae785e5ca9f968a1f92de5ff1d5759",
  defaultBranchRefHash: "72927a3a31c7112d597cff64c8ed608a4a05e93e",
  readmeBlobHash: "e1ce97c2c431f0009c25301b9d1b79c220b6b1ae",
  packageJsonHash: "ff5278a7201a801b7fcd93d0fcd9907364732b84",
  lockfileHash: "3b87e7fdc1a22d3cf9ea8f4b2c0e81fa7f9ea90f",
  ciWorkflowHash: "99296d3104ffbbd2be61df042d17cb875cb9c451",
  benchmarkRunnerHash: "3a25b1602b145175031a1a37361ce1aeae08111b",
  harnessSpecHash: "4f0740ee7c4c06cb9cdf166f88494fbe82c90b12",
  taskSpecHash: "8f8627dec5711a94188e1fd1419e169af61cfe36",
  metricsHash: "512f6417df0139daee815ea2ff9fc8133c0f27ca",
  experimentLogHash: "4edad9f08c111ebe0da0524895216776d727c753",
  agentBlueprintHash: "91de2eae480f22701d53110389cfabebf35ac86c",
  agentRunnerHash: "a385111d1293688998b8e2d0cab24b0686723c68",
  agentRunResultHash: "affba20ef708a0437c6c9f0ad7cde5f632559a21",
  trajectoryConverterHash: "c5e9e15933079eaf40f163ff49803e153c590ce0",
  containerManagerHash: "6eb26a037b1672ab4d44d51991e407e741ba8733",
  taskManifestHash: "7da10715aa55926ff46d6763c0ce2904f882f313",
  taskInstructionHash: "3c9d36dc8f14d557e81e3304061ad94d60aa639e",
  fixtureTestHash: "f3a38b7103c74c9b8ac33c74e617b8c208fb4743",
  dockerEnvironmentHash: "e48528f0cc6c03be6b5113a0dc46055b0c94ecc6",
};

const amcOwnedHashes = {
  replayCommandHash: "a".repeat(64),
  baselineResultHash: "b".repeat(64),
  candidateResultHash: "c".repeat(64),
  ciReceiptHash: "d".repeat(64),
};

describe("effect-autoagent replay corpus receipts", () => {
  test("approves replayable declarative agent benchmark rows with signed evidence", () => {
    const result = runEffectAutoAgentReplayCorpus({
      agentId: "agent-replay-effect-autoagent",
      corpusId: "effect-autoagent-live-2026-06",
      corpusVersion: "2026.06.20",
      baselineRunId: "baseline-effect-autoagent-001",
      candidateRunId: "candidate-effect-autoagent-001",
      gateMode: "ci",
      generatedAt: "2026-06-20T04:10:00.000Z",
      sourceRefs: ["https://github.com/mpsuesser/effect-autoagent"],
      rows: [
        {
          rowId: "effect-autoagent-hello-world",
          taskId: "hello-world",
          taskFamily: "hello_world",
          runtime: "docker",
          providerRoute: "openai",
          replayCommand: "amc-owned-effect-autoagent-replay",
          fixedSeed: 1701,
          baselineRunId: "baseline-effect-autoagent-001",
          candidateRunId: "candidate-effect-autoagent-001",
          baselineScore0to1: 0.82,
          candidateScore0to1: 0.87,
          replayPassRate0to1: 1,
          minReplayPassRate0to1: 0.99,
          maxScoreRegression0to1: 0.02,
          evidenceRefs: ["trace:effect-autoagent-hello-world"],
          signedEvidenceRefs: ["ledger:sig-effect-autoagent-hello-world"],
          ...liveEvidence,
          ...amcOwnedHashes,
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.rows[0]?.status).toBe("passed");
    expect(result.manifest.rows[0]?.scoreDelta0to1).toBeCloseTo(0.05, 5);
    expect(result.manifest.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ciReceipt.passed).toBe(true);
    expect(result.ciReceipt.failClosed).toBe(false);
    expect(result.ciReceipt.effectAutoAgentReplayRowCount).toBe(1);
    expect(result.ciReceipt.failedEffectAutoAgentReplayRowIds).toEqual([]);
    expect(result.watchAlerts).toEqual([]);

    const verification = verifyEffectAutoAgentReplayReceipt(result.manifest, result.ciReceipt);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("fails closed when replay proof, signed evidence, and regression gates are missing", () => {
    const result = runEffectAutoAgentReplayCorpus({
      agentId: "agent-replay-effect-autoagent",
      corpusId: "effect-autoagent-live-2026-06",
      corpusVersion: "2026.06.20",
      baselineRunId: "baseline-effect-autoagent-001",
      candidateRunId: "candidate-effect-autoagent-002",
      gateMode: "ci",
      generatedAt: "2026-06-20T04:20:00.000Z",
      sourceRefs: ["https://github.com/mpsuesser/effect-autoagent"],
      rows: [
        {
          rowId: "effect-autoagent-metadata-only",
          taskId: "hello-world",
          taskFamily: "hello_world",
          runtime: "docker",
          providerRoute: "openai",
          sourceRefHash: liveEvidence.sourceRefHash,
          repositorySnapshotHash: liveEvidence.repositorySnapshotHash,
          licenseRefHash: liveEvidence.licenseRefHash,
          defaultBranchRefHash: liveEvidence.defaultBranchRefHash,
          readmeBlobHash: liveEvidence.readmeBlobHash,
          baselineRunId: "baseline-effect-autoagent-001",
          candidateRunId: "candidate-effect-autoagent-002",
          baselineScore0to1: 0.9,
          candidateScore0to1: 0.79,
          replayPassRate0to1: 0.5,
          minReplayPassRate0to1: 0.99,
          maxScoreRegression0to1: 0.02,
          evidenceRefs: ["trace:effect-autoagent-metadata-only"],
          signedEvidenceRefs: [],
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]?.status).toBe("missing_evidence");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent package proof missing");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent benchmark runner proof missing");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent task fixture proof missing");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent replay command proof missing");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent fixed seed missing");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent signed evidence missing");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent score delta regression exceeded");
    expect(result.manifest.rows[0]?.issues).toContain("effect-autoagent replay pass rate below threshold");
    expect(result.ciReceipt.passed).toBe(false);
    expect(result.ciReceipt.failClosed).toBe(true);
    expect(result.ciReceipt.failedEffectAutoAgentReplayRowIds).toEqual(["effect-autoagent-metadata-only"]);
    expect(result.watchAlerts).toHaveLength(1);
    expect(result.watchAlerts[0]).toMatchObject({
      metricId: "effectAutoAgentReplayCorpus",
      severity: "critical",
      failedRowIds: ["effect-autoagent-metadata-only"],
    });

    const verification = verifyEffectAutoAgentReplayReceipt(result.manifest, {
      ...result.ciReceipt,
      manifestHash: "tampered",
    });
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain("manifest hash mismatch");
  });
});

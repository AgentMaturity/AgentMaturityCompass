import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import type { DiagnosticReport } from "../src/types.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { sha256Hex } from "../src/utils/hash.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { createValueSnapshot } from "../src/value/valueReports.js";
import { valueContractInitForApi, valueInitForApi, ingestValueWebhookForApi } from "../src/value/valueApi.js";
import {
  appendValueEvents,
  loadValuePolicy,
  readValueEvents,
  saveValuePolicy,
  saveValueSnapshot,
  valueSnapshotLatestPath,
  verifyValueSnapshotSignature
} from "../src/value/valueStore.js";
import { valueEventSchema, type ValueEvent } from "../src/value/valueEventSchema.js";
import { loadValueContract } from "../src/value/valueStore.js";
import { attributeValue } from "../src/value/valueAttribution.js";
import { tailTransparencyEntries } from "../src/transparency/logCli.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-value-engine-"));
  roots.push(dir);
  const _savedVaultPass = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "value-engine-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  valueInitForApi(dir);
  valueContractInitForApi({
    workspace: dir,
    scopeType: "AGENT",
    scopeId: "default",
    type: "code-agent"
  });
  return dir;
}

function scopeHash(scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  return sha256Hex(`${scopeType}:${scopeId}`).slice(0, 16);
}

function writeRunFixture(params: {
  workspace: string;
  runId: string;
  ts: number;
  integrity: number;
  observed: number;
  attested: number;
  selfReported: number;
  correlation: number;
}): void {
  const report: DiagnosticReport = {
    agentId: "default",
    runId: params.runId,
    ts: params.ts,
    windowStartTs: params.ts - 86_400_000,
    windowEndTs: params.ts,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: params.integrity,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 },
      { layerName: "Culture & Alignment", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 },
      { layerName: "Resilience", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 },
      { layerName: "Skills", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 4,
      supportedMaxLevel: 4,
      finalLevel: 4,
      confidence: params.integrity,
      evidenceEventIds: ["ev_fixture"],
      flags: [],
      narrative: "fixture"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: params.correlation,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: {
      observed: params.observed,
      attested: params.attested,
      selfReported: params.selfReported
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "fixture",
    reportJsonSha256: "fixture"
  };
  const runPath = join(params.workspace, ".amc", "agents", "default", "runs", `${params.runId}.json`);
  mkdirSync(join(params.workspace, ".amc", "agents", "default", "runs"), { recursive: true });
  writeFileSync(runPath, JSON.stringify(report, null, 2));
}

function observedEvent(params: {
  ts: number;
  kpiId: string;
  value: number;
  trust: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
}): ValueEvent {
  return valueEventSchema.parse({
    v: 1,
    eventId: `ve_${params.kpiId}_${params.ts}`,
    ts: params.ts,
    scope: {
      type: "AGENT",
      idHash: scopeHash("AGENT", "default")
    },
    kpiId: params.kpiId,
    value: params.value,
    unit: params.kpiId.includes("rate") ? "ratio" : "unit",
    source: {
      sourceId: "test.fixture",
      trustKind: params.trust,
      signatureValid: params.trust !== "SELF_REPORTED"
    },
    evidenceRefs: {
      runIds: [`default:run#${params.ts}`],
      correlationIds: [`default@corr-${params.ts}`],
      eventHashes: [sha256Hex(`${params.kpiId}:${params.ts}`)]
    },
    labels: {
      agentType: "code-agent",
      domain: "devtools",
      provider: "local",
      modelFamily: "local/mock"
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate port");
  }
  return addr.port;
}

async function httpRaw(params: {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  const bodyRaw = params.body === undefined ? "" : JSON.stringify(params.body);
  return await new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method,
        headers: {
          ...(bodyRaw.length > 0
            ? {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(bodyRaw))
              }
            : {}),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () =>
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.on("error", rejectPromise);
    if (bodyRaw.length > 0) {
      req.write(bodyRaw);
    }
    req.end();
  });
}

describe("value realization engine", () => {
  test("deterministic scoring creates byte-identical snapshot and valid signature", async () => {
    const nowTs = Date.UTC(2026, 0, 10, 12, 0, 0);
    const snapshotBytes = async (): Promise<{ workspace: string; bytes: string }> => {
      const workspace = newWorkspace();
      vi.useFakeTimers();
      vi.setSystemTime(nowTs);
      writeRunFixture({
        workspace,
        runId: "run_a",
        ts: nowTs - 3600_000,
        integrity: 0.98,
        observed: 0.95,
        attested: 0.04,
        selfReported: 0.01,
        correlation: 0.97
      });
      appendValueEvents(workspace, [
        observedEvent({ ts: nowTs - 40_000, kpiId: "cycle_time_hours", value: 6, trust: "OBSERVED" }),
        observedEvent({ ts: nowTs - 30_000, kpiId: "cost_usd", value: 120, trust: "OBSERVED" }),
        observedEvent({ ts: nowTs - 20_000, kpiId: "build_success_rate", value: 0.92, trust: "OBSERVED" })
      ]);
      await createValueSnapshot({
        workspace,
        scopeType: "AGENT",
        scopeId: "default",
        windowDays: 7,
        nowTs
      });
      expect(verifyValueSnapshotSignature(workspace, { type: "AGENT", id: "default" }).valid).toBe(true);
      return {
        workspace,
        bytes: readFileSync(valueSnapshotLatestPath(workspace, { type: "AGENT", id: "default" }), "utf8")
      };
    };

    const first = await snapshotBytes();
    const second = await snapshotBytes();
    expect(second.bytes).toBe(first.bytes);
  });

  test("evidence gates return INSUFFICIENT_EVIDENCE with null numeric outputs", async () => {
    const workspace = newWorkspace();
    const nowTs = Date.UTC(2026, 0, 12, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowTs);
    writeRunFixture({
      workspace,
      runId: "run_low_obs",
      ts: nowTs - 3600_000,
      integrity: 0.95,
      observed: 0.95,
      attested: 0.05,
      selfReported: 0,
      correlation: 0.96
    });
    appendValueEvents(workspace, [
      observedEvent({ ts: nowTs - 40_000, kpiId: "cycle_time_hours", value: 8, trust: "SELF_REPORTED" }),
      observedEvent({ ts: nowTs - 30_000, kpiId: "cost_usd", value: 180, trust: "SELF_REPORTED" })
    ]);

    const out = await createValueSnapshot({
      workspace,
      scopeType: "AGENT",
      scopeId: "default",
      windowDays: 7,
      nowTs
    });
    expect(out.snapshot.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(out.snapshot.valueDimensions.valueScore).toBeNull();
    expect(out.snapshot.economicSignificance.score).toBeNull();
    expect(out.snapshot.reasons.length).toBeGreaterThan(0);
  });

  test("webhook ingest accepts numeric payloads, labels trust, and rejects suspicious text", () => {
    const workspace = newWorkspace();
    const goodPayload = {
      v: 1,
      sourceId: "owner.webhook",
      scope: { type: "AGENT", id: "default" },
      events: [
        { ts: Date.now(), kpiId: "cycle_time_hours", value: 5.5, unit: "hours", labels: { domain: "devtools" } }
      ]
    };

    const selfOut = ingestValueWebhookForApi({
      workspace,
      payload: goodPayload,
      sourceTrust: "SELF_REPORTED"
    });
    expect(selfOut.ingested).toBe(1);
    const attestedOut = ingestValueWebhookForApi({
      workspace,
      payload: goodPayload,
      sourceTrust: "ATTESTED"
    });
    expect(attestedOut.ingested).toBe(1);

    const rows = readValueEvents({
      workspace,
      scope: { type: "AGENT", idHash: scopeHash("AGENT", "default") }
    });
    expect(rows.some((row) => row.source.trustKind === "SELF_REPORTED")).toBe(true);
    expect(rows.some((row) => row.source.trustKind === "ATTESTED")).toBe(true);

    expect(() =>
      ingestValueWebhookForApi({
        workspace,
        payload: {
          ...goodPayload,
          events: [{ ts: Date.now(), kpiId: "cycle_time_hours", value: 5, labels: { owner: "alice@example.com" } }]
        },
        sourceTrust: "SELF_REPORTED"
      })
    ).toThrow(/forbidden/i);
  });

  test("attribution uses correlation evidence and flags insufficient evidence when missing", () => {
    const workspace = newWorkspace();
    const contract = loadValueContract({
      workspace,
      agentId: "default"
    });
    const nowTs = Date.UTC(2026, 0, 15, 12, 0, 0);
    const withCorrelation = [
      observedEvent({ ts: nowTs - 5_000, kpiId: "cycle_time_hours", value: 4, trust: "OBSERVED" }),
      observedEvent({ ts: nowTs - 4_000, kpiId: "cycle_time_hours", value: 5, trust: "OBSERVED" })
    ];
    const ok = attributeValue({
      contract,
      kpiId: "cycle_time_hours",
      events: withCorrelation,
      startTs: nowTs - 60_000,
      endTs: nowTs
    });
    expect(ok.status).toBe("OK");
    expect(ok.attributedTo.length).toBeGreaterThan(0);

    const missing = withCorrelation.map((row) =>
      valueEventSchema.parse({
        ...row,
        evidenceRefs: {}
      })
    );
    const bad = attributeValue({
      contract,
      kpiId: "cycle_time_hours",
      events: missing,
      startTs: nowTs - 60_000,
      endTs: nowTs
    });
    expect(bad.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  test("value regression emits transparency VALUE_REGRESSION_DETECTED", async () => {
    const workspace = newWorkspace();
    const t1 = Date.UTC(2026, 1, 1, 12, 0, 0);
    const t2 = Date.UTC(2026, 1, 3, 12, 0, 0);
    vi.useFakeTimers();
    const policy = loadValuePolicy(workspace);
    policy.valuePolicy.evidenceGates.minIntegrityIndexForStrongClaims = 0;
    policy.valuePolicy.evidenceGates.minCorrelationRatioForStrongClaims = 0;
    policy.valuePolicy.evidenceGates.minObservedShareForStrongClaims = 0;
    policy.valuePolicy.evidenceGates.maxSelfReportedShare = 1;
    saveValuePolicy(workspace, policy);
    vi.setSystemTime(t1);
    writeRunFixture({
      workspace,
      runId: "run_for_regression_1",
      ts: t1 - 3600_000,
      integrity: 0.97,
      observed: 0.95,
      attested: 0.03,
      selfReported: 0.02,
      correlation: 0.97
    });

    appendValueEvents(workspace, [
      observedEvent({ ts: t1 - 5_000, kpiId: "cycle_time_hours", value: 2, trust: "OBSERVED" }),
      observedEvent({ ts: t1 - 4_000, kpiId: "cost_usd", value: 50, trust: "OBSERVED" })
    ]);
    await createValueSnapshot({
      workspace,
      scopeType: "AGENT",
      scopeId: "default",
      windowDays: 1,
      nowTs: t1
    });
    saveValueSnapshot(workspace, {
      v: 1,
      generatedTs: t1,
      scope: {
        type: "AGENT",
        id: "default"
      },
      status: "OK",
      reasons: [],
      gates: {
        integrityIndex: 0.97,
        correlationRatio: 0.97,
        observedShare: 0.95,
        selfReportedShare: 0.05
      },
      baselines: {
        windowDays: 1,
        startTs: t1 - 86_400_000,
        endTs: t1
      },
      kpis: [
        {
          kpiId: "cost_usd",
          normalizedScore: 99,
          baselineValue: null,
          currentValue: 50,
          delta: null,
          trustKindSummary: {
            observed: 1,
            attested: 0,
            selfReported: 0
          },
          evidenceRefsCount: 1
        }
      ],
      valueDimensions: {
        emotional: 88,
        functional: 90,
        economic: 94,
        brand: 87,
        lifetime: 89,
        valueScore: 90
      },
      economicSignificance: {
        score: 91,
        risk: 12,
        reasons: []
      },
      attributionSummary: {
        status: "OK",
        method: "LAST_TOUCH",
        entries: []
      },
      notes: []
    });

    vi.setSystemTime(t2);
    writeRunFixture({
      workspace,
      runId: "run_for_regression_2",
      ts: t2 - 3600_000,
      integrity: 0.97,
      observed: 0.95,
      attested: 0.03,
      selfReported: 0.02,
      correlation: 0.97
    });
    appendValueEvents(workspace, [
      observedEvent({ ts: t2 - 5_000, kpiId: "cycle_time_hours", value: 160, trust: "OBSERVED" }),
      observedEvent({ ts: t2 - 4_000, kpiId: "cost_usd", value: 4000, trust: "OBSERVED" })
    ]);
    const second = await createValueSnapshot({
      workspace,
      scopeType: "AGENT",
      scopeId: "default",
      windowDays: 1,
      nowTs: t2
    });
    expect(second.regressionDetected).toBe(true);
    const tail = tailTransparencyEntries(workspace, 40);
    expect(tail.some((row) => row.type === "VALUE_REGRESSION_DETECTED")).toBe(true);
  });

  test("value console pages serve, avoid CDN refs, and avoid obvious secret patterns", async () => {
    const workspace = newWorkspace();
    const port = await pickPort();
    const runtime = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-token"
    });
    try {
      const paths = [
        "/console/value.html",
        "/console/valueAgent.html",
        "/console/valueKpis.html",
        "/console/assets/value.js",
        "/console/assets/valueAgent.js",
        "/console/assets/valueKpis.js"
      ];
      for (const path of paths) {
        const response = await httpRaw({
          url: `${runtime.url}${path}`,
          method: "GET"
        });
        expect(response.status).toBe(200);
        expect(response.body).not.toMatch(/https?:\/\/(cdn|unpkg|jsdelivr|cdnjs)/i);
        expect(response.body).not.toMatch(/BEGIN PRIVATE KEY|Bearer\s+[A-Za-z0-9_\-\.]+|sk-[A-Za-z0-9]+|AIza[0-9A-Za-z\-_]+/);
      }
    } finally {
      await runtime.close();
    }
  });
});

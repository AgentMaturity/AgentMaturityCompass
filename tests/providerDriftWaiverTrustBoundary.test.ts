import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { handleBenchmarkRoute } from "../src/api/benchmarkRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";
import { runHelmProviderDrift } from "../src/benchmarks/helmProviderDrift.js";
import { runHumanloopProviderDrift } from "../src/benchmarks/humanloopProviderDrift.js";
import { runInspectProviderDrift } from "../src/benchmarks/inspectProviderDrift.js";
import { runPatronusProviderDrift } from "../src/benchmarks/patronusProviderDrift.js";
import { runPromptLayerProviderDrift } from "../src/benchmarks/promptLayerProviderDrift.js";
import { runPromptfooProviderDrift } from "../src/benchmarks/promptfooProviderDrift.js";
import {
  normalizeProviderDriftEvidenceRefs,
  runProviderDriftBenchmark,
  type ProviderDriftBenchmarkReport,
  type ProviderDriftCanaryRow,
  type ProviderDriftWaiver,
} from "../src/benchmarks/providerDriftBenchmark.js";
import { runTensorZeroProviderDrift } from "../src/benchmarks/tensorZeroProviderDrift.js";

const NOW = new Date("2026-07-29T00:00:00.000Z");

const baseline: ProviderDriftCanaryRow = {
  provider: "trust-boundary-provider",
  model: "trust-boundary-model",
  version: "v1",
  canaryId: "waiver-evidence-normalization",
  sampleSize: 10,
  scoreMean0to1: 0.95,
  refusalRate0to1: 0.01,
  latencyMsP95: 100,
  costUsdMean: 0.001,
  evidenceRefs: ["trace:baseline"],
  signedEvidenceRefs: ["ledger:baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "v2",
  scoreMean0to1: 0.5,
  evidenceRefs: ["trace:candidate"],
  signedEvidenceRefs: ["ledger:candidate"],
};

function waiver(evidenceRefs: unknown): ProviderDriftWaiver {
  return {
    waiverId: "waiver-trust-boundary",
    provider: baseline.provider,
    model: baseline.model,
    canaryId: baseline.canaryId,
    reason: "Exercise untrusted waiver evidence normalization.",
    approvedBy: "security-review",
    expiresAt: "2099-01-01T00:00:00.000Z",
    evidenceRefs: evidenceRefs as string[],
  };
}

const malformedWaiverCases: Array<{ name: string; value: unknown }> = [
  {
    name: "non-array container",
    value: waiver(["waiver:proof"]),
  },
  {
    name: "null and non-object entries",
    value: [null, 42, "waiver", false],
  },
  {
    name: "invalid expiration",
    value: [{ ...waiver(["waiver:proof"]), expiresAt: "not-a-date" }],
  },
  {
    name: "non-array metric IDs",
    value: [{ ...waiver(["waiver:proof"]), metricIds: "scoreMean0to1" }],
  },
  {
    name: "non-array evidence references",
    value: [{ ...waiver(["waiver:proof"]), evidenceRefs: "waiver:proof" }],
  },
  {
    name: "missing approval metadata",
    value: [{ ...waiver(["waiver:proof"]), approvedBy: "   " }],
  },
];

interface ProviderAdapterCase {
  name: string;
  run: (evidenceRefs: unknown) => ProviderDriftBenchmarkReport;
}

interface ProviderWrapperRunOptions {
  baseline?: ProviderDriftCanaryRow[];
  candidate?: ProviderDriftCanaryRow[];
  waivers?: unknown;
}

interface ProviderWrapperCase {
  name: string;
  adapterMetricId: "evaluationFrameworkEvidence" | "observabilityPipelineEvidence";
  watchPath: string;
  run: (options?: ProviderWrapperRunOptions) => ProviderDriftBenchmarkReport;
  apiBody: (options?: ProviderWrapperRunOptions) => Record<string, unknown>;
}

const stableCandidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "v2",
};

function wrapperRows(options?: ProviderWrapperRunOptions): {
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
} {
  return {
    baseline: options?.baseline ?? [baseline],
    candidate: options?.candidate ?? [stableCandidate],
  };
}

const providerWrappers: ProviderWrapperCase[] = [
  {
    name: "HELM",
    adapterMetricId: "evaluationFrameworkEvidence",
    watchPath: "/api/v1/watch/helm-provider-drift",
    run: (options) => runHelmProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      helm: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      helm: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
  {
    name: "Humanloop",
    adapterMetricId: "observabilityPipelineEvidence",
    watchPath: "/api/v1/watch/humanloop-provider-drift",
    run: (options) => runHumanloopProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      humanloop: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      humanloop: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
  {
    name: "Inspect",
    adapterMetricId: "evaluationFrameworkEvidence",
    watchPath: "/api/v1/watch/inspect-provider-drift",
    run: (options) => runInspectProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      inspect: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      inspect: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
  {
    name: "Patronus",
    adapterMetricId: "evaluationFrameworkEvidence",
    watchPath: "/api/v1/watch/patronus-provider-drift",
    run: (options) => runPatronusProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      patronus: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      patronus: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
  {
    name: "PromptLayer",
    adapterMetricId: "observabilityPipelineEvidence",
    watchPath: "/api/v1/watch/provider-drift",
    run: (options) => runPromptLayerProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      promptLayer: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      promptLayer: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
  {
    name: "promptfoo",
    adapterMetricId: "evaluationFrameworkEvidence",
    watchPath: "/api/v1/watch/promptfoo-provider-drift",
    run: (options) => runPromptfooProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      promptfoo: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      promptfoo: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
  {
    name: "TensorZero",
    adapterMetricId: "evaluationFrameworkEvidence",
    watchPath: "/api/v1/watch/tensorzero-provider-drift",
    run: (options) => runTensorZeroProviderDrift({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      tensorZero: { baseline: [], candidate: [] },
      waivers: options?.waivers as ProviderDriftWaiver[] | undefined,
      now: NOW,
    }).report,
    apiBody: (options) => ({
      agentId: "trust-boundary-agent",
      ...wrapperRows(options),
      tensorZero: { baseline: [], candidate: [] },
      waivers: options?.waivers,
    }),
  },
];

const providerAdapters: ProviderAdapterCase[] = [
  {
    name: "generic",
    run: (evidenceRefs) => runProviderDriftBenchmark({
      agentId: "trust-boundary-agent",
      baseline: [baseline],
      candidate: [candidate],
      waivers: [waiver(evidenceRefs)],
      now: NOW,
    }),
  },
  ...providerWrappers.map(({ name, run }) => ({
    name,
    run: (evidenceRefs: unknown) => run({
      baseline: [baseline],
      candidate: [candidate],
      waivers: [waiver(evidenceRefs)],
    }),
  })),
];

function mockRequest(body: unknown, url = "/api/v1/benchmarks/provider-drift"): IncomingMessage {
  const payload = JSON.stringify(body);
  const req = Readable.from([Buffer.from(payload, "utf8")]) as unknown as IncomingMessage;
  (req as { method?: string }).method = "POST";
  (req as { url?: string }).url = url;
  return req;
}

function mockResponse(): {
  res: ServerResponse;
  state: { statusCode: number; body: string };
} {
  const state = { statusCode: 0, body: "" };
  const res = {
    writeHead: (statusCode: number) => {
      state.statusCode = statusCode;
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  return { res, state };
}

describe("provider drift waiver evidence trust boundary", () => {
  test.each([
    undefined,
    null,
    42,
    "not-an-array",
    {},
    [undefined, null, 42, {}, "", "   "],
  ])("normalizes malformed evidence references to an empty list", (value) => {
    expect(normalizeProviderDriftEvidenceRefs(value)).toEqual([]);
  });

  test("keeps normalized, unique string references from a mixed array", () => {
    expect(normalizeProviderDriftEvidenceRefs([
      null,
      42,
      "  waiver:proof  ",
      {},
      "waiver:proof",
      "",
    ])).toEqual(["waiver:proof"]);
  });

  test("direct runner fails closed for malformed baseline and candidate evidence arrays", () => {
    const report = runProviderDriftBenchmark({
      agentId: "trust-boundary-agent",
      baseline: [{
        ...baseline,
        evidenceRefs: [null, 42, {}, "", "   "] as unknown as string[],
        signedEvidenceRefs: "not-an-array" as unknown as string[],
      }],
      candidate: [{
        ...candidate,
        evidenceRefs: { ref: "not-an-array" } as unknown as string[],
        signedEvidenceRefs: [undefined, null, 42, " "] as unknown as string[],
      }],
      now: NOW,
    });

    expect(report.comparisons[0]?.evidenceRefs).toEqual([]);
    expect(report.comparisons[0]?.signedEvidenceRefs).toEqual([]);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "evidenceRefs",
      "signedEvidenceRefs",
    ]));
    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
  });

  test("direct runner keeps valid normalized row references from mixed arrays", () => {
    const report = runProviderDriftBenchmark({
      agentId: "trust-boundary-agent",
      baseline: [{
        ...baseline,
        evidenceRefs: [null, "  trace:baseline  ", 42, ""] as unknown as string[],
        signedEvidenceRefs: { ref: "not-an-array" } as unknown as string[],
      }],
      candidate: [{
        ...candidate,
        evidenceRefs: "not-an-array" as unknown as string[],
        signedEvidenceRefs: [undefined, "  ledger:candidate  ", {}] as unknown as string[],
      }],
      now: NOW,
    });

    expect(report.comparisons[0]?.evidenceRefs).toEqual(["trace:baseline"]);
    expect(report.comparisons[0]?.signedEvidenceRefs).toEqual(["ledger:candidate"]);
    expect(report.alerts.map((alert) => alert.metricId)).not.toContain("evidenceRefs");
    expect(report.alerts.map((alert) => alert.metricId)).not.toContain("signedEvidenceRefs");
  });

  test.each(malformedWaiverCases)(
    "direct runner ignores $name without suppressing alerts",
    ({ value }) => {
      const report = runProviderDriftBenchmark({
        agentId: "trust-boundary-agent",
        baseline: [baseline],
        candidate: [candidate],
        waivers: value as ProviderDriftWaiver[],
        now: NOW,
      });

      expect(report.waivers).toEqual([]);
      expect(report.alerts.length).toBeGreaterThan(0);
      expect(report.alerts.every((alert) => alert.waived === false)).toBe(true);
      expect(report.recommendation).toBe("alert");
      expect(report.failClosed).toBe(true);
    },
  );

  test.each(providerAdapters)(
    "$name fails closed without throwing for mixed invalid waiver evidence",
    ({ run }) => {
      const report = run([undefined, null, 42, {}, "", "   "]);

      expect(report.alerts.length).toBeGreaterThan(0);
      expect(report.alerts.every((alert) => alert.waived === false)).toBe(true);
      expect(report.recommendation).toBe("alert");
      expect(report.failClosed).toBe(true);
    },
  );

  test.each(providerAdapters)(
    "$name accepts a normalized evidence reference from a mixed array",
    ({ run }) => {
      const report = run([null, 42, "  waiver:proof  ", {}, "", "waiver:proof"]);

      expect(report.alerts.length).toBeGreaterThan(0);
      expect(report.alerts.every((alert) => alert.waived === true)).toBe(true);
      expect(report.recommendation).toBe("waive");
      expect(report.failClosed).toBe(false);
    },
  );

  test.each(providerWrappers)(
    "$name ignores malformed waiver containers and entries without throwing",
    ({ run, adapterMetricId }) => {
      for (const waivers of [
        waiver(["waiver:proof"]),
        [null, 42, "waiver", false],
      ]) {
        const report = run({ waivers });
        const alert = report.alerts.find((item) =>
          item.metricId === adapterMetricId && item.alertId.endsWith("MetadataEvidence")
        );

        expect(report.waivers).toEqual([]);
        expect(alert).toBeDefined();
        expect(alert?.waived).toBe(false);
        expect(report.recommendation).toBe("alert");
        expect(report.failClosed).toBe(true);
      }
    },
  );

  test.each(providerWrappers)(
    "$name rejects string metricIds instead of substring-matching an adapter alert",
    ({ run, adapterMetricId }) => {
      const report = run({
        waivers: [{
          ...waiver(["waiver:proof"]),
          metricIds: adapterMetricId,
        }],
      });
      const alert = report.alerts.find((item) =>
        item.metricId === adapterMetricId && item.alertId.endsWith("MetadataEvidence")
      );

      expect(report.waivers).toEqual([]);
      expect(alert).toBeDefined();
      expect(alert?.waived).toBe(false);
      expect(alert?.waiverId).toBeUndefined();
      expect(report.recommendation).toBe("alert");
      expect(report.failClosed).toBe(true);
    },
  );

  test.each(providerWrappers)(
    "$name normalizes malformed baseline and candidate adapter evidence",
    ({ run, adapterMetricId }) => {
      const candidateReport = run({
        baseline: [{
          ...baseline,
          evidenceRefs: [null, "  trace:baseline-valid  ", 42, {}] as unknown as string[],
          signedEvidenceRefs: { ref: "not-an-array" } as unknown as string[],
        }],
        candidate: [{
          ...stableCandidate,
          evidenceRefs: { ref: "not-an-array" } as unknown as string[],
          signedEvidenceRefs: [null, "  ledger:candidate-valid  ", {}] as unknown as string[],
        }],
      });
      const candidateAlert = candidateReport.alerts.find((item) =>
        item.metricId === adapterMetricId && item.alertId.endsWith("MetadataEvidence")
      );

      expect(candidateReport.comparisons[0]?.evidenceRefs).toEqual(["trace:baseline-valid"]);
      expect(candidateReport.comparisons[0]?.signedEvidenceRefs).toEqual(["ledger:candidate-valid"]);
      expect(candidateAlert).toBeDefined();
      expect(candidateAlert?.evidenceRefs.every((item) => typeof item === "string")).toBe(true);

      const baselineReport = run({
        baseline: [{
          ...baseline,
          evidenceRefs: { ref: "not-an-array" } as unknown as string[],
          signedEvidenceRefs: [null, "  ledger:baseline-valid  ", {}] as unknown as string[],
        }],
        candidate: [],
      });
      const baselineAlert = baselineReport.alerts.find((item) =>
        item.metricId === adapterMetricId && item.alertId.endsWith("MetadataEvidence")
      );

      expect(baselineReport.comparisons[0]?.evidenceRefs).toEqual([]);
      expect(baselineReport.comparisons[0]?.signedEvidenceRefs).toEqual(["ledger:baseline-valid"]);
      expect(baselineAlert).toBeDefined();
      expect(baselineAlert?.evidenceRefs.every((item) => typeof item === "string")).toBe(true);
      expect(baselineReport.failClosed).toBe(true);
    },
  );

  test.each(providerWrappers)(
    "$name Watch API fails closed for malformed wrapper waiver and evidence inputs",
    async ({ adapterMetricId, apiBody, watchPath }) => {
      const req = mockRequest(apiBody({
        baseline: [{
          ...baseline,
          evidenceRefs: [null, "  trace:baseline-valid  ", 42, {}] as unknown as string[],
          signedEvidenceRefs: { ref: "not-an-array" } as unknown as string[],
        }],
        candidate: [{
          ...stableCandidate,
          evidenceRefs: { ref: "not-an-array" } as unknown as string[],
          signedEvidenceRefs: [null, "  ledger:candidate-valid  ", {}] as unknown as string[],
        }],
        waivers: [{
          ...waiver(["waiver:proof"]),
          metricIds: adapterMetricId,
        }],
      }), watchPath);
      const { res, state } = mockResponse();

      const handled = await handleWatchRoute(watchPath, "POST", req, res, process.cwd());
      const payload = JSON.parse(state.body);
      const alert = payload.data.report.alerts.find((item: {
        alertId: string;
        metricId: string;
      }) => item.metricId === adapterMetricId && item.alertId.endsWith("MetadataEvidence"));

      expect(handled).toBe(true);
      expect(state.statusCode).toBe(200);
      expect(payload.data.report.waivers).toEqual([]);
      expect(payload.data.report.comparisons[0].evidenceRefs).toEqual(["trace:baseline-valid"]);
      expect(payload.data.report.comparisons[0].signedEvidenceRefs).toEqual(["ledger:candidate-valid"]);
      expect(alert).toMatchObject({ waived: false });
      expect(payload.data.report.recommendation).toBe("alert");
      expect(payload.data.report.failClosed).toBe(true);
    },
  );

  test("provider-drift API returns a fail-closed report for malformed evidence values", async () => {
    const req = mockRequest({
      agentId: "trust-boundary-agent",
      baseline: [baseline],
      candidate: [candidate],
      waivers: [waiver([null, 42, {}, "", "   "])],
    });
    const { res, state } = mockResponse();

    const handled = await handleBenchmarkRoute(
      "/api/v1/benchmarks/provider-drift",
      "POST",
      req,
      res,
      process.cwd(),
    );
    const payload = JSON.parse(state.body);

    expect(handled).toBe(true);
    expect(state.statusCode).toBe(200);
    expect(payload.data.report.recommendation).toBe("alert");
    expect(payload.data.report.failClosed).toBe(true);
    expect(payload.data.report.alerts.every((alert: { waived: boolean }) => alert.waived === false)).toBe(true);
  });

  test("provider-drift API fails closed instead of throwing for malformed row evidence arrays", async () => {
    const req = mockRequest({
      agentId: "trust-boundary-agent",
      baseline: [{
        ...baseline,
        evidenceRefs: [null, 42, {}, "", "   "],
        signedEvidenceRefs: "not-an-array",
      }],
      candidate: [{
        ...candidate,
        evidenceRefs: { ref: "not-an-array" },
        signedEvidenceRefs: [undefined, null, 42, " "],
      }],
    });
    const { res, state } = mockResponse();

    const handled = await handleBenchmarkRoute(
      "/api/v1/benchmarks/provider-drift",
      "POST",
      req,
      res,
      process.cwd(),
    );
    const payload = JSON.parse(state.body);

    expect(handled).toBe(true);
    expect(state.statusCode).toBe(200);
    expect(payload.data.report.comparisons[0].evidenceRefs).toEqual([]);
    expect(payload.data.report.comparisons[0].signedEvidenceRefs).toEqual([]);
    expect(payload.data.report.alerts.map((alert: { metricId: string }) => alert.metricId)).toEqual(
      expect.arrayContaining(["evidenceRefs", "signedEvidenceRefs"]),
    );
    expect(payload.data.report.recommendation).toBe("alert");
    expect(payload.data.report.failClosed).toBe(true);
  });

  test.each(malformedWaiverCases)(
    "provider-drift API ignores $name without returning 500",
    async ({ value }) => {
      const req = mockRequest({
        agentId: "trust-boundary-agent",
        baseline: [baseline],
        candidate: [candidate],
        waivers: value,
      });
      const { res, state } = mockResponse();

      const handled = await handleBenchmarkRoute(
        "/api/v1/benchmarks/provider-drift",
        "POST",
        req,
        res,
        process.cwd(),
      );
      const payload = JSON.parse(state.body);

      expect(handled).toBe(true);
      expect(state.statusCode).toBe(200);
      expect(payload.data.report.waivers).toEqual([]);
      expect(payload.data.report.alerts.length).toBeGreaterThan(0);
      expect(payload.data.report.alerts.every((alert: { waived: boolean }) => alert.waived === false)).toBe(true);
      expect(payload.data.report.recommendation).toBe("alert");
      expect(payload.data.report.failClosed).toBe(true);
    },
  );
});

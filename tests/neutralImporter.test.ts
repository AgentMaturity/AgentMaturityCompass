import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import YAML from "yaml";
import { describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { latestEnforceResourceManifestPath, loadEnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import { listEpisodeRecords } from "../src/lifecycle/episodeRecord.js";
import { listLifecycleRunArtifacts } from "../src/lifecycle/lifecycleRunArtifact.js";
import { listRuntimeRunEvents } from "../src/runtime/runManager.js";
import {
  rollbackNeutralImport,
  runNeutralImport,
  validateNeutralImport
} from "../src/importers/neutralImporter.js";
import { listTraceFailureIndexes } from "../src/watch/traceFailureIndex.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function representativeImportDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-neutral-import-input-"));
  writeFileSync(
    join(dir, "traces.jsonl"),
    [
      JSON.stringify({
        traceId: "trace-safe",
        agentId: "default",
        agentType: "assistant",
        input: "Summarize policy",
        output: "Policy summary",
        durationMs: 42,
        timestamp: Date.UTC(2026, 4, 22, 10, 0, 0),
        metadata: { model: "local-test" }
      }),
      JSON.stringify({
        traceId: "trace-secret",
        agentId: "default",
        agentType: "assistant",
        input: "token: sk-testsecret123456",
        output: "tool timeout after secret token: sk-testsecret123456",
        durationMs: 99,
        timestamp: Date.UTC(2026, 4, 22, 10, 1, 0),
        error: true,
        errorMessage: "timeout with token sk-testsecret123456",
        metadata: { tool: "search" }
      })
    ].join("\n"),
    "utf8"
  );
  writeJson(join(dir, "workflow.json"), {
    nodes: [{ id: "planner", type: "agent" }, { id: "worker", type: "agent" }],
    edges: [{ from: "planner", to: "worker", contract: "handoff" }]
  });
  writeFileSync(
    join(dir, "agent.yaml"),
    YAML.stringify({
      agent: { id: "default", role: "support" },
      model: { provider: "local", name: "test" },
      tools: [{ name: "search", permission: "read" }]
    }),
    "utf8"
  );
  writeJson(join(dir, "memory.json"), {
    memories: [
      { id: "m1", text: "Customer prefers concise answers" },
      { id: "m2", text: "api_key: secret1234567890" }
    ]
  });
  writeJson(join(dir, "eval.json"), {
    suite: "safety",
    results: [
      { name: "prompt hygiene", score: 0.9, passed: true },
      { name: "tool timeout", score: 0.3, passed: false, error: "timeout" }
    ]
  });
  writeJson(join(dir, "benchmark.json"), {
    benchmark: "latency",
    metrics: { p50Ms: 100, p95Ms: 220, passRate: 0.95 },
    samples: [{ name: "case-a", durationMs: 100 }]
  });
  return dir;
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; headers: Record<string, string>; body: string } } {
  const state = { statusCode: 200, headers: {} as Record<string, string>, body: "" };
  const res = {
    setHeader: (key: string, value: string) => { state.headers[key] = value; },
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      if (headers) Object.assign(state.headers, headers);
    },
    end: (chunk?: string | Buffer) => {
      if (chunk) state.body += chunk.toString();
    }
  } as unknown as ServerResponse;
  return { res, state };
}

describe("neutral importer", () => {
  test("dry run detects representative artifact categories without writing", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-ws-"));
    const inputPath = representativeImportDir();
    try {
      const result = runNeutralImport({
        workspace,
        inputPath,
        agentId: "default",
        mode: "dry-run"
      });

      expect(result.applied).toBe(false);
      expect(result.plan.status).toBe("ready");
      expect(result.plan.candidates.map((candidate) => candidate.category).sort()).toEqual([
        "agent-config",
        "benchmark-result",
        "eval-output",
        "memory-store",
        "trace-jsonl",
        "workflow-graph"
      ]);
      expect(existsSync(join(workspace, ".amc", "imports"))).toBe(false);
      expect(result.plan.redactionCount).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });

  test("import writes redacted episode, manifest, lifecycle, and trace-index records", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-apply-"));
    const inputPath = representativeImportDir();
    try {
      const result = runNeutralImport({
        workspace,
        inputPath,
        agentId: "default",
        mode: "import"
      });

      expect(result.applied).toBe(true);
      expect(result.normalizedPath).toBeTruthy();
      expect(result.episode?.episode.source).toBe("import");
      expect(result.lifecycleRun?.artifact.source).toBe("import");
      expect(result.traceFailureIndex?.ref.entryCount).toBeGreaterThan(0);
      expect(result.resourceManifest?.manifest.resourceCount).toBeGreaterThan(0);

      const normalized = readFileSync(result.normalizedPath!, "utf8");
      expect(normalized).toContain("[REDACTED]");
      expect(normalized).not.toContain("sk-testsecret123456");
      expect(normalized).not.toContain("secret1234567890");

      const episodes = listEpisodeRecords({ workspace, agentId: "default" });
      const lifecycleRuns = listLifecycleRunArtifacts({ workspace, agentId: "default" });
      const traceIndexes = listTraceFailureIndexes({ workspace, agentId: "default", redacted: true });
      const manifest = loadEnforceResourceManifest(latestEnforceResourceManifestPath(workspace, "default"));

      expect(episodes.some((episode) => episode.episodeId === result.episode?.episode.episodeId)).toBe(true);
      expect(lifecycleRuns.some((run) => run.lifecycleRunId === result.lifecycleRun?.artifact.lifecycleRunId)).toBe(true);
      expect(traceIndexes.some((index) => index.indexId === result.traceFailureIndex?.ref.indexId)).toBe(true);
      expect(manifest.resources.some((resource) => resource.path.startsWith(".amc/imports/runs"))).toBe(true);
      expect(JSON.stringify(traceIndexes)).not.toContain("sk-testsecret123456");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });

  test("normalizes imported evidence trust coverage shares", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-trust-"));
    const inputPath = representativeImportDir();
    try {
      const result = runNeutralImport({
        workspace,
        inputPath,
        agentId: "default",
        mode: "import"
      });

      expect(result.diagnosticReportPath).toBeTruthy();
      const report = JSON.parse(readFileSync(result.diagnosticReportPath!, "utf8")) as {
        evidenceCoverage: number;
        evidenceTrustCoverage: { observed: number; attested: number; selfReported: number };
      };
      expect(report.evidenceCoverage).toBe(1);
      expect(report.evidenceTrustCoverage.observed).toBeGreaterThanOrEqual(0);
      expect(report.evidenceTrustCoverage.observed).toBeLessThanOrEqual(1);
      expect(report.evidenceTrustCoverage.attested).toBe(0);
      expect(report.evidenceTrustCoverage.selfReported).toBe(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });

  test("collaboration records import as telemetry-only runtime events linked to lifecycle evidence", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-collab-"));
    const inputPath = mkdtempSync(join(tmpdir(), "amc-neutral-import-collab-input-"));
    writeJson(join(inputPath, "collaboration.json"), {
      runId: "outside-run-1",
      collaborationEvents: [
        {
          event: "handoff",
          fromAgent: "planner",
          toAgent: "worker",
          traceId: "trace-handoff-1",
          message: "handoff with token sk-collabsecret123456"
        }
      ]
    });
    try {
      const result = runNeutralImport({
        workspace,
        inputPath,
        agentId: "default",
        mode: "import"
      });

      expect(result.applied).toBe(true);
      expect(result.plan.categories).toContain("event-log");
      expect(result.plan.warnings.join("\n")).toContain("telemetry-only runtime events");
      expect(result.collaborationTelemetryEvents).toHaveLength(1);
      expect(result.lifecycleRun?.artifact.evidence.runtimeRuns).toHaveLength(1);
      expect(result.lifecycleRun?.artifact.evidence.runtimeRuns[0]?.eventCount).toBe(2);

      const events = listRuntimeRunEvents({
        workspace,
        agentId: "default",
        runId: result.importId,
        redacted: true
      });
      const telemetry = events.find((event) => event.eventId === result.collaborationTelemetryEvents[0]?.eventId);
      expect(telemetry?.type).toBe("trace.received");
      expect(telemetry?.stage).toBe("collaboration.telemetry");
      expect(telemetry?.payloadPreview).toContain("telemetry-only");
      expect(telemetry?.payloadPreview).toContain("[REDACTED]");
      expect(telemetry?.payloadPreview).not.toContain("sk-collabsecret123456");
      expect(result.writtenPaths.some((path) => path.includes("runtime-runs"))).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });

  test("unsupported formats return actionable validation errors", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-invalid-"));
    const inputPath = mkdtempSync(join(tmpdir(), "amc-neutral-import-unsupported-"));
    writeFileSync(join(inputPath, "notes.txt"), "plain notes without structured run data", "utf8");
    try {
      const validation = validateNeutralImport({ workspace, inputPath, agentId: "default" });
      expect(validation.status).toBe("unsupported");
      expect(validation.unsupported[0]?.reason).toContain("Add JSON, JSONL, YAML");
      expect(() => runNeutralImport({ workspace, inputPath, agentId: "default", mode: "import" })).toThrow(/Unsupported import/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });

  test("rollback removes imported artifacts and records a rollback receipt", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-rollback-"));
    const inputPath = representativeImportDir();
    try {
      const imported = runNeutralImport({ workspace, inputPath, agentId: "default", mode: "import" });
      expect(imported.importId).toBeTruthy();
      const normalizedPath = imported.normalizedPath!;
      expect(existsSync(normalizedPath)).toBe(true);

      const rollback = rollbackNeutralImport({ workspace, importId: imported.importId });
      expect(rollback.removed.some((entry) => entry.path === normalizedPath && entry.status === "removed")).toBe(true);
      expect(existsSync(normalizedPath)).toBe(false);
      expect(existsSync(rollback.receiptPath)).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });

  test("API exposes dry-run import detection", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-neutral-import-api-"));
    const inputPath = representativeImportDir();
    try {
      const response = mockRes();
      const handled = await handleApiRoute(
        "/api/v1/imports/dry-run",
        "POST",
        mockReq("POST", "/api/v1/imports/dry-run", { inputPath, agentId: "default" }),
        response.res,
        workspace
      );

      expect(handled).toBe(true);
      expect(response.state.statusCode).toBe(200);
      const body = JSON.parse(response.state.body) as { ok: boolean; data: { plan: { candidates: Array<{ category: string }> } } };
      expect(body.ok).toBe(true);
      expect(body.data.plan.candidates.some((candidate) => candidate.category === "trace-jsonl")).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(inputPath, { recursive: true, force: true });
    }
  });
});

import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson, queryParam } from "./apiHelpers.js";
import {
  appendRuntimeRunEvent,
  cancelRuntimeRun,
  completeRuntimeRun,
  createRuntimeRun,
  exportRuntimeRunEvents,
  inspectRuntimeRun,
  listRuntimeRuns,
  markRuntimeRunDegraded,
  resumeRuntimeRun,
  runtimeRunStatus,
  type RuntimeRunEventType,
  type RuntimeRunSeverity,
  type RuntimeRunSource
} from "../runtime/runManager.js";

function numericLimit(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSource(value: unknown): RuntimeRunSource {
  if (
    value === "cli" ||
    value === "studio" ||
    value === "api" ||
    value === "gateway" ||
    value === "bridge" ||
    value === "sdk" ||
    value === "watch" ||
    value === "fleet" ||
    value === "firewall"
  ) {
    return value;
  }
  return "api";
}

function parseSeverity(value: unknown): RuntimeRunSeverity {
  if (value === "info" || value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  return "info";
}

function parseEventType(value: unknown): RuntimeRunEventType {
  const allowed: RuntimeRunEventType[] = [
    "run.started",
    "stage.changed",
    "trace.received",
    "score.updated",
    "policy.decision",
    "alert.raised",
    "receipt.written",
    "candidate.proposed",
    "commit.applied",
    "rollback.applied",
    "run.resumed",
    "run.degraded",
    "run.canceled",
    "run.completed"
  ];
  if (typeof value === "string" && allowed.includes(value as RuntimeRunEventType)) {
    return value as RuntimeRunEventType;
  }
  throw new Error(`event type must be one of: ${allowed.join(", ")}`);
}

function exportPath(workspace: string, requested: unknown): string {
  const root = resolve(workspace);
  const raw = typeof requested === "string" && requested.trim().length > 0
    ? requested.trim()
    : ".amc/runtime-runs/events.jsonl";
  const out = resolve(root, raw);
  if (out !== root && !out.startsWith(`${root}/`)) {
    throw new Error("export path must stay inside the workspace");
  }
  return out;
}

export async function handleRuntimeRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/runtime")) return false;

  if (pathname === "/api/v1/runtime/status" && method === "GET") {
    const agentId = queryParam(req.url ?? "", "agentId") ?? undefined;
    apiSuccess(res, runtimeRunStatus(workspace, agentId));
    return true;
  }

  if (pathname === "/api/v1/runtime/runs" && method === "GET") {
    try {
      const agentId = queryParam(req.url ?? "", "agentId") ?? undefined;
      const limit = numericLimit(queryParam(req.url ?? "", "limit"), 25);
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const runs = listRuntimeRuns({ workspace, agentId, limit, redacted });
      apiSuccess(res, { runs, total: runs.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "could not list runtime runs");
    }
    return true;
  }

  if (pathname === "/api/v1/runtime/runs" && method === "POST") {
    try {
      const body = await bodyJson<{
        agentId?: string;
        runId?: string;
        episodeId?: string;
        lifecycleRunId?: string;
        source?: RuntimeRunSource;
        stage?: string;
        message?: string;
      }>(req);
      const created = createRuntimeRun({
        workspace,
        agentId: body.agentId,
        runId: body.runId,
        episodeId: body.episodeId,
        lifecycleRunId: body.lifecycleRunId,
        source: parseSource(body.source ?? "api"),
        stage: body.stage,
        message: body.message
      });
      apiSuccess(res, created, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "could not create runtime run");
    }
    return true;
  }

  if (pathname === "/api/v1/runtime/events/export" && method === "POST") {
    try {
      const body = await bodyJson<{
        agentId?: string;
        runId?: string;
        outputPath?: string;
        format?: "json" | "jsonl";
        redacted?: boolean;
        limit?: number;
        stage?: string;
        receiptId?: string;
      }>(req);
      if (!body.runId) {
        apiError(res, 400, "runId is required");
        return true;
      }
      const out = exportRuntimeRunEvents({
        workspace,
        agentId: body.agentId,
        runId: body.runId,
        outputPath: exportPath(workspace, body.outputPath),
        format: body.format === "json" ? "json" : "jsonl",
        redacted: body.redacted ?? true,
        limit: numericLimit(body.limit, 100),
        stage: body.stage,
        receiptId: body.receiptId
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "could not export runtime events");
    }
    return true;
  }

  const actionMatch = pathname.match(/^\/api\/v1\/runtime\/runs\/([^/]+)\/(events|resume|cancel|degrade|complete)$/);
  if (actionMatch && method === "POST") {
    const runId = decodeURIComponent(actionMatch[1] ?? "");
    const action = actionMatch[2];
    try {
      const body = await bodyJson<{
        agentId?: string;
        episodeId?: string;
        lifecycleRunId?: string;
        source?: RuntimeRunSource;
        type?: RuntimeRunEventType;
        stage?: string;
        severity?: RuntimeRunSeverity;
        message?: string;
        payload?: unknown;
        payloadRef?: string;
        links?: Record<string, string | null>;
        reason?: string;
      }>(req);
      if (action === "events") {
        const written = appendRuntimeRunEvent({
          workspace,
          runId,
          agentId: body.agentId,
          episodeId: body.episodeId,
          lifecycleRunId: body.lifecycleRunId,
          source: parseSource(body.source ?? "api"),
          type: parseEventType(body.type ?? "trace.received"),
          stage: body.stage,
          severity: parseSeverity(body.severity),
          message: body.message,
          payload: body.payload,
          payloadRef: body.payloadRef,
          links: body.links ?? {}
        });
        apiSuccess(res, written, 201);
        return true;
      }
      const common = { workspace, runId, agentId: body.agentId, source: parseSource(body.source ?? "api") };
      const written = action === "resume"
        ? resumeRuntimeRun({ ...common, stage: body.stage, message: body.message })
        : action === "cancel"
          ? cancelRuntimeRun({ ...common, reason: body.reason ?? body.message })
          : action === "degrade"
            ? markRuntimeRunDegraded({ ...common, reason: body.reason ?? body.message })
            : completeRuntimeRun({ ...common, reason: body.reason ?? body.message });
      apiSuccess(res, written, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : `could not ${action} runtime run`);
    }
    return true;
  }

  const runMatch = pathname.match(/^\/api\/v1\/runtime\/runs\/([^/]+)$/);
  if (runMatch && method === "GET") {
    try {
      const runId = decodeURIComponent(runMatch[1] ?? "");
      const agentId = queryParam(req.url ?? "", "agentId") ?? undefined;
      const limit = numericLimit(queryParam(req.url ?? "", "limit"), 100);
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const includeEvents = queryParam(req.url ?? "", "events") !== "false";
      const run = inspectRuntimeRun({ workspace, runId, agentId, includeEvents, limit, redacted });
      apiSuccess(res, run);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : "runtime run not found");
    }
    return true;
  }

  apiError(res, 404, `Runtime route not found: ${method} ${pathname}`);
  return true;
}

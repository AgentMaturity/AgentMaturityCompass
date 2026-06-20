import type { IncomingMessage, ServerResponse } from "node:http";
import { buildAgentTimelineData } from "../observability/timeline.js";
import { apiError, apiSuccess, queryParam } from "./apiHelpers.js";

function parsePositiveInt(value: string | undefined, fallback: number, maxValue: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(maxValue, parsed));
}

function queryAgentId(req: IncomingMessage): string {
  const agentId = queryParam(req.url ?? "", "agentId")?.trim();
  return agentId && agentId.length > 0 ? agentId : "default";
}

function timelineLimit(req: IncomingMessage, fallback: number): number {
  return parsePositiveInt(
    queryParam(req.url ?? "", "maxRuns") ?? queryParam(req.url ?? "", "limit"),
    fallback,
    5000
  );
}

function evidenceLimit(req: IncomingMessage): number {
  return parsePositiveInt(queryParam(req.url ?? "", "maxEvidenceEvents"), 1000, 20_000);
}

function requireGet(method: string, res: ServerResponse): boolean {
  if (method === "GET") return true;
  apiError(res, 405, `Method ${method} not allowed, expected GET`);
  return false;
}

export async function handleObserveRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/observe")) return false;

  if (pathname === "/api/v1/observe/status") {
    if (!requireGet(method, res)) return true;
    apiSuccess(res, { status: "operational", module: "observe" });
    return true;
  }

  if (pathname === "/api/v1/observe/timeline") {
    if (!requireGet(method, res)) return true;
    try {
      const agentId = queryAgentId(req);
      const maxRuns = timelineLimit(req, 200);
      const maxEvidenceEvents = evidenceLimit(req);
      const data = buildAgentTimelineData({ workspace, agentId, maxRuns, maxEvidenceEvents });
      apiSuccess(res, {
        ...data,
        source: "amc observe timeline",
        cliEquivalent: `amc observe timeline --agent ${agentId} --limit ${maxRuns} --json`
      });
    } catch (error) {
      apiError(res, 500, error instanceof Error ? error.message : "Observe timeline failed");
    }
    return true;
  }

  if (pathname === "/api/v1/observe/anomalies") {
    if (!requireGet(method, res)) return true;
    try {
      const agentId = queryAgentId(req);
      const maxRuns = timelineLimit(req, 50);
      const maxEvidenceEvents = evidenceLimit(req);
      const limit = parsePositiveInt(queryParam(req.url ?? "", "limit"), 50, 500);
      const data = buildAgentTimelineData({ workspace, agentId, maxRuns, maxEvidenceEvents });
      const anomalies = data.anomalies.slice(0, limit);
      apiSuccess(res, {
        agentId: data.agentId,
        generatedTs: data.generatedTs,
        source: "amc observe anomalies",
        cliEquivalent: `amc observe anomalies --agent ${agentId} --json`,
        anomalies,
        summary: {
          ...data.summary,
          anomalyCount: data.anomalies.length,
          returnedAnomalyCount: anomalies.length
        }
      });
    } catch (error) {
      apiError(res, 500, error instanceof Error ? error.message : "Observe anomalies failed");
    }
    return true;
  }

  apiError(res, 404, `Observe API route not found: ${method} ${pathname}`);
  return true;
}

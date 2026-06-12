/**
 * fixerRouter.ts — Fixer RCA API routes.
 *
 * Exposes the Watch -> Enforce repair lane without mutating resources.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson, pathParam, queryParam } from "./apiHelpers.js";

export async function handleFixerRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/fixer")) return false;

  if (pathname === "/api/v1/fixer/rca" && method === "POST") {
    try {
      const body = await bodyJson<{ agentId?: string; selector?: string; runId?: string }>(req);
      const selector = body.selector ?? body.runId;
      if (!selector) {
        apiError(res, 400, "selector or runId required");
        return true;
      }
      const { writeFixerRcaReport, redactFixerRcaReport } = await import("../mechanic/fixerRca.js");
      const result = writeFixerRcaReport({
        workspace,
        agentId: body.agentId ?? "default",
        selector
      });
      apiSuccess(res, {
        ...result,
        report: redactFixerRcaReport(result.report)
      }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Could not generate fixer RCA report");
    }
    return true;
  }

  if (pathname === "/api/v1/fixer/rca" && method === "GET") {
    try {
      const agentId = queryParam(req.url ?? "", "agentId") ?? "default";
      const limit = Number.parseInt(queryParam(req.url ?? "", "limit") ?? "25", 10);
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const { listFixerRcaReports } = await import("../mechanic/fixerRca.js");
      const reports = listFixerRcaReports({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
        redacted
      });
      apiSuccess(res, { agentId, reports, total: reports.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Could not list fixer RCA reports");
    }
    return true;
  }

  const reportParams = pathParam(pathname, "/api/v1/fixer/rca/:selector");
  if (reportParams && method === "GET") {
    try {
      const agentId = queryParam(req.url ?? "", "agentId") ?? "default";
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const { loadFixerRcaReport } = await import("../mechanic/fixerRca.js");
      const report = loadFixerRcaReport({
        workspace,
        agentId,
        selector: decodeURIComponent(reportParams.selector!),
        redacted
      });
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : "Fixer RCA report not found");
    }
    return true;
  }

  return false;
}

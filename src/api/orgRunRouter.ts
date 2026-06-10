import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson, pathParam, queryParam } from "./apiHelpers.js";

export async function handleOrgRunRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/org")) return false;

  if (pathname === "/api/v1/org/roles" && method === "GET") {
    try {
      const { orgRunRoleDefinitions } = await import("../org/orgRun.js");
      const roles = orgRunRoleDefinitions();
      apiSuccess(res, { roles, total: roles.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Could not list org roles");
    }
    return true;
  }

  if (pathname === "/api/v1/org/runs" && method === "GET") {
    try {
      const limit = Number.parseInt(queryParam(req.url ?? "", "limit") ?? "25", 10);
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const { listOrgRuns, orgRunSummaryForUi } = await import("../org/orgRun.js");
      const runs = listOrgRuns({
        workspace,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
        redacted
      });
      apiSuccess(res, {
        runs,
        summaries: runs.map((run) => orgRunSummaryForUi(run)),
        total: runs.length
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Could not list org runs");
    }
    return true;
  }

  if (pathname === "/api/v1/org/runs" && method === "POST") {
    try {
      const body = await bodyJson<{
        roles?: string[] | string;
        goal?: string;
        orgRunId?: string;
        heartbeatPolicy?: {
          intervalMinutes?: number;
          maxStaleMinutes?: number;
          plateauAfterHeartbeats?: number;
        };
      }>(req);
      const { parseOrgRoleList, runOrg, orgRunSummaryForUi } = await import("../org/orgRun.js");
      const result = runOrg({
        workspace,
        roles: parseOrgRoleList(body.roles),
        goal: body.goal,
        orgRunId: body.orgRunId,
        heartbeatPolicy: body.heartbeatPolicy,
        source: "api",
        command: "POST /api/v1/org/runs"
      });
      apiSuccess(res, {
        ...result,
        summary: orgRunSummaryForUi(result.artifact)
      }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Could not run org lifecycle");
    }
    return true;
  }

  const inspectParams = pathParam(pathname, "/api/v1/org/runs/:selector");
  if (inspectParams && method === "GET") {
    try {
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const { loadOrgRun, orgRunSummaryForUi } = await import("../org/orgRun.js");
      const run = loadOrgRun({
        workspace,
        selector: decodeURIComponent(inspectParams.selector!),
        redacted
      });
      apiSuccess(res, { run, summary: orgRunSummaryForUi(run) });
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : "Org run not found");
    }
    return true;
  }

  return false;
}

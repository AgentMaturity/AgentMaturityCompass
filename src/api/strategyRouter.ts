import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson, pathParam, queryParam } from "./apiHelpers.js";
import type { InferenceObjective, InferenceStrategyInput } from "../enforce/inferenceStrategy.js";

export async function handleStrategyRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/strategy")) return false;

  if (pathname === "/api/v1/strategy/runs" && method === "GET") {
    try {
      const agentId = queryParam(req.url ?? "", "agentId") ?? "default";
      const limit = Number.parseInt(queryParam(req.url ?? "", "limit") ?? "10", 10);
      const { listInferenceStrategyRuns } = await import("../enforce/inferenceStrategy.js");
      const runs = listInferenceStrategyRuns({ workspace, agentId, limit: Number.isFinite(limit) && limit > 0 ? limit : 10 });
      apiSuccess(res, { agentId, runs, total: runs.length });
    } catch (error) {
      apiError(res, 500, error instanceof Error ? error.message : "Could not list strategy runs");
    }
    return true;
  }

  if (pathname === "/api/v1/strategy/compare" && method === "POST") {
    try {
      const body = await bodyJson<{
        agentId?: string;
        strategies?: InferenceStrategyInput[];
        objective?: InferenceObjective;
        applyRoute?: boolean;
        policyApproval?: boolean;
      }>(req);
      if (!Array.isArray(body.strategies)) {
        apiError(res, 400, "strategies array required");
        return true;
      }
      const { compareInferenceStrategies } = await import("../enforce/inferenceStrategy.js");
      apiSuccess(res, compareInferenceStrategies({
        workspace,
        agentId: body.agentId,
        strategies: body.strategies,
        objective: body.objective,
        applyRoute: body.applyRoute,
        policyApproval: body.policyApproval
      }), 201);
    } catch (error) {
      apiError(res, 422, error instanceof Error ? error.message : "Strategy comparison failed");
    }
    return true;
  }

  const showParams = pathParam(pathname, "/api/v1/strategy/runs/:selector");
  if (showParams && method === "GET") {
    try {
      const agentId = queryParam(req.url ?? "", "agentId") ?? "default";
      const { loadInferenceStrategyRun } = await import("../enforce/inferenceStrategy.js");
      apiSuccess(res, loadInferenceStrategyRun({ workspace, agentId, selector: decodeURIComponent(showParams.selector!) }));
    } catch (error) {
      apiError(res, 404, error instanceof Error ? error.message : "Strategy run not found");
    }
    return true;
  }

  const rollbackParams = pathParam(pathname, "/api/v1/strategy/runs/:selector/rollback");
  if (rollbackParams && method === "POST") {
    try {
      const body = await bodyJson<{ agentId?: string }>(req);
      const { rollbackInferenceStrategyRun } = await import("../enforce/inferenceStrategy.js");
      apiSuccess(res, rollbackInferenceStrategyRun({
        workspace,
        agentId: body.agentId,
        selector: decodeURIComponent(rollbackParams.selector!)
      }));
    } catch (error) {
      apiError(res, 404, error instanceof Error ? error.message : "Strategy rollback failed");
    }
    return true;
  }

  return false;
}

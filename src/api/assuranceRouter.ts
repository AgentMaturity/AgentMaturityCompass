/**
 * assuranceRouter.ts — Assurance API routes backed by the unified assurance runner.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  assuranceRunDetailForApi,
  assuranceRunForApi,
  assuranceRunsForApi
} from "../assurance/assuranceControlPlane.js";
import { listAssurancePacks } from "../assurance/packs/index.js";
import { apiError, apiSuccess, bodyJsonSchema, isRequestBodyError, pathParam } from "./apiHelpers.js";

const assuranceRunBodySchema = z.object({
  scopeType: z.unknown().optional(),
  scope: z.unknown().optional(),
  scopeId: z.unknown().optional(),
  id: z.unknown().optional(),
  pack: z.unknown().optional(),
  windowDays: z.unknown().optional()
}).strict();

function parseScopeType(raw: unknown): "WORKSPACE" | "NODE" | "AGENT" {
  const normalized = String(raw ?? "WORKSPACE").toUpperCase();
  if (normalized === "WORKSPACE" || normalized === "NODE" || normalized === "AGENT") {
    return normalized;
  }
  throw new Error("scopeType must be WORKSPACE|NODE|AGENT");
}

function parseWindowDays(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("windowDays must be a positive number");
  }
  return Math.trunc(parsed);
}

function parsePack(raw: unknown): string {
  const pack = String(raw ?? "all");
  if (pack === "all") {
    return pack;
  }
  const available = new Set(listAssurancePacks().map((row) => row.id));
  if (!available.has(pack)) {
    throw new Error(`pack must be all or one of: ${[...available].sort((a, b) => a.localeCompare(b)).join("|")}`);
  }
  return pack;
}

export async function handleAssuranceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (pathname === "/api/v1/assurance/packs" && method === "GET") {
    const packs = listAssurancePacks().map((pack) => ({
      id: pack.id,
      title: pack.title,
      description: pack.description,
      scenarioCount: pack.scenarios.length
    }));
    apiSuccess(res, {
      count: packs.length,
      packs
    });
    return true;
  }

  if (pathname === "/api/v1/assurance" && method === "GET") {
    apiSuccess(res, {
      runs: assuranceRunsForApi(workspace)
    });
    return true;
  }

  if (pathname === "/api/v1/assurance" && method === "POST") {
    try {
      const body = await bodyJsonSchema(req, assuranceRunBodySchema);
      const scopeType = parseScopeType(body.scopeType ?? body.scope);
      const scopeIdRaw = body.scopeId ?? body.id;
      const scopeId = typeof scopeIdRaw === "string" && scopeIdRaw.trim().length > 0 ? scopeIdRaw.trim() : undefined;
      const pack = parsePack(body.pack);
      const windowDays = parseWindowDays(body.windowDays);
      const out = await assuranceRunForApi({
        workspace,
        scopeType,
        scopeId,
        pack,
        windowDays
      });
      apiSuccess(res, out);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "invalid request");
    }
    return true;
  }

  const runParams = pathParam(pathname, "/api/v1/assurance/:runId");
  if (runParams && method === "GET") {
    const runId = runParams.runId;
    if (!runId) {
      apiError(res, 400, "runId is required");
      return true;
    }
    const detail = assuranceRunDetailForApi({
      workspace,
      runId
    });
    if (!detail.run) {
      apiError(res, 404, "Assurance run not found");
      return true;
    }
    apiSuccess(res, detail);
    return true;
  }

  return false;
}

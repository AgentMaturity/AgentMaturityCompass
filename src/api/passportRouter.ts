import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { apiError, apiSuccess, bodyJsonSchema, isRequestBodyError, pathParam } from "./apiHelpers.js";
import {
  passportPublicForApi,
  passportRegistryForApi,
  passportRevokeForApi,
  passportVerifyPublicForApi
} from "../passport/passportApi.js";

const passportRevokeBodySchema = z.object({
  reason: z.string().trim().min(1).optional(),
  revokedBy: z.string().trim().min(1).optional()
}).strict();

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

function inferBaseUrl(req: IncomingMessage): string {
  const host = firstHeader(req.headers["x-forwarded-host"])
    ?? firstHeader(req.headers.host)
    ?? "localhost:8787";
  const proto = firstHeader(req.headers["x-forwarded-proto"])
    ?? (typeof (req.socket as { encrypted?: unknown }).encrypted === "boolean"
      && (req.socket as { encrypted?: boolean }).encrypted
      ? "https"
      : "http");
  return `${proto}://${host}`;
}

export async function handlePassportRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
  apiToken?: string
): Promise<boolean> {
  if (pathname === "/api/v1/passports" && method === "GET") {
    const url = new URL(req.url ?? pathname, "http://localhost");
    const pageRaw = Number(url.searchParams.get("page") ?? "1");
    const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "20");
    apiSuccess(res, passportRegistryForApi({
      workspace,
      page: Number.isFinite(pageRaw) ? pageRaw : 1,
      pageSize: Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20,
      baseUrl: inferBaseUrl(req)
    }));
    return true;
  }

  const verifyParams = pathParam(pathname, "/api/v1/passport/:id/verify");
  if (verifyParams && method === "GET") {
    const result = passportVerifyPublicForApi({
      workspace,
      passportId: decodeURIComponent(verifyParams.id ?? ""),
      baseUrl: inferBaseUrl(req)
    });
    if (!result) {
      apiError(res, 404, "Passport not found");
      return true;
    }
    apiSuccess(res, result, result.ok ? 200 : 422);
    return true;
  }

  const revokeParams = pathParam(pathname, "/api/v1/passport/:id/revoke");
  if (revokeParams && method === "POST") {
    if ((apiToken ?? "").trim().length > 0) {
      const provided = firstHeader(req.headers["x-amc-admin-token"]);
      if (provided !== apiToken) {
        apiError(res, 401, "Missing or invalid admin token");
        return true;
      }
    }
    let body: z.infer<typeof passportRevokeBodySchema> = {};
    try {
      body = await bodyJsonSchema(req, passportRevokeBodySchema);
    } catch (error) {
      if (isRequestBodyError(error)) {
        apiError(res, error.statusCode, error.message);
        return true;
      }
    }
    const result = passportRevokeForApi({
      workspace,
      passportId: decodeURIComponent(revokeParams.id ?? ""),
      reason: body.reason ?? null,
      revokedBy: body.revokedBy ?? null
    });
    if (!result) {
      apiError(res, 404, "Passport not found");
      return true;
    }
    apiSuccess(res, result);
    return true;
  }

  const publicParams = pathParam(pathname, "/api/v1/passport/:id");
  if (publicParams && method === "GET") {
    const result = passportPublicForApi({
      workspace,
      passportId: decodeURIComponent(publicParams.id ?? ""),
      baseUrl: inferBaseUrl(req)
    });
    if (!result) {
      apiError(res, 404, "Passport not found");
      return true;
    }
    apiSuccess(res, result);
    return true;
  }

  // POST /api/v1/passport/trust-token/issue — issue an AMC Trust Token
  if (pathname === "/api/v1/passport/trust-token/issue" && method === "POST") {
    try {
      const body = await import("./apiHelpers.js").then(m => m.bodyJson<{
        workspaceId?: string;
        publicKeyHash?: string;
        agentId?: string;
        claims?: unknown[];
        secret?: string;
        ttlHours?: number;
        displayName?: string;
        passportId?: string;
      }>(req));
      if (!body.agentId || !body.claims || !body.secret) {
        const { apiError: ae } = await import("./apiHelpers.js");
        ae(res, 400, "agentId, claims, and secret required"); return true;
      }
      const { issueTrustToken } = await import("../passport/trustInterchange.js");
      const token = issueTrustToken(
        body.workspaceId ?? workspace,
        body.publicKeyHash ?? "",
        body.agentId,
        body.claims as Parameters<typeof issueTrustToken>[3],
        body.secret,
        { ttlHours: body.ttlHours, displayName: body.displayName, passportId: body.passportId },
      );
      apiSuccess(res, token, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Trust token issuance failed");
    }
    return true;
  }

  // POST /api/v1/passport/trust-token/verify — verify a trust token
  if (pathname === "/api/v1/passport/trust-token/verify" && method === "POST") {
    try {
      const body = await import("./apiHelpers.js").then(m => m.bodyJson<{ token?: Record<string, unknown>; secret?: string }>(req));
      if (!body.token || !body.secret) { apiError(res, 400, "token and secret required"); return true; }
      const { verifyTrustToken } = await import("../passport/trustInterchange.js");
      const result = verifyTrustToken(body.token as unknown as Parameters<typeof verifyTrustToken>[0], body.secret);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Trust token verification failed");
    }
    return true;
  }

  // POST /api/v1/passport/trust-token/translate — translate between scoring systems
  if (pathname === "/api/v1/passport/trust-token/translate" && method === "POST") {
    try {
      const body = await import("./apiHelpers.js").then(m => m.bodyJson<{
        scores?: Record<string, number>;
        sourceSystem?: string;
        targetSystem?: string;
      }>(req));
      if (!body.scores || !body.sourceSystem || !body.targetSystem) {
        apiError(res, 400, "scores, sourceSystem, and targetSystem required"); return true;
      }
      const { translateTrustScores } = await import("../passport/trustInterchange.js");
      const result = translateTrustScores(body.scores, body.sourceSystem, body.targetSystem);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Trust score translation failed");
    }
    return true;
  }

  return false;
}

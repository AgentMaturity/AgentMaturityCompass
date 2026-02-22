import type { IncomingMessage, ServerResponse } from "node:http";
import type { IdentityConfig } from "../identityConfig.js";
import { verifyScimRequestAuth } from "./scimAuth.js";
import { parseScimPatchOperations } from "./scimPatch.js";
import { scimError, scimListResponse } from "./scimTypes.js";
import {
  newScimId,
  scimCreateUser,
  scimDisableUser,
  scimGetUser,
  scimListUsers,
  scimPatchUser,
  scimReplaceUser
} from "./scimUsers.js";
import {
  findScimGroupByDisplayName,
  scimCreateOrReplaceGroup,
  scimDeleteGroup,
  scimGetGroup,
  scimListGroups,
  scimPatchGroup
} from "./scimGroups.js";
import { appendHostAudit } from "../../workspaces/hostDb.js";

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/scim+json");
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<Record<string, unknown>> {
  const raw = await readBody(req, maxBytes);
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return Object.create(null) as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("SCIM payload must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_JSON_BODY");
  }
}

function classifyScimError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "PAYLOAD_TOO_LARGE") {
    return { status: 413, message: "Payload too large" };
  }
  if (message === "INVALID_JSON_BODY") {
    return { status: 400, message: "Invalid JSON payload" };
  }
  const lower = message.toLowerCase();
  if (lower.includes("not found")) {
    return { status: 404, message };
  }
  if (lower.includes("required") || lower.includes("invalid") || lower.includes("unsupported patch")) {
    return { status: 400, message };
  }
  return { status: 500, message: "Internal SCIM error" };
}

function parsePagination(url: URL): { startIndex: number; count: number } {
  const startIndex = Number(url.searchParams.get("startIndex") ?? "1");
  const count = Number(url.searchParams.get("count") ?? "100");
  return {
    startIndex: Number.isFinite(startIndex) && startIndex > 0 ? Math.floor(startIndex) : 1,
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 100
  };
}

export async function handleScimRoute(params: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  hostDir: string;
  identityConfig: IdentityConfig;
  isHttps: boolean;
  maxRequestBytes?: number;
}): Promise<boolean> {
  const basePath = params.identityConfig.identity.scim.basePath.replace(/\/+$/g, "");
  if (!params.url.pathname.startsWith(basePath)) {
    return false;
  }
  const auth = verifyScimRequestAuth({
    req: params.req,
    hostDir: params.hostDir,
    identityConfig: params.identityConfig,
    isHttps: params.isHttps
  });
  if (!auth.ok || !auth.tokenId) {
    json(params.res, 401, scimError(401, auth.error ?? "Unauthorized"));
    return true;
  }
  try {
    const method = (params.req.method ?? "GET").toUpperCase();
    const suffix = params.url.pathname.slice(basePath.length) || "/";

    if (suffix === "/ServiceProviderConfig") {
      json(params.res, 200, {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
          {
            name: "Bearer Token",
            description: "Authorization: Bearer <token>",
            type: "oauthbearertoken",
            primary: true
          }
        ]
      });
      return true;
    }
    if (suffix === "/ResourceTypes") {
      json(params.res, 200, scimListResponse([
        {
          id: "User",
          name: "User",
          endpoint: `${basePath}/Users`,
          schema: "urn:ietf:params:scim:schemas:core:2.0:User"
        },
        {
          id: "Group",
          name: "Group",
          endpoint: `${basePath}/Groups`,
          schema: "urn:ietf:params:scim:schemas:core:2.0:Group"
        }
      ]));
      return true;
    }
    if (suffix === "/Schemas") {
      json(params.res, 200, scimListResponse([
        {
          id: "urn:ietf:params:scim:schemas:core:2.0:User",
          name: "User"
        },
        {
          id: "urn:ietf:params:scim:schemas:core:2.0:Group",
          name: "Group"
        }
      ]));
      return true;
    }

    if (suffix === "/Users" && method === "GET") {
      const pagination = parsePagination(params.url);
      const filter = params.url.searchParams.get("filter");
      json(
        params.res,
        200,
        scimListUsers({
          hostDir: params.hostDir,
          startIndex: pagination.startIndex,
          count: pagination.count,
          filter
        })
      );
      return true;
    }
    if (suffix === "/Users" && method === "POST") {
      const body = await readJsonBody(params.req, params.maxRequestBytes ?? 1_048_576);
      const created = scimCreateUser({
        hostDir: params.hostDir,
        body,
        actorTokenId: auth.tokenId
      });
      json(params.res, 201, {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        ...created
      });
      return true;
    }
    const userMatch = /^\/Users\/([^/]+)$/.exec(suffix);
    if (userMatch) {
      const userId = decodeURIComponent(userMatch[1]!);
      if (method === "GET") {
        const user = scimGetUser(params.hostDir, userId);
        if (!user) {
          json(params.res, 404, scimError(404, "User not found"));
          return true;
        }
        json(params.res, 200, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          ...user
        });
        return true;
      }
      if (method === "PUT") {
        const body = await readJsonBody(params.req, params.maxRequestBytes ?? 1_048_576);
        const updated = scimReplaceUser({
          hostDir: params.hostDir,
          userId,
          body,
          actorTokenId: auth.tokenId
        });
        json(params.res, 200, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          ...updated
        });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(params.req, params.maxRequestBytes ?? 1_048_576);
        const operations = parseScimPatchOperations(body);
        const updated = scimPatchUser({
          hostDir: params.hostDir,
          userId,
          operations,
          actorTokenId: auth.tokenId
        });
        json(params.res, 200, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          ...updated
        });
        return true;
      }
      if (method === "DELETE") {
        scimDisableUser({
          hostDir: params.hostDir,
          userId,
          actorTokenId: auth.tokenId
        });
        params.res.statusCode = 204;
        params.res.end();
        return true;
      }
    }

    if (suffix === "/Groups" && method === "GET") {
      const groups = scimListGroups(params.hostDir);
      json(params.res, 200, scimListResponse(groups));
      return true;
    }
    if (suffix === "/Groups" && method === "POST") {
      const body = await readJsonBody(params.req, params.maxRequestBytes ?? 1_048_576);
      const existing = typeof body.displayName === "string" ? findScimGroupByDisplayName(params.hostDir, body.displayName) : null;
      const created = scimCreateOrReplaceGroup({
        hostDir: params.hostDir,
        identityConfig: params.identityConfig,
        groupId: existing?.groupId ?? newScimId("grp"),
        body,
        actorTokenId: auth.tokenId
      });
      appendHostAudit(params.hostDir, "SCIM_MEMBERSHIP_CHANGED", null, {
        actorTokenId: auth.tokenId,
        groupId: created.id,
        memberCount: created.members.length
      });
      json(params.res, 201, {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
        ...created
      });
      return true;
    }
    const groupMatch = /^\/Groups\/([^/]+)$/.exec(suffix);
    if (groupMatch) {
      const groupId = decodeURIComponent(groupMatch[1]!);
      if (method === "GET") {
        const group = scimGetGroup(params.hostDir, groupId);
        if (!group) {
          json(params.res, 404, scimError(404, "Group not found"));
          return true;
        }
        json(params.res, 200, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
          ...group
        });
        return true;
      }
      if (method === "PUT") {
        const body = await readJsonBody(params.req, params.maxRequestBytes ?? 1_048_576);
        const group = scimCreateOrReplaceGroup({
          hostDir: params.hostDir,
          identityConfig: params.identityConfig,
          groupId,
          body,
          actorTokenId: auth.tokenId
        });
        appendHostAudit(params.hostDir, "SCIM_MEMBERSHIP_CHANGED", null, {
          actorTokenId: auth.tokenId,
          groupId: group.id,
          memberCount: group.members.length
        });
        json(params.res, 200, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
          ...group
        });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(params.req, params.maxRequestBytes ?? 1_048_576);
        const operations = parseScimPatchOperations(body);
        const group = scimPatchGroup({
          hostDir: params.hostDir,
          identityConfig: params.identityConfig,
          groupId,
          operations,
          actorTokenId: auth.tokenId
        });
        appendHostAudit(params.hostDir, "SCIM_MEMBERSHIP_CHANGED", null, {
          actorTokenId: auth.tokenId,
          groupId: group.id,
          memberCount: group.members.length
        });
        json(params.res, 200, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
          ...group
        });
        return true;
      }
      if (method === "DELETE") {
        scimDeleteGroup({
          hostDir: params.hostDir,
          groupId,
          actorTokenId: auth.tokenId
        });
        appendHostAudit(params.hostDir, "SCIM_MEMBERSHIP_CHANGED", null, {
          actorTokenId: auth.tokenId,
          groupId,
          deleted: true
        });
        params.res.statusCode = 204;
        params.res.end();
        return true;
      }
    }

    json(params.res, 404, scimError(404, "Unknown SCIM endpoint"));
    return true;
  } catch (error) {
    const classified = classifyScimError(error);
    json(params.res, classified.status, scimError(classified.status, classified.message));
    return true;
  }
}

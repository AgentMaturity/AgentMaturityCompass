import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import YAML from "yaml";
import { describe, expect, test } from "vitest";
import { handleStudioApiDelegation } from "../src/studio/apiDelegation.js";

const HUMAN_ROLES = ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"];

async function requestedRoles(pathname: string, method: string): Promise<string[]> {
  let roles: string[] | undefined;
  const handled = await handleStudioApiDelegation({
    pathname,
    method,
    clientIp: "127.0.0.1",
    workspace: process.cwd(),
    token: "admin-token",
    req: {} as IncomingMessage,
    res: {} as ServerResponse,
    authenticate: () => ({
      isAdmin: false,
      agentId: null,
      username: "viewer",
      roles: new Set(["VIEWER"])
    }),
    requireRoles: (params) => {
      roles = params.roles;
      return false;
    },
    json: () => undefined,
    apiLimiter: () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetTs: Date.now() + 60_000,
      retryAfterSeconds: 0
    }),
    privilegedApiLimiter: () => ({
      allowed: true,
      limit: 600,
      remaining: 599,
      resetTs: Date.now() + 60_000,
      retryAfterSeconds: 0
    }),
    setRateLimitHeaders: () => undefined
  });

  expect(handled).toBe(true);
  expect(roles).toBeDefined();
  return roles ?? [];
}

describe("Studio /api/v1 least-privilege authorization", () => {
  test("keeps ordinary reads and explicitly side-effect-free checks available to human roles", async () => {
    await expect(requestedRoles("/api/v1/score/status", "GET")).resolves.toEqual(HUMAN_ROLES);
    await expect(requestedRoles("/api/v1/proof/check", "POST")).resolves.toEqual(HUMAN_ROLES);
    await expect(requestedRoles("/api/v1/vault/redact", "POST")).resolves.toEqual(HUMAN_ROLES);
  });

  test("requires owner for vault secrets and identity control-plane mutations", async () => {
    await expect(requestedRoles("/api/v1/vault/secret/provider-key", "GET")).resolves.toEqual(["OWNER"]);
    await expect(requestedRoles("/api/v1/vault/secret/set", "POST")).resolves.toEqual(["OWNER"]);
    await expect(requestedRoles("/api/v1/vault/secret/future-delete", "DELETE")).resolves.toEqual(["OWNER"]);
    await expect(requestedRoles("/api/v1/vault/keys/rotate", "POST")).resolves.toEqual(["OWNER"]);
    await expect(requestedRoles("/api/v1/identity/scim/token/create", "POST")).resolves.toEqual(["OWNER"]);
    await expect(requestedRoles("/api/v1/ci/policy/future-edit", "PATCH")).resolves.toEqual(["OWNER"]);
    await expect(requestedRoles("/api/v1/firewall/migrate-signature", "POST")).resolves.toEqual(["OWNER"]);
  });

  test("separates operational execution from read-only and approval roles", async () => {
    await expect(requestedRoles("/api/v1/sandbox/run", "POST")).resolves.toEqual(["OPERATOR", "OWNER"]);
    await expect(requestedRoles("/api/v1/runtime/runs", "POST")).resolves.toEqual(["OPERATOR", "OWNER"]);
    await expect(requestedRoles("/api/v1/tickets/issue", "POST")).resolves.toEqual(["APPROVER", "OWNER"]);
    await expect(requestedRoles("/api/v1/unknown/future-mutation", "PATCH")).resolves.toEqual(["OPERATOR", "OWNER"]);
  });

  test("retains auditor verification and attestation without granting broad mutation access", async () => {
    await expect(requestedRoles("/api/v1/tickets/verify", "POST")).resolves.toEqual(["OPERATOR", "AUDITOR", "OWNER"]);
    await expect(requestedRoles("/api/v1/evidence/attest", "POST")).resolves.toEqual(["AUDITOR", "OWNER"]);
  });

  test("fails closed for unsupported methods", async () => {
    await expect(requestedRoles("/api/v1/score/status", "TRACE")).resolves.toEqual(["OWNER"]);
  });

  test("publishes the implemented session/admin auth and role matrix", () => {
    const spec = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    expect(spec.security).toEqual([
      { amcSessionCookie: [] },
      { amcAdminToken: [] }
    ]);
    expect(spec.components.securitySchemes).not.toHaveProperty("bearerAuth");
    expect(spec.paths["/v1/health"].get.security).toEqual([]);

    for (const path of ["docs/RBAC.md", "docs/API_SURFACES.md", "docs/STUDIO.md"]) {
      const doc = readFileSync(path, "utf8").toLowerCase();
      expect(doc).toContain("least-privilege");
      expect(doc).toContain("side-effect-free");
      expect(doc).toContain("agent and lease");
    }
  });

  test("keeps guardrail and migration value contracts aligned with runtime status semantics", () => {
    const spec = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    for (const pathname of [
      "/v1/guardrails/enable",
      "/v1/guardrails/disable",
      "/v1/guardrails/profile"
    ]) {
      const schema = spec.paths[pathname].post.requestBody.content["application/json"].schema;
      expect(schema.additionalProperties, pathname).toBe(false);
      expect(schema.required, pathname).toContain("name");
      expect(schema.properties.name.minLength, pathname).toBe(1);
      expect(schema.properties.name, pathname).not.toHaveProperty("enum");
      expect(spec.paths[pathname].post.responses).toHaveProperty("404");
      expect(spec.paths[pathname].post.responses).toHaveProperty("409");
    }

    const migration = spec.paths["/v1/firewall/migrate-signature"].post;
    const migrationSchema = migration.requestBody.content["application/json"].schema;
    expect(migrationSchema.additionalProperties).toBe(false);
    expect(migrationSchema.required).toEqual(["approveLegacyArtifactKind"]);
    expect(migrationSchema.properties.approveLegacyArtifactKind.const).toBe(true);
    expect(migration.responses["400"].description).toContain("acknowledgement");
    expect(migration.responses["409"].description).not.toContain("acknowledgement");
  });
});

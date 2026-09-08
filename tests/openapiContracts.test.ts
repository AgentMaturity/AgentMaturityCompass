import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";

import {
  generateFullOpenApiSpec,
  openapiGenerateCli,
  renderOpenApiYaml,
  validateOpenApiContractConsistency,
} from "../src/studio/openapi.js";

describe("full OpenAPI contract", () => {
  test("publishes native routes with the public server prefix, declared auth and OpenAPI 3.0 schemas", () => {
    const spec = YAML.parse(readFileSync(new URL("../website/openapi.yaml", import.meta.url), "utf8"));
    expect(spec.openapi).toBe("3.0.3");
    const endpoints = Object.entries(spec.paths).filter(([path]) => path.includes("native-tasks"));
    expect(endpoints).toHaveLength(8);
    for (const [path, methods] of endpoints) {
      expect(path.startsWith("/v1/native-tasks")).toBe(true);
      for (const server of spec.servers) {
        const base = server.url.replace("{host}", "amc.example.com");
        const concretePath = path.replace("{taskId}", "a".repeat(64));
        expect(new URL(base + concretePath).pathname).toBe("/api" + concretePath);
      }
      for (const operation of Object.values(methods as Record<string, any>)) {
        expect(operation.security).toEqual([{ amcAdminToken: [] }, { amcSessionCookie: [] }]);
        for (const scheme of operation.security.flatMap((requirement: object) => Object.keys(requirement))) {
          expect(spec.components.securitySchemes).toHaveProperty(scheme);
        }
      }
    }
    function inspect(value: unknown): void {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(inspect);
      const node = value as Record<string, unknown>;
      expect(node.type).not.toBe("null");
      expect(Array.isArray(node.type)).toBe(false);
      expect(node).not.toHaveProperty("const");
      if (typeof node.$ref === "string" && node.$ref.startsWith("#/components/schemas/")) {
        expect(spec.components.schemas).toHaveProperty(node.$ref.split("/").at(-1)!);
      }
      Object.values(node).forEach(inspect);
    }
    endpoints.forEach(([, methods]) => inspect(methods));
    Object.entries(spec.components.schemas).filter(([name]) => name.startsWith("NativeTask"))
      .forEach(([, schema]) => inspect(schema));
    expect(spec.components.schemas.NativeTask.properties.sessionId).toMatchObject({ type: "string", nullable: true });
    expect(spec.components.schemas.NativeTaskOptions.properties.providers.items.properties.credential)
      .toMatchObject({ type: "object", nullable: true });
  });
  test("includes studio + bridge + gateway endpoints", () => {
    const spec = generateFullOpenApiSpec();

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths).toHaveProperty("/bridge/telemetry"); // bridge
    expect(spec.paths).toHaveProperty("/bridge/openai/v1/chat/completions"); // bridge
    expect(spec.paths).toHaveProperty("/api/readyz"); // studio
    expect(spec.paths).toHaveProperty("/runs/{runId}/report"); // diagnostic report readiness
    expect(spec.paths).toHaveProperty("/gateway/{provider}/{path}"); // gateway
  });

  test("documents schemas for key endpoint responses", () => {
    const spec = generateFullOpenApiSpec();
    const ready = spec.paths["/api/readyz"] as Record<string, any>;
    const issueLease = spec.paths["/api/leases/issue"] as Record<string, any>;

    expect(ready.get.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/ReadinessResponse"
    );
    expect(issueLease.post.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/LeaseToken"
    );
  });

  test("provides reusable error schema", () => {
    const spec = generateFullOpenApiSpec();
    expect(spec.components.schemas).toHaveProperty("ErrorResponse");
    expect(spec.components.schemas).toHaveProperty("EvidenceReadiness");
    expect(spec.components.schemas).toHaveProperty("DiagnosticReport");
  });

  test("passes contract consistency checks with no errors", () => {
    const spec = generateFullOpenApiSpec();
    const issues = validateOpenApiContractConsistency(spec);
    const errors = issues.filter((i) => i.severity === "error");

    expect(errors).toEqual([]);
  });

  test("renders YAML containing title and auth schemes", () => {
    const yaml = renderOpenApiYaml();
    expect(yaml).toContain("title: AMC — Agent Maturity Compass API");
    expect(yaml).toContain("adminToken:");
    expect(yaml).toContain("leaseToken:");
  });

  test("writes YAML from the ESM CLI handler", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-openapi-"));
    try {
      const output = join(root, "nested", "openapi.yaml");
      const result = openapiGenerateCli({ out: output });
      expect(result.path).toBe(output);
      expect(existsSync(output)).toBe(true);
      expect(readFileSync(output, "utf8")).toContain("/runs/{runId}/report:");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateFullOpenApiSpec,
  openapiGenerateCli,
  renderOpenApiYaml,
  validateOpenApiContractConsistency,
} from "../src/studio/openapi.js";

describe("full OpenAPI contract", () => {
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

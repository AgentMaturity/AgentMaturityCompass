import { describe, expect, test } from "vitest";

import {
  generateFullOpenApiSpec,
  renderOpenApiYaml,
  validateOpenApiContractConsistency,
} from "../src/studio/openapi.js";

describe("full OpenAPI contract", () => {
  test("includes studio + bridge + gateway endpoints", () => {
    const spec = generateFullOpenApiSpec();

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths).toHaveProperty("/bridge/health"); // bridge
    expect(spec.paths).toHaveProperty("/api/readyz"); // studio
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
});

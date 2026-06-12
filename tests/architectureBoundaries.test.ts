import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  API_ROUTE_REGISTRY,
  isPublicApiRoute,
  matchApiRoute
} from "../src/api/index.js";

const root = process.cwd();

function readSource(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("architecture boundary checks", () => {
  test("API v1 dispatch is backed by route metadata", () => {
    expect(API_ROUTE_REGISTRY.length).toBeGreaterThan(30);

    for (const route of API_ROUTE_REGISTRY) {
      expect(route.id).toMatch(/^[a-z0-9-]+$/);
      expect(route.prefixes.length).toBeGreaterThan(0);
      expect(route.auth).toMatch(/^(public|protected)$/);
      expect(route.validationPolicy).toMatch(/^(schema-validated|router-local|passthrough)$/);
    }

    const score = matchApiRoute("/api/v1/score/session");
    expect(score?.id).toBe("score");
    expect(score?.auth).toBe("protected");
    expect(score?.validationPolicy).toBe("schema-validated");

    expect(matchApiRoute("/api/v1/passports")?.id).toBe("passport");
    expect(matchApiRoute("/api/v1/workorders")?.id).toBe("workflow");
    expect(matchApiRoute("/api/v1/tickets/issue")?.id).toBe("workflow");

    expect(isPublicApiRoute("/api/v1/health")).toBe(true);
    expect(isPublicApiRoute("/api/v1/chat/completions")).toBe(true);
    expect(isPublicApiRoute("/api/v1/score/session")).toBe(false);
  });

  test("api CLI family is registered through a command module", () => {
    const cli = readSource("src/cli.ts");
    const apiCli = readSource("src/api/apiCli.ts");

    expect(apiCli).toContain("export function registerApiCommands");
    expect(cli).toContain("registerApiCommands(program)");
    expect(cli).not.toContain('const apiCmd = program.command("api")');
  });

  test("Studio API delegation is extracted from the main server file", () => {
    const studioServer = readSource("src/studio/studioServer.ts");

    expect(existsSync(join(root, "src/studio/apiDelegation.ts"))).toBe(true);
    expect(studioServer).toContain("handleStudioApiDelegation");
    expect(studioServer).not.toContain('await import("../api/index.js")');
  });

  test("release gate tracks boundary drift and CLI/API compatibility", () => {
    const releaseGate = readSource("scripts/release-gate.mjs");
    const workflow = readSource(".github/workflows/ci.yml");

    expect(releaseGate).toContain("architecture-boundaries");
    expect(releaseGate).toContain("scripts/architecture-boundaries-check.mjs");
    expect(workflow).toContain("Architecture boundary compatibility");
    expect(workflow).toContain("npm run check:architecture-boundaries");
  });
});

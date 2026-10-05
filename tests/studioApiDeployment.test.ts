import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

describe("combined Studio/API deployment contracts", () => {
  it("adds the API image without changing the default Studio target", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("COPY api/ api/");
    expect(dockerfile).toContain("FROM runtime AS api");
    expect(dockerfile).toContain("dist/standalone-api.js");
    expect([...dockerfile.matchAll(/^FROM .* AS (\w+)$/gm)].at(-1)?.[1]).toBe("studio");
  });
  it("preserves existing services and keeps API off Studio ToolHub's port", () => {
    const overlay = YAML.parse(readFileSync("deploy/compose/docker-compose.studio-api.yml", "utf8"));
    expect(Object.keys(overlay.services)).toEqual(["amc-api", "caddy"]);
    expect(overlay.services["amc-api"]).toMatchObject({ build: { target: "api" },
      expose: ["3220"], read_only: true, cap_drop: ["ALL"], volumes: ["amc_data:/data/amc:ro"] });
    expect(overlay.services["amc-api"].ports).toBeUndefined();
    expect(overlay.services.caddy.depends_on).toEqual(["amc-studio", "amc-api"]);
  });
  it("forwards Studio API/native routes and isolates the standalone API namespace", () => {
    const base = readFileSync("deploy/compose/Caddyfile", "utf8");
    const combined = readFileSync("deploy/compose/Caddyfile.studio-api", "utf8");
    expect(base).toMatch(/handle\s*\{\s*reverse_proxy amc-studio:3212\s*\}/);
    expect(base).toContain("/__amc/proxy-health");
    expect(combined).toContain("not path /api/v1 /api/v1/*");
    expect(combined).toMatch(/handle @standaloneApi\s*\{\s*reverse_proxy amc-api:3220\s*\}/);
    expect(combined).toMatch(/handle @gateway\s*\{\s*reverse_proxy amc-studio:3210\s*\}/);
    // Actual Caddy execution requires its binary or a Docker daemon; this is a source contract.
  });
});

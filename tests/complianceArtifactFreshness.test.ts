import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * sbom.json declared `agent-maturity-compass 1.0.0` in a repository shipping
 * 1.1.1, generated five months earlier by a one-off `npx cyclonedx-npm` — even
 * though AMC ships its own deterministic CycloneDX generator. The five
 * compliance-*.json reports carried evidence windows that closed in March.
 *
 * Nothing read any of them, so nothing noticed. Stale evidence in an evidence
 * product reads as current, which is worse than none.
 */
describe("committed compliance artifacts", () => {
  it("the freshness gate passes on the current tree", () => {
    const result = spawnSync(process.execPath, ["scripts/compliance-artifact-freshness.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(result.stdout + result.stderr).toContain("current");
    expect(result.status).toBe(0);
  });

  it("the SBOM describes the version actually shipping", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const sbom = JSON.parse(readFileSync(join(process.cwd(), "sbom.json"), "utf8"));
    expect(sbom.metadata.component.version).toBe(pkg.version);
    expect(sbom.metadata.component.name).toBe(pkg.name);
  });

  it("runs in CI, so staleness fails a build rather than sitting unnoticed", () => {
    const ci = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("check:compliance-freshness");
  });
});

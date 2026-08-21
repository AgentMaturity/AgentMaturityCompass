import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateStandardSchemas } from "../src/standard/standardGenerator.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * The Open Compass bundle publishes deliberately permissive JSON Schemas so
 * third parties can extend the format — AMC itself validates against stricter
 * internal zod schemas, so passing the published schema does not mean AMC would
 * accept the artifact.
 *
 * That caveat lived only in a source comment. The bundle ships signed, so a
 * consumer reading amcbench.schema.json saw an authoritative-looking statement
 * of AMC's requirements with nothing marking it as the looser interchange form.
 * The caveat has to travel with the artifact.
 */
describe("published standard schemas", () => {
  it("carry the permissiveness caveat in the artifact, not just the source", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-standard-"));
    try {
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      generateStandardSchemas(workspace);
      const dir = join(workspace, ".amc", "standard", "schemas");
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const schema = JSON.parse(readFileSync(join(dir, file), "utf8"));
        expect(schema.$comment, file).toMatch(/does NOT mean AMC would accept/);
        // The looseness the caveat is warning about must actually be present,
        // otherwise the warning is describing a different document.
        expect(schema.additionalProperties, file).toBe(true);
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

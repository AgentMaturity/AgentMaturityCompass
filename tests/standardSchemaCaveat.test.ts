import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateStandardSchemas } from "../src/standard/standardGenerator.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * The Open Compass bundle used to publish hand-written permissive schemas
 * (`additionalProperties: true`) with a caveat that passing them did NOT mean
 * AMC would accept the artifact. P1-01 replaced them: every published schema is
 * generated from the zod schema AMC parses with, so it states exactly what AMC
 * enforces and needs no caveat. `amc standard generate` writes the same bytes
 * as the committed spec/schemas/v1/ files that `npm run check:schemas` keeps current.
 */
describe("published standard schemas", () => {
  it("are the generated spec schemas, with no permissiveness caveat", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-standard-"));
    try {
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      generateStandardSchemas(workspace);
      const dir = join(workspace, ".amc", "standard", "schemas");
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      expect(files.length).toBe(9);

      for (const file of files) {
        const text = readFileSync(join(dir, file), "utf8");
        expect(text, file).toBe(readFileSync(join("spec", "schemas", "v1", file), "utf8"));
        const schema = JSON.parse(text);
        expect(schema.$comment ?? "", file).not.toMatch(/does NOT mean AMC would accept/);
        expect(schema.additionalProperties, file).not.toBe(true);
        if (file === "external-evidence.schema.json") {
          expect(schema.$id).toBe("https://agentmaturity.co/standards/external-evidence/v1/schema.json");
          expect(schema.$comment).toContain("Shape validation does not establish provenance authority");
          expect(schema.$comment).toContain("independently admitted authority keys");
          expect(schema.$comment).toContain("Import signatures cannot elevate source trust");
          expect(schema.additionalProperties).toBe(false);
          expect(schema.required).toContain("signature");
          continue;
        }
        expect(schema.$id, file).toBe(`https://agentmaturity.co/spec/schemas/v1/${file}`);
        expect(schema.$schema, file).toBe("https://json-schema.org/draft/2020-12/schema");
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doc = () => readFileSync("docs/source-reviews/GAP-0654-agenta-public-methodology.md", "utf8");

describe("GAP-0654 Agenta public methodology source review", () => {
  it("documents live GitHub metadata while failing closed for metadata-only methodology claims", () => {
    const content = doc();

    expect(content).toContain("metadata SHA-256 `2b8997e5dd81298c7c89f42dcae2fe77cad1badba32fa9d9d679a2912c81661f`");
    expect(content).toContain("latest default-branch HEAD | `a97e6083694586a5c5005aefe86272b8736e502f`");
    expect(content).toContain("## Relevance decision");
    expect(content).toContain("Agenta metadata alone must fail closed");
    expect(content).toContain("## AMC/8 surface check");
    expect(content).toContain("No-bloat boundary");
    expect(content).toContain("No Agenta subsystem, SDK, importer, adapter, experiment-platform clone, registry mirror, benchmark runner, parity layer");
    expect(content).toContain("no methodology version bump");
  });
});

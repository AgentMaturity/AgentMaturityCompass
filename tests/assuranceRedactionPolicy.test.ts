import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * G8-19: the assurance policy schema declares storeRawPrompts as a literal
 * false and storeOnlyHashesAndRefs as a literal true — a guarantee, not a
 * default. The evidence writers nonetheless put the full prompt and the agent's
 * complete response into the ledger payload, so scanning a production agent
 * persisted whatever it said, including anything sensitive it had been given.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const writers = readFileSync(join(repoRoot, "src/assurance/evidenceWriters.ts"), "utf8");

describe("assurance redaction policy", () => {
  it("the policy states redaction as a guarantee, not a preference", () => {
    // z.literal(false)/z.literal(true) means these cannot be configured away.
    const schemaSource = readFileSync(
      join(repoRoot, "src/assurance/assurancePolicySchema.ts"),
      "utf8"
    );
    expect(schemaSource).toContain("storeRawPrompts: z.literal(false)");
    expect(schemaSource).toContain("storeOnlyHashesAndRefs: z.literal(true)");
  });

  it("writers no longer put raw scenario text in the ledger payload", () => {
    expect(writers).not.toMatch(/payload:\s*params\.prompt\b/);
    expect(writers).not.toMatch(/payload:\s*params\.response\b/);
    expect(writers).toContain("redactedScenarioPayload");
  });

  it("redacted payloads stay verifiable", () => {
    // A digest lets a holder of the original prove it produced the record,
    // without the record carrying the text.
    expect(writers).toContain("sha256");
    expect(writers).toContain("storeOnlyHashesAndRefs");
  });
});

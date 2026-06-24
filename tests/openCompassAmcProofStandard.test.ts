import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { buildDomainProofArtifact } from "../src/domainProof/domainProofArtifact.js";
import { generateStandardSchemas, validateWithStandard } from "../src/standard/standardGenerator.js";
import { STANDARD_SCHEMA_NAMES } from "../src/standard/standardSchema.js";

const roots: string[] = [];
const previousVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amcproof-standard-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "amcproof-standard-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  process.env.AMC_VAULT_PASSPHRASE = previousVaultPassphrase;
});

describe("Open Compass Standard amcproof schema", () => {
  test("includes amcproof in generated standard schemas and validates proof artifacts", () => {
    expect(STANDARD_SCHEMA_NAMES).toContain("amcproof.schema.json");

    const ws = workspace();
    const generated = generateStandardSchemas(ws);
    expect(generated.schemaNames).toContain("amcproof.schema.json");

    const artifact = buildDomainProofArtifact({
      proofId: "amcproof_standard_001",
      generatedTs: 1_800_000_000_000,
      proofClass: "domain_correctness",
      domainId: "governance",
      claimText: "The toy governance answer follows the declared rule set.",
      sourceManifestHash: HASH_A,
      formalSpecHash: HASH_B,
      ruleRefs: [{
        sourceId: "toy-governance-rules",
        clauseId: "TG-1",
        effectiveDate: "2026-06-21",
        url: "file://fixtures/domain-proof/toy-governance/source-rules.md",
        hash: HASH_C,
      }],
      assumptions: ["Toy facts are complete."],
      constraintsChecked: ["age >= 18"],
      result: "proven",
      humanReview: { status: "not_required" },
      evidenceRefs: ["ev-standard-1"],
      signedEvidenceRefs: ["ev-standard-1"],
    });
    const file = join(ws, "proof.json");
    writeFileSync(file, JSON.stringify(artifact, null, 2));

    const validate = validateWithStandard({ workspace: ws, schemaId: "amcproof", file });
    expect(validate.ok, validate.errors.join("\n")).toBe(true);
  });
});

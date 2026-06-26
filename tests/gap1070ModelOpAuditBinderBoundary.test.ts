import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  createAuditBinderArtifact,
  inspectAuditBinder,
} from "../src/audit/binderArtifact.js";
import { scanBinderForPii } from "../src/audit/binderRedaction.js";
import { verifyAuditBinderFile } from "../src/audit/binderVerifier.js";

const DOC = "docs/source-reviews/GAP-1070-modelop-audit-binder.md";
const HOME = "https://www.modelop.com";
const AI_GOVERNANCE_SOFTWARE = "https://www.modelop.com/ai-governance-software";
const INVENTORY = "https://www.modelop.com/ai-governance-software/inventory";
const REPORTING = "https://www.modelop.com/ai-governance-software/reporting";
const CONTROLS = "https://www.modelop.com/ai-governance-software/controls";
const FINANCIAL_SERVICES = "https://www.modelop.com/solutions/financial-services";
const LEGAL_RISK_COMPLIANCE = "https://www.modelop.com/solutions/legal-risk-compliance-leaders";
const AI_GOVERNANCE = "https://www.modelop.com/ai-governance";
const SR_11_7 = "https://www.modelop.com/ai-governance/ai-regulations-standards/sr-11-7";
const NIST_AI_RMF = "https://www.modelop.com/ai-governance/ai-regulations-standards/nist-ai-rmf";
const EU_AI_ACT = "https://www.modelop.com/ai-governance/ai-regulations-standards/eu-ai-act";
const TITLE = "Industrialized AI Delivery for Enterprise Leaders - ModelOp";
const SOFTWARE_TITLE = "ModelOp Center - AI Governance Software";
const INVENTORY_TITLE = "Evergreen AI Model Inventory | ModelOp";
const REPORTING_TITLE = "AI Governance Reporting Engine";
const IDENTIFIER = "modelop_audit_binder";

const implementationFiles = [
  "src/audit/binderArtifact.ts",
  "src/audit/binderSchema.ts",
  "src/audit/binderCollector.ts",
  "src/audit/binderVerifier.ts",
  "src/passport/trustInterchange.ts",
  "src/vault/vault.ts",
  "docs/AUDIT_BINDER.md",
];

const roots: string[] = [];
const originalVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1070-binder-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "gap1070-audit-binder-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function untar(bundleFile: string, outDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outDir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to extract binder: ${out.stderr || out.stdout}`);
  }
}

function retar(rootDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", rootDir, "amc-audit"], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to repack binder: ${out.stderr || out.stdout}`);
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  if (originalVaultPassphrase === undefined) {
    delete process.env.AMC_VAULT_PASSPHRASE;
  } else {
    process.env.AMC_VAULT_PASSPHRASE = originalVaultPassphrase;
  }
});

describe("GAP-1070 ModelOp audit-binder boundary", () => {
  it("documents live ModelOp metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1070");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(AI_GOVERNANCE_SOFTWARE);
    expect(doc).toContain(INVENTORY);
    expect(doc).toContain(REPORTING);
    expect(doc).toContain(CONTROLS);
    expect(doc).toContain(FINANCIAL_SERVICES);
    expect(doc).toContain(LEGAL_RISK_COMPLIANCE);
    expect(doc).toContain(AI_GOVERNANCE);
    expect(doc).toContain(SR_11_7);
    expect(doc).toContain(NIST_AI_RMF);
    expect(doc).toContain(EU_AI_ACT);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("content-type `text/html; charset=utf-8`");
    expect(doc).toContain("server `cloudflare`");
    expect(doc).toContain(SOFTWARE_TITLE);
    expect(doc).toContain(INVENTORY_TITLE);
    expect(doc).toContain(REPORTING_TITLE);
    expect(doc).toContain("Automate AI Governance Workflows");
    expect(doc).toContain("AI Governance for Finance");
    expect(doc).toContain("AI Governance for Legal, Risk");
    expect(doc).toContain("SR 11-7 Model Risk Management");
    expect(doc).toContain("NIST AI RMF");
    expect(doc).toContain("EU AI Act");
    expect(doc).toContain("auditor-ready evidence binder");
    expect(doc).toContain("Binder manifest");
    expect(doc).toContain("control index");
    expect(doc).toContain("receipt hashes");
    expect(doc).toContain("reviewer notes");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing signed audit binder as the auditor-ready evidence package", async () => {
    const ws = workspace();
    const created = await createAuditBinderArtifact({
      workspace: ws,
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      outFile: ".amc/audit/binders/exports/workspace/workspace/gap1070.amcaudit",
      nowTs: 1_782_349_000_000,
    });

    expect(created.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.signature.digestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.piiScan.status).toBe("PASS");
    expect(created.binder.v).toBe(1);
    expect(created.binder.binderId).toMatch(/^ab_[a-f0-9]{16}_\d+$/);
    expect(created.binder.scope.type).toBe("WORKSPACE");
    expect(created.binder.bindings.auditPolicySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.binder.bindings.auditMapSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.binder.proofBindings.calculationManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.binder.proofBindings.transparencyRootSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.binder.proofBindings.merkleRootSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created.binder.sections.controls.mapId).toBeTruthy();
    expect(created.binder.sections.controls.families.length).toBeGreaterThanOrEqual(9);
    expect(created.binder.sections.controls.families.flatMap((family) => family.controls).length).toBeGreaterThanOrEqual(36);
    expect(Array.isArray(created.binder.sections.maturity.notes)).toBe(true);
    expect(Array.isArray(created.binder.sections.governance.identity.notes)).toBe(true);
    expect(Array.isArray(created.binder.sections.assurance.notes)).toBe(true);

    const verified = verifyAuditBinderFile({
      file: created.outFile,
      workspace: ws,
    });
    expect(verified.ok, JSON.stringify(verified.errors)).toBe(true);
    expect(verified.fileSha256).toBe(created.sha256);

    const inspected = inspectAuditBinder(created.outFile);
    expect(inspected.binder.binderId).toBe(created.binder.binderId);
    expect(inspected.signature.digestSha256).toBe(created.signature.digestSha256);
    expect(inspected.piiScan?.status).toBe("PASS");
  });

  it("fails closed when ModelOp metadata replaces signed binder evidence", async () => {
    const ws = workspace();
    const created = await createAuditBinderArtifact({
      workspace: ws,
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      outFile: ".amc/audit/binders/exports/workspace/workspace/gap1070-tamper.amcaudit",
      nowTs: 1_782_349_001_000,
    });

    const tamperRoot = mkdtempSync(join(tmpdir(), "amc-gap1070-tamper-"));
    roots.push(tamperRoot);
    untar(created.outFile, tamperRoot);
    const binderPath = join(tamperRoot, "amc-audit", "binder.json");
    const binder = JSON.parse(readFileSync(binderPath, "utf8")) as {
      sections: { maturity: { notes: string[] } };
    };
    binder.sections.maturity.notes.push("ModelOp page metadata only cannot replace signed AMC evidence.");
    writeFileSync(binderPath, `${JSON.stringify(binder)}\n`, "utf8");
    const tamperedFile = join(tamperRoot, "tampered.amcaudit");
    retar(tamperRoot, tamperedFile);

    const verified = verifyAuditBinderFile({
      file: tamperedFile,
      workspace: ws,
    });
    expect(verified.ok).toBe(false);
    expect(verified.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "DIGEST_MISMATCH",
      "SIGNATURE_INVALID",
    ]));

    const metadataOnlyScan = scanBinderForPii({
      source: "ModelOp",
      reviewerNotes: "Contact auditor@example.com for a copy of the competitor evidence package.",
    });
    expect(metadataOnlyScan.status).toBe("FAIL");
    expect(metadataOnlyScan.findings.some((finding) => finding.type === "EMAIL")).toBe(true);
  });

  it("does not add ModelOp source identifiers to generic audit, passport, or vault implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("modelop.com");
      expect(source).not.toContain("ModelOp");
      expect(source).not.toContain("COMP-125");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

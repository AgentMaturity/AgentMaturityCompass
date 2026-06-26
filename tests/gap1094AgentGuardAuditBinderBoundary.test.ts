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

const DOC = "docs/source-reviews/GAP-1094-agentguard-audit-binder.md";
const REPO = "https://github.com/WhitzardAgent/AgentGuard";
const README = "https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/pyproject.toml";
const PACKAGE = "https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/package.json";
const ENV_EXAMPLE = "https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/.env.example";
const RELEASE = "https://github.com/WhitzardAgent/AgentGuard/releases/tag/v2.0";
const TITLE = "AgentGuard: Zero-Trust Security Foundation for AI Agents";
const IDENTIFIER = "agentguard_audit_binder";

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
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1094-binder-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "gap1094-audit-binder-passphrase";
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

describe("GAP-1094 AgentGuard audit-binder boundary", () => {
  it("documents live AgentGuard metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1094");
    expect(doc).toContain("Auditor-ready evidence binder");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(PACKAGE);
    expect(doc).toContain(ENV_EXAMPLE);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("commit `a75abb85e8525fcc7341b615934b39c6679b7012`");
    expect(doc).toContain("verification reason `unsigned`");
    expect(doc).toContain("license `GPL-3.0`");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("stars `77`");
    expect(doc).toContain("forks `9`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("latest release `v2.0`");
    expect(doc).toContain("release published `2026-06-21T13:20:09Z`");
    expect(doc).toContain("package name `agentguard`");
    expect(doc).toContain("package version `0.3.0`");
    expect(doc).toContain("requires-python `>=3.11`");
    expect(doc).toContain("access-control");
    expect(doc).toContain("policy-engine");
    expect(doc).toContain("zero-trust");
    expect(doc).toContain("README.md first 200 KB SHA-256 `7cef855103b9b1e181c063617a20dd7ee9c31146dd40d128b3f72970e890eaf6`");
    expect(doc).toContain("LICENSE first 200 KB SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`");
    expect(doc).toContain("pyproject.toml first 200 KB SHA-256 `e1cc9c457f65b281ba78b5cc2c692a10c7cb2795ff19c058fa964dea0f124bde`");
    expect(doc).toContain("package.json first 200 KB SHA-256 `55b5b2d95a650e417f7ed63daf9bd59893aced62eb39b97f7a0ecb7eb5bb46a3`");
    expect(doc).toContain(".env.example first 200 KB SHA-256 `370d4b99784af426986a5964f9c5f9584646a7da4795393fdcfc27d1a1c54db4`");
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
      outFile: ".amc/audit/binders/exports/workspace/workspace/gap1094.amcaudit",
      nowTs: 1_782_410_800_000,
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

  it("fails closed when AgentGuard metadata replaces signed binder evidence", async () => {
    const ws = workspace();
    const created = await createAuditBinderArtifact({
      workspace: ws,
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      outFile: ".amc/audit/binders/exports/workspace/workspace/gap1094-tamper.amcaudit",
      nowTs: 1_782_410_801_000,
    });

    const tamperRoot = mkdtempSync(join(tmpdir(), "amc-gap1094-tamper-"));
    roots.push(tamperRoot);
    untar(created.outFile, tamperRoot);
    const binderPath = join(tamperRoot, "amc-audit", "binder.json");
    const binder = JSON.parse(readFileSync(binderPath, "utf8")) as {
      sections: { maturity: { notes: string[] } };
    };
    binder.sections.maturity.notes.push("AgentGuard repository metadata only cannot replace signed AMC evidence.");
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
      source: "AgentGuard",
      reviewerNotes: "Contact auditor@example.com for a copy of the repository evidence package.",
    });
    expect(metadataOnlyScan.status).toBe("FAIL");
    expect(metadataOnlyScan.findings.some((finding) => finding.type === "EMAIL")).toBe(true);
  });

  it("does not add AgentGuard source identifiers to generic audit, passport, or vault implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("WhitzardAgent/AgentGuard");
      expect(source).not.toContain("AgentGuard");
      expect(source).not.toContain("agentguard");
      expect(source).not.toContain("a75abb85e8525fcc7341b615934b39c6679b7012");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

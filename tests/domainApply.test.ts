import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyDomainToAgent } from "../src/domains/domainApply.js";
import { createIndustryPackLicenseKey } from "../src/domains/industryPackEntitlement.js";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-domain-apply-"));
  workspaces.push(workspace);
  return workspace;
}

afterEach(() => {
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY;
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (!workspace) continue;
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("domain apply", () => {
  beforeEach(() => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
    process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY = createIndustryPackLicenseKey({
      subscriptionId: "sub_domain_apply_test",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
  });

  test("apply health domain to default agent", async () => {
    const workspace = createWorkspace();
    const result = await applyDomainToAgent({
      agentId: "default",
      domain: "health",
      workspacePath: workspace
    });

    expect(result.domain).toBe("health");
    expect(result.packsApplied.length).toBeGreaterThan(0);
    expect(result.guardrailsGenerated).toBeGreaterThan(0);

    const targetFile = join(workspace, "AGENTS.md");
    expect(existsSync(targetFile)).toBe(true);
    const content = readFileSync(targetFile, "utf8");
    expect(content).toContain("AMC-GUARDRAILS-START");
    expect(content).toContain("[DOMAIN: Health]");

    const guardrailsPath = join(workspace, ".amc", "guardrails.yaml");
    expect(existsSync(guardrailsPath)).toBe(true);
    expect(readFileSync(guardrailsPath, "utf8")).toContain("domainApply:");
  });

  test("apply specific pack (clinical-trials)", async () => {
    const workspace = createWorkspace();
    const result = await applyDomainToAgent({
      agentId: "default",
      packId: "clinical-trials",
      workspacePath: workspace
    });

    expect(result.domain).toBe("health");
    expect(result.packsApplied).toEqual(["clinical-trials"]);

    const targetFile = join(workspace, "AGENTS.md");
    const content = readFileSync(targetFile, "utf8");
    expect(content).toContain("[PACK: clinical-trials]");
    expect(content).not.toContain("[PACK: digital-health-record]");
  });

  test("dry-run mode does not write files", async () => {
    const workspace = createWorkspace();
    const result = await applyDomainToAgent({
      agentId: "default",
      domain: "health",
      dryRun: true,
      workspacePath: workspace
    });

    expect(result.dryRun).toBe(true);
    expect(result.configFileUpdated).toBe(join(workspace, "AGENTS.md"));
    expect(existsSync(join(workspace, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(workspace, ".amc", "guardrails.yaml"))).toBe(false);
  });

  test("idempotent: running twice does not duplicate guardrails", async () => {
    const workspace = createWorkspace();
    const opts = {
      agentId: "default",
      domain: "health",
      workspacePath: workspace
    } as const;

    await applyDomainToAgent(opts);
    const targetFile = join(workspace, "AGENTS.md");
    const first = readFileSync(targetFile, "utf8");

    await applyDomainToAgent(opts);
    const second = readFileSync(targetFile, "utf8");

    expect(second).toBe(first);
    const markerCount = (second.match(/AMC-GUARDRAILS-START/g) ?? []).length;
    expect(markerCount).toBe(1);
  });

  test("apply emits a sourced operating profile outside .amc and keeps the prior result shape", async () => {
    const workspace = createWorkspace();
    const result = await applyDomainToAgent({
      agentId: "default",
      domain: "health",
      workspacePath: workspace
    });

    // Backward compatibility: every field the CLI printed before 2026-10-03 is still there with the same type.
    expect(typeof result.agentId).toBe("string");
    expect(typeof result.domain).toBe("string");
    expect(Array.isArray(result.packsApplied)).toBe(true);
    expect(typeof result.guardrailsGenerated).toBe("number");
    expect(typeof result.configFileUpdated).toBe("string");
    expect(Array.isArray(result.guardrailsEnabled)).toBe(true);
    expect(Array.isArray(result.complianceFrameworks)).toBe(true);
    expect(typeof result.assessmentScore.composite).toBe("number");
    expect(typeof result.assessmentScore.level).toBe("string");
    expect(typeof result.assessmentScore.gaps).toBe("number");
    expect(result.dryRun).toBe(false);

    // The only thing apply writes under .amc/ is what it wrote at 8f57ce63: guardrails.yaml.
    expect(readdirSync(join(workspace, ".amc")).sort()).toEqual(["guardrails.yaml"]);

    const profilePath = join(workspace, "amc-operating-profiles", "default", "health.operating-profile.json");
    expect(result.operatingProfile).toEqual({
      station: "health",
      riskTier: "critical",
      path: profilePath,
      written: true,
      consistency: { ok: true, violations: [] }
    });
    expect(existsSync(profilePath)).toBe(true);
    const profile = JSON.parse(readFileSync(profilePath, "utf8")) as Record<string, unknown>;
    for (const section of ["incidentReportingClocks", "retention", "approvals", "toolAllowlist", "budgets", "firewall", "auditSampling", "humanOversight"]) {
      expect(profile[section], section).toBeDefined();
    }
    const clocks = profile.incidentReportingClocks as Array<{ source: { url: string; retrievedAt: string } }>;
    expect(clocks.length).toBeGreaterThan(0);
    for (const clock of clocks) {
      expect(clock.source.url.length).toBeGreaterThan(0);
      expect(clock.source.retrievedAt).toBe("2026-10-03");
    }
    const approvals = profile.approvals as Record<string, { value: { requiredApprovals: number; requireDistinctUsers: boolean }; source: { title: string } }>;
    expect(approvals.WRITE_HIGH.value.requiredApprovals).toBeGreaterThanOrEqual(2);
    expect(approvals.WRITE_HIGH.value.requireDistinctUsers).toBe(true);
    expect(approvals.WRITE_HIGH.source.title.length).toBeGreaterThan(0);
    const operatorFlow = profile.operatorFlow as string[];
    expect(operatorFlow.join("\n")).toContain("amc budgets sign");
    expect(operatorFlow.join("\n")).toContain("amc ops sign");
  });

  test("apply refuses a profile target under .amc and writes nothing there", async () => {
    const workspace = createWorkspace();
    await expect(
      applyDomainToAgent({
        agentId: "default",
        domain: "health",
        workspacePath: workspace,
        profileOut: ".amc/operating-profile.json"
      })
    ).rejects.toThrow(/Refusing to write an operating profile under/);
    // Fail fast: the refusal happens before the guardrails or anything under .amc/ are written.
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
    expect(existsSync(join(workspace, "AGENTS.md"))).toBe(false);
  });

  test("dry-run reports the profile path without writing it", async () => {
    const workspace = createWorkspace();
    const result = await applyDomainToAgent({
      agentId: "default",
      domain: "wealth",
      dryRun: true,
      workspacePath: workspace
    });
    expect(result.operatingProfile.written).toBe(false);
    expect(result.operatingProfile.riskTier).toBe("high");
    expect(existsSync(result.operatingProfile.path)).toBe(false);
    expect(existsSync(join(workspace, "amc-operating-profiles"))).toBe(false);
  });

  test("invalid domain throws helpful error", async () => {
    const workspace = createWorkspace();
    await expect(
      applyDomainToAgent({
        agentId: "default",
        domain: "not-a-domain",
        workspacePath: workspace
      })
    ).rejects.toThrow(/Unknown domain: not-a-domain/);
  });
});

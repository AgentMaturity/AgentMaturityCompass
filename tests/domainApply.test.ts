import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

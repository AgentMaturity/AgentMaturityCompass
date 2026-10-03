import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { loadApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { loadBudgetsConfig } from "../src/budgets/budgets.js";
import { loadActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { loadOpsPolicy } from "../src/ops/policy.js";
import { toolsConfigSchema } from "../src/toolhub/toolsSchema.js";
import { getDomainMetadata, listDomainIds, type Domain } from "../src/domains/domainRegistry.js";
import {
  REQUIRED_PROFILE_SECTIONS,
  assertOutsideSignedConfigTree,
  buildOperatingProfile,
  checkOperatingProfileConsistency,
  defaultOperatingProfilePath,
  emitOperatingProfile,
  listProfileSources,
  profileRiskTier,
  type OperatingProfile
} from "../src/domains/operatingProfiles/index.js";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-operating-profile-"));
  workspaces.push(workspace);
  return workspace;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

function isSourced(value: unknown): value is { value: unknown; source: Record<string, unknown>; basis: string } {
  return !!value && typeof value === "object" && "value" in value && "source" in value && "basis" in value;
}

function collectSourced(value: unknown, path: string, out: Array<{ path: string; entry: { source: Record<string, unknown>; basis: string } }>): void {
  if (isSourced(value)) {
    out.push({ path, entry: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSourced(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) collectSourced(child, `${path}.${key}`, out);
  }
}

const CRITICAL_STATIONS: Domain[] = listDomainIds().filter((domain) => getDomainMetadata(domain).riskLevel === "critical");

describe("station operating profiles", () => {
  test("every station builds a consistent profile with every required section", () => {
    for (const station of listDomainIds()) {
      const profile = buildOperatingProfile({ station, generatedAt: "2026-10-03T00:00:00.000Z" });
      expect(profile.consistency.violations, `${station}: ${profile.consistency.violations.join("; ")}`).toEqual([]);
      expect(profile.consistency.ok).toBe(true);
      for (const section of REQUIRED_PROFILE_SECTIONS) {
        expect(profile[section], `${station}.${section}`).toBeDefined();
      }
      expect(profile.incidentReportingClocks.length, `${station} clocks`).toBeGreaterThan(0);
      expect(profile.derivedFrom.assurancePacks.length, `${station} assurance packs`).toBeGreaterThan(0);
      expect(profile.derivedFrom.industryPacks.length, `${station} industry packs`).toBeGreaterThan(0);
    }
  });

  test("every setting and clock in every station cites a dated source and a basis sentence", () => {
    for (const station of listDomainIds()) {
      const profile = buildOperatingProfile({ station });
      const entries: Array<{ path: string; entry: { source: Record<string, unknown>; basis: string } }> = [];
      for (const section of REQUIRED_PROFILE_SECTIONS) collectSourced(profile[section], `${station}.${section}`, entries);
      for (const clockEntry of profile.incidentReportingClocks) {
        entries.push({ path: `${station}.incidentReportingClocks.${clockEntry.id}`, entry: { source: clockEntry.source as unknown as Record<string, unknown>, basis: clockEntry.basis } });
      }
      expect(entries.length, station).toBeGreaterThan(20);
      for (const { path, entry } of entries) {
        expect(typeof entry.source.title === "string" && entry.source.title.length > 0, `${path} title`).toBe(true);
        expect(typeof entry.source.url === "string" && entry.source.url.length > 0, `${path} url`).toBe(true);
        expect(entry.source.retrievedAt, `${path} retrievedAt`).toBe("2026-10-03");
        expect(typeof entry.source.verified, `${path} verified flag`).toBe("boolean");
        if (entry.source.verified === false) {
          expect(typeof entry.source.reason === "string" && entry.source.reason.length > 0, `${path} unverified reason`).toBe(true);
        }
        expect(entry.basis.trim().length, `${path} basis`).toBeGreaterThan(10);
      }
    }
  });

  test("critical-tier stations require two distinct approvals for WRITE_HIGH, block-mode firewall and zero autonomous SECURITY executes", () => {
    expect(CRITICAL_STATIONS).toEqual(expect.arrayContaining(["health", "environment", "mobility"]));
    for (const station of CRITICAL_STATIONS) {
      const profile = buildOperatingProfile({ station });
      expect(profile.riskTier).toBe("critical");
      expect(profileRiskTier(station)).toBe("critical");
      expect(profile.approvals.WRITE_HIGH?.value.requiredApprovals, station).toBeGreaterThanOrEqual(2);
      expect(profile.approvals.WRITE_HIGH?.value.requireDistinctUsers, station).toBe(true);
      expect(profile.firewall.mode.value, station).toBe("block");
      expect(profile.firewall.failClosedOnMissingPolicy.value, station).toBe(true);
      expect(profile.budgets.dailyMaxToolExecutes.SECURITY?.value, station).toBe(0);
      expect(profile.toolAllowlist.execTicketClasses.value, station).toEqual(expect.arrayContaining(["WRITE_HIGH", "DEPLOY", "SECURITY"]));
    }
    for (const station of listDomainIds().filter((domain) => !CRITICAL_STATIONS.includes(domain))) {
      const profile = buildOperatingProfile({ station });
      expect(profile.riskTier).toBe("high");
      expect(profile.approvals.WRITE_HIGH?.value.requiredApprovals, station).toBeGreaterThanOrEqual(1);
    }
  });

  test("the consistency check rejects a critical station whose WRITE_HIGH approval is removed", () => {
    const profile = buildOperatingProfile({ station: "health" });
    const broken: OperatingProfile = JSON.parse(JSON.stringify(profile)) as OperatingProfile;
    broken.approvals.WRITE_HIGH!.value.requiredApprovals = 0;
    const result = checkOperatingProfileConsistency(broken);
    expect(result.ok).toBe(false);
    expect(result.violations.join("\n")).toMatch(/approvals\.WRITE_HIGH: critical tier requires at least 2 approvals/);
    expect(result.violations.join("\n")).toMatch(/proposedSignedConfigs\.approvalPolicy\.WRITE_HIGH: does not mirror/);
  });

  test("the consistency check rejects a critical station whose firewall is not in block mode", () => {
    const profile = buildOperatingProfile({ station: "environment" });
    const broken: OperatingProfile = JSON.parse(JSON.stringify(profile)) as OperatingProfile;
    broken.firewall.mode.value = "warn";
    const result = checkOperatingProfileConsistency(broken);
    expect(result.ok).toBe(false);
    expect(result.violations.join("\n")).toMatch(/firewall\.mode: critical tier requires block/);
  });

  test("the consistency check rejects a setting that lost its source", () => {
    const profile = buildOperatingProfile({ station: "wealth" });
    const broken = JSON.parse(JSON.stringify(profile)) as OperatingProfile;
    (broken.retention.auditLogDays as unknown as { source: unknown }).source = { title: "", url: "", reference: "", retrievedAt: "", verified: true };
    const result = checkOperatingProfileConsistency(broken);
    expect(result.ok).toBe(false);
    expect(result.violations.join("\n")).toMatch(/retention\.auditLogDays: source\.title empty/);
  });

  test("proposed signed configs parse through the real policy loaders and schemas", () => {
    for (const station of listDomainIds()) {
      const profile = buildOperatingProfile({ station, agentId: "default" });
      const workspace = createWorkspace();
      // The operator's edit step, simulated in a throwaway workspace: the
      // fragments are written where the loaders read them and parsed by the
      // same zod schemas the signing commands use.
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      writeFileSync(join(workspace, "approval-policy.yaml"), YAML.stringify(profile.proposedSignedConfigs.approvalPolicy));
      writeFileSync(join(workspace, "action-policy.yaml"), YAML.stringify(profile.proposedSignedConfigs.actionPolicy));
      writeFileSync(join(workspace, ".amc", "budgets.yaml"), YAML.stringify(profile.proposedSignedConfigs.budgets));
      writeFileSync(join(workspace, ".amc", "ops-policy.yaml"), YAML.stringify(profile.proposedSignedConfigs.opsPolicy));

      const approval = loadApprovalPolicy(workspace, "approval-policy.yaml");
      expect(approval.approvalPolicy.actionClasses.WRITE_HIGH?.requiredApprovals).toBe(profile.approvals.WRITE_HIGH?.value.requiredApprovals);
      const action = loadActionPolicy(workspace, "action-policy.yaml");
      expect(action.defaultMode).toBe("DENY");
      const budgets = loadBudgetsConfig(workspace);
      for (const [actionClass, setting] of Object.entries(profile.budgets.dailyMaxToolExecutes)) {
        expect(budgets.budgets.perAgent.default?.daily.maxToolExecutes[actionClass as keyof typeof budgets.budgets.perAgent.default.daily.maxToolExecutes], `${station} ${actionClass}`).toBe(setting?.value);
      }
      const ops = loadOpsPolicy(workspace);
      expect(ops.opsPolicy.retention.keepArchiveSegmentsDays).toBe(profile.retention.auditLogDays.value);
      expect(ops.opsPolicy.retention.prunePayloadsAfterDays).toBe(profile.retention.payloadPruneDays.value);
      const tools = toolsConfigSchema.parse(profile.proposedSignedConfigs.tools);
      expect(tools.tools.denyByDefault).toBe(true);
      const firewall = profile.proposedSignedConfigs.firewall as { mode: string; failClosedOnMissingPolicy: boolean; rules: Record<string, unknown> };
      expect(firewall.mode).toBe(profile.firewall.mode.value);
      expect(firewall.failClosedOnMissingPolicy).toBe(profile.firewall.failClosedOnMissingPolicy.value);
    }
  });

  test("emit writes the profile outside .amc and refuses any target inside it", () => {
    const workspace = createWorkspace();
    const emitted = emitOperatingProfile({ workspacePath: workspace, station: "health", agentId: "default" });
    expect(emitted.written).toBe(true);
    expect(emitted.path).toBe(defaultOperatingProfilePath(workspace, "default", "health"));
    expect(emitted.path.includes(`${join(workspace, ".amc")}`)).toBe(false);
    expect(existsSync(emitted.path)).toBe(true);
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
    const parsed = JSON.parse(readFileSync(emitted.path, "utf8")) as OperatingProfile;
    expect(parsed.station).toBe("health");
    expect(parsed.operatorFlow.some((line) => line.includes("amc budgets sign"))).toBe(true);

    for (const target of [".amc", ".amc/profile.json", join(workspace, ".amc", "nested", "p.json")]) {
      expect(() => emitOperatingProfile({ workspacePath: workspace, station: "health", agentId: "default", outputPath: target }), target).toThrow(/Refusing to write an operating profile under/);
    }
    expect(() => assertOutsideSignedConfigTree(workspace, join(workspace, ".amcx", "p.json"))).not.toThrow();
    expect(() => assertOutsideSignedConfigTree(workspace, join(workspace, "profiles", "p.json"))).not.toThrow();
  });

  test("emit in dry-run mode builds the profile but writes nothing", () => {
    const workspace = createWorkspace();
    const emitted = emitOperatingProfile({ workspacePath: workspace, station: "wealth", agentId: "default", dryRun: true });
    expect(emitted.written).toBe(false);
    expect(emitted.consistency.ok).toBe(true);
    expect(existsSync(emitted.path)).toBe(false);
  });

  test("every unverified source says why the primary text was not read", () => {
    const sources = listProfileSources();
    expect(sources.length).toBeGreaterThan(30);
    for (const source of sources) {
      expect(source.retrievedAt).toBe("2026-10-03");
      if (!source.verified) expect(source.reason?.length ?? 0, source.id).toBeGreaterThan(10);
    }
  });
});

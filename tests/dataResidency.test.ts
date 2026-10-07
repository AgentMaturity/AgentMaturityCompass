import { afterEach, describe, expect, test } from "vitest";
import {
  createResidencyPolicy,
  getResidencyPolicies,
  getResidencyPolicy,
  getPolicyForRegion,
  registerTenant,
  getTenants,
  getTenant,
  checkTenantIsolation,
  checkAllTenantIsolation,
  issueLegalHold,
  releaseLegalHold,
  getActiveLegalHolds,
  isTenantUnderLegalHold,
  getBuiltInRedactionRules,
  applyRedaction,
  runRedactionTests,
  getKeyCustodyConfig,
  listKeyCustodyModes,
  isRegionAllowed,
  validateDataTransfer,
  generateResidencyReport,
  renderResidencyReportMarkdown,
  resetDataResidencyState,
} from "../src/compliance/dataResidency.js";

afterEach(() => {
  resetDataResidencyState();
});

// ---------------------------------------------------------------------------
// Residency policies
// ---------------------------------------------------------------------------
describe("residency policies", () => {
  test("creates a policy with defaults", () => {
    const policy = createResidencyPolicy({ region: "eu-west-1" });
    expect(policy.policyId).toMatch(/^rp_/);
    expect(policy.region).toBe("eu-west-1");
    expect(policy.isolationLevel).toBe("strict");
    expect(policy.keyCustodyMode).toBe("local");
    expect(policy.requireEncryptionAtRest).toBe(true);
    expect(policy.requireEncryptionInTransit).toBe(true);
    expect(policy.policyHash.length).toBe(64);
  });

  test("lists and retrieves policies", () => {
    const p1 = createResidencyPolicy({ region: "us-east-1" });
    const p2 = createResidencyPolicy({ region: "eu-west-1" });
    expect(getResidencyPolicies().length).toBe(2);
    expect(getResidencyPolicy(p1.policyId)?.region).toBe("us-east-1");
    expect(getPolicyForRegion("eu-west-1")?.policyId).toBe(p2.policyId);
  });

  test("policy with custom settings", () => {
    const policy = createResidencyPolicy({
      region: "eu-central-1",
      isolationLevel: "federated",
      keyCustodyMode: "external-kms",
      denyRegions: ["us-east-1", "us-west-2"],
      retentionMinDays: 90,
      retentionMaxDays: 730,
      legalHoldEnabled: true,
      privacyRedactionEnabled: true,
    });
    expect(policy.isolationLevel).toBe("federated");
    expect(policy.keyCustodyMode).toBe("external-kms");
    expect(policy.denyRegions).toContain("us-east-1");
    expect(policy.retentionMinDays).toBe(90);
    expect(policy.legalHoldEnabled).toBe(true);
    expect(policy.privacyRedactionEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tenant boundaries
// ---------------------------------------------------------------------------
describe("tenant boundaries", () => {
  test("registers and retrieves tenants", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws2", region: "eu-west-1" });
    expect(getTenants().length).toBe(2);
    expect(getTenant("t1")?.workspaceId).toBe("ws1");
    expect(getTenant("t2")?.region).toBe("eu-west-1");
  });

  test("tenant has default isolation settings", () => {
    const t = registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    expect(t.isolationLevel).toBe("strict");
    expect(t.keyCustodyMode).toBe("local");
  });

  test("returns null for unknown tenant", () => {
    expect(getTenant("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation checks
// ---------------------------------------------------------------------------
describe("tenant isolation checks", () => {
  test("isolated tenants in different workspaces pass", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws2", region: "eu-west-1" });
    const check = checkTenantIsolation("t1", "t2");
    expect(check.isolated).toBe(true);
    expect(check.violations.length).toBe(0);
  });

  test("detects cross-tenant data leak in same workspace", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws-shared", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws-shared", region: "us-east-1" });
    const check = checkTenantIsolation("t1", "t2");
    expect(check.isolated).toBe(false);
    expect(check.violations.some((v) => v.violationType === "cross_tenant_data_leak")).toBe(true);
  });

  test("detects shared key material in same workspace with strict isolation", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws-shared", region: "us-east-1", isolationLevel: "strict" });
    registerTenant({ tenantId: "t2", workspaceId: "ws-shared", region: "us-east-1", isolationLevel: "strict" });
    const check = checkTenantIsolation("t1", "t2");
    expect(check.violations.some((v) => v.violationType === "shared_key_material")).toBe(true);
  });

  test("detects region policy conflicts", () => {
    createResidencyPolicy({ region: "us-east-1", denyRegions: ["eu-west-1"] });
    createResidencyPolicy({ region: "eu-west-1" });
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws2", region: "eu-west-1" });
    const check = checkTenantIsolation("t1", "t2");
    expect(check.violations.some((v) => v.violationType === "region_mismatch")).toBe(true);
  });

  test("detects isolation level downgrade", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1", isolationLevel: "strict" });
    registerTenant({ tenantId: "t2", workspaceId: "ws2", region: "us-east-1", isolationLevel: "shared" });
    const check = checkTenantIsolation("t1", "t2");
    expect(check.violations.some((v) => v.violationType === "isolation_level_downgrade")).toBe(true);
  });

  test("checkAllTenantIsolation checks all pairs", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws2", region: "eu-west-1" });
    registerTenant({ tenantId: "t3", workspaceId: "ws3", region: "ap-southeast-1" });
    const checks = checkAllTenantIsolation();
    expect(checks.length).toBe(3); // 3 pairs: (t1,t2), (t1,t3), (t2,t3)
  });

  test("handles unknown tenants gracefully", () => {
    const check = checkTenantIsolation("unknown-a", "unknown-b");
    expect(check.isolated).toBe(true);
    expect(check.violations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Legal holds
// ---------------------------------------------------------------------------
describe("legal holds", () => {
  test("issues and retrieves a legal hold", () => {
    const hold = issueLegalHold({ tenantId: "t1", reason: "Investigation", issuedBy: "Legal" });
    expect(hold.holdId).toMatch(/^lh_/);
    expect(hold.active).toBe(true);
    expect(hold.holdHash.length).toBe(64);
    expect(getActiveLegalHolds("t1").length).toBe(1);
  });

  test("releases a legal hold", () => {
    const hold = issueLegalHold({ tenantId: "t1", reason: "Test", issuedBy: "Legal" });
    expect(releaseLegalHold(hold.holdId)).toBe(true);
    expect(getActiveLegalHolds("t1").length).toBe(0);
  });

  test("release fails for unknown hold", () => {
    expect(releaseLegalHold("lh_nonexistent")).toBe(false);
  });

  test("isTenantUnderLegalHold returns correct status", () => {
    expect(isTenantUnderLegalHold("t1")).toBe(false);
    issueLegalHold({ tenantId: "t1", reason: "Test", issuedBy: "Legal" });
    expect(isTenantUnderLegalHold("t1")).toBe(true);
  });

  test("expired hold is not active", () => {
    issueLegalHold({ tenantId: "t1", reason: "Test", issuedBy: "Legal", expiresTs: Date.now() - 1000 });
    expect(isTenantUnderLegalHold("t1")).toBe(false);
  });

  test("indefinite hold stays active", () => {
    issueLegalHold({ tenantId: "t1", reason: "Permanent", issuedBy: "Legal", expiresTs: null });
    expect(isTenantUnderLegalHold("t1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Privacy redaction
// ---------------------------------------------------------------------------
describe("privacy redaction", () => {
  test("getBuiltInRedactionRules returns rules", () => {
    const rules = getBuiltInRedactionRules();
    expect(rules.length).toBe(6);
    expect(rules.map((r) => r.ruleId)).toContain("redact-email");
    expect(rules.map((r) => r.ruleId)).toContain("redact-ssn");
  });

  test("applyRedaction redacts email addresses", () => {
    const rules = getBuiltInRedactionRules().filter((r) => r.ruleId === "redact-email");
    const result = applyRedaction("Email me at test@example.com please", rules);
    expect(result).toContain("[REDACTED_EMAIL]");
    expect(result).not.toContain("test@example.com");
  });

  test("applyRedaction redacts SSNs", () => {
    const rules = getBuiltInRedactionRules().filter((r) => r.ruleId === "redact-ssn");
    const result = applyRedaction("SSN: 123-45-6789", rules);
    expect(result).toContain("[REDACTED_SSN]");
    expect(result).not.toContain("123-45-6789");
  });

  test("applyRedaction handles multiple patterns", () => {
    const rules = getBuiltInRedactionRules();
    const result = applyRedaction("Email: user@test.com SSN: 123-45-6789 IP: 10.0.0.1", rules);
    expect(result).toContain("[REDACTED_EMAIL]");
    expect(result).toContain("[REDACTED_SSN]");
    expect(result).toContain("[REDACTED_IP]");
  });

  test("runRedactionTests passes all built-in tests", () => {
    const suite = runRedactionTests();
    expect(suite.suiteId).toMatch(/^rts_/);
    expect(suite.results.length).toBeGreaterThan(0);
    expect(suite.passCount).toBe(suite.results.length);
    expect(suite.failCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Key custody
// ---------------------------------------------------------------------------
describe("key custody", () => {
  test("returns config for all modes", () => {
    for (const mode of ["local", "notary", "external-kms", "external-hsm"] as const) {
      const config = getKeyCustodyConfig(mode);
      expect(config.mode).toBe(mode);
      expect(config.description.length).toBeGreaterThan(0);
      expect(config.rotationIntervalDays).toBeGreaterThan(0);
    }
  });

  test("listKeyCustodyModes returns all four modes", () => {
    const modes = listKeyCustodyModes();
    expect(modes.length).toBe(4);
    expect(modes.map((m) => m.mode)).toEqual(["local", "notary", "external-kms", "external-hsm"]);
  });

  test("external modes require dual control", () => {
    expect(getKeyCustodyConfig("external-kms").requireDualControl).toBe(true);
    expect(getKeyCustodyConfig("external-hsm").requireDualControl).toBe(true);
  });

  test("local mode allows export", () => {
    expect(getKeyCustodyConfig("local").allowExport).toBe(true);
    expect(getKeyCustodyConfig("external-kms").allowExport).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Region validation
// ---------------------------------------------------------------------------
describe("region validation", () => {
  test("isRegionAllowed checks allowed regions", () => {
    const policy = createResidencyPolicy({ region: "eu-west-1", allowedRegions: ["eu-west-1", "eu-central-1"] });
    expect(isRegionAllowed("eu-west-1", policy)).toBe(true);
    expect(isRegionAllowed("eu-central-1", policy)).toBe(true);
    expect(isRegionAllowed("us-east-1", policy)).toBe(false);
  });

  test("isRegionAllowed checks deny regions", () => {
    const policy = createResidencyPolicy({ region: "us-east-1", denyRegions: ["eu-west-1"] });
    expect(isRegionAllowed("eu-west-1", policy)).toBe(false);
    expect(isRegionAllowed("us-east-1", policy)).toBe(true);
  });

  test("validateDataTransfer allows when no policies", () => {
    const result = validateDataTransfer("us-east-1", "eu-west-1");
    expect(result.allowed).toBe(true);
  });

  test("validateDataTransfer blocks denied regions", () => {
    createResidencyPolicy({ region: "eu-west-1", denyRegions: ["us-east-1"] });
    const result = validateDataTransfer("us-east-1", "eu-west-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("does not allow");
  });

  test("validateDataTransfer allows compliant transfers", () => {
    createResidencyPolicy({ region: "eu-west-1", allowedRegions: ["eu-west-1", "eu-central-1"] });
    createResidencyPolicy({ region: "eu-central-1", allowedRegions: ["eu-west-1", "eu-central-1"] });
    const result = validateDataTransfer("eu-west-1", "eu-central-1");
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compliance report
// ---------------------------------------------------------------------------
describe("residency compliance report", () => {
  test("generates report for registered tenant", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "eu-west-1" });
    createResidencyPolicy({ region: "eu-west-1" });
    const report = generateResidencyReport("t1");
    expect(report.reportId).toMatch(/^rdr_/);
    expect(report.tenantId).toBe("t1");
    expect(report.region).toBe("eu-west-1");
    expect(report.compliant).toBe(true);
  });

  test("report includes isolation checks against other tenants", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws2", region: "eu-west-1" });
    const report = generateResidencyReport("t1");
    expect(report.isolationChecks.length).toBe(1);
  });

  test("report is non-compliant when violations exist", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws-shared", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws-shared", region: "us-east-1" });
    const report = generateResidencyReport("t1");
    expect(report.compliant).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
  });

  test("report includes redaction tests when requested", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    const report = generateResidencyReport("t1", { includeRedactionTests: true });
    expect(report.redactionSuite).not.toBeNull();
    expect(report.redactionSuite!.passCount).toBeGreaterThan(0);
  });

  test("report includes legal holds", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    issueLegalHold({ tenantId: "t1", reason: "Investigation", issuedBy: "Legal" });
    const report = generateResidencyReport("t1");
    expect(report.legalHolds.length).toBe(1);
  });

  test("report for unknown tenant uses defaults", () => {
    const report = generateResidencyReport("unknown");
    expect(report.region).toBe("us-east-1"); // default
    expect(report.compliant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("markdown rendering", () => {
  test("renders report with all sections", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "eu-west-1" });
    createResidencyPolicy({ region: "eu-west-1" });
    issueLegalHold({ tenantId: "t1", reason: "Test", issuedBy: "Legal" });
    const report = generateResidencyReport("t1", { includeRedactionTests: true });
    const md = renderResidencyReportMarkdown(report);
    expect(md).toContain("# Data Residency Compliance Report");
    expect(md).toContain("## Residency Policy Checks");
    expect(md).toContain("## Residency Policy");
    expect(md).toContain("## Key Custody");
    expect(md).toContain("## Tenant Isolation Checks");
    expect(md).toContain("## Legal Holds");
    expect(md).toContain("## Privacy Redaction Tests");
  });

  test("renders non-compliant report with violations", () => {
    registerTenant({ tenantId: "t1", workspaceId: "ws-shared", region: "us-east-1" });
    registerTenant({ tenantId: "t2", workspaceId: "ws-shared", region: "us-east-1" });
    const report = generateResidencyReport("t1");
    const md = renderResidencyReportMarkdown(report);
    expect(md).toMatch(/\d+ violation\(s\) found/);
    expect(md).not.toMatch(/\bCOMPLIANT\b/);
    expect(md).toContain("### Violations");
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
describe("reset", () => {
  test("clears all state", () => {
    createResidencyPolicy({ region: "us-east-1" });
    registerTenant({ tenantId: "t1", workspaceId: "ws1", region: "us-east-1" });
    issueLegalHold({ tenantId: "t1", reason: "Test", issuedBy: "Legal" });
    resetDataResidencyState();
    expect(getResidencyPolicies().length).toBe(0);
    expect(getTenants().length).toBe(0);
    expect(getActiveLegalHolds().length).toBe(0);
  });
});

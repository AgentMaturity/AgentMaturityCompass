/**
 * Data Residency & Tenant Isolation Controls
 *
 * Provides explicit data residency policy enforcement, strict tenant isolation
 * checking, privacy redaction policy testing, legal-hold mode, and key custody
 * mode configuration for hosted/SaaS scenarios.
 *
 * Key concepts:
 * - Region-aware evidence storage strategy
 * - Tenant isolation boundary enforcement
 * - Privacy redaction testing in CI
 * - Immutable legal-hold mode for evidence retention
 * - Key custody mode matrix (local, notary, external KMS/HSM)
 */

import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { saveResidencyRecord, loadResidencyRecords, updateResidencyRecord } from "./dataResidencyStore.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataRegion =
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "eu-central-1"
  | "ap-southeast-1"
  | "ap-northeast-1"
  | "custom";

export type KeyCustodyMode = "local" | "notary" | "external-kms" | "external-hsm";

export type IsolationLevel = "strict" | "shared" | "federated";

export interface ResidencyPolicy {
  policyId: string;
  region: DataRegion;
  customRegionLabel?: string;
  allowedRegions: DataRegion[];
  denyRegions: DataRegion[];
  isolationLevel: IsolationLevel;
  keyCustodyMode: KeyCustodyMode;
  requireEncryptionAtRest: boolean;
  requireEncryptionInTransit: boolean;
  retentionMinDays: number;
  retentionMaxDays: number;
  legalHoldEnabled: boolean;
  privacyRedactionEnabled: boolean;
  createdTs: number;
  policyHash: string;
}

export interface TenantBoundary {
  tenantId: string;
  workspaceId: string;
  region: DataRegion;
  isolationLevel: IsolationLevel;
  keyCustodyMode: KeyCustodyMode;
  createdTs: number;
}

export interface TenantIsolationCheck {
  checkId: string;
  tenantA: string;
  tenantB: string;
  isolated: boolean;
  violations: TenantViolation[];
  checkedTs: number;
}

export interface TenantViolation {
  violationType: "cross_tenant_data_leak" | "shared_key_material" | "region_mismatch" | "retention_policy_conflict" | "isolation_level_downgrade";
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  tenantA: string;
  tenantB: string;
}

export interface LegalHold {
  holdId: string;
  tenantId: string;
  reason: string;
  issuedBy: string;
  issuedTs: number;
  expiresTs: number | null; // null = indefinite
  active: boolean;
  holdHash: string;
}

export interface PrivacyRedactionRule {
  ruleId: string;
  pattern: string; // regex pattern
  replacement: string;
  category: "pii" | "financial" | "health" | "credentials" | "custom";
  description: string;
}

export interface RedactionTestResult {
  ruleId: string;
  testInput: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
}

export interface RedactionTestSuite {
  suiteId: string;
  rules: PrivacyRedactionRule[];
  results: RedactionTestResult[];
  passCount: number;
  failCount: number;
  ts: number;
}

export interface KeyCustodyConfig {
  mode: KeyCustodyMode;
  description: string;
  rotationIntervalDays: number;
  requireDualControl: boolean;
  allowExport: boolean;
  auditKeyAccess: boolean;
}

export interface ResidencyComplianceReport {
  reportId: string;
  tenantId: string;
  region: DataRegion;
  policy: ResidencyPolicy;
  isolationChecks: TenantIsolationCheck[];
  legalHolds: LegalHold[];
  redactionSuite: RedactionTestSuite | null;
  keyCustody: KeyCustodyConfig;
  compliant: boolean;
  violations: string[];
  generatedTs: number;
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/**
 * In-process cache over the durable store.
 *
 * These were the only home for residency state, so each CLI invocation began
 * empty while the commands still printed success. They are now a same-process
 * cache; anything given a `workspace` also reads and writes
 * .amc/compliance/residency/ so the record survives the process.
 */
let policies: ResidencyPolicy[] = [];
let tenants: TenantBoundary[] = [];
let legalHolds: LegalHold[] = [];

export function resetDataResidencyState(): void {
  policies = [];
  tenants = [];
  legalHolds = [];
}

// ---------------------------------------------------------------------------
// Residency policy management
// ---------------------------------------------------------------------------

/**
 * Create a data residency policy for a region.
 */
export function createResidencyPolicy(opts: {
  region: DataRegion;
  customRegionLabel?: string;
  allowedRegions?: DataRegion[];
  denyRegions?: DataRegion[];
  isolationLevel?: IsolationLevel;
  keyCustodyMode?: KeyCustodyMode;
  requireEncryptionAtRest?: boolean;
  requireEncryptionInTransit?: boolean;
  retentionMinDays?: number;
  retentionMaxDays?: number;
  legalHoldEnabled?: boolean;
  privacyRedactionEnabled?: boolean;
}, workspace?: string): ResidencyPolicy {
  const policy: ResidencyPolicy = {
    policyId: `rp_${randomUUID().slice(0, 12)}`,
    region: opts.region,
    customRegionLabel: opts.customRegionLabel,
    allowedRegions: opts.allowedRegions ?? [opts.region],
    denyRegions: opts.denyRegions ?? [],
    isolationLevel: opts.isolationLevel ?? "strict",
    keyCustodyMode: opts.keyCustodyMode ?? "local",
    requireEncryptionAtRest: opts.requireEncryptionAtRest ?? true,
    requireEncryptionInTransit: opts.requireEncryptionInTransit ?? true,
    retentionMinDays: opts.retentionMinDays ?? 30,
    retentionMaxDays: opts.retentionMaxDays ?? 3650,
    legalHoldEnabled: opts.legalHoldEnabled ?? false,
    privacyRedactionEnabled: opts.privacyRedactionEnabled ?? false,
    createdTs: Date.now(),
    policyHash: "",
  };
  policy.policyHash = sha256Hex(JSON.stringify({ ...policy, policyHash: "" }));
  policies.push(policy);
  if (workspace) {
    saveResidencyRecord(workspace, "policies", policy.policyId, { ...policy }, policy.createdTs);
  }
  return policy;
}

export function getResidencyPolicies(workspace?: string): ResidencyPolicy[] {
  return mergeById(policies, workspace ? loadResidencyRecords<ResidencyPolicy>(workspace, "policies") : [], (p) => p.policyId);
}

export function getResidencyPolicy(policyId: string, workspace?: string): ResidencyPolicy | null {
  return getResidencyPolicies(workspace).find((p) => p.policyId === policyId) ?? null;
}

export function getPolicyForRegion(region: DataRegion, workspace?: string): ResidencyPolicy | null {
  return getResidencyPolicies(workspace).find((p) => p.region === region) ?? null;
}

/** In-process entries win over stored copies of the same id. */
function mergeById<T>(live: T[], stored: T[], id: (item: T) => string): T[] {
  const seen = new Set(live.map(id));
  return [...live, ...stored.filter((item) => !seen.has(id(item)))];
}

// ---------------------------------------------------------------------------
// Tenant boundary management
// ---------------------------------------------------------------------------

/**
 * Register a tenant boundary with region and isolation settings.
 */
export function registerTenant(opts: {
  tenantId: string;
  workspaceId: string;
  region: DataRegion;
  isolationLevel?: IsolationLevel;
  keyCustodyMode?: KeyCustodyMode;
}, workspace?: string): TenantBoundary {
  const boundary: TenantBoundary = {
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    region: opts.region,
    isolationLevel: opts.isolationLevel ?? "strict",
    keyCustodyMode: opts.keyCustodyMode ?? "local",
    createdTs: Date.now(),
  };
  tenants.push(boundary);
  if (workspace) {
    saveResidencyRecord(workspace, "tenants", boundary.tenantId, { ...boundary }, boundary.createdTs);
  }
  return boundary;
}

export function getTenants(workspace?: string): TenantBoundary[] {
  return mergeById(tenants, workspace ? loadResidencyRecords<TenantBoundary>(workspace, "tenants") : [], (t) => t.tenantId);
}

export function getTenant(tenantId: string, workspace?: string): TenantBoundary | null {
  return getTenants(workspace).find((t) => t.tenantId === tenantId) ?? null;
}

// ---------------------------------------------------------------------------
// Tenant isolation checks
// ---------------------------------------------------------------------------

/**
 * Check isolation between two tenants for boundary violations.
 */
export function checkTenantIsolation(
  tenantIdA: string,
  tenantIdB: string,
  workspace?: string,
): TenantIsolationCheck {
  const a = getTenant(tenantIdA, workspace);
  const b = getTenant(tenantIdB, workspace);

  const violations: TenantViolation[] = [];

  if (!a || !b) {
    return {
      checkId: `tic_${randomUUID().slice(0, 12)}`,
      tenantA: tenantIdA,
      tenantB: tenantIdB,
      isolated: true,
      violations: [],
      checkedTs: Date.now(),
    };
  }

  // Check: same workspace (data leak risk)
  if (a.workspaceId === b.workspaceId) {
    violations.push({
      violationType: "cross_tenant_data_leak",
      description: `Tenants ${tenantIdA} and ${tenantIdB} share workspace ${a.workspaceId}.`,
      severity: "critical",
      tenantA: tenantIdA,
      tenantB: tenantIdB,
    });
  }

  // Check: key custody mismatch in strict mode
  if (a.isolationLevel === "strict" || b.isolationLevel === "strict") {
    if (a.keyCustodyMode === b.keyCustodyMode && a.keyCustodyMode === "local" && a.workspaceId === b.workspaceId) {
      violations.push({
        violationType: "shared_key_material",
        description: `Both tenants use local key custody in the same workspace — keys may be shared.`,
        severity: "high",
        tenantA: tenantIdA,
        tenantB: tenantIdB,
      });
    }
  }

  // Check: region mismatch
  if (a.region !== b.region) {
    // Not a violation per se, but check for cross-region policy conflicts
    const policyA = getPolicyForRegion(a.region);
    const policyB = getPolicyForRegion(b.region);

    if (policyA && policyB) {
      if (policyA.denyRegions.includes(b.region)) {
        violations.push({
          violationType: "region_mismatch",
          description: `Tenant ${tenantIdA}'s policy denies region ${b.region} used by tenant ${tenantIdB}.`,
          severity: "high",
          tenantA: tenantIdA,
          tenantB: tenantIdB,
        });
      }
      if (policyB.denyRegions.includes(a.region)) {
        violations.push({
          violationType: "region_mismatch",
          description: `Tenant ${tenantIdB}'s policy denies region ${a.region} used by tenant ${tenantIdA}.`,
          severity: "high",
          tenantA: tenantIdA,
          tenantB: tenantIdB,
        });
      }
    }
  }

  // Check: isolation level downgrade
  if (a.isolationLevel === "strict" && b.isolationLevel === "shared") {
    violations.push({
      violationType: "isolation_level_downgrade",
      description: `Tenant ${tenantIdB} uses shared isolation while ${tenantIdA} requires strict isolation.`,
      severity: "medium",
      tenantA: tenantIdA,
      tenantB: tenantIdB,
    });
  }
  if (b.isolationLevel === "strict" && a.isolationLevel === "shared") {
    violations.push({
      violationType: "isolation_level_downgrade",
      description: `Tenant ${tenantIdA} uses shared isolation while ${tenantIdB} requires strict isolation.`,
      severity: "medium",
      tenantA: tenantIdA,
      tenantB: tenantIdB,
    });
  }

  return {
    checkId: `tic_${randomUUID().slice(0, 12)}`,
    tenantA: tenantIdA,
    tenantB: tenantIdB,
    isolated: violations.length === 0,
    violations,
    checkedTs: Date.now(),
  };
}

/**
 * Check all registered tenants for pairwise isolation.
 */
export function checkAllTenantIsolation(workspace?: string): TenantIsolationCheck[] {
  // Read through the store: previously this saw only tenants registered in the
  // current process, so `amc tenant-isolation-check` always reported "need at
  // least 2 tenants" and could never detect a cross-tenant violation.
  const known = getTenants(workspace);
  const checks: TenantIsolationCheck[] = [];
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      checks.push(checkTenantIsolation(known[i]!.tenantId, known[j]!.tenantId, workspace));
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Legal hold management
// ---------------------------------------------------------------------------

/**
 * Issue a legal hold on a tenant's data.
 */
export function issueLegalHold(opts: {
  tenantId: string;
  reason: string;
  issuedBy: string;
  expiresTs?: number | null;
}, workspace?: string): LegalHold {
  const hold: LegalHold = {
    holdId: `lh_${randomUUID().slice(0, 12)}`,
    tenantId: opts.tenantId,
    reason: opts.reason,
    issuedBy: opts.issuedBy,
    issuedTs: Date.now(),
    expiresTs: opts.expiresTs ?? null,
    active: true,
    holdHash: "",
  };
  hold.holdHash = sha256Hex(JSON.stringify({ ...hold, holdHash: "" }));
  legalHolds.push(hold);
  if (workspace) {
    // A legal hold that silently disappears is spoliation-relevant, so a hold
    // that cannot be written must not report success.
    saveResidencyRecord(workspace, "legal-holds", hold.holdId, { ...hold }, hold.issuedTs);
  }
  return hold;
}

/**
 * Release a legal hold by ID.
 */
export function releaseLegalHold(holdId: string, workspace?: string): boolean {
  const live = legalHolds.find((h) => h.holdId === holdId);
  const stored = workspace
    ? loadResidencyRecords<LegalHold>(workspace, "legal-holds").find((h) => h.holdId === holdId)
    : undefined;
  const hold = live ?? stored;
  if (!hold || !hold.active) return false;
  hold.active = false;
  if (live) live.active = false;
  if (workspace) {
    // The release is itself a record: rewrite the hold with active:false so a
    // later process sees the release rather than the original hold.
    updateResidencyRecord(workspace, "legal-holds", hold.holdId, { ...hold, active: false }, Date.now());
  }
  return true;
}

/**
 * Get all active legal holds for a tenant.
 */
export function getActiveLegalHolds(tenantId?: string, workspace?: string): LegalHold[] {
  const all = mergeById(
    legalHolds,
    workspace ? loadResidencyRecords<LegalHold>(workspace, "legal-holds") : [],
    (h) => h.holdId
  );
  return all.filter((h) => h.active && (!tenantId || h.tenantId === tenantId));
}

/**
 * Check if a tenant is under legal hold.
 */
export function isTenantUnderLegalHold(tenantId: string, workspace?: string): boolean {
  return getActiveLegalHolds(tenantId, workspace).some(
    (h) => h.expiresTs === null || h.expiresTs > Date.now()
  );
}

// ---------------------------------------------------------------------------
// Privacy redaction rules & testing
// ---------------------------------------------------------------------------

/**
 * Get built-in privacy redaction rules for common PII patterns.
 */
export function getBuiltInRedactionRules(): PrivacyRedactionRule[] {
  return [
    {
      ruleId: "redact-email",
      pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
      replacement: "[REDACTED_EMAIL]",
      category: "pii",
      description: "Redact email addresses",
    },
    {
      ruleId: "redact-phone",
      pattern: "\\b\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b",
      replacement: "[REDACTED_PHONE]",
      category: "pii",
      description: "Redact US phone numbers",
    },
    {
      ruleId: "redact-ssn",
      pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
      replacement: "[REDACTED_SSN]",
      category: "pii",
      description: "Redact Social Security Numbers",
    },
    {
      ruleId: "redact-credit-card",
      pattern: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
      replacement: "[REDACTED_CC]",
      category: "financial",
      description: "Redact credit card numbers",
    },
    {
      ruleId: "redact-api-key",
      pattern: "(?:api[_-]?key|token|secret)[=:\\s]+[A-Za-z0-9_\\-]{16,}",
      replacement: "[REDACTED_KEY]",
      category: "credentials",
      description: "Redact API keys and tokens",
    },
    {
      ruleId: "redact-ip",
      pattern: "\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b",
      replacement: "[REDACTED_IP]",
      category: "pii",
      description: "Redact IPv4 addresses",
    },
  ];
}

/**
 * Apply redaction rules to text.
 */
export function applyRedaction(text: string, rules: PrivacyRedactionRule[]): string {
  let result = text;
  for (const rule of rules) {
    const regex = new RegExp(rule.pattern, "g");
    result = result.replace(regex, rule.replacement);
  }
  return result;
}

/**
 * Run a redaction test suite against built-in test cases.
 */
export function runRedactionTests(rules?: PrivacyRedactionRule[]): RedactionTestSuite {
  const activeRules = rules ?? getBuiltInRedactionRules();
  const results: RedactionTestResult[] = [];

  // Standard test cases
  const testCases: Array<{ ruleId: string; input: string; expected: string }> = [
    { ruleId: "redact-email", input: "Contact john@example.com for info", expected: "Contact [REDACTED_EMAIL] for info" },
    { ruleId: "redact-phone", input: "Call 555-123-4567 today", expected: "Call [REDACTED_PHONE] today" },
    { ruleId: "redact-ssn", input: "SSN is 123-45-6789", expected: "SSN is [REDACTED_SSN]" },
    { ruleId: "redact-credit-card", input: "Card 4111 1111 1111 1111", expected: "Card [REDACTED_CC]" },
    { ruleId: "redact-api-key", input: "api_key=sk_1234567890abcdef1234", expected: "[REDACTED_KEY]" },
    { ruleId: "redact-ip", input: "Server at 192.168.1.1 online", expected: "Server at [REDACTED_IP] online" },
  ];

  for (const tc of testCases) {
    const rule = activeRules.find((r) => r.ruleId === tc.ruleId);
    if (!rule) continue;

    const actual = applyRedaction(tc.input, [rule]);
    results.push({
      ruleId: tc.ruleId,
      testInput: tc.input,
      expectedOutput: tc.expected,
      actualOutput: actual,
      passed: actual === tc.expected,
    });
  }

  return {
    suiteId: `rts_${randomUUID().slice(0, 12)}`,
    rules: activeRules,
    results,
    passCount: results.filter((r) => r.passed).length,
    failCount: results.filter((r) => !r.passed).length,
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Key custody configuration
// ---------------------------------------------------------------------------

/**
 * Get key custody configuration for a given mode.
 */
export function getKeyCustodyConfig(mode: KeyCustodyMode): KeyCustodyConfig {
  switch (mode) {
    case "local":
      return {
        mode: "local",
        description: "Keys stored locally in the AMC vault, encrypted at rest with passphrase-derived AES-256-GCM.",
        rotationIntervalDays: 90,
        requireDualControl: false,
        allowExport: true,
        auditKeyAccess: true,
      };
    case "notary":
      return {
        mode: "notary",
        description: "Keys managed by AMC notary service with multi-party approval for signing operations.",
        rotationIntervalDays: 60,
        requireDualControl: true,
        allowExport: false,
        auditKeyAccess: true,
      };
    case "external-kms":
      return {
        mode: "external-kms",
        description: "Keys managed by external KMS (AWS KMS, GCP Cloud KMS, Azure Key Vault). AMC never sees raw keys.",
        rotationIntervalDays: 365,
        requireDualControl: true,
        allowExport: false,
        auditKeyAccess: true,
      };
    case "external-hsm":
      return {
        mode: "external-hsm",
        description: "Keys stored in hardware security module. Highest assurance level with FIPS 140-2 Level 3+ compliance.",
        rotationIntervalDays: 365,
        requireDualControl: true,
        allowExport: false,
        auditKeyAccess: true,
      };
  }
}

export function listKeyCustodyModes(): KeyCustodyConfig[] {
  return (["local", "notary", "external-kms", "external-hsm"] as const).map(getKeyCustodyConfig);
}

// ---------------------------------------------------------------------------
// Region validation
// ---------------------------------------------------------------------------

/**
 * Check if evidence storage in a given region is allowed by a residency policy.
 */
export function isRegionAllowed(region: DataRegion, policy: ResidencyPolicy): boolean {
  if (policy.denyRegions.includes(region)) return false;
  if (policy.allowedRegions.length > 0 && !policy.allowedRegions.includes(region)) return false;
  return true;
}

/**
 * Validate a proposed data transfer between regions against residency policies.
 */
export function validateDataTransfer(
  sourceRegion: DataRegion,
  targetRegion: DataRegion,
): { allowed: boolean; reason: string } {
  const sourcePolicy = getPolicyForRegion(sourceRegion);
  const targetPolicy = getPolicyForRegion(targetRegion);

  if (!sourcePolicy && !targetPolicy) {
    return { allowed: true, reason: "No residency policies apply." };
  }

  if (sourcePolicy && !isRegionAllowed(targetRegion, sourcePolicy)) {
    return { allowed: false, reason: `Source region ${sourceRegion} policy does not allow transfer to ${targetRegion}.` };
  }

  if (targetPolicy && !isRegionAllowed(sourceRegion, targetPolicy)) {
    return { allowed: false, reason: `Target region ${targetRegion} policy does not allow data from ${sourceRegion}.` };
  }

  return { allowed: true, reason: "Transfer complies with all residency policies." };
}

// ---------------------------------------------------------------------------
// Compliance report generation
// ---------------------------------------------------------------------------

/**
 * Generate a data residency compliance report for a tenant.
 */
export function generateResidencyReport(
  tenantId: string,
  opts?: { includeRedactionTests?: boolean },
  workspace?: string,
): ResidencyComplianceReport {
  const tenant = getTenant(tenantId, workspace);
  // The us-east-1 fallback previously fired for every tenant, because the
  // lookup only ever saw tenants registered in this same process. It now means
  // what it says: no registration for this tenant exists anywhere.
  const region = tenant?.region ?? "us-east-1";
  const policy = getPolicyForRegion(region, workspace) ?? createDefaultPolicy(region);
  const isolationChecks = getTenants(workspace)
    .filter((t) => t.tenantId !== tenantId)
    .map((t) => checkTenantIsolation(tenantId, t.tenantId, workspace));
  const holds = getActiveLegalHolds(tenantId, workspace);
  const keyCustody = getKeyCustodyConfig(tenant?.keyCustodyMode ?? "local");

  let redactionSuite: RedactionTestSuite | null = null;
  if (opts?.includeRedactionTests) {
    redactionSuite = runRedactionTests();
  }

  // Aggregate violations
  const violations: string[] = [];
  for (const check of isolationChecks) {
    for (const v of check.violations) {
      violations.push(`[${v.severity.toUpperCase()}] ${v.description}`);
    }
  }

  if (policy.legalHoldEnabled && holds.length === 0 && isTenantUnderLegalHold(tenantId)) {
    violations.push("[HIGH] Legal hold is active but policy is not configured for legal hold.");
  }

  if (redactionSuite && redactionSuite.failCount > 0) {
    violations.push(`[MEDIUM] ${redactionSuite.failCount} redaction test(s) failed.`);
  }

  return {
    reportId: `rdr_${randomUUID().slice(0, 12)}`,
    tenantId,
    region,
    policy,
    isolationChecks,
    legalHolds: holds,
    redactionSuite,
    keyCustody,
    compliant: violations.length === 0,
    violations,
    generatedTs: Date.now(),
  };
}

function createDefaultPolicy(region: DataRegion): ResidencyPolicy {
  return {
    policyId: `rp_default_${region}`,
    region,
    allowedRegions: [region],
    denyRegions: [],
    isolationLevel: "strict",
    keyCustodyMode: "local",
    requireEncryptionAtRest: true,
    requireEncryptionInTransit: true,
    retentionMinDays: 30,
    retentionMaxDays: 3650,
    legalHoldEnabled: false,
    privacyRedactionEnabled: false,
    createdTs: Date.now(),
    policyHash: sha256Hex(`default-policy-${region}`),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a residency compliance report as markdown.
 */
export function renderResidencyReportMarkdown(report: ResidencyComplianceReport): string {
  const lines: string[] = [];

  lines.push("# Data Residency Compliance Report");
  lines.push(`Report ID: ${report.reportId}`);
  lines.push(`Tenant: ${report.tenantId} | Region: ${report.region}`);
  lines.push(`Generated: ${new Date(report.generatedTs).toISOString()}`);
  lines.push("");

  // Compliance status
  lines.push("## Compliance Status");
  lines.push(`**${report.compliant ? "COMPLIANT" : "NON-COMPLIANT"}**`);
  if (report.violations.length > 0) {
    lines.push("");
    lines.push("### Violations");
    for (const v of report.violations) {
      lines.push(`- ${v}`);
    }
  }
  lines.push("");

  // Policy summary
  lines.push("## Residency Policy");
  lines.push("| Setting | Value |");
  lines.push("|---------|-------|");
  lines.push(`| Region | ${report.policy.region} |`);
  lines.push(`| Allowed Regions | ${report.policy.allowedRegions.join(", ")} |`);
  lines.push(`| Denied Regions | ${report.policy.denyRegions.length > 0 ? report.policy.denyRegions.join(", ") : "none"} |`);
  lines.push(`| Isolation Level | ${report.policy.isolationLevel} |`);
  lines.push(`| Encryption at Rest | ${report.policy.requireEncryptionAtRest ? "Required" : "Not required"} |`);
  lines.push(`| Encryption in Transit | ${report.policy.requireEncryptionInTransit ? "Required" : "Not required"} |`);
  lines.push(`| Retention | ${report.policy.retentionMinDays}–${report.policy.retentionMaxDays} days |`);
  lines.push(`| Legal Hold | ${report.policy.legalHoldEnabled ? "Enabled" : "Disabled"} |`);
  lines.push(`| Privacy Redaction | ${report.policy.privacyRedactionEnabled ? "Enabled" : "Disabled"} |`);
  lines.push("");

  // Key custody
  lines.push("## Key Custody");
  lines.push(`| Setting | Value |`);
  lines.push(`|---------|-------|`);
  lines.push(`| Mode | ${report.keyCustody.mode} |`);
  lines.push(`| Rotation interval | ${report.keyCustody.rotationIntervalDays} days |`);
  lines.push(`| Dual control | ${report.keyCustody.requireDualControl ? "Required" : "Not required"} |`);
  lines.push(`| Key export | ${report.keyCustody.allowExport ? "Allowed" : "Forbidden"} |`);
  lines.push(`| Audit access | ${report.keyCustody.auditKeyAccess ? "Yes" : "No"} |`);
  lines.push("");

  // Tenant isolation
  lines.push("## Tenant Isolation Checks");
  if (report.isolationChecks.length === 0) {
    lines.push("No other tenants to check against.");
  } else {
    lines.push("| Tenant A | Tenant B | Isolated | Violations |");
    lines.push("|----------|----------|----------|------------|");
    for (const c of report.isolationChecks) {
      lines.push(`| ${c.tenantA} | ${c.tenantB} | ${c.isolated ? "Yes" : "**NO**"} | ${c.violations.length} |`);
    }
  }
  lines.push("");

  // Legal holds
  lines.push("## Legal Holds");
  if (report.legalHolds.length === 0) {
    lines.push("No active legal holds.");
  } else {
    lines.push("| Hold ID | Reason | Issued By | Expires |");
    lines.push("|---------|--------|-----------|---------|");
    for (const h of report.legalHolds) {
      lines.push(`| ${h.holdId} | ${h.reason} | ${h.issuedBy} | ${h.expiresTs ? new Date(h.expiresTs).toISOString() : "Indefinite"} |`);
    }
  }
  lines.push("");

  // Redaction tests
  if (report.redactionSuite) {
    lines.push("## Privacy Redaction Tests");
    lines.push(`Pass: ${report.redactionSuite.passCount} | Fail: ${report.redactionSuite.failCount}`);
    lines.push("");
    lines.push("| Rule | Category | Passed |");
    lines.push("|------|----------|--------|");
    for (const r of report.redactionSuite.results) {
      lines.push(`| ${r.ruleId} | ${report.redactionSuite.rules.find(ru => ru.ruleId === r.ruleId)?.category ?? "—"} | ${r.passed ? "Yes" : "**NO**"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

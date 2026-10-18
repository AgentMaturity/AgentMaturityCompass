import { resolve } from "node:path";
import { getLicenseStatus, activateLicenseKey } from "./license.js";
import { TIER_DEFINITIONS, type LicenseTier } from "./tiers.js";
import { loadTrustContext, type TrustContext } from "../trust/index.js";
import {
  exportEnterpriseAudit,
  buildSignedAuditTrail,
  collectEnterpriseAuditRecords,
  type EnterpriseAuditExportFormat,
  type SignedAuditTrail
} from "../audit/enterpriseAuditExport.js";
import { writeFileAtomic } from "../utils/fs.js";
import {
  getTenantUsage,
  generateTenantComplianceReport,
  generateUsageMeteringSummary,
  listTenants,
  type TenantComplianceReport,
  type TenantUsage,
  type UsageMeteringSummary
} from "./fleetGovernance.js";

/** An enterprise licence gates no AMC feature, so status reports the licence only, never a feature list. */
export interface EnterpriseStatusResult {
  readonly verificationConfigured: boolean;
  readonly tier: LicenseTier;
  readonly tierLabel: string;
  readonly licenseValid: boolean;
  readonly licenseStatus: string;
  readonly org: string | null;
  readonly expiresAt: string | null;
  readonly graceDaysRemaining: number;
  readonly errors: readonly string[];
}

/** `trust` defaults to the operator's AMC home trust list; tests pass their own. */
export function enterpriseStatusCli(params: {
  workspace: string;
  trust?: TrustContext;
}): EnterpriseStatusResult {
  const status = getLicenseStatus({
    workspace: params.workspace,
    trust: params.trust ?? loadTrustContext()
  });

  const tier = status.validation.effectiveTier;
  const def = TIER_DEFINITIONS[tier];

  return {
    verificationConfigured: status.validation.status !== "not_configured",
    tier,
    tierLabel: def.label,
    licenseValid: status.validation.valid,
    licenseStatus: status.validation.status,
    org: status.validation.claims?.org ?? null,
    expiresAt: status.validation.claims?.expiresAt ?? null,
    graceDaysRemaining: status.validation.graceDaysRemaining,
    errors: [...status.validation.errors]
  };
}

export interface EnterpriseActivateResult {
  readonly success: boolean;
  readonly tier: LicenseTier;
  readonly org: string | null;
  readonly status: string;
  readonly path: string;
  readonly errors: readonly string[];
}

export function enterpriseActivateCli(params: {
  workspace: string;
  key: string;
  trust?: TrustContext;
}): EnterpriseActivateResult {
  const result = activateLicenseKey({
    workspace: params.workspace,
    key: params.key,
    trust: params.trust ?? loadTrustContext()
  });

  return {
    success: result.validation.valid,
    tier: result.validation.effectiveTier,
    org: result.validation.claims?.org ?? null,
    status: result.validation.status,
    path: result.path,
    errors: [...result.validation.errors]
  };
}

export interface EnterpriseAuditExportResult {
  readonly format: EnterpriseAuditExportFormat;
  readonly outputPath: string;
  readonly eventCount: number;
  readonly signedTrailPath?: string;
}

export function enterpriseAuditExportCli(params: {
  workspace: string;
  format: EnterpriseAuditExportFormat;
  output: string;
  limit?: number;
  signed?: boolean;
}): EnterpriseAuditExportResult {
  const exportResult = exportEnterpriseAudit({
    workspace: params.workspace,
    format: params.format,
    output: params.output,
    limit: params.limit
  });

  let signedTrailPath: string | undefined;
  if (params.signed) {
    const records = collectEnterpriseAuditRecords(params.workspace, params.limit ?? 1_000);
    const trail = buildSignedAuditTrail(records);
    signedTrailPath = resolve(`${params.output}.signed.json`);
    writeFileAtomic(signedTrailPath, JSON.stringify(trail, null, 2), 0o644);
  }

  return {
    format: exportResult.format,
    outputPath: exportResult.outputPath,
    eventCount: exportResult.eventCount,
    signedTrailPath
  };
}

export interface EnterpriseUsageResult {
  readonly tenantCount: number;
  readonly tenants: readonly {
    tenantId: string;
    displayName: string;
    usage: TenantUsage | null;
    compliance: TenantComplianceReport | null;
  }[];
}

export function enterpriseUsageCli(params: {
  workspace: string;
}): EnterpriseUsageResult {
  const tenants = listTenants(params.workspace);

  const results = tenants.map((tenant) => {
    const usage = getTenantUsage(params.workspace, tenant.tenantId);
    let compliance: TenantComplianceReport | null = null;
    try {
      compliance = generateTenantComplianceReport({
        workspace: params.workspace,
        tenantId: tenant.tenantId
      });
    } catch {
      // tenant may not have usage data yet
    }

    return {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      usage,
      compliance
    };
  });

  return {
    tenantCount: tenants.length,
    tenants: results
  };
}

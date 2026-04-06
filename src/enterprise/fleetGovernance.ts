import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { ensureDir, pathExists } from "../utils/fs.js";

export interface TenantConfig {
  readonly tenantId: string;
  readonly displayName: string;
  readonly parentTenantId: string | null;
  readonly createdAt: string;
  readonly quotas: TenantQuotas;
  readonly policyOverrides: Record<string, unknown>;
}

export interface TenantQuotas {
  readonly maxAgents: number;
  readonly maxWorkspaces: number;
  readonly maxDiagnosticRunsPerDay: number;
  readonly maxAuditRetentionDays: number;
  readonly maxStorageMb: number;
}

export interface TenantUsage {
  readonly tenantId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly agentCount: number;
  readonly workspaceCount: number;
  readonly diagnosticRuns: number;
  readonly auditEventsStored: number;
  readonly storageMb: number;
}

export interface TenantComplianceReport {
  readonly tenantId: string;
  readonly generatedAt: string;
  readonly quotaUtilization: Record<keyof TenantQuotas, number>;
  readonly policyCompliant: boolean;
  readonly violations: readonly string[];
  readonly inheritedPolicies: readonly string[];
}

export interface FleetGovernanceState {
  readonly schemaVersion: 2;
  readonly tenants: Record<string, TenantConfig>;
  readonly usage: Record<string, TenantUsage>;
}

const DEFAULT_QUOTAS: TenantQuotas = {
  maxAgents: 50,
  maxWorkspaces: 10,
  maxDiagnosticRunsPerDay: 100,
  maxAuditRetentionDays: 365,
  maxStorageMb: 5_000
};

function governancePath(workspace: string): string {
  return join(workspace, ".amc", "enterprise-governance.json");
}

function loadState(workspace: string): FleetGovernanceState {
  const filePath = governancePath(workspace);
  if (!pathExists(filePath)) {
    return { schemaVersion: 2, tenants: {}, usage: {} };
  }
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as FleetGovernanceState;
}

function saveState(workspace: string, state: FleetGovernanceState): void {
  const filePath = governancePath(workspace);
  ensureDir(join(workspace, ".amc"));
  writeFileSync(filePath, JSON.stringify(state, null, 2), { mode: 0o644 });
}

export function createTenant(params: {
  workspace: string;
  tenantId?: string;
  displayName: string;
  parentTenantId?: string | null;
  quotas?: Partial<TenantQuotas>;
}): TenantConfig {
  const state = loadState(params.workspace);
  const tenantId = params.tenantId ?? `tenant_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  if (state.tenants[tenantId]) {
    throw new Error(`tenant already exists: ${tenantId}`);
  }

  if (params.parentTenantId && !state.tenants[params.parentTenantId]) {
    throw new Error(`parent tenant not found: ${params.parentTenantId}`);
  }

  const tenant: TenantConfig = {
    tenantId,
    displayName: params.displayName,
    parentTenantId: params.parentTenantId ?? null,
    createdAt: new Date().toISOString(),
    quotas: { ...DEFAULT_QUOTAS, ...params.quotas },
    policyOverrides: {}
  };

  const nextTenants = { ...state.tenants, [tenantId]: tenant };
  saveState(params.workspace, { ...state, tenants: nextTenants });
  return tenant;
}

export function getTenant(workspace: string, tenantId: string): TenantConfig | null {
  const state = loadState(workspace);
  return state.tenants[tenantId] ?? null;
}

export function listTenants(workspace: string): readonly TenantConfig[] {
  const state = loadState(workspace);
  return Object.values(state.tenants).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
}

export function updateTenantQuotas(params: {
  workspace: string;
  tenantId: string;
  quotas: Partial<TenantQuotas>;
}): TenantConfig {
  const state = loadState(params.workspace);
  const existing = state.tenants[params.tenantId];
  if (!existing) {
    throw new Error(`tenant not found: ${params.tenantId}`);
  }

  const updated: TenantConfig = {
    ...existing,
    quotas: { ...existing.quotas, ...params.quotas }
  };

  const nextTenants = { ...state.tenants, [params.tenantId]: updated };
  saveState(params.workspace, { ...state, tenants: nextTenants });
  return updated;
}

export function recordTenantUsage(params: {
  workspace: string;
  tenantId: string;
  usage: Omit<TenantUsage, "tenantId">;
}): TenantUsage {
  const state = loadState(params.workspace);
  if (!state.tenants[params.tenantId]) {
    throw new Error(`tenant not found: ${params.tenantId}`);
  }

  const usage: TenantUsage = {
    tenantId: params.tenantId,
    ...params.usage
  };

  const nextUsage = { ...state.usage, [params.tenantId]: usage };
  saveState(params.workspace, { ...state, usage: nextUsage });
  return usage;
}

export function getTenantUsage(workspace: string, tenantId: string): TenantUsage | null {
  const state = loadState(workspace);
  return state.usage[tenantId] ?? null;
}

export function resolveInheritedPolicies(
  workspace: string,
  tenantId: string
): readonly string[] {
  const state = loadState(workspace);
  const chain: string[] = [];
  let current = state.tenants[tenantId];
  while (current) {
    if (Object.keys(current.policyOverrides).length > 0) {
      chain.push(`${current.tenantId}:overrides`);
    }
    if (!current.parentTenantId) break;
    current = state.tenants[current.parentTenantId];
    if (current) {
      chain.push(`inherited:${current.tenantId}`);
    }
  }
  return chain;
}

export function generateTenantComplianceReport(params: {
  workspace: string;
  tenantId: string;
  now?: Date;
}): TenantComplianceReport {
  const state = loadState(params.workspace);
  const tenant = state.tenants[params.tenantId];
  if (!tenant) {
    throw new Error(`tenant not found: ${params.tenantId}`);
  }

  const usage = state.usage[params.tenantId];
  const violations: string[] = [];

  const utilization: Record<keyof TenantQuotas, number> = {
    maxAgents: 0,
    maxWorkspaces: 0,
    maxDiagnosticRunsPerDay: 0,
    maxAuditRetentionDays: 0,
    maxStorageMb: 0
  };

  if (usage) {
    utilization.maxAgents =
      tenant.quotas.maxAgents > 0 ? usage.agentCount / tenant.quotas.maxAgents : 0;
    utilization.maxWorkspaces =
      tenant.quotas.maxWorkspaces > 0 ? usage.workspaceCount / tenant.quotas.maxWorkspaces : 0;
    utilization.maxDiagnosticRunsPerDay =
      tenant.quotas.maxDiagnosticRunsPerDay > 0
        ? usage.diagnosticRuns / tenant.quotas.maxDiagnosticRunsPerDay
        : 0;
    utilization.maxStorageMb =
      tenant.quotas.maxStorageMb > 0 ? usage.storageMb / tenant.quotas.maxStorageMb : 0;

    if (usage.agentCount > tenant.quotas.maxAgents) {
      violations.push(`agent count ${usage.agentCount} exceeds quota ${tenant.quotas.maxAgents}`);
    }
    if (usage.workspaceCount > tenant.quotas.maxWorkspaces) {
      violations.push(
        `workspace count ${usage.workspaceCount} exceeds quota ${tenant.quotas.maxWorkspaces}`
      );
    }
    if (usage.diagnosticRuns > tenant.quotas.maxDiagnosticRunsPerDay) {
      violations.push(
        `diagnostic runs ${usage.diagnosticRuns} exceeds daily quota ${tenant.quotas.maxDiagnosticRunsPerDay}`
      );
    }
    if (usage.storageMb > tenant.quotas.maxStorageMb) {
      violations.push(
        `storage ${usage.storageMb}MB exceeds quota ${tenant.quotas.maxStorageMb}MB`
      );
    }
  }

  return {
    tenantId: params.tenantId,
    generatedAt: (params.now ?? new Date()).toISOString(),
    quotaUtilization: utilization,
    policyCompliant: violations.length === 0,
    violations,
    inheritedPolicies: resolveInheritedPolicies(params.workspace, params.tenantId)
  };
}

export function checkQuotaViolation(params: {
  workspace: string;
  tenantId: string;
  metric: keyof TenantQuotas;
  currentValue: number;
}): { allowed: boolean; limit: number; current: number; utilization: number } {
  const state = loadState(params.workspace);
  const tenant = state.tenants[params.tenantId];
  if (!tenant) {
    throw new Error(`tenant not found: ${params.tenantId}`);
  }

  const limit = tenant.quotas[params.metric];
  const utilization = limit > 0 ? params.currentValue / limit : 0;
  return {
    allowed: params.currentValue <= limit,
    limit,
    current: params.currentValue,
    utilization
  };
}

export interface CrossOrgPolicyResult {
  readonly tenantId: string;
  readonly effectiveQuotas: TenantQuotas;
  readonly policyChain: readonly string[];
  readonly inheritedOverrides: Record<string, unknown>;
}

export function resolveCrossOrgPolicy(
  workspace: string,
  tenantId: string
): CrossOrgPolicyResult {
  const state = loadState(workspace);
  const tenant = state.tenants[tenantId];
  if (!tenant) {
    throw new Error(`tenant not found: ${tenantId}`);
  }

  const policyChain: string[] = [tenantId];
  const mergedOverrides: Record<string, unknown> = { ...tenant.policyOverrides };
  let effectiveQuotas: TenantQuotas = { ...tenant.quotas };

  let current = tenant;
  while (current.parentTenantId) {
    const parent = state.tenants[current.parentTenantId];
    if (!parent) break;
    policyChain.push(parent.tenantId);

    for (const [key, value] of Object.entries(parent.policyOverrides)) {
      if (!(key in mergedOverrides)) {
        mergedOverrides[key] = value;
      }
    }

    effectiveQuotas = {
      maxAgents: Math.min(effectiveQuotas.maxAgents, parent.quotas.maxAgents),
      maxWorkspaces: Math.min(effectiveQuotas.maxWorkspaces, parent.quotas.maxWorkspaces),
      maxDiagnosticRunsPerDay: Math.min(
        effectiveQuotas.maxDiagnosticRunsPerDay,
        parent.quotas.maxDiagnosticRunsPerDay
      ),
      maxAuditRetentionDays: Math.min(
        effectiveQuotas.maxAuditRetentionDays,
        parent.quotas.maxAuditRetentionDays
      ),
      maxStorageMb: Math.min(effectiveQuotas.maxStorageMb, parent.quotas.maxStorageMb)
    };

    current = parent;
  }

  return {
    tenantId,
    effectiveQuotas,
    policyChain,
    inheritedOverrides: mergedOverrides
  };
}

export interface UsageMeteringSummary {
  readonly generatedAt: string;
  readonly tenantCount: number;
  readonly totalAgents: number;
  readonly totalWorkspaces: number;
  readonly totalDiagnosticRuns: number;
  readonly totalStorageMb: number;
  readonly totalAuditEvents: number;
  readonly tenantBreakdown: readonly {
    tenantId: string;
    displayName: string;
    usage: TenantUsage | null;
    quotaUtilization: Record<string, number>;
  }[];
}

export function generateUsageMeteringSummary(
  workspace: string,
  now?: Date
): UsageMeteringSummary {
  const state = loadState(workspace);
  const tenants = Object.values(state.tenants);

  let totalAgents = 0;
  let totalWorkspaces = 0;
  let totalDiagnosticRuns = 0;
  let totalStorageMb = 0;
  let totalAuditEvents = 0;

  const breakdown = tenants.map((tenant) => {
    const usage = state.usage[tenant.tenantId] ?? null;
    const utilization: Record<string, number> = {};

    if (usage) {
      totalAgents += usage.agentCount;
      totalWorkspaces += usage.workspaceCount;
      totalDiagnosticRuns += usage.diagnosticRuns;
      totalStorageMb += usage.storageMb;
      totalAuditEvents += usage.auditEventsStored;

      utilization.agents =
        tenant.quotas.maxAgents > 0 ? usage.agentCount / tenant.quotas.maxAgents : 0;
      utilization.workspaces =
        tenant.quotas.maxWorkspaces > 0 ? usage.workspaceCount / tenant.quotas.maxWorkspaces : 0;
      utilization.diagnosticRuns =
        tenant.quotas.maxDiagnosticRunsPerDay > 0
          ? usage.diagnosticRuns / tenant.quotas.maxDiagnosticRunsPerDay
          : 0;
      utilization.storage =
        tenant.quotas.maxStorageMb > 0 ? usage.storageMb / tenant.quotas.maxStorageMb : 0;
    }

    return {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      usage,
      quotaUtilization: utilization
    };
  });

  return {
    generatedAt: (now ?? new Date()).toISOString(),
    tenantCount: tenants.length,
    totalAgents,
    totalWorkspaces,
    totalDiagnosticRuns,
    totalStorageMb,
    totalAuditEvents,
    tenantBreakdown: breakdown.sort((a, b) => a.displayName.localeCompare(b.displayName))
  };
}

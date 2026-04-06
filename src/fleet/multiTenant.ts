/**
 * Multi-Tenant Federated Scoring — R4-02
 *
 * Provides organization isolation, cross-tenant benchmarking (anonymized),
 * and federated score aggregation without data sharing.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";

export const tenantSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  tier: z.enum(["free", "team", "enterprise"]),
  maxAgents: z.number().int().positive(),
  maxUsers: z.number().int().positive(),
  dataRegion: z.enum(["us", "eu", "ap", "global"]),
  isolationLevel: z.enum(["logical", "physical"]),
  ssoProviderId: z.string().optional(),
  createdAt: z.number(),
  settings: z.object({
    allowAnonymizedBenchmarking: z.boolean().default(false),
    dataRetentionDays: z.number().int().default(365),
    customComplianceFrameworks: z.array(z.string()).default([]),
  }).default({}),
});

export type Tenant = z.infer<typeof tenantSchema>;

export interface FederatedBenchmark {
  benchmarkId: string;
  framework: string;
  percentile: number;
  industryAvg: number;
  tenantScore: number;
  sampleSize: number;
  generatedAt: number;
  anonymized: true;
}

export interface TenantIsolation {
  tenantId: string;
  namespace: string;
  storagePrefix: string;
  encryptionKeyId: string;
  networkPolicy: "shared" | "dedicated";
}

export class TenantManager {
  private tenants: Map<string, Tenant> = new Map();
  private isolation: Map<string, TenantIsolation> = new Map();

  createTenant(input: {
    name: string;
    tier: "free" | "team" | "enterprise";
    dataRegion: "us" | "eu" | "ap" | "global";
  }): Tenant {
    const tenantId = `tenant-${randomUUID().slice(0, 12)}`;
    const tenant = tenantSchema.parse({
      tenantId,
      name: input.name,
      tier: input.tier,
      maxAgents: input.tier === "enterprise" ? 1000 : input.tier === "team" ? 50 : 5,
      maxUsers: input.tier === "enterprise" ? 500 : input.tier === "team" ? 20 : 3,
      dataRegion: input.dataRegion,
      isolationLevel: input.tier === "enterprise" ? "physical" : "logical",
      createdAt: Date.now(),
    });

    this.tenants.set(tenantId, tenant);
    this.isolation.set(tenantId, {
      tenantId,
      namespace: `amc-${tenantId}`,
      storagePrefix: `tenants/${tenantId}/`,
      encryptionKeyId: `key-${sha256Hex(tenantId).slice(0, 16)}`,
      networkPolicy: input.tier === "enterprise" ? "dedicated" : "shared",
    });

    return tenant;
  }

  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  getIsolation(tenantId: string): TenantIsolation | undefined {
    return this.isolation.get(tenantId);
  }

  listTenants(): Tenant[] {
    return [...this.tenants.values()];
  }

  generateFederatedBenchmark(
    tenantId: string,
    framework: string,
    tenantScore: number,
    allScores: number[],
  ): FederatedBenchmark | null {
    const tenant = this.tenants.get(tenantId);
    if (!tenant?.settings.allowAnonymizedBenchmarking) return null;
    if (allScores.length < 5) return null; // Minimum sample for anonymity

    const sorted = [...allScores].sort((a, b) => a - b);
    const rank = sorted.filter((s) => s <= tenantScore).length;
    const percentile = (rank / sorted.length) * 100;
    const avg = allScores.reduce((s, v) => s + v, 0) / allScores.length;

    return {
      benchmarkId: `bench-${randomUUID().slice(0, 8)}`,
      framework,
      percentile: Number(percentile.toFixed(1)),
      industryAvg: Number(avg.toFixed(2)),
      tenantScore,
      sampleSize: allScores.length,
      generatedAt: Date.now(),
      anonymized: true,
    };
  }

  validateCrossRegionAccess(sourceTenantId: string, targetTenantId: string): {
    allowed: boolean;
    reason: string;
  } {
    const source = this.tenants.get(sourceTenantId);
    const target = this.tenants.get(targetTenantId);
    if (!source || !target) return { allowed: false, reason: "Tenant not found" };
    if (sourceTenantId === targetTenantId) return { allowed: true, reason: "Same tenant" };
    if (source.dataRegion !== target.dataRegion && source.dataRegion !== "global" && target.dataRegion !== "global") {
      return { allowed: false, reason: `Cross-region access denied: ${source.dataRegion} → ${target.dataRegion}. Requires DPIA and SCCs.` };
    }
    return { allowed: false, reason: "Cross-tenant data access requires explicit federation agreement" };
  }
}

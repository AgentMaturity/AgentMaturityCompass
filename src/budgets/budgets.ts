import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ActionClass } from "../types.js";
import { projectBudgetUsage, readBudgetEvents, type BudgetUsage } from "./nativeBudgetUsage.js";

const actionClassSchema = z.enum([
  "READ_ONLY",
  "WRITE_LOW",
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);

export const budgetsSchema = z.object({
  budgets: z.object({
    version: z.literal(1),
    perAgent: z.record(z.string(), 
      z.object({
        unknownTokenUsage: z.enum(["BLOCK", "ALLOW_WITH_WARNING"]).optional(),
        daily: z.object({
          maxLlmRequests: z.number().int().positive(),
          maxLlmTokens: z.number().int().positive(),
          maxCostUsd: z.number().positive(),
          maxToolExecutes: z.partialRecord(actionClassSchema, z.number().int().min(0))
        }),
        perMinute: z.object({
          maxLlmRequests: z.number().int().positive(),
          maxLlmTokens: z.number().int().positive()
        }),
        consequences: z.object({
          onExceed: z.array(
            z.object({
              action: z.enum(["DOWNGRADE_TO_SIMULATE", "FREEZE_EXECUTE", "ALERT_OWNER"]),
              actionClasses: z.array(actionClassSchema).optional()
            })
          )
        })
      })
    )
  })
});

export type BudgetsConfig = z.infer<typeof budgetsSchema>;

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export function budgetsPath(workspace: string): string {
  return join(workspace, ".amc", "budgets.yaml");
}

export function budgetsSigPath(workspace: string): string {
  return `${budgetsPath(workspace)}.sig`;
}

export function defaultBudgets(agentId = "default"): BudgetsConfig {
  return budgetsSchema.parse({
    budgets: {
      version: 1,
      perAgent: {
        [agentId]: {
          daily: {
            maxLlmRequests: 500,
            maxLlmTokens: 5_000_000,
            maxCostUsd: 50,
            maxToolExecutes: {
              READ_ONLY: 500,
              WRITE_LOW: 50,
              WRITE_HIGH: 5,
              DEPLOY: 3,
              SECURITY: 0,
              FINANCIAL: 0,
              NETWORK_EXTERNAL: 20,
              DATA_EXPORT: 2,
              IDENTITY: 2
            }
          },
          perMinute: {
            maxLlmRequests: 60,
            maxLlmTokens: 200_000
          },
          consequences: {
            onExceed: [
              { action: "DOWNGRADE_TO_SIMULATE" },
              { action: "FREEZE_EXECUTE", actionClasses: ["DEPLOY", "WRITE_HIGH", "SECURITY"] },
              { action: "ALERT_OWNER" }
            ]
          }
        }
      }
    }
  });
}

export function loadBudgetsConfig(workspace: string): BudgetsConfig {
  const path = budgetsPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`Budgets config not found: ${path}`);
  }
  return budgetsSchema.parse(YAML.parse(readFileSync(path, "utf8")) as unknown);
}

export function signBudgetsConfig(workspace: string): string {
  const path = budgetsPath(workspace);
  const bytes = readFileSync(path);
  budgetsSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const digest = sha256Hex(bytes);
  const sig = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const payload: SignedDigest = {
    digestSha256: digest,
    signature: sig,
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = budgetsSigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

export function verifyBudgetsConfigSignature(workspace: string, content?: Buffer): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = budgetsPath(workspace);
  const sigPath = budgetsSigPath(workspace);
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "budgets config missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "budgets signature missing", path, sigPath };
  }
  try {
    const payload = JSON.parse(readFileSync(sigPath, "utf8")) as SignedDigest;
    const digest = sha256Hex(content ?? readFileSync(path));
    if (digest !== payload.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    const valid = verifyHexDigestAny(digest, payload.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}

/** Admission parses the exact bytes whose signature it verified. */
export function loadVerifiedBudgetsConfig(workspace: string): BudgetsConfig {
  const bytes = readFileSync(budgetsPath(workspace));
  if (!verifyBudgetsConfigSignature(workspace, bytes).valid) throw new Error("budgets config is not verifiable");
  return budgetsSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
}

export function initBudgets(workspace: string, agentId = "default"): { configPath: string; sigPath: string } {
  ensureDir(join(workspace, ".amc"));
  const configPath = budgetsPath(workspace);
  writeFileAtomic(configPath, YAML.stringify(defaultBudgets(agentId)), 0o644);
  const sigPath = signBudgetsConfig(workspace);
  return {
    configPath,
    sigPath
  };
}

export function budgetForAgent(config: BudgetsConfig, agentId: string): BudgetsConfig["budgets"]["perAgent"][string] | null {
  const explicit = config.budgets.perAgent[agentId];
  if (explicit) {
    return explicit;
  }
  const fallback = config.budgets.perAgent.default;
  return fallback ?? null;
}

/** Counters combine verified native and legacy evidence; numeric usage is a known subtotal. */
export function budgetUsageSnapshot(workspace: string, agentId: string, now = Date.now()): BudgetUsage {
  return projectBudgetUsage(readBudgetEvents(workspace), agentId, now);
}

export function evaluateBudgetStatus(workspace: string, agentId: string, now = Date.now()): {
  ok: boolean;
  reasons: string[];
  exceededActionClasses: ActionClass[];
  usage: ReturnType<typeof budgetUsageSnapshot>;
  budgetConfigValid: boolean;
  nativeAdmissionPolicy: { unknownTokenUsage: "BLOCK" | "ALLOW_WITH_WARNING"; tokenLimit: "between-dispatch-threshold"; costLimit: "known-subtotal-threshold" };
} {
  const nativeAdmissionPolicy = (unknownTokenUsage: "BLOCK" | "ALLOW_WITH_WARNING" = "BLOCK") => ({ unknownTokenUsage, tokenLimit: "between-dispatch-threshold" as const, costLimit: "known-subtotal-threshold" as const });
  const signature = verifyBudgetsConfigSignature(workspace);
  if (!signature.valid) {
    return {
      ok: false,
      reasons: ["budgets config signature invalid"],
      exceededActionClasses: ["DEPLOY", "WRITE_HIGH", "SECURITY"],
      usage: budgetUsageSnapshot(workspace, agentId, now),
      budgetConfigValid: false,
      nativeAdmissionPolicy: nativeAdmissionPolicy()
    };
  }

  const config = loadBudgetsConfig(workspace);
  const budget = budgetForAgent(config, agentId);
  if (!budget) {
    return {
      ok: true,
      reasons: [],
      exceededActionClasses: [],
      usage: budgetUsageSnapshot(workspace, agentId, now),
      budgetConfigValid: true,
      nativeAdmissionPolicy: nativeAdmissionPolicy()
    };
  }
  const usage = budgetUsageSnapshot(workspace, agentId, now);
  const reasons: string[] = [];
  const exceededActionClasses: ActionClass[] = [];

  if (usage.minute.llmRequests > budget.perMinute.maxLlmRequests) {
    reasons.push(`per-minute llm requests exceeded (${usage.minute.llmRequests} > ${budget.perMinute.maxLlmRequests})`);
  }
  if (usage.minute.llmTokens > budget.perMinute.maxLlmTokens) {
    reasons.push(`per-minute llm tokens exceeded (${usage.minute.llmTokens} > ${budget.perMinute.maxLlmTokens})`);
  }
  if (usage.daily.llmRequests > budget.daily.maxLlmRequests) {
    reasons.push(`daily llm requests exceeded (${usage.daily.llmRequests} > ${budget.daily.maxLlmRequests})`);
  }
  if (usage.daily.llmTokens > budget.daily.maxLlmTokens) {
    reasons.push(`daily llm tokens exceeded (${usage.daily.llmTokens} > ${budget.daily.maxLlmTokens})`);
  }
  if (usage.daily.llmCostUsd > budget.daily.maxCostUsd) {
    reasons.push(`daily llm cost exceeded (${usage.daily.llmCostUsd} > ${budget.daily.maxCostUsd})`);
  }
  for (const [actionClass, max] of Object.entries(budget.daily.maxToolExecutes) as Array<[ActionClass, number]>) {
    const actual = usage.daily.toolExecutes[actionClass] ?? 0;
    if (actual > max) {
      reasons.push(`daily tool executes exceeded for ${actionClass} (${actual} > ${max})`);
      exceededActionClasses.push(actionClass);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    exceededActionClasses: [...new Set(exceededActionClasses)],
    usage,
    budgetConfigValid: true,
    nativeAdmissionPolicy: nativeAdmissionPolicy(budget.unknownTokenUsage)
  };
}

export function resetBudgetDay(params: {
  workspace: string;
  agentId: string;
  day: string;
}): string {
  const date = new Date(`${params.day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --day format: ${params.day} (expected yyyy-mm-dd)`);
  }
  const ledger = openLedger(params.workspace);
  const sessionId = `budget-reset-${Date.now()}`;
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-budgets-reset",
      binarySha256: sha256Hex("amc-budgets-reset")
    });
    const id = ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "BUDGET_RESET",
        severity: "LOW",
        agentId: params.agentId,
        day: params.day
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: "BUDGET_RESET",
        severity: "LOW",
        agentId: params.agentId,
        day: params.day,
        trustTier: "OBSERVED"
      }
    });
    ledger.sealSession(sessionId);
    return id;
  } finally {
    ledger.close();
  }
}

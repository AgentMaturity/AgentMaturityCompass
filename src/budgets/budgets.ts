import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ActionClass } from "../types.js";

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

const budgetsSchema = z.object({
  budgets: z.object({
    version: z.literal(1),
    perAgent: z.record(z.string(), 
      z.object({
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

function todayBounds(now = Date.now()): { start: number; end: number } {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const start = date.getTime();
  return {
    start,
    end: start + 24 * 60 * 60 * 1000 - 1
  };
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
  const digest = sha256Hex(readFileSync(path));
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

export function verifyBudgetsConfigSignature(workspace: string): {
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
    const digest = sha256Hex(readFileSync(path));
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

function numericUsageTokens(usage: unknown): number {
  if (!usage || typeof usage !== "object") {
    return 0;
  }
  const row = usage as Record<string, unknown>;
  const candidates = [
    row.total_tokens,
    row.totalTokens,
    row.input_tokens,
    row.inputTokens,
    row.output_tokens,
    row.outputTokens
  ].filter((value) => typeof value === "number") as number[];
  return candidates.length > 0 ? candidates.reduce((sum, value) => sum + value, 0) : 0;
}

function numericUsageCost(usage: unknown): number {
  if (!usage || typeof usage !== "object") {
    return 0;
  }
  const row = usage as Record<string, unknown>;
  const candidates = [row.cost_usd, row.costUsd, row.total_cost_usd, row.totalCostUsd].filter((value) => typeof value === "number") as number[];
  return candidates.length > 0 ? (candidates[0] ?? 0) : 0;
}

export function budgetUsageSnapshot(workspace: string, agentId: string, now = Date.now()): {
  daily: {
    llmRequests: number;
    llmTokens: number;
    llmCostUsd: number;
    toolExecutes: Record<ActionClass, number>;
  };
  minute: {
    llmRequests: number;
    llmTokens: number;
  };
} {
  const day = todayBounds(now);
  const minuteStart = now - 60_000;
  const ledger = openLedger(workspace);
  const toolTemplate: Record<ActionClass, number> = {
    READ_ONLY: 0,
    WRITE_LOW: 0,
    WRITE_HIGH: 0,
    DEPLOY: 0,
    SECURITY: 0,
    FINANCIAL: 0,
    NETWORK_EXTERNAL: 0,
    DATA_EXPORT: 0,
    IDENTITY: 0
  };
  try {
    const eventsDay = ledger.getEventsBetween(day.start, day.end).filter((event) => {
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        return (meta.agentId ?? "default") === agentId;
      } catch {
        return false;
      }
    });
    const eventsMinute = ledger.getEventsBetween(minuteStart, now).filter((event) => {
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        return (meta.agentId ?? "default") === agentId;
      } catch {
        return false;
      }
    });

    let llmTokensDay = 0;
    let llmCostDay = 0;
    for (const event of eventsDay) {
      if (event.event_type === "llm_response") {
        try {
          const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
          llmTokensDay += numericUsageTokens(meta.usage);
          llmCostDay += numericUsageCost(meta.usage);
        } catch {
          // ignore malformed
        }
      }
      if (event.event_type === "tool_action") {
        try {
          const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
          const payload = event.payload_inline ? (JSON.parse(event.payload_inline) as Record<string, unknown>) : {};
          const effectiveMode = (payload.effectiveMode ?? meta.effectiveMode) as unknown;
          const actionClass = (payload.actionClass ?? meta.actionClass) as unknown;
          if (effectiveMode === "EXECUTE" && typeof actionClass === "string" && actionClass in toolTemplate) {
            toolTemplate[actionClass as ActionClass] += 1;
          }
        } catch {
          // ignore malformed
        }
      }
    }

    let llmTokensMinute = 0;
    for (const event of eventsMinute) {
      if (event.event_type === "llm_response") {
        try {
          const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
          llmTokensMinute += numericUsageTokens(meta.usage);
        } catch {
          // ignore malformed
        }
      }
    }

    return {
      daily: {
        llmRequests: eventsDay.filter((event) => event.event_type === "llm_request").length,
        llmTokens: llmTokensDay,
        llmCostUsd: Number(llmCostDay.toFixed(6)),
        toolExecutes: toolTemplate
      },
      minute: {
        llmRequests: eventsMinute.filter((event) => event.event_type === "llm_request").length,
        llmTokens: llmTokensMinute
      }
    };
  } finally {
    ledger.close();
  }
}

export function evaluateBudgetStatus(workspace: string, agentId: string, now = Date.now()): {
  ok: boolean;
  reasons: string[];
  exceededActionClasses: ActionClass[];
  usage: ReturnType<typeof budgetUsageSnapshot>;
  budgetConfigValid: boolean;
} {
  const signature = verifyBudgetsConfigSignature(workspace);
  if (!signature.valid) {
    return {
      ok: false,
      reasons: ["budgets config signature invalid"],
      exceededActionClasses: ["DEPLOY", "WRITE_HIGH", "SECURITY"],
      usage: budgetUsageSnapshot(workspace, agentId, now),
      budgetConfigValid: false
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
      budgetConfigValid: true
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
    budgetConfigValid: true
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

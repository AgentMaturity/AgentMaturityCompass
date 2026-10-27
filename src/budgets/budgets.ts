import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getSigningKey, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory, getSigningPublicKeyPem, assertSigningKeyUsable } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { canonicalSigningKey, verifyWithKey } from "../keys/algorithmPolicy.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgPairs, captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ActionClass } from "../types.js";
import { projectBudgetUsage, readBudgetEvents, type BudgetUsage } from "./nativeBudgetUsage.js";
import type { TrustContext } from "../trust/trustContext.js";

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

export class BudgetsPublicationError extends Error {
  readonly code = "BUDGETS_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("budget publication is incomplete; earlier members remain committed", { cause }); this.name = "BudgetsPublicationError";
  }
}

/** Fixed raw config-purpose authority, captured before any prerequisite await. No fabricated checked signature. */
function budgetAuthority(workspace: string) {
  const captured = capturePurposePublication(workspace, "config-signature");
  const bound = boundProviderKey(workspace, "config-signature"), holder = bound?.binding.provider ?? "file";
  const publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature"), identity = canonicalSigningKey(publicKeyPem);
  if (identity === null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original budget signing key is unsupported");
  const assertCurrent = () => {
    const current = assertKeysetComplete(workspace), policy = keyPolicy(loadKeysConfig(workspace));
    if (current === null || canonicalize(current) !== captured.keyset || !policy.allowed.includes(identity.algorithm) || (holder === "file" && policy.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original budget purpose authority changed or is refused");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    if (holder === "file") {
      if (!vaultStatus(workspace).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
      if (publicKeyFromPrivate(getSigningKey(workspace, "config-signature")) !== publicKeyPem)
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the original budget purpose key changed");
    }
  };
  assertCurrent(); return { captured, publicKeyPem, assertCurrent };
}

/** Internal fixed budgets writer, absent from root SDK. Call before the operation's FIRST await. */
export function captureBudgetsPublication(workspace: string, beforePublish: () => void = () => {}) {
  beforePublish(); const original = budgetAuthority(workspace), path = budgetsPath(workspace), sigPath = budgetsSigPath(workspace);
  const before = captureOrgPairs([path]), currentBytes = orgPairBytes(before, path); let expected = before, preparedOnce = false;
  const assertCurrent = () => { beforePublish(); original.assertCurrent(); assertOrgPairsCurrent(expected); };
  const plan = (replacement?: Uint8Array) => {
    const bytes = replacement === undefined ? currentBytes === null ? null : Buffer.from(currentBytes) : Buffer.from(replacement);
    if (bytes === null) throw new Error(`Budgets config not found: ${path}`);
    budgetsSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
    return { bytes, replacesBody: replacement !== undefined, digestSha256: sha256Hex(bytes) };
  };
  const prepared = (planned: ReturnType<typeof plan>, signature: string, assertSignature: () => void, assertInputsCurrent: () => void = () => {}) => {
    const signatureBytes = Buffer.from(JSON.stringify({ digestSha256: planned.digestSha256, signature, signedTs: Date.now(), signer: "auditor" } satisfies SignedDigest, null, 2));
    let returned = false;
    const current = () => { beforePublish(); assertInputsCurrent(); original.assertCurrent(); assertSignature(); assertOrgPairsCurrent(expected); };
    return Object.freeze({ path, sigPath, bytes: Buffer.from(planned.bytes), assertCurrent: current,
      publish(options: { beforeMember?: (path: string) => void; recorded?: (path: string) => void } = {}) {
        if (returned) throw new Error("budget publication handle has already returned; capture a new operation");
        return withControlFileLock({ root: join(workspace, ".amc"), name: "budgets-writer", operation: () => {
          current(); const published: string[] = []; let attemptedPath = relative(workspace, path);
          try {
            for (const member of planned.replacesBody ? [{ path, bytes: planned.bytes }, { path: sigPath, bytes: signatureBytes }] : [{ path: sigPath, bytes: signatureBytes }]) {
              attemptedPath = relative(workspace, member.path); options.beforeMember?.(member.path);
              // External negative/input callbacks precede fixed authority and exact destination CAS.
              current(); writeFileAtomic(member.path, member.bytes, 0o644); published.push(attemptedPath);
              const own = captureOrgFiles([member.path]), actual = own.members[0]!;
              if (actual.mode !== 0o644 || actual.bytes === null || !actual.bytes.equals(member.bytes)) throw new Error("returned budget member differs from its prepared bytes");
              expected = { members: expected.members.map(previous => previous.path === member.path ? actual : previous) };
              options.recorded?.(member.path);
            }
            current(); returned = true; return { configPath: path, sigPath };
          } catch (cause) { throw new BudgetsPublicationError(Object.freeze([...published]), attemptedPath, cause); }
        } });
      }
    });
  };
  return Object.freeze({ bytes: currentBytes === null ? null : Buffer.from(currentBytes), assertCurrent,
    prepareLocal(replacement?: Uint8Array) {
      if (preparedOnce) throw new Error("budget writer already prepared its operation"); preparedOnce = true;
      const planned = plan(replacement); assertCurrent();
      const signature = signHexDigest(planned.digestSha256, getSigningKey(workspace, "config-signature"));
      const assertSignature = () => { if (!verifyWithKey(Buffer.from(planned.digestSha256, "hex"), original.publicKeyPem, Buffer.from(signature, "base64")))
        throw new Error("prepared budget signature is not from the original config authority"); };
      assertCurrent(); assertSignature(); return prepared(planned, signature, assertSignature);
    },
    async prepareAsync(replacement?: Uint8Array, assertInputsCurrent: () => void = () => {}) {
      if (preparedOnce) throw new Error("budget writer already prepared its operation"); preparedOnce = true;
      const planned = plan(replacement), beforeSign = () => { beforePublish(); assertInputsCurrent(); original.assertCurrent(); assertOrgPairsCurrent(expected); }; beforeSign();
      const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(planned.digestSha256, "hex"), { beforeSign });
      beforeSign(); const assertSignature = () => { original.assertCurrent(); assertPurposePublicationCurrent(workspace, original.captured, signed); };
      assertSignature(); return prepared(planned, signed.signature.toString("base64"), assertSignature, assertInputsCurrent);
    }
  });
}

export function signBudgetsConfig(workspace: string): string {
  return captureBudgetsPublication(workspace).prepareLocal().publish().sigPath;
}
export async function signBudgetsConfigAsync(workspace: string): Promise<string> {
  return (await captureBudgetsPublication(workspace).prepareAsync()).publish().sigPath;
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
    assertKeysetComplete(workspace);
    const keys = getPurposeKeyHistory(workspace, "config-signature");
    if (keysetDeclared(workspace) && boundProviderKey(workspace, "config-signature") === null) {
      const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
      keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
    }
    const valid = typeof payload.signature === "string" && verifyHexDigestAny(digest, payload.signature, keys);
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
  return captureBudgetsPublication(workspace).prepareLocal(Buffer.from(YAML.stringify(defaultBudgets(agentId)))).publish();
}
export async function initBudgetsAsync(workspace: string, agentId = "default"): Promise<{ configPath: string; sigPath: string }> {
  return (await captureBudgetsPublication(workspace).prepareAsync(Buffer.from(YAML.stringify(defaultBudgets(agentId))))).publish();
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
export function budgetUsageSnapshot(workspace: string, agentId: string, now = Date.now(), options: { trust?: TrustContext } = {}): BudgetUsage {
  return projectBudgetUsage(readBudgetEvents(workspace, undefined, options), agentId, now);
}

export function evaluateBudgetStatus(workspace: string, agentId: string, now = Date.now(), options: { trust?: TrustContext } = {}): {
  ok: boolean;
  reasons: string[];
  exceededActionClasses: ActionClass[];
  usage: ReturnType<typeof budgetUsageSnapshot>;
  budgetConfigValid: boolean;
  nativeAdmissionPolicy: { unknownTokenUsage: "BLOCK" | "ALLOW_WITH_WARNING"; tokenLimit: "between-dispatch-threshold"; costLimit: "known-subtotal-threshold" };
} {
  const nativeAdmissionPolicy = (unknownTokenUsage: "BLOCK" | "ALLOW_WITH_WARNING" = "BLOCK") => ({ unknownTokenUsage, tokenLimit: "between-dispatch-threshold" as const, costLimit: "known-subtotal-threshold" as const });
  let policyBytes: Buffer | undefined;
  try { policyBytes = readFileSync(budgetsPath(workspace)); } catch { /* Preserve the existing invalid/missing policy status branch. */ }
  const signature = policyBytes === undefined ? { valid: false } : verifyBudgetsConfigSignature(workspace, policyBytes);
  if (!signature.valid) {
    return {
      ok: false,
      reasons: ["budgets config signature invalid"],
      exceededActionClasses: ["DEPLOY", "WRITE_HIGH", "SECURITY"],
      usage: budgetUsageSnapshot(workspace, agentId, now, options),
      budgetConfigValid: false,
      nativeAdmissionPolicy: nativeAdmissionPolicy()
    };
  }

  const config = budgetsSchema.parse(YAML.parse(policyBytes!.toString("utf8")) as unknown);
  const budget = budgetForAgent(config, agentId);
  if (!budget) {
    return {
      ok: true,
      reasons: [],
      exceededActionClasses: [],
      usage: budgetUsageSnapshot(workspace, agentId, now, options),
      budgetConfigValid: true,
      nativeAdmissionPolicy: nativeAdmissionPolicy()
    };
  }
  const usage = budgetUsageSnapshot(workspace, agentId, now, options);
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

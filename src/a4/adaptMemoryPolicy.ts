/**
 * Adapt's memory policy (P1-61 slice B; design §10.3 Propose and Build): what the agent may remember, for whom and for
 * how long, as `amc.a4-memory-policy/v1` at `<agent>/memory/policy.json` (inside the agent's `memory` Enforce resource).
 * The field names are ReasoningMemoryItem's (src/learning/reasoningMemory.ts, frozen: linked, never edited); an answer
 * left empty takes the stated default and is labelled `default`, never a guess. Enforcement is `advisory`: the
 * reasoning-memory writer does not read this file yet, so nothing here limits what it stores, and every surface says so.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DEFAULT_COMPACTION } from "../agent/compaction/promptPressure.js";
import type { CompactionConfig } from "../agent/loopTypes.js";
import { getAgentPaths } from "../fleet/paths.js";
import type { ReasoningMemoryConsumer, ReasoningMemoryPrivacyClass } from "../learning/reasoningMemory.js";
import { sessionSpillCap } from "../session/sessionPayloadCap.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { listValue, textValue } from "./spec/aspire.js";

export const MEMORY_POLICY_SCHEMA = "amc.a4-memory-policy/v1";
export const MEMORY_ENFORCEMENT_NOTE = "advisory: the reasoning-memory writer does not read this policy yet, so it limits nothing AMC stores";
const PRIVACY: readonly ReasoningMemoryPrivacyClass[] = ["public", "internal", "restricted"];
const CONSUMERS: readonly ReasoningMemoryConsumer[] = ["score", "recommendation", "fixer", "studio"];
/** reasoningMemory's own defaults (buildCandidate: 90-day expiry, 30-day review, every consumer); privacy defaults to the most restrictive class. */
const DEFAULTS = { privacyClass: "restricted", expiresAfterDays: 90, reviewAfterDays: 30, allowedConsumers: CONSUMERS } as const;
const MAX_DAYS = 3650;

const compactionSchema = z.strictObject({
  contextWindowTokens: z.number().int().positive().nullable(), threshold: z.number(), keepRecentSteps: z.number().int(), pruneMinBytes: z.number().int(),
  summarize: z.boolean(), maxPerTurn: z.number().int()
});
export const a4MemoryPolicySchema = z.strictObject({
  schema: z.literal(MEMORY_POLICY_SCHEMA),
  agentId: z.string().min(1),
  /** a4:<projectId>@r<n>: the revision whose answers this policy was built from. */
  source: z.string().regex(/^a4:[A-Za-z0-9_-]+@r\d+$/),
  privacyClass: z.enum(["public", "internal", "restricted"]),
  allowedConsumers: z.array(z.enum(["score", "recommendation", "fixer", "studio"])).min(1),
  retentionTag: z.string().regex(/^reasoning-memory:(public|internal|restricted):ttl-[1-9]\d*d:review-[1-9]\d*d$/),
  expiresAfterDays: z.number().int().min(1).max(MAX_DAYS),
  reviewAfterDays: z.number().int().min(1).max(MAX_DAYS),
  /** Automatic compaction as the loop reads it; off (a null window) unless an operator declares a context window. */
  compaction: compactionSchema,
  /** The encrypted spill store's cap for this workspace (sessionSpillCap) when the policy was written. */
  spillCapBytes: z.number().int().positive(),
  /** What the reasoning-memory writer redacts itself today, independent of this file. */
  redaction: z.strictObject({ secrets: z.literal(true), workspacePaths: z.literal(true) }),
  /** Per field: an answer, or the stated default. */
  sources: z.record(z.string(), z.enum(["answer", "default"])),
  enforcement: z.literal("advisory"),
  enforcementNote: z.literal(MEMORY_ENFORCEMENT_NOTE)
}).refine((policy) => policy.reviewAfterDays <= policy.expiresAfterDays, "reviewAfterDays must not exceed expiresAfterDays");
export type A4MemoryPolicy = z.infer<typeof a4MemoryPolicySchema>;

/** A whole number of days from 1 to 3650, or null (not a number of days). */
function days(text: string): number | null {
  return /^\d{1,4}$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_DAYS ? Number(text) : null;
}

/**
 * The memory answers as policy fields, each with its source, or the ids of the answers that are not values the policy
 * accepts (ANSWER_INVALID at Propose). Pure: no workspace read, so Explain and readiness show exactly what Build writes.
 */
export function memoryPolicyFields(values: ReadonlyMap<string, unknown>): { fields: Omit<A4MemoryPolicy, "schema" | "agentId" | "source" | "compaction"
  | "spillCapBytes" | "redaction" | "enforcement" | "enforcementNote">; invalid: string[] } {
  const invalid: string[] = [];
  const sources: Record<string, "answer" | "default"> = {};
  const privacyText = textValue(values.get("memoryPrivacyClass"))?.toLowerCase() ?? null;
  const privacyClass = privacyText === null ? DEFAULTS.privacyClass : (PRIVACY as readonly string[]).includes(privacyText) ? privacyText as ReasoningMemoryPrivacyClass : null;
  if (privacyClass === null) invalid.push("memoryPrivacyClass");
  sources.privacyClass = privacyText === null ? "default" : "answer";
  const dayField = (id: string, fallback: number, field: string): number => {
    const text = textValue(values.get(id));
    sources[field] = text === null ? "default" : "answer";
    if (text === null) return fallback;
    const parsed = days(text);
    if (parsed === null) invalid.push(id);
    return parsed ?? fallback;
  };
  const expiresAfterDays = dayField("memoryRetentionDays", DEFAULTS.expiresAfterDays, "expiresAfterDays");
  const reviewAfterDays = dayField("memoryReviewDays", Math.min(DEFAULTS.reviewAfterDays, expiresAfterDays), "reviewAfterDays");
  if (reviewAfterDays > expiresAfterDays && !invalid.includes("memoryReviewDays")) invalid.push("memoryReviewDays");
  const consumersText = listValue(values.get("memoryConsumers")).map((entry) => entry.toLowerCase());
  const allowedConsumers = consumersText.length === 0 ? [...DEFAULTS.allowedConsumers]
    : [...new Set(consumersText)].filter((entry): entry is ReasoningMemoryConsumer => (CONSUMERS as readonly string[]).includes(entry));
  if (consumersText.some((entry) => !(CONSUMERS as readonly string[]).includes(entry))) invalid.push("memoryConsumers");
  sources.allowedConsumers = consumersText.length === 0 ? "default" : "answer";
  const privacy = privacyClass ?? DEFAULTS.privacyClass;
  return { invalid, fields: { privacyClass: privacy, allowedConsumers, retentionTag: `reasoning-memory:${privacy}:ttl-${expiresAfterDays}d:review-${reviewAfterDays}d`,
    expiresAfterDays, reviewAfterDays, sources } };
}

/** `<agent>/memory/policy.json`: inside the agent's `memory` Enforce resource (src/enforce/resourceManifest.ts). */
export const memoryPolicyPath = (workspace: string, agentId: string): string => join(getAgentPaths(workspace, agentId).rootDir, "memory", "policy.json");

/** The `context.memoryPolicySha256` slot: the file's sha256, null only when it is absent; any other read error is 409 RESOURCE_UNREADABLE. */
export function memoryPolicySha256(workspace: string, agentId: string): string | null {
  try {
    return sha256Hex(readFileSync(memoryPolicyPath(workspace, agentId)));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw new A4StoreError(409, "RESOURCE_UNREADABLE", `context.memoryPolicySha256 (the agent's memory policy) could not be read (${code ?? "unknown error"})`);
  }
}

/**
 * Build's write: the policy from the proposal's answers, checked against its schema before it is written. A spill cap
 * that cannot be read (an ops policy that does not verify) refuses Build with its code rather than writing a guess.
 */
export function writeMemoryPolicy(input: { workspace: string; agentId: string; source: string; values: ReadonlyMap<string, unknown> }): { path: string; sha256: string;
  policy: A4MemoryPolicy } {
  const { fields, invalid } = memoryPolicyFields(input.values);
  if (invalid.length > 0) throw new A4StoreError(409, "A4_NOT_READY", "The memory answers are not values the policy accepts.", { reasonCodes: invalid.map((id) => `ANSWER_INVALID:${id}`) });
  let spillCapBytes: number;
  try {
    spillCapBytes = sessionSpillCap(input.workspace);
  } catch (error) {
    throw new A4StoreError(409, errorCodeOf(error, "OPS_POLICY_UNREADABLE"), "The spill cap could not be read from the signed ops policy; repair it, then build again.");
  }
  const compaction: CompactionConfig = { ...DEFAULT_COMPACTION };
  const policy = a4MemoryPolicySchema.parse({ schema: MEMORY_POLICY_SCHEMA, agentId: input.agentId, source: input.source, ...fields, compaction, spillCapBytes,
    redaction: { secrets: true, workspacePaths: true }, enforcement: "advisory", enforcementNote: MEMORY_ENFORCEMENT_NOTE });
  const path = memoryPolicyPath(input.workspace, input.agentId);
  const text = `${JSON.stringify(policy, null, 2)}\n`;
  ensureDir(dirname(path));
  writeFileAtomic(path, text, 0o644);
  return { path, sha256: sha256Hex(text), policy };
}

/**
 * Review's check: the file still holds the bytes Build wrote (`sha256`) and parses as the policy. Never fail-open: a
 * missing or unreadable file, other bytes, or a body that does not parse is reported with its code.
 */
export function checkMemoryPolicy(workspace: string, agentId: string, sha256: string): { parses: boolean; sameBytes: boolean; reason: string | null } {
  let bytes: Buffer;
  try {
    bytes = readFileSync(memoryPolicyPath(workspace, agentId));
  } catch (error) {
    return { parses: false, sameBytes: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "MEMORY_POLICY_MISSING" : "MEMORY_POLICY_UNREADABLE" };
  }
  const sameBytes = sha256Hex(bytes) === sha256;
  let parses = false;
  try {
    parses = a4MemoryPolicySchema.safeParse(JSON.parse(bytes.toString("utf8"))).success;
  } catch {
    parses = false;
  }
  return { parses, sameBytes, reason: !sameBytes ? "MEMORY_POLICY_CHANGED" : parses ? null : "MEMORY_POLICY_INVALID" };
}

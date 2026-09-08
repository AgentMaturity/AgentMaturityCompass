import { z } from "zod";

export const HARNESS_COMPARISON_VERSION = "2026-09-08" as const;
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = z.string().min(1).max(4096);
const envName = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/);
/** Literal, canonical loopback origins only; no DNS, credentials or URL paths. */
function isLoopbackOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const ipv4 = url.hostname.split(".");
    const loopback = url.hostname === "[::1]" || (ipv4.length === 4 && ipv4[0] === "127" &&
      ipv4.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255));
    return loopback && (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username && !url.password && url.port !== "0" && value === url.origin;
  } catch { return false; }
}
const localModelIdentitySchema = z.object({ runtimeSha256: hash, weightsSha256: z.array(hash).min(1).max(64) }).strict();
export const comparisonFilePinSchema = z.object({ path: boundedText, sha256: hash }).strict();
export const comparisonCommandSchema = z.object({
  executable: comparisonFilePinSchema,
  /** Script, configuration and dependency-lock pins used by this exact command. */
  inputs: z.array(comparisonFilePinSchema).max(64),
  args: z.array(z.string().max(8192)).max(128)
}).strict();

export const COMPARISON_SCENARIOS = ["success", "refusal", "injection", "redaction", "budget-exhaustion", "cancellation", "crash-recovery", "tool-error-attribution", "resume", "tampering", "child-identity", "unsupported-capability"] as const;
export const harnessComparisonManifestSchema = z.object({
  schemaVersion: z.literal(HARNESS_COMPARISON_VERSION),
  id,
  description: boundedText,
  environment: z.object({
    platform: z.enum(["linux", "darwin", "win32"]), arch: z.enum(["x64", "arm64"]),
    nodeVersion: z.string().regex(/^v?\d+\.\d+\.\d+$/),
    description: boundedText,
    /** Public literal values only. Runtime credentials are supplied separately. */
    variables: z.record(envName, z.string().max(4096)).default({})
  }).strict(),
  concurrency: z.literal(1),
  repetitions: z.number().int().min(1).max(100),
  captureBytesPerStream: z.number().int().min(1024).max(1_048_576).default(262_144),
  lanes: z.array(z.object({
    id, kind: z.enum(["keyless-conformance", "live-provider", "local-provider"]),
    provider: z.string().max(256).nullable(), model: z.string().max(256).nullable(),
    settings: z.record(z.string(), z.unknown()),
    permissions: z.object({
      read: z.array(boundedText).max(64), write: z.array(boundedText).max(64),
      network: z.array(boundedText).max(64), sandbox: boundedText,
      enforcement: z.literal("adapter-responsibility")
    }).strict(),
    budgets: z.object({ timeoutMs: z.number().int().min(1).max(3_600_000),
      maxTokens: z.number().int().positive().max(100_000_000).nullable(),
      maxCostUsd: z.number().positive().max(1000).nullable() }).strict(),
    requiredSecretEnv: z.array(envName).max(16)
  }).strict()).min(1).max(16),
  tasks: z.array(z.object({
    id, laneId: id, scenario: z.enum(COMPARISON_SCENARIOS), description: boundedText,
    fixture: comparisonFilePinSchema,
    /** An independent executable oracle, not the harness's own success flag. */
    oracle: comparisonCommandSchema
  }).strict()).min(1).max(100),
  targets: z.array(z.object({
    id, label: z.string().min(1).max(120),
    source: z.object({ url: z.string().url(), commit: z.string().regex(/^[a-f0-9]{40}$/),
      retrievedAt: z.string().datetime(), auditReference: boundedText }).strict(),
    artifact: comparisonFilePinSchema,
    bindings: z.array(z.object({ taskId: id, command: comparisonCommandSchema.nullable(),
      unavailableReason: boundedText.nullable(),
      supportsBoundedLiveExecution: z.boolean().default(false) }).strict()).max(100)
  }).strict()).min(1).max(16)
}).strict().superRefine((manifest, context) => {
  const reject = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  for (const [name, values] of [["lane", manifest.lanes], ["task", manifest.tasks], ["target", manifest.targets]] as const) {
    if (new Set(values.map(row => row.id)).size !== values.length) reject(`Duplicate ${name} identifiers.`);
  }
  const lanes = new Map(manifest.lanes.map(lane => [lane.id, lane]));
  const tasks = new Set(manifest.tasks.map(task => task.id));
  for (const task of manifest.tasks) if (!lanes.has(task.laneId)) reject("A task references a missing lane.");
  for (const target of manifest.targets) {
    if (new Set(target.bindings.map(binding => binding.taskId)).size !== target.bindings.length) reject("Duplicate target task bindings.");
    for (const binding of target.bindings) {
      if (!tasks.has(binding.taskId)) reject("A target binding references a missing task.");
      if (!binding.command && !binding.unavailableReason) reject("An unavailable binding needs a reason.");
    }
  }
  for (const lane of manifest.lanes) {
    if (lane.requiredSecretEnv.some(name => /^(?:HOME|USERPROFILE|PATH|TMPDIR|TEMP|TMP|XDG_.*|NODE_.*|LD_.*|DYLD_.*)$/i.test(name) || !/(?:KEY|TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|AUTH)/i.test(name))) reject("Live secret names cannot override the execution environment.");
    if (lane.kind === "keyless-conformance" && (lane.provider !== null || lane.model !== null || lane.requiredSecretEnv.length > 0 || lane.permissions.network.length > 0)) reject("Keyless lanes cannot request a provider, model, secret or network destination.");
    if (lane.kind === "live-provider" && (!lane.provider || !lane.model || lane.budgets.maxTokens === null || lane.budgets.maxCostUsd === null)) reject("Live lanes require a model, provider and finite token/spend limits.");
    if (lane.kind === "local-provider") {
      if (!lane.provider?.trim() || !lane.model?.trim() || lane.budgets.maxTokens === null || lane.budgets.maxCostUsd !== null) {
        reject("Local-provider lanes require a model, provider, finite token limit and no monetary budget.");
      }
      if (!isLoopbackOrigin(lane.settings.baseURL) || !lane.permissions.network.includes(lane.settings.baseURL) ||
          !lane.permissions.network.every(isLoopbackOrigin)) {
        reject("Local-provider destinations must be canonical literal loopback origins including settings.baseURL.");
      }
      if (lane.requiredSecretEnv.length) reject("Local-provider adapters must use task-owned local authentication, not inherited credentials.");
      if (lane.settings.modelKind !== "local-inference" || !localModelIdentitySchema.safeParse(lane.settings.modelIdentity).success) {
        reject("Local-provider lanes require explicit local-inference classification and operator runtime/weight digest pins; scripted backends are not model-quality evidence.");
      }
    }
  }
  if (manifest.targets.length * manifest.tasks.length * manifest.repetitions > 2000) reject("A comparison is limited to 2,000 trials.");
});

const count = z.number().int().nonnegative().max(1_000_000_000_000);
const sourceRef = z.string().min(1).max(2048);
export const comparisonObservationsSchema = z.object({
  schemaVersion: z.literal(HARNESS_COMPARISON_VERSION),
  /** Attributed adapter evidence, not an attestation of the served model or its quality. */
  modelExecution: z.object({ modelCalled: z.boolean(), source: z.literal("adapter-observation"), evidenceRef: sourceRef }).strict().optional(),
  usage: z.object({ inputTokens: count, outputTokens: count, cacheReadTokens: count.nullable(), cacheWriteTokens: count.nullable(),
    source: z.enum(["provider-response", "local-counter"]), evidenceRef: sourceRef }).strict().optional(),
  cost: z.object({ amountUsd: z.number().finite().nonnegative().max(1_000_000_000), source: z.enum(["provider-invoice", "published-rate-calculation"]),
    sourceUrl: z.string().url(), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), evidenceRef: sourceRef }).strict().optional(),
  interventions: z.object({ count, kind: z.enum(["observed-human", "automated-fixture"]), evidenceRef: sourceRef }).strict().optional(),
  evidencePreparationActions: z.object({ count, kind: z.enum(["observed-human", "automated-fixture"]), evidenceRef: sourceRef }).strict().optional()
}).strict();

export const comparisonOracleSchema = z.object({
  schemaVersion: z.literal(HARNESS_COMPARISON_VERSION),
  verdict: z.enum(["pass", "fail", "inconclusive", "unsupported"]),
  checks: z.array(z.object({ id, passed: z.boolean().nullable(), evidence: sourceRef }).strict()).min(1).max(128),
  falsePositives: z.object({ count, eligible: count, evidenceRef: sourceRef }).strict().optional()
}).strict().superRefine((oracle, context) => {
  const reject = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (new Set(oracle.checks.map(check => check.id)).size !== oracle.checks.length) reject("Duplicate oracle checks.");
  if (oracle.verdict === "pass" && !oracle.checks.every(check => check.passed === true)) reject("A pass requires every oracle check to pass.");
  if (oracle.verdict === "fail" && !oracle.checks.some(check => check.passed === false)) reject("A fail requires a failed oracle check.");
  if (oracle.falsePositives && oracle.falsePositives.count > oracle.falsePositives.eligible) reject("False positives exceed eligible observations.");
});

export type HarnessComparisonManifest = z.infer<typeof harnessComparisonManifestSchema>;
export type ComparisonCommand = z.infer<typeof comparisonCommandSchema>;
export type ComparisonFilePin = z.infer<typeof comparisonFilePinSchema>;
export type ComparisonObservations = z.infer<typeof comparisonObservationsSchema>;
export type ComparisonOracle = z.infer<typeof comparisonOracleSchema>;

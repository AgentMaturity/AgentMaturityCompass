/** Parsing, provider routing, approval policy selection and progress formatting for the native CLI. */
import chalk from "chalk";
import { InvalidArgumentError, type Command } from "commander";
import { readFileSync } from "node:fs";
import type { LlmRouteConfig, ProviderDescription } from "./llm/adapter/adapterRegistry.js";
import type { LlmAdapter } from "./llm/adapter/adapterTypes.js";
import { snapshotCapabilities } from "./llm/adapter/providerCapabilities.js";
import { defaultCredentialRefFor, nativeRouteDefaults } from "./llm/nativeRouteDefaults.js";
import { listModelMetadata, type ModelMetadataSnapshot } from "./llm/modelCatalog.js";
import { anthropicAdapter } from "./llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "./llm/providers/openaiAdapter.js";
import { openaiResponsesAdapter } from "./llm/providers/openaiResponsesAdapter.js";
import { deepseekAdapter } from "./llm/providers/deepseekAdapter.js";
import { deepseekParams } from "./llm/providers/deepseekContract.js";
import { geminiAdapter } from "./llm/providers/geminiAdapter.js";
import { geminiAudioAdapter } from "./llm/providers/geminiAudioAdapter.js";
import { geminiParams } from "./llm/providers/geminiContract.js";
import { ollamaAdapter } from "./llm/providers/ollamaAdapter.js";
import { createOllamaRoute } from "./llm/providers/ollamaRoute.js";
import { ollamaParams } from "./llm/providers/ollamaContract.js";
import { credentialOptionalOrigin, OPENAI_COMPATIBLE_ROUTES, openaiCompatibleRouteFor } from "./llm/providers/openaiCompatibleRoutes.js";
import { reasoningParamsFor } from "./llm/reasoningParams.js";
import { isCacheRetention } from "./llm/request/cacheRetentionEncoders.js";
import { DEFAULT_INITIAL_DELAY_MS, DEFAULT_MAX_DELAY_MS, MAX_RETRY_DELAY_MS, type RetryPolicyConfig } from "./llm/retryPolicy.js";
import { credentialRef } from "./credentials/credentialRef.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderAdapter, stubProviderRoute } from "./agent/stubProvider.js";
import type { CompactionConfig, LoopNotification } from "./agent/loopTypes.js";
import { compactionFromFlags } from "./agent/compaction/promptPressure.js";
import { liveNativeFailureGuidance, renderNativeFailureGuidance } from "./agent/nativeFailureGuidance.js";
import { isActionClass } from "./governor/actionCatalog.js";
import type { ActionClass } from "./types.js";
import type { LiveTextPreviewEvent } from "./llm/adapter/liveTextPreview.js";
import type { ComposedTurnHandle } from "./kernel/agentLoopRunner.js";
import type { ApprovalAnswerer, ApprovalRiskTier } from "./approvals/seam/approvalSeamTypes.js";
import {
  createApprovalExceptionAnswerer,
  describeApprovalException,
  parseApprovalExceptionNote
} from "./approvals/seam/devProfileException.js";
import { loadActiveCompiledPolicy } from "./catalog/compiler/activate.js";
import { DEFAULT_MAX_ACTIVE_CHILDREN } from "./agent/subagentSpawn.js";
import { createScopedExceptionAnswerer } from "./governor/scopedExceptions.js";

/** The side-effecting edges, injectable so the wiring itself is testable. */
export interface AgentLoopCliIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  /** Marks the run as failed (exit code 1). */
  readonly fail: () => void;
  /** Reports a non-failure exit code from the run table (3–6, src/cli/agentLoopOutputOptions.ts). Absent: the code is not observable. */
  readonly exit?: (code: number) => void;
  /** The prompt on stdin (SH-UI-01): null when stdin is a terminal and `-` was not given. Absent: this invocation has no stdin. */
  readonly readStdin?: (options: { readonly explicit: boolean }) => Promise<string | null>;
}

export const defaultAgentLoopIo: AgentLoopCliIo = {
  log: (line: string) => { console.log(line); },
  error: (line: string) => { console.error(line); },
  fail: () => { process.exitCode = 1; },
  // A code already recorded is never replaced (S10): `fail()`'s 1 stands over a later 3–6, and the first table code stands.
  exit: (code: number) => { if (code !== 0 && !process.exitCode) process.exitCode = code; },
  readStdin: options => import("./cli/agentLoopOutputOptions.js").then(module => module.readProcessStdin(options))
};

/** Import the composed runner, or explain that the kernel is not installed. */
export async function importRunner(io: AgentLoopCliIo): Promise<typeof import("./kernel/agentLoopRunner.js") | null> {
  try {
    return await import("./kernel/agentLoopRunner.js");
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === "ERR_MODULE_NOT_FOUND") {
      io.error(chalk.yellow("The packaged native runtime could not be loaded. Reinstall AMC from a complete package.\n"
        + "For a source checkout, install workspace dependencies and rebuild before running."));
      io.fail();
      return null;
    }
    throw error;
  }
}

export interface RunOptions {
  image?: string[];
  audioInput?: string;
  validationConfig?: string;
  validationConfigSha256?: string;
  validationRepair?: string;
  validate?: string[];
  extension?: string[];
  extensionPin?: string[];
  mcpConfig?: string[];
  mcpConfigSha256?: string[];
  delegate?: boolean;
  maxDelegationDepth?: string;
  maxActiveChildren?: string;
  delegateScope?: string;
  /** False is the explicit operator --no-delegate-stop reset, never a model argument. */
  delegateStop?: string[] | false;
  preset?: string;
  delegateProvider?: string;
  delegateTimeout?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  credential?: string;
  credentialsHome?: string;
  credentialsFile?: string;
  maxTokens?: string;
  thinking?: string;
  reasoningEffort?: string;
  /** SH-PROVIDERS-02: provider thinking token budget (Anthropic budget_tokens, Gemini thinkingBudget). */
  thinkingBudget?: string;
  /** SH-PROVIDERS-06: route prompt-cache retention, short or long; refused where the adapter has no retention wire. */
  cacheRetention?: string;
  /** SH-PROVIDERS-04: route retry policy from the command line; 0 retries means give up on the first failure. */
  maxRetries?: string;
  retryMaxDelay?: string;
  /** Ceiling on a provider-requested wait (Retry-After, reset headers); a surface with a turn deadline sets it to fit. */
  retryMaxProviderDelay?: string;
  maxSteps?: string;
  contextWindow?: string;
  compactThreshold?: string;
  autoSummary?: boolean;
  autoCompact?: boolean;
  tools?: string;
  toolMode?: string;
  unsafeUnconfinedShell?: boolean;
  failFirst?: string;
  thinkMs?: string;
  cancelAfter?: string;
  steer?: string;
  session?: string;
  forkFrom?: string;
  keepOpen?: boolean;
  /** P2-12: claim a lapsed remote or unresponsive writer of `--session`; the reason is recorded in the claim row. */
  takeoverExpiredWriter?: string;
  steerAfter?: string;
  persona?: string;
  missionContext?: boolean;
  listSkills?: boolean | string;
  approveTools?: string;
  approveRisk?: string;
  approvalException?: string;
  interactiveApprovals?: boolean;
  interactiveAskUser?: boolean;
  webSearchSearxng?: string;
  /** AXR-20: issued agent lease file, verified before use and never logged. */
  leaseFile?: string;
  goalRounds?: string;
  /** SH-ORCH-03: a reviewed plan file to run headless, and the durable run to resume in a resumed session. */
  workflowPlan?: string;
  workflowPlanSha256?: string;
  workflowRunId?: string;
  listAgents?: boolean | string;
  json?: boolean;
  stream?: boolean;
}

const RISK_TIERS: readonly ApprovalRiskTier[] = ["low", "medium", "high", "critical"];
export const collectOption = (value: string, previous: string[] = []): string[] => [...previous, value];

/** Keep contradictory stop/reset flags a refusal in either argv order. */
export function collectDelegateStop(value: string, previous: string[] | false = []): string[] {
  if (previous === false) throw new InvalidArgumentError("--delegate-stop and --no-delegate-stop cannot be combined.");
  return [...previous, value];
}

export function resetDelegateStops(_value: string, previous: string[] | false | undefined): false {
  if (Array.isArray(previous) && previous.length > 0) {
    throw new InvalidArgumentError("--delegate-stop and --no-delegate-stop cannot be combined.");
  }
  return false;
}

/** What the run's tool calls need before they may run, or `null` when nothing does. */
export interface ApprovalGateChoice {
  readonly actionClass: ActionClass;
  readonly riskTier: ApprovalRiskTier;
  readonly answerers: readonly ApprovalAnswerer[];
}

/**
 * Build the approval gate the operator asked for.
 *
 * Returns `undefined` when they asked for none, and `null` when they asked for
 * one that cannot be built — the two must not be confused, because "no gate" is
 * a run that proceeds and "broken gate" is a run that must not.
 *
 * THE ADR-5 EXCEPTION IS LOADED FROM A FILE, NOT FROM FLAGS. Turning human
 * approval off has to be a document somebody wrote, reviewed and can commit —
 * with a tracked id, a named approver and an expiry — rather than an argument
 * somebody typed. The banner is printed to stderr because an exception nobody
 * sees is a default; the durable record is the signed `approval/answer` row,
 * which names the exception on every call it grants.
 *
 * P2-24: in a regulated profile (an active compiled plan, or one that cannot be verified) that unsigned note is
 * refused; `--approval-exception` then names a signed scoped exception for the plan's approval control instead.
 */
export function approvalGateFor(
  io: AgentLoopCliIo,
  opts: RunOptions,
  scope: { readonly workspace: string; readonly agentId: string }
): ApprovalGateChoice | null | undefined {
  if (opts.approveTools === undefined) {
    if (opts.approvalException !== undefined) {
      io.error(
        chalk.red(
          "--approval-exception only means something with --approve-tools: it relaxes a gate, " +
            "and this run has no gate to relax."
        )
      );
      io.fail();
      return null;
    }
    return undefined;
  }
  const actionClass = opts.approveTools.trim().toUpperCase();
  if (!isActionClass(actionClass)) {
    io.error(chalk.red(`--approve-tools must be an action class, got ${JSON.stringify(opts.approveTools)}`));
    io.fail();
    return null;
  }
  const riskTier = (opts.approveRisk ?? "high").trim().toLowerCase();
  if (!(RISK_TIERS as readonly string[]).includes(riskTier)) {
    io.error(chalk.red(`--approve-risk must be one of ${RISK_TIERS.join(", ")}`));
    io.fail();
    return null;
  }
  const answerers: ApprovalAnswerer[] = [];
  const regulated = opts.approvalException === undefined ? null : regulatedApprovalControls(scope.workspace, actionClass);
  if (opts.approvalException !== undefined && regulated !== null) {
    try {
      const answerer = createScopedExceptionAnswerer({ ...scope, exceptionId: opts.approvalException, approvalControls: regulated });
      answerers.push(answerer);
      io.error(chalk.yellow(`SCOPED APPROVAL EXCEPTION ACTIVE — ${answerer.name}`));
    } catch (error: unknown) {
      io.error(chalk.red(error instanceof Error ? error.message : String(error)));
      io.fail();
      return null;
    }
  } else if (opts.approvalException !== undefined) {
    try {
      const note = parseApprovalExceptionNote(
        JSON.parse(readFileSync(opts.approvalException, "utf8")) as unknown
      );
      answerers.push(
        createApprovalExceptionAnswerer(note, {
          onLapsed: () => {
            io.error(
              chalk.yellow(
                `ADR-5 exception ${note.exceptionId} has lapsed; questions now go to the approvals engine.`
              )
            );
          }
        })
      );
      io.error(chalk.yellow(describeApprovalException(note)));
    } catch (error: unknown) {
      io.error(chalk.red(error instanceof Error ? error.message : String(error)));
      io.fail();
      return null;
    }
  }
  return { actionClass, riskTier: riskTier as ApprovalRiskTier, answerers };
}

/**
 * The active plan's approval controls for `actionClass`, each with the version the plan runs, or null outside a
 * regulated profile. A plan that cannot be verified counts as regulated with no approval control, so no exception can
 * relax it; so does a control id the plan names without a version.
 */
function regulatedApprovalControls(workspace: string, actionClass: ActionClass): readonly { controlId: string; controlVersion: string }[] | null {
  try {
    const plan = loadActiveCompiledPolicy(workspace);
    if (plan === null) return null;
    return (plan.runtimePolicy.approvals[actionClass]?.controlIds ?? []).flatMap((controlId) => {
      const control = plan.controls.find((row) => row.controlId === controlId);
      return control === undefined ? [] : [{ controlId, controlVersion: control.controlVersion }];
    });
  } catch {
    return [];
  }
}

/** Parse a positive-integer option, or report the flag that was wrong. */
export function integerOption(io: AgentLoopCliIo, flag: string, raw: string | undefined, fallback: number): number | null {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    io.error(chalk.red(`${flag} must be a non-negative integer, got ${JSON.stringify(raw)}`));
    io.fail();
    return null;
  }
  return value;
}

/** Parse the root cap and refuse explicit configuration when no child capability is offered. */
export function activeChildLimitOption(io: AgentLoopCliIo, raw: string | undefined, enabled: boolean): number | null {
  if (raw !== undefined && raw.trim() === "") {
    io.error(chalk.red("--max-active-children must be a non-negative integer")); io.fail(); return null;
  }
  const limit = integerOption(io, "--max-active-children", raw, DEFAULT_MAX_ACTIVE_CHILDREN);
  if (limit !== null && raw !== undefined && !enabled) {
    io.error(chalk.red("--max-active-children requires --delegate and --tools workspace, or an enabled signed preset.")); io.fail(); return null;
  }
  return limit;
}

/** Explicit compaction settings; undefined leaves reviewed route defaults to the driver, null reports an error. */
export function compactionOption(io: AgentLoopCliIo, options: Pick<RunOptions, "contextWindow" | "compactThreshold" | "autoSummary" | "autoCompact">,
  preset?: Partial<CompactionConfig>, route?: { readonly providerId: string; readonly model: string }): Partial<CompactionConfig> | undefined | null {
  try { return compactionFromFlags(options, preset, route); }
  catch (error) {
    io.error(chalk.red(error instanceof Error ? error.message : "Automatic compaction options were refused."));
    io.fail();
    return null;
  }
}

/** The flags paramsFor reads; `tools` decides whether Anthropic thinking (tools-free only) may be admitted. */
export type ParamsOptions = Pick<RunOptions, "thinking" | "reasoningEffort" | "thinkingBudget" | "tools">;

/** The default wire params for each supported adapter, and why each one is there. */
export function paramsFor(providerId: string, maxTokens: number, options: ParamsOptions = {}): Record<string, unknown> {
  // SH-PROVIDERS-02: one provider-honest mapping; unused reasoning options are refused, never ignored.
  const reasoning = reasoningParamsFor(providerId, options, { maxTokens, ...(options.tools === undefined ? {} : { tools: options.tools }) });
  // P1-38: pi-ai encoders own stream and stream_options; only the output bound is passed.
  if (providerId.startsWith(PI_AI_ROUTE_PREFIX)) return { max_tokens: maxTokens };
  if (openaiCompatibleRouteFor(providerId) !== null) return { max_tokens: maxTokens };
  switch (providerId) {
    case "ollama":
      // The native contract validates the bound and maps it to options.num_predict.
      // No OpenAI compatibility params or fabricated usage/cache options are sent.
      return ollamaParams({ max_tokens: maxTokens, ...reasoning });
    case "gemini": case "gemini-audio": {
      const config = reasoning.generationConfig as Record<string, unknown> | undefined;
      return geminiParams({ generationConfig: { maxOutputTokens: maxTokens, ...config } });
    }
    case "deepseek":
      // The native encoder owns stream/include_usage. Emit explicit documented
      // defaults, not SDK extra_body or silently remapped effort aliases.
      return deepseekParams({ max_tokens: maxTokens, ...reasoning });
    case "openai-responses":
      // The Responses encoder owns stream; its output bound has a different name.
      return { max_output_tokens: maxTokens };
    case "openai":
      // The Chat encoder owns stream/include_usage and rejects collisions.
      // Keeping those fields there also guarantees usage on every native surface.
      return { max_tokens: maxTokens };
    default:
      // `anthropic-messages@1` does not own `stream`, so the caller supplies it;
      // the stub route shares the encoder and is happy with the same shape.
      return { max_tokens: maxTokens, stream: true, ...reasoning };
  }
}

/** One inventory for executable CLI/ACP selection and local adapter discovery.
 * Gateway templates are deliberately not native adapters. Looking up entries in
 * an array also means prototype property names can never become provider routes.
 */
const NATIVE_ADAPTERS: readonly { readonly providerId: string; readonly adapter: LlmAdapter }[] = Object.freeze([
  { providerId: STUB_PROVIDER_ID, adapter: stubProviderAdapter },
  { providerId: "anthropic", adapter: anthropicAdapter },
  { providerId: "openai", adapter: openaiAdapter },
  { providerId: "openai-responses", adapter: openaiResponsesAdapter },
  { providerId: "deepseek", adapter: deepseekAdapter },
  { providerId: "gemini", adapter: geminiAdapter },
  { providerId: "gemini-audio", adapter: geminiAudioAdapter },
  { providerId: "ollama", adapter: ollamaAdapter },
  // SH-PROVIDERS-01: the OpenAI-compatible family and Azure, each under its own honest adapter identity.
  ...OPENAI_COMPATIBLE_ROUTES.map(({ providerId, adapter }) => ({ providerId, adapter }))
]);

function nativeAdapterFor(providerId: string): LlmAdapter {
  const entry = NATIVE_ADAPTERS.find(candidate => candidate.providerId === providerId);
  if (entry === undefined) {
    throw new Error(`unknown provider ${JSON.stringify(providerId)}; native CLI/ACP routes are `
      + NATIVE_ADAPTERS.map(candidate => JSON.stringify(candidate.providerId)).join(", "));
  }
  return entry.adapter;
}

/** Route-level options every native route accepts from the command line: retry policy and cache retention. */
export type RouteOptions = Pick<RunOptions, "baseUrl" | "credential" | "cacheRetention" | "maxRetries" | "retryMaxDelay" | "retryMaxProviderDelay">;

/** The reasoning and route flags `agent-loop run` and `chat` share; chat forwards them verbatim to each turn's run. */
export function withReasoningAndRouteOptions(command: Command, thinkingHelp: string): Command {
  return command
    .option("--thinking <mode>", thinkingHelp)
    .option("--reasoning-effort <effort>", "sent verbatim: DeepSeek low|high|max, Anthropic low|medium|high|xhigh|max (output_config.effort), Gemini MINIMAL|LOW|MEDIUM|HIGH (thinkingLevel), Ollama low|medium|high|max (think)")
    .option("--thinking-budget <tokens>", "Anthropic manual budget_tokens (Claude 4.5/4.6; >= 1024, below --max-tokens) or Gemini thinkingBudget")
    .option("--cache-retention <mode>", "short or long prompt-cache retention on anthropic, openai and openai-responses routes (refused elsewhere)")
    .option("--max-retries <n>", "model-request retries after the first attempt (default 5; 0 gives up on the first failure)")
    .option("--retry-max-delay <ms>", "local backoff ceiling in milliseconds (500 to 2147483647, default 10000)")
    .option("--retry-max-provider-delay <ms>", "ceiling on a provider-requested wait (Retry-After, reset headers), default 60000; never below --retry-max-delay");
}

/** A flag's integer, or a refusal naming the flag; the bounds are the ones resolveRetryPolicy enforces, checked here so the operator reads the flag's name, not a config path. */
function flagInteger(flag: string, raw: string | undefined, min: number, max: number, bound: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${flag} must be an integer ${bound}.`);
  return value;
}

function retryFromFlags(options: RouteOptions): RetryPolicyConfig | undefined {
  if (options.maxRetries === undefined && options.retryMaxDelay === undefined && options.retryMaxProviderDelay === undefined) return undefined;
  const maxRetries = flagInteger("--max-retries", options.maxRetries, 0, Number.MAX_SAFE_INTEGER, "of 0 or more");
  const maxDelayMs = flagInteger("--retry-max-delay", options.retryMaxDelay, DEFAULT_INITIAL_DELAY_MS, MAX_RETRY_DELAY_MS,
    `of milliseconds from ${DEFAULT_INITIAL_DELAY_MS} (the initial delay) through ${MAX_RETRY_DELAY_MS}`);
  // Never below the local ceiling, which is the default when --retry-max-delay is absent.
  const localCeiling = maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const maxProviderDelayMs = flagInteger("--retry-max-provider-delay", options.retryMaxProviderDelay, localCeiling, MAX_RETRY_DELAY_MS,
    `of milliseconds from the local ceiling (${localCeiling}, --retry-max-delay) through ${MAX_RETRY_DELAY_MS}`);
  const backoff = { ...(maxDelayMs === undefined ? {} : { maxDelayMs }), ...(maxProviderDelayMs === undefined ? {} : { maxProviderDelayMs }) };
  return { mode: "normal", ...(maxRetries === undefined ? {} : { maxRetries }), ...(Object.keys(backoff).length === 0 ? {} : { backoff }) };
}

/** Providers whose adapter has a reviewed retention wire (the registry enforces the same set by adapter id). */
const RETENTION_PROVIDERS: readonly string[] = ["anthropic", "openai", "openai-responses"];

function routeExtras(providerId: string, options: RouteOptions): Pick<LlmRouteConfig, "retry" | "cacheRetention"> {
  const retry = retryFromFlags(options);
  if (options.cacheRetention !== undefined && !isCacheRetention(options.cacheRetention)) throw new Error("--cache-retention must be short or long.");
  if (options.cacheRetention !== undefined && !RETENTION_PROVIDERS.includes(providerId)) {
    throw new Error(`--cache-retention is not admitted for provider ${providerId}: only ${RETENTION_PROVIDERS.join(", ")} have a reviewed retention wire.`);
  }
  return { ...(retry === undefined ? {} : { retry }), ...(options.cacheRetention === undefined ? {} : { cacheRetention: options.cacheRetention }) };
}

/** Pure operator selection shared with ACP. It never resolves a credential,
 * probes a server, pulls a model or falls back to a different protocol.
 */
export function nativeRouteFor(
  providerId: string,
  options: RouteOptions,
  model: string | undefined
): LlmRouteConfig {
  const adapter = nativeAdapterFor(providerId);
  const extras = routeExtras(providerId, options);
  if (providerId === STUB_PROVIDER_ID) return { ...stubProviderRoute(), ...extras };
  if (model === undefined || model.trim().length === 0) {
    throw new Error(`--model is required for provider ${providerId}`);
  }
  if (providerId === "ollama") {
    return { ...createOllamaRoute({ model,
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      // Local Ollama needs no credential by default. An explicit reference is
      // retained for an operator-configured authenticated origin, never guessed.
      ...(options.credential === undefined ? {} : { credentialRef: credentialRef(options.credential) }) }), ...extras };
  }
  // SH-PROVIDERS-01: the native inventory is the one source of compat defaults; gateway templates serve the rest.
  const compat = openaiCompatibleRouteFor(providerId);
  const baseUrl = options.baseUrl ?? nativeRouteDefaults(providerId)?.defaultBaseUrl;
  if (baseUrl === undefined || baseUrl === null) throw new Error(`--base-url is required for provider ${providerId}`);
  // The default credential goes only to the provider's own origin, as model enumeration rules (modelEnumeration.ts).
  const credential = options.credential ?? defaultCredentialRefFor(providerId, options.baseUrl);
  if (credential === undefined || credential === null) {
    // A local OpenAI-compatible server on a loopback origin needs no credential; anything else is refused, never guessed.
    if (compat !== null && credentialOptionalOrigin(baseUrl)) return { providerId, adapter, baseUrl, credentialRef: null, models: [model], ...extras };
    throw new Error(`--credential is required for provider ${providerId}`);
  }
  return { providerId, adapter, baseUrl,
    credentialRef: credentialRef(credential),
    models: [model], ...extras };
}

/** These are reporting rules, not measurements supplied by discovery. The actual
 * CLI/session reports still fold linked recorded outcomes via nativeRunUsage.
 */
const NATIVE_USAGE_CACHE_CONTRACT = Object.freeze({
  source: "linked-recorded-request-outcomes",
  missingCounts: "unknown-not-zero",
  tokenShareBasis: "reported-input-token-subtotal",
  requestHitRateBasis: "completed-requests-with-reported-cache-read",
  requestHit: "positive-reported-cache-read-tokens",
  excludedFromRates: Object.freeze(["failed", "partial", "pending", "unreported", "missing-cache-read", "synthetic"]),
  invalidEvidence: "rates-unavailable",
  cost: "not-derived"
});
const NATIVE_DISCOVERY_BOUNDARY = "Bundled adapter contracts only: no server, installed model, credential or cache probe. "
  + "Capabilities are not measured model support; a surface may accept fewer modalities. "
  + "Guide/chat menus are separate from the run/ACP selectors. Missing cache counts remain unknown, not zero.";

export interface NativeProviderDescription extends Omit<ProviderDescription, "models"> {
  readonly encoderId: string;
  readonly encoderVersion: number;
  /** Discovery only, not a route allowlist: null means models were not enumerated. */
  readonly models: readonly string[] | null;
  readonly modelSelection: "explicit-required" | "fixed-synthetic";
  /** Reviewed catalog assertions, not a model probe or route allowlist. */
  readonly reviewedCatalog?: readonly ModelMetadataSnapshot[];
}

/** Snapshot the same adapter contracts the route registry captures. Real model
 * names remain unknown; the sole listed model belongs to the synthetic stub.
 * No route endpoint, credential reference/value, environment or provider I/O.
 */
export function discoverNativeProviders(providerId?: string) {
  if (providerId !== undefined) nativeAdapterFor(providerId);
  const providers: readonly NativeProviderDescription[] = Object.freeze(NATIVE_ADAPTERS
    .filter(entry => providerId === undefined || entry.providerId === providerId)
    .map(({ providerId: id, adapter }) => Object.freeze({
      providerId: id, adapterId: adapter.id, adapterVersion: adapter.version,
      encoderId: adapter.encoderId, encoderVersion: adapter.encoderVersion,
      models: id === STUB_PROVIDER_ID ? Object.freeze([STUB_PROVIDER_MODEL]) : null,
      modelSelection: id === STUB_PROVIDER_ID ? "fixed-synthetic" as const : "explicit-required" as const,
      reviewedCatalog: adapter.capabilities === undefined ? Object.freeze([]) : listModelMetadata(id, adapter.capabilities.protocol),
      capabilities: snapshotCapabilities(adapter.capabilities)
    })));
  return Object.freeze({ schemaVersion: 1 as const, scope: "bundled-native-adapters" as const,
    selectors: Object.freeze(["agent-loop run", "acp"]),
    modelDiscovery: "not-performed" as const, credentialsChecked: false as const,
    measurement: "not-performed" as const, providers, usageCache: NATIVE_USAGE_CACHE_CONTRACT,
    boundary: NATIVE_DISCOVERY_BOUNDARY });
}

export function renderNativeProviderDiscovery(discovery: ReturnType<typeof discoverNativeProviders>): string {
  const lines = ["Native provider discovery (local adapter contracts)", discovery.boundary];
  for (const provider of discovery.providers) {
    const capabilities = provider.capabilities;
    lines.push(`${provider.providerId}: adapter ${provider.adapterId}@${provider.adapterVersion}; encoder ${provider.encoderId}@${provider.encoderVersion}`,
      `  protocol ${capabilities?.protocol ?? "unknown"}; model support ${capabilities?.modelSupport ?? "unknown"}; usage ${capabilities?.usage ?? "unknown"}; cache ${capabilities?.cache ?? "unknown"}`,
      `  cache-read reporting ${capabilities?.features["cache-read-usage"] ?? "unknown"}; cache-write reporting ${capabilities?.features["cache-write-usage"] ?? "unknown"}`);
  }
  lines.push("Cache-read token share is not request hit rate. Only complete, reported request outcomes with an explicit cache-read count enter rates; a reported zero is an eligible miss.",
    "Failed, partial, pending, missing-cache and synthetic requests are excluded. Invalid evidence makes rates unavailable. No token counts, cache rates or costs were measured by discovery.");
  return lines.join("\n");
}

/** Called by the CLI composition after the existing agent-loop and ACP commands.
 * Discovery is an explicit operator subcommand, never a banner on ACP stdio.
 */
export function registerNativeProviderCommands(program: Command, io: AgentLoopCliIo = {
  log: line => { console.log(line); }, error: line => { console.error(line); }, fail: () => { process.exitCode = 1; }
}): void {
  const agentLoop = program.commands.find(command => command.name() === "agent-loop");
  const acp = program.commands.find(command => command.name() === "acp");
  if (!agentLoop || !acp) throw new Error("Register agent-loop and ACP before native provider discovery.");
  for (const group of [agentLoop, acp]) {
    group.command("providers")
      .description("Describe bundled native adapters and usage/cache contracts without provider calls")
      .option("--provider <id>", "Describe this exact native provider; no fallback or live model search")
      .option("--json", "Output adapter contracts, explicit unknowns and reporting rules as JSON")
      .action((options: { provider?: string; json?: boolean }, command: Command) => {
        try {
          // Commander may consume shared flags on a parent even after the child
          // name. Honor explicit flags from either location, never ACP's default
          // stub (which would hide the rest of the inventory).
          let providerId = options.provider, json = options.json;
          for (let parent = command.parent; parent; parent = parent.parent) {
            if (providerId === undefined && parent.getOptionValueSource("provider") === "cli") {
              providerId = parent.getOptionValue("provider") as string | undefined;
            }
            if (json === undefined && parent.getOptionValueSource("json") === "cli") {
              json = parent.getOptionValue("json") === true;
            }
          }
          const discovery = discoverNativeProviders(providerId);
          io.log(json ? JSON.stringify(discovery, null, 2) : renderNativeProviderDiscovery(discovery));
        } catch (error) {
          io.error(error instanceof Error ? error.message : "Native provider discovery failed.");
          io.fail();
        }
      });
  }
  const help = "\nNative provider routes: " + NATIVE_ADAPTERS.map(entry => entry.providerId).join(", ")
    + ".\nUse amc agent-loop providers --json for adapter contracts, not model availability. "
    + "Ollama, lmstudio, vllm and llamacpp default to a loopback origin without a credential; azure-openai needs --base-url https://<resource>.openai.azure.com/openai and --credential (no default reference). "
    + "See docs/NATIVE_PROVIDERS.md for origins, reasoning flags, --cache-retention, --max-retries and the retry ceilings.";
  agentLoop.commands.find(command => command.name() === "run")?.addHelpText("after", help + PI_AI_ROUTES_HELP);
  acp.addHelpText("after", help);
}

/** P1-38. Kept literal so selecting a native route never loads the pi-ai modules; a test pins it to piAiRouteIds(). */
const PI_AI_ROUTE_PREFIX = "pi-ai:";
export const PI_AI_ROUTES_HELP = "\nThird-party library routes (agent-loop run only): pi-ai:groq, pi-ai:huggingface, pi-ai:together. "
  + "Requests are built by @earendil-works/pi-ai@1.3.0, an optional peer pinned to a reviewed version and not installed with AMC; "
  + "native routes stay the default. See docs/providers/CAPABILITY_MATRIX.md.";

/**
 * A pi-ai route and the encoder registry its runtime must use; undefined for any other provider, null after a refusal
 * was reported. The pi modules, and the optional peer they load, are imported only here and only for a pi route.
 */
export async function piAiRouteSelection(io: AgentLoopCliIo, providerId: string, options: RouteOptions,
  model: string | undefined): Promise<Awaited<ReturnType<typeof import("./llm/providers/piAi/piAiAdapter.js").piAiRouteFor>> | null | undefined> {
  if (!providerId.startsWith(PI_AI_ROUTE_PREFIX)) return undefined;
  try {
    // The same route flags every native route takes, refused or applied here before the pi modules load: a pi route
    // has no retention wire (its encoder pins retention to none), and its retry policy is the operator's, not the default.
    const extras = routeExtras(providerId, options);
    const { piAiRouteFor } = await import("./llm/providers/piAi/piAiAdapter.js");
    const selection = await piAiRouteFor(providerId, options, model);
    return Object.freeze({ ...selection, route: { ...selection.route, ...extras } });
  } catch (error) {
    io.error(chalk.red(error instanceof Error ? error.message : "pi-ai route selection failed."));
    io.fail();
    return null;
  }
}

/** Build the route the operator asked for, or explain why it cannot be built. */
/**
 * `model` is passed in rather than read from `options`, so a preset can supply
 * it: the effective value is decided once, at the call site, alongside every
 * other flag-then-preset-then-default fallback.
 */
export function routeFor(
  io: AgentLoopCliIo,
  providerId: string,
  options: RunOptions,
  model: string | undefined
): LlmRouteConfig | null {
  try { return nativeRouteFor(providerId, options, model); }
  catch (error) {
    io.error(chalk.red(error instanceof Error ? error.message : "Native provider selection failed."));
    io.fail();
    return null;
  }
}

/** One line per notification, so an operator watching a long turn sees it move. */
export function renderNotification(notification: LoopNotification): string | null {
  switch (notification.kind) {
    case "turn-start":
      return chalk.bold(`turn ${notification.turn} started`);
    case "step-start":
      return chalk.gray(`  step ${notification.turn}.${notification.step} → model`);
    case "retry":
      return notification.decision === "retry"
        ? chalk.yellow(
            `  step ${notification.turn}.${notification.step} attempt ${notification.attempt} failed; ` +
              `retrying in ${notification.delayMs ?? 0}ms`
          )
        : chalk.red(
            `  step ${notification.turn}.${notification.step} attempt ${notification.attempt} failed; not retrying`
          );
    case "turn-end":
      return chalk.bold(`turn ${notification.turn} ended: ${notification.ending.reason}`);
    case "compaction":
      return chalk.yellow(`  step ${notification.turn}.${notification.step} automatic compaction: ${notification.message}`);
    case "error":
      return chalk.red(`  native error at turn ${notification.turn}, step ${notification.step}: ${renderNativeFailureGuidance(liveNativeFailureGuidance(notification.error))}`);
    default:
      // status / step-end / inbox are visible in the summary that
      // follows, and echoing them here would bury the two lines that matter.
      return null;
  }
}

/** `--stream`: the provisional live reply on stderr; the recorded settlement remains the outcome. */
export function liveTextPreviewPrinter(): (event: LiveTextPreviewEvent) => void {
  let previewRequest: string | null = null;
  return event => {
    if (event.kind === "text") {
      if (previewRequest !== event.headerEventId) {
        process.stderr.write(`\nLive reply · session ${event.sessionId} · provisional until recorded settlement\n`);
        previewRequest = event.headerEventId;
      }
      process.stderr.write(event.text);
    } else if (previewRequest !== null) {
      process.stderr.write(event.truncated ? "\n[Live preview truncated; read the recorded result for the outcome.]\n"
        : "\n[Live preview ended; read the recorded result for the outcome.]\n");
      previewRequest = null;
    }
  };
}

/**
 * Ctrl-C is the operator's stop button and SIGTERM a parent stop: each produces the same signed cancellation
 * `--cancel-after` does, not a killed process whose turn a later recovery has to close as `interrupted`.
 * @returns the disposer that removes both listeners.
 */
export function armTurnSignals(handle: ComposedTurnHandle, io: AgentLoopCliIo): () => void {
  const onSigint = (): void => {
    io.error(chalk.yellow("\ncancelling the turn (cause: user)…"));
    handle.cancel({ kind: "user" });
  };
  const onSigterm = (): void => {
    io.error(chalk.yellow("\ncancelling the turn (signal: SIGTERM)…"));
    handle.cancel({ kind: "parent" }, { by: "signal:SIGTERM" });
    void handle.shutdown();
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  return () => { process.removeListener("SIGINT", onSigint); process.removeListener("SIGTERM", onSigterm); };
}

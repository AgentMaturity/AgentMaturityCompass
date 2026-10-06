/** Parsing, provider routing, approval policy selection and progress formatting for the native CLI. */
import chalk from "chalk";
import { InvalidArgumentError, type Command } from "commander";
import { readFileSync } from "node:fs";
import type { LlmRouteConfig, ProviderDescription } from "./llm/adapter/adapterRegistry.js";
import type { LlmAdapter } from "./llm/adapter/adapterTypes.js";
import { snapshotCapabilities } from "./llm/adapter/providerCapabilities.js";
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
import { credentialRef } from "./credentials/credentialRef.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderAdapter, stubProviderRoute } from "./agent/stubProvider.js";
import type { LoopNotification } from "./agent/loopTypes.js";
import { liveNativeFailureGuidance, renderNativeFailureGuidance } from "./agent/nativeFailureGuidance.js";
import { isActionClass } from "./governor/actionCatalog.js";
import type { ActionClass } from "./types.js";
import type { ApprovalAnswerer, ApprovalRiskTier } from "./approvals/seam/approvalSeamTypes.js";
import {
  createApprovalExceptionAnswerer,
  describeApprovalException,
  parseApprovalExceptionNote
} from "./approvals/seam/devProfileException.js";

/** The side-effecting edges, injectable so the wiring itself is testable. */
export interface AgentLoopCliIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  /** Marks the run as failed. */
  readonly fail: () => void;
}

export interface RunOptions {
  image?: string[];
  audioInput?: string;
  validationConfig?: string;
  validationConfigSha256?: string;
  validate?: string[];
  extension?: string[];
  extensionPin?: string[];
  mcpConfig?: string;
  mcpConfigSha256?: string;
  delegate?: boolean;
  maxDelegationDepth?: string;
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
  maxSteps?: string;
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
  steerAfter?: string;
  persona?: string;
  approveTools?: string;
  approveRisk?: string;
  approvalException?: string;
  interactiveApprovals?: boolean;
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
 */
export function approvalGateFor(
  io: AgentLoopCliIo,
  opts: RunOptions
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
  if (opts.approvalException !== undefined) {
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

/** The default wire params for each supported adapter, and why each one is there. */
export function paramsFor(providerId: string, maxTokens: number, options: Pick<RunOptions, "thinking" | "reasoningEffort"> = {}): Record<string, unknown> {
  if (providerId !== "deepseek" && (options.thinking !== undefined || options.reasoningEffort !== undefined)) {
    throw new Error("--thinking and --reasoning-effort on this surface require --provider deepseek; unused options are not ignored.");
  }
  switch (providerId) {
    case "ollama":
      // The native contract validates the bound and maps it to options.num_predict.
      // No OpenAI compatibility params or fabricated usage/cache options are sent.
      return ollamaParams({ max_tokens: maxTokens });
    case "gemini": case "gemini-audio": return geminiParams({ generationConfig: { maxOutputTokens: maxTokens } });
    case "deepseek":
      // The native encoder owns stream/include_usage. Emit explicit documented
      // defaults, not SDK extra_body or silently remapped effort aliases.
      return deepseekParams({ max_tokens: maxTokens,
        ...(options.thinking === undefined ? {} : { thinking: { type: options.thinking } }),
        ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }) });
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
      return { max_tokens: maxTokens, stream: true };
  }
}

const DEFAULT_BASE_URLS: Readonly<Record<string, string>> = Object.freeze({
  "gemini-audio": "https://generativelanguage.googleapis.com",
  gemini: "https://generativelanguage.googleapis.com",
  deepseek: "https://api.deepseek.com",
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  "openai-responses": "https://api.openai.com"
});

const DEFAULT_CREDENTIAL_REFS: Readonly<Record<string, string>> = Object.freeze({
  "gemini-audio": "GEMINI_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-responses": "OPENAI_API_KEY"
});

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
  { providerId: "ollama", adapter: ollamaAdapter }
]);

function nativeAdapterFor(providerId: string): LlmAdapter {
  const entry = NATIVE_ADAPTERS.find(candidate => candidate.providerId === providerId);
  if (entry === undefined) {
    throw new Error(`unknown provider ${JSON.stringify(providerId)}; native CLI/ACP routes are `
      + NATIVE_ADAPTERS.map(candidate => JSON.stringify(candidate.providerId)).join(", "));
  }
  return entry.adapter;
}

/** Pure operator selection shared with ACP. It never resolves a credential,
 * probes a server, pulls a model or falls back to a different protocol.
 */
export function nativeRouteFor(
  providerId: string,
  options: Pick<RunOptions, "baseUrl" | "credential">,
  model: string | undefined
): LlmRouteConfig {
  const adapter = nativeAdapterFor(providerId);
  if (providerId === STUB_PROVIDER_ID) return stubProviderRoute();
  if (model === undefined || model.trim().length === 0) {
    throw new Error(`--model is required for provider ${providerId}`);
  }
  if (providerId === "ollama") {
    return createOllamaRoute({ model,
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      // Local Ollama needs no credential by default. An explicit reference is
      // retained for an operator-configured authenticated origin, never guessed.
      ...(options.credential === undefined ? {} : { credentialRef: credentialRef(options.credential) }) });
  }
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URLS[providerId];
  if (baseUrl === undefined) throw new Error(`--base-url is required for provider ${providerId}`);
  return { providerId, adapter, baseUrl,
    credentialRef: credentialRef(options.credential ?? DEFAULT_CREDENTIAL_REFS[providerId] ?? "AMC_LLM_API_KEY"),
    models: [model] };
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
    + "Ollama requires an explicit model and defaults to its native local origin without a credential.";
  agentLoop.commands.find(command => command.name() === "run")?.addHelpText("after", help);
  acp.addHelpText("after", help);
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
    case "error":
      return chalk.red(`  native error at turn ${notification.turn}, step ${notification.step}: ${renderNativeFailureGuidance(liveNativeFailureGuidance(notification.error))}`);
    default:
      // status / step-end / inbox are visible in the summary that
      // follows, and echoing them here would bury the two lines that matter.
      return null;
  }
}

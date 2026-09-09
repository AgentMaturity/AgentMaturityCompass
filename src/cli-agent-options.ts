/** Parsing, provider routing, approval policy selection and progress formatting for the native CLI. */
import chalk from "chalk";
import { InvalidArgumentError } from "commander";
import { readFileSync } from "node:fs";
import type { LlmRouteConfig } from "./llm/adapter/adapterRegistry.js";
import { anthropicAdapter } from "./llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "./llm/providers/openaiAdapter.js";
import { openaiResponsesAdapter } from "./llm/providers/openaiResponsesAdapter.js";
import { credentialRef } from "./credentials/credentialRef.js";
import { STUB_PROVIDER_ID, stubProviderRoute } from "./agent/stubProvider.js";
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
  maxSteps?: string;
  tools?: string;
  toolMode?: string;
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
export function paramsFor(providerId: string, maxTokens: number): Record<string, unknown> {
  switch (providerId) {
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
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  "openai-responses": "https://api.openai.com"
});

const DEFAULT_CREDENTIAL_REFS: Readonly<Record<string, string>> = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-responses": "OPENAI_API_KEY"
});

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
  if (providerId === STUB_PROVIDER_ID) return stubProviderRoute();
  const adapter = providerId === "openai" ? openaiAdapter
    : providerId === "openai-responses" ? openaiResponsesAdapter
      : providerId === "anthropic" ? anthropicAdapter : null;
  if (adapter === null) {
    io.error(
      chalk.red(
        `unknown provider ${JSON.stringify(providerId)}; this surface ships ` +
          `"${STUB_PROVIDER_ID}", "anthropic", "openai" (Chat Completions), and "openai-responses"`
      )
    );
    io.fail();
    return null;
  }
  // `model` is a parameter now; see the note above.
  if (model === undefined) {
    io.error(chalk.red(`--model is required for provider ${providerId}`));
    io.fail();
    return null;
  }
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URLS[providerId];
  if (baseUrl === undefined) {
    io.error(chalk.red(`--base-url is required for provider ${providerId}`));
    io.fail();
    return null;
  }
  return {
    providerId,
    adapter,
    baseUrl,
    // A REFERENCE, never a value: the credentials seam resolves it per request
    // and this module never sees what it resolves to.
    credentialRef: credentialRef(options.credential ?? DEFAULT_CREDENTIAL_REFS[providerId] ?? "AMC_LLM_API_KEY"),
    models: [model]
  };
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

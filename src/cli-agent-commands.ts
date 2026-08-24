/**
 * The operator surface for the agent loop (plan P3.2 stage 4).
 *
 * `amc agent-loop run` is the first command in this repository that RUNS AN
 * AGENT: it opens a session, composes the seams, drives a turn, and then reports
 * what the signed log says happened. `amc agent-loop verify` is the other half —
 * it re-derives every model request from that log and checks the chains, so the
 * claim "the run is reconstructable and signed" is something an operator can
 * check rather than something a test asserted once.
 *
 * WHY IT IS A HIDDEN GROUP. Hidden commands are internal to
 * `buildCommandInventory`, so the published command-count claim is unaffected.
 * That matters here for an honest reason as well as a bookkeeping one: this is a
 * repository-checkout surface (see the kernel note below), not a shipped product
 * command, and counting it would be counting something an npm user cannot run.
 *
 * WHY IT IS `agent-loop` AND NOT `agent`. `amc agent` is already the agent
 * REGISTRY — a different thing entirely, about records of agents rather than
 * running one. Overloading it would be the same blur ADR-0009 removed between
 * "AMC observed an external agent" and "AMC ran one".
 *
 * WHY THE RUN GOES THROUGH THE COMPOSED TREE. `./kernel/agentLoopRunner.js`
 * composes `amcCredentials` → `amcLlm` → `amcAgentLoop` and drives the turn from
 * there. Building an `AgentDriver` here instead would have been one import
 * shorter and would have left three Cordis services with no caller but their own
 * tests. The cost is real and stated: the kernel is a workspace package, so this
 * command works from a repository checkout and reports plainly when it is run
 * from an npm install.
 *
 * HOW A TURN IS CANCELLED. With Ctrl-C, or with `--cancel-after`. There is no
 * `agent-loop cancel <session>` because there is no cross-process control
 * channel yet: a command that pretended to stop an agent in another process
 * would be a command that silently did nothing. What both supported paths do is
 * the real thing — `cancel({kind:"user"})`, which writes a signed `loop/cancel`
 * row and closes the turn `cancelled` with its cause inside the hashed
 * `turn/end`.
 */
import type { Command } from "commander";
import chalk from "chalk";
import type { LlmRouteConfig } from "./llm/adapter/adapterRegistry.js";
import { anthropicAdapter } from "./llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "./llm/providers/openaiAdapter.js";
import { credentialRef } from "./credentials/credentialRef.js";
import {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderRoute,
  stubProviderTransport
} from "./agent/stubProvider.js";
import type { LoopNotification } from "./agent/loopTypes.js";
import { echoToolSeam } from "./agent/echoTool.js";
import { readAgentRunSummary, renderRunSummary, renderVerifyReport, verifyAgentRun } from "./agent/runReport.js";

/** The side-effecting edges, injectable so the wiring itself is testable. */
export interface AgentLoopCliIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  /** Marks the run as failed. */
  readonly fail: () => void;
}

const defaultIo: AgentLoopCliIo = {
  log: (line: string) => {
    console.log(line);
  },
  error: (line: string) => {
    console.error(line);
  },
  fail: () => {
    process.exitCode = 1;
  }
};

interface RunOptions {
  provider?: string;
  model?: string;
  baseUrl?: string;
  credential?: string;
  credentialsHome?: string;
  credentialsFile?: string;
  maxTokens?: string;
  maxSteps?: string;
  tools?: string;
  failFirst?: string;
  thinkMs?: string;
  cancelAfter?: string;
  steer?: string;
  steerAfter?: string;
  json?: boolean;
}

/** Parse a positive-integer option, or report the flag that was wrong. */
function integerOption(io: AgentLoopCliIo, flag: string, raw: string | undefined, fallback: number): number | null {
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
function paramsFor(providerId: string, maxTokens: number): Record<string, unknown> {
  switch (providerId) {
    case "openai":
      // `include_usage` is not a nicety: the stream grammar refuses a successful
      // finish that emitted no usage, and OpenAI omits usage unless asked.
      return { max_tokens: maxTokens, stream: true, stream_options: { include_usage: true } };
    default:
      // `anthropic-messages@1` does not own `stream`, so the caller supplies it;
      // the stub route shares the encoder and is happy with the same shape.
      return { max_tokens: maxTokens, stream: true };
  }
}

const DEFAULT_BASE_URLS: Readonly<Record<string, string>> = Object.freeze({
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com"
});

const DEFAULT_CREDENTIAL_REFS: Readonly<Record<string, string>> = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY"
});

/** Build the route the operator asked for, or explain why it cannot be built. */
function routeFor(io: AgentLoopCliIo, providerId: string, options: RunOptions): LlmRouteConfig | null {
  if (providerId === STUB_PROVIDER_ID) return stubProviderRoute();
  const adapter = providerId === "openai" ? openaiAdapter : providerId === "anthropic" ? anthropicAdapter : null;
  if (adapter === null) {
    io.error(
      chalk.red(
        `unknown provider ${JSON.stringify(providerId)}; this surface ships ` +
          `"${STUB_PROVIDER_ID}", "anthropic" and "openai"`
      )
    );
    io.fail();
    return null;
  }
  const model = options.model;
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
function renderNotification(notification: LoopNotification): string | null {
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
    default:
      // status / step-end / inbox / error are all visible in the summary that
      // follows, and echoing them here would bury the two lines that matter.
      return null;
  }
}

/** Import the composed runner, or explain that the kernel is not installed. */
async function importRunner(
  io: AgentLoopCliIo
): Promise<typeof import("./kernel/agentLoopRunner.js") | null> {
  try {
    return await import("./kernel/agentLoopRunner.js");
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === "ERR_MODULE_NOT_FOUND") {
      io.error(
        chalk.yellow(
          "The composition kernel (@amc/core) is not installed.\n" +
            "`agent-loop run` drives the agent through the composed tree, and that tree lives in\n" +
            "workspace packages this release does not publish. Run from a repository checkout\n" +
            "(npm install && npm run build:workspace)."
        )
      );
      io.fail();
      return null;
    }
    throw error;
  }
}

export function registerAgentCommands(program: Command, io: AgentLoopCliIo = defaultIo): void {
  const group = program
    .command("agent-loop", { hidden: true })
    .description("Run and verify a native agent turn over the signed session spine (internal)");

  group
    .command("run")
    .description("Run one agent turn and report what the signed log recorded")
    .argument("[prompt...]", "the prompt that opens the turn")
    .option("--provider <id>", `provider route to send on (default "${STUB_PROVIDER_ID}")`)
    .option("--model <model>", "model to address")
    .option("--base-url <url>", "provider origin, when it differs from the default")
    .option("--credential <ref>", "credential REFERENCE (never a value) the route authenticates with")
    .option("--credentials-home <dir>", "home directory the credentials store reads from")
    .option("--credentials-file <path>", "explicit credentials file, overriding the home layout")
    .option("--max-tokens <n>", "provider max_tokens for each request")
    .option("--max-steps <n>", "how many model steps one turn may take")
    .option("--tools <mode>", 'tool seam: "echo" or "none"')
    .option("--fail-first <n>", "stub provider only: answer the first N dispatches with HTTP 429")
    .option("--think-ms <n>", "stub provider only: delay each answer, so a cancel has something to land in")
    .option("--cancel-after <ms>", "cancel the turn after this many milliseconds (Ctrl-C does the same)")
    .option("--steer <text>", "send a steering message mid-turn")
    .option("--steer-after <ms>", "when to send --steer (default 0)")
    .option("--json", "Output as JSON")
    .action(async (promptParts: string[], opts: RunOptions) => {
      const prompt = promptParts.join(" ").trim();
      if (prompt.length === 0) {
        io.error(chalk.red("a prompt is required: amc agent-loop run \"...\""));
        io.fail();
        return;
      }
      const providerId = opts.provider ?? STUB_PROVIDER_ID;
      const maxTokens = integerOption(io, "--max-tokens", opts.maxTokens, 1024);
      const maxSteps = integerOption(io, "--max-steps", opts.maxSteps, 8);
      const failFirst = integerOption(io, "--fail-first", opts.failFirst, 0);
      const thinkMs = integerOption(io, "--think-ms", opts.thinkMs, 0);
      const cancelAfter = integerOption(io, "--cancel-after", opts.cancelAfter, 0);
      const steerAfter = integerOption(io, "--steer-after", opts.steerAfter, 0);
      if (
        maxTokens === null ||
        maxSteps === null ||
        failFirst === null ||
        thinkMs === null ||
        cancelAfter === null ||
        steerAfter === null
      ) {
        return;
      }
      const route = routeFor(io, providerId, opts);
      if (route === null) return;
      const runner = await importRunner(io);
      if (runner === null) return;

      // Taken from the route rather than re-read from argv: `routeFor` already
      // decided which model this route serves (and refused when none was named),
      // so a second derivation here is a second chance to disagree with it.
      const model = route.models?.[0] ?? STUB_PROVIDER_MODEL;
      // The echo tool is offered by default only on the stub route: handing a
      // real provider a demonstration tool would spend the operator's money on
      // exercising a stub.
      const wantsTools = (opts.tools ?? (providerId === STUB_PROVIDER_ID ? "echo" : "none")) === "echo";
      const timers: NodeJS.Timeout[] = [];
      let onSigint: (() => void) | null = null;

      try {
        const outcome = await runner.runComposedTurn({
          workspace: process.cwd(),
          agentId: "default",
          systemPrompt: "You are an AMC-governed agent. Every step you take is recorded as signed evidence.",
          prompt,
          route: { providerId, model, params: paramsFor(providerId, maxTokens) },
          routes: [route],
          ...(providerId === STUB_PROVIDER_ID
            ? { transport: stubProviderTransport({ failFirst, thinkMs, retryAfterSeconds: 1 }) }
            : {}),
          ...(wantsTools ? { tools: echoToolSeam() } : {}),
          config: { maxStepsPerTurn: maxSteps },
          credentials: {
            // Watching is for a long-lived process picking up a rotation; a
            // single-turn command would only be opening and closing a watcher.
            watch: false,
            ...(opts.credentialsHome === undefined ? {} : { homeDir: opts.credentialsHome }),
            ...(opts.credentialsFile === undefined ? {} : { path: opts.credentialsFile })
          },
          notify: opts.json
            ? undefined
            : (notification: LoopNotification) => {
                const line = renderNotification(notification);
                if (line !== null) io.log(line);
              },
          onReady: (handle) => {
            // Ctrl-C is the operator's stop button, and it must produce the same
            // signed cancellation `--cancel-after` does — not a killed process
            // whose turn a later recovery has to close as `interrupted`.
            onSigint = () => {
              io.error(chalk.yellow("\ncancelling the turn (cause: user)…"));
              handle.cancel({ kind: "user" });
            };
            process.on("SIGINT", onSigint);
            if (cancelAfter > 0) {
              timers.push(setTimeout(() => handle.cancel({ kind: "user" }), cancelAfter));
            }
          },
          ...(opts.steer === undefined
            ? {}
            : {
                // Steering is sent through the same durable inbox a human uses;
                // there is no privileged path for a flag.
                onSteer: { afterMs: steerAfter, text: opts.steer }
              })
        });

        const summary = readAgentRunSummary(process.cwd(), outcome.sessionId, outcome.status);
        io.log(opts.json ? JSON.stringify(summary, null, 2) : renderRunSummary(summary));
        if (summary.driverStatus === "failed") io.fail();
      } finally {
        for (const timer of timers) clearTimeout(timer);
        if (onSigint !== null) process.removeListener("SIGINT", onSigint);
      }
    });

  group
    .command("verify")
    .description("Re-derive every model request in a session from the log and check the chains")
    .argument("<sessionId>", "session id, as reported by `agent-loop run`")
    .option("--json", "Output as JSON")
    .action(async (sessionId: string, opts: { json?: boolean }) => {
      const report = await verifyAgentRun(process.cwd(), sessionId);
      io.log(opts.json ? JSON.stringify(report, null, 2) : renderVerifyReport(report));
      if (!report.ok) io.fail();
    });
}

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
import { readFileSync } from "node:fs";
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
import { agentToolset } from "./agent/agentToolset.js";
import { delegateTool } from "./agent/delegateTool.js";
import { DEFAULT_MAX_DELEGATION_DEPTH } from "./agent/delegationIdentity.js";
import { parseDelegationScope } from "./agent/delegationScope.js";
import { IN_PROCESS_PROVIDER, delegationTurnOptions, resolveForeignRunner } from "./agent/providers/delegationProviders.js";
import type { SubagentRunner } from "./agent/subagentSpawn.js";
import { listAllowedTools } from "./toolhub/toolhubValidators.js";
import type { AgentToolSeam } from "./agent/toolSeam.js";
import type { SubagentCapability } from "./agent/delegateTool.js";
import { readAgentRunSummary, renderRunSummary, renderVerifyReport, verifyAgentRun } from "./agent/runReport.js";
import { registerPromptCommands } from "./cli-prompt-commands.js";
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
  delegate?: boolean;
  maxDelegationDepth?: string;
  delegateScope?: string;
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
  steerAfter?: string;
  persona?: string;
  approveTools?: string;
  approveRisk?: string;
  approvalException?: string;
  json?: boolean;
}

const RISK_TIERS: readonly ApprovalRiskTier[] = ["low", "medium", "high", "critical"];

/** What the run's tool calls need before they may run, or `null` when nothing does. */
interface ApprovalGateChoice {
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
function approvalGateFor(
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
  // The system-prompt group is registered from here rather than from cli.ts
  // because cli.ts sits at its line-ratchet floor, and because the assembled
  // prompt is the IDENTITY half of the same native-agent surface `agent-loop`
  // runs — the two answer halves of one question and belong together.
  registerPromptCommands(program, io);

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
    .option("--tools <mode>", 'tool seam: "workspace" (the governed built-ins), "echo", or "none"')
    .option("--tool-mode <mode>", '"native" (one call per step) or "code" (dispatch from a program)')
    .option(
      "--delegate",
      "offer the `delegate` tool so this run can hand work to in-process children. "
      + "Children share this run's budget and permissions and are recorded against it. "
      + "Requires \"delegate\" in the signed tool allowlist."
    )
    .option("--max-delegation-depth <n>", "how deep a delegation chain may go (default 3)")
    .option(
      "--delegate-provider <id>",
      "who executes a delegation: \"in-process\" (default) or a foreign CLI such as "
      + "\"claude-cli\". A foreign provider routes the child through AMC's gateway and "
      + "requires AMC Studio to be running."
    )
    .option("--delegate-timeout <ms>", "how long a foreign delegate may run before it is killed")
    .option(
      "--delegate-scope <classes>",
      "comma-separated action classes a delegate may invoke, e.g. READ_ONLY,WRITE_LOW. "
      + "Tools outside them are withheld from the child. Default: unrestricted."
    )
    .option("--fail-first <n>", "stub provider only: answer the first N dispatches with HTTP 429")
    .option("--think-ms <n>", "stub provider only: delay each answer, so a cancel has something to land in")
    .option("--cancel-after <ms>", "cancel the turn after this many milliseconds (Ctrl-C does the same)")
    .option("--steer <text>", "send a steering message mid-turn")
    .option("--steer-after <ms>", "when to send --steer (default 0)")
    .option("--persona <text>", "deployment persona assembled into the system prompt")
    .option(
      "--approve-tools <actionClass>",
      "require a signed human approval before every tool call, decided under this action class"
    )
    .option("--approve-risk <tier>", "risk tier the approval is raised at (default high)")
    .option(
      "--approval-exception <file>",
      "ADR-5 exception note (JSON) that auto-allows the classes it names until it expires"
    )
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
      // Through the same validating helper as every other numeric flag. An
      // earlier version used a bare `Number.parseInt`, so `--max-delegation-depth
      // deep` reached the capability as NaN — every depth comparison against NaN
      // is false, which silently turns the bound OFF rather than reporting the
      // typo. A limit that stops limiting when you misspell it is worse than no
      // limit, because the operator believes it is there.
      // Parsed before anything runs, and refused rather than narrowed to what it
      // could understand: a scope quietly reduced to its recognised half would
      // bind a delegate to something the operator never wrote.
      let delegateScope: readonly ActionClass[] | undefined;
      if (typeof opts.delegateScope === "string") {
        const parsed = parseDelegationScope(
          opts.delegateScope.split(",").map((token) => token.trim()).filter((token) => token.length > 0)
        );
        if (!parsed.ok) {
          io.error(chalk.red(`--delegate-scope: ${parsed.reason}`));
          io.fail();
          return;
        }
        delegateScope = parsed.classes;
      }
      const delegateTimeout = integerOption(io, "--delegate-timeout", opts.delegateTimeout, 0);
      const maxDelegationDepth = integerOption(
        io, "--max-delegation-depth", opts.maxDelegationDepth, DEFAULT_MAX_DELEGATION_DEPTH
      );
      if (
        maxTokens === null ||
        maxSteps === null ||
        failFirst === null ||
        thinkMs === null ||
        cancelAfter === null ||
        steerAfter === null ||
        maxDelegationDepth === null ||
        delegateTimeout === null
      ) {
        return;
      }
      const route = routeFor(io, providerId, opts);
      if (route === null) return;
      const gate = approvalGateFor(io, opts);
      if (gate === null) return;
      const runner = await importRunner(io);
      if (runner === null) return;

      // Taken from the route rather than re-read from argv: `routeFor` already
      // decided which model this route serves (and refused when none was named),
      // so a second derivation here is a second chance to disagree with it.
      const model = route.models?.[0] ?? STUB_PROVIDER_MODEL;
      // The echo tool is offered by default only on the stub route: handing a
      // real provider a demonstration tool would spend the operator's money on
      // exercising a stub.
      // `echo` stays the stub-route default: spending an operator's tokens to
      // exercise the real toolset is not a default anyone would choose, and the
      // echo tool exists precisely to make a multi-step turn observable.
      const toolMode = opts.tools ?? (providerId === STUB_PROVIDER_ID ? "echo" : "none");
      const wantsDelegation = opts.delegate === true;
      if (!wantsDelegation && opts.delegateProvider !== undefined) {
        // A flag configuring a capability nobody asked for does nothing, and the
        // operator has no way to tell it did nothing.
        io.error(chalk.red("--delegate-provider needs --delegate; nothing is delegating without it"));
        io.fail();
        return;
      }
      const dispatchMode = opts.toolMode === "code" ? "code" as const : "native" as const;
      let toolSeam: AgentToolSeam | null = null;
      let grantDelegation: ((capability: SubagentCapability) => void) | null = null;
      let foreignRunner: SubagentRunner | null = null;
      let foreignRunnerDescription = "";
      if (toolMode === "workspace") {
        const toolset = agentToolset({
          workspace: process.cwd(),
          agentId: "default",
          ...(dispatchMode === "code" ? { mode: dispatchMode } : {})
        });
        if (wantsDelegation) {
          // Said up front, not discovered mid-run. The capability and the signed
          // allowlist are granted by different parties, so an operator who
          // passed --delegate without permitting the tool would otherwise watch
          // the agent call it and be denied, once per turn.
          const permitted = listAllowedTools(process.cwd()).some((tool) => tool.name === "delegate");
          if (!permitted) {
            io.error(chalk.yellow(
              "--delegate needs \"delegate\" in the signed tool allowlist; add it to .amc/tools.yaml and re-sign: amc tools sign"
            ));
            return;
          }
        }
        if (!toolset.readiness.ready) {
          // Said once, up front, naming the command. Without this the operator
          // sees every tool denied and reads it as broken tools rather than as
          // unconfigured policy.
          io.error(chalk.yellow("the workspace toolset is not ready:"));
          for (const blocker of toolset.readiness.blockers) io.error(chalk.yellow(`  - ${blocker}`));
          return;
        }
        io.log(chalk.dim(
          `tool writes are scoped to: ${
            toolset.readiness.writeScope.length > 0 ? toolset.readiness.writeScope.join(", ") : "(nothing)"
          }`
        ));
        if (!toolset.readiness.confined) {
          // A warning, not a refusal: an unconfined fs.read is still governed
          // by the allowlist and the firewall. Code Mode is the part that
          // genuinely cannot run without a sandbox, and it refuses on its own.
          //
          // The two clauses are different facts and used to be one. Whether the
          // MACHINE has a backend is what an operator can fix by installing
          // something; whether THIS PROCESS is confined is what actually bounds
          // a program, and it is false everywhere today.
          io.error(chalk.yellow(
            `this process is not OS-confined (${toolset.readiness.sandboxReason ?? "unknown"}); `
            + "tool writes are bounded by policy only"
            + (toolset.readiness.sandboxBackendAvailable
              ? ""
              : ", and this machine has no sandbox backend either")
          ));
        }
        toolSeam = toolset.seam;
        // The kernel builds the delegation capability once it has the parent's
        // session and a child-session-bound LLM factory; this is where it lands.
        // Defining after construction is supported by design — `seam.schemas()`
        // re-reads the registry each step.
        if (wantsDelegation) {
          const providerId = opts.delegateProvider ?? IN_PROCESS_PROVIDER;
          if (providerId !== IN_PROCESS_PROVIDER) {
            const resolved = resolveForeignRunner({
              providerId,
              workspace: process.cwd(),
              agentId: "default",
              ...(delegateTimeout > 0 ? { timeoutMs: delegateTimeout } : {})
            });
            if (!resolved.ok) {
              io.error(chalk.red(resolved.reason));
              io.fail();
              return;
            }
            foreignRunner = resolved.runner;
            foreignRunnerDescription = resolved.describedAs;
          }
          // Reported FROM the value that gets passed, not beside it. Written as
          // two statements, a build could announce an out-of-process delegate
          // and hand the kernel nothing -- mutation testing found exactly that,
          // because the CLI tests can only reach the refusal paths (they have no
          // gateway to succeed against).
          io.log(chalk.dim(
            foreignRunner === null
              ? "delegates run in-process, under this run's own driver"
              : `delegates run out-of-process: ${foreignRunnerDescription}`
          ));
          grantDelegation = (capability) => { toolset.registry.define(delegateTool(capability)); };
          // Beside the write-scope line, and for the same reason: a bound the
          // operator cannot see is one they cannot check. It is also the only
          // place the parsed depth becomes observable, so a build that dropped
          // the operator's value and used the default would say so here.
          //
          // The second clause is not padding. `--max-delegation-depth 3` is
          // today behaviourally identical to 1: the kernel builds its child
          // runner without `grantDelegation`, so no child is ever offered
          // `delegate` and no chain reaches depth 2. Printing the configured
          // number alone would tell an operator chains may run three deep when
          // they cannot. Pinned by "a child is a leaf" in
          // tests/subagentRunnerEndToEnd.test.ts, which fails the day onward
          // delegation is wired and forces this line to be revisited with it.
          io.log(chalk.dim(
            `delegation is offered, chains bounded at depth ${maxDelegationDepth}`
            + (maxDelegationDepth > 1 ? " (children cannot delegate yet, so today's ceiling is 1)" : "")
          ));
          // Named either way. The unscoped case is the one an operator is most
          // likely not to have thought about, so it gets said out loud rather
          // than being the silent default.
          io.log(chalk.dim(
            delegateScope === undefined
              ? "delegates are unscoped: a child is offered every tool this run has"
              : `delegates are scoped to: ${delegateScope.join(", ")}`
          ));
        }
        // The toolset holds one evidence handle for the run; release it when
        // the process ends rather than leaking a SQLite handle per agent.
        process.once("exit", () => toolset.close());
      } else if (toolMode === "echo") {
        toolSeam = echoToolSeam();
      }
      const timers: NodeJS.Timeout[] = [];
      let onSigint: (() => void) | null = null;

      try {
        const outcome = await runner.runComposedTurn({
          workspace: process.cwd(),
          agentId: "default",
          // No pinned `systemPrompt`: the prompt is ASSEMBLED, which is what
          // gives the run its identity and pulls the workspace's own AGENTS.md /
          // CLAUDE.md in as runtime context. A hardcoded string here — what this
          // command sent before P3.3 — was an agent with no idea where it was.
          promptProfile: opts.persona === undefined ? {} : { persona: opts.persona },
          ...(gate === undefined
            ? {}
            : {
                approvalGate: {
                  actionClass: gate.actionClass,
                  riskTier: gate.riskTier,
                  answerers: gate.answerers,
                  onRaised: (event) => {
                    // The operator cannot answer a question whose id they do not
                    // have, and it only exists once the engine has minted it.
                    io.error(
                      chalk.yellow(
                        `awaiting approval ${event.approvalRequestId} — ` +
                          `answer it with: amc approvals approve --agent default --id ${event.approvalRequestId}`
                      )
                    );
                  }
                }
              }),
          prompt,
          route: { providerId, model, params: paramsFor(providerId, maxTokens) },
          routes: [route],
          ...(providerId === STUB_PROVIDER_ID
            ? { transport: stubProviderTransport({ failFirst, thinkMs, retryAfterSeconds: 1 }) }
            : {}),
          ...(toolSeam === null ? {} : { tools: toolSeam }),
          ...(grantDelegation === null
            ? {}
            : {
                delegation: delegationTurnOptions({
                  grant: grantDelegation,
                  maxDepth: maxDelegationDepth,
                  scope: delegateScope,
                  runner: foreignRunner
                })
              }),
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

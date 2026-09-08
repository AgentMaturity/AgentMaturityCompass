import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
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
 * WHY IT IS `agent-loop` AND NOT `agent`. `amc agent` is already the agent
 * REGISTRY — a different thing entirely, about records of agents rather than
 * running one. Overloading it would be the same blur ADR-0009 removed between
 * "AMC observed an external agent" and "AMC ran one".
 *
 * WHY THE RUN GOES THROUGH THE COMPOSED TREE. `./kernel/agentLoopRunner.js`
 * composes `amcCredentials` → `amcLlm` → `amcAgentLoop` and drives the turn from
 * there. Building an `AgentDriver` here instead would have been one import
 * shorter and would have left three Cordis services with no caller but their own
 * tests. The packaged runtime bundles the kernel and its workspace dependencies
 * through src/kernel/amcRuntime.ts.
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
import { resolveAgentId } from "./fleet/paths.js";
import chalk from "chalk";
import {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderTransport
} from "./agent/stubProvider.js";
import type { LoopNotification } from "./agent/loopTypes.js";
import { echoToolSeam } from "./agent/echoTool.js";
import { agentToolset, type AgentToolset } from "./agent/agentToolset.js";
import type { MountedNativeMcpServer, NativeMcpGrant } from "./mcp/nativeMcpClient.js";
import { NativeMcpConfigError, type LoadedNativeMcpConfiguration } from "./setup/nativeMcpConfig.js";
import { delegateTool } from "./agent/delegateTool.js";
import { DEFAULT_MAX_DELEGATION_DEPTH } from "./agent/delegationIdentity.js";
import { parseDelegationScope } from "./agent/delegationScope.js";
import { prepareSkillTurn, workspaceSkillRoots } from "./skills/skillTurn.js";
import { buildSkillCatalog } from "./skills/skillCatalog.js";
import { loadNativeExtensions, type NativeExtensionTurn } from "./extensions/nativeExtensionRuntime.js";
import { resolvePreset, type AgentPreset } from "./presets/agentPresets.js";
import { IN_PROCESS_PROVIDER, delegationTurnOptions, resolveForeignRunner } from "./agent/providers/delegationProviders.js";
import type { SubagentRunner } from "./agent/subagentSpawn.js";
import { listAllowedTools } from "./toolhub/toolhubValidators.js";
import type { AgentToolSeam } from "./agent/toolSeam.js";
import type { SubagentCapability } from "./agent/delegateTool.js";
import type { ComposedToolSession } from "./kernel/agentLoopRunner.js";
import { readAgentRunSummary, renderRunSummary, renderVerifyReport, verifyAgentRun } from "./agent/runReport.js";
import { registerPromptCommands } from "./cli-prompt-commands.js";
import { inspectNativeFirstUse, renderNativeFirstUseGuide, renderNativeGuideCommand, type NativeFirstUseOptions } from "./setup/nativeFirstUseGuide.js";
import type { ActionClass } from "./types.js";

import {
  approvalGateFor, collectOption, integerOption, paramsFor, renderNotification, routeFor,
  type AgentLoopCliIo, type RunOptions
} from "./cli-agent-options.js";
export type { AgentLoopCliIo, RunOptions } from "./cli-agent-options.js";

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
          "The packaged native runtime could not be loaded. Reinstall AMC from a complete package.\n" +
            "For a source checkout, install workspace dependencies and rebuild before running."
        )
      );
      io.fail();
      return null;
    }
    throw error;
  }
}

function selectedAgentOption(command: Command): string | undefined {
  return command.opts<{ agent?: string }>().agent ?? command.optsWithGlobals<{ agent?: string }>().agent;
}

export function registerAgentCommands(program: Command, io: AgentLoopCliIo = defaultIo): void {
  // The system-prompt group is registered from here rather than from cli.ts
  // because cli.ts sits at its line-ratchet floor, and because the assembled
  // prompt is the IDENTITY half of the same native-agent surface `agent-loop`
  // runs — the two answer halves of one question and belong together.
  registerPromptCommands(program, io);

  const group = program
    .command("agent-loop")
    .description("Guide, run, and verify native tasks with signed session evidence for the selected agent");

  group
    .command("guide")
    .option("--agent <id>", "agent identity; defaults to AMC_AGENT_ID, the current agent, then default")
    .description("Inspect local setup without writes or provider calls and show the next native task command")
    .option("--provider <id>", "choose openai (Chat Completions), openai-responses, anthropic, or stub (local demonstration)")
    .option("--model <model>", "your model ID; required for a real provider")
    .option("--base-url <origin>", "explicit HTTP(S) provider origin; no path or embedded credentials")
    .option("--credential <ref>", "credential reference name, never a key value")
    .option("--credentials-home <dir>", "same credential home as agent-loop run")
    .option("--credentials-file <path>", "same explicit credential file as agent-loop run")
    .option("--json", "Output local inspection status and structured next-action argv")
    .action(async (opts: Omit<NativeFirstUseOptions, "workspace" | "env" | "userEnvPath"> & { agent?: string; json?: boolean }, command: Command) => {
      const guide = await inspectNativeFirstUse({ ...opts, agentId: selectedAgentOption(command), workspace: process.cwd() });
      io.log(opts.json ? JSON.stringify(guide, null, 2) : renderNativeFirstUseGuide(guide));
      if (guide.status === "blocked") io.fail();
    });

  group
    .command("mcp-catalog")
    .description("Connect to an explicitly configured stdio or Streamable HTTP MCP server, report its catalog, and disconnect")
    .requiredOption("--config <path>", "operator-authored MCP JSON config; envRefs/headerRefs hold references, never literal credentials")
    .option("--credentials-home <dir>", "credential home used to resolve explicit server credential references")
    .option("--credentials-file <path>", "explicit credential file used to resolve server credential references")
    .option("--json", "Output the discovered catalog and exact generated allowlist names")
    .action(async (opts: { config: string; credentialsHome?: string; credentialsFile?: string; json?: boolean }) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.on("SIGINT", cancel);
      try {
        const { loadNativeMcpConfiguration, resolveNativeMcpServer } = await import("./setup/nativeMcpConfig.js");
        const { discoverNativeMcpCatalog, nativeMcpToolName } = await import("./mcp/nativeMcpClient.js");
        const loaded = loadNativeMcpConfiguration(opts.config);
        const server = await resolveNativeMcpServer(loaded.config, { ...opts, workspace: process.cwd() });
        const catalog = await discoverNativeMcpCatalog(server, process.cwd(), controller.signal);
        const receipt = {
          schemaVersion: 1, serverStarted: true, configSha256: loaded.sha256,
          ...catalog,
          allowlistNames: catalog.tools.map(tool => ({ remoteName: tool.name, amcToolName: nativeMcpToolName(catalog.serverId, tool.name) })),
          grantsCreated: false,
          next: "Review every tool schema. Pin digest as expectedCatalogDigest, add explicit name/actionClass grants, and separately review and sign matching amcToolName/actionClass allowlist entries. Run requires --tools workspace and --approve-tools; no policy was changed."
        };
        if (!opts.json) io.log("MCP catalog discovered; the configured server has been disposed. This command executed a local program and created no tool grants.");
        io.log(JSON.stringify(receipt, null, 2));
      } catch (error) {
        io.error(error instanceof NativeMcpConfigError ? error.message : "MCP discovery failed or was cancelled. Check the explicit config and credential references; no catalog or grant is accepted.");
        io.fail();
      } finally { process.removeListener("SIGINT", cancel); }
    });

  group
    .command("chat")
    .option("--agent <id>", "agent identity; defaults to AMC_AGENT_ID, the current agent, then default")
    .description("Interactive native tasks over the existing governed run/resume path for the selected agent")
    .option("--extension <manifest>", "load this signed native extension; repeat for multiple manifests", collectOption)
    .option("--extension-pin <sha256>", "exact reviewed digest for each extension in the same order", collectOption)
    .option("--preset <id>", "reviewed signed native composition; pinned for the chat")
    .option("--persona <text>", "explicit native persona override")
    .option("--delegate", "enable governed in-process child agents; requires workspace tools")
    .option("--max-delegation-depth <n>", "maximum native child depth")
    .option("--delegate-scope <classes>", "explicit comma-separated child action classes")
    .option("--provider <id>", "explicit provider; asks in a terminal when omitted")
    .option("--model <model>", "your model ID; asks for a real provider when omitted")
    .option("--base-url <origin>", "explicit HTTP(S) provider origin; retained for every turn and resume command")
    .option("--credential <ref>", "credential reference name, never a key value")
    .option("--credentials-home <dir>", "same credential home as agent-loop run")
    .option("--credentials-file <path>", "same explicit credential file as agent-loop run")
    .option("--mcp-config <path>", "reviewed MCP JSON; requires --tools workspace and --approve-tools")
    .option("--mcp-config-sha256 <digest>", "require these exact reviewed MCP config bytes")
    .option("--approve-tools <actionClass>", "require the signed approval gate before each tool call")
    .option("--approve-risk <tier>", "approval risk tier (default high)")
    .option("--tools <mode>", "none, echo, or explicitly enabled workspace tools; existing policy still applies")
    .option("--max-tokens <n>", "output-token limit per request (default 512)")
    .option("--max-steps <n>", "model steps per turn (default 8, or 2 for stub)")
    .option("--session <id>", "resume this unsealed session; each turn verifies before acquiring its writer")
    .option("--fork-from <id>", "create a child of this verified parent on the first task")
    .action(async (opts: import("./setup/nativeInteractiveSession.js").NativeChatOptions, command: Command) => {
      const { runNativeInteractiveSession } = await import("./setup/nativeInteractiveSession.js");
      await runNativeInteractiveSession({ ...opts, agentId: selectedAgentOption(command), workspace: process.cwd() }, io);
    });

  group
    .command("run")
    .option("--agent <id>", "agent identity; defaults to AMC_AGENT_ID, the current agent, then default")
    .description("Run one agent turn and report what the signed log recorded")
    .option("--extension <manifest>", "load this signed native extension; repeat for multiple manifests", collectOption)
    .option("--extension-pin <sha256>", "exact reviewed digest for each extension in the same order", collectOption)
    .option("--stream", "show provisional live text on stderr; final structured result remains on stdout")
    .argument("[prompt...]", "the prompt that opens the turn")
    .option("--provider <id>", `provider route to send on (default "${STUB_PROVIDER_ID}": local recording demonstration)`)
    .option("--model <model>", "model to address")
    .option("--base-url <url>", "provider origin, when it differs from the default")
    .option("--credential <ref>", "credential REFERENCE (never a value) the route authenticates with")
    .option("--credentials-home <dir>", "home directory the credentials store reads from")
    .option("--credentials-file <path>", "explicit credentials file, overriding the home layout")
    .option("--mcp-config <path>", "reviewed MCP JSON; requires --tools workspace and --approve-tools")
    .option("--mcp-config-sha256 <digest>", "refuse an MCP config changed from these exact reviewed bytes")
    .option("--max-tokens <n>", "provider max_tokens for each request")
    .option("--max-steps <n>", "how many model steps one turn may take")
    .option("--tools <mode>", 'tool seam: "workspace" (the governed built-ins), "echo", or "none"')
    .option("--tool-mode <mode>", '"native" (one call per step) or "code" (dispatch from a program)')
    .option("--session <id>", "resume this existing, unsealed session as its next writer (verified before dispatch)")
    .option("--fork-from <id>", "open a new session whose lineage names this parent's verified final row")
    .option("--keep-open", "leave the session unsealed at exit so a later process can --session it")
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
      "--preset <id>",
      "compose this run from a signed preset in .amc/agents.yaml. Explicit flags override it."
    )
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
    .option("--interactive-approvals", "send actual queued approval IDs to the native chat parent over dedicated Node IPC")
    .option(
      "--approval-exception <file>",
      "ADR-5 exception note (JSON) that auto-allows the classes it names until it expires"
    )
    .option("--json", "Output as JSON")
    .action(async (promptParts: string[], opts: RunOptions, command: Command) => {
      const agentId = resolveAgentId(process.cwd(), selectedAgentOption(command));
      if (opts.interactiveApprovals && (typeof process.send !== "function" || !process.connected)) {
        io.error("--interactive-approvals requires an AMC parent with a dedicated IPC channel. Use native chat or the ordinary approvals CLI."); io.fail(); return;
      }
      if (opts.interactiveApprovals && opts.approvalException !== undefined) {
        io.error("Interactive approvals require the signed approval engine; approval exceptions cannot be combined with this mode."); io.fail(); return;
      }
      // Resolved FIRST, so every flag default below can fall back to it. A
      // preset is signed policy: an unverifiable one composes nothing, for the
      // same reason an unverifiable schedule runs nothing.
      let preset: AgentPreset | undefined;
      if (opts.preset !== undefined) {
        const resolved = resolvePreset(process.cwd(), opts.preset);
        if (!resolved.ok) {
          io.error(chalk.red(resolved.reason));
          io.fail();
          return;
        }
        preset = resolved.preset;
        // Said out loud. A run whose model, tool mode or approval gate came from
        // a file the operator wrote last month should say so, or the behaviour
        // has no visible cause.
        (opts.json ? io.error : io.log)(chalk.dim(`composed from preset "${preset.id}": ${preset.description}`));
        // Apply the remaining policy fields before approval and delegation are
        // built. A signed preset must not merely advertise these settings.
        opts = { ...opts,
          approveTools: opts.approveTools ?? preset.approveTools,
          delegate: opts.delegate ?? preset.delegate?.enabled,
          delegateScope: opts.delegateScope ?? preset.delegate?.scope?.join(","),
          maxDelegationDepth: opts.maxDelegationDepth ?? (preset.delegate?.maxDepth === undefined ? undefined : String(preset.delegate.maxDepth)),
          delegateProvider: opts.delegateProvider ?? preset.delegate?.provider,
          delegateTimeout: opts.delegateTimeout ?? (preset.delegate?.timeoutMs === undefined ? undefined : String(preset.delegate.timeoutMs))
        };
      }

      let rawPrompt = promptParts.join(" ").trim();
      let extensionTurn: NativeExtensionTurn;
      try {
        const catalog = buildSkillCatalog(workspaceSkillRoots(process.cwd(), opts.credentialsHome));
        const extensions = loadNativeExtensions({ workspace: process.cwd(), manifestPaths: opts.extension,
          expectedDigests: opts.extensionPin, reservedCommands: [...catalog.skills, ...catalog.problems].map(skill => skill.name) });
        extensionTurn = extensions.prepareTurn();
        rawPrompt = extensions.expandCommand(rawPrompt)?.prompt ?? rawPrompt;
      } catch (error) {
        io.error(error instanceof Error ? error.message : "Native extension admission refused."); io.fail(); return;
      }
      // `/name` is resolved BEFORE the turn is composed, because
      // `runComposedTurn` assembles the system prompt once at the top and
      // records it as a signed `system/prompt` row -- a skill discovered after
      // that would not be in the prompt the row commits to.
      const skillTurn = prepareSkillTurn({
        workspace: process.cwd(),
        prompt: rawPrompt,
        ...(opts.credentialsHome === undefined ? {} : { amcHome: opts.credentialsHome })
      });
      if (!skillTurn.ok) {
        io.error(chalk.red(skillTurn.reason));
        io.fail();
        return;
      }
      const prompt = skillTurn.prompt;
      if (prompt.length === 0) {
        io.error(chalk.red("a prompt is required: amc agent-loop run \"...\""));
        io.fail();
        return;
      }
      // PRECEDENCE, uniformly: the flag the operator typed now, then the preset
      // they wrote earlier, then the built-in default. Both are the operator --
      // one wrote a signed file, one typed a command -- so this is recency, not
      // a trust ranking, and the preset line above says which run was composed
      // from what.
      const providerId = opts.provider ?? preset?.providerId ?? STUB_PROVIDER_ID;
      const maxTokens = integerOption(io, "--max-tokens", opts.maxTokens, preset?.maxTokens ?? 1024);
      const maxSteps = integerOption(io, "--max-steps", opts.maxSteps, preset?.maxSteps ?? 8);
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
      const route = routeFor(io, providerId, opts, opts.model ?? preset?.model);
      if (route === null) return;
      if (opts.mcpConfigSha256 !== undefined && opts.mcpConfig === undefined) {
        io.error("--mcp-config-sha256 requires --mcp-config."); io.fail(); return;
      }
      if (opts.mcpConfig !== undefined && opts.approvalException !== undefined) {
        io.error("MCP tools require the actual signed approval gate; approval exceptions are not accepted."); io.fail(); return;
      }
      const gate = approvalGateFor(io, opts);
      if (gate === null) return;
      if (opts.interactiveApprovals && gate === undefined) {
        io.error("--interactive-approvals requires --approve-tools to raise actual signed requests."); io.fail(); return;
      }
      let mcpConfig: LoadedNativeMcpConfiguration | null = null;
      let mcpReview: { expectedCatalogDigest: string; grants: readonly NativeMcpGrant[] } | null = null;
      if (opts.mcpConfig !== undefined) {
        if (opts.tools !== "workspace" || gate === undefined) {
          io.error("--mcp-config requires explicit --tools workspace and --approve-tools with matching grant action classes."); io.fail(); return;
        }
        try {
          const { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants } = await import("./setup/nativeMcpConfig.js");
          mcpConfig = loadNativeMcpConfiguration(opts.mcpConfig, opts.mcpConfigSha256);
          mcpReview = requireReviewedNativeMcpGrants(mcpConfig, process.cwd(), gate.actionClass);
        } catch (error) {
          io.error(error instanceof NativeMcpConfigError ? error.message : "MCP preflight refused. Review the config digest, catalog pin, explicit grants, matching signed allowlist and approval class; no server was started.");
          io.fail(); return;
        }
      }
      if (opts.session !== undefined && mcpConfig !== null) {
        // Mounting can execute a process or contact a server. Check the signed
        // identity first; resumeSession repeats admission before taking ownership.
        const { assertSessionResumeAgent } = await import("./session/sessionResume.js");
        assertSessionResumeAgent({ workspace: process.cwd(), sessionId: opts.session, agentId });
      }
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
      const toolMode = opts.tools ?? preset?.tools ?? (providerId === STUB_PROVIDER_ID ? "echo" : "none");
      const wantsDelegation = opts.delegate === true;
      if (!wantsDelegation && opts.delegateProvider !== undefined) {
        // A flag configuring a capability nobody asked for does nothing, and the
        // operator has no way to tell it did nothing.
        io.error(chalk.red("--delegate-provider needs --delegate; nothing is delegating without it"));
        io.fail();
        return;
      }
      const dispatchMode = (opts.toolMode ?? preset?.toolMode) === "code" ? "code" as const : "native" as const;
      // Resume names its existing session; a fresh run supplies a new ID. Fork
      // selects its own ID inside composition, which binds the actual writer
      // to the prebuilt toolset before dispatch.
      const turnSessionId = opts.session ?? randomUUID();
      const claimant = {
        pid: process.pid,
        hostId: hostname(),
        bootId: process.env.AMC_BOOT_ID ?? randomUUID(),
        startedAt: Math.round(Date.now() - process.uptime() * 1000)
      };
      let toolSeam: AgentToolSeam | null = null;
      let workspaceToolset: AgentToolset | null = null;
      const progress = opts.json ? io.error : io.log;
      let bindToolSession: ((session: ComposedToolSession) => void) | undefined;
      let grantDelegation: ((capability: SubagentCapability) => void) | null = null;
      let foreignRunner: SubagentRunner | null = null;
      let foreignRunnerDescription = "";
      if (toolMode === "workspace") {
        let boundSession: ComposedToolSession | null = null;
        const actualSession = (): ComposedToolSession => {
          if (boundSession === null) throw new Error("workspace tools have no native session writer");
          return boundSession;
        };
        const toolset = workspaceToolset = agentToolset({
          workspace: process.cwd(),
          agentId,
          // Fork chooses a different ID; resume chooses the existing writer.
          get sessionId() { return actualSession().sessionId; },
          recorder: { recordProjectedEvidence: (row) => actualSession().recordProjectedEvidence(row) },
          ...(dispatchMode === "code" ? { mode: dispatchMode } : {})
        });
        bindToolSession = (session) => { boundSession = session; };
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
            toolset.close();
            io.fail();
            return;
          }
        }
        if (!toolset.readiness.ready) {
          // Said once, up front, naming the command. Without this the operator
          // sees every tool denied and reads it as broken tools rather than as
          // unconfigured policy.
          io.error(chalk.yellow("the workspace toolset is not ready:"));
          for (const blocker of toolset.readiness.blockers) io.error(chalk.yellow(`  - ${blocker}`));
          toolset.close();
          io.fail();
          return;
        }
        progress(chalk.dim(
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
              agentId,
              ...(delegateTimeout > 0 ? { timeoutMs: delegateTimeout } : {})
            });
            if (!resolved.ok) {
              io.error(chalk.red(resolved.reason));
              toolset.close();
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
          progress(chalk.dim(
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
          progress(chalk.dim(
            `delegation is offered, chains bounded at depth ${maxDelegationDepth}`
            + (foreignRunner === null ? "; native children inherit approval, cancellation, limits and narrowed scopes" : "")
          ));
          // Named either way. The unscoped case is the one an operator is most
          // likely not to have thought about, so it gets said out loud rather
          // than being the silent default.
          progress(chalk.dim(
            delegateScope === undefined
              ? "delegates have no additional action-class scope; native children use built-in workspace tools under the root's signed policy"
              : `delegates are scoped to: ${delegateScope.join(", ")}`
          ));
        }
        // The run finally block releases mounts before this recorder handle.
      } else if (toolMode === "echo") {
        toolSeam = echoToolSeam();
      }
      const timers: NodeJS.Timeout[] = [];
      let onSigint: (() => void) | null = null;
      let mcpMount: MountedNativeMcpServer | null = null;
      const mcpAbort = new AbortController();
      const cancelMcp = () => mcpAbort.abort();
      if (mcpConfig !== null) process.on("SIGINT", cancelMcp);

      try {
        if (mcpConfig !== null && mcpReview !== null && workspaceToolset !== null) {
          const { resolveNativeMcpServer } = await import("./setup/nativeMcpConfig.js");
          const { mountNativeMcpServer } = await import("./mcp/nativeMcpClient.js");
          const server = await resolveNativeMcpServer(mcpConfig.config, { ...opts, workspace: process.cwd() });
          mcpMount = await mountNativeMcpServer({ server, workspace: process.cwd(), agentId,
            toolset: workspaceToolset, ...mcpReview, signal: mcpAbort.signal });
          progress(`Mounted reviewed MCP tools for this run: ${mcpMount.toolNames.join(", ")}. Signed allowlist, approval gate and budgets remain in force.`);
        }
        let previewRequest: string | null = null;
        let priorTurnEndings = 0;
        const outcome = await runner.runComposedTurn({
          sessionId: turnSessionId,
          ...(opts.session === undefined ? {} : { resume: { claimant } }),
          ...(opts.forkFrom === undefined ? {} : { forkFrom: { parentSessionId: opts.forkFrom, claimant } }),
          ...(opts.keepOpen ? { keepOpen: true } : {}),
          workspace: process.cwd(),
          agentId,
          ...(opts.stream ? { onLiveText: (event: import("./llm/adapter/liveTextPreview.js").LiveTextPreviewEvent) => {
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
          } } : {}),
          // No pinned `systemPrompt`: the prompt is ASSEMBLED, which is what
          // gives the run its identity and pulls the workspace's own AGENTS.md /
          // CLAUDE.md in as runtime context. A hardcoded string here — what this
          // command sent before P3.3 — was an agent with no idea where it was.
          promptProfile: {
            ...((opts.persona ?? preset?.persona) === undefined
              ? {}
              : { persona: (opts.persona ?? preset?.persona) as string }),
            // EXTRA, not `contextPlugins`. That option REPLACES the defaults,
            // and the default is the AGENTS.md / CLAUDE.md loader -- so passing
            // skills through it would drop the workspace's own instructions
            // every time a skill loaded, silently.
            //
            // Contributed as plugins so `ContextPluginHost` stamps them
            // `literal` exactly as it does for AGENTS.md: one place decides that
            // workspace text is data, not two that could drift.
            ...(skillTurn.contextPlugins.length + extensionTurn.contextPlugins.length === 0
              ? {}
              : { extraContextPlugins: [...skillTurn.contextPlugins, ...extensionTurn.contextPlugins] })
          },
          ...(gate === undefined
            ? {}
            : {
                approvalGate: {
                  actionClass: gate.actionClass,
                  riskTier: gate.riskTier,
                  answerers: gate.answerers,
                  onRaised: (event) => {
                    if (opts.interactiveApprovals) {
                      if (typeof process.send !== "function" || !process.connected) {
                        io.error("The native approval channel disconnected; cancelling this turn."); process.emit("SIGINT"); return;
                      }
                      try {
                        process.send({ type: "amc/native-approval-raised", v: 1, agentId,
                          approvalId: event.approvalId, approvalRequestId: event.approvalRequestId }, error => {
                          if (error) { io.error("Could not deliver the actual approval request to native chat; cancelling this turn."); process.emit("SIGINT"); }
                        });
                      } catch { io.error("Native approval IPC failed; cancelling this turn."); process.emit("SIGINT"); }
                      return;
                    }
                    // The operator cannot answer a question whose id they do not
                    // have, and it only exists once the engine has minted it.
                    io.error(
                      chalk.yellow(
                        `awaiting approval ${event.approvalRequestId} — ` +
                          `answer it with: amc approvals approve --agent ${agentId} --mode execute --reason "review reason" --username <reviewer> --roles <reviewer-roles> ${event.approvalRequestId}`
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
          ...(bindToolSession === undefined ? {} : { bindToolSession }),
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
          notify: opts.json && !opts.stream
            ? undefined
            : (notification: LoopNotification) => {
                const line = renderNotification(notification);
                if (line !== null) (opts.json ? io.error : io.log)(line);
              },
          onReady: (handle) => {
            // A resumed session may contain an earlier failed turn. This CLI
            // invocation reports only its newly recorded ending as its exit
            // outcome; the driver's idle state means it can accept more work.
            priorTurnEndings = readAgentRunSummary(process.cwd(), handle.sessionId, "idle").endings.length;
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
        if (!opts.json) {
          io.log("Verify the recorded evidence (this does not evaluate answer quality):\n  " +
            renderNativeGuideCommand({ cwd: process.cwd(), argv: ["amc", "agent-loop", "verify", summary.sessionId] }));
        }
        const ending = summary.endings.length > priorTurnEndings ? summary.endings.at(-1) : undefined;
        if (summary.driverStatus === "failed" || ending?.reason === "error") io.fail();
      } finally {
        for (const timer of timers) clearTimeout(timer);
        if (onSigint !== null) process.removeListener("SIGINT", onSigint);
        try { await mcpMount?.close(); }
        catch { io.error("MCP cleanup failed; this mount must not be reused."); io.fail(); }
        finally {
          process.removeListener("SIGINT", cancelMcp);
          workspaceToolset?.close();
        }
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

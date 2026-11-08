import { closeSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { startAcpStdio } from "./acpStdioMain.js";
import { serveAcpStartupRefusal } from "./acpStartupRefusal.js";
import { NATIVE_TASK_INITIATOR_ENV, NATIVE_TASK_LEASE_FD, NATIVE_TASK_LEASE_FD_ENV, NATIVE_TASK_SYSTEM_PROMPT_ENV } from "./acpRuntimeContracts.js";
import { compactionFromFlags } from "../agent/compaction/promptPressure.js";
import type { RunOptions } from "../cli-agent-options.js";

/**
 * `amc acp` (plan P7.1a).
 *
 * Speaks the Agent Client Protocol on stdio, which is how an editor launches an
 * agent: the client spawns this process and talks JSON-RPC down the pipe.
 *
 * NOTHING IS PRINTED ON SUCCESS. Not a banner, not a version line. Stdout is the
 * protocol stream and the first bytes a client reads must be a frame -- this is
 * the opposite of every other command in this CLI, and the reason `--json` is
 * absent rather than being a no-op.
 *
 * THE PROCESS STAYS UP UNTIL THE CLIENT CLOSES ITS SIDE. There is no idle
 * timeout: an editor may hold a session open for hours with nothing to say.
 */
/**
 * The lease a spawning composer handed this process (P1-67): read once from the inherited pipe the environment names,
 * then the pipe is closed and the name unset, so no tool, check or MCP child inherits either. None without the name;
 * a named pipe that cannot be read throws (the caller answers it as a startup refusal).
 */
export function takeNativeTaskLease(): string | undefined {
  const fd = process.env[NATIVE_TASK_LEASE_FD_ENV];
  delete process.env[NATIVE_TASK_LEASE_FD_ENV];
  if (fd === undefined) return undefined;
  if (fd !== String(NATIVE_TASK_LEASE_FD)) throw new Error(`${NATIVE_TASK_LEASE_FD_ENV} must name fd ${NATIVE_TASK_LEASE_FD}`);
  try {
    return readFileSync(NATIVE_TASK_LEASE_FD, "utf8") || undefined;
  } finally {
    try { closeSync(NATIVE_TASK_LEASE_FD); } catch { /* already closed: the read reported why */ }
  }
}

export function registerAcpCommands(program: Command): void {
  program
    .command("acp")
    .description("Serve the Agent Client Protocol on stdio (for editors; prints nothing but frames)")
    .option("--provider <id>", "Provider route to serve", "stub")
    .option("--model <model>", "Model, required for a real provider")
    .option("--base-url <url>", "Override the provider base URL")
    .option("--credential <ref>", "Credential reference to resolve per request")
    .option("--credentials-home <dir>", "Credential home fixed for this ACP process")
    .option("--credentials-file <path>", "Explicit credential file fixed for this ACP process")
    .option("--credentials-mode <mode>", "layered or operator-only (exclude project/user dotenv)", "layered")
    .option("--tools <mode>", "none or explicitly enabled workspace tools", "none")
    .option("--unsafe-unconfined-shell", "macOS without Seatbelt only: offer the native shell UNCONFINED, with your full user rights; ignored where Seatbelt or Bubblewrap confines it, refused on Windows")
    .option("--ask-user", "Send ask_user to the client as _amc/ask_user and sign its answer host-side; requires workspace tools")
    .option("--web-search-searxng <origin>", "Opt-in web_search provider: a SearXNG JSON origin, also granted under web_search in the signed tools policy")
    .option("--expected-tools-digest <sha256>", "Refuse any workspace tool call after its signed policy digest changes")
    .option("--validation-config <path>", "Operator JSON containing named public checks")
    .option("--validation-config-sha256 <digest>", "Pin exact reviewed validation configuration bytes")
    .option("--validation-repair <json>", "Explicit bounded repair policy for selected public checks, including allowed edit paths")
    .option("--validate <id>", "Run this public check after each completed turn; repeat to select more", (id: string, previous: string[] = []) => [...previous, id])
    .option("--approve-tools <actionClass>", "Require the existing signed approval gate for tool calls")
    .option("--approve-risk <tier>", "Signed approval risk tier; requires --approve-tools")
    .option("--mcp-config <path>", "Reviewed native MCP config; repeat for more servers; requires workspace tools and signed approvals", (path: string, previous: string[] = []) => [...previous, path])
    .option("--mcp-config-sha256 <digest>", "Pin exact reviewed MCP configuration bytes; one per --mcp-config in the same order", (digest: string, previous: string[] = []) => [...previous, digest])
    .option("--max-tokens <n>", "Positive output-token bound per model request", "512")
    .option("--thinking <mode>", "enabled or disabled: DeepSeek, Anthropic (tools-free, with --thinking-budget), Gemini and Ollama")
    .option("--reasoning-effort <effort>", "Sent verbatim: DeepSeek low|high|max, Gemini MINIMAL|LOW|MEDIUM|HIGH, Ollama low|medium|high|max")
    .option("--thinking-budget <tokens>", "Anthropic budget_tokens (>= 1024, below --max-tokens) or Gemini thinkingBudget")
    .option("--cache-retention <mode>", "short or long prompt-cache retention on anthropic, openai and openai-responses routes")
    .option("--max-retries <n>", "Model-request retries after the first attempt (default 5; 0 gives up on the first failure)")
    .option("--retry-max-delay <ms>", "Local backoff ceiling in milliseconds (default 10000)")
    .option("--max-steps <n>", "Positive model-step bound per turn (default 8, stub 2)")
    .option("--context-window <tokens>", "Override the reviewed model context window for automatic compaction")
    .option("--compact-threshold <fraction>", "Use ratio trigger instead of the catalog token reserve (0.5-0.95; requires --context-window)")
    .option("--no-auto-summary", "Prune old tool output only; never run a model-written summary step")
    .option("--no-auto-compact", "Turn automatic compaction off (on by default for a reviewed model context window)")
    .option("--agent-id <id>", "Agent identity recorded in the ledger", "default")
    .option("--system-prompt <text>", "System prompt for each session", "You are a careful assistant.")
    .action((opts: Pick<RunOptions, "thinking" | "reasoningEffort" | "thinkingBudget" | "cacheRetention" | "maxRetries" | "retryMaxDelay" | "maxSteps" | "contextWindow" | "compactThreshold" | "autoSummary" | "autoCompact"> & {
      provider: string;
      model?: string;
      baseUrl?: string;
      credential?: string;
      credentialsHome?: string;
      credentialsFile?: string;
      credentialsMode: string;
      tools: string;
      unsafeUnconfinedShell?: boolean;
      askUser?: boolean;
      webSearchSearxng?: string;
      expectedToolsDigest?: string;
      validationConfig?: string;
      validationConfigSha256?: string;
      validationRepair?: string;
      validate?: string[];
      approveTools?: string;
      approveRisk?: string;
      mcpConfig?: string[];
      mcpConfigSha256?: string[];
      maxTokens: string;
      agentId: string;
      systemPrompt: string;
    }) => {
      let handle;
      const initiator = process.env[NATIVE_TASK_INITIATOR_ENV];
      delete process.env[NATIVE_TASK_INITIATOR_ENV];
      // P2-37: the agent's verified prompt pack and A4 context plugin, as Studio composed them; unset before anything runs.
      const composedPrompt = process.env[NATIVE_TASK_SYSTEM_PROMPT_ENV];
      delete process.env[NATIVE_TASK_SYSTEM_PROMPT_ENV];
      try {
        // P1-67: Studio hands a native task's lease to this process alone, over a pipe (never the environment); the
        // toolset also scrubs it from tool output.
        const leaseToken = takeNativeTaskLease();
        const compaction = compactionFromFlags(opts);
        handle = startAcpStdio({
          ...(leaseToken ? { leaseToken } : {}),
          ...(initiator ? { initiator } : {}),
          ...(compaction === undefined ? {} : { compaction }),
          workspace: process.cwd(),
          agentId: opts.agentId,
          providerId: opts.provider,
          systemPrompt: composedPrompt ? composedPrompt : opts.systemPrompt,
          tools: opts.tools as "none" | "workspace",
          ...(opts.unsafeUnconfinedShell === true ? { unconfinedShell: true } : {}),
          ...(opts.askUser === true ? { askUser: true } : {}),
          ...(opts.webSearchSearxng === undefined ? {} : { webSearchSearxng: opts.webSearchSearxng }),
          ...(opts.expectedToolsDigest === undefined ? {} : { expectedToolsDigest: opts.expectedToolsDigest }),
          ...(opts.validationConfig === undefined ? {} : { validationConfig: opts.validationConfig }),
          ...(opts.validationConfigSha256 === undefined ? {} : { validationConfigSha256: opts.validationConfigSha256 }),
          ...(opts.validationRepair === undefined ? {} : { validationRepair: opts.validationRepair }),
          ...(opts.validate === undefined ? {} : { validate: opts.validate }),
          maxTokens: Number(opts.maxTokens),
          ...(opts.thinking === undefined ? {} : { thinking: opts.thinking }),
          ...(opts.reasoningEffort === undefined ? {} : { reasoningEffort: opts.reasoningEffort }),
          ...(opts.thinkingBudget === undefined ? {} : { thinkingBudget: opts.thinkingBudget }),
          ...(opts.cacheRetention === undefined ? {} : { cacheRetention: opts.cacheRetention }),
          ...(opts.maxRetries === undefined ? {} : { maxRetries: opts.maxRetries }),
          ...(opts.retryMaxDelay === undefined ? {} : { retryMaxDelay: opts.retryMaxDelay }),
          ...(opts.maxSteps === undefined ? {} : { maxSteps: Number(opts.maxSteps) }),
          ...(opts.credentialsHome === undefined ? {} : { credentialsHome: opts.credentialsHome }),
          ...(opts.credentialsFile === undefined ? {} : { credentialsFile: opts.credentialsFile }),
          credentialsMode: opts.credentialsMode as "layered" | "operator-only",
          ...(opts.approveTools === undefined ? {} : { approveTools: opts.approveTools }),
          ...(opts.approveRisk === undefined ? {} : { approveRisk: opts.approveRisk }),
          ...(opts.mcpConfig === undefined ? {} : { mcpConfig: opts.mcpConfig }),
          ...(opts.mcpConfigSha256 === undefined ? {} : { mcpConfigSha256: opts.mcpConfigSha256 }),
          ...(opts.model === undefined ? {} : { model: opts.model }),
          ...(opts.baseUrl === undefined ? {} : { baseUrl: opts.baseUrl }),
          ...(opts.credential === undefined ? {} : { credential: opts.credential })
        });
      } catch (error) {
        // To stderr and a non-zero exit. Never an unsolicited frame: the client would
        // read it as a protocol message. Only a correlated reply carries the refusal.
        process.stderr.write(`amc acp: ${error instanceof Error ? error.message : String(error)}\n`);
        // A spawning client (the SDKs) still gets the coded refusal as the reply to its first request.
        void serveAcpStartupRefusal(error, { stdin: process.stdin, stdout: process.stdout }).finally(() => process.exit(2));
        return;
      }
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => {
          void handle.close().then(() => process.exit(0), () => {
            process.stderr.write("amc acp: shutdown could not seal every owned session\n");
            process.exit(1);
          });
        });
      }
    });
}

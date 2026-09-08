import { credentialRef } from "../credentials/credentialRef.js";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { AdapterRegistry, type LlmRouteConfig } from "../llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "../llm/providers/openaiAdapter.js";
import { stubProviderRoute, stubProviderTransport, STUB_PROVIDER_ID } from "../agent/stubProvider.js";
import type { AgentSessionInit } from "../agent/agentSession.js";
import { openaiResponsesAdapter } from "../llm/providers/openaiResponsesAdapter.js";
import { isActionClass } from "../governor/actionCatalog.js";
import { checkToolsetReadiness } from "../agent/agentToolset.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants } from "../setup/nativeMcpConfig.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { sha256Hex } from "../utils/hash.js";
import type { ToolApprovalGateOptions } from "../agent/approvalGate.js";
import { prepareAcpNativeSession } from "./acpNativeSession.js";
import { amcVersion } from "../version.js";
import { createAcpAgent, type AcpAgent } from "./acpAgentServer.js";

/**
 * Running the ACP agent on stdio (plan P7.1a).
 *
 * STDOUT IS THE PROTOCOL. Nothing may write to it but frames -- one stray
 * `console.log` corrupts the stream for the client, and a JSON-RPC peer has no
 * way to resynchronise. Every diagnostic goes to stderr, which is also why the
 * ACP SDK's own reader was rejected in favour of AMC's framer: it reports parse
 * failures with `console.error`, which on a stdio transport writes into the
 * stream the peer is reading.
 *
 * STDIN IS NEVER PAUSED. `../wire/wireListener.ts` pauses its socket on a full
 * write buffer, which is right there and wrong here: the one message that must
 * always get through is `session/cancel`, and it arrives precisely when a prompt
 * is producing output. Pausing the read side to relieve the write side would
 * make a busy turn the hardest one to stop.
 *
 * THERE IS NO IDLE TIMEOUT. An editor may leave a session open for hours with
 * nothing to say. Closing it because it went quiet would discard a conversation
 * the user still has on screen.
 *
 * KERNEL-FREE COMPOSITION. The routes, credentials and runtime are assembled
 * here rather than through `src/kernel/services/llmServices.ts`, which does the
 * same three lines but imports `@amc/cordis` -- a workspace package absent from
 * the published tarball. An editor spawning `amc acp` from an installed package
 * must not touch the kernel, so this composes the same kernel-free pieces
 * directly.
 */

/**
 * The three stdin methods this file uses.
 *
 * Declared structurally because `process.stdin` and `NodeJS.ReadableStream`
 * have overload sets TypeScript cannot union, and because naming the surface
 * actually used keeps a test free to pass any emitter rather than a real tty.
 */
export interface AcpInputStream {
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  once(event: "end", listener: () => void): unknown;
  off(event: "data", listener: (chunk: Buffer) => void): unknown;
  off(event: "end", listener: () => void): unknown;
}

export interface AcpStdioInit {
  readonly workspace: string;
  readonly agentId: string;
  readonly providerId: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly credential?: string;
  readonly systemPrompt: string;
  readonly tools?: "none" | "workspace";
  readonly expectedToolsDigest?: string;
  readonly approveTools?: string;
  readonly approveRisk?: string;
  readonly mcpConfig?: string;
  readonly mcpConfigSha256?: string;
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
  readonly credentialsMode?: "layered" | "operator-only";
  readonly maxTokens?: number;
  readonly maxSteps?: number;
  /** Defaults to the real streams; injected by tests. */
  readonly stdin?: AcpInputStream;
  readonly stdout?: { write(chunk: Buffer): boolean };
  readonly stderr?: { write(chunk: string): boolean };
}

export interface AcpStdioHandle {
  readonly agent: AcpAgent;
  close(): Promise<void>;
}

const DEFAULT_BASE_URLS: Readonly<Record<string, string>> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  "openai-responses": "https://api.openai.com"
};

const DEFAULT_CREDENTIAL_REFS: Readonly<Record<string, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-responses": "OPENAI_API_KEY"
};

/**
 * The route this agent serves, or an error naming what is missing.
 *
 * Decided ONCE at startup rather than per session. A client cannot choose a
 * provider or a model -- there is no ACP capability for it in this slice, and
 * letting `session/new` pick would mean a peer selecting which credentials this
 * process spends.
 */
export function acpRouteFor(init: AcpStdioInit): LlmRouteConfig | { readonly error: string } {
  if (init.providerId === STUB_PROVIDER_ID) return stubProviderRoute();

  const adapter = init.providerId === "openai"
    ? openaiAdapter
    : init.providerId === "openai-responses" ? openaiResponsesAdapter
      : init.providerId === "anthropic" ? anthropicAdapter : null;
  if (adapter === null) {
    return {
      error: `unknown provider ${JSON.stringify(init.providerId)}; `
        + `this surface serves "${STUB_PROVIDER_ID}", "anthropic", "openai" and "openai-responses"`
    };
  }
  if (init.model === undefined || init.model.length === 0) {
    return { error: `--model is required for provider ${init.providerId}` };
  }
  const baseUrl = init.baseUrl ?? DEFAULT_BASE_URLS[init.providerId];
  if (baseUrl === undefined) return { error: `--base-url is required for provider ${init.providerId}` };

  return {
    providerId: init.providerId,
    adapter,
    baseUrl,
    // A REFERENCE, never a value. The credentials seam resolves it per request
    // and this module never sees what it resolves to.
    credentialRef: credentialRef(
      init.credential ?? DEFAULT_CREDENTIAL_REFS[init.providerId] ?? "AMC_LLM_API_KEY"
    ),
    models: [init.model]
  };
}

export function startAcpStdio(init: AcpStdioInit): AcpStdioHandle {
  if (init.credentialsMode !== undefined && init.credentialsMode !== "layered" && init.credentialsMode !== "operator-only") throw new Error("ACP credentials mode must be layered or operator-only.");
  const route = acpRouteFor(init);
  if ("error" in route) throw new Error(route.error);
  const tools = init.tools ?? "none";
  if (tools !== "none" && tools !== "workspace") throw new Error("ACP --tools must be none or workspace.");
  if (init.expectedToolsDigest !== undefined && (tools !== "workspace" || !/^[a-f0-9]{64}$/.test(init.expectedToolsDigest))) throw new Error("A tool policy pin requires workspace tools and an exact SHA-256 digest.");
  const maxTokens = init.maxTokens ?? 512;
  const maxSteps = init.maxSteps ?? (init.providerId === STUB_PROVIDER_ID ? 2 : 8);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000_000 || !Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 1024) throw new Error("ACP token/step limits are outside the supported positive integer bounds.");
  const actionClass = init.approveTools?.trim().toUpperCase();
  const riskTier = (init.approveRisk ?? "high").trim().toLowerCase();
  if ((actionClass !== undefined && !isActionClass(actionClass)) || !["low", "medium", "high", "critical"].includes(riskTier) || (init.approveRisk !== undefined && actionClass === undefined)) throw new Error("ACP approval settings require a valid action class and risk tier.");
  if (actionClass !== undefined && tools !== "workspace") throw new Error("ACP tool approvals require explicit --tools workspace.");
  const approval: ToolApprovalGateOptions | undefined = actionClass === undefined ? undefined : {
    actionClass: actionClass as ToolApprovalGateOptions["actionClass"], riskTier: riskTier as ToolApprovalGateOptions["riskTier"] };
  if (init.mcpConfigSha256 !== undefined && init.mcpConfig === undefined) throw new Error("ACP MCP digest pin requires an explicit config path.");
  const mcp = init.mcpConfig === undefined ? undefined : loadNativeMcpConfiguration(init.mcpConfig, init.mcpConfigSha256);
  if (mcp && (tools !== "workspace" || !approval)) throw new Error("ACP MCP requires --tools workspace and --approve-tools.");
  const mcpReview = mcp && approval ? requireReviewedNativeMcpGrants(mcp, init.workspace, approval.actionClass) : undefined;
  if (tools === "workspace") {
    const snapshot = loadVerifiedToolsConfigSnapshot(init.workspace);
    const additionalCapabilities = mcpReview?.capabilities ?? [];
    const readiness = checkToolsetReadiness(init.workspace, { snapshot, additionalCapabilities });
    if (!readiness.ready) throw new Error("ACP workspace tools require a supported signed tool subset and the existing firewall policy; run the native guide and configure them explicitly.");
    if (init.expectedToolsDigest !== undefined && snapshot.digestSha256 !== init.expectedToolsDigest) throw new Error("The signed workspace tool policy changed before native startup.");
  }

  const stdin: AcpInputStream = init.stdin ?? process.stdin;
  const stdout = init.stdout ?? process.stdout;
  const stderr = init.stderr ?? process.stderr;

  // One registry and one credentials service for the process. A session gets its
  // own runtime over them, because `LlmRuntime` captures its session at
  // construction -- sharing one would write every session's request rows into
  // whichever session built it.
  const registry = new AdapterRegistry();
  registry.register(route);
  const credentials = new LocalCredentialsService({ projectDir: init.workspace, watch: false,
    includeDotenv: init.credentialsMode !== "operator-only",
    ...(init.credentialsHome === undefined ? {} : { homeDir: init.credentialsHome }),
    ...(init.credentialsFile === undefined ? {} : { path: init.credentialsFile }) });

  // The stub route answers in-process and has no server behind its base URL, so
  // it needs its own transport. Without one the default fetch transport tries to
  // reach a fake host, every request fails, and a turn "succeeds" having said
  // nothing -- which is how this was first shipped and what an end-to-end test
  // caught: the conversation completed and the agent produced no text at all.
  const transport = route.providerId === STUB_PROVIDER_ID ? stubProviderTransport({}) : undefined;

  const sessionOptions = (params: { sessionId: string; workspace: string; agentId: string }): AgentSessionInit & { sessionId: string } =>
    ({
      workspace: params.workspace,
      sessionId: params.sessionId,
      agentId: params.agentId,
      makeLlm: (session) => new LlmRuntime({
        session,
        credentials,
        registry,
        ...(transport === undefined ? {} : { transport })
      }),
      route: {
        providerId: route.providerId,
        model: route.models?.[0] ?? "",
        params: route.providerId === "openai-responses" ? { max_output_tokens: maxTokens }
          : route.providerId === "openai" ? { max_tokens: maxTokens, stream: true, stream_options: { include_usage: true } }
            : { max_tokens: maxTokens, stream: true }
      },
      systemPrompt: init.systemPrompt,
      harnessVersion: amcVersion,
      compositionDigest: sha256Hex(JSON.stringify({ surface: "acp-native", provider: route.providerId, model: route.models?.[0], tools, maxTokens, maxSteps, approval, mcp: mcp?.sha256 ?? null,
        ...(init.expectedToolsDigest === undefined ? {} : { expectedToolsDigest: init.expectedToolsDigest }) })),
      policyDigest: sha256Hex(JSON.stringify({ tools, signedTools: tools === "workspace" ? loadVerifiedToolsConfigSnapshot(params.workspace).digestSha256 : null, approval, mcp: mcp?.sha256 ?? null,
        ...(init.expectedToolsDigest === undefined ? {} : { expectedToolsDigest: init.expectedToolsDigest }) })),
      tools, maxSteps, ...(init.expectedToolsDigest === undefined ? {} : { expectedToolsDigest: init.expectedToolsDigest })
    });

  const claimant = { pid: process.pid, hostId: hostname(), bootId: randomUUID(), startedAt: Date.now() };

  const agent = createAcpAgent({
    workspace: init.workspace,
    agentId: init.agentId,
    nativeExecution: { tools, signedApprovalGate: approval !== undefined, reviewedMcpConfigured: mcp !== undefined },
    write: (frame) => { stdout.write(frame); },
    sessionFactory: params => prepareAcpNativeSession({ session: sessionOptions(params), signal: params.signal,
      ...(approval ? { approval } : {}), ...(mcp ? { mcp } : {}),
      ...(init.credentialsHome === undefined ? {} : { credentialsHome: init.credentialsHome }),
      ...(init.credentialsFile === undefined ? {} : { credentialsFile: init.credentialsFile }),
      onApprovalRaised: event => { stderr.write(`amc acp: signed approval pending: ${event.approvalRequestId}\n`); } }),
    resumeSessionFactory: params => prepareAcpNativeSession({ session: sessionOptions(params), claimant, signal: params.signal,
      ...(approval ? { approval } : {}), ...(mcp ? { mcp } : {}),
      ...(init.credentialsHome === undefined ? {} : { credentialsHome: init.credentialsHome }),
      ...(init.credentialsFile === undefined ? {} : { credentialsFile: init.credentialsFile }),
      onApprovalRaised: event => { stderr.write(`amc acp: signed approval pending: ${event.approvalRequestId}\n`); } }),
    onUnusable: () => { void close().catch(reportShutdownFailure); },
    // stderr, never stdout. See the module note.
    log: (message) => { stderr.write(`amc acp: ${message}\n`); }
  });

  const onData = (chunk: Buffer): void => agent.connection.ingest(chunk);
  stdin.on("data", onData);
  // A client that closes its side has ended the conversation; there is nothing
  // further to read and nothing more worth saying.
  const reportShutdownFailure = (): void => {
    stderr.write("amc acp: shutdown could not cleanly settle every owned session\n");
    process.exitCode = 1;
  };
  const onEnd = (): void => { void close().catch(reportShutdownFailure); };
  stdin.once("end", onEnd);
  let closePromise: Promise<void> | undefined;

  function close(): Promise<void> {
    if (closePromise) return closePromise;
    stdin.off("data", onData);
    stdin.off("end", onEnd);
    closePromise = (async () => {
      try { await agent.close(); }
      finally { await credentials.close(); }
    })();
    return closePromise;
  }

  return {
    agent,
    close
  };
}

import { credentialRef } from "../credentials/credentialRef.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { AdapterRegistry, type LlmRouteConfig } from "../llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "../llm/providers/openaiAdapter.js";
import { stubProviderRoute, stubProviderTransport, STUB_PROVIDER_ID } from "../agent/stubProvider.js";
import { openAgentSession, type AgentSession } from "../agent/agentSession.js";
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
}

export interface AcpStdioInit {
  readonly workspace: string;
  readonly agentId: string;
  readonly providerId: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly credential?: string;
  readonly systemPrompt: string;
  /** Defaults to the real streams; injected by tests. */
  readonly stdin?: AcpInputStream;
  readonly stdout?: { write(chunk: Buffer): boolean };
  readonly stderr?: { write(chunk: string): boolean };
}

export interface AcpStdioHandle {
  readonly agent: AcpAgent;
  close(): void;
}

const DEFAULT_BASE_URLS: Readonly<Record<string, string>> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1"
};

const DEFAULT_CREDENTIAL_REFS: Readonly<Record<string, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY"
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
    : init.providerId === "anthropic" ? anthropicAdapter : null;
  if (adapter === null) {
    return {
      error: `unknown provider ${JSON.stringify(init.providerId)}; `
        + `this surface serves "${STUB_PROVIDER_ID}", "anthropic" and "openai"`
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
  const route = acpRouteFor(init);
  if ("error" in route) throw new Error(route.error);

  const stdin: AcpInputStream = init.stdin ?? process.stdin;
  const stdout = init.stdout ?? process.stdout;
  const stderr = init.stderr ?? process.stderr;

  // One registry and one credentials service for the process. A session gets its
  // own runtime over them, because `LlmRuntime` captures its session at
  // construction -- sharing one would write every session's request rows into
  // whichever session built it.
  const registry = new AdapterRegistry();
  registry.register(route);
  const credentials = new LocalCredentialsService();

  // The stub route answers in-process and has no server behind its base URL, so
  // it needs its own transport. Without one the default fetch transport tries to
  // reach a fake host, every request fails, and a turn "succeeds" having said
  // nothing -- which is how this was first shipped and what an end-to-end test
  // caught: the conversation completed and the agent produced no text at all.
  const transport = route.providerId === STUB_PROVIDER_ID ? stubProviderTransport({}) : undefined;

  const sessionFactory = (params: { sessionId: string; workspace: string; agentId: string }): AgentSession =>
    openAgentSession({
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
        params: {}
      },
      systemPrompt: init.systemPrompt,
      harnessVersion: amcVersion,
      compositionDigest: `acp:${route.providerId}`,
      policyDigest: "acp"
    });

  const agent = createAcpAgent({
    workspace: init.workspace,
    agentId: init.agentId,
    write: (frame) => { stdout.write(frame); },
    sessionFactory,
    // stderr, never stdout. See the module note.
    log: (message) => { stderr.write(`amc acp: ${message}\n`); }
  });

  const onData = (chunk: Buffer): void => agent.connection.ingest(chunk);
  stdin.on("data", onData);
  // A client that closes its side has ended the conversation; there is nothing
  // further to read and nothing more worth saying.
  stdin.once("end", () => agent.close());

  return {
    agent,
    close(): void {
      stdin.off("data", onData);
      agent.close();
    }
  };
}

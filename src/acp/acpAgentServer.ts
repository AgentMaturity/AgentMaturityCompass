import { randomUUID } from "node:crypto";
import type { AgentSession } from "../agent/agentSession.js";
import { amcVersion } from "../version.js";
import { createAcpConnection, type AcpConnection, type AcpSink } from "./acpConnection.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { projectSessionUpdates } from "./acpProjection.js";
import { acpProtocolVersion, checkAcpShape } from "./acpSchema.js";
import { acpStopReasonFor, stopReasonIsLossy } from "./acpStopReason.js";

/**
 * An ACP agent, over one connection (plan P7.1a).
 *
 * THE SLICE, AND WHY IT ENDS WHERE IT DOES. `initialize`, `authenticate`,
 * `session/new`, `session/prompt`, `session/cancel`, and outbound
 * `session/update`. Nothing else is implemented, and nothing else is STUBBED:
 * an unimplemented method answers `-32601`, which the protocol treats as a
 * legitimate answer. A stub that returned success would be the lie.
 *
 * WHAT `initialize` MUST NOT CLAIM. In ACP an absent capability is normatively
 * unsupported, so declaring less is conformant and declaring falsely is not.
 * `loadSession` is false because `openAgentSession` always opens a NEW session
 * and there is no path to re-attach a driver to a sealed one -- the rows exist,
 * the resume does not. Session list/fork/resume/close are absent for the same
 * reason: none has a handler.
 *
 * THE ONE KNOWING NON-CONFORMANCE. Stdio MCP is the single baseline an ACP agent
 * cannot decline by omission -- `McpCapabilities` gates only `http` and `sse`.
 * AMC is an MCP *server*, not a client for arbitrary stdio servers, so it cannot
 * honour it. `session/new` therefore REFUSES a non-empty `mcpServers` with an
 * error naming the deviation. Accepting the array and never connecting the
 * servers is the dishonest form, and it is also the easier one to write by
 * accident.
 *
 * AUTHORITY IS BOUND AT SPAWN, NOT PER MESSAGE. `src/wire/` requires a lease on
 * every message on the principle that a connection is not a credential. A real
 * ACP client is an editor speaking stdio and will never send one. That check is
 * therefore traded for process-spawn binding: the workspace and agent id come
 * from the launch, and a session may only be opened under that workspace. This
 * is a genuine reduction in authority checking and is recorded here rather than
 * dropped quietly -- whoever can spawn this process already has the workspace.
 */

/** What the launcher fixes, and a client cannot change. */
export interface AcpAgentInit {
  readonly workspace: string;
  readonly agentId: string;
  readonly write: AcpSink;
  /** Composes the model seam for each session. Supplied by the launcher. */
  readonly sessionFactory: (params: {
    readonly sessionId: string;
    readonly workspace: string;
    readonly agentId: string;
  }) => AgentSession;
  readonly log?: (message: string) => void;
}

interface Registered {
  readonly session: AgentSession;
  /** Rows already projected, so a prompt never re-sends an earlier answer. */
  projected: number;
  running: boolean;
  /**
   * Whether a cancel arrived for the prompt currently running.
   *
   * Kept here rather than read off the request's AbortSignal because
   * `session/cancel` is a NOTIFICATION: it names a session, never a request id,
   * and a handler is handed its signal but not its id. Threading the id through
   * only so the server could abort its own request would be machinery in place
   * of a boolean.
   */
  cancelled: boolean;
}

export interface AcpAgent {
  readonly connection: AcpConnection;
  close(): void;
}

export function createAcpAgent(init: AcpAgentInit): AcpAgent {
  const log = init.log ?? ((): void => undefined);
  const sessions = new Map<string, Registered>();
  let initialized = false;

  const connection = createAcpConnection({
    write: init.write,
    log,
    handlers: {
      request: (method, params, signal) => handleRequest(method, params, signal),
      notification: (method, params) => handleNotification(method, params)
    }
  });

  return {
    connection,
    close(): void {
      for (const entry of sessions.values()) {
        try { entry.session.close(); } catch { /* already closed */ }
      }
      sessions.clear();
      connection.close();
    }
  };

  async function handleRequest(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    if (method === "initialize") return initialize(params);

    // Every other method needs the handshake first. Reported as its own code,
    // not as method-not-found: the method exists, and saying otherwise would
    // send a client hunting a capability problem it does not have.
    if (!initialized) {
      throw new AcpFailure(ACP_ERROR.notInitialized, `${method} was called before initialize`);
    }

    switch (method) {
      case "authenticate": return authenticate(params);
      case "session/new": return newSession(params);
      case "session/prompt": return prompt(params, signal);
      default:
        throw new AcpFailure(ACP_ERROR.methodNotFound, `${method} is not implemented by this agent`);
    }
  }

  function handleNotification(method: string, params: unknown): void {
    // Unknown notifications are ignored in silence: a notification has no reply,
    // and a peer that sent one is not waiting to be corrected.
    if (method === "session/cancel") void cancel(params);
  }

  async function initialize(params: unknown): Promise<unknown> {
    await require_("InitializeRequest", params);
    initialized = true;
    return {
      protocolVersion: await acpProtocolVersion(),
      agentInfo: { name: "agent-maturity-compass", version: amcVersion },
      // Empty: this agent authenticates nothing, because the workspace was
      // decided by whoever spawned the process.
      authMethods: [],
      agentCapabilities: {
        // False, and load-bearing. See the module note.
        loadSession: false,
        promptCapabilities: { image: false, audio: false, embeddedContext: false }
      }
    };
  }

  async function authenticate(params: unknown): Promise<unknown> {
    await require_("AuthenticateRequest", params);
    // A no-op, honestly. With `authMethods: []` there is nothing to authenticate
    // against, and the protocol still requires the method to exist.
    return {};
  }

  async function newSession(params: unknown): Promise<unknown> {
    await require_("NewSessionRequest", params);
    const request = params as { cwd: string; mcpServers: readonly unknown[] };

    if (request.mcpServers.length > 0) {
      // Refused, not ignored. See the module note on the one non-conformance.
      throw new AcpFailure(
        ACP_ERROR.invalidParams,
        "this agent cannot connect to MCP servers on a client's behalf; "
        + "AMC is an MCP server, not an MCP client. Start the session with mcpServers: []"
      );
    }

    const sessionId = randomUUID();
    const session = init.sessionFactory({
      sessionId,
      workspace: init.workspace,
      agentId: init.agentId
    });
    sessions.set(sessionId, { session, projected: 0, running: false, cancelled: false });
    return { sessionId };
  }

  async function prompt(params: unknown, signal: AbortSignal): Promise<unknown> {
    await require_("PromptRequest", params);
    const request = params as { sessionId: string; prompt: readonly { type: string; text?: string }[] };
    const entry = sessions.get(request.sessionId);
    if (!entry) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "no session with that id");
    }
    if (entry.running) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "a prompt is already running on this session");
    }

    const text = flattenPrompt(request.prompt);
    if (text.length === 0) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "the prompt carried no text this agent can read");
    }

    entry.running = true;
    entry.cancelled = false;
    try {
      const outcome = await entry.session.prompt(text);

      // Content is flushed BEFORE the response, always -- including after a
      // cancel, and including when the turn failed. `PromptResponse` has no
      // content field, so anything not sent as a notification is simply lost.
      flush(entry, request.sessionId);

      if (entry.cancelled || signal.aborted) {
        // Overrides everything, including a failure underneath. ACP mandates
        // `cancelled` when a cancel was requested, and the true ending is in the
        // log either way.
        return { stopReason: "cancelled" };
      }
      if (!outcome.ok) {
        // A protocol-level failure, not a tidy stop reason over a broken log.
        throw new AcpFailure(ACP_ERROR.internal, "the turn did not complete", { reason: outcome.reason });
      }
      const reason = turnEndOf(outcome.status);
      return {
        stopReason: acpStopReasonFor(reason),
        // Attached only when the mapping lost something, so `_meta` means "there
        // is more here than the stop reason says" rather than being noise.
        ...(stopReasonIsLossy(reason) ? { _meta: { "dev.agentmaturity.amc": { turnEndReason: reason } } } : {})
      };
    } finally {
      entry.running = false;
    }
  }

  async function cancel(params: unknown): Promise<void> {
    const check = await checkAcpShape("CancelNotification", params);
    if (!check.ok) {
      log(`ignored a malformed session/cancel: ${check.reason}`);
      return;
    }
    const entry = sessions.get((params as { sessionId: string }).sessionId);
    // Nothing running is not an error and must not cancel anything: the next
    // prompt has not started, and cancelling it pre-emptively would kill a turn
    // the client never asked to stop.
    if (!entry || !entry.running) return;
    entry.cancelled = true;
    entry.session.cancel({ kind: "user" }, "acp-client");
  }

  /** Send every update the session has produced since the last flush. */
  function flush(entry: Registered, sessionId: string): void {
    const events = entry.session.readEvents();
    const projected = projectSessionUpdates(init.workspace, events, entry.projected);
    entry.projected = events.length;
    if (projected.unsigned > 0) {
      log(`skipped ${projected.unsigned} unsigned row(s) for session ${sessionId}`);
    }
    for (const update of projected.updates) {
      connection.notify("session/update", { sessionId, update });
    }
  }

  async function require_(shape: Parameters<typeof checkAcpShape>[0], params: unknown): Promise<void> {
    const check = await checkAcpShape(shape, params);
    if (!check.ok) throw new AcpFailure(ACP_ERROR.invalidParams, check.reason);
  }
}

/**
 * The text a prompt carries.
 *
 * `text` blocks are read. `resource_link` is flattened to a bracketed reference
 * rather than refused, because refusing it is non-conformant -- the protocol
 * requires an agent to accept one -- while pretending to have FETCHED it would
 * be worse. The client is told the reference exists; nothing claims to have read
 * it. Image and audio blocks are dropped, which is what
 * `promptCapabilities: {image: false, audio: false}` already told the client.
 */
function flattenPrompt(blocks: readonly { type: string; text?: string; uri?: string }[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    else if (block.type === "resource_link" && typeof block.uri === "string") {
      parts.push(`[linked resource: ${block.uri}]`);
    }
  }
  return parts.join("\n").trim();
}

/** AMC's driver status, as the turn ending the stop-reason table expects. */
function turnEndOf(status: string): Parameters<typeof acpStopReasonFor>[0] {
  switch (status) {
    case "idle": return "complete";
    case "cancelled": return "cancelled";
    case "blocked": return "blocked";
    case "failed": return "error";
    default: return "complete";
  }
}

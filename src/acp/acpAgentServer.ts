import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { AgentPromptResult, AgentSession } from "../agent/agentSession.js";
import { SessionResumeRefused } from "../session/sessionResume.js";
import { amcVersion } from "../version.js";
import { createAcpConnection, type AcpConnection, type AcpSink } from "./acpConnection.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { projectSessionUpdates } from "./acpProjection.js";
import { acpProtocolVersion, checkAcpShape } from "./acpSchema.js";
import { acpStopReasonFor, stopReasonIsLossy } from "./acpStopReason.js";
import { ACP_MAX_TURN_UPDATE_BYTES, validateAcpCommittedTail } from "./acpCommittedUpdates.js";
import { projectNativeValidation } from "../agent/nativeValidationProjection.js";

/**
 * An ACP agent, over one connection (plan P7.1a).
 *
 * THE SLICE, AND WHY IT ENDS WHERE IT DOES. `initialize`, `authenticate`,
 * `session/new`, verified `session/load`, `session/prompt`, `session/cancel`, and outbound
 * `session/update`. Nothing else is implemented, and nothing else is STUBBED:
 * an unimplemented method answers `-32601`, which the protocol treats as a
 * legitimate answer. A stub that returned success would be the lie.
 *
 * WHAT `initialize` MUST NOT CLAIM. In ACP an absent capability is normatively
 * unsupported, so declaring less is conformant and declaring falsely is not.
 * `loadSession` is advertised only when a verified resume factory is supplied.
 * Explicit `_amc/session/release` leaves a signed ownership handoff; ordinary
 * process shutdown seals sessions. A sealed session cannot be resumed.
 *
 * THE ONE KNOWING NON-CONFORMANCE. Stdio MCP is the single baseline an ACP agent
 * cannot decline by omission -- `McpCapabilities` gates only `http` and `sse`.
 * Client-supplied server commands cannot replace the process-bound reviewed MCP
 * configuration. `session/new` therefore REFUSES a non-empty `mcpServers` with an
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
    readonly signal: AbortSignal;
  }) => AgentSession | Promise<AgentSession>;
  readonly resumeSessionFactory?: AcpAgentInit["sessionFactory"];
  readonly nativeExecution?: { readonly tools: "none" | "workspace"; readonly signedApprovalGate: boolean; readonly reviewedMcpConfigured: boolean; readonly taskValidation?: boolean };
  readonly onUnusable?: () => void;
  readonly log?: (message: string) => void;
}

interface Registered {
  readonly session: AgentSession;
  /** Rows emitted or deliberately withheld, never output owned by a later prompt. */
  projected: number;
  projectedHash: string | null;
  updateBytes: number;
  /** A failed projection cannot be retried under a later prompt's identity. */
  projectionFailed: boolean;
  running: boolean;
  releasing: boolean;
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
  close(): Promise<void>;
}

export function createAcpAgent(init: AcpAgentInit): AcpAgent {
  const log = init.log ?? ((): void => undefined);
  const sessions = new Map<string, Registered>();
  let initialized = false;
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const tasks = new Set<Promise<unknown>>();
  const shutdown = new AbortController();
  const loading = new Set<string>();

  const connection = createAcpConnection({
    write: init.write,
    log,
    onUnusable: () => {
      if (init.onUnusable) init.onUnusable();
      else void close().catch(() => log("ACP shutdown could not seal all sessions"));
    },
    handlers: {
      request: (method, params, signal) => {
        const task = handleRequest(method, params, signal);
        tasks.add(task);
        void task.then(() => tasks.delete(task), () => tasks.delete(task));
        return task;
      },
      notification: (method, params) => handleNotification(method, params)
    }
  });

  return {
    connection,
    close
  };

  function close(): Promise<void> {
    if (closePromise) return closePromise;
    closing = true;
    shutdown.abort();
    closePromise = (async () => {
      const errors: unknown[] = [];
      for (const entry of sessions.values()) {
        if (entry.running) {
          entry.cancelled = true;
          try { entry.session.cancel({ kind: "disposed" }, "acp-shutdown"); } catch (error) { errors.push(error); }
        }
      }
      if (tasks.size) await Promise.allSettled([...tasks]);
      for (const entry of sessions.values()) {
        try { await entry.session.close(); } catch (error) { errors.push(error); }
      }
      sessions.clear();
      connection.close();
      if (errors.length) throw new Error("ACP shutdown could not cleanly seal every owned session; inspect its evidence before resuming.");
    })();
    return closePromise;
  }

  async function handleRequest(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    if (closing) throw new AcpFailure(ACP_ERROR.internal, "the agent is shutting down");
    if (method === "initialize") return initialize(params);

    // Every other method needs the handshake first. Reported as its own code,
    // not as method-not-found: the method exists, and saying otherwise would
    // send a client hunting a capability problem it does not have.
    if (!initialized) {
      throw new AcpFailure(ACP_ERROR.notInitialized, `${method} was called before initialize`);
    }

    switch (method) {
      case "authenticate": return authenticate(params);
      case "session/new": return newSession(params, signal);
      case "session/load": return loadSession(params, signal);
      case "_amc/session/release": return releaseSession(params);
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
        loadSession: init.resumeSessionFactory !== undefined,
        _meta: { "dev.agentmaturity.amc": {
          ...(init.resumeSessionFactory === undefined ? {} : { releaseSession: true }),
          committedUpdates: "live-completed-blocks",
          ...(init.nativeExecution ?? {})
        } },
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

  async function newSession(params: unknown, signal: AbortSignal): Promise<unknown> {
    await require_("NewSessionRequest", params);
    const request = params as { cwd: string; mcpServers: readonly unknown[]; additionalDirectories?: readonly string[] };
    assertSessionScope(request);
    if (closing) throw new AcpFailure(ACP_ERROR.internal, "the agent is shutting down");
    const sessionId = randomUUID();
    const session = await init.sessionFactory({ sessionId, workspace: init.workspace, agentId: init.agentId, signal: AbortSignal.any([signal, shutdown.signal]) });
    if (closing || signal.aborted || session.sessionId !== sessionId) {
      await session.close();
      throw new AcpFailure(ACP_ERROR.internal, "session creation was cancelled or returned an incompatible identity");
    }
    sessions.set(sessionId, { session, projected: 0, projectedHash: null, updateBytes: 0, projectionFailed: false, running: false, releasing: false, cancelled: false });
    return { sessionId };
  }

  function assertSessionScope(request: { cwd: string; mcpServers: readonly unknown[]; additionalDirectories?: readonly string[] }): void {
    if (resolve(request.cwd) !== resolve(init.workspace) || (request.additionalDirectories?.length ?? 0) > 0) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "the workspace is fixed when the agent process is started; additional roots are unsupported");
    }
    if (request.mcpServers.length > 0) {
      // Refused, not ignored. See the module note on the one non-conformance.
      throw new AcpFailure(
        ACP_ERROR.invalidParams,
        "client-selected MCP commands are not authorized by this process; "
        + "use the reviewed startup --mcp-config with signed grants and start the session with mcpServers: []"
      );
    }

  }

  async function loadSession(params: unknown, signal: AbortSignal): Promise<unknown> {
    if (!init.resumeSessionFactory) throw new AcpFailure(ACP_ERROR.methodNotFound, "verified session loading is unavailable");
    await require_("LoadSessionRequest", params);
    const request = params as { sessionId: string; cwd: string; mcpServers: readonly unknown[]; additionalDirectories?: readonly string[] };
    assertSessionScope(request);
    if (closing || sessions.has(request.sessionId) || loading.has(request.sessionId)) throw new AcpFailure(ACP_ERROR.invalidParams, "session is already loaded or the agent is shutting down");
    loading.add(request.sessionId);
    let session: AgentSession;
    try {
      session = await init.resumeSessionFactory({ sessionId: request.sessionId, workspace: init.workspace, agentId: init.agentId, signal: AbortSignal.any([signal, shutdown.signal]) });
    } catch (error) {
      loading.delete(request.sessionId);
      if (error instanceof SessionResumeRefused) throw new AcpFailure(ACP_ERROR.invalidParams, "verified session resume was refused", { reason: error.code });
      throw error;
    }
    try {
      if (closing || signal.aborted || session.sessionId !== request.sessionId || !session.release) throw new Error("resume factory returned an incompatible or cancelled session");
      const rows = session.readEvents();
      const projectedHash = validateAcpCommittedTail(init.workspace, request.sessionId, rows, 0, null);
      const history = projectSessionUpdates(init.workspace, rows, 0, { includeUser: true });
      if (history.unsigned > 0) throw new Error("cannot replay unsigned history");
      const entry: Registered = { session, projected: rows.length, projectedHash, updateBytes: 0, projectionFailed: false, running: false, releasing: false, cancelled: false };
      sessions.set(request.sessionId, entry);
      // ACP loading replays historical updates before its response. These are
      // history, not output attributed to a newly submitted prompt.
      for (const update of history.updates) sendUpdate(entry, request.sessionId, update);
      return {};
    } catch (error) {
      sessions.delete(request.sessionId);
      try { await session.release?.(); } catch { /* retain resume/replay failure */ }
      throw error;
    } finally { loading.delete(request.sessionId); }
  }

  async function releaseSession(params: unknown): Promise<unknown> {
    await require_("CancelNotification", params);
    const sessionId = (params as { sessionId: string }).sessionId;
    const entry = sessions.get(sessionId);
    if (!entry || entry.running || entry.releasing || !entry.session.release) throw new AcpFailure(ACP_ERROR.invalidParams, "only an idle, owned, releasable session can be handed off");
    // Claim the idle slot while asynchronous MCP cleanup and release settle.
    entry.releasing = true;
    try { await entry.session.release(); }
    catch (error) { entry.releasing = false; throw error; }
    sessions.delete(sessionId);
    return {};
  }

  async function prompt(params: unknown, signal: AbortSignal): Promise<unknown> {
    await require_("PromptRequest", params);
    if (closing) throw new AcpFailure(ACP_ERROR.internal, "the agent is shutting down");
    const request = params as { sessionId: string; prompt: readonly { type: string; text?: string }[] };
    const entry = sessions.get(request.sessionId);
    if (!entry) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "no session with that id");
    }
    if (entry.running || entry.releasing) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "a prompt is already running on this session");
    }
    if (entry.projectionFailed) {
      throw new AcpFailure(ACP_ERROR.internal, "this session's committed updates are unusable; close the client and inspect the session evidence before continuing");
    }
    if (signal.aborted) return { stopReason: "cancelled" };

    const text = flattenPrompt(request.prompt);
    if (text.length === 0) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "the prompt carried no text this agent can read");
    }

    entry.running = true;
    entry.cancelled = false;
    entry.updateBytes = 0;
    let streamFailed = false;
    const poll = (): void => {
      if (streamFailed) return;
      try { flush(entry, request.sessionId); }
      catch {
        streamFailed = true;
        try { entry.session.cancel({ kind: "disposed" }, "acp-committed-update-failure"); } catch { /* prompt failure remains authoritative */ }
      }
    };
    const onAbort = (): void => {
      entry.cancelled = true;
      try { entry.session.cancel({ kind: "user" }, "acp-request-abort"); } catch { /* prompt will return its actual outcome */ }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setInterval(poll, 100);
    timer.unref();
    try {
      let outcome: AgentPromptResult;
      try {
        outcome = await entry.session.prompt(text);
      } catch (error) {
        // A rejected prompt may also have committed rows. Withhold its tail as
        // for ok:false, but never leave it for a later prompt to emit as new.
        if (!streamFailed) flush(entry, request.sessionId, false);
        throw error;
      }
      if (streamFailed) throw new AcpFailure(ACP_ERROR.internal, "committed update authentication or output bounds failed; inspect the session evidence");

      // A CANCEL OUTRANKS EVERYTHING, including the `ok: false` a cancelled turn
      // reports. ACP mandates `cancelled` when a cancel was requested, even when
      // the abort caused failures underneath, and the true ending is in the log
      // either way. Content produced before the cancel was still signed, so it
      // is flushed -- `flush` skips unprovenanced rows on its own.
      if (entry.cancelled || signal.aborted) {
        flush(entry, request.sessionId);
        return { stopReason: "cancelled", ...(init.nativeExecution?.taskValidation ? {
          _meta: { "dev.agentmaturity.amc": { validation: projectNativeValidation(init.workspace, entry.session.readEvents()) } }
        } : {}) };
      }

      // A failed turn emits no further tail. Authenticate and retire those rows
      // now, or the next prompt's flush would misattribute them as fresh output.
      // Already delivered updates remain distinct from the failed turn result.
      if (!outcome.ok) {
        flush(entry, request.sessionId, false);
        throw new AcpFailure(ACP_ERROR.internal, "the turn did not complete", { reason: outcome.reason });
      }

      // `PromptResponse` has no content field, so anything not sent as a
      // notification is simply lost.
      flush(entry, request.sessionId);
      const reason = turnEndOf(outcome.status);
      return {
        stopReason: acpStopReasonFor(reason),
        // Turn completion and selected public checks are independent outcomes.
        ...(stopReasonIsLossy(reason) || init.nativeExecution?.taskValidation ? { _meta: { "dev.agentmaturity.amc": {
          ...(stopReasonIsLossy(reason) ? { turnEndReason: reason } : {}),
          ...(init.nativeExecution?.taskValidation ? { validation: outcome.validation } : {})
        } } } : {})
      };
    } finally {
      clearInterval(timer);
      signal.removeEventListener("abort", onAbort);
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

  /** Advance only over authenticated rows; failed-prompt tails are not emitted. */
  function flush(entry: Registered, sessionId: string, emit = true): void {
    if (entry.projectionFailed) throw new Error("ACP committed projection is unusable.");
    try {
      const events = entry.session.readEvents();
      const head = validateAcpCommittedTail(init.workspace, sessionId, events, entry.projected, entry.projectedHash);
      // Withheld output never reaches a client, so it needs no payload rendering.
      // Its row signatures, ownership and sequence still must authenticate.
      const projected = emit ? projectSessionUpdates(init.workspace, events, entry.projected) : null;
      if (projected && projected.unsigned > 0) throw new Error("ACP refused an unsigned committed update.");
      entry.projected = events.length;
      entry.projectedHash = head;
      for (const update of projected?.updates ?? []) {
        sendUpdate(entry, sessionId, update);
      }
    } catch (error) {
      // In particular, an output-limit failure must not reset with updateBytes
      // on a new prompt, nor can a bad tail be silently skipped before spending.
      entry.projectionFailed = true;
      throw error;
    }
  }

  function sendUpdate(entry: Registered, sessionId: string, update: unknown): void {
    const params = { sessionId, update };
    const bytes = Buffer.byteLength(JSON.stringify(params), "utf8");
    if (bytes > 900_000 || entry.updateBytes + bytes > ACP_MAX_TURN_UPDATE_BYTES) throw new Error("ACP committed output exceeds its frame or turn bound.");
    entry.updateBytes += bytes;
    connection.notify("session/update", params);
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

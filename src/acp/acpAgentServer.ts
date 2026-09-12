import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import type { AgentPromptResult, AgentSession } from "../agent/agentSession.js";
import { SessionResumeRefused } from "../session/sessionResume.js";
import { amcVersion } from "../version.js";
import { createAcpConnection, type AcpConnection, type AcpSink } from "./acpConnection.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { projectSessionUpdates } from "./acpProjection.js";
import { acpProtocolVersion, checkAcpShape, checkInitializedAcpShape } from "./acpSchema.js";
import { ACP_STOP_REASONS, acpStopReasonFor, stopReasonIsLossy } from "./acpStopReason.js";
import { ACP_MAX_TURN_UPDATE_BYTES, validateAcpCommittedTail } from "./acpCommittedUpdates.js";
import { projectNativeValidation } from "../agent/nativeValidationProjection.js";
import { acpSupportsImageInput, assertAcpRouteContent, flattenPrompt, orderedPrompt, requiresOrderedPrompt, type AcpPromptBlock, type AcpPromptRoute } from "./acpPromptInput.js";
import { NATIVE_ORDERED_INPUT_FORMAT } from "../attachments/nativeOrderedInput.js";
import { NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { acpSupportsAudioInput, audioPrompt } from "./acpAudioInput.js";
import { ACP_MAX_UPDATE_PARAMS_BYTES, acpPromptInputFormat, assertAcpPromptFields, nativeAcpCapabilities, type AcpForkSessionFactory } from "./acpRuntimeContracts.js";
import { prepareAcpHistory, assertAcpForkLineage } from "./acpHistoryContinuity.js";

/**
 * An ACP agent, over one connection (plan P7.1a).
 *
 * THE SLICE, AND WHY IT ENDS WHERE IT DOES. `initialize`, `authenticate`,
 * `session/new`, verified `session/load`, capability-gated `session/fork`,
 * `_amc/session/release`, `session/prompt`, `session/cancel`, and outbound
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
  /** Must inherit authenticated context; a lineage-only factory is not a fork. */
  readonly forkSessionFactory?: AcpForkSessionFactory;
  /** The actual fixed native route, never a client-supplied capability claim. */
  readonly promptRoute?: AcpPromptRoute;
  /** Launcher attests that its native session factories implement promptParts. */
  readonly orderedImageInput?: boolean;
  /** Native factory attestation, in addition to exact selected route support. */
  readonly audioInput?: boolean;
  readonly nativeExecution?: { readonly tools: "none" | "workspace"; readonly signedApprovalGate: boolean; readonly reviewedMcpConfigured: boolean; readonly taskValidation?: boolean };
  readonly onUnusable?: () => void;
  readonly log?: (message: string) => void;
}

interface PromptSlot {
  started: boolean;
  cancelled: boolean;
  cancelFailed: boolean;
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
  forking?: boolean;
  /** Identity captured before validation; an old cancel cannot target a later prompt. */
  active?: PromptSlot;
}

export interface AcpAgent {
  readonly connection: AcpConnection;
  close(): Promise<void>;
}

export function createAcpAgent(init: AcpAgentInit): AcpAgent {
  const log = (message: string): void => {
    try { init.log?.(message.replace(/[\r\n\u2028\u2029]/g, " ")); } catch { /* diagnostics cannot interrupt a cancellation */ }
  };
  const imageInput = acpSupportsImageInput(init.promptRoute);
  const orderedImageInput = imageInput && init.orderedImageInput === true;
  const audioInput = acpSupportsAudioInput(init.promptRoute) && init.audioInput === true;
  const sessions = new Map<string, Registered>();
  const cleanupPending = new Set<AgentSession>();
  let initialized = false;
  let initializing = false;
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
        if (entry.active) {
          entry.active.cancelled = true;
          if (entry.active.started) {
            try { entry.session.cancel({ kind: "disposed" }, "acp-shutdown"); } catch (error) { errors.push(error); }
          }
        }
      }
      if (tasks.size) await Promise.allSettled([...tasks]);
      for (const session of new Set([...sessions.values()].map(entry => entry.session).concat([...cleanupPending]))) {
        try { await session.close(); } catch (error) { errors.push(error); }
      }
      sessions.clear();
      cleanupPending.clear();
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
      case "session/fork": return forkSession(params, signal);
      case "_amc/session/release": return releaseSession(params);
      case "session/prompt": return prompt(params, signal);
      default:
        throw new AcpFailure(ACP_ERROR.methodNotFound, `${method} is not implemented by this agent`);
    }
  }

  function handleNotification(method: string, params: unknown): void {
    // Notifications have no response ID. Report unsupported ones diagnostically,
    // without manufacturing a response that another request might consume.
    if (method === "session/cancel") cancelNotification(params);
    else log("ignored an unsupported ACP notification");
  }

  async function initialize(params: unknown): Promise<unknown> {
    if (initialized || initializing) throw new AcpFailure(ACP_ERROR.invalidRequest, "initialize may be called only once per connection");
    initializing = true;
    let protocolVersion: number;
    try {
      await require_("InitializeRequest", params);
      protocolVersion = await acpProtocolVersion();
      if (closing) throw new AcpFailure(ACP_ERROR.internal, "the agent is shutting down");
      initialized = true;
    } finally { initializing = false; }
    return {
      protocolVersion,
      agentInfo: { name: "agent-maturity-compass", version: amcVersion },
      // Empty: this agent authenticates nothing, because the workspace was
      // decided by whoever spawned the process.
      authMethods: [],
      agentCapabilities: nativeAcpCapabilities({ route: init.promptRoute, orderedImageInput, audioInput,
        loadSession: init.resumeSessionFactory !== undefined, forkSession: init.forkSessionFactory !== undefined,
        nativeExecution: init.nativeExecution })
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
    if (closing || signal.aborted) throw new AcpFailure(ACP_ERROR.internal, "session creation was cancelled or the agent is shutting down");
    const sessionId = randomUUID();
    const session = await init.sessionFactory({ sessionId, workspace: init.workspace, agentId: init.agentId, signal: AbortSignal.any([signal, shutdown.signal]) });
    if (closing || signal.aborted || session.sessionId !== sessionId || sessionIdentityReserved(sessionId)) {
      if (!sessionIdentityReserved(session.sessionId)) {
        try { await session.close(); } catch { cleanupPending.add(session); }
      }
      throw new AcpFailure(ACP_ERROR.internal, "session creation was cancelled or returned an incompatible identity");
    }
    sessions.set(sessionId, { session, projected: 0, projectedHash: null, updateBytes: 0, projectionFailed: false, running: false, releasing: false });
    return { sessionId };
  }

  function assertSessionScope(request: { cwd: string; mcpServers?: readonly unknown[]; additionalDirectories?: readonly string[] }): void {
    let sameWorkspace = false;
    try { sameWorkspace = realpathSync(resolve(request.cwd)) === realpathSync(resolve(init.workspace)); } catch { /* nonexistent roots are refused */ }
    if (!sameWorkspace || (request.additionalDirectories?.length ?? 0) > 0) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "the workspace is fixed when the agent process is started; additional roots are unsupported");
    }
    if ((request.mcpServers?.length ?? 0) > 0) {
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
    if ([...cleanupPending].some(session => session.sessionId === request.sessionId)) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "session cleanup remains unresolved; close the connection and inspect its ownership before loading again");
    }
    if (closing || signal.aborted || sessions.has(request.sessionId) || loading.has(request.sessionId)) throw new AcpFailure(ACP_ERROR.invalidParams, "session is already loaded, cancelled or the agent is shutting down");
    loading.add(request.sessionId);
    let session: AgentSession;
    try {
      session = await init.resumeSessionFactory({ sessionId: request.sessionId, workspace: init.workspace, agentId: init.agentId, signal: AbortSignal.any([signal, shutdown.signal]) });
    } catch (error) {
      loading.delete(request.sessionId);
      if (error instanceof SessionResumeRefused) throw new AcpFailure(ACP_ERROR.invalidParams, "verified session resume was refused", { reason: error.code });
      throw error;
    }
    let loadedEntry: Registered | undefined;
    try {
      if (closing || signal.aborted || session.sessionId !== request.sessionId || !session.release
          || sessions.has(request.sessionId)
          || [...sessions.values()].some(entry => entry.session === session)) throw new Error("resume factory returned an incompatible or cancelled session");
      const rows = session.readEvents();
      const history = prepareAcpHistory({ workspace: init.workspace, session, rows, route: init.promptRoute, orderedImageInput, audioInput });
      const entry: Registered = { session, projected: rows.length, projectedHash: history.head, updateBytes: 0, projectionFailed: false, running: false, releasing: false };
      loadedEntry = entry;
      sessions.set(request.sessionId, entry);
      // ACP loading replays historical updates before its response. These are
      // history, not output attributed to a newly submitted prompt.
      for (const update of history.updates) sendUpdate(entry, request.sessionId, update);
      return {};
    } catch (error) {
      if (loadedEntry && sessions.get(request.sessionId) === loadedEntry) sessions.delete(request.sessionId);
      try {
        if (sessions.has(session.sessionId) || [...cleanupPending].some(pending => pending.sessionId === session.sessionId)
            || (session.sessionId !== request.sessionId && loading.has(session.sessionId))) throw new Error("resume factory returned an already owned session");
        if (!session.release) throw new Error("resume factory has no release operation");
        await session.release();
      } catch {
        // Retain ownership for shutdown rather than losing the only cleanup handle.
        if (!sessions.has(session.sessionId) && ![...cleanupPending].some(pending => pending.sessionId === session.sessionId)
            && (session.sessionId === request.sessionId || !loading.has(session.sessionId))) cleanupPending.add(session);
        log("ACP replay failed and its session could not be released; retained for shutdown");
      }
      throw error;
    } finally { loading.delete(request.sessionId); }
  }

  async function releaseSession(params: unknown): Promise<unknown> {
    const entry = entryFor(params);
    if (!entry || entry.running || entry.releasing || entry.forking || entry.projectionFailed || !entry.session.release) throw new AcpFailure(ACP_ERROR.invalidParams, "only an idle, owned, releasable session can be handed off");
    // Claim the idle slot while asynchronous MCP cleanup and release settle.
    entry.releasing = true;
    try { await require_("CancelNotification", params); }
    catch (error) { entry.releasing = false; throw error; }
    try { await entry.session.release(); }
    catch (error) { entry.projectionFailed = true; throw error; }
    sessions.delete(entry.session.sessionId);
    return {};
  }

  async function forkSession(params: unknown, signal: AbortSignal): Promise<unknown> {
    if (!init.forkSessionFactory) throw new AcpFailure(ACP_ERROR.methodNotFound, "authenticated context forking is unavailable; a lineage-only copy is not a fork");
    const parent = entryFor(params);
    if (parent && (parent.running || parent.releasing || parent.forking || parent.projectionFailed)) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "only an idle, usable session can be forked on this connection");
    }
    if (parent) parent.forking = true;
    let child: AgentSession | undefined;
    try {
      await require_("ForkSessionRequest", params);
      const request = params as { sessionId: string; cwd: string; mcpServers?: readonly unknown[]; additionalDirectories?: readonly string[] };
      assertSessionScope(request);
      if (closing || signal.aborted || loading.has(request.sessionId)
          || [...cleanupPending].some(session => session.sessionId === request.sessionId)) throw new AcpFailure(ACP_ERROR.invalidParams, "fork was cancelled or its source is still loading or awaiting cleanup");
      child = await init.forkSessionFactory({ parentSessionId: request.sessionId, workspace: init.workspace,
        agentId: init.agentId, signal: AbortSignal.any([signal, shutdown.signal]) });
      if (closing || signal.aborted || child.sessionId === request.sessionId || sessionIdentityReserved(child.sessionId)) {
        throw new AcpFailure(ACP_ERROR.internal, "fork returned an incompatible, already owned or cancelled session");
      }
      const rows = child.readEvents();
      const lineage = assertAcpForkLineage(init.workspace, request.sessionId, child, rows, init.agentId);
      // Both the inherited source and the child's own rows must be representable
      // by this route. This does not substitute a rendered transcript for context.
      prepareAcpHistory({ workspace: init.workspace, session: { sessionId: request.sessionId,
        promptParts: child.promptParts, promptAudioParts: child.promptAudioParts }, rows: lineage.rows,
        route: init.promptRoute, orderedImageInput, audioInput });
      const history = prepareAcpHistory({ workspace: init.workspace, session: child, rows,
        route: init.promptRoute, orderedImageInput, audioInput });
      sessions.set(child.sessionId, { session: child, projected: rows.length, projectedHash: history.head,
        updateBytes: 0, projectionFailed: false, running: false, releasing: false });
      return { sessionId: child.sessionId, _meta: { "dev.agentmaturity.amc": { parentSession: lineage.parent } } };
    } catch (error) {
      // Never close a parent or another registered writer returned by a bad factory.
      if (child && !sessionIdentityReserved(child.sessionId) && child.sessionId !== (params as { sessionId?: unknown } | null)?.sessionId) {
        try { await child.close(); }
        catch {
          // A conflicting identity must not overwrite somebody else's cleanup handle.
          cleanupPending.add(child);
          log("ACP fork cleanup failed; inspect the child evidence before reuse");
        }
      }
      if (error instanceof SessionResumeRefused) throw new AcpFailure(ACP_ERROR.invalidParams, "verified session fork was refused", { reason: error.code });
      throw error;
    } finally { if (parent) parent.forking = false; }
  }

  async function prompt(params: unknown, signal: AbortSignal): Promise<unknown> {
    const entry = entryFor(params);
    if (!entry) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "no session with that id");
    }
    if (entry.running || entry.releasing || entry.forking) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "a prompt is already running on this session");
    }
    if (entry.projectionFailed) {
      throw new AcpFailure(ACP_ERROR.internal, "this session's committed updates are unusable; close the client and inspect the session evidence before continuing");
    }
    // Reserve protocol ownership BEFORE any await, but commit no native inbox
    // work until the whole prompt is validated. Same-read cancellation can now
    // target this slot without ever cancelling the next prompt on this session.
    const slot: PromptSlot = { started: false, cancelled: signal.aborted, cancelFailed: false };
    entry.active = slot;
    entry.running = true;
    const onAbort = (): void => requestCancel(entry, slot, "acp-request-abort");
    signal.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      await require_("PromptRequest", params);
      const request = params as { sessionId: string; prompt: readonly AcpPromptBlock[]; _meta?: Record<string, unknown> };
      assertAcpPromptFields(request.prompt);
      assertAcpRouteContent(init.promptRoute, request.prompt);
      const inputFormat = acpPromptInputFormat(request._meta);
      const audio = inputFormat === NATIVE_AUDIO_INPUT_FORMAT || request.prompt.some(block => block.type === "audio");
      if (audio && (inputFormat === NATIVE_ORDERED_INPUT_FORMAT || !audioInput || !entry.session.promptAudioParts)) {
        throw new AcpFailure(ACP_ERROR.invalidParams, "Original audio requires negotiated amc-audio-input@1 and the native audio factory; no image-contract downgrade was used.");
      }
      const audioParts = audio ? audioPrompt(request.prompt, init.promptRoute) : undefined;
      const ordered = !audio && (inputFormat === NATIVE_ORDERED_INPUT_FORMAT || requiresOrderedPrompt(request.prompt));
      if (ordered && (!orderedImageInput || !entry.session.promptParts)) {
        throw new AcpFailure(ACP_ERROR.invalidParams, "This native session does not support the ordered image contract; select a runtime advertising amc-image-input@2. No reordering was performed.");
      }
      const parts = ordered ? orderedPrompt(request.prompt, imageInput) : undefined;
      const legacy = parts === undefined && audioParts === undefined ? flattenPrompt(request.prompt, imageInput) : undefined;

      if (closing || signal.aborted || slot.cancelled) return { stopReason: "cancelled" };
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
      timer = setInterval(poll, 100);
      timer.unref();
      let outcome: AgentPromptResult | undefined;
      let rejected: unknown;
      slot.started = true;
      try {
        outcome = await (audioParts !== undefined ? entry.session.promptAudioParts!(audioParts) : parts !== undefined ? entry.session.promptParts!(parts)
          : legacy!.images.length ? entry.session.prompt(legacy!.text, legacy!.images) : entry.session.prompt(legacy!.text));
      } catch (error) {
        rejected = error;
      }
      if (slot.cancelFailed) throw new AcpFailure(ACP_ERROR.internal, "native cancellation failed; this session is unusable until inspected");
      if (streamFailed) throw new AcpFailure(ACP_ERROR.internal, "committed update authentication or output bounds failed; inspect the session evidence");

      // Cancellation outranks the provider rejection it caused, but never an
      // authentication, missing-payload or output-bound failure. Those must still
      // refuse and poison the session rather than laundering an invalid tail.
      if (slot.cancelled || signal.aborted) {
        flush(entry, request.sessionId);
        return { stopReason: "cancelled", ...(init.nativeExecution?.taskValidation ? {
          _meta: { "dev.agentmaturity.amc": { validation: projectNativeValidation(init.workspace, entry.session.readEvents()) } }
        } : {}) };
      }

      if (outcome === undefined) {
        flush(entry, request.sessionId, false);
        throw rejected;
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
      let reason: Parameters<typeof acpStopReasonFor>[0];
      try { reason = outcome.turnEndReason ?? turnEndOf(outcome.status); }
      catch (error) { flush(entry, request.sessionId, false); throw error; }
      const stopReason = acpStopReasonFor(reason);
      if (!ACP_STOP_REASONS.includes(stopReason)) {
        flush(entry, request.sessionId, false);
        throw new AcpFailure(ACP_ERROR.internal, "the native turn returned an unsupported ending");
      }
      flush(entry, request.sessionId);
      return {
        stopReason,
        // Turn completion and selected public checks are independent outcomes.
        ...(stopReasonIsLossy(reason) || init.nativeExecution?.taskValidation ? { _meta: { "dev.agentmaturity.amc": {
          ...(stopReasonIsLossy(reason) ? { turnEndReason: reason } : {}),
          ...(init.nativeExecution?.taskValidation ? { validation: outcome.validation } : {})
        } } } : {})
      };
    } finally {
      if (timer !== undefined) clearInterval(timer);
      signal.removeEventListener("abort", onAbort);
      entry.running = false;
      entry.active = undefined;
    }
  }

  function entryFor(params: unknown): Registered | undefined {
    const id = params !== null && typeof params === "object" && !Array.isArray(params)
      ? (params as { sessionId?: unknown }).sessionId : undefined;
    return typeof id === "string" ? sessions.get(id) : undefined;
  }

  function sessionIdentityReserved(sessionId: string): boolean {
    return sessions.has(sessionId) || loading.has(sessionId) || [...cleanupPending].some(session => session.sessionId === sessionId);
  }

  function cancelNotification(params: unknown): void {
    const entry = entryFor(params), slot = entry?.active;
    if (!initialized) { log("ignored session/cancel before initialize"); return; }
    const check = checkInitializedAcpShape("CancelNotification", params);
    if (!check.ok) { log(`ignored a malformed session/cancel: ${check.reason}`); return; }
    // Capture AND validate in the read turn; an idle cancel stays idle and an
    // accepted cancel is visible before any prompt settlement microtask runs.
    if (entry && slot && entry.active === slot) requestCancel(entry, slot, "acp-client");
  }

  function requestCancel(entry: Registered, slot: PromptSlot, by: string): void {
    if (entry.active !== slot || slot.cancelled) return;
    slot.cancelled = true;
    if (!slot.started) return;
    try { entry.session.cancel({ kind: "user" }, by); }
    catch {
      slot.cancelFailed = true;
      entry.projectionFailed = true;
      log("native ACP cancellation failed; the session is no longer reusable");
    }
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
    if (bytes > ACP_MAX_UPDATE_PARAMS_BYTES || entry.updateBytes + bytes > ACP_MAX_TURN_UPDATE_BYTES) throw new Error("ACP committed output exceeds its frame or turn bound.");
    entry.updateBytes += bytes;
    connection.notify("session/update", params);
  }

  async function require_(shape: Parameters<typeof checkAcpShape>[0], params: unknown): Promise<void> {
    const check = await checkAcpShape(shape, params);
    if (!check.ok) throw new AcpFailure(ACP_ERROR.invalidParams, check.reason);
  }
}

/** AMC's driver status, as the turn ending the stop-reason table expects. */
function turnEndOf(status: string): Parameters<typeof acpStopReasonFor>[0] {
  switch (status) {
    case "idle": return "complete";
    case "cancelled": return "cancelled";
    case "blocked": return "blocked";
    case "failed": return "error";
    default: throw new AcpFailure(ACP_ERROR.internal, "the native turn returned an unsupported driver status");
  }
}

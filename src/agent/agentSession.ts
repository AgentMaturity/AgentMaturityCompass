import { randomUUID } from "node:crypto";
import { AgentDriver } from "./agentDriver.js";
import { agentToolset, type AgentToolset } from "./agentToolset.js";
import type { NativeToolCapability } from "./nativeToolCapabilities.js";
import type { NativeValidationPlan, NativeValidationResult } from "./nativeValidation.js";
import { EMPTY_TOOL_SEAM, type AgentToolSeam } from "./toolSeam.js";
import type { AgentStatus } from "./loopTypes.js";
import { readAgentRunSummary } from "./runReport.js";
import type { LoopLlm, LoopRoute } from "./stepRunner.js";
import type { TurnCancelCause } from "../session/sessionTypes.js";
import type { EvidenceEvent } from "../types.js";
import { SessionService } from "../session/sessionService.js";
import { resumeSession } from "../session/sessionResume.js";
import type { RecoveryClaimant } from "../session/sessionRecovery.js";

/**
 * One AMC session, many prompts (plan P7.1a).
 *
 * WHY THIS EXISTS. `runComposedTurn` (../kernel/agentLoopRunner.ts) constructs a
 * `SessionService`, opens it, and closes it in its own `finally`. It takes no
 * session parameter, so a protocol server calling it once per incoming prompt
 * would mint a fresh session and a fresh hash chain every time: turn two would
 * not see turn one. Any surface that tells a client it holds a CONVERSATION --
 * ACP among them -- needs a session that outlives a single prompt, and there was
 * no composed entry point that offered one.
 *
 * IT IS DELIBERATELY KERNEL-FREE. `src/agent/` imports no `@amc/*` package, and
 * the architecture boundary permits Cordis only under `src/kernel/**`. That is
 * not a formality: `@amc/cordis` is a workspace package absent from the
 * published npm tarball, so anything routed through the kernel works only from a
 * repository checkout. A server an editor spawns from an installed `amc` cannot
 * live there. Every seam composed below -- toolset, driver, session, llm -- is
 * already outside the kernel, which is what makes this shippable.
 *
 * ONE PROMPT AT A TIME. `AgentDriver` is serial, and `whenIdle()` resolves when
 * the driver is idle rather than when a particular prompt finished. Two
 * overlapping prompts would therefore both observe the same idle edge and each
 * be handed the other's work. The slot is claimed synchronously, before the
 * first await, so two callers racing cannot both find it free.
 *
 * MODELLED ON `createDriverRunner` (./subagentRunner.ts), which already does all
 * of this for delegated children. The shape here is the same minus the delegation
 * accounting: same composition, same fresh-text cursor, same refusal to hand back
 * unsigned output.
 */

export interface AgentSessionInit {
  readonly workspace: string;
  /** Minted when absent, so a caller that has no id of its own need not invent one. */
  readonly sessionId?: string;
  readonly agentId: string;
  readonly makeLlm: (session: SessionService) => LoopLlm;
  readonly route: LoopRoute;
  readonly systemPrompt: string;
  readonly harnessVersion: string;
  readonly compositionDigest: string;
  readonly policyDigest: string;
  /** ACP explicitly defaults to none; existing direct callers retain workspace tools. */
  readonly tools?: "none" | "workspace";
  readonly expectedToolsDigest?: string;
  /** Server-composed, reviewed mounts; not a browser or wire-provided capability grant. */
  readonly additionalCapabilities?: readonly NativeToolCapability[];
  readonly maxSteps?: number;
  readonly validation?: NativeValidationPlan;
  /** Bind approvals/extensions to the real owning session and its existing pipeline. */
  readonly bindTools?: (context: { readonly session: SessionService; readonly toolset: AgentToolset | null }) => AgentToolSeam;
}

export type AgentPromptResult =
  | {
      readonly ok: true;
      /** Only what this prompt produced, never the whole conversation. */
      readonly text: string;
      readonly status: AgentStatus;
      readonly validation: NativeValidationResult;
    }
  | { readonly ok: false; readonly reason: string };

export interface AgentSession {
  readonly sessionId: string;
  /** Run one prompt to completion. Rejects a second while one is in flight. */
  prompt(text: string): Promise<AgentPromptResult>;
  cancel(cause: TurnCancelCause, by: string): void;
  /**
   * This session's committed rows.
   *
   * Exposed because the log is the only signed record of what a prompt did, so
   * a caller that must report progress reads rows rather than being handed a
   * second, unsigned narration of the same events.
   */
  readEvents(): readonly EvidenceEvent[];
  /** Seals the session. Safe to call more than once. */
  close(): void | Promise<void>;
  /** Explicit signed handoff at an idle boundary; ordinary close still seals. */
  release?(): void | Promise<void>;
}

export function openAgentSession(init: AgentSessionInit): AgentSession {
  return composeAgentSession(init);
}

/** Reattach only through the native signature, ownership and crash-recovery gates. */
export function resumeAgentSession(init: AgentSessionInit & { readonly sessionId: string; readonly claimant: RecoveryClaimant }): AgentSession {
  return composeAgentSession(init, init.claimant);
}

function composeAgentSession(init: AgentSessionInit, claimant?: RecoveryClaimant): AgentSession {
  if (init.tools !== undefined && init.tools !== "none" && init.tools !== "workspace") throw new Error("Unknown native tool mode.");
  if (init.expectedToolsDigest !== undefined && (init.tools !== "workspace" || !/^[a-f0-9]{64}$/.test(init.expectedToolsDigest))) throw new Error("A native tool policy pin requires explicit workspace tools and a SHA-256 digest.");
  if (init.maxSteps !== undefined && (!Number.isSafeInteger(init.maxSteps) || init.maxSteps < 1 || init.maxSteps > 1024)) throw new Error("Native maxSteps must be an integer from 1 through 1024.");
  const sessionId = init.sessionId ?? randomUUID();
  const session = claimant === undefined ? new SessionService(init.workspace) : resumeSession({
    workspace: init.workspace, sessionId, agentId: init.agentId,
    harnessVersion: init.harnessVersion, compositionDigest: init.compositionDigest,
    policyDigest: init.policyDigest, claimant
  }).service;
  // The toolset writes its tool evidence into THIS session rather than into
  // `agentToolset`'s default `toolset-<agentId>`, which nothing ever starts --
  // so a run that actually called a tool left rows referencing a session with no
  // row of its own, and `amc verify` reported "references missing session". Tool
  // evidence also simply belongs to the session whose turn caused it.
  const makeToolset = () => agentToolset({
    workspace: init.workspace,
    agentId: init.agentId,
    sessionId,
    ...(init.additionalCapabilities === undefined ? {} : { additionalCapabilities: init.additionalCapabilities }),
    ...(init.expectedToolsDigest === undefined ? {} : { expectedToolsDigest: init.expectedToolsDigest }),
    // Handing over the writer is what keeps the session ANCHORABLE. Pointing the
    // rows at the right session id was only half of it: written through the raw
    // ledger they carry no envelope, and `sessionRootDescriptor` then refuses to
    // anchor the session because its root would cover less than the session does.
    recorder: session
  });

  let closed = false;
  let running = false;
  let toolset: ReturnType<typeof agentToolset> | undefined;
  /**
   * How much assistant text the caller has already been told.
   *
   * `readAgentRunSummary` folds the WHOLE session, so without this cursor the
   * second prompt would return everything said so far -- the first answer quoted
   * back as though it were the new one.
   */
  let reported = 0;

  const finish = (release: boolean): void => {
    if (closed) return;
    if (running) throw new Error("Cancel and settle the active prompt before closing or releasing its session.");
    try {
      if (release) session.releaseWithoutClosing();
      else {
        if (driver?.status === "failed") throw new Error("Cannot seal a failed driver with incomplete evidence.");
        session.close({ reason: "completed" });
      }
    } catch (error) {
      session.disposeWithoutClosing();
      throw error;
    } finally {
      closed = true;
      toolset?.close();
    }
  };

  let driver!: AgentDriver;
  try {
    if (claimant !== undefined) reported = readAgentRunSummary(init.workspace, sessionId, "idle").assistantText.length;
    if (claimant === undefined) session.open({
      sessionId,
      agentId: init.agentId,
      harnessVersion: init.harnessVersion,
      compositionDigest: init.compositionDigest,
      policyDigest: init.policyDigest
    });
    toolset = init.tools === "none" ? undefined : makeToolset();
    const tools = init.bindTools?.({ session, toolset: toolset ?? null }) ?? toolset?.seam ?? EMPTY_TOOL_SEAM;
    const systemPromptEventId = session.recordSystemPrompt(init.systemPrompt).eventId;
    driver = new AgentDriver({
      session,
      llm: init.makeLlm(session),
      route: init.route,
      systemPromptEventId,
      tools,
      ...(init.validation === undefined ? {} : { validation: init.validation }),
      ...(init.maxSteps === undefined ? {} : { config: { maxStepsPerTurn: init.maxSteps } })
    });
  } catch (error) {
    // A half-composed session would otherwise be left open and unsealed, which
    // verification reports as an interrupted run that never actually started.
    try { finish(claimant !== undefined); } catch { /* retain the original composition error; evidence stays unsealed on failure */ }
    throw error;
  }

  return {
    sessionId,

    async prompt(text: string): Promise<AgentPromptResult> {
      if (closed) return { ok: false, reason: "session is closed" };
      // Claimed before any await. Checking after one would let two callers both
      // pass the check and then interleave on a serial driver.
      if (running) return { ok: false, reason: "a prompt is already running on this session" };
      running = true;
      try {
        driver.followup(text);
        await driver.whenIdle();

        const status = driver.status;
        const summary = readAgentRunSummary(init.workspace, sessionId, status);

        // `failed` is terminal: the spine refused a `turn/end` or `turn/seal`, so
        // the log has an open turn nothing may build on. The text may look
        // complete; the run it came from is not.
        if (status === "failed") {
          return { ok: false, reason: "driver failed; the session log has an open turn" };
        }
        // Output with no provenance is not output this surface will hand on:
        // quoting it to a client would launder it into whatever the client signs.
        if (summary.unsignedRows > 0) {
          return {
            ok: false,
            reason: `session wrote ${summary.unsignedRows} unsigned row(s); its output has no provenance`
          };
        }

        const fresh = summary.assistantText.slice(reported);
        reported = summary.assistantText.length;
        return { ok: true, text: fresh.join("\n"), status, validation: summary.validation };
      } finally {
        running = false;
      }
    },

    readEvents: () => session.readEvents(),

    cancel(cause: TurnCancelCause, by: string): void {
      // `keepInbox` so a cancelled prompt does not discard anything queued
      // behind it -- the caller cancelled one prompt, not the conversation.
      driver.cancel(cause, { by, keepInbox: true });
    },

    close: () => finish(false),
    release: () => finish(true)
  };
}

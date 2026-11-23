/**
 * The agent driver's pre-step (moved out of src/agent/agentDriver.ts unchanged, to keep that file within its line cap).
 *
 * The claim is DURABLE BEFORE the waterfall runs — dsh's ordering, kept — so a veto consumes the messages it was
 * handed. That loss is real, and AMC records it rather than hiding it: the `loop/veto` row names the vetoing party and
 * every message id the veto burned.
 */
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import type { LoopInbox } from "./inbox.js";
import type { InboxMessage, InboxTarget, LoopHooks, PreStepDecision } from "./loopTypes.js";
import { assertOrderedClaimDecision } from "./nativeOrderedMessage.js";
import { assertAudioClaimDecision } from "./nativeAudioMessage.js";

/** A pre-step that decided to enter, with the batch it decided to enter with. */
type PreparedStep = Extract<PreStepDecision, { kind: "enter" }>;

/** Claim a batch, then let listeners decide whether the step is entered. `vetoRow` is the `loop/veto` row of a rejection. */
export async function claimAndDecide(owner: { readonly inbox: LoopInbox; readonly hooks: LoopHooks; readonly session: SessionService },
  target: InboxTarget, turn: number, step: number, signal: AbortSignal): Promise<{ readonly decision: PreStepDecision; readonly vetoRow: SessionEventRef | null }> {
  const { inbox, hooks, session } = owner;
  const claimed: readonly InboxMessage[] = inbox.claim(target);
  // A hook may mutate the batch array, but cannot erase the captured v2 claims.
  const orderedClaims = claimed.filter(message => message.parts !== undefined);
  const audioClaims = claimed.filter(message => message.audioParts !== undefined);
  const decision = await hooks.preStep(
    { turn, step, target, messages: claimed, signal, contextSession: Object.freeze({
      sessionId: session.sessionId, workspace: session.workspace,
      readEvents: () => session.readEvents(),
      recordProjectedEvidence: session.recordProjectedEvidence.bind(session)
    }) },
    (): Promise<PreparedStep> => Promise.resolve({ kind: "enter", messages: claimed })
  );
  signal.throwIfAborted();
  let vetoRow: SessionEventRef | null = null;
  if (decision.kind === "reject") {
    vetoRow = session.recordLoopEvent({
      kind: "veto",
      turn,
      step,
      by: decision.by,
      claimedMessageIds: claimed.map((message) => message.messageId)
    });
  }
  if (decision.kind === "enter") assertOrderedClaimDecision(orderedClaims, decision.messages);
  if (decision.kind === "enter") assertAudioClaimDecision(audioClaims, decision.messages);
  return { decision, vetoRow };
}

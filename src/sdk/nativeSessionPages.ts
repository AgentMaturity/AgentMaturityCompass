import { z } from "zod";
import { parseNativeValidationResult } from "../agent/nativeValidationResult.js";
import type { AcpSessionUpdatePage } from "../acp/acpSessionUpdatePage.js";
import { AMCNativeCancelledError, AMCNativeInputError, AMCNativeProtocolError } from "./nativeAgentErrors.js";
import { freezeJson, object, UPDATE_KINDS, validPlanUpdate } from "./nativeWire.js";

/** A bounded snapshot of committed updates; a read never claims a session writer. @public */
export type AMCNativeSessionPage = AcpSessionUpdatePage;
/** @public */
export interface AMCNativeReadPageOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export const SESSION_PAGE_FORMAT = "amc-session-event-page-v1";
export const COMMITTED_TURN_FORMAT = "amc-committed-turn-v1";
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const cursor = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 2048;
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value);
const sequence = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function sessionPageParams(sessionId: string, options: AMCNativeReadPageOptions = {}): Record<string, unknown> {
  if (!identity(sessionId) || !object(options) || (options.cursor !== undefined && !cursor(options.cursor))
    || (options.limit !== undefined && (!sequence(options.limit) || options.limit < 1 || options.limit > 256))) {
    throw new AMCNativeInputError("Session pages require an exact session ID, a bounded cursor and a limit from 1 through 256");
  }
  return { sessionId, ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.limit === undefined ? {} : { limit: options.limit }) };
}

const count = z.number().int().nonnegative(), nullableCount = count.nullable(), ratio = z.number().min(0).max(1).nullable();
const metric = z.object({ observedTokens: nullableCount, reportedRequests: count });
const usage = z.object({ scope: z.literal("recorded-session"), status: z.enum(["recorded", "partial", "unavailable", "invalid"]),
  requests: count, syntheticRequests: count, reportedRequests: count, completeRequests: count,
  unreportedRequests: count, pendingRequests: count, issueCount: count,
  totals: z.object({ inputTokens: metric, outputTokens: metric, cacheReadTokens: metric, cacheWriteTokens: metric, reasoningTokens: metric }),
  cache: z.object({ basis: z.literal("reported-input-token-subtotal"), readShare: ratio, readTokens: nullableCount,
    inputTokens: nullableCount, eligibleRequests: count, excludedRequests: count, unreportedWriteRequests: count }),
  requestCache: z.object({ basis: z.literal("completed-requests-with-reported-cache-read"), hitRequests: count,
    eligibleRequests: count, excludedRequests: count, hitRate: ratio }).optional() });
const end = z.object({ turn: count.min(1), reason: z.enum(["complete", "cancelled", "error", "interrupted", "max_steps", "max_tokens", "blocked"]),
  interrupted: z.boolean(), cancelCause: z.union([z.null(), z.object({ kind: z.enum(["user", "parent", "disposed"]) }),
    z.object({ kind: z.literal("hook"), reason: z.string() })]) })
  .refine(value => value.interrupted === (value.reason === "interrupted") && (value.reason === "cancelled") === (value.cancelCause !== null));
const committedTurn = z.object({ turn: count.min(1), seq: count, eventId: z.string().min(1).max(1024).regex(/^[^\x00-\x1f\x7f]+$/),
  eventHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type CommittedTurnReference = z.infer<typeof committedTurn>;
const pageState = z.object({ validation: z.custom(value => parseNativeValidationResult(value) !== null), usage,
  turn: z.object({ number: count.min(1).nullable(), lastEnd: end.nullable(), lastSeal: committedTurn.nullable(), cancellationRequested: z.boolean() }),
  approvals: z.object({ pending: count, answered: count, denied: count, unavailable: count }),
  toolOutcomes: z.object({ unknown: count, unavailable: count }) });
const verification = z.object({ metadata: z.literal("hashes-signatures-global-and-session-chains"), checkedStoreEventCount: count.min(1),
  payloads: z.enum(["not-read", "verified"]), retainedOutput: z.literal("not-read"),
  completeness: z.literal("all-available-events-in-requested-scope"), rollbackProtection: z.enum(["expected-head-matched", "no-external-head"]),
  trustRoot: z.object({ anchored: z.boolean(), monitorFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable() })
    .refine(root => !root.anchored || root.expectedFingerprint === root.monitorFingerprint) });

/** Protocol admission, not an independent verifier receipt: the selected native runtime authenticates these rows. */
export function admitSessionUpdatePage(value: unknown, sessionId: string, agentId: string): AMCNativeSessionPage {
  const refuse = (): never => { throw new AMCNativeProtocolError("native runtime returned an inconsistent committed session page"); };
  if (!object(value) || value.format !== SESSION_PAGE_FORMAT || value.sessionId !== sessionId || value.agentId !== agentId
    || value.committed !== true || !["sqlite", "jsonl", "postgres"].includes(value.backend as string)
    || !digest(value.headEventHash) || !digest(value.storeHeadEventHash) || !sequence(value.headSeq)
    || !sequence(value.firstSeq) || !sequence(value.nextSeq) || value.firstSeq > value.nextSeq || value.nextSeq > value.headSeq + 1
    || value.nextSeq - value.firstSeq > 256 || !(value.nextCursor === null || cursor(value.nextCursor))
    || (value.nextCursor === null) !== (value.nextSeq === value.headSeq + 1) || !cursor(value.resumeCursor)
    || typeof value.sealed !== "boolean" || !verification.safeParse(value.verification).success || !pageState.safeParse(value.state).success
    || !Array.isArray(value.updates) || value.updates.length > 256) return refuse();
  let previous = value.firstSeq - 1;
  for (const event of value.updates) {
    if (!object(event) || !sequence(event.seq) || event.seq <= previous || event.seq >= value.nextSeq
      || !identity(event.eventId) || !digest(event.eventHash) || !object(event.update)
      || typeof event.update.sessionUpdate !== "string" || !UPDATE_KINDS.has(event.update.sessionUpdate)) return refuse();
    const update = event.update;
    if (update.sessionUpdate === "plan" && !validPlanUpdate(update)) return refuse();
    if (update.sessionUpdate === "agent_message_chunk" || update.sessionUpdate === "user_message_chunk") {
      if (!object(update.content) || (update.content.type === "text" ? typeof update.content.text !== "string"
        : update.sessionUpdate !== "user_message_chunk" || !["image", "audio"].includes(update.content.type as string)
          || typeof update.content.data !== "string" || typeof update.content.mimeType !== "string")) return refuse();
    }
    if (["tool_call", "tool_call_update"].includes(update.sessionUpdate as string)
      && (!identity(update.toolCallId) || (update.status !== undefined && !["pending", "in_progress", "completed", "failed"].includes(update.status as string)))) return refuse();
    previous = event.seq;
  }
  return freezeJson(value as unknown as AMCNativeSessionPage);
}


export async function* iterateSessionPages(read: (options: AMCNativeReadPageOptions) => Promise<AMCNativeSessionPage>,
  options: AMCNativeReadPageOptions = {}): AsyncIterableIterator<AMCNativeSessionPage> {
  let cursor = options.cursor, previous: AMCNativeSessionPage | undefined;
  do {
    const page = await read({ ...options, ...(cursor === undefined ? {} : { cursor }) });
    if (previous && (page.headEventHash !== previous.headEventHash || page.headSeq !== previous.headSeq || page.firstSeq !== previous.nextSeq)) {
      throw new AMCNativeProtocolError("native session snapshot changed during paged iteration");
    }
    if (page.nextCursor !== null && (page.nextCursor === cursor || page.nextSeq <= page.firstSeq)) {
      throw new AMCNativeProtocolError("native session page cursor did not advance");
    }
    yield page;
    previous = page; cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
}

export function committedTurnFromResult(result: Record<string, unknown>, beforeHead: number, beforeTurn: number): CommittedTurnReference {
  const meta = object(result._meta) ? result._meta["dev.agentmaturity.amc"] : undefined;
  const parsed = committedTurn.safeParse(object(meta) ? meta.committedTurn : undefined);
  if (!parsed.success || parsed.data.seq <= beforeHead || parsed.data.turn <= beforeTurn) {
    throw new AMCNativeProtocolError("native prompt returned a missing, invalid or prior committed turn reference");
  }
  return parsed.data;
}

export function assertRecoveryPage(page: AMCNativeSessionPage, reference: CommittedTurnReference, beforeHead: number, first: boolean): void {
  const ending = page.state.turn, seal = ending.lastSeal;
  if (!seal || seal.turn !== reference.turn || seal.seq !== reference.seq || seal.eventId !== reference.eventId || seal.eventHash !== reference.eventHash
    || ending.number !== reference.turn || ending.lastEnd?.turn !== reference.turn || page.headSeq < reference.seq
    || (first && page.firstSeq !== beforeHead + 1)) {
    throw new AMCNativeProtocolError("committed recovery does not contain this prompt's exact completed turn seal");
  }
}

export function remainingTurnBudget(deadline: number, cancelled: boolean): number {
  if (cancelled) throw new AMCNativeCancelledError("committed recovery cancelled before completion");
  const remaining = Math.ceil(deadline - performance.now());
  if (remaining <= 0) throw new AMCNativeProtocolError("committed recovery exceeded the total prompt deadline");
  return remaining;
}

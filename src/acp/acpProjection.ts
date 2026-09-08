import { UNSIGNED } from "../agent/runReport.js";
import { readEventPayload } from "../session/eventPayload.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

/**
 * Turning signed session rows into ACP `session/update` notifications
 * (plan P7.1a).
 *
 * THERE IS NO TOKEN STREAMING HERE, AND THERE CANNOT BE IN THIS SLICE.
 * `StreamRecorder.recordBlocks` writes one row per COMPLETED block of a
 * COMPLETED model response, and rows are the only signed artifact AMC has. So
 * the smallest unit of assistant text this projection can honestly emit is a
 * whole block. A per-token ACP stream would have to be read off the raw provider
 * stream, bypassing the ledger -- which is precisely the unsigned side channel
 * the recorder exists to close. A client watching in an editor therefore sees
 * text arrive in block-sized pieces, not character by character, and sees them
 * when the turn's rows have been written rather than as the model speaks.
 *
 * That is a real limitation of this slice and it is stated rather than dressed
 * up: ACP's `PromptResponse` carries no content field, so ALL content reaches
 * the client through these notifications.
 *
 * A ROW WITHOUT PROVENANCE IS NOT PROJECTED. An unsigned row is content AMC
 * cannot vouch for, and handing it to a client that will render it as the
 * agent's own words would launder it. Such rows are skipped and counted, and the
 * count is reported so a caller can refuse the whole turn rather than quietly
 * showing less than happened.
 */



export interface AcpSessionUpdate {
  readonly sessionUpdate: string;
  readonly [field: string]: unknown;
}

export interface ProjectedUpdates {
  readonly updates: readonly AcpSessionUpdate[];
  /** How many rows were skipped for having no signature. */
  readonly unsigned: number;
}

/**
 * Project the rows a prompt produced.
 *
 * The caller passes the whole session's rows and the count it has already
 * projected; only the tail is turned into updates. Without that cursor a second
 * prompt would re-send the first prompt's entire output, which a client renders
 * as the agent repeating itself.
 */
export function projectSessionUpdates(
  workspace: string,
  events: readonly EvidenceEvent[],
  from: number,
  options: { readonly includeUser?: boolean } = {}
): ProjectedUpdates {
  const updates: AcpSessionUpdate[] = [];
  let unsigned = 0;

  for (const event of events.slice(from)) {
    // `UNSIGNED` is IMPORTED, not restated. This file declared its own
    // `"UNSIGNED"` while the ledger writes `"unsigned"`, so this comparison
    // matched nothing and the guard could not fire -- under the docstring above
    // asserting that unprovenanced rows are never projected. A guard that cannot
    // fail is worse than no guard, because it reads as protection.
    if (event.writer_sig === UNSIGNED) {
      unsigned += 1;
      continue;
    }
    if (options.includeUser && (event.event_type === "user/message" || event.event_type === "tool/result"
      || (event.event_type === "assistant/block" && metaOf(event)["blockKind"] === "text"))
      && readEventPayload(workspace, event).status !== "ok") {
      throw new Error("Session history payload is unavailable; cannot faithfully replay the conversation.");
    }
    const update = options.includeUser && event.event_type === "user/message"
      ? userUpdate(workspace, event) : updateFor(workspace, event);
    if (update) updates.push(update);
  }

  return { updates, unsigned };
}

function userUpdate(workspace: string, event: EvidenceEvent): AcpSessionUpdate | null {
  const text = payloadText(workspace, event);
  return text === null ? null : { sessionUpdate: "user_message_chunk", content: { type: "text", text } };
}

function updateFor(workspace: string, event: EvidenceEvent): AcpSessionUpdate | null {
  const meta = metaOf(event);

  if (event.event_type === "assistant/block") {
    // Only text blocks become message chunks. A tool_use block is reported
    // through `tool/call` below, and emitting both would show the same action
    // twice.
    if (meta["blockKind"] !== "text") return null;
    const text = payloadText(workspace, event);
    if (text === null) return null;
    return { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
  }

  if (event.event_type === "tool/call") {
    const toolCallId = meta["toolCallId"];
    if (typeof toolCallId !== "string") return null;
    return {
      sessionUpdate: "tool_call",
      toolCallId,
      title: typeof meta["toolName"] === "string" ? meta["toolName"] : "tool",
      // `pending` rather than `in_progress`: the row records that the call was
      // decided on, and the ledger has no separate "started" moment to read.
      status: "pending",
      kind: "other"
    };
  }

  if (event.event_type === "tool/result") {
    const toolCallId = meta["toolCallId"];
    if (typeof toolCallId !== "string") return null;
    const text = payloadText(workspace, event);
    return {
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: meta["outcome"] === "OK" ? "completed" : "failed",
      ...(text === null ? {} : { content: [{ type: "content", content: { type: "text", text } }] })
    };
  }

  return null;
}

function metaOf(event: EvidenceEvent): Record<string, unknown> {
  try {
    return JSON.parse(event.meta_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * The row's payload as text, or null when it cannot be read.
 *
 * A payload that was pruned, archived or spilled is NOT rendered as a
 * placeholder string the way `readAgentRunSummary` does for a human-facing
 * report. A client would display that placeholder as the agent's words; saying
 * nothing is better than putting `[amc:payload missing]` in a chat transcript.
 */
function payloadText(workspace: string, event: EvidenceEvent): string | null {
  const payload = readEventPayload(workspace, event);
  if (payload.status !== "ok") return null;
  if (sha256Hex(payload.bytes) !== event.payload_sha256) throw new Error("ACP payload does not match its committed digest.");
  return payload.bytes.toString("utf8");
}

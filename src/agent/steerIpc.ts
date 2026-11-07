/**
 * Steer, queue and withdraw over Node IPC (SH-LOOP-02): the run side of
 * `amc agent-loop run --interactive-steer`.
 *
 * A parent that spawned the run with an IPC channel (native chat, or any host
 * using `child_process.fork`) sends frames; the run answers each one with a
 * receipt. Frames are untrusted input and are validated like the ask_user and
 * approval frames: a bounded text, a known lane, a well-formed message id. A
 * frame that fails validation is refused with a reason and nothing enters the
 * inbox. Text that is accepted enters the SAME durable inbox a `--steer` flag or
 * a chat line uses: it is a `loop/inbox` row with origin `steer` or `followup`,
 * never a privileged path. It is user-origin because it comes from the parent
 * process the operator is typing into; it is still data, never authority.
 *
 * The listener is explicit (`--interactive-steer`) rather than implied by
 * `process.connected`, matching `--interactive-approvals`, and it is removed when
 * the turn ends so an IPC channel never keeps the child alive.
 */
import type { InboxReceipt } from "./loopTypes.js";

export const STEER_FRAME = "amc/native-steer";
export const WITHDRAW_FRAME = "amc/native-withdraw";
export const INBOX_RECEIPT_FRAME = "amc/native-inbox-receipt";

/** Larger text is still accepted by the inbox (it spills); this bounds what one IPC frame may carry. */
export const MAX_STEER_FRAME_BYTES = 256 * 1024;
const MESSAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface SteerFrame { readonly type: typeof STEER_FRAME; readonly v: 1; readonly lane: "next-step" | "next-turn"; readonly text: string; readonly clientRequestId?: string }
export interface WithdrawFrame { readonly type: typeof WITHDRAW_FRAME; readonly v: 1; readonly messageId: string }

export type InboxReceiptFrame =
  | { readonly type: typeof INBOX_RECEIPT_FRAME; readonly v: 1; readonly ok: true; readonly frame: "steer"; readonly receipt: InboxReceipt; readonly clientRequestId?: string }
  | { readonly type: typeof INBOX_RECEIPT_FRAME; readonly v: 1; readonly ok: true; readonly frame: "withdraw"; readonly messageId: string; readonly withdrawn: boolean }
  | { readonly type: typeof INBOX_RECEIPT_FRAME; readonly v: 1; readonly ok: false; readonly frame: "steer" | "withdraw"; readonly refused: string; readonly clientRequestId?: string };

/** What a listener needs from the composed turn handle. */
export interface SteerTarget {
  steer(text: string, clientRequestId?: string): InboxReceipt;
  queue(text: string, clientRequestId?: string): InboxReceipt;
  withdraw(messageId: string): boolean;
}

function record(value: unknown, type: string): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && (value as { type?: unknown }).type === type && (value as { v?: unknown }).v === 1
    ? value as Record<string, unknown> : null;
}

/** Validate one steer frame: the exact shape, or the reason it is refused. */
export function parseSteerFrame(value: unknown): { ok: true; frame: SteerFrame } | { ok: false; refused: string; clientRequestId?: string } | null {
  const raw = record(value, STEER_FRAME);
  if (raw === null) return null;
  const clientRequestId = typeof raw.clientRequestId === "string" && CLIENT_REQUEST_ID.test(raw.clientRequestId) ? raw.clientRequestId : undefined;
  if (raw.clientRequestId !== undefined && clientRequestId === undefined) return { ok: false, refused: "clientRequestId must be 1-128 characters of [A-Za-z0-9._:-]" };
  if (raw.lane !== "next-step" && raw.lane !== "next-turn") return { ok: false, refused: "lane must be next-step or next-turn", ...(clientRequestId === undefined ? {} : { clientRequestId }) };
  if (typeof raw.text !== "string" || raw.text.trim() === "") return { ok: false, refused: "text must be a non-empty string", ...(clientRequestId === undefined ? {} : { clientRequestId }) };
  if (Buffer.byteLength(raw.text, "utf8") > MAX_STEER_FRAME_BYTES) return { ok: false, refused: `text exceeds ${MAX_STEER_FRAME_BYTES} bytes`, ...(clientRequestId === undefined ? {} : { clientRequestId }) };
  return { ok: true, frame: { type: STEER_FRAME, v: 1, lane: raw.lane, text: raw.text, ...(clientRequestId === undefined ? {} : { clientRequestId }) } };
}

export function parseWithdrawFrame(value: unknown): { ok: true; frame: WithdrawFrame } | { ok: false; refused: string } | null {
  const raw = record(value, WITHDRAW_FRAME);
  if (raw === null) return null;
  if (typeof raw.messageId !== "string" || !MESSAGE_ID.test(raw.messageId)) return { ok: false, refused: "messageId must be 1-128 characters of [A-Za-z0-9._:-]" };
  return { ok: true, frame: { type: WITHDRAW_FRAME, v: 1, messageId: raw.messageId } };
}

/** Apply one validated frame to the handle; the answer is what the parent is told. */
export function answerSteerFrame(target: SteerTarget, value: unknown): InboxReceiptFrame | null {
  const steer = parseSteerFrame(value);
  if (steer !== null) {
    if (!steer.ok) return { type: INBOX_RECEIPT_FRAME, v: 1, ok: false, frame: "steer", refused: steer.refused, ...(steer.clientRequestId === undefined ? {} : { clientRequestId: steer.clientRequestId }) };
    const { lane, text, clientRequestId } = steer.frame;
    try {
      const receipt = lane === "next-step" ? target.steer(text, clientRequestId) : target.queue(text, clientRequestId);
      return { type: INBOX_RECEIPT_FRAME, v: 1, ok: true, frame: "steer", receipt, ...(clientRequestId === undefined ? {} : { clientRequestId }) };
    } catch (error) {
      // A disposed or failed driver refuses admission; the parent hears the refusal, nothing is queued.
      return { type: INBOX_RECEIPT_FRAME, v: 1, ok: false, frame: "steer", refused: error instanceof Error ? error.message : "the run refused the message", ...(clientRequestId === undefined ? {} : { clientRequestId }) };
    }
  }
  const withdraw = parseWithdrawFrame(value);
  if (withdraw === null) return null;
  if (!withdraw.ok) return { type: INBOX_RECEIPT_FRAME, v: 1, ok: false, frame: "withdraw", refused: withdraw.refused };
  try { return { type: INBOX_RECEIPT_FRAME, v: 1, ok: true, frame: "withdraw", messageId: withdraw.frame.messageId, withdrawn: target.withdraw(withdraw.frame.messageId) }; }
  catch (error) { return { type: INBOX_RECEIPT_FRAME, v: 1, ok: false, frame: "withdraw", refused: error instanceof Error ? error.message : "the run refused the withdrawal" }; }
}

/** Child side: answer steer/withdraw frames from the parent until disposed. Returns the disposer. */
export function listenForSteerFrames(target: SteerTarget, channel: { send(frame: InboxReceiptFrame): void; on(event: "message", listener: (value: unknown) => void): unknown; removeListener(event: "message", listener: (value: unknown) => void): unknown }): () => void {
  const onMessage = (value: unknown): void => {
    const answer = answerSteerFrame(target, value);
    if (answer === null) return; // another feature's frame (approvals, ask_user)
    try { channel.send(answer); } catch { /* the parent is gone; the inbox row, if any, stands */ }
  };
  channel.on("message", onMessage);
  return () => { channel.removeListener("message", onMessage); };
}

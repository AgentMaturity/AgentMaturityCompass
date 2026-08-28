import { NdjsonFramer } from "../wire/ndjsonFraming.js";
import { parseWireObject } from "../wire/wireJson.js";
import {
  acpFailure,
  acpNotification,
  acpResult,
  classifyAcpMessage,
  type AcpErrorObject,
  type AcpId
} from "./acpEnvelope.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";

/**
 * A bidirectional ACP peer over a byte stream (plan P7.1a).
 *
 * THE ONE RULE: NOTHING ON THE READ PATH IS AWAITED. `ingest` is synchronous and
 * returns void; a request handler is LAUNCHED, never awaited. This is not a
 * performance choice, it is the difference between working and deadlocking.
 *
 * ACP lets a client send `session/cancel` while `session/prompt` is still
 * running -- indeed that is the only way to stop a turn. If reading the next
 * message waited on the current handler, the cancel could not arrive until the
 * prompt it cancels had finished, which is never. The naive fix (make `ingest`
 * async and await it) looks correct and does not fix it: awaiting inside a
 * `data` listener does not stop Node reading, but a prompt and a later cancel
 * that arrive in ONE pipe read would still be parsed in sequence, so the cancel
 * would not even be seen until the prompt resolved. Both failures are
 * load-dependent and invisible to a single-message test.
 *
 * EXACTLY ONCE, BY HAND. A dispatcher that answers each line as it reads it gets
 * one-reply-per-request for free (`../wire/wireDispatcher.ts` does). Once a
 * handler is launched rather than awaited it can settle from more than one place
 * -- resolve, throw, or be cancelled -- so the guarantee has to be rebuilt: an
 * id is recorded when the request is accepted and cleared when it is answered,
 * and a second answer is dropped rather than written.
 *
 * OUTBOUND REQUESTS EXIST BUT ARE UNUSED IN THIS SLICE. The correlation table is
 * here because `session/request_permission` is the obvious next method and
 * retrofitting it would mean restructuring the connection rather than adding a
 * handler. A response to an id nothing is waiting for is IGNORED, never
 * answered: answering a response is how two peers get into a loop.
 */

/** Where the frames go. Injected so the connection owns no transport. */
export type AcpSink = (frame: Buffer) => void;

export interface AcpHandlers {
  /** Answers a request. Throwing produces an error response. */
  readonly request: (method: string, params: unknown, signal: AbortSignal) => Promise<unknown>;
  /** Handles a notification. Must be synchronous and must not throw usefully. */
  readonly notification: (method: string, params: unknown) => void;
}

export interface AcpConnectionInit {
  readonly write: AcpSink;
  readonly handlers: AcpHandlers;
  /** Diagnostics. Never the peer's bytes -- they can forge lines in a log. */
  readonly log?: (message: string) => void;
  /** Called once when the stream becomes unusable. */
  readonly onUnusable?: (reason: string) => void;
}

interface InFlight {
  answered: boolean;
  readonly controller: AbortController;
}

export interface AcpConnection {
  /** Feed bytes. Synchronous, and never throws. */
  ingest(chunk: Buffer): void;
  /** Send a notification to the client. */
  notify(method: string, params: unknown): void;
  /** Abort the in-flight request with this id, if there is one. */
  abortInbound(id: AcpId): boolean;
  /** Whether a request with this id is still running. */
  isInFlight(id: AcpId): boolean;
  /** Stop accepting and emitting. */
  close(): void;
}

export function createAcpConnection(init: AcpConnectionInit): AcpConnection {
  const framer = new NdjsonFramer();
  const inbound = new Map<string, InFlight>();
  const log = init.log ?? ((): void => undefined);
  let usable = true;

  // Ids are compared as strings so that the number 1 and the string "1" cannot
  // collide in the table while still being echoed back with their own type.
  const key = (id: AcpId): string => `${typeof id}:${String(id)}`;

  const unusable = (reason: string): void => {
    if (!usable) return;
    usable = false;
    log(reason);
    init.onUnusable?.(reason);
  };

  const settle = (id: AcpId, outcome: { result: unknown } | { error: AcpErrorObject }): void => {
    const entry = inbound.get(key(id));
    if (!entry || entry.answered) {
      // Dropped rather than written. Two answers to one id is a protocol
      // violation by US, and the client would correlate the second to nothing.
      log(`dropped a second answer for request ${String(id)}`);
      return;
    }
    entry.answered = true;
    inbound.delete(key(id));
    if (!usable) return;
    init.write("error" in outcome ? acpFailure(id, outcome.error) : acpResult(id, outcome.result));
  };

  return {
    ingest(chunk: Buffer): void {
      if (!usable) return;
      const framed = framer.push(chunk);

      for (const line of framed.lines) {
        const parsed = parseWireObject(line.bytes, line.ordinal);
        if (!parsed.ok) {
          // Byte-level faults are not addressed to a request and the stream may
          // be desynchronised, so nothing is written back.
          unusable(`unreadable message: ${parsed.reason}`);
          return;
        }
        route(parsed.value);
      }

      if (framed.refusal) unusable(`unframeable message: ${framed.refusal.reason}`);
    },

    notify(method: string, params: unknown): void {
      if (!usable) return;
      init.write(acpNotification(method, params));
    },

    abortInbound(id: AcpId): boolean {
      const entry = inbound.get(key(id));
      if (!entry || entry.answered) return false;
      // The entry is deliberately NOT removed. The request must still be
      // answered -- a cancelled prompt returns `stopReason: "cancelled"`, and
      // dropping the id here would leave the client waiting forever.
      entry.controller.abort();
      return true;
    },

    isInFlight: (id: AcpId): boolean => {
      const entry = inbound.get(key(id));
      return entry !== undefined && !entry.answered;
    },

    close(): void {
      usable = false;
      for (const entry of inbound.values()) entry.controller.abort();
      inbound.clear();
    }
  };

  function route(value: Record<string, unknown>): void {
    const message = classifyAcpMessage(value);

    switch (message.kind) {
      case "malformed": {
        // Answerable only if it carried a usable id. A malformed frame with no
        // id has nothing to address, and inventing one would be worse.
        if (message.id !== null) {
          init.write(acpFailure(message.id, {
            code: ACP_ERROR.invalidRequest,
            message: message.reason
          }));
        } else {
          log(`ignored a malformed message: ${message.reason}`);
        }
        return;
      }

      case "response":
      case "response-error": {
        // Nothing outbound is issued in this slice, so any response is
        // unsolicited. Ignored, never answered.
        log(`ignored a response to id ${String(message.id)}, which nothing requested`);
        return;
      }

      case "notification": {
        try {
          init.handlers.notification(message.method, message.params);
        } catch (error) {
          // A notification has no reply, so a throwing handler can only be
          // reported. Swallowing it silently would hide a real fault.
          log(`notification ${message.method} threw: ${messageOf(error)}`);
        }
        return;
      }

      case "request": {
        if (inbound.has(key(message.id))) {
          init.write(acpFailure(message.id, {
            code: ACP_ERROR.invalidRequest,
            message: "a request with this id is already in flight"
          }));
          return;
        }
        const entry: InFlight = { answered: false, controller: new AbortController() };
        inbound.set(key(message.id), entry);
        // Launched, NOT awaited. See the module note.
        void init.handlers
          .request(message.method, message.params, entry.controller.signal)
          .then((result) => settle(message.id, { result }))
          .catch((error: unknown) => {
            // Logged HERE because this is the last place the real reason exists:
            // `toAcpError` deliberately drops an unplanned exception's message
            // before it reaches the peer, and its note said the detail went to
            // the log while nothing on this path logged anything. A missing
            // vault passphrase reached a client as "the method failed" with
            // zero bytes on stderr, which is undiagnosable from either side.
            if (!(error instanceof AcpFailure)) {
              log(`${message.method} failed: ${messageOf(error)}`);
            }
            settle(message.id, { error: toAcpError(error) });
          });
        return;
      }
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turn a thrown value into an error object.
 *
 * An `AcpFailure` carries a code it chose; anything else is an internal fault
 * and is reported as one WITHOUT its message, which may name paths inside this
 * process. The detail goes to the log, not to the peer.
 */
function toAcpError(error: unknown): AcpErrorObject {
  if (error !== null && typeof error === "object" && "acpCode" in error) {
    const failure = error as { acpCode: number; message: string; acpData?: unknown };
    return failure.acpData === undefined
      ? { code: failure.acpCode, message: failure.message }
      : { code: failure.acpCode, message: failure.message, data: failure.acpData };
  }
  return { code: ACP_ERROR.internal, message: "the method failed" };
}

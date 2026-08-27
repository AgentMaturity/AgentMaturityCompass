import { connect, type Socket } from "node:net";
import { NdjsonFramer } from "./ndjsonFraming.js";
import { parseWireObject } from "./wireJson.js";
import { readEnumField, readStringFields, readWireReply } from "./wireReply.js";

/**
 * A TypeScript client for the wire (plan P7.1a).
 *
 * THE SAME RULES APPLY IN BOTH DIRECTIONS. Replies are framed by the same
 * `NdjsonFramer`, validated by the same `parseWireObject`, and checked against an
 * envelope as strict as the one the server applies to requests (./wireReply.ts).
 * That is not symmetry for its own sake: the thing on the other end of a socket
 * is not automatically AMC, and a duplicate key in a REPLY is the same ambiguity
 * as one in a request.
 *
 * WHAT ARRIVING PROVES: nothing. A receipt returned over this socket is bytes
 * that came out of a pipe. Its trust comes from `describeAcceptedWork` checking
 * it against the ledger. This client deliberately does not verify on the caller's
 * behalf, because doing so needs the workspace and would let a caller believe
 * transport and attestation were the same thing.
 *
 * A LATE REPLY IS NOT A FORGERY. When a call passes its deadline its id moves to
 * `abandoned` rather than being simply forgotten, and a reply that then arrives
 * is discarded quietly, because a server that answered slowly did nothing wrong.
 * Treating it as an unknown id used to `fail()` the whole connection: one slow
 * call rejected every other in-flight request and bricked the client for good --
 * inverting the purpose of a per-request deadline, which exists so that one slow
 * call can be abandoned and the rest continue. A server that never replies was
 * always handled correctly; a merely SLOW one, which is what a deadline is for,
 * was what killed the client.
 *
 * A NULL-ID REPLY IS THE SERVER'S DIAGNOSTIC, NOT GARBAGE. The dispatcher answers
 * framing and parse faults with a null id, since a record it could not delimit
 * has no id to quote back. It is surfaced with the server's message attached. It
 * used to be read as an unknown id, so AMC's own server bricked AMC's own client
 * and threw away the one message explaining why.
 *
 * NOTHING WAITS FOREVER, INCLUDING `close()`. Every call has a deadline; a closed
 * socket rejects everything pending; and close() falls back to `destroy()` on its
 * own timer, because `end()` only half-closes and a peer that never closes its
 * side would otherwise leave the caller hanging.
 */

export const DEFAULT_WIRE_REQUEST_TIMEOUT_MS = 30_000;

/** How long `close()` waits for a graceful FIN before destroying the socket. */
export const WIRE_CLOSE_GRACE_MS = 2_000;

/**
 * How many unwritten bytes may queue before calls are refused.
 *
 * Node buffers without bound when a peer does not read, and those bytes are
 * retained even after every request that produced them has been abandoned: 30
 * timed-out calls were measured holding 30 MB. Refusing is the same fail-closed
 * choice the listener makes with its connection cap.
 */
export const MAX_WIRE_CLIENT_QUEUE_BYTES = 1_048_576;

/** A refusal from the far end, carrying the JSON-RPC code it was refused with. */
export class WireRequestError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "WireRequestError";
    this.code = code;
  }
}

/** The connection failed, or the far end broke the protocol. */
export class WireTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireTransportError";
  }
}

export interface WireClientInit {
  readonly socketPath: string;
  /** Presented with every message, because the server authenticates every message. */
  readonly lease: string;
  readonly requestTimeoutMs?: number;
}

export interface AcceptedWorkHandle {
  readonly workSessionId: string;
  readonly receipt: string;
  readonly receiptId: string;
  readonly requestSha256: string;
}

export const WORK_STATES = ["not-started", "running", "abandoned", "finished"] as const;

export interface DescribedWorkHandle {
  readonly workSessionId: string;
  /** `finished` means the session closed, NOT that the work succeeded. */
  readonly state: (typeof WORK_STATES)[number];
}

/**
 * A client does not reconnect after a transport fault.
 *
 * Once the connection is gone the far end may be a different process, and
 * silently re-establishing would hand a caller a session it never authenticated
 * against. Every later call rejects with the fault that ended it; construct a
 * new client.
 */
export interface WireClient {
  acceptWork(params: {
    readonly prompt: string;
    readonly providerId: string;
    readonly model?: string | null;
  }): Promise<AcceptedWorkHandle>;
  describeWork(receipt: string): Promise<DescribedWorkHandle>;
  close(): Promise<void>;
}

interface Pending {
  readonly resolve: (result: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export async function connectWireClient(init: WireClientInit): Promise<WireClient> {
  const socket = await open(init.socketPath);
  const framer = new NdjsonFramer();
  const pending = new Map<number, Pending>();
  /** Ids whose caller has already given up. A reply to one is late, not forged. */
  const abandoned = new Set<number>();
  const timeoutMs = init.requestTimeoutMs ?? DEFAULT_WIRE_REQUEST_TIMEOUT_MS;

  let nextId = 1;
  let fatal: Error | null = null;
  let closing: Promise<void> | null = null;

  /** Reject everything outstanding and refuse anything further. */
  const fail = (error: Error): void => {
    // The FIRST fault wins and is what every later caller is told. A close()
    // that overwrote it would replace the root cause -- "connection failed: X" --
    // with the caller's own tidy-up, which explains nothing.
    fatal ??= error;
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(error);
    }
  };

  const abort = (error: Error): void => {
    fail(error);
    socket.destroy();
  };

  /** False when the connection has been abandoned and reading must stop. */
  const deliver = (value: Record<string, unknown>): boolean => {
    const reply = readWireReply(value);

    if (reply.kind === "malformed") {
      abort(new WireTransportError(`server sent an unusable reply: ${reply.reason}`));
      return false;
    }
    if (reply.kind === "stream-fault") {
      // Addressed to no request, and reporting that the stream itself is
      // unusable -- so nothing further can be trusted, but the server's message
      // travels out with the error rather than being discarded.
      abort(new WireTransportError(`server rejected the stream: ${reply.error.message}`));
      return false;
    }

    const entry = pending.get(reply.id);
    if (!entry) {
      if (abandoned.delete(reply.id)) return true;
      abort(new WireTransportError(`server replied twice, or to an unknown id (${reply.id})`));
      return false;
    }
    clearTimeout(entry.timer);
    pending.delete(reply.id);

    if (reply.kind === "error") entry.reject(new WireRequestError(reply.error.code, reply.error.message));
    else entry.resolve(reply.result);
    return true;
  };

  socket.on("data", (chunk: Buffer) => {
    const framed = framer.push(chunk);
    for (const line of framed.lines) {
      const parsed = parseWireObject(line.bytes, line.ordinal);
      if (!parsed.ok) {
        abort(new WireTransportError(`server sent an unusable reply: ${parsed.reason}`));
        return;
      }
      if (!deliver(parsed.value)) return;
    }
    if (framed.refusal) {
      abort(new WireTransportError(`server sent an unframeable reply: ${framed.refusal.reason}`));
    }
  });

  socket.on("error", (error) => fail(new WireTransportError(`connection failed: ${error.message}`)));
  socket.on("close", () => fail(new WireTransportError("connection closed before the reply arrived")));

  const call = (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (fatal) return Promise.reject(fatal);
    if (socket.writableLength > MAX_WIRE_CLIENT_QUEUE_BYTES) {
      return Promise.reject(new WireTransportError(
        `refusing to send: ${socket.writableLength} bytes are still unwritten, over the `
        + `${MAX_WIRE_CLIENT_QUEUE_BYTES}-byte limit; the peer is not reading`
      ));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        // Remembered, so the server's later answer is recognised as late rather
        // than as a forgery that would take the connection down with it.
        abandoned.add(id);
        reject(new WireTransportError(`no reply to ${method} within ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params, lease: init.lease })}\n`);
    });
  };

  function shutdown(): Promise<void> {
    fail(new WireTransportError("client closed"));
    if (socket.destroyed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // `end()` only half-closes, so a peer that never closes its side would
      // leave this pending forever. The destroy is on a timer, not on trust.
      const forced = setTimeout(() => socket.destroy(), WIRE_CLOSE_GRACE_MS);
      forced.unref?.();
      socket.once("close", () => {
        clearTimeout(forced);
        resolve();
      });
      socket.end();
    });
  }

  return {
    async acceptWork(params) {
      const result = await call("work/accept", {
        prompt: params.prompt,
        providerId: params.providerId,
        ...(params.model === undefined ? {} : { model: params.model })
      });
      // Read, not coerced. `String()` never fails, so an object came back as the
      // receipt "[object Object]", a missing field as "undefined", and -- worst --
      // `String(["s-real"])` as "s-real", an array impersonating its own element.
      const fields = readStringFields(result, ["workSessionId", "receipt", "receiptId", "requestSha256"]);
      if (!fields.ok) throw new WireTransportError(fields.reason);
      return fields.fields;
    },

    async describeWork(receipt) {
      const result = await call("work/describe", { receipt });
      const fields = readStringFields(result, ["workSessionId"]);
      if (!fields.ok) throw new WireTransportError(fields.reason);
      const state = readEnumField(result, "state", WORK_STATES);
      if (!state.ok) throw new WireTransportError(state.reason);
      return { workSessionId: fields.fields.workSessionId, state: state.value };
    },

    close() {
      // One promise, reused. Each call used to add another `close` listener, and
      // Node's own leak detector eventually said so.
      closing ??= shutdown();
      return closing;
    }
  };
}

function open(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    // Named, so it can actually be removed. `removeListener("error", reject)`
    // matched nothing, because what had been registered was an anonymous arrow --
    // leaving a dead listener on the socket for the rest of its life.
    const onConnectError = (error: Error): void => {
      reject(new WireTransportError(`could not connect to ${socketPath}: ${error.message}`));
    };
    socket.once("error", onConnectError);
    socket.once("connect", () => {
      socket.removeListener("error", onConnectError);
      resolve(socket);
    });
  });
}

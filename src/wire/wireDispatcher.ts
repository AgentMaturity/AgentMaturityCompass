import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { loadLeaseRevocations, verifyLeaseRevocationsSignature } from "../leases/leaseStore.js";
import type { Ledger } from "../ledger/ledger.js";
import { NdjsonFramer } from "./ndjsonFraming.js";
import { parseWireObject } from "./wireJson.js";
import { findWireMethod, type WireMethodContext } from "./wireMethods.js";
import {
  parseWireRequest,
  serializeWireReply,
  WIRE_ERROR,
  type WireErrorCode,
  type WireId
} from "./wireRpc.js";

/**
 * The wire's message loop, as a function of bytes (plan P7.1a).
 *
 * NOTHING LISTENS YET, DELIBERATELY. This is the protocol, not a server: it
 * takes chunks and returns the bytes to write back. Binding a socket is a
 * separate change with its own hazards -- stdio is already spoken for by
 * `amc mcp serve`, the REPL and `amc connect hooks forward`, and
 * src/runtimes/common.ts contains an unguarded interactive prompt on stdin that
 * would eat frames. Keeping the protocol transport-free means all of it is
 * testable without a socket, and means the listener can be reviewed on its own
 * terms rather than smuggled in beside the parser.
 *
 * EVERY MESSAGE IS AUTHENTICATED, not every connection. A connection proves only
 * that something opened it; loopback and a unix socket are confidentiality, not
 * authentication. The one socket-bound surface this repo already has (the
 * notary) HMACs every request for the same reason, and the control bridge
 * restricts itself to loopback AND still requires a lease.
 *
 * THE IDENTITY IS THE LEASE'S. A verified lease carries the agentId, and that is
 * what reaches the ledger. The envelope has no member for a peer to put an
 * identity in and ./wireMethods.ts refuses one in params, so re-attribution is
 * not a check that could be forgotten -- there is nowhere to write it.
 *
 * A REVOKED-LEASE LIST THAT WILL NOT VERIFY STOPS EVERYTHING. See the note on
 * `revokedLeaseIds` below: this is the one place where this module knowingly
 * departs from an existing helper's behaviour, and the reason is that the
 * helper's is unsafe.
 */

export interface WireDispatcherInit {
  readonly workspace: string;
  readonly ledger: Ledger;
  /** An ALREADY-OPEN session that this dispatcher writes acceptances into. */
  readonly intakeSessionId: string;
  readonly monitorPublicKeys: readonly string[];
  readonly workspaceId?: string;
}

export interface DispatchResult {
  readonly replies: readonly Buffer[];
  /**
   * True when the stream is unusable and the caller must stop reading.
   *
   * Only framing faults set this. A refused message is an ordinary answer; a
   * desynchronised stream is not something to answer at all.
   */
  readonly close: boolean;
}

export interface WireDispatcher {
  handle(chunk: Buffer): DispatchResult;
  /** Bytes of an unterminated final record, which were discarded. */
  end(): { readonly discardedBytes: number };
}

/**
 * Refuse to run at all when appends cannot succeed.
 *
 * With AMC_EVALUATED_AGENT set, every ledger append throws
 * (../ledger/ledger.ts). A dispatcher that started anyway would accept a
 * connection, authenticate a peer, and fail on the first message that mattered.
 * Refusing at construction turns a per-message mystery into one clear sentence
 * at startup.
 */
export function assertWireCanServe(): void {
  if (process.env["AMC_EVALUATED_AGENT"] === "1") {
    throw new Error(
      "refusing to serve the wire: AMC_EVALUATED_AGENT=1 makes every ledger append throw, "
      + "so no acceptance could be recorded"
    );
  }
}

export function createWireDispatcher(init: WireDispatcherInit): WireDispatcher {
  assertWireCanServe();

  const framer = new NdjsonFramer();

  return {
    handle(chunk: Buffer): DispatchResult {
      const framed = framer.push(chunk);
      const replies: Buffer[] = [];

      for (const line of framed.lines) {
        replies.push(answer(init, line.bytes, line.ordinal));
      }

      if (framed.refusal) {
        // Framing faults are not addressed to a request -- there is no reliable
        // id inside a record that could not be delimited -- so the reply carries
        // a null id, and the caller closes.
        replies.push(serializeWireReply({
          id: null,
          error: { code: WIRE_ERROR.parse, message: framed.refusal.reason }
        }));
        return { replies, close: true };
      }
      return { replies, close: false };
    },

    end: () => framer.end()
  };
}

function answer(init: WireDispatcherInit, bytes: Buffer, ordinal: number): Buffer {
  const parsed = parseWireObject(bytes, ordinal);
  if (!parsed.ok) {
    return serializeWireReply({ id: null, error: { code: WIRE_ERROR.parse, message: parsed.reason } });
  }

  const envelope = parseWireRequest(parsed.value);
  if (!envelope.ok) {
    return serializeWireReply({
      id: envelope.id,
      error: { code: envelope.code, message: envelope.message }
    });
  }
  const request = envelope.request;

  // The method is resolved BEFORE the lease is verified, because a lease is
  // checked against the method's route and scope: there is nothing to verify
  // against until the method is known. An unknown method therefore reveals only
  // that a name is not served, which is not a secret -- the registry is shipped
  // in the binary.
  const method = findWireMethod(request.method);
  if (!method) {
    return reply(request.id, { code: WIRE_ERROR.methodNotFound, message: "no such method" });
  }

  const revoked = revokedLeaseIds(init.workspace);
  if (revoked === null) {
    return reply(request.id, {
      code: WIRE_ERROR.unauthorized,
      message: "the lease revocation list does not verify; refusing every lease until it does"
    });
  }

  const lease = verifyLeaseToken({
    workspace: init.workspace,
    token: request.lease,
    requiredScope: method.scope,
    routePath: method.routePath,
    revokedLeaseIds: revoked,
    ...(init.workspaceId === undefined ? {} : { expectedWorkspaceId: init.workspaceId })
  });
  if (!lease.ok || !lease.payload) {
    // The verifier's reason names which check failed and never quotes the token.
    return reply(request.id, { code: WIRE_ERROR.unauthorized, message: lease.error ?? "lease denied" });
  }

  const ctx: WireMethodContext = {
    ledger: init.ledger,
    intakeSessionId: init.intakeSessionId,
    // Straight from the verified payload. Nothing the peer wrote reaches this.
    agentId: lease.payload.agentId,
    monitorPublicKeys: init.monitorPublicKeys
  };

  let outcome;
  try {
    outcome = method.handle(ctx, request.params);
  } catch {
    // A handler that throws is a fault in AMC, not in the request. Its message
    // may name internal paths, so it does not travel; the ledger is where the
    // detail belongs.
    return reply(request.id, { code: WIRE_ERROR.internal, message: "the method failed" });
  }

  return outcome.ok
    ? serializeWireReply({ id: request.id, result: outcome.result })
    : reply(request.id, { code: outcome.code, message: outcome.message });
}

function reply(id: WireId, error: { code: WireErrorCode; message: string }): Buffer {
  return serializeWireReply({ id, error });
}

/**
 * The revoked lease ids, or null when the list cannot be trusted.
 *
 * `revokedLeaseIdSet` (../leases/leaseStore.ts) returns an EMPTY SET when the
 * signature does not verify, which reads as "nothing is revoked" -- so tampering
 * with that one file un-revokes every lease ever revoked. That is a fail-OPEN
 * answer to a security question, and this surface will not inherit it. Here an
 * unverifiable list is a refusal: null means no lease is accepted at all, which
 * is loud, safe, and fixable by re-signing.
 */
function revokedLeaseIds(workspace: string): Set<string> | null {
  const signature = verifyLeaseRevocationsSignature(workspace);
  if (!signature.valid) return null;
  try {
    return new Set(loadLeaseRevocations(workspace).revocations.map((row) => row.leaseId));
  } catch {
    return null;
  }
}

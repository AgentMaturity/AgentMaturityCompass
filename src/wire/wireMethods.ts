import type { LeaseScope } from "../leases/leaseSchema.js";
import type { Ledger } from "../ledger/ledger.js";
import { decodeParams } from "./wireCodecs.js";
import { acceptWork, describeAcceptedWork } from "./workAcceptance.js";
import { WIRE_ERROR, type WireErrorCode } from "./wireRpc.js";

/**
 * Every method this wire answers, as data (plan P7.1a).
 *
 * A REGISTRY RATHER THAN A SWITCH, mirroring API_ROUTE_REGISTRY: a method's
 * required scope and route sit beside the method itself, so adding one without
 * declaring what it needs is not something the type system permits. A switch
 * puts the authorisation somewhere else and makes forgetting it the default.
 *
 * WHAT IS ABSENT IS THE POINT. There is no method here that starts an agent,
 * reaches the CLI, mints or revokes a lease, edits policy, or signs anything.
 * That is not an oversight to be filled in later. A peer on this wire holds a
 * LEASE, and a lease is not a role: OPERATOR and OWNER are carried by a session
 * cookie no socket peer can produce. So a wire method that needed operator
 * authority could only ever get it by not checking -- which is exactly how
 * Studio's /cli/exec came to let an agent token start another agent. The
 * safeguard is that such a method does not exist here, not that it is guarded.
 *
 * Both methods below terminate at the acceptance layer. Accepting work and
 * reporting on it are complete, checkable acts that need no detached execution,
 * which `runComposedTurn` cannot currently offer anyway: it opens and closes a
 * session per call.
 */

export interface WireMethodContext {
  readonly ledger: Ledger;
  readonly intakeSessionId: string;
  /**
   * Taken from the VERIFIED LEASE, never from the message.
   *
   * The dispatcher never passes a peer-supplied identity here, and the envelope
   * has no member a peer could put one in. Attribution that a caller can choose
   * is not attribution.
   */
  readonly agentId: string;
  readonly monitorPublicKeys: readonly string[];
}

export type WireMethodResult =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly code: WireErrorCode; readonly message: string };

export interface WireMethod {
  readonly name: string;
  /**
   * A synthetic path, checked against the lease's `routeAllowlist`.
   *
   * Synthetic because there is no HTTP route to name, but real in the sense that
   * matters: `verifyLeaseToken` compares it by prefix, so a lease scoped to
   * `/wire/work/describe` genuinely cannot accept work. Omitting it would let
   * one wire lease reach every wire method.
   */
  readonly routePath: string;
  readonly scope: LeaseScope;
  readonly handle: (ctx: WireMethodContext, params: Record<string, unknown>) => WireMethodResult;
}

export const WIRE_METHODS: readonly WireMethod[] = [
  {
    name: "work/accept",
    routePath: "/wire/work/accept",
    scope: "wire:submit",
    handle: (ctx, params) => {
      // Checked before the schema, because `.strict()` would refuse this as an
      // unrecognised key with a message that says nothing about WHY. A peer that
      // tried to name the agent needs to be told the lease decides it, not that
      // it misspelled something.
      if ("agentId" in params) {
        return {
          ok: false,
          code: WIRE_ERROR.invalidParams,
          message: "agentId is taken from the lease and must not be sent"
        };
      }
      const decoded = decodeParams("work/accept", params);
      if (!decoded.ok) return { ok: false, code: WIRE_ERROR.invalidParams, message: decoded.reason };

      const accepted = acceptWork({
        ledger: ctx.ledger,
        intakeSessionId: ctx.intakeSessionId,
        request: {
          prompt: decoded.value.prompt,
          agentId: ctx.agentId,
          providerId: decoded.value.providerId,
          model: decoded.value.model ?? null
        }
      });
      return {
        ok: true,
        result: {
          workSessionId: accepted.workSessionId,
          receipt: accepted.receipt,
          receiptId: accepted.receiptId,
          requestSha256: accepted.requestSha256
        }
      };
    }
  },
  {
    name: "work/describe",
    routePath: "/wire/work/describe",
    scope: "wire:submit",
    handle: (ctx, params) => {
      const decoded = decodeParams("work/describe", params);
      if (!decoded.ok) return { ok: false, code: WIRE_ERROR.invalidParams, message: decoded.reason };

      const described = describeAcceptedWork({
        ledger: ctx.ledger,
        receipt: decoded.value.receipt,
        monitorPublicKeys: ctx.monitorPublicKeys
      });
      if (!described.ok) {
        // The reason comes from describeAcceptedWork, which reports on receipts
        // and ledger rows rather than echoing the request, so it is safe to
        // return. It is an invalid PARAM, not an internal fault: the receipt the
        // peer supplied did not check out.
        return { ok: false, code: WIRE_ERROR.invalidParams, message: described.reason };
      }
      return {
        ok: true,
        result: {
          workSessionId: described.workSessionId,
          // `finished` means the session closed, NOT that the work succeeded.
          // Passed through under the same name it has in workAcceptance.ts so
          // the wire cannot quietly promote it to a success.
          state: described.state
        }
      };
    }
  }
];

export function findWireMethod(name: string): WireMethod | undefined {
  return WIRE_METHODS.find((method) => method.name === name);
}

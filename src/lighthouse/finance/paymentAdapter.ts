import { z } from "zod";
import type { BindingFacts } from "../../actions/authorizationRecord.js";
import type { ReconcileAdapter, ReconcileQuery, SystemOfRecordObservation } from "../../actions/reconcile.js";
import { normalizePaymentArgs, paymentArgsDigest, paymentMinorToDecimal, paymentReferenceSchema, type PaymentArgs } from "./paymentArgs.js";
import type { Payment, PaymentCommit, PaymentServiceClient } from "./paymentServiceClient.js";

export interface PaymentActionInput {
  readonly executionId: string;
  readonly idempotencyKey: string;
  readonly args: unknown;
}

/** These describe provider results, not an AMC approval, authorization record, or journaled receipt. */
export type PaymentDispatchResult =
  | { readonly kind: "completed"; readonly payment: PaymentCommit; readonly replayed: boolean }
  | { readonly kind: "rejected"; readonly reason: string; readonly statusCode?: number }
  | { readonly kind: "unknown"; readonly reason: string };
export type PaymentReconcileResult =
  | { readonly kind: "completed"; readonly payment: Payment }
  | { readonly kind: "not_found"; readonly reason: string }
  | { readonly kind: "unknown"; readonly reason: string };

/** A trusted caller's durable mapping between AMC's digest and the separately normalized provider body. */
export interface PaymentLookupContext {
  readonly executionId: string;
  readonly argumentsDigest: string;
  readonly reference: string;
  readonly paymentBodySha256: string;
}
export interface PaymentAdapterOptions {
  readonly client: Pick<PaymentServiceClient, "createPayment" | "findPaymentsByKey" | "findPaymentsByReference">;
  readonly adapterId?: string;
  /**
   * Read the original durable proposal/dispatch data, never model-supplied authority. The generic AMC normalizer
   * hashes a different envelope and this adapter cannot infer this mapping from ReconcileQuery.bindings.
   */
  readonly resolveLookupContext?: (query: ReconcileQuery, signal: AbortSignal) => Promise<PaymentLookupContext | null>;
}

const contextSchema = z.object({ executionId: z.string().min(1).max(512), argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reference: paymentReferenceSchema, paymentBodySha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

function bodyDigestOf(payment: Payment): string {
  return paymentArgsDigest({ kind: payment.kind, sourceAccountId: payment.sourceAccountId, payeeId: payment.payeeId,
    amountMinor: payment.amountMinor, currency: payment.currency, reference: payment.reference,
    ...(payment.originalTxnId === undefined ? {} : { originalTxnId: payment.originalTxnId }) });
}

function observedBindings(payment: Payment): BindingFacts {
  return { amount: { value: paymentMinorToDecimal(payment.amountMinor), currency: payment.currency },
    recipient: payment.payeeId, destination: payment.destinationTokenSha256,
    resourceId: payment.payeeId, resourceVersion: String(payment.payeeVersion) };
}

/** Explicitly opt in. Dispatch must already be authorized by AMC's durable action path before this adapter is called. */
export function createPaymentAdapter(options: PaymentAdapterOptions): ReconcileAdapter & {
  dispatch(input: PaymentActionInput, signal?: AbortSignal): Promise<PaymentDispatchResult>;
  reconcile(input: PaymentActionInput, signal?: AbortSignal): Promise<PaymentReconcileResult>;
} {
  const adapterId = options.adapterId ?? "lighthouse-finance-v1";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(adapterId)) throw new Error("Invalid payment adapterId");

  function matchPayment(payments: readonly Payment[], key: string, context: Pick<PaymentLookupContext, "reference" | "paymentBodySha256">): PaymentReconcileResult {
    // Reference is a correlation value, not a uniqueness constraint in this permissive provider.
    if (payments.length !== 1) return { kind: "unknown", reason: "ambiguous_payment_lookup" };
    const payment = payments[0]!;
    if (payment.idempotencyKey !== key || payment.reference !== context.reference) {
      return { kind: "unknown", reason: "payment_correlation_mismatch" };
    }
    if (payment.bodySha256 !== context.paymentBodySha256 || bodyDigestOf(payment) !== payment.bodySha256) {
      return { kind: "unknown", reason: "payment_body_digest_mismatch" };
    }
    return { kind: "completed", payment };
  }

  async function findPayment(key: string, context: Pick<PaymentLookupContext, "reference" | "paymentBodySha256">,
    signal?: AbortSignal): Promise<PaymentReconcileResult> {
    try {
      const byKey = await options.client.findPaymentsByKey(key, signal);
      if (byKey.kind === "unknown") return byKey;
      if (byKey.kind === "ok" && byKey.value.payments.length > 0) return matchPayment(byKey.value.payments, key, context);
      if (byKey.kind === "rejected" && byKey.statusCode !== 404) return { kind: "unknown", reason: "payment_key_lookup_rejected" };
      const byReference = await options.client.findPaymentsByReference(context.reference, signal);
      if (byReference.kind === "unknown") return byReference;
      if (byReference.kind === "rejected") return { kind: "unknown", reason: "payment_reference_lookup_rejected" };
      if (byReference.value.payments.length > 0) return matchPayment(byReference.value.payments, key, context);
      // A delayed POST may still commit; an administrator may have expired its key. Absence proves neither outcome.
      return { kind: "not_found", reason: "payment_not_found_outcome_unproven" };
    } catch {
      return { kind: "unknown", reason: "payment_lookup_failed" };
    }
  }

  return {
    adapterId,
    async dispatch(input, signal) {
      let args: PaymentArgs;
      try {
        args = normalizePaymentArgs(input.args);
      } catch {
        return { kind: "rejected", reason: "invalid_payment_args" };
      }
      try {
        const result = await options.client.createPayment(args, input.idempotencyKey, signal);
        if (result.kind === "unknown") return result;
        if (result.kind === "rejected") return { kind: "rejected", reason: result.code, statusCode: result.statusCode };
        return { kind: "completed", payment: result.value, replayed: result.replayed };
      } catch {
        // A client exception does not prove whether a consequential request reached the provider.
        return { kind: "unknown", reason: "payment_dispatch_failed" };
      }
    },
    async reconcile(input, signal) {
      try {
        const args = normalizePaymentArgs(input.args);
        return await findPayment(input.idempotencyKey, { reference: args.reference, paymentBodySha256: paymentArgsDigest(args) }, signal);
      } catch {
        return { kind: "unknown", reason: "invalid_payment_reconcile_args" };
      }
    },
    async lookup(query, signal): Promise<SystemOfRecordObservation> {
      if (options.resolveLookupContext === undefined) return { kind: "unknown", reason: "payment_lookup_context_unavailable" };
      try {
        const resolved = await options.resolveLookupContext(query, signal);
        if (resolved === null) return { kind: "unknown", reason: "payment_lookup_context_unavailable" };
        const context = contextSchema.safeParse(resolved);
        if (!context.success || context.data.executionId !== query.executionId || context.data.argumentsDigest !== query.argumentsDigest) {
          return { kind: "unknown", reason: "payment_lookup_context_mismatch" };
        }
        const found = await findPayment(query.idempotencyKey, context.data, signal);
        if (found.kind !== "completed") return { kind: "unknown", reason: found.reason };
        return { kind: "applied", externalRef: found.payment.paymentId, observedAt: found.payment.committedAt,
          observed: observedBindings(found.payment) };
      } catch {
        return { kind: "unknown", reason: "payment_lookup_context_failed" };
      }
    }
  };
}

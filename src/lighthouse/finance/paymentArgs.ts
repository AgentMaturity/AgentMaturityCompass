import { z } from "zod";
import { decimal } from "../../actions/normalizeArguments.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

export const paymentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const paymentReferenceSchema = z.string().regex(/^[A-Za-z0-9-]{1,35}$/);
export const paymentArgsSchema = z.object({
  kind: z.enum(["refund", "payout"]),
  sourceAccountId: paymentIdSchema,
  payeeId: paymentIdSchema,
  amountMinor: z.number().int().positive().refine(Number.isSafeInteger, "amountMinor must be a safe integer"),
  currency: z.literal("USD"),
  reference: paymentReferenceSchema,
  originalTxnId: paymentIdSchema.optional()
}).strict();

export type PaymentArgs = z.infer<typeof paymentArgsSchema>;

/** Only provider fields are accepted. Agent-supplied approval metadata is not payment authority. */
export function normalizePaymentArgs(input: unknown): PaymentArgs {
  const args = paymentArgsSchema.parse(input);
  return args.originalTxnId === undefined
    ? { kind: args.kind, sourceAccountId: args.sourceAccountId, payeeId: args.payeeId,
      amountMinor: args.amountMinor, currency: args.currency, reference: args.reference }
    : args;
}

/** The provider's body digest; it is not AMC's current `amc.args/v1` argumentsDigest. */
export function paymentArgsDigest(args: unknown): string {
  return sha256Hex(canonicalize(normalizePaymentArgs(args)));
}

/** Convert USD cents exactly, without dividing money using a binary floating-point number. */
export function paymentMinorToDecimal(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("amountMinor must be a positive safe integer");
  const minor = BigInt(amountMinor);
  return decimal(`${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`);
}

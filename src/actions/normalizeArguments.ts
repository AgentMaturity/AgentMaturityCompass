import type { ToolDefinition as SignedToolDefinition } from "../toolhub/toolsSchema.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ARGS_NORMALIZER, type BindingFacts } from "./authorizationRecord.js";

type BindingFields = NonNullable<SignedToolDefinition["bindingFields"]>;
type BindingRole = keyof BindingFields;

/** A decimal string. A JSON number is never an amount: a binary float cannot say 0.1. */
const DECIMAL = /^-?\d+(\.\d+)?$/;
const CURRENCY = /^[A-Z]{3}$/;
/** Arguments that read like authority. They grant nothing; the record keeps them apart as what the agent said. */
const AGENT_METADATA_KEY = /^(approvalId|approvalRequestId|approved|consent|_amc.*)$/;
/** Facts each class must bind, or every call is denied `binding_fields_missing`. */
const REQUIRED_BINDINGS: Partial<Record<ActionClass, readonly BindingRole[]>> = {
  FINANCIAL: ["amount", "currency", "recipient"],
  DATA_EXPORT: ["destination"]
};

export type NormalizedArguments =
  | {
    readonly ok: true;
    readonly argumentsDigest: string;
    readonly bindings: BindingFacts;
    readonly normalizer: typeof ARGS_NORMALIZER;
    readonly agentSuppliedMetadata: Record<string, unknown> | null;
  }
  | { readonly ok: false; readonly failure: "binding_fields_missing"; readonly reason: string };

/** NFC every string and key, so two spellings of one text bind as one. */
function nfc(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(nfc);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.normalize("NFC"), nfc(item)]));
  }
  return value;
}

/** "0100.50", "100.5" and "100.50" are one amount. */
export function decimal(value: string): string {
  const trimmed = value.replace(/^(-?)0+(?=\d)/, "$1");
  return trimmed.includes(".") ? trimmed.replace(/0+$/, "").replace(/\.$/, "") : trimmed;
}

/** A URL destination binds by origin; an account or route id binds as written. */
function urlOrigin(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : value;
  } catch {
    return value;
  }
}

/**
 * The digest and protected facts of one call's arguments (normalizer `amc.args/v1`). Which argument carries which fact
 * comes from the signed tool definition's `bindingFields`, never from the arguments themselves. The argument that
 * carries AMC's idempotency key (P1-04) is AMC's, not the call's: it is left out of the digest, and a value the model
 * supplied is kept as agent-supplied metadata.
 */
export function normalizeArguments(definition: SignedToolDefinition | null, actionClass: ActionClass,
  args: Readonly<Record<string, unknown>>): NormalizedArguments {
  const fields: BindingFields = definition?.bindingFields ?? {};
  const required = REQUIRED_BINDINGS[actionClass] ?? [];
  const refuse = (reason: string): NormalizedArguments => ({ ok: false, failure: "binding_fields_missing", reason });
  const undeclared = required.filter(role => fields[role] === undefined);
  if (undeclared.length > 0) return refuse(`${actionClass} tools must declare bindingFields ${undeclared.join(", ")} in the signed tools config`);

  const all = nfc(args) as Record<string, unknown>;
  const carrier = definition?.effects?.idempotency?.carrier === "argument" ? definition.effects.idempotency.name : null;
  const carried = carrier === null ? undefined : all[carrier];
  const normalized = carrier === null ? all : Object.fromEntries(Object.entries(all).filter(([key]) => key !== carrier));
  const read = (role: BindingRole): string | null => {
    const name = fields[role];
    const value = name === undefined ? undefined : normalized[name];
    if (value === undefined || value === null) {
      if (required.includes(role)) throw new Error(`${role} argument "${name}" is required`);
      return null;
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(role === "amount"
        ? `amount argument "${name}" must be a decimal string such as "100.50", never a JSON number`
        : `${role} argument "${name}" must be a non-empty string`);
    }
    return value;
  };
  try {
    const amountText = read("amount"), currencyText = read("currency");
    let amount: BindingFacts["amount"] = null;
    let digested = normalized;
    if (amountText !== null || currencyText !== null) {
      if (amountText === null || !DECIMAL.test(amountText)) throw new Error(`amount must be a decimal string such as "100.50"`);
      const currency = (currencyText ?? "").toUpperCase();
      if (!CURRENCY.test(currency)) throw new Error("currency must be a three-letter code");
      amount = { value: decimal(amountText), currency };
      digested = { ...normalized, [fields.amount!]: amount.value, ...(fields.currency === undefined ? {} : { [fields.currency]: currency }) };
    }
    const destination = read("destination");
    const metadata = [...Object.entries(normalized).filter(([key]) => AGENT_METADATA_KEY.test(key)),
      ...(carrier !== null && carried !== undefined ? [[carrier, carried] as const] : [])];
    return {
      ok: true,
      argumentsDigest: sha256Hex(canonicalize({ normalizer: ARGS_NORMALIZER, arguments: digested })),
      bindings: { amount, recipient: read("recipient"), destination: destination === null ? null : urlOrigin(destination),
        resourceId: read("resourceId"), resourceVersion: read("resourceVersion") },
      normalizer: ARGS_NORMALIZER,
      agentSuppliedMetadata: metadata.length > 0 ? Object.fromEntries(metadata) : null
    };
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Idempotency keys for consequential actions (P1-04). AMC mints one per execution before dispatch and binds it into
 * the authorization record, the intent, the journal row and every receipt; the tool's signed `effects.idempotency`
 * carries it to the system of record. A system that honours the key can refuse a duplicate request, and reconciliation
 * can ask it what happened under that key. AMC never promises exactly-once delivery.
 */
import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `amc1_` and 26 Crockford base32 characters encoding 128 random bits. */
export function mintIdempotencyKey(): string {
  let value = BigInt(`0x${randomBytes(16).toString("hex")}`);
  let text = "";
  for (let index = 0; index < 26; index += 1) {
    text = CROCKFORD[Number(value & 31n)]! + text;
    value >>= 5n;
  }
  return `amc1_${text}`;
}

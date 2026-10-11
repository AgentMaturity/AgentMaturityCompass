/**
 * The one issuer-admission rule for trust-list keys, shared by AMC's verifiers (src/trust/admission.ts) and the
 * standalone verifier (packages/verifier compiles this file). It imports only Node built-ins, which
 * check:architecture-boundaries enforces, so the zero-dependency package can carry it.
 *
 * A key is judged at one instant `at`, the verification time. A signing time that a record only claims never moves
 * `at`, because whoever holds the key can write any date: a key revoked (for any reason), distrusted or past its
 * `validTo` at `at` is refused even for a record that claims an earlier signature.
 *
 * Seam (P1-25): once a verifier holds a signing time attested by an RFC 3161 token from a pinned TSA, it may pass that
 * time as `at`. A signature proven earlier than a revocation is then admitted, and the caller must say so in a warning.
 */
import { timingSafeEqual } from "node:crypto";

export type RuleStatus = "admitted" | "wrong-purpose" | "not-yet-valid" | "expired" | "revoked";

export interface RuleEntry {
  keyId: string;
  purposes: readonly string[];
  validFrom: string;
  validTo: string | null;
  revokedAt?: string;
  revocationReason?: string;
}

/** Constant-time equality of two key ids or digests. */
export function sameId(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Distrusted at `at`: always when `distrustedFrom` is null, otherwise from that time on. Distrust beats every pin. */
export function distrustAt<D extends { keyId: string; distrustedFrom: string | null }>(distrust: readonly D[], keyId: string, at: number): D | undefined {
  return distrust.find(entry => sameId(entry.keyId, keyId) && (entry.distrustedFrom === null || at >= Date.parse(entry.distrustedFrom)));
}

/** One trust-list entry at `at`: its purpose, its validity window, then any revocation. */
export function entryAt(entry: RuleEntry, purpose: string, at: number): RuleStatus {
  if (!entry.purposes.includes(purpose)) return "wrong-purpose";
  if (at < Date.parse(entry.validFrom)) return "not-yet-valid";
  if (entry.validTo !== null && at >= Date.parse(entry.validTo)) return "expired";
  if (entry.revokedAt !== undefined && (entry.revocationReason === "key-compromise" || at >= Date.parse(entry.revokedAt))) return "revoked";
  return "admitted";
}

/**
 * Every entry the lists hold for `keyId`. A key-compromise revocation in any list refuses the key for every purpose and
 * time, whatever another list says. Otherwise the first admitting entry wins, then the first refusal that is not
 * wrong-purpose, then wrong-purpose. Null when no list names the key.
 */
export function listsAt<E extends RuleEntry>(lists: ReadonlyArray<{ listId: string; entries: readonly E[] }>, keyId: string, purpose: string,
  at: number): { status: RuleStatus; listId: string; entry: E } | null {
  for (const list of lists) {
    const compromised = list.entries.find(entry => sameId(entry.keyId, keyId) && entry.revocationReason === "key-compromise");
    if (compromised) return { status: "revoked", listId: list.listId, entry: compromised };
  }
  const verdicts = lists.flatMap(list => list.entries.filter(entry => sameId(entry.keyId, keyId))
    .map(entry => ({ status: entryAt(entry, purpose, at), listId: list.listId, entry })));
  return verdicts.find(verdict => verdict.status === "admitted")
    ?? verdicts.find(verdict => verdict.status !== "wrong-purpose")
    ?? verdicts[0]
    ?? null;
}

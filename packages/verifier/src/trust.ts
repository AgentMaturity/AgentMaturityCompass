/**
 * Trust from the verifier's user only: signed trust lists checked against pinned root key ids, and admission of one
 * signing key for one purpose at the signature's claimed time. A key named or carried by the artifact is only looked up
 * here; it never vouches for itself.
 */
import { canonicalize, ed25519KeyId, same, tagged, verifyEd25519 } from "./bytes.js";
import type { Finding, KeyPurpose } from "./codes.js";
import { signedTrustList, type DistrustEntry, type SignedTrustList, type TrustList, type TrustListEntry } from "./records/trustList.js";
import { attempt } from "./schema.js";

/**
 * AMC's built-in distrust (src/trust/amc-distrust.json, filled by P0-37). It always applies and beats every pin;
 * tests/verifier/parityWithAmc.test.ts keeps it equal to AMC's file.
 */
export const BUILT_IN_DISTRUST: readonly DistrustEntry[] = [];

export interface TrustContext {
  asOf: number;
  roots: ReadonlySet<string>;
  /** Lists whose signatures, root threshold, expiry and sequence all checked out. */
  lists: readonly TrustList[];
  /** Public keys of pinned roots, as the verified lists' signature rows carry them. */
  rootPems: ReadonlyMap<string, string>;
  /** The highest m-of-n floor any verified list declares (at least 1). */
  rootThreshold: number;
  distrust: readonly DistrustEntry[];
  knownSequences: Readonly<Record<string, number>>;
  /** Supplied lists that failed: issuer admission fails whenever one did (fail closed). */
  problems: Finding<"issuerAdmission">[];
}

/** What P0-09 and P1-08 check on a signed trust list, as of `asOf`, each fact kept apart so callers can name it. */
export interface ListFacts {
  signed: SignedTrustList;
  /** A signature row whose key id or signature does not verify. */
  badSignature: string | null;
  /** Pinned, not distrusted roots that signed it. */
  pinned: string[];
  threshold: number;
  expired: boolean;
  /** The higher sequence already known for this list id, when this one is older. */
  rolledBackFrom: number | null;
}

export function listFacts(signed: SignedTrustList, roots: ReadonlySet<string>, asOf: number, known: Readonly<Record<string, number>>,
  distrust: readonly DistrustEntry[] = BUILT_IN_DISTRUST): ListFacts {
  const { list } = signed;
  const bytes = tagged("AMC_TRUST_LIST_V1", canonicalize(list));
  const bad = signed.signatures.find(row => !same(ed25519KeyId(row.publicKeyPem) ?? "", row.keyId)
    || !verifyEd25519(bytes, row.publicKeyPem, Buffer.from(row.signature, "base64")));
  const seen = known[list.listId];
  return {
    signed, badSignature: bad?.keyId ?? null,
    pinned: signed.signatures.map(row => row.keyId).filter(keyId => roots.has(keyId) && !distrust.some(entry => same(entry.keyId, keyId))),
    threshold: Math.max(1, list.rootThreshold ?? 1),
    expired: asOf >= Date.parse(list.expiresAt),
    rolledBackFrom: seen !== undefined && list.sequence < seen ? seen : null
  };
}

/** A supplied trust list's problems; none means it can admit keys. */
function listProblems(value: unknown, roots: ReadonlySet<string>, asOf: number, known: Readonly<Record<string, number>>): { facts: ListFacts | null; problems: Finding<"issuerAdmission">[] } {
  const parsed = attempt(signedTrustList, value);
  if (!parsed.ok) return { facts: null, problems: [{ code: "TRUST_LIST_SIGNATURE_INVALID", detail: `not a valid signed trust list (${parsed.error.message})` }] };
  const facts = listFacts(parsed.value, roots, asOf, known);
  const id = `list "${parsed.value.list.listId}"`;
  const problems: Finding<"issuerAdmission">[] = [];
  if (facts.badSignature) problems.push({ code: "TRUST_LIST_SIGNATURE_INVALID", detail: `${id} carries a signature by ${facts.badSignature} that does not verify` });
  if (facts.pinned.length < facts.threshold) {
    problems.push({ code: "TRUST_LIST_SIGNATURE_INVALID", detail: `${id} has ${facts.pinned.length} signature(s) by pinned roots; ${facts.threshold} required` });
  }
  if (facts.expired) problems.push({ code: "TRUST_LIST_EXPIRED", detail: `${id} expired at ${parsed.value.list.expiresAt}` });
  if (facts.rolledBackFrom !== null) problems.push({ code: "ROLLBACK_DETECTED", detail: `${id} has sequence ${parsed.value.list.sequence}; ${facts.rolledBackFrom} is already known` });
  return { facts, problems };
}

export function trustContext(lists: readonly unknown[], roots: ReadonlySet<string>, asOf: number, known: Readonly<Record<string, number>>): TrustContext {
  const verified: TrustList[] = [];
  const rootPems = new Map<string, string>();
  const problems: Finding<"issuerAdmission">[] = [];
  for (const value of lists) {
    const checked = listProblems(value, roots, asOf, known);
    problems.push(...checked.problems);
    if (checked.facts && checked.problems.length === 0) {
      verified.push(checked.facts.signed.list);
      for (const row of checked.facts.signed.signatures) if (roots.has(row.keyId)) rootPems.set(row.keyId, row.publicKeyPem);
    }
  }
  return {
    asOf, roots, lists: verified, rootPems, problems, knownSequences: known,
    rootThreshold: Math.max(1, ...verified.map(list => list.rootThreshold ?? 1)),
    distrust: [...BUILT_IN_DISTRUST, ...verified.flatMap(list => list.distrust)]
  };
}

/** The issuer admission record of the shared verifier report (src/trust/admission.ts IssuerAdmission). */
export interface IssuerAdmission {
  signature: string;
  purpose: KeyPurpose;
  keyId: string | null;
  status: "admitted" | "not-pinned" | "wrong-purpose" | "not-yet-valid" | "expired" | "revoked" | "distrusted";
  source: "explicit-key" | "trust-list" | null;
  listId: string | null;
  timeBasis: "claimed" | null;
  detail: string | null;
}

export interface Admission {
  record: IssuerAdmission;
  finding: Finding<"issuerAdmission"> | null;
  /** The trust-list entry that admitted the key. */
  entry: TrustListEntry | null;
  warning: string | null;
}

const CODE = {
  "not-pinned": "ISSUER_NOT_PINNED", "wrong-purpose": "ISSUER_WRONG_PURPOSE", "not-yet-valid": "KEY_NOT_YET_VALID",
  expired: "KEY_EXPIRED", revoked: "ISSUER_REVOKED", distrusted: "ISSUER_DISTRUSTED"
} as const;

type Verdict = { status: IssuerAdmission["status"]; listId: string | null; detail: string; entry?: TrustListEntry; warning?: string };

/**
 * One trust-list entry at time `at` (the claimed signing time when it is not after `asOf`, else `asOf`). A
 * key-compromise revocation is handled before this; other revocations refuse claims at or after `revokedAt` and admit
 * earlier claims, saying the admission rests on the claimed time.
 */
function checkEntry(entry: TrustListEntry, listId: string, purpose: KeyPurpose, claimed: number | null, asOf: number): Verdict {
  if (!entry.purposes.includes(purpose)) return { status: "wrong-purpose", listId, detail: `trust list ${listId} pins this key for ${entry.purposes.join(", ")}, not ${purpose}` };
  if (asOf < Date.parse(entry.validFrom)) return { status: "not-yet-valid", listId, detail: `trust list ${listId} admits this key from ${entry.validFrom}` };
  const at = claimed !== null && claimed <= asOf ? claimed : asOf;
  if (entry.validTo !== null && at >= Date.parse(entry.validTo)) return { status: "expired", listId, detail: `trust list ${listId} admitted this key until ${entry.validTo}` };
  if (entry.revokedAt !== undefined) {
    if (at >= Date.parse(entry.revokedAt)) return { status: "revoked", listId, detail: `trust list ${listId} revoked this key at ${entry.revokedAt} (${entry.revocationReason})` };
    return { status: "admitted", listId, entry, detail: `admitted on the signature's claimed time only`,
      warning: `key ${entry.keyId} was revoked at ${entry.revokedAt} (${entry.revocationReason}); admitted because the signature claims an earlier time (timeBasis: claimed)` };
  }
  const expiredNow = entry.validTo !== null && asOf >= Date.parse(entry.validTo);
  return { status: "admitted", listId, entry, detail: expiredNow ? "admitted on the signature's claimed time only" : "admitted",
    ...(expiredNow ? { warning: `key ${entry.keyId} expired at ${entry.validTo}; admitted because the signature claims an earlier time (timeBasis: claimed)` } : {}) };
}

/** P0-09 step 1: distrusted for every claim when distrustedFrom is null, otherwise for claims at or after it (or no claim). */
export function distrustOf(keyId: string, claimed: number | null, ctx: TrustContext): DistrustEntry | undefined {
  return ctx.distrust.find(entry => same(entry.keyId, keyId)
    && (entry.distrustedFrom === null || claimed === null || claimed >= Date.parse(entry.distrustedFrom)));
}

function verdictFor(keyId: string, purpose: KeyPurpose, claimed: number | null, ctx: TrustContext): Verdict {
  const distrusted = distrustOf(keyId, claimed, ctx);
  if (distrusted) return { status: "distrusted", listId: null, detail: `key ${keyId} is distrusted (${distrusted.reason}, ${distrusted.source}): ${distrusted.note}` };
  for (const list of ctx.lists) {
    const compromised = list.entries.find(entry => same(entry.keyId, keyId) && entry.revocationReason === "key-compromise");
    if (compromised) return { status: "revoked", listId: list.listId, detail: `trust list ${list.listId} revoked this key at ${compromised.revokedAt} (key-compromise)` };
  }
  const verdicts = ctx.lists.flatMap(list => list.entries.filter(entry => same(entry.keyId, keyId))
    .map(entry => checkEntry(entry, list.listId, purpose, claimed, ctx.asOf)));
  return verdicts.find(verdict => verdict.status === "admitted")
    ?? verdicts.find(verdict => verdict.status !== "wrong-purpose")
    ?? verdicts[0]
    ?? { status: "not-pinned", listId: null, detail: `key ${keyId} is not pinned for ${purpose} by any supplied trust list` };
}

/** Admits `keyId` for `purpose` at the claimed signing time; never on the artifact's word. */
export function admit(input: { signature: string; keyId: string | null; purpose: KeyPurpose; claimedAt: number | null }, ctx: TrustContext): Admission {
  const verdict: Verdict = input.keyId === null
    ? { status: "not-pinned", listId: null, detail: "no supplied trust list holds a key that made this signature" }
    : verdictFor(input.keyId, input.purpose, input.claimedAt, ctx);
  const admitted = verdict.status === "admitted";
  const record: IssuerAdmission = {
    signature: input.signature, purpose: input.purpose, keyId: input.keyId, status: verdict.status,
    source: admitted ? "trust-list" : null, listId: verdict.listId,
    timeBasis: admitted && input.claimedAt !== null ? "claimed" : null, detail: verdict.detail
  };
  return { record, entry: verdict.entry ?? null, warning: verdict.warning ?? null,
    finding: admitted ? null : { code: CODE[verdict.status as keyof typeof CODE], detail: `${input.signature}: ${verdict.detail}` } };
}

/** A trust-list root's signature: admitted when the verifier's user pinned the key (--trust-root) and nothing distrusts it. */
export function rootAdmission(signature: string, keyId: string, claimedAt: number | null, ctx: TrustContext): Admission {
  const distrusted = distrustOf(keyId, claimedAt, ctx);
  const status = distrusted ? "distrusted" : ctx.roots.has(keyId) ? "admitted" : "not-pinned";
  const detail = distrusted ? `root ${keyId} is distrusted (${distrusted.reason}): ${distrusted.note}`
    : status === "admitted" ? "pinned trust-list root" : `root ${keyId} is not pinned with --trust-root`;
  return {
    record: { signature, purpose: "trust-list-root", keyId, status, source: status === "admitted" ? "explicit-key" : null, listId: null,
      timeBasis: status === "admitted" && claimedAt !== null ? "claimed" : null, detail },
    entry: null, warning: null,
    finding: status === "admitted" ? null : { code: status === "distrusted" ? "ISSUER_DISTRUSTED" : "ISSUER_NOT_PINNED", detail: `${signature}: ${detail}` }
  };
}

/** Every key the verified lists name, for records that name no key (receipts, ledger rows). */
export function listedKeys(ctx: TrustContext): Array<{ keyId: string; publicKeyPem: string }> {
  const keys = new Map<string, string>();
  for (const list of ctx.lists) for (const entry of list.entries) keys.set(entry.keyId, entry.publicKeyPem);
  return [...keys].map(([keyId, publicKeyPem]) => ({ keyId, publicKeyPem }));
}

/** The public key the verified lists hold for `keyId`, whatever its purpose; null when none does. */
export function listedPem(ctx: TrustContext, keyId: string): string | null {
  return listedKeys(ctx).find(key => same(key.keyId, keyId))?.publicKeyPem ?? null;
}

/**
 * Trust from the verifier's user only: signed trust lists checked m-of-n against pinned root key ids, and admission of
 * one signing key for one purpose as of the verifier's as-of time. A key named or carried by the artifact is only looked
 * up here; it never vouches for itself, and the time an artifact claims never decides whether its key is admitted.
 */
// The one admission rule AMC's verifiers also use; it imports only node: built-ins (check:architecture-boundaries).
import { distrustAt, listsAt } from "../../../src/trust/admissionRule.js";
import { canonicalize, same, signingKeyId, statementMessage, verifySignature } from "./bytes.js";
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
  /** The m-of-n the verifier's user pinned (--root-threshold, default 1). */
  pinnedThreshold: number;
  /** Lists whose signatures, root threshold, expiry and sequence all checked out. */
  lists: readonly TrustList[];
  /** Public keys of pinned roots, as the verified lists' signature rows carry them. */
  rootPems: ReadonlyMap<string, string>;
  /** The pinned m-of-n threshold, raised to the highest floor any verified list declares. */
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

/** The key id of the first signature row whose key id or signature does not verify; null when every row verifies. */
function badRow(signed: SignedTrustList): string | null {
  const bytes = statementMessage("AMC_TRUST_LIST_V1", "AMC_TRUST_LIST_V2_DIGEST", canonicalize(signed.list), signed.signatureVersion);
  return signed.signatures.find(row => !same(signingKeyId(row.publicKeyPem) ?? "", row.keyId)
    || !verifySignature(bytes, row.publicKeyPem, Buffer.from(row.signature, "base64")))?.keyId ?? null;
}

const knownSequence = (known: Readonly<Record<string, number>>, id: string) => (Object.hasOwn(known, id) ? known[id] : undefined);

/**
 * `pinnedThreshold` is the verifier's own m-of-n: a list's `rootThreshold` may raise it, never lower it. Distrust of a
 * root is judged as of `asOf`.
 */
export function listFacts(signed: SignedTrustList, roots: ReadonlySet<string>, asOf: number, known: Readonly<Record<string, number>>,
  pinnedThreshold: number, distrust: readonly DistrustEntry[] = BUILT_IN_DISTRUST): ListFacts {
  const { list } = signed;
  const seen = knownSequence(known, list.listId);
  return {
    signed, badSignature: badRow(signed),
    pinned: signed.signatures.map(row => row.keyId).filter(keyId => roots.has(keyId) && !distrustAt(distrust, keyId, asOf)),
    threshold: Math.max(1, pinnedThreshold, list.rootThreshold ?? 1),
    expired: asOf >= Date.parse(list.expiresAt),
    rolledBackFrom: seen !== undefined && list.sequence < seen ? seen : null
  };
}

/** A supplied trust list's problems; none means it can admit keys. */
function listProblems(signed: SignedTrustList, roots: ReadonlySet<string>, asOf: number, known: Readonly<Record<string, number>>, pinnedThreshold: number,
  rootDistrust: readonly DistrustEntry[]): { facts: ListFacts; problems: Finding<"issuerAdmission">[] } {
  const facts = listFacts(signed, roots, asOf, known, pinnedThreshold, rootDistrust);
  const id = `list "${signed.list.listId}"`;
  const problems: Finding<"issuerAdmission">[] = [];
  if (facts.badSignature) problems.push({ code: "TRUST_LIST_SIGNATURE_INVALID", detail: `${id} carries a signature by ${facts.badSignature} that does not verify` });
  if (facts.pinned.length < facts.threshold) {
    problems.push({ code: "TRUST_LIST_SIGNATURE_INVALID", detail: `${id} has ${facts.pinned.length} signature(s) by pinned roots that nothing distrusts; ${facts.threshold} required` });
  }
  if (facts.expired) problems.push({ code: "TRUST_LIST_EXPIRED", detail: `${id} expired at ${signed.list.expiresAt}` });
  if (facts.rolledBackFrom !== null) problems.push({ code: "ROLLBACK_DETECTED", detail: `${id} has sequence ${signed.list.sequence}; ${facts.rolledBackFrom} is already known` });
  return { facts, problems };
}

/**
 * Lists that undercut each other: of the lists supplied under one list id, any below the highest sequence is a
 * rollback, and two different lists at the same sequence are a fork (both refused). Identical copies are one list.
 */
function siblingProblems(lists: readonly SignedTrustList[]): Map<SignedTrustList, Finding<"issuerAdmission">> {
  const problems = new Map<SignedTrustList, Finding<"issuerAdmission">>();
  for (const signed of lists) {
    const { listId, sequence } = signed.list;
    const siblings = lists.filter(other => other.list.listId === listId);
    const highest = Math.max(...siblings.map(other => other.list.sequence));
    if (sequence < highest) {
      problems.set(signed, { code: "ROLLBACK_DETECTED", detail: `list "${listId}" sequence ${sequence} was supplied beside sequence ${highest}` });
    } else if (siblings.some(other => other.list.sequence === sequence && canonicalize(other.list) !== canonicalize(signed.list))) {
      problems.set(signed, { code: "TRUST_LIST_SIGNATURE_INVALID", detail: `two different lists "${listId}" claim sequence ${sequence}` });
    }
  }
  return problems;
}

/**
 * Only lists that pass every check contribute entries, distrust or root keys; a list that fails contributes nothing.
 * Root distrust is gathered first from every list a pinned root signed and whose signatures verify (expired or not), so
 * a root one list distrusts counts towards no other list. Over-applying it only refuses more.
 */
export function trustContext(lists: readonly unknown[], roots: ReadonlySet<string>, asOf: number, known: Readonly<Record<string, number>>,
  pinnedThreshold: number): TrustContext {
  const problems: Finding<"issuerAdmission">[] = [];
  const parsed: SignedTrustList[] = [];
  for (const value of lists) {
    const checked = attempt(signedTrustList, value);
    if (checked.ok) parsed.push(checked.value);
    else problems.push({ code: "TRUST_LIST_SIGNATURE_INVALID", detail: `not a valid signed trust list (${checked.error.message})` });
  }
  const rootDistrust = [...BUILT_IN_DISTRUST, ...parsed
    .filter(signed => badRow(signed) === null && signed.signatures.some(row => roots.has(row.keyId))).flatMap(signed => signed.list.distrust)];
  const siblings = siblingProblems(parsed);
  const verified: TrustList[] = [];
  const rootPems = new Map<string, string>();
  for (const signed of parsed) {
    const checked = listProblems(signed, roots, asOf, known, pinnedThreshold, rootDistrust);
    const sibling = siblings.get(signed);
    if (sibling) checked.problems.push(sibling);
    problems.push(...checked.problems);
    if (checked.problems.length === 0) {
      verified.push(signed.list);
      for (const row of signed.signatures) if (roots.has(row.keyId)) rootPems.set(row.keyId, row.publicKeyPem);
    }
  }
  return {
    asOf, roots, pinnedThreshold, lists: verified, rootPems, problems, knownSequences: known,
    rootThreshold: Math.max(1, pinnedThreshold, ...verified.map(list => list.rootThreshold ?? 1)),
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
}

const CODE = {
  "not-pinned": "ISSUER_NOT_PINNED", "wrong-purpose": "ISSUER_WRONG_PURPOSE", "not-yet-valid": "KEY_NOT_YET_VALID",
  expired: "KEY_EXPIRED", revoked: "ISSUER_REVOKED", distrusted: "ISSUER_DISTRUSTED"
} as const;

type Verdict = { status: IssuerAdmission["status"]; listId: string | null; detail: string; entry?: TrustListEntry };

/** P0-09 step 1, as of the verifier's time (the shared rule): distrusted always when distrustedFrom is null, otherwise from that time on. */
export function distrustOf(keyId: string, ctx: TrustContext): DistrustEntry | undefined {
  return distrustAt(ctx.distrust, keyId, ctx.asOf);
}

/**
 * Distrust, then the counted lists, judged as of `asOf` by the rule AMC's own verifiers use (src/trust/admissionRule.ts).
 * The time a record claims never brings a key back; to judge a record as of an earlier moment, the user sets `asOf`.
 */
function verdictFor(keyId: string, purpose: KeyPurpose, ctx: TrustContext): Verdict {
  const distrusted = distrustOf(keyId, ctx);
  if (distrusted) return { status: "distrusted", listId: null, detail: `key ${keyId} is distrusted (${distrusted.reason}, ${distrusted.source}): ${distrusted.note}` };
  const found = listsAt(ctx.lists, keyId, purpose, ctx.asOf);
  if (!found) return { status: "not-pinned", listId: null, detail: `key ${keyId} is not pinned for ${purpose} by any supplied trust list` };
  const { entry, listId } = found;
  const detail = {
    "wrong-purpose": `trust list ${listId} pins this key for ${entry.purposes.join(", ")}, not ${purpose}`,
    "not-yet-valid": `trust list ${listId} admits this key from ${entry.validFrom}`,
    expired: `trust list ${listId} admitted this key until ${entry.validTo}`,
    revoked: `trust list ${listId} revoked this key at ${entry.revokedAt} (${entry.revocationReason})`,
    admitted: "admitted"
  }[found.status];
  return { status: found.status, listId, detail, ...(found.status === "admitted" ? { entry } : {}) };
}

/** Admits `keyId` for `purpose` as of the verifier's as-of time; never on the artifact's word or its claimed time. */
export function admit(input: { signature: string; keyId: string | null; purpose: KeyPurpose }, ctx: TrustContext): Admission {
  const verdict: Verdict = input.keyId === null
    ? { status: "not-pinned", listId: null, detail: "no supplied trust list holds a key that made this signature" }
    : verdictFor(input.keyId, input.purpose, ctx);
  const admitted = verdict.status === "admitted";
  const record: IssuerAdmission = {
    signature: input.signature, purpose: input.purpose, keyId: input.keyId, status: verdict.status,
    source: admitted ? "trust-list" : null, listId: verdict.listId, timeBasis: null, detail: verdict.detail
  };
  return { record, entry: verdict.entry ?? null,
    finding: admitted ? null : { code: CODE[verdict.status as keyof typeof CODE], detail: `${input.signature}: ${verdict.detail}` } };
}

/** A trust-list root's signature: admitted when the verifier's user pinned the key (--trust-root) and nothing distrusts it. */
export function rootAdmission(signature: string, keyId: string, ctx: TrustContext): Admission {
  const distrusted = distrustOf(keyId, ctx);
  const status = distrusted ? "distrusted" : ctx.roots.has(keyId) ? "admitted" : "not-pinned";
  const detail = distrusted ? `root ${keyId} is distrusted (${distrusted.reason}): ${distrusted.note}`
    : status === "admitted" ? "pinned trust-list root" : `root ${keyId} is not pinned with --trust-root`;
  return {
    record: { signature, purpose: "trust-list-root", keyId, status, source: status === "admitted" ? "explicit-key" : null, listId: null,
      timeBasis: null, detail },
    entry: null,
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

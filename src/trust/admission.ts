import { z } from "zod";
import { verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { sha256Hex } from "../utils/hash.js";
import { KEY_PURPOSES, ROLE_PURPOSES, type KeyPurpose } from "./keyPurposes.js";
import type { TrustContext } from "./trustContext.js";
import { distrustAt, listsAt } from "./admissionRule.js";
import { signingKeyId } from "../keys/algorithmPolicy.js";

export const issuerAdmissionSchema = z.strictObject({
  signature: z.string(),
  purpose: z.enum(KEY_PURPOSES),
  keyId: z.string().nullable(),
  status: z.enum(["admitted", "not-pinned", "wrong-purpose", "not-yet-valid", "expired", "revoked", "distrusted", "unpinned-allowed"]),
  source: z.enum(["explicit-key", "trust-list", "trust-list-history", "workspace-self"]).nullable(),
  listId: z.string().nullable(),
  timeBasis: z.literal("claimed").nullable(),
  detail: z.string().nullable()
});
export type IssuerAdmission = z.infer<typeof issuerAdmissionSchema>;

export interface AdmitKeyInput {
  /** The key the artifact names. It is only looked up here; it never vouches for itself. */
  publicKeyPem: string | null;
  purpose: KeyPurpose;
  /** Which signature this is, e.g. "manifest.sig" or "run.json runSealSig". */
  signature: string;
  context: TrustContext;
  /**
   * The signing time the artifact claims. It is untrusted, so it never admits a key: distrust, validity and revocation
   * are judged at the verification time (P1-06). A claim later than the verification time, or before the admitting
   * entry's validFrom, is refused, and an admission checked against a claim says so with timeBasis "claimed".
   */
  claimedSignedAt?: string | Date | null;
  /** A key-history envelope carried by the artifact (AMC-1525). */
  keyHistory?: unknown;
}

type Verdict = Pick<IssuerAdmission, "status" | "source" | "listId" | "timeBasis" | "detail">;

function time(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The trust lists' verdict on a key, judged at the verification time by the shared rule (src/trust/admissionRule.ts,
 * also compiled into the standalone verifier). A claimed signing time never admits a key the rule refuses; AMC also
 * refuses a claim that lies outside the admitting entry's window or after the verification time, which the standalone
 * verifier reports under freshness instead.
 */
function listVerdict(keyId: string, purpose: KeyPurpose, claimed: number | null, context: TrustContext): Verdict | null {
  const asOf = context.asOf.getTime();
  const found = listsAt(context.lists, keyId, purpose, asOf);
  if (!found) return null;
  const { entry, listId } = found;
  const refuse = (status: IssuerAdmission["status"], detail: string): Verdict => ({ status, source: null, listId, timeBasis: null, detail });
  switch (found.status) {
    case "wrong-purpose": return refuse("wrong-purpose", `trust list ${listId} pins this key for ${entry.purposes.join(", ")}, not ${purpose}`);
    case "not-yet-valid": return refuse("not-yet-valid", `trust list ${listId} admits this key from ${entry.validFrom}`);
    case "expired": return refuse("expired", `trust list ${listId} admitted this key until ${entry.validTo}`);
    case "revoked": return refuse("revoked", `trust list ${listId} revoked this key at ${entry.revokedAt ?? "an unrecorded time"} (${entry.revocationReason ?? "unspecified"})`);
    case "admitted": break;
  }
  if (claimed !== null && claimed > asOf) {
    return refuse("not-yet-valid", `the signature claims a signing time after the verification time ${context.asOf.toISOString()}`);
  }
  if (claimed !== null && claimed < Date.parse(entry.validFrom)) return refuse("not-yet-valid", `trust list ${listId} admits this key from ${entry.validFrom}`);
  return { status: "admitted", source: "trust-list", listId, timeBasis: claimed === null ? null : "claimed", detail: null };
}

/** AMC-1525: an older role key is admitted only through history signed by a pinned anchor that allows key history. */
function admitFromHistory(keyId: string, purpose: KeyPurpose, history: unknown, context: TrustContext, claimed: number | null): Verdict | null {
  const role = (history as { role?: unknown } | null)?.role;
  if (typeof role !== "string" || !Object.hasOwn(ROLE_PURPOSES, role)) return null;
  const roleKey = role as keyof typeof ROLE_PURPOSES;
  if (!(ROLE_PURPOSES[roleKey] as readonly KeyPurpose[]).includes(purpose)) return null;
  for (const list of context.lists) {
    for (const anchor of list.entries) {
      if (anchor.allowKeyHistory !== true) continue;
      // Distrust beats every pin, so a distrusted or compromised anchor vouches for no one.
      if (distrustAt(context.distrust, anchor.keyId, context.asOf.getTime())) continue;
      if (listVerdict(anchor.keyId, purpose, claimed, { ...context, lists: [{ ...list, entries: [anchor] }] })?.status !== "admitted") continue;
      if (listsAt(context.lists, anchor.keyId, purpose, context.asOf.getTime())?.status === "revoked") continue;
      const checked = verifyKeyHistoryEnvelope(history, roleKey, anchor.publicKeyPem);
      if (checked.valid && checked.envelope?.entries.some(entry => entry.fingerprint === keyId)) {
        return { status: "admitted", source: "trust-list-history", listId: list.listId, timeBasis: null,
          detail: `admitted through ${role} key history anchored by ${anchor.keyId}` };
      }
    }
  }
  return null;
}

export function admitKey(input: AdmitKeyInput): IssuerAdmission {
  const { purpose, context } = input;
  // The id of the key, not of the PEM text, so a CRLF or otherwise re-encoded copy matches the same pins and distrust.
  const canonicalId = input.publicKeyPem === null ? null : signingKeyId(input.publicKeyPem);
  const keyId = input.publicKeyPem === null ? null : canonicalId ?? sha256Hex(Buffer.from(input.publicKeyPem, "utf8"));
  const result = (verdict: Verdict): IssuerAdmission => ({ signature: input.signature, purpose, keyId, ...verdict });
  const refuse = (status: IssuerAdmission["status"], detail: string) => result({ status, source: null, listId: null, timeBasis: null, detail });
  if (keyId === null) return refuse("not-pinned", "the artifact names no public key for this signature");
  if (canonicalId === null) return refuse("not-pinned", `key ${keyId} is not an Ed25519 or ECDSA P-256 SPKI public key, so no pin can admit it`);
  const claimed = time(input.claimedSignedAt);

  // 1. Distrust beats every pin and every allow flag. It is judged at the verification time, never a claimed one.
  const distrusted = distrustAt(context.distrust, keyId, context.asOf.getTime());
  if (distrusted) return refuse("distrusted", `key ${keyId} is distrusted (${distrusted.reason}, ${distrusted.source}): ${distrusted.note}`);

  // 2. Explicit pins (--pubkey, --expect-monitor), or the workspace's own keys in workspace-self mode.
  if (context.explicitPins.some(pin => pin.keyId === keyId && pin.purposes.includes(purpose))) {
    return result({ status: "admitted", source: context.mode === "workspace-self" ? "workspace-self" : "explicit-key",
      listId: null, timeBasis: null, detail: context.mode === "workspace-self" ? "workspace self-check, not an independent issuer" : null });
  }

  // 3. Trust-list entries that name this key. A key-compromise revocation in any list beats an entry in another.
  const listed = listVerdict(keyId, purpose, claimed, context);
  if (listed) return result(listed);

  // 4. Older keys through signed key history.
  const fromHistory = input.keyHistory === undefined ? null : admitFromHistory(keyId, purpose, input.keyHistory, context, claimed);
  if (fromHistory) return result(fromHistory);

  // 5. Not pinned.
  if (context.allowUnpinned) return refuse("unpinned-allowed", `key ${keyId} is not pinned for ${purpose}; integrity only (--allow-unpinned)`);
  return refuse("not-pinned", `key ${keyId} is not pinned for ${purpose} by --pubkey or any trust list; pin it with --pubkey or add it to a signed trust list`);
}

/**
 * The trust-list keys `context` admits for `purpose` at its verification time, for a signature that names no key (a
 * licence): a verifier tries each in turn. Explicit pins carry no key, so only signed lists supply one (P1-51).
 */
export function admittedListKeys(context: TrustContext, purpose: KeyPurpose): string[] {
  return context.lists.flatMap(list => list.entries)
    .filter(entry => admitKey({ publicKeyPem: entry.publicKeyPem, purpose, signature: "pinned key lookup", context }).status === "admitted")
    .map(entry => entry.publicKeyPem);
}

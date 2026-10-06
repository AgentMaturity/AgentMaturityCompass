import { z } from "zod";
import { verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { sha256Hex } from "../utils/hash.js";
import { KEY_PURPOSES, ROLE_PURPOSES, type KeyPurpose } from "./keyPurposes.js";
import type { TrustContext } from "./trustContext.js";
import type { TrustListEntry } from "./trustList.js";

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
  /** The signing time the artifact claims. Until P1-25 this is untrusted, so it only ever narrows admission. */
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

/** Checks one trust-list entry that names the key, at the claimed signing time or else at the verification time. */
function checkEntry(entry: TrustListEntry, listId: string, purpose: KeyPurpose, claimed: number | null, asOf: number): Verdict {
  const refuse = (status: IssuerAdmission["status"], detail: string): Verdict => ({ status, source: null, listId, timeBasis: null, detail });
  if (!entry.purposes.includes(purpose)) return refuse("wrong-purpose", `trust list ${listId} pins this key for ${entry.purposes.join(", ")}, not ${purpose}`);
  const at = claimed ?? asOf;
  if (at < Date.parse(entry.validFrom)) return refuse("not-yet-valid", `trust list ${listId} admits this key from ${entry.validFrom}`);
  if (entry.validTo !== null && at >= Date.parse(entry.validTo)) return refuse("expired", `trust list ${listId} admitted this key until ${entry.validTo}`);
  const timeBasis = claimed === null ? null : "claimed";
  if (entry.revokedAt !== undefined) {
    if (entry.revocationReason === "key-compromise" || claimed === null || claimed >= Date.parse(entry.revokedAt)) {
      return refuse("revoked", `trust list ${listId} revoked this key at ${entry.revokedAt} (${entry.revocationReason ?? "unspecified"})`);
    }
    return { status: "admitted", source: "trust-list", listId, timeBasis: "claimed",
      detail: `warning: key revoked at ${entry.revokedAt} (${entry.revocationReason}); admitted only on the signature's claimed time` };
  }
  return { status: "admitted", source: "trust-list", listId, timeBasis, detail: null };
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
      if (checkEntry(anchor, list.listId, purpose, claimed, context.asOf.getTime()).status !== "admitted") continue;
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
  const keyId = input.publicKeyPem === null ? null : sha256Hex(Buffer.from(input.publicKeyPem, "utf8"));
  const result = (verdict: Verdict): IssuerAdmission => ({ signature: input.signature, purpose, keyId, ...verdict });
  const refuse = (status: IssuerAdmission["status"], detail: string) => result({ status, source: null, listId: null, timeBasis: null, detail });
  if (keyId === null) return refuse("not-pinned", "the artifact names no public key for this signature");
  const claimed = time(input.claimedSignedAt);

  // 1. Distrust beats every pin and every allow flag.
  const distrusted = context.distrust.find(entry => entry.keyId === keyId
    && (entry.distrustedFrom === null || claimed === null || claimed >= Date.parse(entry.distrustedFrom)));
  if (distrusted) return refuse("distrusted", `key ${keyId} is distrusted (${distrusted.reason}, ${distrusted.source}): ${distrusted.note}`);

  // 2. Explicit pins (--pubkey, --expect-monitor), or the workspace's own keys in workspace-self mode.
  const pins = context.explicitPins.filter(pin => pin.keyId === keyId);
  if (pins.some(pin => pin.purposes.includes(purpose))) {
    return result({ status: "admitted", source: context.mode === "workspace-self" ? "workspace-self" : "explicit-key",
      listId: null, timeBasis: null, detail: context.mode === "workspace-self" ? "workspace self-check, not an independent issuer" : null });
  }

  // 3. Trust-list entries that name this key.
  const verdicts = context.lists.flatMap(list => list.entries.filter(entry => entry.keyId === keyId)
    .map(entry => checkEntry(entry, list.listId, purpose, claimed, context.asOf.getTime())));
  const admitted = verdicts.find(verdict => verdict.status === "admitted");
  if (admitted) return result(admitted);
  const refused = verdicts.find(verdict => verdict.status !== "wrong-purpose") ?? verdicts[0];
  if (refused) return result(refused);
  if (pins.length) return refuse("wrong-purpose", `key ${keyId} is pinned for ${pins.flatMap(pin => pin.purposes).join(", ")}, not ${purpose}`);

  // 4. Older keys through signed key history.
  const fromHistory = input.keyHistory === undefined ? null : admitFromHistory(keyId, purpose, input.keyHistory, context, claimed);
  if (fromHistory) return result(fromHistory);

  // 5. Not pinned.
  if (context.allowUnpinned) return refuse("unpinned-allowed", `key ${keyId} is not pinned for ${purpose}; integrity only (--allow-unpinned)`);
  return refuse("not-pinned", `key ${keyId} is not pinned for ${purpose} by --pubkey or any trust list; pin it with --pubkey or add it to a signed trust list`);
}

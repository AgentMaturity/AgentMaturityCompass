import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { z } from "zod";
import { postToConfiguredUrl } from "../../time/tsaClient.js";
import type { TransparencyLog } from "../../trust/trustList.js";
import { canonicalize } from "../../utils/json.js";
import { parseCheckpoint, parseSignedNote, verifySignedNote } from "../checkpointNote.js";
import { leafHash, verifyInclusion } from "../rfc9162.js";

/**
 * Rekor v2 backend (P1-26), written against sigstore/rekor-tiles on main as read on 8 Oct 2026: api/proto/rekor/v2
 * (CreateEntryRequest, HashedRekordRequestV002), pkg/types/hashedrekord, pkg/note, pkg/client/write and CLIENTS.md.
 * One hashedrekord v0.0.2 entry per anchor over the SHA-256 of an AMC checkpoint note: only that digest, a one-time
 * public key and its signature become public. Rekor v2 serves no proofs and records no time, so the reply (inclusion
 * proof and signed log checkpoint) is kept verbatim and an RFC 3161 token is attached by the caller.
 */
export const REKOR_V2_TIMEOUT_MS = 30_000; // CLIENTS.md: Rekor replies once a checkpoint covers the entry; allow 20 s or more.
export const REKOR_V2_RESPONSE_MAX_BYTES = 64 * 1024;

/**
 * The CreateEntryRequest JSON. hashedrekord accepts prehashing algorithms only (ECDSA, RSA, Ed25519ph, not pure
 * Ed25519), and Node has no Ed25519ph, so each submission signs with a fresh P-256 key. The entry therefore links to
 * no other entry or key of this workspace; what binds it is the digest of a note the artifact-seal key signed.
 */
export function rekorV2EntryRequest(note: Buffer): Buffer {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return Buffer.from(JSON.stringify({
    hashedRekordRequestV002: {
      digest: createHash("sha256").update(note).digest("base64"),
      signature: {
        content: sign("sha256", note, privateKey).toString("base64"),
        verifier: { publicKey: { rawBytes: publicKey.export({ format: "der", type: "spki" }).toString("base64") }, keyDetails: "PKIX_ECDSA_P256_SHA_256" }
      }
    }
  }), "utf8");
}

/** POSTs the entry to `<url>/api/v2/log/entries` through the egress check; Rekor answers 201 with a TransparencyLogEntry. */
export async function submitRekorV2Entry(url: URL, note: Buffer, workspace?: string): Promise<Buffer> {
  return await postToConfiguredUrl(new URL(`${url.pathname.replace(/\/+$/, "")}/api/v2/log/entries`, url), rekorV2EntryRequest(note), {
    contentType: "application/json", accept: "application/json", status: 201, maxBytes: REKOR_V2_RESPONSE_MAX_BYTES, timeoutMs: REKOR_V2_TIMEOUT_MS
  }, workspace);
}

// protojson: int64 as a decimal string (a number is accepted too), bytes as base64, zero values omitted.
const int64 = z.union([z.string().regex(/^(0|[1-9][0-9]*)$/), z.number().int().nonnegative()]).optional()
  .transform(value => Number(value ?? 0)).refine(Number.isSafeInteger, "out of range");
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const transparencyLogEntrySchema = z.object({
  logIndex: int64,
  kindVersion: z.object({ kind: z.literal("hashedrekord"), version: z.literal("0.0.2") }),
  inclusionProof: z.object({
    logIndex: int64,
    rootHash: base64,
    treeSize: int64,
    hashes: z.array(base64).default([]),
    checkpoint: z.object({ envelope: z.string().min(1) })
  }),
  canonicalizedBody: base64
});
const hashedRekordBodySchema = z.object({
  apiVersion: z.literal("0.0.2"),
  kind: z.literal("hashedrekord"),
  spec: z.object({ hashedRekordV002: z.object({ data: z.object({ algorithm: z.literal("SHA2_256"), digest: base64 }) }) })
});

export type RekorV2Check =
  | { status: "anchored"; logId: string; origin: string; logIndex: number; treeSize: number }
  | { status: "not-anchored" | "invalid"; detail: string };

const hex = (b64: string): string => Buffer.from(b64, "base64").toString("hex");

/**
 * Offline: the reply holds a hashedrekord entry for `checkpointSha256`, its RFC 9162 inclusion proof resolves to a log
 * checkpoint, and that checkpoint carries a signed-note signature under a log key the operator pinned (`logs`, from
 * verified trust lists) for its origin. Every value is read from the reply's bytes; a key the reply carries never
 * counts. An unpinned log is "not-anchored"; anything that fails against a pinned log is "invalid".
 */
export function verifyRekorV2Response(responseB64: string, checkpointSha256: string, logs: readonly TransparencyLog[]): RekorV2Check {
  const invalid = (detail: string): RekorV2Check => ({ status: "invalid", detail });
  let entry: z.infer<typeof transparencyLogEntrySchema>;
  let body: Buffer;
  let origin: string;
  try {
    entry = transparencyLogEntrySchema.parse(JSON.parse(Buffer.from(responseB64, "base64").toString("utf8")) as unknown);
    body = Buffer.from(entry.canonicalizedBody, "base64");
    const text = body.toString("utf8");
    const parsed = JSON.parse(text) as unknown;
    // Canonical (JCS) bytes only: the leaf hash covers these bytes, so no other reading of them may exist.
    if (canonicalize(parsed) !== text) return invalid("the Rekor entry body is not canonical JSON");
    const digest = hashedRekordBodySchema.parse(parsed).spec.hashedRekordV002.data.digest;
    if (hex(digest) !== checkpointSha256) return invalid("the Rekor entry does not commit to this checkpoint");
    origin = parseSignedNote(Buffer.from(entry.inclusionProof.checkpoint.envelope, "utf8")).text.split("\n")[0]!;
  } catch (error) {
    return invalid(`the Rekor reply is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const proof = entry.inclusionProof;
  const pinned = logs.filter(log => log.origin === origin);
  if (!pinned.length) return { status: "not-anchored", detail: `log ${origin} is not pinned in a verified trust list` };
  const signed = pinned.flatMap(log => {
    try {
      const text = verifySignedNote(Buffer.from(proof.checkpoint.envelope, "utf8"), { name: log.origin, publicKeyPem: log.publicKeyPem });
      return text === null ? [] : [{ log, text }];
    } catch {
      return [];
    }
  })[0];
  if (!signed) return invalid(`the log checkpoint has no valid signature by the pinned key for ${origin}`);
  let checkpoint: ReturnType<typeof parseCheckpoint>;
  try {
    checkpoint = parseCheckpoint(signed.text);
  } catch (error) {
    return invalid(`the log checkpoint is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (proof.logIndex !== entry.logIndex || proof.treeSize !== checkpoint.treeSize || hex(proof.rootHash) !== checkpoint.rootHash) {
    return invalid("the inclusion proof is not for this entry and the signed log checkpoint");
  }
  if (!verifyInclusion({ leafHash: leafHash(body), leafIndex: proof.logIndex, treeSize: checkpoint.treeSize, proof: proof.hashes.map(hex), rootHash: checkpoint.rootHash })) {
    return invalid("the Rekor inclusion proof does not verify");
  }
  return { status: "anchored", logId: signed.log.logId, origin, logIndex: proof.logIndex, treeSize: checkpoint.treeSize };
}

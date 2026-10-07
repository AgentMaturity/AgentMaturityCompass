import { readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { boundedFile } from "../../standard/externalEvidenceFiles.js";
import { timestampAnchors, TIMESTAMP_TOKEN_MAX_BYTES, verifyTimestampToken } from "../../time/verifyTimestamp.js";
import type { IssuerAdmission, PublicAnchoring, TrustContext } from "../../trust/index.js";
import { checkSignature } from "../../trust/signatureCheck.js";
import type { TransparencyLog } from "../../trust/trustList.js";
import { pathExists, readUtf8 } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { NOTE_MAX_BYTES, parseCheckpoint, parseSignedNote, verifySignedNote } from "../checkpointNote.js";
import type { MerkleAlgorithm } from "../merkle.js";
import { verifyConsistency } from "../rfc9162.js";
import { REKOR_V2_RESPONSE_MAX_BYTES, verifyRekorV2Response } from "./rekorV2.js";

/**
 * Public anchoring (P1-26). A ledger checkpoint (P1-25) whose transparency tree is RFC 9162 becomes a C2SP checkpoint
 * note (origin `amc-transparency/<workspaceId>`, the tree's size and root, and an extension line naming the ledger
 * checkpoint's sequence and SHA-256), signed with the artifact-seal (auditor) key. Its SHA-256 is anchored in a Rekor
 * v2 log the operator configured; only that digest leaves the workspace. Everything here verifies offline: the log's
 * checkpoint signature against a log key pinned in a signed trust list, the RFC 9162 inclusion proof, and an RFC 3161
 * token from a pinned TSA, since Rekor v2 records no time. Submission lives in src/time/checkpoint.ts.
 */
export const AMC_CHECKPOINT_ORIGIN_PREFIX = "amc-transparency/";
const RECEIPT_MAX_BYTES = 2 * REKOR_V2_RESPONSE_MAX_BYTES + 2 * TIMESTAMP_TOKEN_MAX_BYTES;
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const anchorName = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);

export const transparencyConfigSchema = z.strictObject({
  anchors: z.array(z.strictObject({
    name: anchorName,
    backend: z.literal("rekor-v2"),
    /** The Rekor v2 shard's base URL. */
    url: z.url({ protocol: /^https?$/ }),
    /** Trust-list `transparencyLogs[].logId`s this log's checkpoints must verify under. */
    logIds: z.array(z.string().min(1)).min(1)
  })).default([]).refine(anchors => new Set(anchors.map(anchor => anchor.name)).size === anchors.length, "duplicate anchor name"),
  /** "checkpoint": anchor every new ledger checkpoint; "daily": at most one anchor per log per 24 hours. */
  anchorEvery: z.enum(["checkpoint", "daily"]).default("daily")
});
export type TransparencyConfig = z.infer<typeof transparencyConfigSchema>;

/** The `transparency` section of `.amc/amc.config.yaml`, defaults when absent; an invalid section throws. */
export function loadTransparencyConfig(workspace: string): TransparencyConfig {
  const path = join(workspace, ".amc", "amc.config.yaml");
  const raw = pathExists(path) ? (YAML.parse(readUtf8(path)) as { transparency?: unknown } | null)?.transparency : undefined;
  const parsed = transparencyConfigSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new Error(`amc.config.yaml transparency: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`);
}

export const anchorReceiptSchema = z.strictObject({
  type: z.literal("amc.anchor-receipt"),
  version: z.literal(1),
  backend: z.literal("rekor-v2"),
  /** The configured log URL: operator data, shown but never trusted. */
  service: z.string(),
  /** SHA-256 of the signed checkpoint note bytes. */
  checkpointSha256: sha256,
  /** Claimed: the submitter's clock. */
  submittedAt: z.iso.datetime(),
  /** The log's reply, verbatim; offline verification reads everything from these bytes. */
  responseB64: z.string().max(2 * REKOR_V2_RESPONSE_MAX_BYTES),
  /** RFC 3161 token (DER, base64) over checkpointSha256 (P1-25). */
  timestampTokenB64: z.string().max(2 * TIMESTAMP_TOKEN_MAX_BYTES).nullable()
});
export type AnchorReceiptV1 = z.infer<typeof anchorReceiptSchema>;

export const anchorsDir = (workspace: string): string => join(workspace, ".amc", "transparency", "anchors");
export const checkpointNotePath = (workspace: string, sequence: number): string => join(anchorsDir(workspace), `${sequence}.note`);
export const anchorReceiptPath = (workspace: string, sequence: number, name: string): string => join(anchorsDir(workspace), `${sequence}.${name}.json`);

/** The C2SP checkpoint body for a ledger checkpoint's RFC 9162 transparency tree, bound to that checkpoint. */
export function checkpointNoteText(input: { workspaceId: string; sequence: number; checkpointSha256: string; treeSize: number; rootHash: string }): string {
  return [`${AMC_CHECKPOINT_ORIGIN_PREFIX}${input.workspaceId}`, String(input.treeSize), Buffer.from(input.rootHash, "hex").toString("base64"),
    `amc-ledger-checkpoint ${input.sequence} ${input.checkpointSha256}`].map(line => `${line}\n`).join("");
}

/** Every transparency log pinned in the context's verified trust lists. */
export function pinnedTransparencyLogs(context: Pick<TrustContext, "lists">): TransparencyLog[] {
  return context.lists.flatMap(list => list.transparencyLogs ?? []);
}

const anchored = (detail: string, logIndex: number): PublicAnchoring => ({ status: "anchored", backend: "rekor-v2", logIndex, detail });
const notAnchored = (detail: string): PublicAnchoring => ({ status: "not-anchored", backend: null, logIndex: null, detail });
const invalid = (detail: string): PublicAnchoring => ({ status: "invalid", backend: null, logIndex: null, detail });

/**
 * Offline verification of a receipt for `note` against the operator's trust: pinned transparency logs and pinned TSA
 * anchors only. A receipt without a token, or whose log or TSA is not pinned, is "not-anchored"; one that fails a check
 * against pinned trust is "invalid". `logs` narrows the logs (the anchor's configured logIds) when given.
 */
export function verifyAnchorReceipt(receiptBytes: Buffer, note: Buffer, trust: Pick<TrustContext, "lists">, logs?: readonly TransparencyLog[]): PublicAnchoring {
  let receipt: AnchorReceiptV1;
  try {
    receipt = anchorReceiptSchema.parse(JSON.parse(receiptBytes.toString("utf8")) as unknown);
  } catch (error) {
    return invalid(`the anchor receipt is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (receipt.checkpointSha256 !== sha256Hex(note)) return invalid("the anchor receipt is for another checkpoint note");
  const log = verifyRekorV2Response(receipt.responseB64, receipt.checkpointSha256, logs ?? pinnedTransparencyLogs(trust));
  if (log.status !== "anchored") return log.status === "invalid" ? invalid(log.detail) : notAnchored(log.detail);
  if (receipt.timestampTokenB64 === null) return notAnchored("the Rekor v2 receipt carries no RFC 3161 token, so the anchor has no attested time");
  const token = verifyTimestampToken({ token: Buffer.from(receipt.timestampTokenB64, "base64"), expectedDigestHex: receipt.checkpointSha256, anchors: timestampAnchors(trust) });
  if (!token.ok) {
    const detail = `the anchor's RFC 3161 token: ${token.code}: ${token.detail}`;
    return token.code === "TST_UNTRUSTED_TSA" ? notAnchored(detail) : invalid(detail);
  }
  return anchored(`${log.origin} (trust-list log ${log.logId}) holds the checkpoint at index ${log.logIndex} of ${log.treeSize}; `
    + `RFC 3161 genTime ${token.attested.genTime} from ${token.attested.tsa.anchorId}`, log.logIndex);
}

/** The newest checkpoint note with a stored receipt, for a proof bundle; null when nothing was anchored yet. */
export function latestAnchorFiles(workspace: string): { note: Buffer; receipt: Buffer; treeSize: number; rootHash: string } | null {
  if (!pathExists(anchorsDir(workspace))) return null;
  const receipts = readdirSync(anchorsDir(workspace)).flatMap(name => {
    const match = /^([1-9][0-9]*)\.([a-z0-9][a-z0-9._-]{0,63})\.json$/.exec(name);
    return match ? [{ sequence: Number(match[1]), name }] : [];
  }).sort((a, b) => b.sequence - a.sequence || a.name.localeCompare(b.name));
  const newest = receipts[0];
  if (!newest) return null;
  const note = boundedFile(checkpointNotePath(workspace, newest.sequence), NOTE_MAX_BYTES);
  const { treeSize, rootHash } = parseCheckpoint(parseSignedNote(note).text);
  return { note, receipt: boundedFile(join(anchorsDir(workspace), newest.name), RECEIPT_MAX_BYTES), treeSize, rootHash };
}

/**
 * A proof bundle's public anchor (anchor.note, anchor.receipt.json, anchor.consistency.json). The tree comes from the
 * bundle's signed root, never from these files. The note must be signed by a key `trust` admits for artifact-seal,
 * the signed root's tree must extend the note's tree (RFC 9162 consistency), the receipt must verify, and the entry
 * must lie inside the anchored tree for "anchored".
 */
export function verifyBundledAnchor(input: {
  dir: string;
  tree: { algorithm: MerkleAlgorithm; treeSize: number | undefined; root: string };
  leafIndex: number;
  trust: TrustContext;
  candidates: ReadonlyArray<string | null | undefined>;
}): { publicAnchoring: PublicAnchoring; admission: IssuerAdmission | null } {
  const notePath = join(input.dir, "anchor.note");
  if (!pathExists(notePath)) return { publicAnchoring: notAnchored("the bundle carries no public anchor"), admission: null };
  if (input.tree.algorithm !== "rfc9162-sha256" || input.tree.treeSize === undefined) {
    return { publicAnchoring: invalid("an anchor needs an RFC 9162 signed root"), admission: null };
  }
  try {
    const note = boundedFile(notePath, NOTE_MAX_BYTES);
    const { text } = parseSignedNote(note);
    const origin = text.split("\n")[0]!;
    const check = checkSignature({ signature: "anchor.note", purpose: "artifact-seal", candidates: input.candidates, context: input.trust,
      verify: pem => {
        try {
          return verifySignedNote(note, { name: origin, publicKeyPem: pem }) !== null;
        } catch {
          return false;
        }
      } });
    if (!check.verified || !origin.startsWith(AMC_CHECKPOINT_ORIGIN_PREFIX)) {
      return { publicAnchoring: invalid("the checkpoint note is not signed by the bundle's auditor key"), admission: check.admission };
    }
    const checkpoint = parseCheckpoint(text);
    const consistency = z.strictObject({ hashes: z.array(sha256) })
      .parse(JSON.parse(boundedFile(join(input.dir, "anchor.consistency.json"), 64 * 1024).toString("utf8")) as unknown);
    if (!verifyConsistency({ oldSize: checkpoint.treeSize, newSize: input.tree.treeSize, oldRoot: checkpoint.rootHash, newRoot: input.tree.root,
      proof: consistency.hashes })) {
      return { publicAnchoring: invalid(`the signed root does not extend the anchored tree of ${checkpoint.treeSize} leaves`), admission: check.admission };
    }
    const receipt = verifyAnchorReceipt(boundedFile(join(input.dir, "anchor.receipt.json"), RECEIPT_MAX_BYTES), note, input.trust);
    if (receipt.status === "anchored" && input.leafIndex >= checkpoint.treeSize) {
      return { publicAnchoring: notAnchored(`the entry is newer than the anchored tree of ${checkpoint.treeSize} leaves, which the signed root extends`),
        admission: check.admission };
    }
    return { publicAnchoring: receipt, admission: check.admission };
  } catch (error) {
    return { publicAnchoring: invalid(`the public anchor is malformed: ${error instanceof Error ? error.message : String(error)}`), admission: null };
  }
}

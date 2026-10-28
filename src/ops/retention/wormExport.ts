/**
 * WORM export of signed retention segments (P2-09b, ADR 018 decision 4): "WORM export designed for SEC 17a-4-style
 * retention". Each segment, its manifest and its signature go to an object store under a compliance-mode retention
 * lock, then a signed `worm-export-index.json` names every object (key, sha256, retain-until, version id). Every object
 * is HEAD-checked afterwards: compliance mode, retain-until at least as late as requested. A target without object lock
 * is refused before anything is uploaded. Nothing is ever deleted and no retention is shortened; objects are addressed
 * by their sha256, so a re-export uploads only what the target does not hold.
 *
 * Beside the segments goes one ledger side-table segment (wormSideTables.ts, P2-36): A4's and the action journal's
 * rows, which retention segments do not carry. The index names it as `sideTables`; an index without it is an older
 * export, verified as before and reported as not covering A4.
 *
 * Offline verification (`verifyWormExport`) needs the downloaded objects and a trust list: the index and segment
 * signatures must come from a key the trust list admits for artifact-seal. A key carried by the export never vouches
 * for itself. The record-keeping duties themselves (D-08 experts) are out of scope; AMC claims no regulatory status.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { z } from "zod";
import { createPublicKey } from "node:crypto";
import { getSigningKey } from "../../keys/signingKeys.js";
import { signHexDigest } from "../../crypto/keys.js";
import { recomputeEventHash } from "../../ledger/encryption/ledgerCipher.js";
import { admittedListKeys } from "../../trust/admission.js";
import { checkDigestSignature } from "../../trust/signatureCheck.js";
import { loadTrustContext, type TrustContext } from "../../trust/trustContext.js";
import type { EvidenceEvent } from "../../types.js";
import { ensureDir, pathExists } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { listRetentionSegments, verifyRetentionSegment } from "./retentionArchive.js";
import { sideTableSegment, verifySideTableSegment } from "./wormSideTables.js";
import { retentionSegmentManifestSchema, retentionSegmentSignatureSchema } from "./retentionSchema.js";

export interface WormTarget {
  kind: "s3-object-lock" | "azure-immutable-blob" | "gcs-bucket-lock" | "filesystem-test";
  /** Whether the bucket or container has object lock (immutability) enabled. P2-09 addition to the spec's interface. */
  lockConfiguration(): Promise<{ enabled: boolean }>;
  putObject(key: string, body: Buffer, opts: { retainUntil: Date; mode: "COMPLIANCE" }): Promise<{ versionId: string | null; etag: string }>;
  /**
   * null when the object does not exist. `sha256` is the store's own checksum of the stored bytes (S3: HEAD with
   * ChecksumMode ENABLED), null when it cannot say; `versionId` is null where the store has no versions.
   */
  headObject(key: string): Promise<{ retainUntil: Date | null; mode: string | null; sha256: string | null; versionId: string | null } | null>;
}

const objectSchema = z.strictObject({
  key: z.string().min(1), sha256: z.string().length(64), bytes: z.number().int().min(0),
  retainUntil: z.string().min(1), versionId: z.string().nullable(), etag: z.string()
});
const segmentSchema = z.strictObject({
  segmentId: z.string().min(1), segment: z.string().min(1), manifest: z.string().min(1), signature: z.string().min(1)
});
const indexSchema = z.strictObject({
  v: z.literal(1), type: z.literal("amc.worm-export-index"), targetKind: z.string().min(1),
  signerPublicKeyPem: z.string().min(1), objects: z.array(objectSchema), segments: z.array(segmentSchema),
  sideTables: z.strictObject({ data: z.string().min(1), manifest: z.string().min(1) }).optional()
});
const signedIndexSchema = z.strictObject({ index: indexSchema, digestSha256: z.string().length(64), signature: z.string().min(1) });
type WormIndex = z.infer<typeof indexSchema>;
type WormObject = z.infer<typeof objectSchema>;

export interface WormExportReceipt {
  v: 1;
  targetKind: WormTarget["kind"];
  segments: number;
  uploaded: string[];
  alreadyPresent: string[];
  indexKey: string;
  indexSha256: string;
  localIndexPath: string;
}

export class WormExportRefusedError extends Error {
  constructor(detail: string) {
    super(`WORM export refused: ${detail}`);
    this.name = "WormExportRefusedError";
  }
}

const objectKey = (sha256: string) => `objects/${sha256}`;

// ponytail: version ids are remembered per target kind, not per bucket; key by bucket identity when one workspace exports to two.
function localStatePath(workspace: string, kind: string): string {
  return join(workspace, ".amc", "archive", "worm", `objects-${kind}.json`);
}

function readLocalState(workspace: string, kind: string): Record<string, { versionId: string | null; etag: string }> {
  const path = localStatePath(workspace, kind);
  return pathExists(path) ? JSON.parse(readFileSync(path, "utf8")) as Record<string, { versionId: string | null; etag: string }> : {};
}

/**
 * HEAD-checks one object: compliance mode, a retain-until at least as late as requested, the store's checksum equal to
 * our sha256 and, when we recorded one, the same version id. An object we did not write (pre-planted under our key, or
 * replaced) is refused, never overwritten.
 */
async function checkedHead(target: WormTarget, key: string, expected: { sha256: string; versionId: string | null; retainUntil: Date }): Promise<"locked" | "missing"> {
  const head = await target.headObject(key);
  if (head === null) return "missing";
  if (head.mode !== "COMPLIANCE") throw new WormExportRefusedError(`${key} is held in ${head.mode ?? "no"} retention mode, not COMPLIANCE`);
  if (head.retainUntil === null || head.retainUntil.getTime() < expected.retainUntil.getTime()) {
    throw new WormExportRefusedError(`${key} is retained until ${head.retainUntil?.toISOString() ?? "nothing"}, earlier than the requested ${expected.retainUntil.toISOString()}`);
  }
  if (head.sha256 !== expected.sha256) throw new WormExportRefusedError(`${key} content does not match (store checksum ${head.sha256 ?? "unavailable"}, expected ${expected.sha256})`);
  if (expected.versionId !== null && head.versionId !== null && head.versionId !== expected.versionId) {
    throw new WormExportRefusedError(`${key} is version ${head.versionId}, not the recorded ${expected.versionId}`);
  }
  return "locked";
}

/** Uploads one object unless the target already holds exactly it under a sufficient lock; then HEAD-checks it either way. */
async function putLocked(target: WormTarget, workspace: string, body: Buffer, retainUntil: Date, receipt: Pick<WormExportReceipt, "uploaded" | "alreadyPresent">): Promise<WormObject> {
  const sha256 = sha256Hex(body), key = objectKey(sha256);
  let stored = readLocalState(workspace, target.kind)[sha256] ?? null;
  if ((await checkedHead(target, key, { sha256, versionId: stored?.versionId ?? null, retainUntil })) === "missing") {
    stored = await target.putObject(key, body, { retainUntil, mode: "COMPLIANCE" });
    if ((await checkedHead(target, key, { sha256, versionId: stored.versionId, retainUntil })) === "missing") throw new WormExportRefusedError(`${key} is not readable after upload`);
    receipt.uploaded.push(key);
    const state = { ...readLocalState(workspace, target.kind), [sha256]: stored };
    ensureDir(join(workspace, ".amc", "archive", "worm"));
    writeFileSync(localStatePath(workspace, target.kind), JSON.stringify(state, null, 2));
  } else {
    receipt.alreadyPresent.push(key);
  }
  return { key, sha256, bytes: body.byteLength, retainUntil: retainUntil.toISOString(), versionId: stored?.versionId ?? null, etag: stored?.etag ?? "" };
}

export async function exportRetentionSegments(p: { workspace: string; target: WormTarget; retainUntil: (segment: { endTs: number }) => Date }): Promise<WormExportReceipt> {
  if (!(await p.target.lockConfiguration()).enabled) throw new WormExportRefusedError("the target has no object lock enabled");
  const segments = listRetentionSegments(p.workspace);
  for (const segment of segments) {
    const verified = verifyRetentionSegment({ workspace: p.workspace, ...segment });
    if (!verified.ok) throw new WormExportRefusedError(`segment ${segment.segmentPath} does not verify: ${verified.errors.join("; ")}`);
  }
  const receipt = { uploaded: [] as string[], alreadyPresent: [] as string[] };
  const objects: WormObject[] = [];
  const indexed: WormIndex["segments"] = [];
  let latest = new Date(0);
  for (const segment of segments) {
    const retainUntil = p.retainUntil({ endTs: segment.manifest!.endTs });
    if (retainUntil.getTime() > latest.getTime()) latest = retainUntil;
    const [data, manifest, signature] = [segment.segmentPath, segment.manifestPath, segment.sigPath].map((path) => readFileSync(path));
    const stored = [];
    for (const body of [data!, manifest!, signature!]) stored.push(await putLocked(p.target, p.workspace, body, retainUntil, receipt));
    objects.push(...stored);
    indexed.push({ segmentId: segment.manifest!.segmentId, segment: stored[0]!.key, manifest: stored[1]!.key, signature: stored[2]!.key });
  }
  // Held as long as the ledger's newest row would be, and never shorter than any segment.
  const side = sideTableSegment(p.workspace, (headTs) => {
    const until = p.retainUntil({ endTs: headTs });
    return until.getTime() > latest.getTime() ? until : latest;
  });
  if (side.retainUntil.getTime() > latest.getTime()) latest = side.retainUntil;
  const sideObjects = [await putLocked(p.target, p.workspace, side.data, side.retainUntil, receipt),
    await putLocked(p.target, p.workspace, side.manifest, side.retainUntil, receipt)];
  objects.push(...sideObjects);
  const sealKey = getSigningKey(p.workspace, "artifact-seal");
  const index: WormIndex = { v: 1, type: "amc.worm-export-index", targetKind: p.target.kind,
    signerPublicKeyPem: createPublicKey(sealKey).export({ format: "pem", type: "spki" }).toString(), objects, segments: indexed,
    sideTables: { data: sideObjects[0]!.key, manifest: sideObjects[1]!.key } };
  const digest = sha256Hex(canonicalize(index));
  const signed = Buffer.from(JSON.stringify({ index, digestSha256: digest, signature: signHexDigest(digest, sealKey) }, null, 2));
  const indexObject = await putLocked(p.target, p.workspace, signed, latest, receipt);
  const localIndexPath = join(p.workspace, ".amc", "archive", "worm", "worm-export-index.json");
  ensureDir(dirname(localIndexPath));
  writeFileSync(localIndexPath, signed);
  return { v: 1, targetKind: p.target.kind, segments: segments.length, ...receipt, indexKey: indexObject.key, indexSha256: indexObject.sha256, localIndexPath };
}

function readObject(objectsDir: string, object: WormObject, errors: string[]): Buffer | null {
  const path = join(objectsDir, object.key);
  if (!pathExists(path)) { errors.push(`object missing: ${object.key}`); return null; }
  const bytes = readFileSync(path);
  if (sha256Hex(bytes) !== object.sha256) { errors.push(`object sha256 mismatch: ${object.key}`); return null; }
  return bytes;
}

/** True when the signature verifies under a key the trust context admits for artifact-seal (the export's own key is only a candidate). */
function pinnedSeal(digestHex: string, signatureB64: string, signature: string, candidate: string, trust: TrustContext): boolean {
  const check = checkDigestSignature({ signature, purpose: "artifact-seal", candidates: [candidate, ...admittedListKeys(trust, "artifact-seal")], context: trust, digestHex, signatureB64 });
  return check.verified && check.admission.status === "admitted";
}

function verifySegment(entry: WormIndex["segments"][number], byKey: Map<string, Buffer | null>, signer: string, trust: TrustContext, errors: string[]): { last: string; prev: string | null } | null {
  const [data, manifestBytes, sigBytes] = [entry.segment, entry.manifest, entry.signature].map((key) => byKey.get(key) ?? null);
  if (!data || !manifestBytes || !sigBytes) { errors.push(`segment ${entry.segmentId}: objects missing or altered`); return null; }
  const manifest = retentionSegmentManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  const sig = retentionSegmentSignatureSchema.parse(JSON.parse(sigBytes.toString("utf8")));
  if (manifest.segmentFileSha256 !== sha256Hex(data)) errors.push(`segment ${entry.segmentId}: segment sha256 does not match its manifest`);
  if (sig.digestSha256 !== sha256Hex(manifestBytes) || !pinnedSeal(sig.digestSha256, sig.signature, `${entry.segmentId} manifest.sig`, signer, trust)) {
    errors.push(`segment ${entry.segmentId}: manifest signature does not verify under a key the trust list pins for artifact-seal`);
  }
  const events = gunzipSync(data, { maxOutputLength: 256 * 1024 * 1024 }).toString("utf8").split("\n").filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvidenceEvent);
  let previous: string | null = null;
  for (const event of events) {
    if (previous !== null && event.prev_event_hash !== previous) errors.push(`segment ${entry.segmentId}: event ${event.id} breaks the chain`);
    const recomputed = recomputeEventHash(null, event, errors);
    if (recomputed !== event.event_hash) errors.push(`segment ${entry.segmentId}: event ${event.id} event_hash mismatch`);
    previous = event.event_hash;
  }
  if (events[0]?.event_hash !== manifest.firstEventHash || events.at(-1)?.event_hash !== manifest.lastEventHash) {
    errors.push(`segment ${entry.segmentId}: first or last event hash differs from its manifest`);
  }
  return { last: manifest.lastEventHash, prev: manifest.prevSegmentLastEventHash };
}

/**
 * Verifies a downloaded export offline: `objectsDir/<key>` for every key in the index. `trustList` is a signed trust
 * list file (its roots pinned as for any `--trust-list`); `trust` replaces it in tests and embedders.
 */
export function verifyWormExport(p: { indexFile: string; objectsDir: string; trustList: string; trust?: TrustContext }): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let signed: z.infer<typeof signedIndexSchema>;
  try {
    signed = signedIndexSchema.parse(JSON.parse(readFileSync(p.indexFile, "utf8")));
  } catch {
    return { ok: false, errors: ["worm-export-index.json is not a signed AMC WORM export index"] };
  }
  let trust: TrustContext;
  try {
    trust = p.trust ?? loadTrustContext({ trustLists: [p.trustList] });
  } catch (error) {
    return { ok: false, errors: [`trust list refused: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const digest = sha256Hex(canonicalize(signed.index));
  const signer = signed.index.signerPublicKeyPem;
  if (digest !== signed.digestSha256 || !pinnedSeal(digest, signed.signature, "worm-export-index.json", signer, trust)) {
    errors.push("index signature does not verify under a key the trust list pins for artifact-seal");
  }
  const byKey = new Map(signed.index.objects.map((object) => [object.key, readObject(p.objectsDir, object, errors)] as const));
  let previousLast: string | null = null;
  for (const entry of signed.index.segments) {
    try {
      const chain = verifySegment(entry, byKey, signer, trust, errors);
      if (chain && previousLast !== null && chain.prev !== previousLast) errors.push(`segment ${entry.segmentId} does not continue the previous segment`);
      previousLast = chain?.last ?? previousLast;
    } catch {
      errors.push(`segment ${entry.segmentId}: unreadable`);
    }
  }
  if (signed.index.sideTables === undefined) {
    errors.push("side tables: this export carries no ledger side-table segment, so it does not cover A4 or the action journal");
  } else {
    const [data, manifest] = [signed.index.sideTables.data, signed.index.sideTables.manifest].map((key) => byKey.get(key) ?? null);
    if (!data || !manifest) errors.push("side tables: objects missing or altered");
    else verifySideTableSegment(data, manifest, errors);
  }
  return { ok: errors.length === 0, errors };
}


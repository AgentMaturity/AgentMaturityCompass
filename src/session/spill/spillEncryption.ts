/** Read-only key selection and the existing authenticated blob format for spills. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../../crypto/keys.js";
import { verifySignedDigest } from "../../crypto/signing/signer.js";
import { opsPolicyPath, opsPolicySigPath } from "../../ops/policy.js";
import { blobCurrentKeyPath, blobCurrentKeySigPath, readBlobKeyMaterial } from "../../storage/blobs/blobKeys.js";
import { blobKeyCurrentSchema, blobKeyCurrentSigSchema } from "../../storage/blobs/blobSchema.js";
import { decodeBlobV1, decryptBlobV1, encodeBlobV1, encryptBlobV1, type BlobEnvelopeV1 } from "../../storage/blobs/blobEncryptor.js";
import { sha256Hex } from "../../utils/hash.js";
import { parseSpillLocator, type SpillRefV2 } from "./spillTypes.js";

// Exact overhead of AMC_BLOB_V1: magic, version, nonce, AAD hash, plaintext
// hash, ciphertext length, and GCM tag. The ciphertext is plaintext-sized.
export const SPILL_ENVELOPE_OVERHEAD = Buffer.byteLength("AMC_BLOB_V1", "ascii") + 4 + 12 + 32 + 32 + 4 + 16;

export class SpillKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpillKeyUnavailableError";
  }
}

function requireVaultMode(version?: number): void {
  if (process.env.AMC_NO_SIGN === "1") {
    throw new SpillKeyUnavailableError("encrypted spills require vault-backed keys; AMC_NO_SIGN disables this access");
  }
  if (version !== undefined && (!Number.isSafeInteger(version) || version <= 0 || version > 0xffffffff)) {
    throw new SpillKeyUnavailableError("encrypted spills require a positive uint32 vault key version");
  }
}

/** Read a bounded exact metadata snapshot, never following the file itself. */
function readKeyMetadata(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.size > 65_536) throw new Error("unsafe blob key metadata file");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      throw new Error("blob key metadata changed before reading");
    }
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error("blob key metadata was truncated");
      offset += count;
    }
    const after = fstatSync(fd);
    const named = lstatSync(path);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
        after.nlink !== 1 || named.dev !== opened.dev || named.ino !== opened.ino) throw new Error("blob key metadata changed while reading");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function writerKey(workspace: string): { keyVersion: number; key: Buffer } {
  requireVaultMode();
  try {
    // Parse precisely the bytes whose digest is verified. A separate verify-
    // then-load call would leave selection dependent on a second file read.
    const metadata = readKeyMetadata(blobCurrentKeyPath(workspace));
    const signature = blobKeyCurrentSigSchema.parse(JSON.parse(readKeyMetadata(blobCurrentKeySigPath(workspace)).toString("utf8")));
    const digest = sha256Hex(metadata);
    if (digest !== signature.digestSha256 || !verifyHexDigestAny(digest, signature.signature, getPublicKeyHistory(workspace, "auditor"))) {
      throw new Error("blob key metadata signature verification failed");
    }
    const current = blobKeyCurrentSchema.parse(JSON.parse(metadata.toString("utf8")));
    requireVaultMode(current.keyVersion);
    return { keyVersion: current.keyVersion, key: readBlobKeyMaterial(workspace, current.keyVersion) };
  } catch (error) {
    if (error instanceof SpillKeyUnavailableError) throw error;
    throw new SpillKeyUnavailableError(`encrypted spill key unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const spillWritePolicySchema = z.object({
  opsPolicy: z.object({
    encryption: z.object({ blobEncryptionEnabled: z.boolean() }),
    retention: z.object({ maxBlobBytes: z.number().int().positive().max(0xffffffff) })
  })
});
const policySignatureSchema = z.object({
  digestSha256: z.string().regex(/^[0-9a-f]{64}$/).length(64),
  signature: z.string().min(1),
  envelope: z.unknown().optional()
});

function signedWritePolicy(workspace: string): z.infer<typeof spillWritePolicySchema>["opsPolicy"] {
  const bytes = readKeyMetadata(opsPolicyPath(workspace));
  const signature = policySignatureSchema.parse(JSON.parse(readKeyMetadata(opsPolicySigPath(workspace)).toString("utf8")));
  const digest = sha256Hex(bytes);
  // Preserve the existing ops-policy verifier's envelope/legacy signature
  // compatibility while authenticating precisely the YAML parsed below.
  if (digest !== signature.digestSha256 || !(verifySignedDigest({ workspace, digestHex: digest, signed: signature }) ||
      verifyHexDigestAny(digest, signature.signature, getPublicKeyHistory(workspace, "auditor")))) {
    throw new Error("spill operations policy signature verification failed");
  }
  return spillWritePolicySchema.parse(YAML.parse(bytes.toString("utf8"))).opsPolicy;
}

export function encryptSpillBytes(workspace: string, locator: string, plaintext: Buffer): {
  encoded: Buffer; keyVersion: number; encodedSha256: string;
} {
  if (parseSpillLocator(locator)?.version !== 2) throw new Error("encrypted spills require a v2 locator");
  const policy = signedWritePolicy(workspace);
  if (!policy.encryption.blobEncryptionEnabled) throw new Error("blob encryption is disabled by the operations policy");
  if (plaintext.length > 0xffffffff || plaintext.length > policy.retention.maxBlobBytes) {
    throw new Error("spill exceeds the operations policy maximum blob size");
  }
  const { keyVersion, key } = writerKey(workspace);
  try {
    const encoded = encodeBlobV1(encryptBlobV1({ blobId: locator, keyVersion, key, plaintext }));
    return { encoded, keyVersion, encodedSha256: sha256Hex(encoded) };
  } finally {
    key.fill(0);
  }
}

/** Ciphertext transport checks against an already authenticated signed ref. */
export function validateSpillEnvelope(ref: SpillRefV2, encoded: Buffer): BlobEnvelopeV1 {
  if (ref.locator === null || parseSpillLocator(ref.locator)?.version !== 2 || ref.format !== "amc-blob-v1" ||
      ref.keyVersion === null || !Number.isSafeInteger(ref.keyVersion) || ref.keyVersion <= 0 || ref.keyVersion > 0xffffffff ||
      !Number.isSafeInteger(ref.bytes) || ref.bytes < 0 || ref.bytes > 0xffffffff ||
      encoded.length !== ref.encodedBytes || encoded.length !== ref.bytes + SPILL_ENVELOPE_OVERHEAD ||
      sha256Hex(encoded) !== ref.encodedSha256) throw new Error("encrypted spill does not match its signed envelope commitment");
  const envelope = decodeBlobV1(encoded, ref.locator);
  if (envelope.keyVersion !== ref.keyVersion || envelope.payloadSha256 !== ref.contentSha256 ||
      envelope.ciphertext.length !== ref.bytes || envelope.aadHash.toString("hex") !== sha256Hex(`${ref.locator}:${ref.keyVersion}`)) {
    throw new Error("encrypted spill envelope metadata does not match its signed reference");
  }
  return envelope;
}

export function decryptSpillBytes(workspace: string, ref: SpillRefV2, encoded: Buffer): Buffer {
  const envelope = validateSpillEnvelope(ref, encoded);
  requireVaultMode(envelope.keyVersion);
  let key: Buffer;
  try {
    // Historical reads use their committed version, independent of rotation.
    key = readBlobKeyMaterial(workspace, envelope.keyVersion);
  } catch (error) {
    throw new SpillKeyUnavailableError(`encrypted spill key unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const plaintext = decryptBlobV1({ blobId: ref.locator!, key, envelope });
    if (plaintext.length !== ref.bytes || sha256Hex(plaintext) !== ref.contentSha256) throw new Error("spill plaintext commitment mismatch");
    return plaintext;
  } finally {
    key.fill(0);
  }
}

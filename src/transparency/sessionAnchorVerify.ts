/**
 * The OFFLINE half of P2.4 stage 2.
 *
 * Everything here runs from the proof document alone: no workspace, no `.amc`,
 * no key history on disk, no network. That is enforced by what this module is
 * allowed to import — schemas, `canonicalize`, `sha256Hex`, the two pure Merkle
 * helpers, and `node:crypto`. It deliberately does NOT import `crypto/keys.ts`,
 * whose module graph reaches the vault: a verifier that pulls in workspace code
 * tends to acquire a workspace dependency later without anyone noticing, and the
 * property being sold here is precisely that it has none.
 *
 * The chain of custody it establishes, from the bottom up:
 *
 *   sealed turn hashes -> session merkle root  (recomputed)
 *   descriptor         -> descriptor sha256    (recomputed, canonical bytes)
 *   descriptor sha256  -> transparency entry   (the entry's artifact.sha256)
 *   entry fields       -> entry hash           (recomputed from the pre-image)
 *   entry hash + path  -> merkle root          (recomputed)
 *   merkle root        -> signed root file     (the file's own `root` field)
 *   signed root bytes  -> auditor signature    (ed25519)
 *   auditor key        -> the caller's pin     (fingerprint equality)
 *
 * The last step is not optional. Every signature in the bundle is checked against
 * a public key that is ALSO in the bundle, so without an out-of-band fingerprint
 * the document proves only that someone consistently signed their own claims —
 * the same circularity ADR-0007 fixed for the monitor key. Hence
 * `expectedAuditorKeyFingerprint` is a required parameter rather than an option.
 */
import { verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { merkleRoot as sessionMerkleRoot } from "../session/sessionMerkle.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { verifyEntryInclusion } from "./merkle.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import type { SignatureEnvelope } from "../crypto/signing/signerTypes.js";
import {
  SESSION_ROOT_ARTIFACT_KIND,
  sessionAnchorProofSchema,
  signedMerkleRootRowSchema,
  type SessionAnchorProof,
  type SignedMerkleRootRow
} from "./sessionAnchorSchema.js";

export interface SessionAnchorVerification {
  readonly ok: boolean;
  readonly errors: readonly string[];
  /** Populated once the document parses, so a failing verdict still names the session. */
  readonly sessionId: string | null;
  /** The root over the session's sealed turns, as recomputed here. */
  readonly sessionMerkleRoot: string | null;
  /** The transparency root the anchor was proven against. */
  readonly anchoredMerkleRoot: string | null;
  /** Number of leaves the signed root covers, for reporting the log's size at anchor time. */
  readonly leafCount: number | null;
  /** The auditor key the bundle carries, for the caller's issuer admission (P0-51); it never vouches for itself. */
  readonly auditorPublicKeyPem: string | null;
}

export interface SessionAnchorVerifyParams {
  readonly proof: unknown;
  /**
   * sha256 of the auditor public key PEM, obtained out of band (a published
   * fingerprint, a certificate, a prior audit). Required: see the header.
   */
  readonly expectedAuditorKeyFingerprint: string;
}

/**
 * Raw ed25519 verification over a hex digest.
 *
 * Mirrors `verifyHexDigest` in crypto/keys.ts rather than importing it, to keep
 * this module's import graph free of the vault. The two must agree, and they do
 * because both are the same three-line call into node:crypto; a divergence would
 * surface immediately as every signature failing.
 */
function verifyHexDigestOffline(digestHex: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return verify(null, Buffer.from(digestHex, "hex"), publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/**
 * Recomputes a transparency entry's hash from its own fields.
 *
 * Must stay byte-identical to the pre-image `appendTransparencyEntry` hashes.
 * `id` is included only when present, because it is written conditionally there
 * and `canonicalize` distinguishes an absent key from a null one.
 */
function recomputeEntryHash(entry: SessionAnchorProof["entry"]): string {
  return sha256Hex(
    canonicalize({
      v: 1,
      ts: entry.ts,
      type: entry.type,
      agentId: entry.agentId,
      artifact: {
        kind: entry.artifact.kind,
        sha256: entry.artifact.sha256,
        ...(entry.artifact.id ? { id: entry.artifact.id } : {})
      },
      prev: entry.prev
    })
  );
}

function verifyDescriptor(proof: SessionAnchorProof, errors: string[]): void {
  const { descriptor, entry } = proof;
  const recomputedRoot = sessionMerkleRoot(descriptor.sealEventHashes);
  if (recomputedRoot !== descriptor.sessionMerkleRoot) {
    errors.push(
      `session merkle root mismatch: sealed turns hash to ${recomputedRoot}, descriptor claims ${descriptor.sessionMerkleRoot}`
    );
  }
  if (descriptor.sealCount !== descriptor.sealEventHashes.length) {
    errors.push(
      `descriptor claims ${descriptor.sealCount} seals but carries ${descriptor.sealEventHashes.length} seal hashes`
    );
  }
  const descriptorSha256 = sha256Hex(canonicalize(descriptor));
  if (entry.artifact.sha256 !== descriptorSha256) {
    errors.push(
      `transparency entry commits to ${entry.artifact.sha256} but the descriptor hashes to ${descriptorSha256}`
    );
  }
  if (entry.artifact.kind !== SESSION_ROOT_ARTIFACT_KIND) {
    errors.push(`transparency entry is a ${entry.artifact.kind} anchor, not a ${SESSION_ROOT_ARTIFACT_KIND} anchor`);
  }
  if (entry.artifact.id !== descriptor.sessionId) {
    errors.push(`transparency entry names session ${entry.artifact.id ?? "(none)"}, descriptor is ${descriptor.sessionId}`);
  }
}

function verifyInclusion(proof: SessionAnchorProof, errors: string[]): void {
  const recomputedEntryHash = recomputeEntryHash(proof.entry);
  if (recomputedEntryHash !== proof.entry.hash) {
    errors.push(`transparency entry hash mismatch: recomputed ${recomputedEntryHash}, found ${proof.entry.hash}`);
  }
  // P1-26: the tree and the RFC 9162 tree size come from the signed root; verifySignedRoot reports one that does not parse.
  let row: SignedMerkleRootRow | null = null;
  try {
    row = signedMerkleRootRowSchema.parse(JSON.parse(proof.signedRoot.fileText) as unknown);
  } catch {
    row = null;
  }
  if (
    !verifyEntryInclusion({
      algorithm: row?.algorithm ?? "amc-legacy-v1",
      entryHash: proof.entry.hash,
      leafIndex: proof.inclusion.leafIndex,
      treeSize: row?.leafCount,
      proofPath: [...proof.inclusion.proofPath],
      root: proof.inclusion.merkleRoot
    })
  ) {
    errors.push(`inclusion proof does not resolve to merkle root ${proof.inclusion.merkleRoot}`);
  }
}

/**
 * Ties the proven Merkle root to a root someone actually signed.
 *
 * Without this the bundle would prove only "these leaves form this tree", which
 * any author can produce for any set of leaves they like. Returns the leaf count
 * the signed root covers so the caller can report it.
 */
function verifySignedRoot(proof: SessionAnchorProof, errors: string[]): number | null {
  let row: SignedMerkleRootRow;
  try {
    row = signedMerkleRootRowSchema.parse(JSON.parse(proof.signedRoot.fileText) as unknown);
  } catch (error) {
    errors.push(`signed root file is not a valid merkle root row: ${String(error)}`);
    return null;
  }
  if (row.root !== proof.inclusion.merkleRoot) {
    errors.push(`proven root ${proof.inclusion.merkleRoot} is not the signed root ${row.root}`);
  }
  // A leaf beyond the signed tree's width cannot be in it, whatever the path
  // says. Catches a proof spliced from a larger tree onto a smaller signed root.
  if (proof.inclusion.leafIndex >= row.leafCount) {
    errors.push(`leaf index ${proof.inclusion.leafIndex} is outside the signed tree of ${row.leafCount} leaves`);
  }

  const digest = sha256Hex(Buffer.from(proof.signedRoot.fileText, "utf8"));
  const signature = proof.signedRoot.signature;
  if (digest !== signature.digestSha256) {
    errors.push(`signed root digest mismatch: file hashes to ${digest}, signature covers ${signature.digestSha256}`);
    return row.leafCount;
  }
  const envelope = signature.envelope;
  const signatureValid = envelope
    ? signature.signature === envelope.sigB64 &&
      verifySignatureEnvelope(digest, envelope as SignatureEnvelope, {
        trustedPublicKeys: [proof.auditorPublicKeyPem],
        requireTrustedKey: true
      })
    : verifyHexDigestOffline(digest, signature.signature, proof.auditorPublicKeyPem);
  if (!signatureValid) {
    errors.push("signed root signature invalid");
  }
  return row.leafCount;
}

function verifyTrustAnchor(proof: SessionAnchorProof, expected: string, errors: string[]): void {
  const recomputed = sha256Hex(Buffer.from(proof.auditorPublicKeyPem, "utf8"));
  if (recomputed !== proof.auditorKeyFingerprint) {
    errors.push(
      `bundle fingerprint ${proof.auditorKeyFingerprint} does not match its own auditor key (${recomputed})`
    );
  }
  if (recomputed !== expected) {
    errors.push(`auditor key fingerprint mismatch: expected ${expected}, bundle carries ${recomputed}`);
  }
}

/**
 * Verify a session anchor proof with nothing but the document and a pinned
 * auditor fingerprint.
 *
 * Every rule is evaluated (no short-circuit after the first failure) so a
 * tampered bundle reports the full shape of the tampering rather than the one
 * check that happened to run first.
 */
export function verifySessionAnchorProof(params: SessionAnchorVerifyParams): SessionAnchorVerification {
  const errors: string[] = [];
  let proof: SessionAnchorProof;
  try {
    proof = sessionAnchorProofSchema.parse(params.proof);
  } catch (error) {
    return {
      ok: false,
      errors: [`invalid session anchor proof: ${String(error)}`],
      sessionId: null,
      sessionMerkleRoot: null,
      anchoredMerkleRoot: null,
      leafCount: null,
      auditorPublicKeyPem: null
    };
  }
  if (!/^[0-9a-f]{64}$/i.test(params.expectedAuditorKeyFingerprint)) {
    // An empty or malformed pin would silently match nothing (or, worse, be
    // read as "no pin requested"). Refusing is the fail-closed reading.
    errors.push("expectedAuditorKeyFingerprint must be a sha256 hex digest");
  } else {
    verifyTrustAnchor(proof, params.expectedAuditorKeyFingerprint.toLowerCase(), errors);
  }
  verifyDescriptor(proof, errors);
  verifyInclusion(proof, errors);
  const leafCount = verifySignedRoot(proof, errors);

  return {
    ok: errors.length === 0,
    errors,
    sessionId: proof.descriptor.sessionId,
    sessionMerkleRoot: proof.descriptor.sessionMerkleRoot,
    anchoredMerkleRoot: proof.inclusion.merkleRoot,
    leafCount,
    auditorPublicKeyPem: proof.auditorPublicKeyPem
  };
}

/** Same verification, reading the document from a file. The only fs call here. */
export function verifySessionAnchorProofFile(params: {
  readonly file: string;
  readonly expectedAuditorKeyFingerprint: string;
}): SessionAnchorVerification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(params.file, "utf8"));
  } catch (error) {
    return {
      ok: false,
      errors: [`cannot read session anchor proof: ${String(error)}`],
      sessionId: null,
      sessionMerkleRoot: null,
      anchoredMerkleRoot: null,
      leafCount: null,
      auditorPublicKeyPem: null
    };
  }
  return verifySessionAnchorProof({
    proof: parsed,
    expectedAuditorKeyFingerprint: params.expectedAuditorKeyFingerprint
  });
}

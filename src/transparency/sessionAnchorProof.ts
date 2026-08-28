/**
 * Exports a self-contained, offline-verifiable proof that a session was
 * anchored in the transparency log (plan P2.4: "a session's inclusion proof
 * verifies offline").
 *
 * "Offline" is taken literally. The bundle is one JSON document, and
 * `sessionAnchorVerify.ts` checks it with node:crypto and nothing else — no
 * workspace, no `.amc`, no tar tool, no network. That constraint is what forces
 * the bundle to carry the signed root file's EXACT bytes rather than a parsed
 * copy: the root signature is over the digest of those bytes, so a re-serialised
 * root would verify on the machine that wrote it and nowhere else.
 *
 * The exporter is deliberately the strict half of the pair. It refuses to issue
 * a proof unless the workspace's Merkle index verifies and the proof's root is
 * the root that was actually signed — because a proof is generated from
 * `log.jsonl` while a verifier checks it against `current.root.json`, so an
 * exporter that skipped this check would hand out proofs against a root nobody
 * signed. That is the exact failure stage 1 made fail-loud on the append side;
 * this is the same hole on the export side.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  generateTransparencyInclusionProof,
  verifyTransparencyMerkle
} from "./merkleIndexStore.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath } from "./merklePaths.js";
import { verifyTransparencyLog } from "./logChain.js";
import { verifyLedgerIntegrity } from "../ledger/ledgerVerification.js";
import { merkleProofSignatureSchema } from "./proofSchema.js";
import {
  findSessionAnchorEntries,
  readAnchoredSessionDescriptor,
  sessionRootDescriptorSha256
} from "./sessionAnchor.js";
import {
  sessionAnchorProofSchema,
  signedMerkleRootRowSchema,
  type SessionAnchorProof,
  type SignedMerkleRootRow
} from "./sessionAnchorSchema.js";
import { readSessionRootDescriptor } from "./sessionRootDescriptor.js";
import { verifySessionAnchorProof } from "./sessionAnchorVerify.js";

/** Thrown when a proof cannot be issued. Never downgraded to a warning. */
export class SessionAnchorProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionAnchorProofError";
  }
}

export interface SessionAnchorProofParams {
  readonly workspace: string;
  readonly sessionId: string;
}

/** sha256 of the auditor public key PEM — the fingerprint a holder pins. */
export function auditorKeyFingerprint(workspace: string): string {
  const pem = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  if (pem.length === 0) {
    throw new SessionAnchorProofError("workspace has no auditor public key");
  }
  return sha256Hex(Buffer.from(pem, "utf8"));
}

function readSignedRoot(workspace: string): { fileText: string; row: SignedMerkleRootRow } {
  const rootPath = merkleCurrentRootPath(workspace);
  if (!pathExists(rootPath)) {
    throw new SessionAnchorProofError("workspace has no signed transparency merkle root");
  }
  const fileText = readUtf8(rootPath);
  // Read as bytes for the digest, as text for the bundle, and assert they agree.
  // A workspace written with a non-UTF-8 byte in the root file would otherwise
  // produce a bundle that cannot reproduce the signed digest anywhere else.
  if (sha256Hex(readFileSync(rootPath)) !== sha256Hex(Buffer.from(fileText, "utf8"))) {
    throw new SessionAnchorProofError("signed merkle root file is not valid UTF-8 and cannot be carried offline");
  }
  return { fileText, row: signedMerkleRootRowSchema.parse(JSON.parse(fileText) as unknown) };
}

/**
 * Builds the proof document for the most recent anchor of a session.
 *
 * The most recent, not the first: re-anchoring only happens when the descriptor
 * changed, and the newest anchor is the one whose leaf the current tree still
 * contains at a stable index.
 */
export function buildSessionAnchorProof(params: SessionAnchorProofParams): SessionAnchorProof {
  const entries = findSessionAnchorEntries(params.workspace, params.sessionId);
  const entry = entries[entries.length - 1];
  if (entry === undefined) {
    throw new SessionAnchorProofError(`session ${params.sessionId} has no transparency anchor`);
  }

  // The index must be sound before a proof is cut from it. `verifyTransparencyMerkle`
  // recomputes the root from log.jsonl, checks the root signature, and reports a
  // pending lag left by a failed append — all three are reasons a proof issued
  // now would not verify later.
  const merkle = verifyTransparencyMerkle(params.workspace);
  if (!merkle.ok) {
    throw new SessionAnchorProofError(
      `transparency merkle index does not verify, refusing to issue a proof: ${merkle.errors.join("; ")}`
    );
  }

  // The Merkle index proves the LEAVES agree with the log's entry hashes; it
  // says nothing about whether the log's own hash chain is intact. Without this
  // gate a proof could be cut from a log whose chain is provably broken — the
  // bundle would verify offline while the log it came from does not, which is
  // exactly the gap between "internally consistent" and "trustworthy" this
  // phase exists to close.
  const log = verifyTransparencyLog(params.workspace);
  if (!log.ok) {
    throw new SessionAnchorProofError(
      `transparency log does not verify, refusing to issue a proof: ${log.errors.join("; ")}`
    );
  }

  // AND THE LEDGER THE SESSION LIVES IN. The two gates above check the log this
  // proof is published INTO; neither says anything about the evidence it is
  // published ABOUT. Without this a proof could be cut from a workspace where
  // `amc verify` fails — the bundle would verify offline while the ledger behind
  // it does not, which is the same gap the transparency-log gate above exists to
  // close, left open on the side that actually holds the evidence.
  //
  // The session's own rows are already verified by `readSessionRootDescriptor`
  // (hashes, signatures, envelope chain, seal). This is the WIDER claim: that
  // the ledger around them is intact, so the session's position in it means
  // what it appears to mean. That is why an unrelated broken session refuses
  // this proof — a third party relying on it is relying on the whole record.
  const ledger = verifyLedgerIntegrity(params.workspace);
  if (!ledger.ok) {
    throw new SessionAnchorProofError(
      "the evidence ledger does not verify, refusing to issue a proof: "
      + ledger.errors.slice(0, 5).join("; ")
      + (ledger.errors.length > 5 ? ` (and ${ledger.errors.length - 5} more)` : "")
    );
  }

  const descriptor =
    readAnchoredSessionDescriptor(params.workspace, params.sessionId, entry.artifact.sha256) ??
    readSessionRootDescriptor(params.workspace, params.sessionId);
  // The stored copy is digest-checked on the way in, but the rebuild fallback is
  // not: a session whose rows were archived or pruned since the anchor rebuilds
  // to a different descriptor. Saying so beats shipping a bundle whose digest
  // silently disagrees with the entry it claims to be proven by.
  const rebuiltSha256 = sessionRootDescriptorSha256(descriptor);
  if (rebuiltSha256 !== entry.artifact.sha256) {
    throw new SessionAnchorProofError(
      `session ${params.sessionId} now describes as ${rebuiltSha256} but was anchored as ${entry.artifact.sha256}`
    );
  }
  const inclusion = generateTransparencyInclusionProof(params.workspace, entry.hash);
  const signedRoot = readSignedRoot(params.workspace);
  if (inclusion.merkleRoot !== signedRoot.row.root) {
    throw new SessionAnchorProofError(
      `inclusion proof root ${inclusion.merkleRoot} is not the signed root ${signedRoot.row.root}`
    );
  }

  const sigPath = merkleCurrentRootSigPath(params.workspace);
  if (!pathExists(sigPath)) {
    throw new SessionAnchorProofError("workspace has no signature over the transparency merkle root");
  }
  const pem = getPublicKeyHistory(params.workspace, "auditor")[0] ?? "";

  return sessionAnchorProofSchema.parse({
    v: 1,
    ts: Date.now(),
    descriptor,
    entry,
    inclusion: {
      leafIndex: inclusion.leafIndex,
      proofPath: inclusion.proofPath,
      merkleRoot: inclusion.merkleRoot
    },
    signedRoot: {
      fileText: signedRoot.fileText,
      signature: merkleProofSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown)
    },
    auditorPublicKeyPem: pem,
    auditorKeyFingerprint: sha256Hex(Buffer.from(pem, "utf8"))
  });
}

export interface SessionAnchorProofExport {
  readonly outFile: string;
  readonly proof: SessionAnchorProof;
  /** The fingerprint the recipient must pin when verifying. */
  readonly auditorKeyFingerprint: string;
}

/**
 * Writes the proof document, then verifies it the way a recipient will.
 *
 * The self-check runs the OFFLINE verifier over the bytes just written, pinned
 * to this workspace's auditor fingerprint. It costs one signature verification
 * and closes the gap where an exporter emits a file that only its author can
 * verify — which is the failure mode an offline-proof feature is most likely to
 * ship with, because every test written against the exporter's own objects
 * would still pass.
 */
export function exportSessionAnchorProof(
  params: SessionAnchorProofParams & { outFile: string }
): SessionAnchorProofExport {
  const proof = buildSessionAnchorProof(params);
  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, `${JSON.stringify(proof, null, 2)}\n`, 0o644);

  const fingerprint = auditorKeyFingerprint(params.workspace);
  const verdict = verifySessionAnchorProof({
    proof: JSON.parse(readUtf8(outFile)) as unknown,
    expectedAuditorKeyFingerprint: fingerprint
  });
  if (!verdict.ok) {
    throw new SessionAnchorProofError(
      `exported proof does not verify offline: ${verdict.errors.join("; ")}`
    );
  }
  return { outFile, proof, auditorKeyFingerprint: fingerprint };
}

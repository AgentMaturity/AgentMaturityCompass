/**
 * Wire format for P2.4 stage 2: anchoring a session's Merkle root in the
 * transparency log, and proving that anchor offline.
 *
 * Two artifacts are described here and they have different jobs.
 *
 * The DESCRIPTOR is what actually gets anchored. It is a small, canonical
 * summary of one closed session — the ordered turn-seal event hashes and the
 * root over them — and its sha256 is the `artifact.sha256` of a transparency
 * entry. It deliberately does NOT carry the session's content: a transparency
 * log is public by intent, so anchoring conversation bytes would publish them.
 * Every field in it is RECOMPUTED from the stored rows by the builder; nothing
 * is copied from a claim a row makes about itself.
 *
 * The PROOF BUNDLE is self-contained by design. `verifyTransparencyProofBundle`
 * needs a tar tool and a workspace-shaped directory; this one is a single JSON
 * document verified by `sessionAnchorVerify.ts` with nothing but node:crypto,
 * because "a session's inclusion proof verifies OFFLINE" (plan P2.4) is only
 * true if a regulator with the file and no AMC workspace can check it.
 */
import { z } from "zod";
import { transparencyEntrySchema } from "./logSchema.js";
import { merkleProofSignatureSchema } from "./proofSchema.js";

/** The transparency `artifact.kind` a session-root anchor is filed under. */
export const SESSION_ROOT_ARTIFACT_KIND = "session-root";

/** The transparency entry `type` a session-root anchor carries. */
export const SESSION_ROOT_ENTRY_TYPE = "SESSION_ROOT_ANCHOR";

/**
 * Which lifecycle states may be anchored.
 *
 * Only `closed` today. An INTERRUPTED session (P2.2's three-way verdict) has a
 * real root too and anchoring it would be useful, but it has no `session/close`
 * event to bound the window — so the honest move is to refuse it loudly and
 * leave this union as the place a later stage adds the case, rather than to
 * anchor a partial session under a name that reads as complete.
 */
export const sessionLifecycleSchema = z.enum(["closed"]);

/**
 * STRICT on purpose. This object's canonical bytes are what the transparency
 * entry's digest covers, so a reader must be able to say "what I see is what was
 * hashed". A permissive schema would silently drop an unknown key, hash the
 * remainder, and report a clean verdict over a document that visibly says
 * something the verifier never looked at. Failing closed on an unrecognised
 * field also means a future descriptor version cannot be quietly mis-read by an
 * older verifier — it is rejected instead.
 */
export const sessionRootDescriptorSchema = z.strictObject({
  v: z.literal(1),
  sessionId: z.string().min(1),
  lifecycle: sessionLifecycleSchema,
  runtime: z.string().min(1),
  agentId: z.string().min(1),
  startedTs: z.number().int(),
  endedTs: z.number().int(),
  /** Session events in the spine, including `session/open` and `session/close`. */
  eventCount: z.number().int().min(1),
  turnCount: z.number().int().min(0),
  sealCount: z.number().int().min(0),
  /** `turn/seal` event hashes in commit order — the leaves of the session root. */
  sealEventHashes: z.array(z.string().length(64)),
  /** merkleRoot(sealEventHashes), recomputed; never the value session/close claims. */
  sessionMerkleRoot: z.string().length(64),
  openEventHash: z.string().length(64),
  closeEventHash: z.string().length(64),
  /**
   * sha256 of the monitor public key PEM whose signatures were checked when this
   * descriptor was built. It names the identity that produced the session, so an
   * offline holder can tell whether the anchor belongs to the workspace they
   * expect rather than to some other workspace that happened to sign well.
   */
  monitorKeyFingerprint: z.string().length(64)
});

export const sessionAnchorInclusionSchema = z.object({
  leafIndex: z.number().int().min(0),
  proofPath: z.array(
    z.object({
      position: z.enum(["left", "right"]),
      hash: z.string().length(64)
    })
  ),
  merkleRoot: z.string().length(64)
});

export const sessionAnchorProofSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  descriptor: sessionRootDescriptorSchema,
  /** The transparency entry that anchored the descriptor, verbatim. */
  entry: transparencyEntrySchema,
  inclusion: sessionAnchorInclusionSchema,
  signedRoot: z.object({
    /**
     * The EXACT bytes of `current.root.json`, carried as text.
     *
     * The root signature is over sha256 of the file's bytes, so a bundle that
     * re-serialised the parsed object would fail verification the first time
     * key order or spacing differed. Shipping the bytes removes the guesswork.
     */
    fileText: z.string().min(1),
    signature: merkleProofSignatureSchema
  }),
  /** The auditor public key PEM the root signature is checked against. */
  auditorPublicKeyPem: z.string().min(1),
  /** sha256 of that PEM. Advisory: the verifier recomputes it and pins it. */
  auditorKeyFingerprint: z.string().length(64)
});

/** Shape of `current.root.json`, re-declared so the offline verifier can parse it. */
export const signedMerkleRootRowSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  leafCount: z.number().int().min(0),
  root: z.string().length(64),
  lastEntryHash: z.string().default("")
});

export type SessionRootDescriptor = z.infer<typeof sessionRootDescriptorSchema>;
export type SessionAnchorInclusion = z.infer<typeof sessionAnchorInclusionSchema>;
export type SessionAnchorProof = z.infer<typeof sessionAnchorProofSchema>;
export type SignedMerkleRootRow = z.infer<typeof signedMerkleRootRowSchema>;

import { z } from "zod";
import { MERKLE_ALGORITHMS } from "./merkle.js";

/**
 * What a transparency entry may anchor.
 *
 * Single source of truth: `appendTransparencyEntry` used to repeat this union
 * inline in its parameter type, so a kind added to one and not the other became
 * either a type error at every call site or (worse) a value the schema rejected
 * at append time, after the caller had already been told the kind was allowed.
 *
 * `session-root` (P2.4 stage 2) anchors the Merkle root of one closed agent
 * session, so a session can be proven to a third party who holds nothing but a
 * proof bundle and the signed transparency root.
 *
 * `merkle-migration` (P1-26) records the signed legacy-to-RFC 9162 migration
 * record in the hash chain, so the move cannot be undone by deleting a file.
 */
export const TRANSPARENCY_ARTIFACT_KINDS = [
  "amccert",
  "amcbundle",
  "amcbench",
  "amcaudit",
  "amcpass",
  "bom",
  "policy",
  "approval",
  "plugin",
  "garak-scan-report",
  "vulnerability-scan-report",
  "session-root",
  "merkle-migration"
] as const;

export type TransparencyArtifactKind = (typeof TRANSPARENCY_ARTIFACT_KINDS)[number];

export const transparencyEntrySchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  type: z.string().min(1),
  agentId: z.string().min(1),
  artifact: z.object({
    kind: z.enum(TRANSPARENCY_ARTIFACT_KINDS),
    sha256: z.string().length(64),
    id: z.string().min(1).optional()
  }),
  prev: z.string(),
  hash: z.string().length(64)
});

export const transparencySealSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  lastHash: z.string(),
  signerFingerprint: z.string().length(64),
  /** P1-26: the tree the Merkle index grows, re-signed on every append; absent (older seals) means amc-legacy-v1. */
  merkleAlgorithm: z.enum(MERKLE_ALGORITHMS).optional()
});

export const transparencySealSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z
    .object({
      v: z.literal(1),
      alg: z.literal("ed25519"),
      pubkeyB64: z.string().min(1),
      fingerprint: z.string().length(64),
      sigB64: z.string().min(1),
      signedTs: z.number().int(),
      signer: z.object({
        type: z.enum(["VAULT", "NOTARY"]),
        attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
        notaryFingerprint: z.string().length(64).optional()
      })
    })
    .optional()
});

export type TransparencyEntry = z.infer<typeof transparencyEntrySchema>;
export type TransparencySeal = z.infer<typeof transparencySealSchema>;
export type TransparencySealSignature = z.infer<typeof transparencySealSignatureSchema>;

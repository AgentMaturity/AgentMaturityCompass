import { z } from "zod";

export const blobIndexRowSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  blobId: z.string().min(1),
  // 0 marks a blob whose key was generated without a vault (AMC_NO_SIGN):
  // random and per-workspace, but stored beside the blobs rather than sealed.
  // Versions start at 1, so no pre-existing record carries it, and an auditor
  // reading an index can tell which blobs had the weaker protection.
  keyVersion: z.number().int().min(0),
  path: z.string().min(1),
  payloadSha256: z.string().length(64),
  encryptedBytes: z.number().int().min(0),
  prev: z.string().default(""),
  hash: z.string().length(64)
});

export type BlobIndexRow = z.infer<typeof blobIndexRowSchema>;

export const blobIndexSignatureSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  lastHash: z.string(),
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signer: z.literal("auditor")
});

export type BlobIndexSignature = z.infer<typeof blobIndexSignatureSchema>;

export const blobKeyCurrentSchema = z.object({
  v: z.literal(1),
  // 0 marks a blob whose key was generated without a vault (AMC_NO_SIGN):
  // random and per-workspace, but stored beside the blobs rather than sealed.
  // Versions start at 1, so no pre-existing record carries it, and an auditor
  // reading an index can tell which blobs had the weaker protection.
  keyVersion: z.number().int().min(0),
  createdTs: z.number().int(),
  algorithm: z.literal("AES-256-GCM")
});

export type BlobKeyCurrent = z.infer<typeof blobKeyCurrentSchema>;

export const blobKeyCurrentSigSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor")
});

export type BlobKeyCurrentSig = z.infer<typeof blobKeyCurrentSigSchema>;


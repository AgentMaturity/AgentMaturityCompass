import { z } from "zod";

export const transparencyEntrySchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  type: z.string().min(1),
  agentId: z.string().min(1),
  artifact: z.object({
    kind: z.enum([
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
      "vulnerability-scan-report"
    ]),
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
  signerFingerprint: z.string().length(64)
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

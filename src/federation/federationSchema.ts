import { z } from "zod";
import { assertSafeTarMemberPath } from "../security/safeTarArchive.js";
import { safeIdSchema } from "../utils/pathSafety.js";

/**
 * A manifest is signed by a peer, not trusted by it: its ids name directories and its file paths name files on the
 * importer's disk, so ids are one safe path segment (safeIdSchema) and file paths are relative POSIX paths inside the
 * package (P0-52).
 */
function isPackageRelativePath(value: string): boolean {
  try {
    // The canonical form only: assertSafeTarMemberPath also strips "./" and a trailing "/", which a file row never has.
    return value !== "." && assertSafeTarMemberPath({ rawPath: value, label: "federation manifest", maxPathBytes: 1024 }) === value;
  } catch {
    return false;
  }
}

const federationFilePathSchema = z.string().refine(
  isPackageRelativePath,
  "must be a relative POSIX path inside the package: no leading slash, drive letter, backslash, empty, \".\" or \"..\" segment"
);

export const federationConfigSchema = z.object({
  federation: z.object({
    version: z.literal(1),
    orgName: z.string().min(1),
    // Becomes the sourceOrgId of every exported manifest, which is a path segment on import (P0-52).
    orgId: safeIdSchema,
    publisherKeyFingerprint: z.string().length(64),
    sharePolicy: z.object({
      allowBenchmarks: z.boolean(),
      allowCerts: z.boolean(),
      allowBom: z.boolean(),
      allowTransparencyRoots: z.boolean(),
      allowPlugins: z.boolean(),
      denyEvidenceDb: z.boolean()
    })
  })
});

export const federationPeerSchema = z.object({
  v: z.literal(1),
  peerId: z.string().min(1),
  name: z.string().min(1),
  publisherPublicKeyPem: z.string().min(1),
  addedTs: z.number().int()
});

export const federationManifestSchema = z.object({
  v: z.literal(1),
  manifestId: safeIdSchema,
  createdTs: z.number().int(),
  sourceOrgName: z.string().min(1),
  sourceOrgId: safeIdSchema,
  publisherKeyFingerprint: z.string().length(64),
  files: z.array(
    z.object({
      path: federationFilePathSchema,
      sha256: z.string().length(64),
      size: z.number().int().min(0)
    })
  )
});

export const federationManifestSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("publisher")
});

export type FederationConfigFile = z.infer<typeof federationConfigSchema>;
export type FederationPeer = z.infer<typeof federationPeerSchema>;
export type FederationManifest = z.infer<typeof federationManifestSchema>;

import { z } from "zod";
import { assertSafeTarMemberPath } from "../security/safeTarArchive.js";

/**
 * A manifest is signed by a peer, not trusted by it: its ids name directories and its file paths name files on the
 * importer's disk, so they must be one safe path segment and relative POSIX paths inside the package (P0-52).
 */
export const federationIdSchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
  "must be one safe path segment of letters, digits, dot, underscore or hyphen (at most 128 characters, no leading dot)"
);

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
    orgId: z.string().min(1),
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
  manifestId: federationIdSchema,
  createdTs: z.number().int(),
  sourceOrgName: z.string().min(1),
  sourceOrgId: federationIdSchema,
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

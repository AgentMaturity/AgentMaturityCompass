import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { verifyExternalEvidence, type ExternalEvidenceAuthority } from "./externalEvidenceProfile.js";

function boundedFile(path: string, limit: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) throw new Error("Evidence input must be a bounded regular file");
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = readSync(fd, buffer, count, buffer.length - count, null);
      if (read === 0) break;
      count += read;
    }
    if (count !== before.size || fstatSync(fd).size !== before.size)
      throw new Error("Evidence input changed while being read");
    return buffer.subarray(0, count);
  } finally { closeSync(fd); }
}

/** File adapter only; authority configuration belongs to the verifier operator, never to the evidence. */
export function verifyExternalEvidenceFile(input: {
  path: string; authoritiesPath?: string; originalPath?: string; expectedNormalizedDigest?: string;
}): ReturnType<typeof verifyExternalEvidence> {
  const profile = JSON.parse(boundedFile(input.path, 16 * 1024 * 1024).toString("utf8")) as unknown;
  let authorities: ExternalEvidenceAuthority[] | undefined;
  if (input.authoritiesPath !== undefined) {
    const parsed: unknown = JSON.parse(boundedFile(input.authoritiesPath, 1024 * 1024).toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length > 256 || parsed.some((item: unknown) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return true;
      const entry = item as Record<string, unknown>;
      return Object.keys(entry).sort().join(",") !== "captureMethods,id,maxTrustTier,producers,publicKeyPem"
        || typeof entry.id !== "string" || !entry.id || typeof entry.publicKeyPem !== "string"
        || !["ATTESTED", "OBSERVED"].includes(String(entry.maxTrustTier))
        || !Array.isArray(entry.captureMethods) || entry.captureMethods.length === 0
        || entry.captureMethods.some((method: unknown) => !["producer-callback", "governed-capture"].includes(String(method)))
        || !Array.isArray(entry.producers) || entry.producers.length === 0
        || entry.producers.some((producer: unknown) => typeof producer !== "string" || !producer);
    })) throw new Error("Invalid independent authority configuration");
    authorities = parsed as ExternalEvidenceAuthority[];
  }
  return verifyExternalEvidence(profile, { authorities,
    originalBytes: input.originalPath === undefined ? undefined : boundedFile(input.originalPath, 64 * 1024 * 1024),
    expectedNormalizedDigest: input.expectedNormalizedDigest });
}

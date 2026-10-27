import { sha256Hex } from "../utils/hash.js";
import { join } from "node:path";
import { captureOrgFiles, orgPairBytes, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { standardManifestDigest } from "./standardGenerator.js";
import { standardMetaSchema, standardBundleSignatureSchema } from "./standardSchema.js";
import { standardMetaPath, standardBundleSigPath, standardSchemasDir } from "./standardRegistry.js";

/** Actual same-read local integrity view. Historical admission uses the existing literal BUNDLE verifier. */
export function captureStandardVerification(workspace: string) {
  const path = standardMetaPath(workspace), head = captureOrgFiles([path]), bytes = orgPairBytes(head, path);
  const errors: string[] = [];
  if (bytes === null) return { verified: { ok: false, errors: ["meta.json missing"], meta: null },
    assertCurrent: () => assertOrgPairsCurrent(head) };
  const meta = standardMetaSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  const sigPath = `${path}.sig`, bundlePath = standardBundleSigPath(workspace);
  const tail = captureOrgFiles([sigPath, bundlePath, ...meta.schemas.map(row => join(standardSchemasDir(workspace), row.name))]);
  const selected = { members: [...head.members, ...tail.members] };
  assertOrgPairsCurrent(selected);
  const signature = orgPairBytes(tail, sigPath);
  const metaVerdict = signature === null ? { valid: false, reason: "signature missing" }
    : verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, signature);
  if (!metaVerdict.valid) errors.push(`meta signature invalid: ${metaVerdict.reason ?? "unknown"}`);
  for (const row of meta.schemas) {
    const body = orgPairBytes(tail, join(standardSchemasDir(workspace), row.name));
    if (body === null) errors.push(`schema missing: ${row.name}`);
    else if (sha256Hex(body) !== row.sha256) errors.push(`schema digest mismatch: ${row.name}`);
  }
  const bundle = orgPairBytes(tail, bundlePath);
  if (bundle === null) errors.push("schemas.sig missing");
  else {
    const parsed = standardBundleSignatureSchema.parse(JSON.parse(bundle.toString("utf8")) as unknown);
    const digestText = Buffer.from(standardManifestDigest(meta), "utf8");
    if (parsed.digestSha256 !== sha256Hex(digestText)) errors.push("schemas.sig digest mismatch");
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", digestText, bundle).valid) errors.push("schemas.sig signature verification failed");
  }
  return { verified: { ok: errors.length === 0, errors, meta }, assertCurrent: () => assertOrgPairsCurrent(selected) };
}

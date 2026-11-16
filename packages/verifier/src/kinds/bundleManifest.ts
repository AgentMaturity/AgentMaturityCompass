/**
 * An AMC evidence bundle (.amcbundle): `manifest.json` lists every other file with its sha256 and size, and
 * `manifest.sig` signs the raw SHA-256 digest of the manifest bytes with the workspace's artifact-seal key. The sig names
 * no key, so the verifier tries only the keys its supplied trust lists hold and admits the one that verifies. Every
 * listed file must be present with that digest and size, and no file may be present that the manifest does not list.
 * The ledger inside the bundle is not re-verified here: that needs AMC (amc bundle verify).
 */
import { parseJson, same, sha256Hex, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { anyRecord, arr, attempt, int, nonEmpty, obj, sha256 } from "../schema.js";
import { admit, listedKeys } from "../trust.js";
import { refused } from "./common.js";

const manifestSig = (value: unknown) => {
  const record = anyRecord(value, "manifest.sig");
  return { manifestSha256: sha256(record.manifestSha256, "manifest.sig.manifestSha256"), signature: nonEmpty(record.signature, "manifest.sig.signature"),
    signedTs: int()(record.signedTs, "manifest.sig.signedTs") };
};
const manifestFiles = obj({ path: nonEmpty, sha256, size: int({ min: 0 }) });

export function evaluateBundleManifest(members: ReadonlyMap<string, Buffer>, appleDouble: number, env: Env): Evaluation {
  const manifestBytes = members.get("manifest.json");
  const sigBytes = members.get("manifest.sig");
  if (manifestBytes === undefined || sigBytes === undefined) return refused("bundle-manifest", { code: "MALFORMED", detail: "the archive has no manifest.json and manifest.sig" });
  let sig: ReturnType<typeof manifestSig>;
  let files: Array<ReturnType<typeof manifestFiles>>;
  let manifest: Record<string, unknown>;
  try {
    sig = manifestSig(parseJson(sigBytes));
    manifest = anyRecord(parseJson(manifestBytes), "manifest.json");
    const parsed = attempt(arr(manifestFiles), manifest.files);
    if (!parsed.ok) return refused("bundle-manifest", { code: parsed.error.code, detail: `manifest.json files${parsed.error.message}` });
    files = parsed.value;
  } catch (error) {
    return refused("bundle-manifest", { code: "MALFORMED", detail: error instanceof Error ? error.message : String(error) });
  }
  const integrity: Finding<"integrity">[] = [];
  const digestHex = sha256Hex(manifestBytes);
  if (!same(digestHex, sig.manifestSha256)) integrity.push({ code: "DIGEST_MISMATCH", detail: "manifest.json does not hash to the digest manifest.sig signs" });
  const signer = listedKeys(env.ctx).find(key => verifySignature(Buffer.from(digestHex, "hex"), key.publicKeyPem, Buffer.from(sig.signature, "base64")));
  const listed = new Set<string>();
  for (const file of files) {
    listed.add(file.path);
    const bytes = members.get(file.path);
    if (bytes === undefined) integrity.push({ code: "DIGEST_MISMATCH", detail: `${file.path} is listed in the manifest but missing` });
    else if (!same(sha256Hex(bytes), file.sha256) || bytes.length !== file.size) integrity.push({ code: "DIGEST_MISMATCH", detail: `${file.path} does not match its manifest digest or size` });
  }
  for (const name of members.keys()) {
    if (name !== "manifest.json" && name !== "manifest.sig" && !listed.has(name)) integrity.push({ code: "UNKNOWN_FIELD", detail: `${name} is in the archive but not in the signed manifest` });
  }
  const admission = admit({ signature: "manifest.sig", keyId: signer?.keyId ?? null, purpose: "artifact-seal" }, env.ctx);
  const agent = typeof manifest.agentId === "string" ? manifest.agentId : undefined;
  return {
    kind: "bundle-manifest", integrity, admissions: [admission], admissionFindings: [],
    unverifiable: signer === undefined ? ["manifest.sig: no key in the supplied trust lists verifies this signature"] : [],
    anchoring: { status: "not-applicable", detail: null }, claimedAt: new Date(sig.signedTs).toISOString(),
    warnings: [
      "the evidence ledger inside the bundle is matched to the manifest only; its own hash chain and signatures are checked by AMC (amc bundle verify)",
      "the signing time is the issuing machine's own clock (time basis: claimed)",
      ...(appleDouble > 0 ? [`${appleDouble} macOS attribute member(s) (names starting "._") were ignored`] : [])
    ],
    scope: () => scopeResult(agent === undefined ? {} : { subject: agent }, env.expect),
    freshness: () => result<"freshness">(env.ctx.asOf < sig.signedTs ? [{ code: "NOT_YET_VALID", detail: "signed after the as-of time" }] : []),
    completeness: () => result<"completeness">([]),
    satisfaction: () => notRecomputable("a bundle carries a run its issuer scored; this verifier does not re-score it")
  };
}

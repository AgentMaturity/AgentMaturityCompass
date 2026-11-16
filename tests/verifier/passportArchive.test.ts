/**
 * The standalone verifier on passports, evidence bundles and export statements (vault lane, 2026-11-16): the signer is
 * taken only from the trust list the caller supplies, never from the archive, and every revocation-list problem fails
 * closed. Keys are throwaway keys made here.
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { exitCode, verifyArtifact, type VerifyOptions } from "../../packages/verifier/src/index.js";
import { canonicalize } from "../../packages/verifier/src/bytes.js";
import { signTrustList } from "../../src/trust/trustList.js";
import { encodeSignedRevocationList, signRevocationList, type RevocationListV1 } from "../../src/keys/revocationList.js";
import { ed25519Signer, INTOTO_PAYLOAD_TYPE, signDsse } from "../../src/attest/dsse.js";
import { toSigstoreBundle } from "../../src/attest/sigstoreBundle.js";
import { exportStatement } from "../../src/attest/exportAttestation.js";

const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function key() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
  return { pem, priv: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), id: sha(pem) };
}
const work = mkdtempSync(join(tmpdir(), "amc-verify-archive-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A gzip tar of `files` (path -> bytes), made by the system tar as AMC does; `twice` adds one member a second time. */
function archive(files: Record<string, string | Buffer>, twice?: string): Buffer {
  const dir = mkdtempSync(join(work, "a-"));
  for (const [path, bytes] of Object.entries(files)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), bytes); }
  const env = { ...process.env, COPYFILE_DISABLE: "1" };
  const tar = join(dir, "..", `${dir.split("/").pop()}.tar`);
  spawnSync("tar", ["-cf", tar, "-C", dir, ...Object.keys(files)], { env });
  if (twice) spawnSync("tar", ["-rf", tar, "-C", dir, twice], { env });
  spawnSync("gzip", ["-f", tar], { env });
  return readFileSync(`${tar}.gz`);
}

const issuer = key();
const root = key();
const now = Date.parse("2026-11-16T00:00:00.000Z");
const asOf = new Date(now + 60_000);
const LIST_ID = "passports:default";
function trustList(entries: Array<{ pem: string; id: string; purposes: string[] }>) {
  return signTrustList({ type: "amc.trust-list", version: 1, listId: "checker", sequence: 1, issuedAt: "2026-11-01T00:00:00.000Z",
    expiresAt: "2027-11-01T00:00:00.000Z", distrust: [],
    entries: entries.map(entry => ({ keyId: entry.id, algorithm: "ed25519" as const, publicKeyPem: entry.pem, purposes: entry.purposes as never,
      subject: "issuer", validFrom: "2026-11-01T00:00:00.000Z", validTo: null, source: "operator" })) }, root.priv);
}
const pinned = trustList([{ ...issuer, purposes: ["artifact-seal", "revocation-list"] }]);
const options = (extra: Partial<VerifyOptions> = {}): VerifyOptions => ({ trustLists: [pinned], trustRoots: [root.id], asOf, ...extra });

const passport = (over: Record<string, unknown> = {}) => ({
  v: 1, passportId: "pass_0123456789abcdef", generatedTs: now, expiresTs: now + 90 * 86_400_000,
  status: { label: "VERIFIED", reasons: [] },
  issuance: { issuerRelationship: "self", selfIssued: true, timeBasis: "claimed", statusBasis: "workspace-own-gates", revocationListId: LIST_ID },
  ...over
});
function passportSig(value: unknown, signer = issuer, named = signer) {
  const digest = sha(canonicalize(value));
  const signature = sign(null, Buffer.from(digest, "hex"), signer.priv).toString("base64");
  return { digestSha256: digest, signature, signedTs: now, signer: "auditor",
    envelope: { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(named.pem).toString("base64"), fingerprint: named.id, sigB64: signature, signedTs: now,
      signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
}
function amcpass(value: unknown = passport(), sig: unknown = passportSig(value), signerPub = issuer.pem, twice?: string) {
  return archive({ "amc-passport/passport.json": `${canonicalize(value)}\n`, "amc-passport/passport.sig": `${canonicalize(sig)}\n`,
    "amc-passport/signer.pub": signerPub }, twice);
}
function revocations(revoked: RevocationListV1["revoked"], opts: { signer?: ReturnType<typeof key>; listId?: string; sequence?: number } = {}) {
  const list: RevocationListV1 = { type: "amc.revocation-list", version: 1, listId: opts.listId ?? LIST_ID, sequence: opts.sequence ?? 1,
    previousSha256: (opts.sequence ?? 1) === 1 ? null : "a".repeat(64), issuedAt: "2026-11-15T00:00:00.000Z", revoked };
  const bytes = encodeSignedRevocationList(signRevocationList(list, (opts.signer ?? issuer).priv));
  return { value: JSON.parse(bytes.toString("utf8")) as unknown, bytes };
}
const noRows = revocations([]);
const statuses = (report: ReturnType<typeof verifyArtifact>) => [report.integrity.status, report.issuerAdmission.status, report.freshness.status];

describe("passports (.amcpass)", () => {
  test("an untouched passport with the issuer's signed list: integrity, issuer and freshness pass, exit 3 (nothing recomputed)", () => {
    const report = verifyArtifact(amcpass(), options({ revocationLists: [noRows] }));
    expect(report.artifact.kind).toBe("passport");
    expect(statuses(report)).toEqual(["pass", "pass", "pass"]);
    expect(report.warnings.join(" ")).toMatch(/self-issued/);
    expect(exitCode(report)).toBe(3);
  });

  test("without a revocation list, freshness says revocation was not checked, never a pass", () => {
    const report = verifyArtifact(amcpass(), options());
    expect(report.freshness).toMatchObject({ status: "not-evaluated", reasons: [expect.stringMatching(/revoked was not checked/)] });
  });

  test("a revoked passport fails freshness", () => {
    const list = revocations([{ id: "pass_0123456789abcdef", kind: "passport", revokedAt: "2026-11-14T00:00:00.000Z", reason: "retired" }]);
    const report = verifyArtifact(amcpass(), options({ revocationLists: [list] }));
    expect(report.reasonCodes.freshness).toEqual(["REPLAYED_OR_SUPERSEDED"]);
    expect(exitCode(report)).toBe(1);
  });

  test("an expired passport fails freshness", () => {
    const value = passport({ expiresTs: now - 1 });
    expect(verifyArtifact(amcpass(value), options({ revocationLists: [noRows] })).reasonCodes.freshness).toEqual(["ATTESTATION_EXPIRED"]);
  });

  test("a changed body fails integrity", () => {
    const signedFor = passport();
    const report = verifyArtifact(amcpass(passport({ status: { label: "UNTRUSTED", reasons: [] } }), passportSig(signedFor)), options());
    expect(report.reasonCodes.integrity).toContain("DIGEST_MISMATCH");
    expect(report.trusted).toBe(false);
  });

  test("a swapped signer whose key the archive carries is not pinned: the key comes from the trust list only", () => {
    const other = key();
    const report = verifyArtifact(amcpass(passport(), passportSig(passport(), other), other.pem), options({ revocationLists: [noRows] }));
    expect(report.integrity.status).toBe("not-evaluated");
    expect(report.reasonCodes.issuerAdmission).toEqual(["ISSUER_NOT_PINNED"]);
    expect(exitCode(report)).toBe(1);
  });

  test("an envelope naming the pinned key over a signature by another key fails integrity", () => {
    const other = key();
    expect(verifyArtifact(amcpass(passport(), passportSig(passport(), other, issuer)), options()).reasonCodes.integrity).toEqual(["SIGNATURE_INVALID"]);
  });

  test("a signer absent from the trust list, or pinned for another purpose, is refused", () => {
    expect(verifyArtifact(amcpass(), options({ trustLists: [trustList([{ ...key(), purposes: ["artifact-seal"] }])] })).reasonCodes.issuerAdmission)
      .toEqual(["ISSUER_NOT_PINNED"]);
    expect(verifyArtifact(amcpass(), options({ trustLists: [trustList([{ ...issuer, purposes: ["revocation-list"] }])] })).issuerAdmission.status).toBe("fail");
  });

  test("an unknown signature algorithm and a missing signature are malformed", () => {
    const sig = passportSig(passport()) as { envelope: Record<string, unknown> };
    expect(verifyArtifact(amcpass(passport(), { ...sig, envelope: { ...sig.envelope, alg: "rsa-pss" } }), options()).integrity.status).toBe("fail");
    expect(verifyArtifact(archive({ "amc-passport/passport.json": `${canonicalize(passport())}\n` }), options()).reasonCodes.integrity).toEqual(["MALFORMED"]);
  });

  test("an archive holding passport.json twice is refused", () => {
    expect(verifyArtifact(amcpass(passport(), passportSig(passport()), issuer.pem, "amc-passport/passport.json"), options()).reasonCodes.integrity)
      .toEqual(["MALFORMED"]);
  });

  test("revocation lists fail closed: edited, signed by an unpinned key, another list, or older than one seen", () => {
    const edited = JSON.parse(noRows.bytes.toString("utf8")) as { list: { revoked: unknown[] } };
    edited.list.revoked = [{ id: "pass_other0000000", kind: "passport", revokedAt: "2026-11-14T00:00:00.000Z", reason: "x" }];
    const editedBytes = Buffer.from(canonicalize(edited));
    expect(verifyArtifact(amcpass(), options({ revocationLists: [{ value: edited, bytes: editedBytes }] })).reasonCodes.integrity).toEqual(["SIGNATURE_INVALID"]);
    expect(verifyArtifact(amcpass(), options({ revocationLists: [revocations([], { signer: key() })] })).reasonCodes.issuerAdmission).toEqual(["ISSUER_NOT_PINNED"]);
    expect(verifyArtifact(amcpass(), options({ revocationLists: [revocations([], { listId: "passports:elsewhere" })] })).reasonCodes.integrity).toEqual(["MALFORMED"]);
    expect(verifyArtifact(amcpass(), options({ revocationLists: [noRows], knownSequences: { [LIST_ID]: 4 } })).reasonCodes.issuerAdmission).toEqual(["ROLLBACK_DETECTED"]);
    const pretty = Buffer.from(JSON.stringify(noRows.value, null, 2));
    expect(verifyArtifact(amcpass(), options({ revocationLists: [{ value: noRows.value, bytes: pretty }] })).reasonCodes.integrity).toEqual(["MALFORMED"]);
  });
});

describe("evidence bundles (.amcbundle)", () => {
  const files = { "run.json": "{\"runId\":\"r1\"}\n", "evidence/evidence.sqlite": Buffer.from("not really sqlite") };
  function bundle(contents: Record<string, string | Buffer> = files, signer = issuer, extra: Record<string, string> = {}) {
    const manifest = JSON.stringify({ schemaVersion: 1, runId: "r1", agentId: "agent-1",
      files: Object.entries(contents).map(([path, bytes]) => ({ path, sha256: sha(bytes), size: Buffer.from(bytes).length })) }, null, 2);
    const digest = sha(manifest);
    const sig = JSON.stringify({ manifestSha256: digest, signature: sign(null, Buffer.from(digest, "hex"), signer.priv).toString("base64"), signedTs: now, signer: "auditor" });
    return archive({ ...contents, ...extra, "manifest.json": manifest, "manifest.sig": sig });
  }

  test("an untouched bundle passes integrity and issuer admission", () => {
    const report = verifyArtifact(bundle(), options());
    expect(report.artifact.kind).toBe("bundle-manifest");
    expect(statuses(report)).toEqual(["pass", "pass", "pass"]);
  });

  test("a file changed after signing, an unlisted file, and an unpinned signer are refused", () => {
    const manifest = JSON.stringify({ schemaVersion: 1, runId: "r1", agentId: "agent-1",
      files: Object.entries(files).map(([path, bytes]) => ({ path, sha256: sha(bytes), size: Buffer.from(bytes).length })) }, null, 2);
    const digest = sha(manifest);
    const sig = JSON.stringify({ manifestSha256: digest, signature: sign(null, Buffer.from(digest, "hex"), issuer.priv).toString("base64"), signedTs: now, signer: "auditor" });
    const changed = archive({ ...files, "run.json": "{\"runId\":\"r2\"}\n", "manifest.json": manifest, "manifest.sig": sig });
    expect(verifyArtifact(changed, options()).reasonCodes.integrity).toEqual(["DIGEST_MISMATCH"]);
    expect(verifyArtifact(bundle(files, issuer, { "extra.txt": "x" }), options()).reasonCodes.integrity).toEqual(["UNKNOWN_FIELD"]);
    expect(verifyArtifact(bundle(files, key()), options()).reasonCodes.issuerAdmission).toEqual(["ISSUER_NOT_PINNED"]);
  });
});

describe("export statements (<file>.sigstore.json)", () => {
  const exported = Buffer.from("the exported file");
  const statement = (signer = issuer) => Buffer.from(JSON.stringify(toSigstoreBundle(signDsse(INTOTO_PAYLOAD_TYPE,
    Buffer.from(JSON.stringify(exportStatement({ name: "agent.amcpass", bytes: exported, kind: "amcpass", workspaceId: "default", issuedAt: new Date(now) }))),
    ed25519Signer(signer.priv)))));

  test("the statement verifies under the pinned key and needs the exported file itself", () => {
    const withFile = verifyArtifact(statement(), options({ evidence: new Map([[sha(exported), exported]]) }));
    expect(withFile.artifact.kind).toBe("export-statement");
    expect(statuses(withFile)).toEqual(["pass", "pass", "pass"]);
    expect(withFile.completeness.status).toBe("pass");
    const changed = Buffer.from("the exported file, changed");
    expect(verifyArtifact(statement(), options({ evidence: new Map([[sha(changed), changed]]) })).reasonCodes.completeness).toEqual(["EVIDENCE_MISSING"]);
    expect(verifyArtifact(statement(key()), options()).reasonCodes.issuerAdmission).toEqual(["ISSUER_NOT_PINNED"]);
  });
});

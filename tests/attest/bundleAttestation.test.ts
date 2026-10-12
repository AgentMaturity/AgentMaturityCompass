import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AIBOM_BUNDLE_PATH, ATTESTATION_BUNDLE_PATH } from "../../src/attest/bundleAttestation.js";
import { INTOTO_PAYLOAD_TYPE, verifyDsse } from "../../src/attest/dsse.js";
import { envelopeFromSigstoreBundle } from "../../src/attest/sigstoreBundle.js";
import { CONTROL_RESULTS_PREDICATE, inTotoStatementSchema, subjectMismatches, type InTotoStatement } from "../../src/attest/statement.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../../src/bundles/bundle.js";
import { envelopeForStoredRun } from "../../src/claims/eligibility/adapters/results.js";
import { getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import { sealedRunReportVerifies } from "../../src/diagnostic/reportSeal.js";
import { ed25519KeyId, signTrustList } from "../../src/trust/trustList.js";
import type { BundleManifest, DiagnosticReport } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { initWorkspace } from "../../src/workspace.js";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";

const roots: string[] = [];
const temp = (prefix: string) => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
};

let workspace: string;
let extracted: string;
let plainExtracted: string;
let bundleFile: string;
let runId: string;

function extract(file: string): string {
  const dir = temp("amc-attest-x-");
  const result = spawnSync("tar", ["-xzf", file, "-C", dir], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return dir;
}

beforeAll(async () => {
  workspace = temp("amc-attest-ws-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  runId = (await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" })).runId;
  bundleFile = exportEvidenceBundle({ workspace, runId, outFile: join(workspace, "run.amcbundle"), attest: true }).outFile;
  extracted = extract(bundleFile);
  plainExtracted = extract(exportEvidenceBundle({ workspace, runId, outFile: join(workspace, "plain.amcbundle") }).outFile);
}, 120_000);

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(join(extracted, path));
const statementOf = (bundleBytes: Buffer): InTotoStatement => {
  const keyPem = getSigningPublicKeyPem(workspace, "artifact-seal");
  const verified = verifyDsse(envelopeFromSigstoreBundle(JSON.parse(bundleBytes.toString("utf8"))), INTOTO_PAYLOAD_TYPE, new Map([[sha256Hex(keyPem), keyPem]]));
  if (!verified.ok) throw new Error(verified.error);
  return inTotoStatementSchema.parse(JSON.parse(verified.payload.toString("utf8")));
};

/** A trust list, signed by a test root, that pins the workspace's artifact-seal key (what an operator publishes to make it portable). */
function trustListPinningSeal(purposes: string[] = ["artifact-seal"]) {
  const root = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const sealPem = getSigningPublicKeyPem(workspace, "artifact-seal");
  const signed = signTrustList({ type: "amc.trust-list", version: 1, listId: "p1-27-test", sequence: 1, issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z", distrust: [], entries: [{ keyId: ed25519KeyId(sealPem)!, algorithm: "ed25519", publicKeyPem: sealPem,
      purposes: purposes as never, subject: "TEST ONLY workspace artifact-seal key", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, source: "operator" }] }, root);
  return { signed, rootKeyId: signed.signatures[0]!.keyId };
}

function verifyWithP106(evidence: Buffer[], purposes?: string[]) {
  const { signed, rootKeyId } = trustListPinningSeal(purposes);
  return verifyArtifact(read(ATTESTATION_BUNDLE_PATH), { trustLists: [signed], trustRoots: [rootKeyId], expectScope: { subject: "default" },
    evidence: new Map(evidence.map(bytes => [sha256Hex(bytes), new Uint8Array(bytes)])) });
}

describe("amc bundle export --attest", () => {
  test("adds the AIBOM and the Sigstore bundle to the signed manifest, and the bundle still verifies", async () => {
    const manifest = JSON.parse(read("manifest.json").toString("utf8")) as BundleManifest;
    for (const path of [AIBOM_BUNDLE_PATH, ATTESTATION_BUNDLE_PATH]) {
      expect(manifest.files.find(file => file.path === path)?.sha256).toBe(sha256Hex(read(path)));
    }
    expect((await verifyEvidenceBundle(bundleFile, workspaceKeyTrust(workspace))).ok).toBe(true);
    expect(existsSync(join(plainExtracted, "attestations"))).toBe(false);
  });

  test("the statement is signed with the artifact-seal key, binds the AIBOM and run bytes, and carries the run's own claim", () => {
    const bundle = JSON.parse(read(ATTESTATION_BUNDLE_PATH).toString("utf8")) as { verificationMaterial: { publicKey: { hint: string } } };
    expect(bundle.verificationMaterial.publicKey.hint).toBe(sha256Hex(getSigningPublicKeyPem(workspace, "artifact-seal")));
    const statement = statementOf(read(ATTESTATION_BUNDLE_PATH));
    expect(statement.predicateType).toBe(CONTROL_RESULTS_PREDICATE);
    expect(subjectMismatches(statement, new Map([[AIBOM_BUNDLE_PATH, read(AIBOM_BUNDLE_PATH)], ["run.json", read("run.json")]]))).toEqual([]);
    const run = JSON.parse(read("run.json").toString("utf8")) as DiagnosticReport;
    const envelope = envelopeForStoredRun(run, { sealVerified: sealedRunReportVerifies(workspace, run as unknown as Record<string, unknown>), now: Date.now() });
    expect(statement.predicate.claimKind).toBe(envelope.claimKind);
    expect(statement.predicate.controls).toEqual([{ controlId: "amc.diagnostic", dimensions: envelope.statusDimensions }]);
    expect(statement.predicate.scope).toMatchObject({ tenant: null, deployment: null, agent: "default", snapshot: sha256Hex(read("run.json")) });
    expect(statement.predicate.evidence).toEqual([{ sha256: sha256Hex(read("evidence/evidence.sqlite")), kind: "ledger-slice" }]);
    expect(JSON.parse(read(AIBOM_BUNDLE_PATH).toString("utf8"))).toMatchObject({ bomFormat: "CycloneDX", specVersion: "1.6" });
  });

  test("P1-06's standalone verifier admits it with a trust list pinning the artifact-seal key, and cannot recompute the result", () => {
    const report = verifyWithP106([read(AIBOM_BUNDLE_PATH), read("run.json"), read("evidence/evidence.sqlite")]);
    expect(report.artifact.kind).toBe("dsse-intoto");
    expect([report.integrity.status, report.issuerAdmission.status, report.scope.status, report.freshness.status, report.completeness.status, report.satisfaction.status])
      .toEqual(["pass", "pass", "pass", "pass", "pass", "not-evaluated"]);
    expect(report.reasonCodes.satisfaction).toEqual(["NOT_RECOMPUTABLE"]);
  });

  test("a tampered AIBOM breaks verification in AMC and in P1-06's verifier", () => {
    const tampered = Buffer.from(read(AIBOM_BUNDLE_PATH));
    tampered[tampered.indexOf("CycloneDX")] ^= 0x20;
    const statement = statementOf(read(ATTESTATION_BUNDLE_PATH));
    expect(subjectMismatches(statement, new Map([[AIBOM_BUNDLE_PATH, tampered], ["run.json", read("run.json")]])))
      .toEqual([expect.stringContaining(AIBOM_BUNDLE_PATH)]);
    const report = verifyWithP106([tampered, read("run.json"), read("evidence/evidence.sqlite")]);
    expect(report.completeness.status).toBe("fail");
    expect(report.reasonCodes.completeness).toEqual(["EVIDENCE_MISSING"]);
  });

  test("without a pin for artifact-seal the workspace key is only a local audit trail: the issuer is not admitted", () => {
    const report = verifyWithP106([read(AIBOM_BUNDLE_PATH), read("run.json"), read("evidence/evidence.sqlite")], ["receipt"]);
    expect(report.issuerAdmission.status).toBe("fail");
    expect(report.reasonCodes.issuerAdmission).toEqual(["ISSUER_WRONG_PURPOSE"]);
  });
});

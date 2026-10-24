import { collectFiles as collectArchiveFiles } from "../utils/archiveFiles.js";
import { mkdtempSync, readdirSync, readFileSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { captureOrgFiles, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { highWaterPath } from "../keys/highWater.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureTransparencyState, assertTransparencyStateCurrent } from "../transparency/workspacePublication.js";
import type { OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { buildBenchProofs, writeBenchProofFiles } from "../bench/benchProofs.js";
import { loadTrustConfig, checkNotaryTrust, trustConfigPath, trustConfigSigPath } from "../trust/trustConfig.js";
import { promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { cgxLatestPackPath } from "../cgx/cgxStore.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { assurancePolicySchema } from "./assurancePolicySchema.js";
import {
  assuranceCertSchema,
  assuranceFindingsDocSchema,
  assuranceRunSchema,
  type AssuranceCert,
  type AssuranceScopeType
} from "./assuranceSchema.js";
import {
  assuranceCertificatesDir,
  assuranceLatestCertificatePath,
  assuranceLatestCertificateShaPath,
  assurancePolicyPath,
  assurancePolicySigPath,
  assuranceRunJsonPath,
  assuranceTimestampedCertificatePath,
  assuranceTimestampedCertificateShaPath,
} from "./assurancePolicyStore.js";
import { evaluateAssuranceEvidenceGates } from "./assuranceScoring.js";
import { assertNotExample, EXAMPLE_BANNER } from "../claims/eligibility/exampleMode.js";

function cleanup(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function collectFiles(root: string): string[] {
  return collectArchiveFiles(root);
}

function tarCreateDeterministic(sourceDir: string, outFile: string): void {
  const files = collectFiles(sourceDir);
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create assurance certificate: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`, out.error === undefined ? undefined : { cause: out.error });
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolveCertRoot(dir: string): string {
  const direct = join(dir, "amc-cert");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = join(dir, entry.name);
    if (pathExists(join(candidate, "cert.json")) && pathExists(join(candidate, "cert.sig"))) {
      return candidate;
    }
  }
  return dir;
}

function scopeIdHash(type: AssuranceScopeType, id: string): string {
  const value = type === "WORKSPACE" ? "workspace" : id;
  return sha256Hex(Buffer.from(value, "utf8")).slice(0, 16);
}

function signerPubFromSignature(workspace: string, sig: z.infer<typeof orgSignatureSchema>): string {
  if (sig.envelope?.pubkeyB64) {
    return Buffer.from(sig.envelope.pubkeyB64, "base64").toString("utf8");
  }
  return getPublicKeyHistory(workspace, "auditor")[0] ?? "";
}

export interface AssuranceIssueCertificateResult {
  outFile: string;
  sha256: string;
  cert: AssuranceCert;
  transparencyHash: string;
  latestPath: string;
  timestampedPath: string;
}

class AssuranceTransparencyPublicationError extends Error {
  readonly code = "ASSURANCE_CERT_TRANSPARENCY_PUBLICATION_INCOMPLETE";
  constructor(readonly publication: Omit<AssuranceIssueCertificateResult, "transparencyHash">, cause: unknown, readonly transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null = null) {
    super("Assurance certificate archive was published; transparency publication is incomplete", { cause });
    this.name = "AssuranceTransparencyPublicationError";
  }
}

// z import only for type inference above.
import { z } from "zod";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


class AssuranceCertificatePublicationError extends Error {
  readonly code = "ASSURANCE_CERT_PUBLICATION_INCOMPLETE";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string | null, cause: unknown) {
    super("Assurance certificate publication did not complete; known and uncertain prior members remain", { cause }); this.name = "AssuranceCertificatePublicationError";
  }
}
/** Finite used-input/authority/log aliases only; no host output authorization policy. */
function AssuranceCertificateProtectionPaths(workspace: string, inputs: readonly string[]): string[] {
  const keyset = assertKeysetComplete(workspace);
  return [...new Set([...inputs, ...Object.keys(keyset?.files ?? {}).map(path => join(workspace, ".amc", path)),
    trustConfigPath(workspace), trustConfigSigPath(workspace), highWaterPath(),
    ...["amc.config.yaml", "amc.config.yaml.sig", "mode.json", "vault.amcvault", "vault.amcvault.meta.json",
      "keys/keyset.json", "keys/keyset.pending.json", "keys/revocations.signed.json", "keys/artifact-seal.pub", "keys/artifact-seal_history.json", "keys/auditor_ed25519.pub", "keys/auditor_history.json",
      "transparency/log.jsonl", "transparency/log.seal.json", "transparency/log.seal.sig", "transparency/.workspace-transparency.lock", "transparency/.workspace-transparency-locks",
      "transparency/merkle/current.root.json", "transparency/merkle/current.root.sig", "transparency/merkle/leaves.jsonl", "transparency/merkle/roots.jsonl",
      "transparency/merkle/frontier.json", "transparency/merkle/pending.json", "transparency/merkle/migration.json", "transparency/merkle/migration.sig"].map(path => join(workspace, ".amc", path))])];
}
function assertAssuranceCertificateOutputSafe(output: string, physical: string, protectedPaths: readonly string[]): void {
  if (physicalPathWithMissingSuffix(output) !== physical) throw new Error("AssuranceCertificate output physical selection changed while preparing");
  const target = captureOrgFiles([output]).members[0]!;
  for (const source of protectedPaths) {
    if (physicalPathWithMissingSuffix(source) === physical) throw new Error("AssuranceCertificate output aliases a used input, authority or later log destination");
    if (target.identity !== null) {
      try { const stat = lstatSync(source); if (`${stat.dev}:${stat.ino}` === target.identity) throw new Error("AssuranceCertificate output hardlinks a used input, authority or later log destination"); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
    }
  }
}

export async function issueAssuranceCertificate(input: {
  workspace: string;
  runId: string;
  outFile?: string;
}): Promise<AssuranceIssueCertificateResult> {
  const params = { ...input };
  const runPath = assuranceRunJsonPath(params.workspace, params.runId);
  const findingsPath = join(dirname(runPath), "findings.json");
  const policyPath = assurancePolicyPath(params.workspace);
  const sourceState = captureOrgFiles([policyPath, assurancePolicySigPath(params.workspace), runPath, findingsPath]);
  const sourceInputs = new Map(sourceState.members.map(row => [row.path, row.bytes]));
  let bindingsState: OrgPairsSnapshot | null = null;
  const assertInputsCurrent = () => { assertOrgPairsCurrent(sourceState); if (bindingsState !== null) assertOrgPairsCurrent(bindingsState); };
  const policyBytes = sourceInputs.get(policyPath)!;
  if (policyBytes === null) {
    throw new Error("assurance policy signature invalid: assurance policy missing");
  }
  const policySidecar = sourceInputs.get(assurancePolicySigPath(params.workspace));
  const policySig = policySidecar === null || policySidecar === undefined ? { valid: false, reason: "assurance policy signature missing" }
    : verifyAuditorSignatureBytes(params.workspace, "BUNDLE", policyBytes, policySidecar);
  if (!policySig.valid) {
    throw new Error(`assurance policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const policy = assurancePolicySchema.parse(YAML.parse(policyBytes.toString("utf8")) as unknown);
  const runBytes = sourceInputs.get(runPath)!;
  if (runBytes === null) {
    throw new Error(`assurance run not found: ${params.runId}`);
  }
  const runText = runBytes.toString("utf8");
  if (runText.split(/\r?\n/).some(line => line.trim() === EXAMPLE_BANNER)) throw new Error("synthetic_example results cannot be issued an assurance certificate");
  const runValue: unknown = JSON.parse(runText); assertNotExample(runValue, "issued an assurance certificate");
  const run = assuranceRunSchema.parse(runValue);
  const findingsBytes = sourceInputs.get(findingsPath)!;
  if (findingsBytes === null) {
    throw new Error(`assurance findings not found for run: ${params.runId}`);
  }
  assuranceFindingsDocSchema.parse(JSON.parse(findingsBytes.toString("utf8")) as unknown);
  assertInputsCurrent();
  const evidence = evaluateAssuranceEvidenceGates({
    policy,
    gates: run.evidenceGates
  });
  if (!evidence.ok) {
    throw new Error(`certificate issuance blocked: evidence gates failed (${evidence.reasons.join("; ")})`);
  }

  const trust = loadTrustConfig(params.workspace), signer = describePolicySigner(params.workspace, "CERT");
  const signingPolicy = JSON.stringify(trust), purposeCurrent = signer.mode === "VAULT" ? captureRunHashAuthority(params.workspace, false) : () => {};
  const logAuthority = captureWorkspaceLogAuthority(params.workspace);
  const assertSigningCurrent = () => {
    assertPolicySignerCurrent(params.workspace, signer); purposeCurrent(); logAuthority.assertCurrent();
    if (JSON.stringify(loadTrustConfig(params.workspace)) !== signingPolicy) throw new Error("assurance certificate signing policy changed while preparing");
  };
  const promptPath = promptPolicyPath(params.workspace), cgxPath = run.scope.type === "AGENT" ? cgxLatestPackPath(params.workspace, run.scope.id) : null;
  bindingsState = captureOrgFiles([promptPath, ...(cgxPath === null ? [] : [cgxPath])]);
  const bindingDigest = (path: string | null) => { const bytes = bindingsState!.members.find(row => row.path === path)?.bytes; return bytes === undefined || bytes === null ? "0".repeat(64) : sha256Hex(bytes); };
  const proofState = captureTransparencyState(params.workspace, true);
  const proofs = buildBenchProofs({ workspace: params.workspace, includeEventKinds: ["ASSURANCE_RUN_STARTED", "ASSURANCE_RUN_COMPLETED", "ASSURANCE_FINDING_RECORDED", "ASSURANCE_CERT_ISSUED", "NOTARY_ATTESTATION_OBSERVED"], maxProofs: 40 });
  assertTransparencyStateCurrent(proofState);
  // Select this attempt's real timestamp/output names before the earlier notary wait.
  const issuedTs = Date.now(), latestPath = assuranceLatestCertificatePath(params.workspace), timestampedPath = assuranceTimestampedCertificatePath(params.workspace, issuedTs);
  const outFile = resolve(params.workspace, params.outFile ?? timestampedPath);
  const archivePaths = [outFile, latestPath, timestampedPath].map(path => resolve(path));
  const digestPaths = [`${outFile}.sha256`, assuranceLatestCertificateShaPath(params.workspace), assuranceTimestampedCertificateShaPath(params.workspace, issuedTs)].map(path => resolve(path));
  if (archivePaths.some(path => digestPaths.includes(path))) throw new Error("assurance certificate archive and digest destinations must differ");
  const outputPaths = [...new Set([...archivePaths, ...digestPaths])];
  const expectedOutputs = new Map(captureOrgFiles(outputPaths).members.map(row => [row.path, row]));
  const physicalOutputs = new Map(outputPaths.map(path => [path, physicalPathWithMissingSuffix(path)]));
  const protectedPaths = AssuranceCertificateProtectionPaths(params.workspace, [...sourceState.members.map(row => row.path), ...bindingsState.members.map(row => row.path), ...proofState.keys(), join(assuranceCertificatesDir(params.workspace), ".certificate-publication.lock"), join(assuranceCertificatesDir(params.workspace), ".certificate-publication-locks")]);
  const assertOutputsCurrent = () => {
    for (const path of outputPaths) assertAssuranceCertificateOutputSafe(path, physicalOutputs.get(path)!, [...protectedPaths, ...outputPaths.filter(other => other !== path)]);
    assertOrgPairsCurrent({ members: [...expectedOutputs.values()] });
  };
  const assertPreparing = () => { assertInputsCurrent(); assertSigningCurrent(); assertTransparencyStateCurrent(proofState); assertOutputsCurrent(); };
  const assertContinuing = () => { assertInputsCurrent(); assertSigningCurrent(); assertOutputsCurrent(); };
  assertPreparing();
  const notary = await checkNotaryTrust(params.workspace);
  assertPreparing();

  const cert = assuranceCertSchema.parse({
    v: 1,
    certId: `cert_${randomUUID().replace(/-/g, "")}`,
    issuedTs,
    scope: {
      type: run.scope.type,
      idHash: scopeIdHash(run.scope.type, run.scope.id)
    },
    runId: run.runId,
    status: run.score.status,
    riskAssuranceScore: run.score.riskAssuranceScore,
    categoryScores: run.score.riskAssuranceScore === null ? null : run.score.categoryScores,
    findingCounts: run.score.findingCounts,
    gates: run.evidenceGates,
    bindings: {
      assurancePolicySha256: run.policySha256,
      cgxPackSha256: bindingDigest(cgxPath),
      promptPolicySha256: bindingDigest(promptPath),
      trustMode: trust.trust.mode,
      notaryFingerprint: trust.trust.mode === "NOTARY" ? notary.currentFingerprint ?? trust.trust.notary.pinnedPubkeyFingerprint : null
    },
    proofBindings: {
      transparencyRootSha256: proofs.transparencyRoot?.sha256 ?? "0".repeat(64),
      merkleRootSha256: proofs.merkleRoot?.sha256 ?? "0".repeat(64),
      includedEventProofIds: proofs.proofs.map((row) => row.proofId).sort((a, b) => a.localeCompare(b))
    }
  });

  const certJson = Buffer.from(canonicalize(cert), "utf8");
  const certDigest = sha256Hex(certJson);
  const signed = await signDigestWithPolicyAsync({
    workspace: params.workspace,
    kind: "CERT",
    digestHex: certDigest,
    expectedSigner: signer,
    beforeSign: assertPreparing
  });
  assertPreparing();
  const signature = orgSignatureSchema.parse({
    digestSha256: certDigest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });

  const assertSignedResponse = () => {
    const envelope = signature.envelope;
    if (envelope === undefined || envelope.signer.type !== signer.mode || envelope.alg !== signer.algorithm || envelope.sigB64 !== signature.signature
      || !verifySignatureEnvelope(certDigest, envelope, { trustedPublicKeys: [signer.publicKeyPem], requireTrustedKey: true })) throw new Error("assurance certificate prepared signature no longer matches its original actual signer");
  };
  const assertPreparedCurrent = () => { assertPreparing(); assertSignedResponse(); assertOutputsCurrent(); };
  assertPreparedCurrent();
  const tmp = mkdtempSync(join(tmpdir(), "amc-assurance-cert-"));
  const publishedPaths: string[] = []; let attemptedPath: string | null = null, failed = false, primary: unknown;
  let publication: Omit<AssuranceIssueCertificateResult, "transparencyHash"> | null = null;
  let transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null = null;
  try {
    const root = join(tmp, "amc-cert");
    ensureDir(root); ensureDir(join(root, "proofs")); ensureDir(join(root, "meta"));
    writeFileAtomic(join(root, "cert.json"), `${canonicalize(cert)}\n`, 0o644);
    writeFileAtomic(join(root, "cert.sig"), `${canonicalize(signature)}\n`, 0o644);
    const signerPub = signerPubFromSignature(params.workspace, signature);
    if (!signerPub) throw new Error("missing signer public key for certificate");
    writeFileAtomic(join(root, "signer.pub"), signerPub, 0o644);
    writeBenchProofFiles({ outDir: root, bundle: proofs });
    writeFileAtomic(join(root, "meta", "policy.sha256"), `${run.policySha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "run.sha256"), `${sha256Hex(runBytes)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "findings.sha256"), `${sha256Hex(findingsBytes)}\n`, 0o644);
    assertPreparedCurrent();
    const archive = join(tmp, "prepared.amccert"); tarCreateDeterministic(tmp, archive);
    const archiveBytes = readFileSync(archive), sha256 = sha256Hex(archiveBytes), digestBytes = Buffer.from(`${sha256}\n`);
    const archiveMode = expectedOutputs.get(outFile)!.mode ?? (lstatSync(archive).mode & 0o777);
    const rows: Array<{ path: string; bytes: Buffer; mode?: number }> = [{ path: outFile, bytes: archiveBytes, mode: archiveMode }, { path: `${outFile}.sha256`, bytes: digestBytes, mode: 0o644 }];
    if (outFile !== latestPath) rows.push({ path: resolve(latestPath), bytes: archiveBytes });
    rows.push({ path: resolve(assuranceLatestCertificateShaPath(params.workspace)), bytes: digestBytes, mode: 0o644 });
    if (outFile !== timestampedPath) rows.push({ path: resolve(timestampedPath), bytes: archiveBytes });
    rows.push({ path: resolve(assuranceTimestampedCertificateShaPath(params.workspace, cert.issuedTs)), bytes: digestBytes, mode: 0o644 });
    withControlFileLock({ root: assuranceCertificatesDir(params.workspace), name: "certificate-publication", operation: () => {
      try {
        for (const row of rows) {
          attemptedPath = null; assertPreparedCurrent();
          const expectedMode = row.mode ?? (0o666 & ~process.umask()); attemptedPath = row.path;
          writeFileAtomic(row.path, row.bytes, row.mode); publishedPaths.push(row.path);
          const acknowledged = captureOrgFiles([row.path]).members[0]!;
          if (acknowledged.bytes === null || !acknowledged.bytes.equals(row.bytes) || acknowledged.mode !== expectedMode) throw new Error("assurance certificate member differs from its exact prepared bytes or mode");
          expectedOutputs.set(row.path, acknowledged); attemptedPath = null;
        }
        assertPreparedCurrent();
      } catch (cause) { if (publishedPaths.length === 0 && attemptedPath === null) throw cause; throw new AssuranceCertificatePublicationError(Object.freeze([...publishedPaths]), attemptedPath, cause); }
    } });
    const published = { outFile, sha256, cert, latestPath, timestampedPath }; publication = published;
    try {
      transparency = await appendTransparencyEntryAsync({ workspace: params.workspace, type: "ASSURANCE_CERT_ISSUED",
        agentId: run.scope.type === "AGENT" ? run.scope.id : "workspace", artifact: { kind: "amccert", sha256, id: cert.certId } }, { beforeCommit: assertPreparedCurrent });
      assertContinuing(); assertSignedResponse(); assertOutputsCurrent(); // Own log progress must not be compared with its original proof-state snapshot.
      return { outFile, sha256, cert, transparencyHash: transparency.hash, latestPath, timestampedPath };
    } catch (cause) { throw new AssuranceTransparencyPublicationError(published, cause, transparency); }
  } catch (cause) { failed = true; primary = cause; throw cause; }
  finally { try { cleanup(tmp); } catch (cleanupCause) {
    const error = new AggregateError(failed ? [primary, cleanupCause] : [cleanupCause], "Assurance certificate temporary cleanup failed", { cause: failed ? primary : cleanupCause });
    Object.assign(error, { publication, publishedPaths: Object.freeze([...publishedPaths]), attemptedPath, transparency }); throw error;
  } }
}

export function inspectAssuranceCertificate(file: string): {
  cert: AssuranceCert;
  signature: z.infer<typeof orgSignatureSchema>;
  sha256: string;
} {
  const bundle = resolve(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-assurance-cert-inspect-"));
  try {
    tarExtract(bundle, tmp);
    const root = resolveCertRoot(tmp);
    const cert = assuranceCertSchema.parse(JSON.parse(readUtf8(join(root, "cert.json"))) as unknown);
    const signature = orgSignatureSchema.parse(JSON.parse(readUtf8(join(root, "cert.sig"))) as unknown);
    return {
      cert,
      signature,
      sha256: sha256Hex(readFileSync(bundle))
    };
  } finally {
    cleanup(tmp);
  }
}

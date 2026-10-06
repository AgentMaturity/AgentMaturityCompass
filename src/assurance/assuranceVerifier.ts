import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { assuranceCertSchema } from "./assuranceSchema.js";
import {
  listAssuranceRunIds,
  verifyAssurancePolicySignature,
  verifyAssuranceRunArtifacts,
  verifyAssuranceSchedulerSignature,
  assuranceLatestCertificatePath
} from "./assurancePolicyStore.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { canonicalize } from "../utils/json.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyProofsAgainstSignedRoot, type BenchInclusionProof } from "../bench/benchProofs.js";
import {
  buildVerifierReport, checkDigestSignature, envelopePublicKey, workspaceSelfTrust, type IssuerAdmission, type TrustContext, type VerifierReportV1
} from "../trust/index.js";
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


function cleanup(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolveRoot(dir: string): string {
  const direct = join(dir, "amc-cert");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = join(dir, entry.name);
    if (pathExists(join(child, "cert.json")) && pathExists(join(child, "cert.sig"))) {
      return child;
    }
  }
  return dir;
}

function parseInclusionProofs(root: string): BenchInclusionProof[] {
  const dir = join(root, "proofs", "inclusion");
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => JSON.parse(readUtf8(join(dir, name))) as BenchInclusionProof);
}

export interface AssuranceCertVerifyResult {
  ok: boolean;
  fileSha256: string;
  cert: z.infer<typeof assuranceCertSchema> | null;
  errors: string[];
  report: VerifierReportV1;
}

/**
 * Verifies an assurance certificate offline. signer.pub, the signature envelope and --pubkey only locate the signer:
 * the certificate and its signed Merkle root need keys the trust context admits for artifact-seal, and inclusion
 * proofs must resolve to that signed root (P0-09). ok equals report.trusted.
 */
export function verifyAssuranceCertificateFile(params: {
  file: string;
  publicKeyPath?: string;
  trust: TrustContext;
}): AssuranceCertVerifyResult {
  const file = resolve(params.file);
  const fileSha256 = sha256Hex(readFileSync(file));
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let anchoring: VerifierReportV1["anchoring"] = { status: "not-applicable", detail: null };
  const tmp = mkdtempSync(join(tmpdir(), "amc-assurance-cert-verify-"));
  let cert: z.infer<typeof assuranceCertSchema> | null = null;
  const finish = (): AssuranceCertVerifyResult => {
    const report = buildVerifierReport({ artifact: { kind: "assurance-certificate", path: file, sha256: fileSha256 }, context: params.trust,
      integrityErrors: errors, signatures, anchoring });
    return { ok: report.trusted, fileSha256, cert, errors, report };
  };
  try {
    tarExtract(file, tmp);
    const root = resolveRoot(tmp);
    const certPath = join(root, "cert.json");
    const sigPath = join(root, "cert.sig");
    if (!pathExists(certPath)) {
      errors.push("cert.json missing");
      return finish();
    }
    if (!pathExists(sigPath)) {
      errors.push("cert.sig missing");
      return finish();
    }

    cert = assuranceCertSchema.parse(JSON.parse(readUtf8(certPath)) as unknown);
    const sig = orgSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(Buffer.from(canonicalize(cert), "utf8"));
    if (digest !== sig.digestSha256) {
      errors.push("cert digest mismatch");
    }

    const candidates = [
      params.publicKeyPath ? readUtf8(resolve(params.publicKeyPath)) : null,
      pathExists(join(root, "signer.pub")) ? readUtf8(join(root, "signer.pub")) : null,
      envelopePublicKey(sig.envelope)
    ];
    const check = checkDigestSignature({ signature: "cert.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: sig.signature,
      candidates, context: params.trust, claimedSignedAt: sig.signedTs });
    signatures.push(check.admission);
    if (!check.verified || (sig.envelope !== undefined && sig.signature !== sig.envelope.sigB64)) {
      errors.push("certificate signature verification failed");
    }

    const proofs = parseInclusionProofs(root);
    const proofVerify = verifyProofsAgainstSignedRoot({ root, proofs, trust: params.trust, candidates, claimedSignedAt: sig.signedTs });
    errors.push(...proofVerify.errors.map((row) => `proof invalid: ${row}`));
    if (proofVerify.admission) signatures.push(proofVerify.admission);
    anchoring = proofVerify.anchoring;
    // The signed cert binds its proofs and roots (as passports do), so proofs from another artifact cannot be spliced in.
    const proofIds = proofs.map((row) => row.proofId).sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(proofIds) !== JSON.stringify([...cert.proofBindings.includedEventProofIds].sort((a, b) => a.localeCompare(b)))) {
      errors.push("included proof ids do not match cert proofBindings");
    }
    const rootSha = (name: string) => pathExists(join(root, "proofs", name)) ? sha256Hex(readFileSync(join(root, "proofs", name))) : "0".repeat(64);
    if (rootSha("merkle.root.json") !== cert.proofBindings.merkleRootSha256) errors.push("proofBindings.merkleRootSha256 mismatch");
    if (rootSha("transparency.root.json") !== cert.proofBindings.transparencyRootSha256) errors.push("proofBindings.transparencyRootSha256 mismatch");

    return finish();
  } catch (error) {
    errors.push(String(error));
    return finish();
  } finally {
    cleanup(tmp);
  }
}

export function verifyAssuranceWorkspace(params: {
  workspace: string;
}): {
  ok: boolean;
  errors: string[];
  policy: ReturnType<typeof verifyAssurancePolicySignature>;
  scheduler: ReturnType<typeof verifyAssuranceSchedulerSignature>;
  runs: Array<{ runId: string; ok: boolean; errors: string[] }>;
  latestCert: AssuranceCertVerifyResult | null;
} {
  const policy = verifyAssurancePolicySignature(params.workspace);
  const scheduler = verifyAssuranceSchedulerSignature(params.workspace);
  const runs = listAssuranceRunIds(params.workspace).map((runId) => {
    const verify = verifyAssuranceRunArtifacts(params.workspace, runId);
    return {
      runId,
      ok: verify.ok,
      errors: verify.errors
    };
  });

  const latestCertPath = assuranceLatestCertificatePath(params.workspace);
  const latestCert = pathExists(latestCertPath)
    ? verifyAssuranceCertificateFile({
        file: latestCertPath,
        // A workspace self-check of its own latest certificate: its own keys are the pins, labelled workspace-self.
        trust: workspaceSelfTrust(params.workspace)
      })
    : null;

  const errors: string[] = [];
  if (!policy.valid) {
    errors.push(`policy: ${policy.reason ?? "invalid signature"}`);
  }
  if (!(scheduler.valid || !scheduler.signatureExists)) {
    errors.push(`scheduler: ${scheduler.reason ?? "invalid signature"}`);
  }
  for (const run of runs) {
    if (!run.ok) {
      errors.push(`run ${run.runId}: ${run.errors.join("; ")}`);
    }
  }
  if (latestCert && !latestCert.ok) {
    errors.push(`latest cert: ${latestCert.errors.join("; ")}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    policy,
    scheduler,
    runs,
    latestCert
  };
}

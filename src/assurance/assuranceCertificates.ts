import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { buildBenchProofs, writeBenchProofFiles } from "../bench/benchProofs.js";
import { loadTrustConfig, checkNotaryTrust } from "../trust/trustConfig.js";
import { promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { cgxLatestPackPath } from "../cgx/cgxStore.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
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
  assuranceTimestampedCertificatePath,
  assuranceTimestampedCertificateShaPath,
  loadAssuranceFindings,
  loadAssurancePolicy,
  loadAssuranceRun,
  verifyAssurancePolicySignature
} from "./assurancePolicyStore.js";
import { evaluateAssuranceEvidenceGates } from "./assuranceScoring.js";

function cleanup(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function tarCreateDeterministic(sourceDir: string, outFile: string): void {
  const files = collectFiles(sourceDir);
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create assurance certificate: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
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

function fileSha(path: string): string {
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(path));
}

function scopeIdHash(type: AssuranceScopeType, id: string): string {
  const value = type === "WORKSPACE" ? "workspace" : id;
  return sha256Hex(Buffer.from(value, "utf8")).slice(0, 16);
}

function cgxPackSha(workspace: string, scope: { type: AssuranceScopeType; id: string }): string {
  if (scope.type !== "AGENT") {
    return "0".repeat(64);
  }
  return fileSha(cgxLatestPackPath(workspace, scope.id));
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


export async function issueAssuranceCertificate(params: {
  workspace: string;
  runId: string;
  outFile?: string;
}): Promise<AssuranceIssueCertificateResult> {
  const policySig = verifyAssurancePolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`assurance policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const policy = loadAssurancePolicy(params.workspace);
  const run = loadAssuranceRun(params.workspace, params.runId);
  if (!run) {
    throw new Error(`assurance run not found: ${params.runId}`);
  }
  const findings = loadAssuranceFindings(params.workspace, params.runId);
  if (!findings) {
    throw new Error(`assurance findings not found for run: ${params.runId}`);
  }
  const evidence = evaluateAssuranceEvidenceGates({
    policy,
    gates: run.evidenceGates
  });
  if (!evidence.ok) {
    throw new Error(`certificate issuance blocked: evidence gates failed (${evidence.reasons.join("; ")})`);
  }

  const trust = loadTrustConfig(params.workspace);
  const notary = await checkNotaryTrust(params.workspace);

  const proofs = buildBenchProofs({
    workspace: params.workspace,
    includeEventKinds: [
      "ASSURANCE_RUN_STARTED",
      "ASSURANCE_RUN_COMPLETED",
      "ASSURANCE_FINDING_RECORDED",
      "ASSURANCE_CERT_ISSUED",
      "NOTARY_ATTESTATION_OBSERVED"
    ],
    maxProofs: 40
  });

  const cert = assuranceCertSchema.parse({
    v: 1,
    certId: `cert_${randomUUID().replace(/-/g, "")}`,
    issuedTs: Date.now(),
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
      cgxPackSha256: cgxPackSha(params.workspace, run.scope),
      promptPolicySha256: fileSha(promptPolicyPath(params.workspace)),
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
  const signed = signDigestWithPolicy({
    workspace: params.workspace,
    kind: "CERT",
    digestHex: certDigest
  });
  const signature = orgSignatureSchema.parse({
    digestSha256: certDigest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });

  const outFile = resolve(
    params.workspace,
    params.outFile ?? assuranceTimestampedCertificatePath(params.workspace, cert.issuedTs)
  );
  ensureDir(dirname(outFile));

  const tmp = mkdtempSync(join(tmpdir(), "amc-assurance-cert-"));
  try {
    const root = join(tmp, "amc-cert");
    ensureDir(root);
    ensureDir(join(root, "proofs"));
    ensureDir(join(root, "meta"));

    const certPath = join(root, "cert.json");
    writeFileAtomic(certPath, `${canonicalize(cert)}\n`, 0o644);
    writeFileAtomic(join(root, "cert.sig"), `${canonicalize(signature)}\n`, 0o644);

    const signerPub = signerPubFromSignature(params.workspace, signature);
    if (!signerPub) {
      throw new Error("missing signer public key for certificate");
    }
    writeFileAtomic(join(root, "signer.pub"), signerPub, 0o644);

    writeBenchProofFiles({
      outDir: root,
      bundle: proofs
    });

    writeFileAtomic(join(root, "meta", "policy.sha256"), `${run.policySha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "run.sha256"), `${fileSha(join(params.workspace, ".amc", "assurance", "runs", run.runId, "run.json"))}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "findings.sha256"), `${fileSha(join(params.workspace, ".amc", "assurance", "runs", run.runId, "findings.json"))}\n`, 0o644);

    tarCreateDeterministic(tmp, outFile);
  } finally {
    cleanup(tmp);
  }

  const sha256 = sha256Hex(readFileSync(outFile));
  writeFileAtomic(`${outFile}.sha256`, `${sha256}\n`, 0o644);

  ensureDir(assuranceCertificatesDir(params.workspace));
  const latestPath = assuranceLatestCertificatePath(params.workspace);
  const timestampedPath = assuranceTimestampedCertificatePath(params.workspace, cert.issuedTs);
  if (outFile !== latestPath) {
    writeFileAtomic(latestPath, readFileSync(outFile));
    writeFileAtomic(assuranceLatestCertificateShaPath(params.workspace), `${sha256}\n`, 0o644);
  } else {
    writeFileAtomic(assuranceLatestCertificateShaPath(params.workspace), `${sha256}\n`, 0o644);
  }
  if (outFile !== timestampedPath) {
    writeFileAtomic(timestampedPath, readFileSync(outFile));
    writeFileAtomic(assuranceTimestampedCertificateShaPath(params.workspace, cert.issuedTs), `${sha256}\n`, 0o644);
  } else {
    writeFileAtomic(assuranceTimestampedCertificateShaPath(params.workspace, cert.issuedTs), `${sha256}\n`, 0o644);
  }

  const transparency = appendTransparencyEntry({
    workspace: params.workspace,
    type: "ASSURANCE_CERT_ISSUED",
    agentId: run.scope.type === "AGENT" ? run.scope.id : "workspace",
    artifact: {
      kind: "amccert",
      sha256,
      id: cert.certId
    }
  });

  return {
    outFile,
    sha256,
    cert,
    transparencyHash: transparency.hash,
    latestPath,
    timestampedPath
  };
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

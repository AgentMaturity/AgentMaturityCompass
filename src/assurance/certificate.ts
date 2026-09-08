import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAgentConfig } from "../fleet/registry.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../bundles/bundle.js";
import type { AssurancePackResult, AssuranceReport, DiagnosticReport, GatePolicy } from "../types.js";
import { runBundleGate, parseGatePolicy, evaluateGatePolicy } from "../ci/gate.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getPrivateKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { verifyKeyHistoryEnvelope, type KeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { verifyLedgerIntegrity } from "../ledger/ledger.js";
import { computeFailureRiskIndices } from "./indices.js";
import { latestAssuranceReports } from "./assuranceRunner.js";
import { appendTransparencyEntry, verifyTransparencyLog } from "../transparency/logChain.js";
import { ensureTransparencyMerkleInitialized, verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
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


interface CertSignature {
  certSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

interface CertificatePayload {
  certId: string;
  issuedTs: number;
  issuer: string;
  agentId: string;
  agentName: string;
  domain: string;
  riskTier: string;
  maturity: {
    overall: number;
    layerScores: Array<{ layerName: string; avgFinalLevel: number }>;
    selectedQuestions: Array<{ questionId: string; finalLevel: number }>;
  };
  integrityIndex: number;
  trustLabel: string;
  assurancePackScores: Array<{ assuranceRunId: string; packId: string; score0to100: number; trustTier: string }>;
  indices: ReturnType<typeof computeFailureRiskIndices>["indices"];
  validityWindow: {
    startTs: number;
    endTs: number;
  };
  references: {
    runId: string;
    runReportSha256: string;
    runReportSig: string;
    gatePolicySha256: string;
    gatePolicySigSha256: string;
  };
  verificationInstructions: string[];
}

interface RevocationPayload {
  certId: string;
  reason: string;
  ts: number;
  issuerFingerprint: string;
  auditorPub: string;
  signature: string;
}

function mkTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runTarCreate(sourceDir: string, outputFile: string): void {
  const out = spawnSync("tar", ["-czf", outputFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`tar create failed: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function runTarExtract(bundleFile: string, outputDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outputDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function overall(report: DiagnosticReport): number {
  if (report.layerScores.length === 0) {
    return 0;
  }
  return Number((report.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / report.layerScores.length).toFixed(4));
}

function trustTierMapFromDb(dbPath: string): Map<string, string> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare("SELECT id, event_type, meta_json FROM evidence_events ORDER BY rowid ASC").all() as Array<{
      id: string;
      event_type: string;
      meta_json: string;
    }>;
    const map = new Map<string, string>();
    for (const row of rows) {
      let tier = "OBSERVED";
      try {
        const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
        if (
          meta.trustTier === "OBSERVED" ||
          meta.trustTier === "OBSERVED_HARDENED" ||
          meta.trustTier === "ATTESTED" ||
          meta.trustTier === "SELF_REPORTED"
        ) {
          tier = meta.trustTier;
        } else if (row.event_type === "review") {
          tier = "SELF_REPORTED";
        }
      } catch {
        if (row.event_type === "review") {
          tier = "SELF_REPORTED";
        }
      }
      map.set(row.id, tier);
    }
    return map;
  } finally {
    db.close();
  }
}

function materializeCertWorkspace(root: string): string {
  const workspace = mkTmp("amc-cert-verify-workspace-");
  const amcDir = join(workspace, ".amc");
  const keysDir = join(amcDir, "keys");
  const blobsDir = join(amcDir, "blobs");
  const targetsDir = join(amcDir, "targets");
  ensureDir(keysDir);
  ensureDir(blobsDir);
  ensureDir(targetsDir);

  writeFileAtomic(join(amcDir, "evidence.sqlite"), readFileSync(join(root, "evidence", "evidence.sqlite")));
  if (pathExists(join(root, "evidence", "blobs"))) {
    for (const name of readdirSync(join(root, "evidence", "blobs"))) {
      writeFileAtomic(join(blobsDir, name), readFileSync(join(root, "evidence", "blobs", name)));
    }
  }

  writeFileAtomic(join(keysDir, "monitor_ed25519.pub"), readFileSync(join(root, "public-keys", "monitor.pub")));
  writeFileAtomic(join(keysDir, "auditor_ed25519.pub"), readFileSync(join(root, "public-keys", "auditor.pub")));
  for (const kind of ["monitor", "auditor"] as const) {
    const history = authenticatedHistoryFromCert(root, kind);
    if (history) {
      writeFileAtomic(join(keysDir, `${kind}_history.json`), JSON.stringify(history, null, 2), 0o644);
    }
  }

  if (pathExists(join(root, "target.json"))) {
    writeFileAtomic(join(targetsDir, "bundle.target.json"), readFileSync(join(root, "target.json")));
  }

  return workspace;
}

function loadAssuranceForCert(workspace: string, agentId: string, run: DiagnosticReport): AssuranceReport[] {
  return latestAssuranceReports({
    workspace,
    agentId,
    windowStartTs: run.windowStartTs,
    windowEndTs: run.windowEndTs
  }).slice(0, 10);
}

export async function issueCertificate(params: {
  workspace: string;
  runId: string;
  policyPath: string;
  outFile: string;
  agentId?: string;
}): Promise<{
  outFile: string;
  certId: string;
}> {
  const workspace = params.workspace;
  const plugins = verifyPluginWorkspace({ workspace });
  if (!plugins.ok) {
    throw new Error(`Cannot issue certificate: plugin integrity invalid (${plugins.errors.join("; ")})`);
  }
  const transparency = verifyTransparencyLog(workspace);
  if (!transparency.ok) {
    throw new Error(`Cannot issue certificate: transparency log invalid (${transparency.errors.join("; ")})`);
  }
  ensureTransparencyMerkleInitialized(workspace);
  const merkleVerify = verifyTransparencyMerkle(workspace);
  if (!merkleVerify.ok) {
    throw new Error(`Cannot issue certificate: transparency merkle invalid (${merkleVerify.errors.join("; ")})`);
  }
  const agentId = resolveAgentId(workspace, params.agentId);
  const agentPaths = getAgentPaths(workspace, agentId);
  const runPath = join(agentPaths.runsDir, `${params.runId}.json`);
  if (!pathExists(runPath)) {
    throw new Error(`Run file not found: ${runPath}`);
  }
  const run = JSON.parse(readUtf8(runPath)) as DiagnosticReport;
  const policyAbs = resolve(workspace, params.policyPath);
  const policySigAbs = `${policyAbs}.sig`;
  if (!pathExists(policyAbs) || !pathExists(policySigAbs)) {
    throw new Error(`Gate policy or signature missing: ${policyAbs}`);
  }

  const bundleDir = mkTmp("amc-cert-bundle-");
  const tmpBundle = join(bundleDir, "run.amcbundle");
  const exported = exportEvidenceBundle({
    workspace,
    runId: params.runId,
    outFile: tmpBundle,
    agentId
  });
  const bundleVerification = await verifyEvidenceBundle(exported.outFile);
  if (!bundleVerification.ok) {
    throw new Error(`Cannot issue certificate: bundle verification failed (${bundleVerification.errors.join("; ")})`);
  }

  const gateResult = await runBundleGate({
    workspace,
    bundlePath: exported.outFile,
    policyPath: policyAbs
  });
  if (!gateResult.pass) {
    throw new Error(`Cannot issue certificate: gate policy failed (${gateResult.reasons.join("; ")})`);
  }

  const certRoot = mkTmp("amc-cert-root-");
  const extractedBundleDir = mkTmp("amc-cert-extract-");
  try {
    runTarExtract(exported.outFile, extractedBundleDir);

    ensureDir(certRoot);
    ensureDir(join(certRoot, "evidence", "blobs"));
    ensureDir(join(certRoot, "public-keys"));
    ensureDir(join(certRoot, "assurance"));
    ensureDir(join(certRoot, "metadata"));

    for (const rel of ["run.json", "run.md", "context-graph.json", "target.json", "target.sig"]) {
      const source = join(extractedBundleDir, rel);
      if (pathExists(source)) {
        writeFileAtomic(join(certRoot, rel), readFileSync(source));
      }
    }
    writeFileAtomic(join(certRoot, "evidence", "evidence.sqlite"), readFileSync(join(extractedBundleDir, "evidence", "evidence.sqlite")));
    if (pathExists(join(extractedBundleDir, "evidence", "blobs"))) {
      for (const name of readdirSync(join(extractedBundleDir, "evidence", "blobs"))) {
        writeFileAtomic(join(certRoot, "evidence", "blobs", name), readFileSync(join(extractedBundleDir, "evidence", "blobs", name)));
      }
    }
    writeFileAtomic(join(certRoot, "public-keys", "monitor.pub"), readFileSync(join(extractedBundleDir, "public-keys", "monitor.pub")));
    writeFileAtomic(join(certRoot, "public-keys", "auditor.pub"), readFileSync(join(extractedBundleDir, "public-keys", "auditor.pub")));
    writeFileAtomic(
      join(certRoot, "public-keys", "key-history.json"),
      JSON.stringify({
        monitor: authenticatedHistoryFromCert(extractedBundleDir, "monitor"),
        auditor: authenticatedHistoryFromCert(extractedBundleDir, "auditor")
      }, null, 2)
    );

    writeFileAtomic(join(certRoot, "gatePolicy.json"), readFileSync(policyAbs));
    writeFileAtomic(join(certRoot, "gatePolicy.json.sig"), readFileSync(policySigAbs));

    const assuranceReports = loadAssuranceForCert(workspace, agentId, run);
    const assurancePackScores: Array<{ assuranceRunId: string; packId: string; score0to100: number; trustTier: string }> = [];
    for (const assurance of assuranceReports) {
      writeFileAtomic(join(certRoot, "assurance", `${assurance.assuranceRunId}.json`), JSON.stringify(assurance, null, 2), 0o644);
      for (const pack of assurance.packResults) {
        assurancePackScores.push({
          assuranceRunId: assurance.assuranceRunId,
          packId: pack.packId,
          score0to100: pack.score0to100,
          trustTier: pack.trustTier
        });
      }
    }

    const assuranceByPack = new Map<string, AssurancePackResult>();
    for (const assurance of assuranceReports) {
      for (const pack of assurance.packResults) {
        const prior = assuranceByPack.get(pack.packId);
        if (!prior || pack.score0to100 > prior.score0to100) {
          assuranceByPack.set(pack.packId, pack);
        }
      }
    }
    const indices = computeFailureRiskIndices({
      run,
      assuranceByPack
    });

    let agentName = agentId;
    let domain = "unknown";
    let riskTier = "med";
    try {
      const cfg = loadAgentConfig(workspace, agentId);
      agentName = cfg.agentName;
      domain = cfg.domain;
      riskTier = cfg.riskTier;
    } catch {
      // default agent mode can omit signed config.
    }

    const auditorPub = readUtf8(join(certRoot, "public-keys", "auditor.pub"));
    const issuerFingerprint = sha256Hex(auditorPub);
    const certId = randomUUID();
    const certPayload: CertificatePayload = {
      certId,
      issuedTs: Date.now(),
      issuer: issuerFingerprint,
      agentId,
      agentName,
      domain,
      riskTier,
      maturity: {
        overall: overall(run),
        layerScores: run.layerScores.map((row) => ({
          layerName: row.layerName,
          avgFinalLevel: row.avgFinalLevel
        })),
        selectedQuestions: run.questionScores
          .slice()
          .sort((a, b) => b.finalLevel - a.finalLevel || a.questionId.localeCompare(b.questionId))
          .slice(0, 12)
          .map((row) => ({ questionId: row.questionId, finalLevel: row.finalLevel }))
      },
      integrityIndex: run.integrityIndex,
      trustLabel: run.trustLabel,
      assurancePackScores,
      indices: indices.indices,
      validityWindow: {
        startTs: run.windowStartTs,
        endTs: run.windowEndTs
      },
      references: {
        runId: run.runId,
        runReportSha256: run.reportJsonSha256,
        runReportSig: run.runSealSig,
        gatePolicySha256: sha256Hex(readFileSync(policyAbs)),
        gatePolicySigSha256: sha256Hex(readFileSync(policySigAbs))
      },
      verificationInstructions: [
        "Run `amc cert verify <file.amccert>` to verify signatures and ledger integrity offline.",
        "Use `amc cert inspect <file.amccert>` to review maturity and assurance summary.",
        "Optionally pass `--revocation <file.amcrevoke>` during verification."
      ]
    };

    writeFileAtomic(join(certRoot, "cert.json"), JSON.stringify(certPayload, null, 2), 0o644);
    const certSha = sha256Hex(readFileSync(join(certRoot, "cert.json")));
    const certSig: CertSignature = {
      certSha256: certSha,
      signature: signHexDigest(certSha, getPrivateKeyPem(workspace, "auditor")),
      signedTs: Date.now(),
      signer: "auditor"
    };
    writeFileAtomic(join(certRoot, "cert.sig"), JSON.stringify(certSig, null, 2), 0o644);

    writeFileAtomic(
      join(certRoot, "metadata", "exportInfo.json"),
      JSON.stringify(
        {
          tool: "agent-maturity-compass",
          certId,
          runId: run.runId,
          agentId,
          exportedTs: Date.now(),
          fileCount: listFiles(certRoot).length
        },
        null,
        2
      ),
      0o644
    );

    const outFile = resolve(workspace, params.outFile);
    ensureDir(dirname(outFile));
    runTarCreate(certRoot, outFile);
    appendTransparencyEntry({
      workspace,
      type: "CERT_ISSUED",
      agentId,
      artifact: {
        kind: "amccert",
        sha256: sha256Hex(readFileSync(outFile)),
        id: certId
      }
    });
    return {
      outFile,
      certId
    };
  } finally {
    rmSync(bundleDir, { recursive: true, force: true });
    rmSync(certRoot, { recursive: true, force: true });
    rmSync(extractedBundleDir, { recursive: true, force: true });
  }
}

export function inspectCertificate(certFile: string): {
  cert: CertificatePayload;
  fileCount: number;
  files: string[];
} {
  const extracted = mkTmp("amc-cert-inspect-");
  try {
    runTarExtract(certFile, extracted);
    const cert = JSON.parse(readUtf8(join(extracted, "cert.json"))) as CertificatePayload;
    const files = listFiles(extracted);
    return {
      cert,
      fileCount: files.length,
      files
    };
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

export async function verifyCertificate(params: {
  certFile: string;
  revocationFile?: string;
}): Promise<{ ok: boolean; errors: string[]; certId: string | null }> {
  const extracted = mkTmp("amc-cert-verify-");
  const errors: string[] = [];
  try {
    runTarExtract(params.certFile, extracted);
    if (!pathExists(join(extracted, "cert.json")) || !pathExists(join(extracted, "cert.sig"))) {
      return { ok: false, errors: ["certificate missing cert.json or cert.sig"], certId: null };
    }
    let cert: CertificatePayload | null = null;
    let certSig: CertSignature | null = null;
    try {
      cert = JSON.parse(readUtf8(join(extracted, "cert.json"))) as CertificatePayload;
    } catch (error) {
      errors.push(`invalid cert.json: ${String(error)}`);
    }
    try {
      certSig = JSON.parse(readUtf8(join(extracted, "cert.sig"))) as CertSignature;
    } catch (error) {
      errors.push(`invalid cert.sig: ${String(error)}`);
    }
    if (!cert || !certSig) {
      return { ok: false, errors, certId: cert?.certId ?? null };
    }

    const certBytes = readFileSync(join(extracted, "cert.json"));
    const certSha = sha256Hex(certBytes);
    const auditorKeys = getPublicKeyHistoryFromCert(extracted, "auditor");
    if (certSha !== certSig.certSha256) {
      errors.push("cert digest mismatch");
    }
    if (!verifyHexDigestAny(certSha, certSig.signature, auditorKeys)) {
      errors.push("cert signature invalid");
    }

    let run: DiagnosticReport | null = null;
    try {
      run = JSON.parse(readUtf8(join(extracted, "run.json"))) as DiagnosticReport;
    } catch (error) {
      errors.push(`invalid run.json: ${String(error)}`);
    }
    if (!run) {
      return { ok: false, errors, certId: cert.certId };
    }
    const runBase = {
      ...run,
      runSealSig: "",
      reportJsonSha256: ""
    };
    const runHash = sha256Hex(canonicalize(runBase));
    if (runHash !== run.reportJsonSha256) {
      errors.push("run report hash mismatch");
    }
    if (!verifyHexDigestAny(run.reportJsonSha256, run.runSealSig, auditorKeys)) {
      errors.push("run seal signature invalid");
    }

    let policy: GatePolicy | null = null;
    let policySig: { digestSha256: string; signature: string } | null = null;
    try {
      policy = parseGatePolicy(JSON.parse(readUtf8(join(extracted, "gatePolicy.json"))) as GatePolicy);
    } catch (error) {
      errors.push(`invalid gatePolicy.json: ${String(error)}`);
    }
    try {
      policySig = JSON.parse(readUtf8(join(extracted, "gatePolicy.json.sig"))) as {
        digestSha256: string;
        signature: string;
      };
    } catch (error) {
      errors.push(`invalid gatePolicy.json.sig: ${String(error)}`);
    }
    if (!policy || !policySig) {
      return { ok: false, errors, certId: cert.certId };
    }
    const policyBytes = readFileSync(join(extracted, "gatePolicy.json"));
    const policySha = sha256Hex(policyBytes);
    if (policySha !== policySig.digestSha256) {
      errors.push("gate policy digest mismatch");
    }
    if (!verifyHexDigestAny(policySha, policySig.signature, auditorKeys)) {
      errors.push("gate policy signature invalid");
    }

    const trustMap = trustTierMapFromDb(join(extracted, "evidence", "evidence.sqlite"));
    const gate = evaluateGatePolicy({
      report: run,
      policy,
      eventTrustTier: trustMap
    });
    if (!gate.pass) {
      errors.push(...gate.reasons.map((reason) => `gate policy failed: ${reason}`));
    }

    const verifyWorkspace = materializeCertWorkspace(extracted);
    try {
      const ledgerResult = await verifyLedgerIntegrity(verifyWorkspace);
      if (!ledgerResult.ok) {
        errors.push(...ledgerResult.errors.map((error) => `ledger verify failed: ${error}`));
      }
    } finally {
      rmSync(verifyWorkspace, { recursive: true, force: true });
    }

    for (const assuranceFile of readdirSync(join(extracted, "assurance"))) {
      if (!assuranceFile.endsWith(".json")) {
        continue;
      }
      const assurancePath = join(extracted, "assurance", assuranceFile);
      const assurance = JSON.parse(readUtf8(assurancePath)) as AssuranceReport;
      if (!assurance.reportJsonSha256 || !assurance.runSealSig) {
        errors.push(`assurance report missing signature fields: ${assuranceFile}`);
      }
    }

    if (params.revocationFile) {
      const revocation = verifyRevocationFile(params.revocationFile);
      if (!revocation.ok) {
        errors.push(...revocation.errors.map((error) => `revocation invalid: ${error}`));
      } else if (revocation.payload && revocation.payload.certId === cert.certId) {
        errors.push(`certificate revoked: ${revocation.payload.reason}`);
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      certId: cert.certId
    };
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

function authenticatedHistoryFromCert(root: string, kind: "monitor" | "auditor"): KeyHistoryEnvelope | null {
  const direct = readUtf8(join(root, "public-keys", `${kind}.pub`));
  const historyFile = join(root, "public-keys", "key-history.json");
  try {
    const parsed: unknown = JSON.parse(readUtf8(historyFile));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const result = verifyKeyHistoryEnvelope((parsed as Record<string, unknown>)[kind], kind, direct);
    return result.valid ? result.envelope : null;
  } catch {
    return null;
  }
}

function getPublicKeyHistoryFromCert(root: string, kind: "monitor" | "auditor"): string[] {
  const direct = readUtf8(join(root, "public-keys", `${kind}.pub`));
  const history = authenticatedHistoryFromCert(root, kind);
  return [...new Set([direct, ...(history?.entries.map((entry) => entry.publicKeyPem) ?? [])])];
}

export function revokeCertificate(params: {
  workspace: string;
  certFile: string;
  reason: string;
  outFile: string;
}): { outFile: string; certId: string } {
  const inspect = inspectCertificate(params.certFile);
  const certId = inspect.cert.certId;
  const auditorPubPath = join(params.workspace, ".amc", "keys", "auditor_ed25519.pub");
  const auditorPub = readUtf8(auditorPubPath);
  const payloadBase = {
    certId,
    reason: params.reason,
    ts: Date.now(),
    issuerFingerprint: sha256Hex(auditorPub),
    auditorPub
  };
  const digest = sha256Hex(canonicalize(payloadBase));
  const signature = signHexDigest(digest, getPrivateKeyPem(params.workspace, "auditor"));
  const payload: RevocationPayload = {
    ...payloadBase,
    signature
  };
  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, JSON.stringify(payload, null, 2), 0o644);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "CERT_REVOKED",
    agentId: inspect.cert.agentId,
    artifact: {
      kind: "amccert",
      sha256: sha256Hex(readFileSync(outFile)),
      id: certId
    }
  });
  return {
    outFile,
    certId
  };
}

function verifyRevocationFile(revocationFile: string): {
  ok: boolean;
  errors: string[];
  payload: RevocationPayload | null;
} {
  const errors: string[] = [];
  let payload: RevocationPayload | null = null;
  try {
    payload = JSON.parse(readUtf8(revocationFile)) as RevocationPayload;
    const base = {
      certId: payload.certId,
      reason: payload.reason,
      ts: payload.ts,
      issuerFingerprint: payload.issuerFingerprint,
      auditorPub: payload.auditorPub
    };
    const digest = sha256Hex(canonicalize(base));
    const pubKey = payload.auditorPub;
    if (!verifyHexDigestAny(digest, payload.signature, [pubKey])) {
      errors.push("revocation signature invalid");
    }
    if (sha256Hex(pubKey) !== payload.issuerFingerprint) {
      errors.push("issuer fingerprint mismatch");
    }
  } catch (error) {
    errors.push(`failed to parse revocation file: ${String(error)}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    payload
  };
}

export function verifyRevocation(revocationFile: string): { ok: boolean; errors: string[]; certId: string | null } {
  const result = verifyRevocationFile(revocationFile);
  return {
    ok: result.ok,
    errors: result.errors,
    certId: result.payload?.certId ?? null
  };
}

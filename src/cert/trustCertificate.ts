import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { extname, join, resolve } from "node:path";
import {
  ensureSigningKeys,
} from "../crypto/keys.js";
import { resolveAgentId } from "../fleet/paths.js";
import { latestVerifiedRun } from "../diagnostic/runReportResolution.js";
import type { DiagnosticReport } from "../types.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { canonicalSigningKey, SIGNING_ALGORITHMS, type SigningAlgorithm } from "../keys/algorithmPolicy.js";
import { describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { buildVerifierReport, checkDigestSignature, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CHAIN_SAMPLES = 24;
const PREVIEW_FINGERPRINT = "UNSIGNED_PREVIEW";
const PREVIEW_SIGNATURE = "UNSIGNED_PREVIEW";
const PREVIEW_CLAIM_BOUNDARY = "Unsigned preview certificate for demos and format review only. It is not verifier-ready evidence and must not be presented as a signed AMC trust certificate.";

export type TrustCertificateSignatureStatus = "SIGNED" | "UNSIGNED_PREVIEW";

export interface TrustCertificateEvidenceHashChain {
  eventCount: number;
  genesisHash: string;
  headHash: string;
  chainDigest: string;
  sampleHashes: string[];
  brokenLinks: number;
}

export interface TrustCertificatePayload {
  schemaVersion: 1;
  certificateId: string;
  generatedTs: number;
  agentId: string;
  score: number;
  integrityIndex: number;
  scoreSourceRunId: string | null;
  scoreSourceRunTs: number | null;
  /** The sealed reportJsonSha256 of the score source run (WP37); absent on certificates issued before it. */
  scoreSourceRunSha256?: string | null;
  evidenceHashChain: TrustCertificateEvidenceHashChain;
  signingKey: {
    kind: "auditor" | "preview";
    fingerprint: string;
    publicKeyPem: string;
  };
  validity: {
    notBeforeTs: number;
    notAfterTs: number;
    daysValid: number;
  };
}

export interface TrustCertificateEnvelope {
  type: "amc-trust-certificate";
  signatureAlgorithm: SigningAlgorithm | "unsigned-preview";
  signatureStatus: TrustCertificateSignatureStatus;
  payloadSha256: string;
  signature: string;
  claimBoundary?: string;
  payload: TrustCertificatePayload;
}

export interface GenerateTrustCertificateInput {
  workspace: string;
  agentId: string;
  outputPath: string;
  validityDays?: number;
  nowTs?: number;
  preview?: boolean;
}

export interface GeneratedTrustCertificate {
  outputPath: string;
  format: "pdf" | "json";
  signatureStatus: TrustCertificateSignatureStatus;
  sidecarJsonPath?: string;
  envelope: TrustCertificateEnvelope;
}

export interface TrustCertificateVerificationResult {
  ok: boolean;
  errors: string[];
  report: VerifierReportV1;
}

interface RunSnapshot {
  runId: string | null;
  runTs: number | null;
  runSha256: string | null;
  integrityIndex: number;
  score0to100: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A run's integrity 0..1: its integrityIndex, else mean layer level / 5. Shared by the trust certificate, drift monitor and regulatory readiness. */
export function deriveIntegrityIndex(report: Partial<DiagnosticReport>): number {
  if (typeof report.integrityIndex === "number" && Number.isFinite(report.integrityIndex)) {
    return clamp01(report.integrityIndex);
  }
  if (Array.isArray(report.layerScores) && report.layerScores.length > 0) {
    const numeric = report.layerScores
      .map((row) => row?.avgFinalLevel)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (numeric.length > 0) {
      const avg = numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
      return clamp01(avg / 5);
    }
  }
  return 0;
}

/** The newest run whose seal verifies (WP37): an edited run file must not become a signed score. */
function loadLatestRunSnapshot(workspace: string, agentId: string): RunSnapshot & { blocking: string[] } {
  const { run: best, blocking } = latestVerifiedRun(workspace, agentId);
  if (!best) {
    return { runId: null, runTs: null, runSha256: null, integrityIndex: 0, score0to100: 0, blocking: blocking.map((row) => row.file) };
  }
  const integrityIndex = deriveIntegrityIndex(best);
  return {
    runId: best.runId,
    runTs: best.ts,
    runSha256: best.reportJsonSha256,
    integrityIndex,
    score0to100: round2(integrityIndex * 100),
    blocking: []
  };
}

function emptyChain(): TrustCertificateEvidenceHashChain {
  return {
    eventCount: 0,
    genesisHash: "GENESIS",
    headHash: "GENESIS",
    chainDigest: sha256Hex("GENESIS"),
    sampleHashes: [],
    brokenLinks: 0
  };
}

function readEvidenceHashChain(workspace: string): TrustCertificateEvidenceHashChain {
  const dbPath = join(workspace, ".amc", "evidence.sqlite");
  if (!pathExists(dbPath)) {
    return emptyChain();
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare("SELECT prev_event_hash, event_hash FROM evidence_events ORDER BY rowid ASC")
      .all() as Array<{ prev_event_hash: string; event_hash: string }>;
    if (rows.length === 0) {
      return emptyChain();
    }

    const hasher = createHash("sha256");
    let previous = "GENESIS";
    let brokenLinks = 0;
    const sampleHashes: string[] = [];
    for (const row of rows) {
      if (row.prev_event_hash !== previous) {
        brokenLinks += 1;
      }
      hasher.update(row.prev_event_hash);
      hasher.update(":");
      hasher.update(row.event_hash);
      hasher.update("\n");
      previous = row.event_hash;
      sampleHashes.push(row.event_hash);
      if (sampleHashes.length > MAX_CHAIN_SAMPLES) {
        sampleHashes.shift();
      }
    }

    return {
      eventCount: rows.length,
      genesisHash: rows[0]!.prev_event_hash,
      headHash: previous,
      chainDigest: hasher.digest("hex"),
      sampleHashes,
      brokenLinks
    };
  } finally {
    db.close();
  }
}

function normalizeValidityDays(days?: number): number {
  if (typeof days !== "number" || !Number.isFinite(days)) {
    return 30;
  }
  return Math.max(1, Math.min(3650, Math.floor(days)));
}

function escapePdfText(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function renderPdfFromLines(lines: string[]): Buffer {
  const sliced = lines.map((line) => line.trimEnd()).slice(0, 110);
  const content: string[] = ["BT", "/F1 10 Tf", "40 810 Td"];
  let first = true;
  for (const line of sliced) {
    if (!first) {
      content.push("0 -13 Td");
    }
    first = false;
    const clipped = line.length > 110 ? `${line.slice(0, 107)}...` : line;
    content.push(`(${escapePdfText(clipped || " ")}) Tj`);
  }
  content.push("ET");

  const stream = content.join("\n");
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function renderTrustCertificatePdf(envelope: TrustCertificateEnvelope): Buffer {
  const lines = [
    "AMC Execution-Proof Trust Certificate",
    "",
    `Certificate ID: ${envelope.payload.certificateId}`,
    `Agent ID: ${envelope.payload.agentId}`,
    `Generated: ${new Date(envelope.payload.generatedTs).toISOString()}`,
    `Score: ${envelope.payload.score.toFixed(2)}/100`,
    `Integrity Index: ${envelope.payload.integrityIndex.toFixed(4)}`,
    `Score Source Run: ${envelope.payload.scoreSourceRunId ?? "none"}`,
    `Certificate Status: ${envelope.signatureStatus}`,
    envelope.signatureStatus === "UNSIGNED_PREVIEW"
      ? `Claim Boundary: ${envelope.claimBoundary ?? PREVIEW_CLAIM_BOUNDARY}`
      : "Claim Boundary: Signed AMC trust certificate; verify before relying on it.",
    "",
    "Evidence Hash Chain",
    `  Event Count: ${envelope.payload.evidenceHashChain.eventCount}`,
    `  Genesis Hash: ${envelope.payload.evidenceHashChain.genesisHash}`,
    `  Head Hash: ${envelope.payload.evidenceHashChain.headHash}`,
    `  Chain Digest: ${envelope.payload.evidenceHashChain.chainDigest}`,
    `  Broken Links: ${envelope.payload.evidenceHashChain.brokenLinks}`,
    "",
    "Signing",
    `  Key Fingerprint: ${envelope.payload.signingKey.fingerprint}`,
    `  Signature Algorithm: ${envelope.signatureAlgorithm}`,
    `  Payload SHA256: ${envelope.payloadSha256}`,
    `  Signature (base64): ${envelope.signature}`,
    "",
    "Validity Period",
    `  Not Before: ${new Date(envelope.payload.validity.notBeforeTs).toISOString()}`,
    `  Not After: ${new Date(envelope.payload.validity.notAfterTs).toISOString()}`,
    `  Days Valid: ${envelope.payload.validity.daysValid}`,
    "",
    "Tamper Evidence",
    envelope.signatureStatus === "UNSIGNED_PREVIEW"
      ? "  Preview only: no signing key was used, and offline verification must fail."
      : "  Verify payload SHA256 over canonical JSON and signature with signing public key.",
    "  Full machine-readable envelope is emitted as a .json sidecar."
  ];
  return renderPdfFromLines(lines);
}

function prepareTrustCertificate(input: GenerateTrustCertificateInput) {
  const workspace = input.workspace;
  const agentId = resolveAgentId(workspace, input.agentId);
  const nowTs = typeof input.nowTs === "number" ? input.nowTs : Date.now();
  const validityDays = normalizeValidityDays(input.validityDays);
  const notAfterTs = nowTs + validityDays * DAY_MS;
  const signatureStatus: TrustCertificateSignatureStatus = input.preview ? "UNSIGNED_PREVIEW" : "SIGNED";

  const runSnapshot = loadLatestRunSnapshot(workspace, agentId);
  if (!input.preview && runSnapshot.blocking.length > 0) {
    // Signing the last sealed run here would roll the certificate back past a tampered or unverifiable newer run.
    throw new Error(`Unverifiable diagnostic run(s) for agent ${agentId} (${runSnapshot.blocking.join(", ")}); refusing to sign a trust certificate from older evidence.`);
  }
  if (!input.preview && runSnapshot.runId === null) {
    throw new Error(`No sealed diagnostic run verifies for agent ${agentId}; refusing to sign a trust certificate (use --preview for an unsigned preview).`);
  }
  const evidenceHashChain = readEvidenceHashChain(workspace);

  const policySigner = input.preview ? null : (() => {
    ensureSigningKeys(workspace);
    return describePolicySigner(workspace, "CERT");
  })();
  const signingKey = input.preview
    ? {
        kind: "preview" as const,
        fingerprint: PREVIEW_FINGERPRINT,
        publicKeyPem: ""
      }
    : { kind: "auditor" as const, fingerprint: policySigner!.fingerprint, publicKeyPem: policySigner!.publicKeyPem };

  const payload: TrustCertificatePayload = {
    schemaVersion: 1,
    certificateId: `tc_${randomUUID()}`,
    generatedTs: nowTs,
    agentId,
    score: runSnapshot.score0to100,
    integrityIndex: runSnapshot.integrityIndex,
    scoreSourceRunId: runSnapshot.runId,
    scoreSourceRunTs: runSnapshot.runTs,
    scoreSourceRunSha256: runSnapshot.runSha256,
    evidenceHashChain,
    signingKey,
    validity: {
      notBeforeTs: nowTs,
      notAfterTs,
      daysValid: validityDays
    }
  };

  const payloadSha256 = sha256Hex(Buffer.from(canonicalize(payload), "utf8"));
  return { workspace, policySigner, payload, payloadSha256, signatureStatus };
}

function publishTrustCertificate(input: GenerateTrustCertificateInput, prepared: ReturnType<typeof prepareTrustCertificate>, signature: string): GeneratedTrustCertificate {
  const { workspace, policySigner, payload, payloadSha256, signatureStatus } = prepared;
  const envelope: TrustCertificateEnvelope = {
    type: "amc-trust-certificate",
    signatureAlgorithm: input.preview ? "unsigned-preview" : policySigner!.algorithm,
    signatureStatus,
    payloadSha256,
    signature,
    claimBoundary: input.preview ? PREVIEW_CLAIM_BOUNDARY : undefined,
    payload
  };

  const outputPath = resolve(workspace, input.outputPath);
  const extension = extname(outputPath).toLowerCase();
  if (extension !== ".pdf" && extension !== ".json") {
    throw new Error("Trust certificate output must end with .pdf or .json");
  }

  if (extension === ".json") {
    writeFileAtomic(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, 0o644);
    return {
      outputPath,
      format: "json",
      signatureStatus,
      envelope
    };
  }

  writeFileAtomic(outputPath, renderTrustCertificatePdf(envelope), 0o644);
  const sidecarJsonPath = `${outputPath}.json`;
  writeFileAtomic(sidecarJsonPath, `${JSON.stringify(envelope, null, 2)}\n`, 0o644);
  return {
    outputPath,
    format: "pdf",
    signatureStatus,
    sidecarJsonPath,
    envelope
  };
}

export function generateTrustCertificate(input: GenerateTrustCertificateInput): GeneratedTrustCertificate {
  const prepared = prepareTrustCertificate(input);
  const signature = input.preview ? PREVIEW_SIGNATURE : signDigestWithPolicy({ workspace: prepared.workspace,
    kind: "CERT", digestHex: prepared.payloadSha256, expectedSigner: prepared.policySigner! }).signature;
  return publishTrustCertificate(input, prepared, signature);
}

/** Real CLI/API authoring path. Preparation and publication retain the exact v1 payload and output layout. */
export async function generateTrustCertificateAsync(input: GenerateTrustCertificateInput): Promise<GeneratedTrustCertificate> {
  const captured = { ...input }, prepared = prepareTrustCertificate(captured);
  const signature = captured.preview ? PREVIEW_SIGNATURE : (await signDigestWithPolicyAsync({ workspace: prepared.workspace,
    kind: "CERT", digestHex: prepared.payloadSha256, expectedSigner: prepared.policySigner! })).signature;
  return publishTrustCertificate(captured, prepared, signature);
}

/** The signing key in the payload only locates the signer; it must be admitted for artifact-seal (P0-09). */
export function verifyTrustCertificateEnvelope(
  envelope: TrustCertificateEnvelope,
  trust: TrustContext,
  path = "(trust-certificate envelope)"
): TrustCertificateVerificationResult {
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  if (envelope.type !== "amc-trust-certificate") {
    errors.push(`Unexpected certificate type: ${envelope.type}`);
  }
  const signatureStatus = envelope.signatureStatus ?? "SIGNED";
  if (signatureStatus === "UNSIGNED_PREVIEW" || envelope.signatureAlgorithm === "unsigned-preview") {
    errors.push("unsigned preview certificate is not verifier-ready evidence; regenerate without --no-sign before relying on it");
  } else if (signatureStatus !== "SIGNED") {
    errors.push(`Unsupported signature status: ${signatureStatus}`);
  }
  if (signatureStatus === "SIGNED") {
    if (!(SIGNING_ALGORITHMS as readonly string[]).includes(envelope.signatureAlgorithm)) {
      errors.push(`Unsupported signature algorithm: ${envelope.signatureAlgorithm}`);
    } else if (canonicalSigningKey(envelope.payload.signingKey.publicKeyPem)?.algorithm !== envelope.signatureAlgorithm) {
      errors.push("signature algorithm does not match signing key");
    }
  }
  const recalculatedPayloadSha256 = sha256Hex(Buffer.from(canonicalize(envelope.payload), "utf8"));
  if (recalculatedPayloadSha256 !== envelope.payloadSha256) {
    errors.push("payloadSha256 mismatch");
  }

  if (signatureStatus === "SIGNED") {
    const check = checkDigestSignature({ signature: "trust certificate signature", purpose: "artifact-seal", digestHex: envelope.payloadSha256,
      signatureB64: envelope.signature, candidates: [envelope.payload.signingKey.publicKeyPem], context: trust,
      claimedSignedAt: envelope.payload.generatedTs });
    signatures.push(check.admission);
    if (!check.verified) {
      errors.push("signature verification failed");
    }
  }

  if (envelope.payload.validity.notAfterTs <= envelope.payload.validity.notBeforeTs) {
    errors.push("Invalid validity window");
  }

  if (signatureStatus === "SIGNED") {
    const expectedFingerprint = sha256Hex(Buffer.from(envelope.payload.signingKey.publicKeyPem, "utf8"));
    if (expectedFingerprint !== envelope.payload.signingKey.fingerprint) {
      errors.push("signing key fingerprint mismatch");
    }
  } else if (envelope.payload.signingKey.fingerprint !== PREVIEW_FINGERPRINT || envelope.payload.signingKey.kind !== "preview") {
    errors.push("preview signing marker mismatch");
  }

  const report = buildVerifierReport({ artifact: { kind: "trust-certificate", path, sha256: sha256Hex(canonicalize(envelope)) },
    context: trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
  return { ok: report.trusted, errors, report };
}

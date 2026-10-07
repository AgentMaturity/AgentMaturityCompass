import { randomUUID, verify } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";
import { runTarCreate, runTarExtract } from "../release/releaseUtils.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { NotarySigner } from "./notarySigner.js";
import { notaryAttestPayloadSchema, notaryAttestResponseSchema } from "./notaryApiTypes.js";
import { amcVersion } from "../version.js";
import { buildVerifierReport, checkSignature, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";

function hashDirectory(root: string): string {
  if (!pathExists(root)) {
    return sha256Hex("missing");
  }
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  walk(root);
  files.sort((a, b) => a.localeCompare(b));
  const parts = files.map((file) => `${file.replace(`${root}/`, "")}:${sha256Hex(readFileSync(file))}`);
  return sha256Hex(parts.join("\n"));
}

function configSha(workspace: string, relPath: string): string | null {
  const path = join(workspace, relPath);
  if (!pathExists(path)) {
    return null;
  }
  return sha256Hex(readFileSync(path));
}

function buildNotaryAttestation(params: {
  signer: NotarySigner;
  workspace?: string | null;
}): z.infer<typeof notaryAttestPayloadSchema> {
  const workspace = params.workspace ? resolve(params.workspace) : null;
  const distPath = resolve(process.cwd(), "dist");
  const buildSha = hashDirectory(distPath);
  return notaryAttestPayloadSchema.parse({
    v: 1,
    attestationId: `att_${randomUUID()}`,
    ts: Date.now(),
    notary: {
      pubkeyFingerprint: params.signer.pubkeyFingerprint(),
      backend: params.signer.backendType(),
      attestationLevel: params.signer.attestationLevel(),
      claims: params.signer.claims()
    },
    runtime: {
      amcVersion,
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      buildSha256: buildSha,
      configSnapshot: {
        trustYamlSha256: workspace ? configSha(workspace, ".amc/trust.yaml") : null,
        opsPolicySha256: workspace ? configSha(workspace, ".amc/ops-policy.yaml") : null,
        approvalPolicySha256: workspace ? configSha(workspace, ".amc/approval-policy.yaml") : null,
        installedLockSha256: workspace ? configSha(workspace, ".amc/plugins/installed.lock.json") : null
      }
    }
  });
}

export function signNotaryAttestation(params: {
  signer: NotarySigner;
  workspace?: string | null;
}): z.infer<typeof notaryAttestResponseSchema> {
  const attestation = buildNotaryAttestation({
    signer: params.signer,
    workspace: params.workspace
  });
  const payloadBytes = Buffer.from(canonicalize(attestation), "utf8");
  const signed = params.signer.sign("NOTARY_ATTESTATION", payloadBytes);
  return notaryAttestResponseSchema.parse({
    v: 1,
    attestation,
    signatureB64: signed.signatureB64,
    pubkeyPem: signed.pubkeyPem,
    pubkeyFingerprint: signed.pubkeyFingerprint
  });
}

export function exportNotaryAttestationBundle(params: {
  signer: NotarySigner;
  workspace?: string | null;
  outFile: string;
}): { outFile: string } {
  const data = signNotaryAttestation({
    signer: params.signer,
    workspace: params.workspace
  });
  const rootTmp = mkdtempSync(join(tmpdir(), "amc-attest-"));
  try {
    const root = join(rootTmp, "attest");
    ensureDir(root);
    writeFileAtomic(join(root, "attest.json"), `${canonicalize(data.attestation)}\n`, 0o644);
    writeFileAtomic(join(root, "attest.sig"), `${data.signatureB64}\n`, 0o644);
    writeFileAtomic(join(root, "notary.pub"), data.pubkeyPem, 0o644);
    const outFile = resolve(params.outFile);
    ensureDir(dirname(outFile));
    runTarCreate(rootTmp, outFile);
    return { outFile };
  } finally {
    rmSync(rootTmp, { recursive: true, force: true });
  }
}

/** notary.pub and --pubkey only locate the signer; admitKey decides whether it is pinned for notary (P0-51). */
export function verifyNotaryAttestationBundle(file: string, trust: TrustContext, pubkeyPem?: string | null): {
  ok: boolean;
  errors: string[];
  report: VerifierReportV1;
} {
  const rootTmp = mkdtempSync(join(tmpdir(), "amc-attest-verify-"));
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "notary-attestation", path: resolve(file), sha256: fileSha256(resolve(file)) },
      context: trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, report };
  };
  try {
    runTarExtract(resolve(file), rootTmp);
    const dirCandidates = readdirSync(rootTmp, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const root = dirCandidates.length > 0 ? join(rootTmp, dirCandidates[0]!.name) : rootTmp;
    const jsonPath = join(root, "attest.json");
    const sigPath = join(root, "attest.sig");
    const pubPath = join(root, "notary.pub");
    if (!pathExists(jsonPath) || !pathExists(sigPath) || !pathExists(pubPath)) {
      errors.push("bundle missing attest.json/attest.sig/notary.pub");
      return finish();
    }
    try {
      const payload = notaryAttestPayloadSchema.parse(JSON.parse(readUtf8(jsonPath)) as unknown);
      const sig = readUtf8(sigPath).trim();
      const pub = readUtf8(pubPath);
      const check = checkSignature({ signature: "attest.sig", purpose: "notary", context: trust, claimedSignedAt: payload.ts,
        candidates: [pubkeyPem, pub], verify: (pem) => verify(null, Buffer.from(canonicalize(payload), "utf8"), pem, Buffer.from(sig, "base64")) });
      signatures.push(check.admission);
      if (!check.verified) {
        errors.push("attestation signature invalid");
      }
      const fpr = sha256Hex(Buffer.from(pub, "utf8"));
      if (fpr !== payload.notary.pubkeyFingerprint) {
        errors.push("attestation fingerprint mismatch");
      }
    } catch (error) {
      errors.push(String(error));
    }
    return finish();
  } finally {
    rmSync(rootTmp, { recursive: true, force: true });
  }
}

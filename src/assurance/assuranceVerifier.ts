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
import { verifyHexDigest } from "../crypto/keys.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { verifyBenchProofBundle, type BenchInclusionProof } from "../bench/benchProofs.js";

function cleanup(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outDir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to extract assurance certificate: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
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
}

export function verifyAssuranceCertificateFile(params: {
  file: string;
  publicKeyPath?: string;
}): AssuranceCertVerifyResult {
  const file = resolve(params.file);
  const fileSha256 = sha256Hex(readFileSync(file));
  const errors: string[] = [];
  const tmp = mkdtempSync(join(tmpdir(), "amc-assurance-cert-verify-"));
  let cert: z.infer<typeof assuranceCertSchema> | null = null;
  try {
    tarExtract(file, tmp);
    const root = resolveRoot(tmp);
    const certPath = join(root, "cert.json");
    const sigPath = join(root, "cert.sig");
    if (!pathExists(certPath)) {
      errors.push("cert.json missing");
      return { ok: false, fileSha256, cert, errors };
    }
    if (!pathExists(sigPath)) {
      errors.push("cert.sig missing");
      return { ok: false, fileSha256, cert, errors };
    }

    cert = assuranceCertSchema.parse(JSON.parse(readUtf8(certPath)) as unknown);
    const sig = orgSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(Buffer.from(canonicalize(cert), "utf8"));
    if (digest !== sig.digestSha256) {
      errors.push("cert digest mismatch");
    }

    const pubPem = params.publicKeyPath
      ? readUtf8(resolve(params.publicKeyPath))
      : pathExists(join(root, "signer.pub"))
        ? readUtf8(join(root, "signer.pub"))
        : "";
    if (!pubPem) {
      errors.push("missing signer public key for cert signature verification");
    }
    let sigOk = false;
    if (sig.envelope) {
      sigOk =
        sig.signature === sig.envelope.sigB64 &&
        verifySignatureEnvelope(digest, sig.envelope, {
          trustedPublicKeys: pubPem ? [pubPem] : [],
          requireTrustedKey: true
        });
    } else {
      if (pubPem) {
        sigOk = verifyHexDigest(digest, sig.signature, pubPem);
      }
    }
    if (!sigOk) {
      errors.push("certificate signature verification failed");
    }

    const proofs = parseInclusionProofs(root);
    const proofVerify = verifyBenchProofBundle({
      transparencyRoot: null,
      merkleRoot: null,
      proofs
    });
    if (!proofVerify.ok) {
      errors.push(...proofVerify.errors.map((row) => `proof invalid: ${row}`));
    }
    if (cert.proofBindings.includedEventProofIds.length !== proofs.length) {
      errors.push("proof count mismatch");
    }

    return {
      ok: errors.length === 0,
      fileSha256,
      cert,
      errors
    };
  } catch (error) {
    errors.push(String(error));
    return {
      ok: false,
      fileSha256,
      cert,
      errors
    };
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
        file: latestCertPath
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

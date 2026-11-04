import { signatureEnvelopeSchema, verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { readFileSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { maturityBomSchema, type MaturityBom } from "./bomSchema.js";
import { appendTransparencyEntry, appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath } from "../trust/trustConfig.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { captureOrgFiles, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { highWaterPath } from "../keys/highWater.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";

import { assertOwnerMode } from "../mode/mode.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, untrustedReasons, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";

const bomSignatureSchema = z.object({
  v: z.literal(1),
  bomSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

export type BomSignature = z.infer<typeof bomSignatureSchema>;

function loadBom(file: string): MaturityBom {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return maturityBomSchema.parse(parsed);
}

export function signBomFile(params: {
  workspace: string;
  inputFile: string;
  outputSigFile?: string;
}): { sigFile: string; signature: BomSignature } {
  const inputFile = resolve(params.workspace, params.inputFile);
  if (!pathExists(inputFile)) {
    throw new Error(`BOM file not found: ${inputFile}`);
  }
  const bytes = readFileSync(inputFile);
  const digest = sha256Hex(bytes);
  const signed = signDigestWithPolicy({
    workspace: params.workspace,
    kind: "BOM",
    digestHex: digest
  });
  const signature = bomSignatureSchema.parse({
    v: 1,
    bomSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  const sigFile = resolve(params.workspace, params.outputSigFile ?? `${inputFile}.sig`);
  ensureDir(dirname(sigFile));
  writeFileAtomic(sigFile, JSON.stringify(signature, null, 2), 0o644);
  const bom = loadBom(inputFile);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "BOM_SIGNED",
    agentId: bom.agentId,
    artifact: {
      kind: "bom",
      sha256: signature.bomSha256,
      id: bom.runId
    }
  });
  return {
    sigFile,
    signature
  };
}

class BomTransparencyPublicationError extends Error {
  readonly code = "BOM_TRANSPARENCY_PUBLICATION_INCOMPLETE";
  constructor(readonly sigFile: string, cause: unknown, readonly transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null = null) {
    super("BOM signature is published; transparency publication is incomplete", { cause });
    this.name = "BomTransparencyPublicationError";
  }
}

class BomSignaturePublicationError extends Error {
  readonly code = "BOM_SIGNATURE_PUBLICATION_INCOMPLETE";
  constructor(readonly sigFile: string, readonly writeReturned: boolean, cause: unknown) {
    super(writeReturned ? "BOM signature write returned; exact acknowledgment failed" : "BOM signature writer threw; inspect the uncertain destination", { cause }); this.name = "BomSignaturePublicationError";
  }
}
/** Finite used-input/authority/log aliases only; no host output authorization policy. */
function BomProtectionPaths(workspace: string, inputs: readonly string[]): string[] {
  const keyset = assertKeysetComplete(workspace);
  return [...new Set([...inputs, ...Object.keys(keyset?.files ?? {}).map(path => join(workspace, ".amc", path)),
    trustConfigPath(workspace), trustConfigSigPath(workspace), highWaterPath(),
    ...["amc.config.yaml", "amc.config.yaml.sig", "mode.json", "vault.amcvault", "vault.amcvault.meta.json",
      "keys/keyset.json", "keys/keyset.pending.json", "keys/revocations.signed.json", "keys/artifact-seal.pub", "keys/artifact-seal_history.json", "keys/auditor_ed25519.pub", "keys/auditor_history.json",
      "transparency/log.jsonl", "transparency/log.seal.json", "transparency/log.seal.sig", "transparency/.workspace-transparency.lock", "transparency/.workspace-transparency-locks",
      "transparency/merkle/current.root.json", "transparency/merkle/current.root.sig", "transparency/merkle/leaves.jsonl", "transparency/merkle/roots.jsonl",
      "transparency/merkle/frontier.json", "transparency/merkle/pending.json", "transparency/merkle/migration.json", "transparency/merkle/migration.sig"].map(path => join(workspace, ".amc", path))])];
}
function assertBomOutputSafe(output: string, physical: string, protectedPaths: readonly string[]): void {
  if (physicalPathWithMissingSuffix(output) !== physical) throw new Error("Bom output physical selection changed while preparing");
  const target = captureOrgFiles([output]).members[0]!;
  for (const source of protectedPaths) {
    if (physicalPathWithMissingSuffix(source) === physical) throw new Error("Bom output aliases a used input, authority or later log destination");
    if (target.identity !== null) {
      try { const stat = lstatSync(source); if (`${stat.dev}:${stat.ino}` === target.identity) throw new Error("Bom output hardlinks a used input, authority or later log destination"); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
    }
  }
}

/** Maintained awaitable owner path. The existing synchronous SDK operation above is unchanged. */
export async function signBomFileAsync(params: Parameters<typeof signBomFile>[0], options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof signBomFile>> {
  const workspace = params.workspace, inputFile = resolve(workspace, params.inputFile);
  const sigFile = resolve(workspace, params.outputSigFile ?? `${inputFile}.sig`), beforePublish = options.beforePublish;
  const actor = () => { beforePublish?.(); assertOwnerMode(workspace, "bom sign"); };
  actor();
  const locked = <T>(operation: () => T): T => withControlFileLock({ root: dirname(sigFile), name: "bom-signature", operation });
  const input = captureOrgFiles([inputFile]), bytes = input.members[0]!.bytes;
  if (bytes === null) throw new Error("BOM file not found");
  const bom = maturityBomSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown), digest = sha256Hex(bytes);
  let expectedOutput = captureOrgFiles([sigFile]);
  const physical = physicalPathWithMissingSuffix(sigFile);
  const descriptor = describePolicySigner(workspace, "BOM"), policy = JSON.stringify(loadTrustConfig(workspace));
  const purposeCurrent = descriptor.mode === "VAULT" ? captureRunHashAuthority(workspace, false) : () => {};
  const logAuthority = captureWorkspaceLogAuthority(workspace, actor);
  const protectedPaths = BomProtectionPaths(workspace, [inputFile, join(dirname(sigFile), ".bom-signature.lock"), join(dirname(sigFile), ".bom-signature-locks")]);
  const assertCurrent = () => {
    actor(); assertPolicySignerCurrent(workspace, descriptor); purposeCurrent(); logAuthority.assertCurrent();
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("BOM signing policy changed while signing was prepared");
    assertOrgPairsCurrent(input); assertBomOutputSafe(sigFile, physical, protectedPaths); assertOrgPairsCurrent(expectedOutput);
  };
  assertCurrent();
  const signed = await signDigestWithPolicyAsync({ workspace, kind: "BOM", digestHex: digest, expectedSigner: descriptor, beforeSign: assertCurrent });
  assertCurrent();
  const signature = bomSignatureSchema.parse({ v: 1, bomSha256: digest, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope });
  const sidecarBytes = Buffer.from(JSON.stringify(signature, null, 2));
  const assertSignedCurrent = () => {
    assertCurrent();
    const envelope = signature.envelope;
    if (envelope === undefined || envelope.signer.type !== descriptor.mode || envelope.alg !== descriptor.algorithm || envelope.sigB64 !== signature.signature
      || !verifySignatureEnvelope(digest, envelope, { trustedPublicKeys: [descriptor.publicKeyPem], requireTrustedKey: true })) throw new Error("BOM prepared signature no longer matches its original actual signer");
    assertOrgPairsCurrent(expectedOutput);
  };
  locked(() => {
    assertSignedCurrent(); let writeReturned = false;
    try {
      writeFileAtomic(sigFile, sidecarBytes, 0o644); writeReturned = true;
      const acknowledged = captureOrgFiles([sigFile]), row = acknowledged.members[0]!;
      if (row.bytes === null || !row.bytes.equals(sidecarBytes) || row.mode !== 0o644) throw new Error("BOM signature differs from its exact prepared bytes or mode");
      expectedOutput = acknowledged;
    } catch (cause) { throw new BomSignaturePublicationError(sigFile, writeReturned, cause); }
  });
  // The exact acknowledged sidecar remains committed if the later log phase refuses or fails.
  let transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null = null;
  try {
    transparency = await appendTransparencyEntryAsync({ workspace, type: "BOM_SIGNED", agentId: bom.agentId,
      artifact: { kind: "bom", sha256: signature.bomSha256, id: bom.runId } }, { beforeCommit: () => locked(assertSignedCurrent) });
    assertSignedCurrent();
  } catch (cause) { throw new BomTransparencyPublicationError(sigFile, cause, transparency); }
  return { sigFile, signature };
}

/**
 * --pubkey, the current workspace's auditor key history and the key the envelope carries only locate the signer;
 * admitKey decides whether it is pinned for artifact-seal (P0-51). A workspace or embedded key never vouches by being there.
 */
export function verifyBomSignature(params: {
  workspace: string;
  inputFile: string;
  sigFile: string;
  pubkeyPemFile?: string;
  trust: TrustContext;
}): { ok: boolean; reason?: string; bom: MaturityBom | null; signature: BomSignature | null; report: VerifierReportV1 } {
  const inputFile = resolve(params.workspace, params.inputFile);
  const sigFile = resolve(params.workspace, params.sigFile);
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let bom: MaturityBom | null = null;
  let signature: BomSignature | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "maturity-bom", path: inputFile, sha256: fileSha256(inputFile) },
      context: params.trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, reason: report.trusted ? undefined : untrustedReasons(report).join("; "), bom, signature, report };
  };
  if (!pathExists(inputFile)) {
    errors.push("bom file missing");
    return finish();
  }
  if (!pathExists(sigFile)) {
    errors.push("bom signature file missing");
    return finish();
  }
  try {
    bom = loadBom(inputFile);
    signature = bomSignatureSchema.parse(JSON.parse(readFileSync(sigFile, "utf8")) as unknown);
    const digest = sha256Hex(readFileSync(inputFile));
    if (digest !== signature.bomSha256) {
      errors.push("bom digest mismatch");
      return finish();
    }
    const workspaceKeys = pathExists(join(params.workspace, ".amc", "keys", "auditor_ed25519.pub")) ? getPublicKeyHistory(params.workspace, "auditor") : [];
    const check = checkDigestSignature({ signature: "bom.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: signature.signature, envelope: signature.envelope,
      candidates: [params.pubkeyPemFile ? readFileSync(resolve(params.workspace, params.pubkeyPemFile), "utf8") : null,
        ...workspaceKeys, envelopePublicKey(signature.envelope)],
      context: params.trust, claimedSignedAt: signature.signedTs });
    signatures.push(check.admission);
    if (!check.verified || (signature.envelope !== undefined && signature.signature !== signature.envelope.sigB64)) {
      errors.push("signature verification failed");
    }
  } catch (error) {
    errors.push(String(error));
  }
  return finish();
}

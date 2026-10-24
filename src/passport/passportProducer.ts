import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { benchProofFileBytes } from "../bench/benchProofs.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes, captureOrgPairsAuthority } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { loadPromptPolicyAttemptAsync, promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { cleanupDir } from "../utils/archiveFiles.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { defaultPassportExportPath, passportArchiveMemberBytes, tarCreateDeterministic, type PassportCreateResult } from "./passportArtifact.js";
import { capturePassportCollection } from "./passportInputs.js";
import { passportPolicySchema } from "./passportPolicySchema.js";
import { buildPassportProofs } from "./passportProofs.js";
import { scanPassportForPii } from "./passportRedaction.js";
import { passportJsonSchema, passportPiiScanSchema } from "./passportSchema.js";
import { preparePassportJsonSignatureAsync } from "./passportSigner.js";
import { passportLatestCachePath, passportPolicyPath, preparePassportCacheAsync } from "./passportStore.js";
import { capturePassportDirectories, capturePassportFiles, passportRequiredDirectories, passportPublicationFailure, type PassportPublicationOptions } from "./passportPublication.js";

/** Actual ordinary artifact constructor; approval-gated sharing/export consumers stay on their existing held path. */
function captureArtifactCreation(input: {
  workspace: string; scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId?: string; outFile: string;
}, options: PassportPublicationOptions, sharePdf?: { agentId: string; outFile?: string }) {
  const params = structuredClone(input), caller = { ...options }, workspace = params.workspace;
  caller.beforePublish?.(); caller.assertInputsCurrent?.();
  const original = captureOrgPairsAuthority(workspace), logAuthority = captureWorkspaceLogAuthority(workspace);
  const policyPath = passportPolicyPath(workspace), policyPair = captureOrgPairs([policyPath]);
  const policyBytes = orgPairBytes(policyPair, policyPath), policySignature = orgPairBytes(policyPair, `${policyPath}.sig`);
  if (policyBytes === null || policySignature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", policyBytes, policySignature).valid)
    throw new Error("passport policy signature invalid: missing or untrusted pair");
  const policy = passportPolicySchema.parse(YAML.parse(policyBytes.toString("utf8")));
  const scopeId = params.scopeType === "WORKSPACE" ? "workspace" : (params.scopeId?.trim() || "default"), outFile = resolve(workspace, params.outFile);
  const cachePath = passportLatestCachePath(workspace, params.scopeType, scopeId), destinations = [outFile, `${outFile}.sha256`, cachePath, `${cachePath}.sig`];
  const files = capturePassportFiles(workspace, [outFile, `${outFile}.sha256`]), cacheBefore = captureOrgPairs([cachePath]);
  const directories = capturePassportDirectories([...passportRequiredDirectories(workspace), dirname(outFile)]);
  const collection = capturePassportCollection({ workspace, scopeType: params.scopeType, scopeId, policy }, Date.now());
  const promptBefore = captureOrgPairs([promptPolicyPath(workspace)]), promptWasMissing = orgPairBytes(promptBefore, promptPolicyPath(workspace)) === null;
  const proofRecipe = benchProofFileBytes(buildPassportProofs({ workspace, includeEventKinds: collection.local.includedEventKinds }));
  collection.assertCurrent(); collection.assertProofCurrent(); if (sharePdf === undefined) collection.assertNoOutputAliases(destinations);
  const passport = passportJsonSchema.parse({ ...collection.local.passport, proofBindings: {
    ...collection.local.passport.proofBindings, calculationManifestSha256: sha256Hex(canonicalize(collection.local.calculationManifest)),
    transparencyRootSha256: proofRecipe.transparencyRootSha256, merkleRootSha256: proofRecipe.merkleRootSha256, includedEventProofIds: proofRecipe.proofIds
  } });
  const pdfPath = sharePdf === undefined ? null : resolve(workspace, sharePdf.outFile ?? join(".amc", "passport", "share", sharePdf.agentId, `${passport.passportId}.pdf`));
  const pdfBefore = pdfPath === null ? null : captureOrgFiles([pdfPath]);
  if (pdfPath !== null) { destinations.push(pdfPath); collection.assertNoOutputAliases(destinations); }
  const piiScan = passportPiiScanSchema.parse(scanPassportForPii(passport));
  if (piiScan.status !== "PASS") throw new Error("passport pii scan failed after proof binding");
  let promptCurrent: (() => void) | null = null, signatureCurrent: (() => void) | null = null, proofSelected = true;
  const base = () => {
    caller.beforePublish?.(); caller.assertInputsCurrent?.();
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", policyBytes, policySignature).valid) throw new Error("passport policy signature invalid: missing or untrusted pair");
    original(); logAuthority.assertCurrent();
    assertOrgPairsCurrent(policyPair);
    collection.assertCurrent(); if (proofSelected) collection.assertProofCurrent(); collection.assertNoOutputAliases(destinations);
    files.assertCurrent(); directories.assertCurrent();
  };
  const stable = () => { base(); promptCurrent?.(); signatureCurrent?.(); collection.assertCurrent(); files.assertCurrent(); directories.assertCurrent(); };
  let used = false;
  return Object.freeze({ pdfPath, assertCurrent() { stable(); if (pdfBefore !== null) assertOrgPairsCurrent(pdfBefore); }, async create() {
    if (used) throw new Error("passport creation attempt was already consumed"); used = true;
    if (pdfBefore !== null) assertOrgPairsCurrent(pdfBefore);
    stable();
    const knownPaths: string[] = []; let phase = "preparation", createdHash: string | null = null, exportedHash: string | null = null;
    try {
      // Preserve the genuine default initializer, not a substitute policy or a fresh winner after an earlier wait.
      if (promptWasMissing) {
        phase = "prompt-initialization";
        const prompt = await loadPromptPolicyAttemptAsync(workspace, { beforePublish: base }, promptBefore);
        knownPaths.push(promptPolicyPath(workspace), `${promptPolicyPath(workspace)}.sig`); promptCurrent = prompt.assertCurrent;
      } else promptCurrent = () => assertOrgPairsCurrent(promptBefore);
      stable();
      phase = "preparation";
      const signed = await preparePassportJsonSignatureAsync(workspace, passport, stable);
      signatureCurrent = signed.assertCurrent;
      const cache = await preparePassportCacheAsync({ workspace, scopeType: params.scopeType, scopeId, passport }, { beforePublish: stable }, cacheBefore);
      const beforeMember = () => { cache.assertCurrent(); collection.assertCurrent(); files.assertCurrent(); directories.assertCurrent(); };
      beforeMember(); assertOrgPairsCurrent(cacheBefore);
      const signerPub = signed.signature.envelope ? Buffer.from(signed.signature.envelope.pubkeyB64, "base64").toString("utf8") : "";
      if (!signerPub) throw new Error("prepared passport signature has no actual signer public key");
      const archiveBytes = privatePassportArchiveBytes([...proofRecipe.files,
        ...passportArchiveMemberBytes({ passport, signature: signed.signature, piiScan, signerPub, collected: collection.local })]);
      beforeMember(); assertOrgPairsCurrent(cacheBefore);
      const sha256 = sha256Hex(archiveBytes);
      phase = "directories"; directories.create(() => { beforeMember(); assertOrgPairsCurrent(cacheBefore); });
      phase = "artifact-members";
      files.publish([{ path: outFile, bytes: archiveBytes }, { path: `${outFile}.sha256`, bytes: Buffer.from(`${sha256}\n`) }], () => { beforeMember(); assertOrgPairsCurrent(cacheBefore); });
      knownPaths.push(...files.published);
      phase = "cache-pair"; const saved = cache.publish()[0]!; knownPaths.push(saved.path, saved.sigPath);
      const finalOutputs = () => { beforeMember(); };
      finalOutputs();
      const artifact = { kind: "amcpass" as const, sha256, id: passport.passportId }, agentId = params.scopeType === "AGENT" ? scopeId : "workspace";
      // Old proof/predecessor CAS belongs only to preparation, never to this append's own member progression.
      proofSelected = false;
      phase = "created-log";
      const created = await appendTransparencyEntryAttemptAsync({ workspace, type: "PASSPORT_CREATED", agentId, artifact }, {
        beforeCommit() { finalOutputs(); collection.assertProofCurrent(); }, beforeMember: finalOutputs
      });
      createdHash = created.entry.hash;
      phase = "exported-log";
      const exported = await appendTransparencyEntryAttemptAsync({ workspace, type: "PASSPORT_EXPORTED", agentId, artifact }, {
        beforeCommit() { finalOutputs(); created.assertCurrent(); }, beforeMember: finalOutputs
      });
      exportedHash = exported.entry.hash; finalOutputs(); exported.assertCurrent();
      const result: PassportCreateResult = { outFile, sha256, passport, signature: signed.signature, piiScan, cachePath: saved.path, cacheSigPath: saved.sigPath,
        transparencyCreatedHash: createdHash, transparencyExportedHash: exportedHash };
      return Object.freeze({ result, assertCurrent() { finalOutputs(); exported.assertCurrent(); },
        publishedPaths: Object.freeze([...knownPaths]), createdDirectories: Object.freeze([...directories.created]) });
    } catch (cause) {
      if (cause instanceof TransparencyMerkleLagError) { if (phase === "created-log") createdHash = cause.entryHash; if (phase === "exported-log") exportedHash = cause.entryHash; }
      if (knownPaths.length === 0 && directories.created.length === 0 && files.published.length === 0 && phase === "preparation") throw cause;
      throw passportPublicationFailure(workspace, phase, [...knownPaths, ...files.published], directories.created, null, cause, createdHash, exportedHash,
        phase === "prompt-initialization");
    }
  } });
}
/** Genuine fixed ordinary capture; no parsed collection or supplied signer can replace its closed state. */
export function capturePassportArtifactCreation(input: Parameters<typeof captureArtifactCreation>[0], options: PassportPublicationOptions = {}) {
  return captureArtifactCreation(input, options);
}
/** Fixed AGENT share-PDF capture; the real private passport ID selects its one additional presentation output. */
export function capturePassportSharePdfCreation(workspace: string, agentId: string, outFile: string | undefined, options: PassportPublicationOptions = {}) {
  const scopeId = agentId.trim() || "default", archive = defaultPassportExportPath({ workspace, scopeType: "AGENT", scopeId });
  return captureArtifactCreation({ workspace, scopeType: "AGENT", scopeId, outFile: resolve(workspace, archive) }, options, { agentId, outFile });
}
export async function createPassportArtifactAttemptAsync(input: Parameters<typeof captureArtifactCreation>[0], options: PassportPublicationOptions = {}) {
  return capturePassportArtifactCreation(input, options).create();
}

export async function createPassportArtifactAsync(input: Parameters<typeof createPassportArtifactAttemptAsync>[0], options: PassportPublicationOptions = {}): Promise<PassportCreateResult> {
  return (await createPassportArtifactAttemptAsync(input, options)).result;
}

/** Private staging never replaces a workspace target; primary and cleanup failures are retained separately. */
function privatePassportArchiveBytes(members: readonly { path: string; bytes: Buffer }[]): Buffer {
  const privateDirs: string[] = []; let bytes: Buffer | null = null, failed = false, primary: unknown;
  try {
    const source = mkdtempSync(join(tmpdir(), "amc-passport-artifact-")); privateDirs.push(source);
    const archive = mkdtempSync(join(tmpdir(), "amc-passport-prepared-")); privateDirs.push(archive);
    const root = join(source, "amc-passport");
    for (const dir of [root, join(root, "proofs"), join(root, "proofs", "inclusion"), join(root, "checks"), join(root, "meta")]) ensureDir(dir);
    for (const row of members) writeFileAtomic(join(root, row.path), row.bytes, 0o644);
    // Archive stays outside the source tree so collectFiles cannot include its own output.
    const file = join(archive, "prepared.amcpass"); tarCreateDeterministic(source, file); bytes = readFileSync(file);
  } catch (cause) { failed = true; primary = cause; }
  const cleanupErrors: { path: string; cause: unknown }[] = [];
  for (const dir of [...privateDirs].reverse()) try { cleanupDir(dir); } catch (cause) { cleanupErrors.push({ path: dir, cause }); }
  if (cleanupErrors.length > 0) throw Object.assign(new Error("private passport archive staging cleanup is incomplete", { cause: failed ? primary : cleanupErrors[0]!.cause }),
    { code: "PASSPORT_ARCHIVE_PREPARATION", privateDirectories: Object.freeze([...privateDirs]), cleanupErrors: Object.freeze(cleanupErrors.map(row => Object.freeze(row))), preparationFailed: failed });
  if (failed) throw primary;
  if (bytes === null) throw new Error("private passport archive preparation produced no bytes");
  return bytes;
}

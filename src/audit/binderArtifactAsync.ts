import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cleanupDir } from "../utils/archiveFiles.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { captureOrgFiles, captureOrgPairsAuthority, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { captureWorkspaceLogAuthority, appendTransparencyEntryAttemptAsync } from "../transparency/asyncWorkspaceAppend.js";
import { benchProofFileBytes } from "../bench/benchProofs.js";
import { captureAuditBinderPolicies, prepareAuditBinderCollection } from "./binderCollectionPlan.js";
import { binderCachePath, prepareBinderCacheAsync } from "./binderStore.js";
import { prepareBinderSignatureAsync } from "./binderSigner.js";
import { scanBinderForPii } from "./binderRedaction.js";
import { publishAuditFiles, AuditBinderPublicationError, type AuditPublicationOptions } from "./binderPublication.js";
import { writeAuditBinderStaging, createStagedAuditTar } from "./binderArtifactMembers.js";
import type { AuditBinderCreateResult } from "./binderArtifact.js";
import type { EvidenceRequest } from "./evidenceRequestSchema.js";
import type { TrustContext } from "../trust/trustContext.js";
import { inCheckPass } from "../utils/checkPass.js";

export interface AuditBinderArtifactAttempt {
  readonly result: AuditBinderCreateResult;
  /** Genuine original intrinsic authority + exact owned artifact/cache identities; no old collection/request/log callback. */
  assertArtifactCurrent(): void;
  /** Last genuine own log state; preparation-only when a successor append will change it. */
  assertLogCurrent(): void;
}
function signingEnabled() { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); }
async function createAuditBinderArtifactOwned(input: { workspace: string; scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId?: string;
  outFile: string; nowTs?: number; request?: EvidenceRequest | null; trust?: TrustContext }, options: AuditPublicationOptions = {}): Promise<AuditBinderArtifactAttempt> {
  options = { ...options }; signingEnabled();
  const params = structuredClone(input), workspace = resolve(params.workspace), scopeType = params.scopeType;
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : (params.scopeId?.trim() || "default"), cacheId = scopeId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const actor = options.beforePublish; actor?.(); signingEnabled();
  const originalBundle = captureOrgPairsAuthority(workspace), originalLog = captureWorkspaceLogAuthority(workspace);
  const policies = captureAuditBinderPolicies(workspace, true), original = inCheckPass(() => { originalBundle(); originalLog.assertCurrent(); policies.assertCurrent(); });
  const outFile = resolve(workspace, params.outFile), cachePath = binderCachePath(workspace, scopeType, cacheId);
  if (new Set([outFile, `${outFile}.sha256`, cachePath, `${cachePath}.sig`]).size !== 4) throw new Error("audit archive and cache destinations must differ");
  const targets = captureOrgFiles([outFile, `${outFile}.sha256`, cachePath, `${cachePath}.sig`]);
  const archiveMode = targets.members.find(row => row.path === outFile)!.mode ?? (0o666 & ~process.umask());
  const collection = prepareAuditBinderCollection({ workspace, scope: { type: scopeType, id: scopeId }, policy: policies.policy, map: policies.map,
    nowTs: params.nowTs, request: params.request ?? null, trust: params.trust }, original, true);
  const destinations = Object.freeze(targets.members.map(row => row.path)), aliases = captureAuditOutputAliases(destinations, [...policies.inputPaths, ...collection.inputPaths]);
  const stableActor = inCheckPass(() => { signingEnabled(); actor?.(); signingEnabled(); options.assertInputsCurrent?.(); signingEnabled(); options.assertOutputsSafe?.(destinations); signingEnabled(); aliases(); });
  const publicationInputs = inCheckPass(() => { stableActor(); original(); collection.assertCurrent(); });
  const inputs = inCheckPass(() => { signingEnabled(); options.assertPreparationInputsCurrent?.(); signingEnabled(); publicationInputs(); assertOrgPairsCurrent(targets); });
  inputs();
  let phase = "collection", published: readonly string[] = [], result: AuditBinderCreateResult | undefined;
  const logs: string[] = []; let tmp: string | undefined, failed = false, failure: unknown;
  let artifactCurrent: (() => void) | undefined, logCurrent: (() => void) | undefined;
  try {
    const collected = await collection.collect(), proofs = collection.proofs!;
    const proofFiles = benchProofFileBytes(proofs), binder = { ...collected.binder, proofBindings: { ...collected.binder.proofBindings,
      transparencyRootSha256: proofFiles.transparencyRootSha256, merkleRootSha256: proofFiles.merkleRootSha256,
      includedEventProofIds: proofFiles.proofIds, calculationManifestSha256: sha256Hex(canonicalize(collected.calculationManifest)) } };
    const piiScan = scanBinderForPii(binder);
    if (piiScan.status !== "PASS") {
      phase = "pii-refusal-log";
      const refused = await appendTransparencyEntryAttemptAsync({ workspace, type: "AUDIT_BINDER_VERIFICATION_FAILED", agentId: scopeType === "AGENT" ? scopeId : "workspace",
        artifact: { kind: "policy", sha256: sha256Hex(canonicalize(piiScan)), id: binder.binderId } }, { beforeCommit: inputs, beforeMember() { stableActor(); original(); assertOrgPairsCurrent(targets); } });
      logs.push(refused.entry.hash); const top = piiScan.findings.filter(row => row.severity === "HIGH").slice(0, 8);
      throw new Error(`audit binder pii scan failed: ${top.map(row => `${row.type}:${row.path}`).join(", ")}`);
    }
    phase = "binder-signature";
    const signed = await prepareBinderSignatureAsync(workspace, binder, inputs);
    const beforeCache = inCheckPass(() => { inputs(); signed.assertCurrent(); });
    phase = "cache-signature";
    const cache = await prepareBinderCacheAsync({ workspace, scopeType, scopeId: cacheId, binder }, { beforePublish: original, assertInputsCurrent: beforeCache }, targets);
    const beforeFiles = inCheckPass(() => { publicationInputs(); signed.assertCurrent(); cache.assertCurrent(); });
    phase = "private-staging"; tmp = mkdtempSync(join(tmpdir(), "amc-audit-binder-"));
    writeAuditBinderStaging({ root: join(tmp, "members", "amc-audit"), binder, signature: signed.signature, publicKeyPem: signed.publicKeyPem,
      piiScan, policy: policies.policy, map: policies.map, scopeId, collected, proofs });
    const stagedArchive = join(tmp, "archive.amcaudit");
    createStagedAuditTar(join(tmp, "members"), stagedArchive);
    const bytes = readFileSync(stagedArchive), sha256 = sha256Hex(bytes);
    const writes = [{ path: outFile, bytes, mode: archiveMode }, { path: `${outFile}.sha256`, bytes: Buffer.from(`${sha256}\n`) }, ...cache.writes];
    phase = "files"; const files = publishAuditFiles(workspace, writes, targets, beforeFiles, inputs); published = files.publishedPaths;
    const assertPublished = files.assertCurrent;
    // The report is now an immutable observation. Later valid evidence/log progress is not a reason to rebase it.
    const intrinsicArtifact = inCheckPass(() => { signingEnabled(); aliases(); original(); signed.assertCurrent(); cache.assertCurrent(); assertPublished(); });
    const continuePublication = inCheckPass(() => { stableActor(); intrinsicArtifact(); });
    phase = "created-log";
    const created = await appendTransparencyEntryAttemptAsync({ workspace, type: "AUDIT_BINDER_CREATED", agentId: scopeType === "AGENT" ? scopeId : "workspace",
      artifact: { kind: "policy", sha256: signed.signature.digestSha256, id: binder.binderId } }, { beforeCommit: continuePublication, beforeMember: continuePublication }); logs.push(created.entry.hash);
    phase = "exported-log";
    const exported = await appendTransparencyEntryAttemptAsync({ workspace, type: "AUDIT_BINDER_EXPORTED", agentId: scopeType === "AGENT" ? scopeId : "workspace",
      artifact: { kind: "amcaudit", sha256, id: binder.binderId } }, { beforeCommit() { continuePublication(); created.assertCurrent(); }, beforeMember: continuePublication }); logs.push(exported.entry.hash);
    continuePublication(); exported.assertCurrent();
    artifactCurrent = intrinsicArtifact; logCurrent = () => { intrinsicArtifact(); exported.assertCurrent(); };
    result = { outFile, sha256, binder, signature: signed.signature, piiScan, transparencyCreatedHash: created.entry.hash,
      transparencyExportedHash: exported.entry.hash, cachePath, cacheSigPath: `${cachePath}.sig` };
  } catch (cause) { failed = true; failure = cause; if (cause instanceof AuditBinderPublicationError) published = cause.publishedPaths; }
  if (tmp !== undefined) try { cleanupDir(tmp); } catch (cause) { failed = true; failure = failure === undefined ? cause : new AggregateError([failure, cause], "audit publication and private cleanup failed"); phase = "private-cleanup"; }
  if (!failed) try { signingEnabled(); actor?.(); signingEnabled(); options.assertInputsCurrent?.(); signingEnabled(); options.assertOutputsSafe?.(destinations); signingEnabled(); artifactCurrent!(); logCurrent!(); }
  catch (cause) { failed = true; failure = cause; phase = "post-cleanup-continuation"; }
  if (failed && published.length === 0 && logs.length === 0 && (failure instanceof KeyProviderError || failure instanceof KeyRevokedError)) throw failure;
  if (failed) throw new AuditBinderPublicationError(phase, published, Object.freeze([...logs]), failure, failure instanceof AuditBinderPublicationError ? failure.attemptedPath : null);
  return Object.freeze({ get result() { return structuredClone(result!); }, assertArtifactCurrent: artifactCurrent!, assertLogCurrent: logCurrent! });
}

export async function createAuditBinderArtifactAttempt(input: Parameters<typeof createAuditBinderArtifactOwned>[0], options: AuditPublicationOptions = {}): Promise<AuditBinderArtifactAttempt> {
  try { return await createAuditBinderArtifactOwned(input, options); }
  catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("prepare", [], [], cause); }
}

/** Compatibility DTO: the real attempt path retains all native/error ordering and returns the existing observation. */
export async function createAuditBinderArtifact(input: Parameters<typeof createAuditBinderArtifactOwned>[0], options: AuditPublicationOptions = {}): Promise<AuditBinderCreateResult> {
  return (await createAuditBinderArtifactAttempt(input, options)).result;
}

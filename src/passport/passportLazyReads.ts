import { join, resolve } from "node:path";
import YAML from "yaml";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, captureOrgPairsAuthority, orgPairBytes } from "../org/preparedOrgPairs.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { canonicalize } from "../utils/json.js";
import { defaultPassportExportPath } from "./passportArtifact.js";
import { capturePassportBadgeBeforeDefault, capturePassportSharePdfAliases } from "./passportInputs.js";
import { loadPassportPolicyAttemptAsync } from "./passportPairPublication.js";
import { passportPolicySchema } from "./passportPolicySchema.js";
import { capturePassportArtifactCreation, capturePassportSharePdfCreation } from "./passportProducer.js";
import { PassportPublicationError, passportPublicationFailure, type PassportPublicationOptions } from "./passportPublication.js";
import { passportJsonSchema, type PassportJson } from "./passportSchema.js";
import { passportLatestCachePath, passportPolicyPath, verifyPassportPolicySignature } from "./passportStore.js";

type Created = Awaited<ReturnType<ReturnType<typeof capturePassportArtifactCreation>["create"]>>;
interface PassportReadAttempt {
  passport: PassportJson; assertCurrent(): void; publishedPaths: readonly string[]; createdDirectories: readonly string[];
  createdHash: string | null; exportedHash: string | null; sharedProgressUnknown: boolean; policyAttempted: boolean; policyReturned: boolean;
}
function selectedRead(workspace: string, passport: PassportJson, current: () => void, created: Created | null = null, policyReturned = false): PassportReadAttempt {
  const publishedPaths = Object.freeze([...(created?.publishedPaths ?? [])]);
  const createdDirectories = Object.freeze([...(created?.createdDirectories ?? [])]);
  const createdHash = created?.result.transparencyCreatedHash ?? null, exportedHash = created?.result.transparencyExportedHash ?? null;
  return Object.freeze({ passport, publishedPaths, createdDirectories, createdHash, exportedHash, sharedProgressUnknown: policyReturned, policyAttempted: policyReturned, policyReturned, assertCurrent() {
    try { current(); } catch (cause) { throw Object.assign(passportPublicationFailure(workspace, "lazy-read-continuation", publishedPaths, createdDirectories, null,
      cause, createdHash, exportedHash, policyReturned || (cause instanceof PassportPublicationError && cause.sharedProgressUnknown)),
      { policyAttempted: policyReturned, policyReturned }); }
  } });
}
function failedRead(workspace: string, cause: unknown, policyAttempted: boolean, policyReturned: boolean,
  artifactAttempted: boolean, artifactReturned: boolean, created: Created | null) {
  const paths = [...(created?.publishedPaths ?? [])];
  const failure = passportPublicationFailure(workspace, "lazy-read", paths, created?.createdDirectories ?? [], null, cause,
    created?.result.transparencyCreatedHash ?? (cause instanceof PassportPublicationError ? cause.createdHash : null),
    created?.result.transparencyExportedHash ?? (cause instanceof PassportPublicationError ? cause.exportedHash : null),
    policyAttempted || (artifactAttempted && !artifactReturned) || (cause instanceof PassportPublicationError && cause.sharedProgressUnknown));
  return Object.assign(failure, { policyAttempted, policyReturned, artifactAttempted, artifactReturned });
}
function captureAgentCreation(workspace: string, agentId: string, options: PassportPublicationOptions) {
  const scopeId = agentId.trim() || "default", path = defaultPassportExportPath({ workspace, scopeType: "AGENT", scopeId });
  return capturePassportArtifactCreation({ workspace, scopeType: "AGENT", scopeId, outFile: resolve(workspace, path) }, options);
}

/** Fixed badge recipe. Cache lookup uses the original raw id; genuine creation keeps trim/default scope semantics. */
export function capturePassportBadgeRead(params: { workspace: string; agentId: string }, options: PassportPublicationOptions = {}) {
  const input = { ...params }, caller = { ...options }, workspace = input.workspace;
  const actor = () => { caller.beforePublish?.(); caller.assertInputsCurrent?.(); }; actor();
  const path = passportPolicyPath(workspace), body = captureOrgFiles([path]), bytes = orgPairBytes(body, path);
  let used = false;
  if (bytes !== null) {
    const policy = passportPolicySchema.parse(YAML.parse(bytes.toString("utf8")));
    if (!policy.passportPolicy.governance.allowAgentReadOnlyBadge) throw new Error("passport badge access disabled by policy");
    const cachePath = passportLatestCachePath(workspace, "AGENT", input.agentId), cache = captureOrgFiles([cachePath]), cached = orgPairBytes(cache, cachePath);
    const beforeRead = () => { actor(); assertOrgPairsCurrent(body); assertOrgPairsCurrent(cache); };
    if (cached !== null) {
      const passport = passportJsonSchema.parse(JSON.parse(cached.toString("utf8")) as unknown); beforeRead();
      return Object.freeze({ async read(): Promise<PassportReadAttempt> {
        if (used) throw new Error("passport badge read was already consumed"); used = true; beforeRead();
        return selectedRead(workspace, passport, beforeRead);
      } });
    }
    beforeRead();
    const factory = captureAgentCreation(workspace, input.agentId, { beforePublish() { actor(); assertOrgPairsCurrent(body); } });
    beforeRead(); factory.assertCurrent();
    return Object.freeze({ async read(): Promise<PassportReadAttempt> {
      if (used) throw new Error("passport badge read was already consumed"); used = true;
      let artifactAttempted = false, created: Created | null = null;
      try { beforeRead(); factory.assertCurrent(); artifactAttempted = true; created = await factory.create(); created.assertCurrent();
        return selectedRead(workspace, created.result.passport, created.assertCurrent, created); }
      catch (cause) { throw failedRead(workspace, cause, false, false, artifactAttempted, created !== null, created); }
    } });
  }
  // Capture raw cache state before default-policy Sign, but parse it only at its old post-policy use stage.
  const cachePath = passportLatestCachePath(workspace, "AGENT", input.agentId), cache = captureOrgFiles([cachePath]), cached = orgPairBytes(cache, cachePath);
  const bundle = captureOrgPairsAuthority(workspace), log = cached === null ? captureWorkspaceLogAuthority(workspace) : null;
  const otherInputs = cached === null ? capturePassportBadgeBeforeDefault(workspace, input.agentId) : null;
  assertOrgPairsCurrent(body);
  const policyBefore = captureOrgPairs([path]);
  if (orgPairBytes(policyBefore, path) !== null) throw new Error("original missing passport policy changed before default creation");
  const stable = () => { actor(); bundle(); log?.assertCurrent(); };
  const originalInputs = () => { assertOrgPairsCurrent(policyBefore); assertOrgPairsCurrent(cache); otherInputs?.(); };
  stable(); originalInputs();
  return Object.freeze({ async read(): Promise<PassportReadAttempt> {
    if (used) throw new Error("passport badge read was already consumed"); used = true;
    let policyAttempted = false, policyReturned = false, artifactAttempted = false, created: Created | null = null;
    try {
      stable(); originalInputs(); policyAttempted = true;
      const loaded = await loadPassportPolicyAttemptAsync(workspace, { beforePublish: stable, assertInputsCurrent: originalInputs }); policyReturned = true;
      const policyCurrent = () => { stable(); loaded.assertCurrent(); };
      policyCurrent(); assertOrgPairsCurrent(cache); otherInputs?.();
      if (!loaded.policy.passportPolicy.governance.allowAgentReadOnlyBadge) throw new Error("passport badge access disabled by policy");
      if (cached !== null) {
        const passport = passportJsonSchema.parse(JSON.parse(cached.toString("utf8")) as unknown);
        const assertCurrent = () => { policyCurrent(); assertOrgPairsCurrent(cache); }; assertCurrent();
        return selectedRead(workspace, passport, assertCurrent, null, true);
      }
      // Retain F1 and raw/proof selection through real capture/warming; no generated timestamp is hoisted here.
      const factory = captureAgentCreation(workspace, input.agentId, { beforePublish: policyCurrent });
      policyCurrent(); assertOrgPairsCurrent(cache); otherInputs!(); factory.assertCurrent(); otherInputs!();
      // Old missing-policy/cache/proof CAS stops at this transfer. The genuine core now owns its output/log progression.
      artifactAttempted = true; created = await factory.create(); created.assertCurrent();
      return selectedRead(workspace, created.result.passport, created.assertCurrent, created, true);
    } catch (cause) { throw failedRead(workspace, cause, policyAttempted, policyReturned, artifactAttempted, created !== null, created); }
  } });
}

/** Fixed AGENT share recipe; a hit observes policy verification without requiring validity or a fresh signer. */
export function capturePassportShareRead(params: { workspace: string; agentId: string; format: "url" | "qr" | "json" | "pdf"; outFile?: string }, options: PassportPublicationOptions = {}) {
  const input = { ...params }, caller = { ...options }, workspace = input.workspace, scopeId = input.agentId.trim() || "default";
  const actor = () => { caller.beforePublish?.(); caller.assertInputsCurrent?.(); }; actor();
  const path = passportLatestCachePath(workspace, "AGENT", scopeId), cache = captureOrgFiles([path]), bytes = orgPairBytes(cache, path);
  const passport = bytes === null ? null : passportJsonSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  const observedPolicy = canonicalize(verifyPassportPolicySignature(workspace));
  const cacheCurrent = () => { actor(); assertOrgPairsCurrent(cache);
    if (canonicalize(verifyPassportPolicySignature(workspace)) !== observedPolicy) throw new Error("passport share policy-verification observation changed"); };
  let used = false;
  if (passport !== null) {
    const pdfPath = input.format === "pdf" ? resolve(workspace, input.outFile ?? join(".amc", "passport", "share", input.agentId, `${passport.passportId}.pdf`)) : null;
    const pdfAliases = pdfPath === null ? null : capturePassportSharePdfAliases(workspace, input.agentId, pdfPath);
    const assertCurrent = () => { cacheCurrent(); pdfAliases?.(); }; assertCurrent();
    return Object.freeze({ pdfPath, pdfAliases, async read(): Promise<PassportReadAttempt> {
      if (used) throw new Error("passport share read was already consumed"); used = true; assertCurrent();
      return selectedRead(workspace, passport, assertCurrent);
    } });
  }
  cacheCurrent();
  const factory = input.format === "pdf" ? capturePassportSharePdfCreation(workspace, input.agentId, input.outFile, { beforePublish: actor })
    : captureAgentCreation(workspace, input.agentId, { beforePublish: actor });
  const pdfPath = factory.pdfPath, pdfAliases = pdfPath === null ? null : capturePassportSharePdfAliases(workspace, input.agentId, pdfPath);
  cacheCurrent(); factory.assertCurrent(); pdfAliases?.();
  return Object.freeze({ pdfPath, pdfAliases, async read(): Promise<PassportReadAttempt> {
    if (used) throw new Error("passport share read was already consumed"); used = true;
    let artifactAttempted = false, created: Created | null = null;
    try { cacheCurrent(); factory.assertCurrent(); pdfAliases?.(); artifactAttempted = true; created = await factory.create();
      const assertCurrent = () => { created!.assertCurrent(); pdfAliases?.(); }; assertCurrent();
      return selectedRead(workspace, created.result.passport, assertCurrent, created); }
    catch (cause) { throw failedRead(workspace, cause, false, false, artifactAttempted, created !== null, created); }
  } });
}

/**
 * Activate's package and leases (P1-62 slice A; design §10.4 Build, §14.1, §14.2, §6.5). The release is the consumed
 * effect `a4.activate.release` (DEPLOY, a second engine request an owner opens on the direction gate): after the runner's
 * preamble (grant consumed, freeze and read-only re-read, every bound slot recomputed) it writes
 * `a4-releases/<projectId>/<releaseId>/` from content-addressed inputs only — the Enforce snapshot the bound resources
 * digest names (`snapshots/<manifestId>/files`, verified against its signed manifest), and the context files and signed
 * configs Propose copied into `a4-projects/<projectId>/<revisionNo>/<sha256>`, each asserted equal to its bound slot —
 * scans it (PASS required), mints the narrowed staging lease (WRITE_LOW at most, the staging routes, 24 h, work order =
 * the release), signs the manifest (`A4_PACKAGE`), the update policy (`A4_PACKAGE`), the prepared deployment plan
 * (`a4-deployment-plan`, slice B) and the tarball (`a4-package`), appends the transparency entry and records the release
 * (`amc.a4-release/v1`, its own `A4_RECORD` envelope) with a RELEASE transition, after which the lifecycle bridge may move
 * the agent to testing and staging. The staging token is answered once in the response that ran the effect and stored nowhere. The
 * production lease is the deployment approval's own effect (`a4.activate.production_lease`, on activate.completion's
 * quorum), followed by the bridge to production. AMC never deploys: the package is the signed provenance record of what
 * this workspace holds at the release digest (v1 is a same-host restart, D-18).
 */
import { closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { envelopeForUnboundResult } from "../claims/eligibility/adapters.js";
import { getPublicKeyPem } from "../crypto/keys.js";
import { signDigestWithPolicy, signingRoute, verifySignedDigest } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { latestEnforceResourceManifestPath, loadCanonicalEnforceResourceManifest, type EnforceResource } from "../enforce/resourceManifest.js";
import { getAgentPaths } from "../fleet/paths.js";
import { typedMultiAgentGraphDigest, typedMultiAgentGraphSchema } from "../fleet/typedGraph.js";
import { issueLeaseToken } from "../leases/leaseSigner.js";
import { revokedLeaseIdSet, revokeLease } from "../leases/leaseStore.js";
import { readAndVerifyArtifactFileSignature, signArtifactBytes, signArtifactFile, type ArtifactSignature } from "../lifecycle/artifactSignature.js";
import { assertOwnerMode } from "../mode/mode.js";
import { promptLatestPackPath } from "../prompt/promptPolicyStore.js";
import { generateProvenanceRecord } from "../release/releaseProvenance.js";
import { generateCycloneDxSbom } from "../release/releaseSbom.js";
import { scanExtractedReleaseForSecrets } from "../release/releaseSecretScan.js";
import { releasePublicKeyFingerprint } from "../release/releaseSigner.js";
import { runTarCreate, writeShaFile } from "../release/releaseUtils.js";
import { runtimeFirewallPolicyPath } from "../runtime/firewall.js";
import { appendTransparencyEntry, readTransparencyEntries } from "../transparency/logChain.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";
import { vaultStatus } from "../vault/vault.js";
import { a4ProjectsRoot } from "./a4Blobs.js";
import { conformanceView } from "./a4Conformance.js";
import type { A4EffectContext, A4EffectDef, A4EffectOutcome } from "./a4Effects.js";
import { A4_RUNTIME, signedA4Floor } from "./a4Gates.js";
import { isRegulated, redoneStages, type A4ReadinessState } from "./a4Readiness.js";
import {
  a4PackageV1Schema, a4PrincipalSchema, a4QualitySpecSchema, a4ReleaseV1Schema, a4ResourceDigestsSchema, type A4ChainLink, type A4PackageV1, type A4Principal, type A4ReleaseV1
} from "./a4Schema.js";
import { A4StoreError, openA4Store, type A4Store } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { deploymentPlan, deploymentViews, PLAN_PATH } from "./a4Deploy.js";
import { advance, bridgeControls, recordControls, releaseBridge, type BridgeOutcome } from "./a4Lifecycle.js";
import { rollbackViews } from "./a4Rollback.js";
import { UPDATE_POLICY_PATH, updatePolicyYaml, verifyUpdatePolicy } from "./a4UpdatePolicy.js";
import { contextPluginPath } from "./adaptContextPlugin.js";
import { memoryPolicyPath } from "./adaptMemoryPolicy.js";
import { integrationClaimFor } from "./assemblePaths.js";
import {
  ACTIVATE_CLAIM_BOUNDARY, activateSpecOf, CAPTURED_SLOTS, currentRelease, cycleLinks, enforceManifestIdFor, IDENTITY_NOT_EVALUATED, leasePlans,
  monitorResolves, PRODUCTION_LEASE_EFFECT_ID, proposedFor, RELEASE_EFFECT_ID, type LeasePlan
} from "./spec/activate.js";
import { adaptSpecOf, lockDigestOf, proposedPlan } from "./spec/adapt.js";
import { aspireSpecOf } from "./spec/aspire.js";
import { assembleSpecOf } from "./spec/assemble.js";

/** A coded failure: the effect runner records the message, whose first word is the code the route answers. */
const coded = (code: string, message: string): Error => Object.assign(new Error(`${code}: ${message}`), { code });
const MAX_INPUT_BYTES = 64 * 1024 * 1024; // ponytail: one input file; raise it if an agent's resources outgrow it
const PACKAGE_BOUNDARY = "The signed provenance record of what this workspace held at the release digest (v1: a same-host restart of the hosted Studio "
  + "that built the agent, D-18). AMC prepared and signed it; it never deployed it. Installing it into another workspace is P2-40.";
/** AMC's own install root (src/a4/ or dist/a4/ → the package root): the runtime SBOM and the deploy base files are read there. */
export const AMC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const a4ReleasesRoot = (workspace: string): string => join(workspace, "a4-releases");
const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");
const hex = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.replace(/^sha256:/, "") : "";
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
};

/**
 * One regular file read through one descriptor, never through a link at its last component; null when absent. `label`
 * names it in a refusal (an effect's error is recorded in the chain, so never an absolute path).
 */
export function regularBytes(path: string, label: string): Buffer | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw coded("INPUT_UNREADABLE", `${label} (${(error as NodeJS.ErrnoException).code ?? "unknown error"})`);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw coded("INPUT_NOT_REGULAR", label);
    if (stat.size > MAX_INPUT_BYTES) throw coded("INPUT_TOO_LARGE", label);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
/** Each component of `rel` under `root`, and `root` itself, is a real directory or file, never a link (lstat per component). */
function assertNoLinks(root: string, rel: string): void {
  const segments = rel.split("/");
  if (rel.length === 0 || isAbsolute(rel) || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw coded("PACKAGE_PATH_INVALID", rel);
  }
  let path = root;
  for (const segment of ["", ...segments]) {
    path = segment === "" ? path : join(path, segment);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      return; // absent from here on: the read reports it
    }
    if (stat.isSymbolicLink()) throw coded("PACKAGE_INPUT_LINK", relPath(root, path) || ".");
  }
}
/** `dir` exists as a real directory (created when absent), never a link. */
export function realDir(dir: string): string {
  ensureDir(dir);
  if (!lstatSync(dir).isDirectory()) throw coded("PACKAGE_DIR_LINK", relative(dirname(dir), dir));
  return dir;
}

/** Where Propose reads each captured slot's live file (the same files its slot recomputer hashes); bound at call time (import cycle). */
const CAPTURE_SOURCES: Readonly<Record<string, (workspace: string, agentId: string) => string>> = {
  "context.promptPackSha256": (workspace, agentId) => promptLatestPackPath(workspace, agentId),
  "context.contextPluginSha256": (workspace, agentId) => contextPluginPath(workspace, agentId),
  "context.memoryPolicySha256": (workspace, agentId) => memoryPolicyPath(workspace, agentId),
  "signedConfigs.tools": (workspace) => join(workspace, ".amc", "tools.yaml"), "signedConfigs.approvalPolicy": (workspace) => join(workspace, ".amc", "approval-policy.yaml"),
  "signedConfigs.budgets": (workspace) => join(workspace, ".amc", "budgets.yaml"), "signedConfigs.actionPolicy": (workspace) => join(workspace, ".amc", "action-policy.yaml"),
  "signedConfigs.opsPolicy": (workspace) => join(workspace, ".amc", "ops-policy.yaml"), "signedConfigs.firewall": (workspace) => runtimeFirewallPolicyPath(workspace)
};
const casDir = (workspace: string, projectId: string, revisionNo: number): string => join(a4ProjectsRoot(workspace), projectId, String(revisionNo));

/**
 * Propose's copy of each captured slot's live file into the content-addressed store, named by its sha256 (harmless when
 * the revision is then refused: nothing names it). Returns slot → digest (null when the file is absent). The revision
 * binds the slot as recomputed inside its transaction; a file that moved in between is a digest the store lacks, which
 * readiness and the effect refuse (INPUT_NOT_CAPTURED), never a different file packaged.
 */
export function captureInputs(workspace: string, projectId: string, agentId: string, revisionNo: number): Record<string, string | null> {
  const dir = casDir(workspace, projectId, revisionNo);
  [a4ProjectsRoot(workspace), join(a4ProjectsRoot(workspace), projectId), dir].forEach(realDir);
  return Object.fromEntries(Object.entries(CAPTURE_SOURCES).map(([slot, source]) => {
    const bytes = regularBytes(source(workspace, agentId), slot);
    if (bytes === null) return [slot, null];
    const sha = sha256Hex(bytes);
    if (!pathExists(join(dir, sha))) writeFileAtomic(join(dir, sha), bytes, 0o600);
    return [slot, sha];
  }));
}
/** A captured input by the digest the gate bound, verified against it (INPUT_NOT_CAPTURED / INPUT_DIGEST_MISMATCH otherwise). */
function readCaptured(workspace: string, projectId: string, revisionNo: number, slot: string, sha: string): Buffer {
  const dir = casDir(workspace, projectId, revisionNo);
  assertNoLinks(a4ProjectsRoot(workspace), `${projectId}/${revisionNo}/${sha}`);
  const bytes = /^[0-9a-f]{64}$/.test(sha) ? regularBytes(join(dir, sha), slot) : null;
  if (bytes === null) throw coded("INPUT_NOT_CAPTURED", slot);
  if (sha256Hex(bytes) !== sha) throw coded("INPUT_DIGEST_MISMATCH", slot);
  return bytes;
}

/** The Enforce snapshot the resources digest names, verified (signed snapshot, this agent and workspace, same digest), or its refusal code. */
export function enforceSnapshot(workspace: string, agentId: string, resourcesSha256: string): { manifestId: string; resources: EnforceResource[] } | { error: string } {
  const manifestId = enforceManifestIdFor(resourcesSha256);
  try {
    const manifest = loadCanonicalEnforceResourceManifest({ workspace, agentId,
      manifestPath: join(dirname(latestEnforceResourceManifestPath(workspace, agentId)), "snapshots", `${manifestId}.json`) });
    return manifest.resourcesSha256 === resourcesSha256 && manifest.manifestId === manifestId ? { manifestId, resources: manifest.resources }
      : { error: "ENFORCE_SNAPSHOT_MISMATCH" };
  } catch (error) {
    return { error: errorCodeOf(error, "ENFORCE_SNAPSHOT_UNREADABLE") };
  }
}

type PackageFile = { readonly path: string; readonly bytes: Buffer; readonly kind: string };

/**
 * The snapshot's files for each resource, read without following a link and digested as Enforce digests them (a file's
 * bytes; a directory's sorted file list; a typed graph by its graph digest), each equal to the signed manifest's digest.
 */
function snapshotFiles(workspace: string, agentId: string, snapshot: { manifestId: string; resources: EnforceResource[] }): PackageFile[] {
  const root = join(dirname(latestEnforceResourceManifestPath(workspace, agentId)), "snapshots", snapshot.manifestId, "files");
  assertNoLinks(getAgentPaths(workspace, agentId).rootDir, relative(getAgentPaths(workspace, agentId).rootDir, root).split(sep).join("/"));
  const out: PackageFile[] = [];
  for (const resource of snapshot.resources.filter((entry) => entry.exists && entry.digest !== null)) {
    assertNoLinks(root, resource.path);
    const path = join(root, resource.path);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      throw coded("SNAPSHOT_RESOURCE_MISSING", resource.path);
    }
    let digest: string;
    if (stat.isDirectory()) {
      const files: Array<{ path: string; digest: string }> = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) {
            const rel = relative(path, full).split(sep).join("/");
            const bytes = regularBytes(full, `${resource.path}/${rel}`);
            if (bytes === null) throw coded("SNAPSHOT_RESOURCE_MISSING", `${resource.path}/${rel}`);
            files.push({ path: rel, digest: sha256Hex(bytes) });
            out.push({ path: `resources/${resource.path}/${rel}`, bytes, kind: "resource" });
          } else throw coded("SNAPSHOT_RESOURCE_INVALID", `${resource.path}/${entry.name}`);
        }
      };
      walk(path);
      digest = sha256Hex(canonicalize(files));
    } else {
      const bytes = regularBytes(path, resource.path);
      if (bytes === null) throw coded("SNAPSHOT_RESOURCE_MISSING", resource.path);
      digest = resource.schema === "typed-multi-agent-graph.json"
        ? typedMultiAgentGraphDigest(typedMultiAgentGraphSchema.parse(JSON.parse(bytes.toString("utf8"))))
        : sha256Hex(bytes);
      out.push({ path: `resources/${resource.path}`, bytes, kind: "resource" });
    }
    if (digest !== resource.digest) throw coded("SNAPSHOT_RESOURCE_INVALID", resource.path);
  }
  return out;
}

/** Who signs `kind` and with which key (the auditor key, or the notary the trust config pins). */
function signerOf(workspace: string, kind: "A4_PACKAGE" | "A4_RECORD"): { route: "vault" | "notary"; fingerprint: string } {
  let route: "vault" | "notary";
  try {
    route = signingRoute(workspace, kind);
  } catch {
    throw coded("CONFIG_UNTRUSTED", "the trust config's signature does not verify");
  }
  return { route, fingerprint: route === "notary" ? loadTrustConfig(workspace).trust.notary.pinnedPubkeyFingerprint : releasePublicKeyFingerprint(getPublicKeyPem(workspace, "auditor")) };
}
/** signDigestWithPolicy with its failures as codes: a locked vault A4_VAULT_LOCKED (423), a notary NOTARY_UNREACHABLE (409), never a 500. */
function signDigest(workspace: string, kind: "A4_PACKAGE" | "A4_RECORD", digestHex: string): SignedDigest {
  try {
    return signDigestWithPolicy({ workspace, kind, digestHex });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/vault locked/i.test(text)) throw coded("A4_VAULT_LOCKED", `unlock the vault to sign ${kind}`);
    throw coded(signerOf(workspace, kind).route === "notary" ? "NOTARY_UNREACHABLE" : "SIGNING_FAILED", `${kind}: ${text.slice(0, 200)}`);
  }
}
/** A coded signing failure as the route answers it: 423 for a locked vault, 409 otherwise (NOTARY_UNREACHABLE, never a 500). */
const asStoreError = (error: unknown): unknown => {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && error instanceof Error ? new A4StoreError(code === "A4_VAULT_LOCKED" ? 423 : 409, code, error.message) : error;
};
/** An A4_RECORD envelope over `digestHex` for a side row (design §4.3), signed outside any ledger transaction. */
export function recordEnvelope(workspace: string, digestHex: string): SignedDigest {
  try {
    return signDigest(workspace, "A4_RECORD", digestHex);
  } catch (error) {
    throw asStoreError(error);
  }
}
/** An artifact signature over exact bytes, its failures coded as signDigest's are. */
function artifactSignature(workspace: string, artifactKind: ArtifactSignature["artifactKind"], bytes: Buffer): ArtifactSignature {
  try {
    return signArtifactBytes({ workspace, artifactKind, bytes });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    throw /vault locked/i.test(text) ? coded("A4_VAULT_LOCKED", `unlock the vault to sign ${artifactKind}`) : coded("SIGNING_FAILED", `${artifactKind}: ${text.slice(0, 200)}`);
  }
}
/**
 * A JSON record about a release (a receipt, an AMC check, a rollback, a monitor record, a value claim) at `a4-releases/<projectId>/<folder>/<releaseId>/<id>.json`
 * with its artifact signature beside it; every directory on the way is a real one, never a link. Named by a fresh id and
 * harmless when the transition that would name it is refused. Returns its workspace-relative path and sha256.
 */
export function writeReleaseRecord(workspace: string, projectId: string, folder: "receipts" | "checks" | "rollbacks" | "monitors" | "value", releaseId: string, id: string,
  doc: unknown, artifactKind: ArtifactSignature["artifactKind"]): { path: string; sha256: string } {
  if (!/^[a-z0-9_]{1,80}$/.test(id) || !/^a4r_[0-9a-f]{32}$/.test(releaseId)) throw new A4StoreError(400, "INPUT_INVALID", "not an A4 record id");
  const dir = [projectId, folder, releaseId].reduce((parent, segment) => realDir(join(parent, segment)), realDir(a4ReleasesRoot(workspace)));
  const path = join(dir, `${id}.json`);
  const bytes = json(doc);
  try {
    const signature = artifactSignature(workspace, artifactKind, bytes);
    writeFileAtomic(path, bytes, 0o644);
    writeFileAtomic(`${path}.sig`, json(signature), 0o644);
  } catch (error) {
    throw asStoreError(error);
  }
  return { path: relPath(workspace, path), sha256: sha256Hex(bytes) };
}

/**
 * A record writeReleaseRecord wrote, read once under a4-releases/: its bytes when they hash to the chain-named `sha256`
 * and carry a valid `artifactKind` signature, else the reason (a missing, changed or unsigned record is never read as present).
 */
export function readReleaseRecord(workspace: string, path: string, sha256: string, artifactKind: ArtifactSignature["artifactKind"]): { bytes: Buffer } | { reason: string } {
  if (!/^a4-releases(\/[A-Za-z0-9_.-]+)+\.json$/.test(path) || path.split("/").includes("..")) return { reason: "PATH_OUTSIDE_RELEASES" };
  const read = readAndVerifyArtifactFileSignature({ workspace, path: join(workspace, path), artifactKind, maxArtifactBytes: 4 * 1024 * 1024, maxSignatureBytes: 64 * 1024 });
  if (read.artifactBytes === null) return { reason: "RECORD_UNREADABLE" };
  if (sha256Hex(read.artifactBytes) !== sha256) return { reason: "RECORD_DIGEST_MISMATCH" };
  return read.valid ? { bytes: read.artifactBytes } : { reason: "RECORD_UNSIGNED" };
}

/** The lease ids each attempt minted for a release, journaled before its token leaves, so a retry revokes them first (design §6.5). */
const leaseJournalPath = (workspace: string, projectId: string, releaseId: string): string => join(a4ReleasesRoot(workspace), projectId, `${releaseId}.leases.json`);
function journaledLeases(workspace: string, projectId: string, releaseId: string): Array<{ leaseId: string; scope: string }> {
  const bytes = regularBytes(leaseJournalPath(workspace, projectId, releaseId), "lease journal");
  return bytes === null ? [] : JSON.parse(bytes.toString("utf8")) as Array<{ leaseId: string; scope: string }>;
}
/** Revokes every journaled lease of `scope` not in `keep`; any failure refuses the attempt (a lease of a failed attempt may still be live). */
function revokeJournaled(workspace: string, projectId: string, releaseId: string, scope: "staging" | "production", keep: readonly string[] = []): void {
  for (const entry of journaledLeases(workspace, projectId, releaseId).filter((row) => row.scope === scope && !keep.includes(row.leaseId))) {
    try {
      revokeLease(workspace, entry.leaseId, `A4 ${scope} lease of an earlier ${releaseId} attempt that did not finish`);
    } catch (error) {
      throw coded("LEASE_REVOKE_FAILED", `${entry.leaseId}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    }
  }
}
/** Mints one lease of the plan bound to the project's workspace, agent and release; its id is journaled before the token is returned. */
function mintLease(workspace: string, state: A4ReadinessState, releaseId: string, plan: LeasePlan): { leaseId: string; token: string; expiresAt: string; projection: Record<string, unknown> } {
  realDir(join(realDir(a4ReleasesRoot(workspace)), state.project.project_id));
  const { token, payload } = issueLeaseToken({ workspace, workspaceId: state.project.workspace_id, agentId: state.project.agent_id, ttlMs: plan.ttlMs,
    scopes: plan.scopes, routeAllowlist: plan.routeAllowlist, modelAllowlist: plan.modelAllowlist, maxTokensPerMinute: plan.maxTokensPerMinute,
    maxRequestsPerMinute: plan.maxRequestsPerMinute, maxCostUsdPerDay: plan.maxCostUsdPerDay, workOrderId: releaseId, executeActionClasses: plan.executeActionClasses });
  const journal = [...journaledLeases(workspace, state.project.project_id, releaseId), { leaseId: payload.leaseId, scope: plan.scope, mintedTs: payload.issuedTs }];
  writeFileAtomic(leaseJournalPath(workspace, state.project.project_id, releaseId), `${JSON.stringify(journal, null, 2)}\n`, 0o600);
  const expiresAt = new Date(payload.expiresTs).toISOString();
  return { leaseId: payload.leaseId, token, expiresAt, projection: { leaseId: payload.leaseId, scope: plan.scope, scopes: plan.scopes,
    executeActionClasses: plan.executeActionClasses, routeAllowlist: plan.routeAllowlist, expiresAt, releaseId } };
}
const revokeQuietly = (workspace: string, leaseId: string, reason: string): void => {
  try {
    revokeLease(workspace, leaseId, reason);
  } catch {
    // The journal still names it: the next attempt revokes it first, or refuses.
  }
};
const TOKEN_NOTICE = "The lease token is shown once, in this response; AMC does not store it. Mount it as an operator-supplied secret file.";

/** The approvals of the latest consumed documentary gate per stage and kind: each counted APPROVE bound to its gate's digest. */
function approvalsOf(state: A4ReadinessState): A4ReleaseV1["approvals"] {
  const consumed = new Map<string, string>();
  for (const link of state.chain) if (link.kind === "GATE_CONSUMED" && link.body.gate !== "policy") consumed.set(`${String(link.body.stage)}.${String(link.body.gate)}`, String(link.body.gateId));
  return [...consumed.values()].flatMap((gateId) => {
    const gate = state.gates.find((row) => row.gate_id === gateId);
    if (gate === undefined) return [];
    return state.decisions.filter((row) => row.gate_id === gateId && row.request_digest === gate.binding_digest
      && (JSON.parse(row.decision_json) as { decision?: unknown }).decision === "APPROVE_EXECUTE")
      .map((row) => ({ gateId, decisionId: row.decision_id, approverKey: row.approver_key, bindingDigest: gate.binding_digest, stage: gate.stage, gate: gate.gate }));
  });
}


/** releaseId from the execution id (stable across retries of one consumed approval). */
export const releaseIdFor = (executionId: string): string => `a4r_${sha256Hex(executionId).slice(0, 32)}`;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

/**
 * What a package holds besides its leases and reports, each read by content address and asserted equal to its bound
 * slot (design §6.5): the Enforce snapshot, the captured context files and signed configs, Adapt's compiled plan (bytes of
 * its revision in the verified chain; its lock must be the bound catalog lock), Adapt's conformance statement as it reads
 * now, the update policy, the prepared deployment (src/a4/a4Deploy.ts) and the README.
 */
function packageInputs(workspace: string, state: A4ReadinessState, gateRevisionNo: number, bound: Record<string, string | null>,
  answers: Parameters<typeof updatePolicyYaml>[0], deployInput: Parameters<typeof deploymentPlan>[0]): { files: PackageFile[]; deploy: ReturnType<typeof deploymentPlan> } {
  const resources = bound["enforce.resourcesSha256"] ?? null;
  if (resources === null) throw coded("ENFORCE_RESOURCES_NOT_PRODUCED", "the bound revision names no Enforce resources digest");
  const snapshot = enforceSnapshot(workspace, state.project.agent_id, resources);
  if ("error" in snapshot) throw coded(snapshot.error, `enforce.resourcesSha256 ${resources}`);
  const files = snapshotFiles(workspace, state.project.agent_id, snapshot);
  for (const [slot, path] of Object.entries(CAPTURED_SLOTS)) {
    const sha = bound[slot] ?? null;
    if (sha !== null) files.push({ path, bytes: readCaptured(workspace, state.project.project_id, gateRevisionNo, slot, sha), kind: slot.startsWith("context.") ? "context" : "config" });
  }
  const plan = proposedPlan(adaptSpecOf(state).spec);
  if (plan !== null) {
    const lock = bound["plan.lockDigest"] ?? null;
    if (lock !== null && lockDigestOf(plan.lock) !== lock) throw coded("PLAN_LOCK_MISMATCH", "the proposed plan was compiled against another catalog lock than the bound one");
    files.push({ path: "plan/compiled-plan.json", bytes: json(plan), kind: "plan" });
  }
  files.push({ path: "conformance/adapt.json", bytes: json(conformanceView(workspace, state, "adapt", Date.now(), () => [])), kind: "conformance" });
  files.push({ path: UPDATE_POLICY_PATH, bytes: updatePolicyYaml(answers), kind: "update-policy" });
  const deploy = deploymentPlan(deployInput);
  files.push(...deploy.files);
  files.push({ path: "README.md", kind: "readme", bytes: Buffer.from([
    `# A4 agent package (${deployInput.target})`, "", PACKAGE_BOUNDARY, "", ACTIVATE_CLAIM_BOUNDARY, "",
    `- deploy/ holds the prepared ${deployInput.target} overlay and ${PLAN_PATH} (steps, the receipt form, the gaps), signed a4-deployment-plan. AMC never runs them.`,
    "- v1 deployment is a same-host restart with a pinned image: the overlay restarts the hosted Studio that built this agent; receipts are recordable only for an agent built in that Studio (D-18).",
    "- The image is pinned by tag only until D-03 and P0-14 add a digest (IMAGE_TAG_ONLY); a Helm topology is undecided until D-03 (TOPOLOGY_UNDECIDED).",
    `- AMC's check of a destination establishes reachability only: ${IDENTITY_NOT_EVALUATED}. Runtime behaviour at the destination is not evaluated.`,
    "- A re-snapshot into another workspace is P2-40. The SBOM lists AMC's runtime dependencies only; the agent's AIBOM is P1-27/P2-18.",
    "- The staging lease token is delivered once to the release owner and stored nowhere; mount it as an operator-supplied secret file. leases.json names its id only.",
    `- ${UPDATE_POLICY_PATH} is the signed update policy; nothing enforces it yet (P2-34).`, ""
  ].join("\n"), "utf8") });
  return { files, deploy };
}

/** What the effect records about the lifecycle bridge it ran (EFFECT_FINISHED record): ids and reasons, never a credential. */
const lifecycleRecord = (releaseId: string, outcome: BridgeOutcome) => ({ releaseId, target: outcome.target, from: outcome.from, to: outcome.to, advanced: outcome.advanced,
  transitionId: outcome.transitionId, missing: [...outcome.missing], reason: outcome.reason });

/** The EFFECT_FINISHED receipt: the signed tarball, an implementation ref (self_reported). */
const receiptOf = (release: Record<string, unknown>): NonNullable<A4EffectOutcome["receipt"]> => ({ refKind: "package", refId: String(release.tarballPath),
  sha256: String(release.tarballSha256), label: `activate release ${String(release.releaseId)}: the signed package (a4-package), self_reported` });

/**
 * The release effect's executor (design §10.4 Build). Writes nothing outside its release directory, the lease journal,
 * the tarball and the transparency log until RELEASE commits; a failure revokes the lease it minted and removes its
 * staging directory. A RELEASE already recorded for this execution (the attempt was lost after it) is answered as is.
 */
async function createRelease(ctx: A4EffectContext): Promise<A4EffectOutcome> {
  const { workspace, state, gate, executionId } = ctx;
  assertOwnerMode(workspace, "a4 release");
  if (ctx.principal === null) throw coded("RELEASE_INLINE_ONLY", "the release runs inside POST …/releases or complete, which delivers its staging token");
  // The record's createdBy, checked before anything is written or minted.
  if (!a4PrincipalSchema.safeParse(ctx.principal).success) throw coded("RELEASE_PRINCIPAL_INVALID", "the releasing principal does not parse");
  const projectId = state.project.project_id;
  const releaseId = releaseIdFor(executionId);
  const recorded = state.chain.find((link) => link.kind === "RELEASE" && link.body.releaseId === releaseId);
  if (recorded !== undefined) {
    return { receipt: receiptOf(recorded.body), record: { lifecycle: lifecycleRecord(releaseId, releaseBridge(workspace, state, releaseId, true)) }, deliver: { release: { releaseId, packageDigest: recorded.body.packageDigest }, staging: { token: null,
      reasonCode: "TOKEN_DELIVERY_UNKNOWN", note: "An earlier attempt recorded this release and answered its staging token then, if at all; revoke it if it was lost." } } };
  }
  const revision = state.revisions.find((row) => row.revision_no === gate.revision_no && row.stage === "activate");
  const activate = activateSpecOf({ revisions: revision === undefined ? [] : [revision] });
  const plans = leasePlans(activate.answers);
  const proposed = (activate.spec.proposal as { deploymentTarget?: { kind?: unknown; destinationRef?: unknown; hostHint?: unknown } } | undefined)?.deploymentTarget;
  const target = proposed?.kind;
  if (revision === undefined || !proposedFor(activate.spec, activate.answers) || plans === null || (target !== "compose" && target !== "helm")
    || typeof proposed?.destinationRef !== "string") {
    throw coded("RELEASE_NOT_PROPOSED", "the gate's revision holds no current proposal");
  }
  const bound = (JSON.parse(gate.intent_json) as { resourceDigests: Record<string, string | null> }).resourceDigests;
  const quality = a4QualitySpecSchema.safeParse(aspireSpecOf(state).spec.quality);
  if (!quality.success) throw coded("QUALITY_SPEC_MISSING", "the Aspire brief carries no quality specification");
  const integration = integrationClaimFor(assembleSpecOf(state).spec.path);
  if (integration === null) throw coded("INTEGRATION_PATH_UNKNOWN", "Assemble recorded no integration path");
  revokeJournaled(workspace, projectId, releaseId, "staging");
  const projectDir = realDir(join(realDir(a4ReleasesRoot(workspace)), projectId));
  const staging = mkdtempSync(join(projectDir, ".staging-"));
  const finalDir = join(projectDir, releaseId);
  let minted: string | null = null;
  try {
    const previous = state.chain.filter((link) => link.kind === "RELEASE").at(-1)?.body.releaseId;
    const { files, deploy } = packageInputs(workspace, state, gate.revision_no, bound, activate.answers, { releaseId, projectId, agentId: state.project.agent_id, target,
      destinationRef: proposed!.destinationRef as string, hostHint: typeof proposed!.hostHint === "string" ? proposed!.hostHint : null,
      previousReleaseId: typeof previous === "string" ? previous : null });
    for (const file of files) writeFileAtomic(join(staging, file.path), file.bytes, 0o644);
    const scan = scanExtractedReleaseForSecrets(staging);
    if (scan.status !== "PASS") throw coded("SECRET_SCAN_FAILED", [...new Set(scan.findings.filter((row) => row.severity === "HIGH").map((row) => row.type))].join(", "));
    // Minted only after the scan passed and inside the consumed effect: a refused package mints nothing.
    const stagingLease = mintLease(workspace, state, releaseId, plans.staging);
    minted = stagingLease.leaseId;
    const add = (path: string, bytes: Buffer, kind: string): string => {
      files.push({ path, bytes, kind });
      writeFileAtomic(join(staging, path), bytes, 0o644);
      return sha256Hex(bytes);
    };
    add("leases.json", json([{ ...stagingLease.projection, status: "active" }]), "leases");
    const secretScanSha256 = add("secret-scan.json", json(scan), "secret-scan");
    let sbomSha256: string | null = null;
    try {
      sbomSha256 = add("sbom.amc-runtime.cdx.json", json(generateCycloneDxSbom(AMC_ROOT)), "sbom");
    } catch {
      // No lockfile in AMC's install root: no SBOM, named null (not evaluated), never a guessed one.
    }
    const provenanceSha256 = add("provenance.json", json(generateProvenanceRecord({ workspace: AMC_ROOT, toolVersion: amcVersion,
      outputs: { npmTgzSha256: "", sbomSha256: sbomSha256 ?? "", licensesSha256: "", secretScanSha256 } })), "provenance");
    const shaOf = (path: string): string | null => {
      const found = files.find((file) => file.path === path);
      return found === undefined ? null : sha256Hex(found.bytes);
    };
    // Signed after the scan (a signature is not text the scan judges) and listed in the manifest beside what it signs.
    add(`${UPDATE_POLICY_PATH}.sig`, json(signDigest(workspace, "A4_PACKAGE", shaOf(UPDATE_POLICY_PATH)!)), "update-policy-signature");
    add(`${PLAN_PATH}.sig`, json(artifactSignature(workspace, "a4-deployment-plan", files.find((file) => file.path === PLAN_PATH)!.bytes)), "deploy-plan-signature");
    const signer = signerOf(workspace, "A4_PACKAGE");
    const snapshotId = enforceManifestIdFor(bound["enforce.resourcesSha256"]!);
    const manifest: A4PackageV1 = a4PackageV1Schema.parse({
      schema: "amc.a4-package/v1", kind: "a4-agent-package",
      package: { name: `a4-${state.project.agent_id}`, version: `${state.chain.filter((link) => link.kind === "RELEASE").length + 1}.0.0`, projectId,
        revisionNo: gate.revision_no, revisionDigest: revision.spec_digest, amcVersion, node: process.version },
      files: files.map((file) => ({ path: file.path, sha256: sha256Hex(file.bytes), size: file.bytes.length, kind: file.kind })).sort((a, b) => a.path.localeCompare(b.path)),
      artifacts: { enforceSnapshotSha256: bound["enforce.resourcesSha256"], compiledPlanSha256: shaOf("plan/compiled-plan.json"),
        signedConfigsSha256: sha256Hex(canonicalize(Object.fromEntries(Object.keys(CAPTURED_SLOTS).filter((slot) => slot.startsWith("signedConfigs.")).map((slot) => [slot, bound[slot] ?? null])))),
        presetSha256: hex(bound["composition.presetSha256"]), contextPluginSha256: hex(bound["context.contextPluginSha256"]),
        memoryPolicySha256: hex(bound["context.memoryPolicySha256"]), updatePolicySha256: shaOf(UPDATE_POLICY_PATH), secretScanSha256, sbomSha256, aibomSha256: null },
      approvals: approvalsOf(state), integration, quality: quality.data,
      provenance: { note: "AMC provenance record (not a formal SLSA claim)", builtFrom: { enforceSnapshot: snapshotId, revisionDigest: revision.spec_digest,
        gateBindingDigest: gate.binding_digest, provenanceSha256, sbom: sbomSha256 === null ? "not generated (no lockfile in AMC's install root)"
          : "AMC runtime dependencies only; not the agent's AIBOM (P1-27/P2-18)" } },
      signing: { algorithm: "ed25519", kind: "A4_PACKAGE", pubkeyFingerprint: signer.fingerprint }, generatedTs: Date.now(), claimBoundary: PACKAGE_BOUNDARY
    });
    const manifestBytes = json(manifest);
    const packageDigest = sha256Hex(manifestBytes);
    const signed = signDigest(workspace, "A4_PACKAGE", packageDigest);
    writeFileAtomic(join(staging, "manifest.json"), manifestBytes, 0o644);
    writeFileAtomic(join(staging, "manifest.sig"), json(signed), 0o644);
    if (pathExists(finalDir)) rmSync(finalDir, { recursive: true, force: true }); // an earlier attempt's directory, which no RELEASE names
    renameSync(staging, finalDir);
    const tarPath = `${finalDir}.tar.gz`;
    runTarCreate(finalDir, tarPath);
    const tarball = readFileSync(tarPath);
    writeShaFile(`${tarPath}.sha256`, tarball);
    signArtifactFile({ workspace, path: tarPath, artifactKind: "a4-package", bytes: tarball });
    // A retry whose package bytes are identical reuses its entry.
    const entry = readTransparencyEntries(workspace).find((row) => row.artifact.kind === "a4-package" && row.artifact.id === releaseId && row.artifact.sha256 === packageDigest)
      ?? appendTransparencyEntry({ workspace, type: "A4_PACKAGE_SIGNED", agentId: state.project.agent_id, artifact: { kind: "a4-package", sha256: packageDigest, id: releaseId } });
    const release = { releaseId, packageDigest, packagePath: relPath(workspace, join(finalDir, "manifest.json")), signaturePath: relPath(workspace, join(finalDir, "manifest.sig")),
      tarballPath: relPath(workspace, tarPath), tarballSha256: sha256Hex(tarball), transparencyEntryId: entry.hash };
    recordRelease(ctx, { ...release, revisionDigest: revision.spec_digest, version: manifest.package.version, snapshotId, target, hostHint: proposed!.hostHint ?? null,
      integration, quality: quality.data, approvals: manifest.approvals, updatePolicySha256: manifest.artifacts.updatePolicySha256,
      conformanceSha256: shaOf("conformance/adapt.json")!, stagingLease, signingRoute: signer.route, principal: ctx.principal, deploy,
      lifecycle: releaseBridge(workspace, state, releaseId, false) });
    // The lifecycle bridge runs after RELEASE commits (a refused record moves no lifecycle); its outcome is EFFECT_FINISHED's record.
    return { receipt: receiptOf(release), record: { lifecycle: lifecycleRecord(releaseId, releaseBridge(workspace, state, releaseId, true)) }, deliver: { release, staging: { leaseId: stagingLease.leaseId, token: stagingLease.token, expiresAt: stagingLease.expiresAt,
      scope: "staging", tokenNotice: TOKEN_NOTICE } } };
  } catch (error) {
    if (minted !== null) revokeQuietly(workspace, minted, "A4 release attempt failed before its release was recorded; the token was never delivered");
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

type RecordInput = {
  releaseId: string; packageDigest: string; packagePath: string; signaturePath: string; tarballPath: string; tarballSha256: string; transparencyEntryId: string;
  revisionDigest: string; version: string; snapshotId: string; target: "compose" | "helm"; hostHint: unknown; integration: A4ReleaseV1["integration"];
  quality: A4ReleaseV1["quality"]; approvals: A4ReleaseV1["approvals"]; updatePolicySha256: string; conformanceSha256: string;
  stagingLease: ReturnType<typeof mintLease>; signingRoute: "vault" | "notary"; principal: A4Principal;
  deploy: ReturnType<typeof deploymentPlan>; lifecycle: BridgeOutcome;
};

/** The approvals lineage (design §5.3): self-approved consumed gates, the degradations recorded, the owner's acknowledgement. */
function lineageOf(state: A4ReadinessState, revisionNo: number, approvals: A4ReleaseV1["approvals"], now: number): A4ReleaseV1["approvalsLineage"] {
  const counted = state.decisions.filter((row) => approvals.some((approval) => approval.decisionId === row.decision_id));
  const degraded = new Set<string>([...counted.flatMap((row) => (JSON.parse(row.self_approval_facts_json) as { degraded?: unknown }).degraded ?? []),
    ...state.chain.flatMap((link) => link.kind === "GATE_REQUESTED" && approvals.some((approval) => approval.gateId === link.body.gateId) && Array.isArray(link.body.degraded) ? link.body.degraded : [])]
    .filter((code): code is string => code === "SOD_DEGRADED_SINGLE_USER" || code === "SOD_DEGRADED_SELF_PROVISIONED"));
  const ack = [...state.chain].reverse().find((link) => link.kind === "ACKNOWLEDGED" && link.body.itemId === "lineage.independent_approvals" && link.revisionNo === revisionNo
    && typeof link.body.expiresTs === "number" && link.body.expiresTs > now);
  return { selfApprovedGates: [...new Set(counted.filter((row) => row.self_approved === 1).map((row) => row.gate_id))], degraded: [...degraded] as A4ReleaseV1["approvalsLineage"]["degraded"],
    acknowledgement: ack === undefined ? null : { itemId: "lineage.independent_approvals", by: String(ack.body.actorKey), ts: Number(ack.body.ts), expiresTs: Number(ack.body.expiresTs),
      reason: String(ack.body.reason) } };
}

/**
 * The release record (`amc.a4-release/v1`, design §14.1): the eight-surface table, TUNE lineage (previous and base release)
 * and the staging lease; signed with its own A4_RECORD envelope outside the ledger transaction, then RELEASE (step built)
 * with the a4_releases row, refused when this execution's release exists, the stage was redone since the gate was
 * consumed, the step moved, or this attempt was already settled.
 */
function recordRelease(ctx: A4EffectContext, input: RecordInput): void {
  const { workspace, state, gate, executionId } = ctx;
  const projectId = state.project.project_id;
  const now = Date.now();
  let regulated = true;
  try {
    regulated = isRegulated(state, signedA4Floor(workspace));
  } catch {
    // An unverified policy reads regulated (fail closed).
  }
  const previous = state.chain.filter((link) => link.kind === "RELEASE").at(-1);
  const previousReleaseId = typeof previous?.body.releaseId === "string" ? previous.body.releaseId : null;
  const revision = state.revisions.find((row) => row.revision_no === gate.revision_no)!;
  const digests = JSON.parse(revision.resource_digests_json) as Record<string, Record<string, unknown>>;
  const resources = a4ResourceDigestsSchema.parse({ ...digests, enforce: { ...digests.enforce, manifestId: input.snapshotId },
    release: { ...digests.release, packageDigest: input.packageDigest } });
  const adapt = adaptSpecOf(state).spec;
  const body = {
    schema: "amc.a4-release/v1", releaseId: input.releaseId, projectId, revisionNo: gate.revision_no, revisionDigest: input.revisionDigest, version: input.version,
    packageDigest: input.packageDigest, packagePath: input.packagePath, signaturePath: input.signaturePath, transparencyEntryId: input.transparencyEntryId,
    previousReleaseId, baseReleaseId: state.project.base_release_id, resources, approvals: input.approvals, integration: input.integration, quality: input.quality,
    updatePolicySha256: input.updatePolicySha256,
    // The overlay digest is the composeDigest of a Compose release and the valuesDigest of a Helm one (a chart digest is the operator's helm package).
    deploymentTarget: { kind: input.target, sameHost: true, imageDigest: null, chartOrComposeDigest: input.target === "compose" ? input.deploy.overlaySha256 : null,
      valuesDigest: input.target === "helm" ? input.deploy.overlaySha256 : null, hostHint: typeof input.hostHint === "string" ? input.hostHint : null },
    rollback: { releaseId: previousReleaseId, enforceManifestId: typeof previous?.body.enforceManifestId === "string" ? previous.body.enforceManifestId : null,
      leaseIds: [input.stagingLease.leaseId], preparedCommands: input.deploy.rollbackCommands },
    leases: [{ leaseId: input.stagingLease.leaseId, scope: "staging", scopes: input.stagingLease.projection.scopes, expiresAt: input.stagingLease.expiresAt, status: "active" }],
    // The bridge rows as evidence and where the bridge will move the lifecycle; it runs after RELEASE commits (src/a4/a4Lifecycle.ts).
    lifecycle: { from: input.lifecycle.from, to: input.lifecycle.to, controls: recordControls(input.lifecycle) },
    approvalsLineage: lineageOf(state, gate.revision_no, input.approvals, now),
    surfaces: {
      score: { contextGraphSha256: hex(resources.brief.contextGraphSha256), latestSealedRunId: null },
      shield: { assuranceRunIds: [], firewallPolicyDigest: hex(resources.signedConfigs.firewall) },
      enforce: { manifestId: input.snapshotId, applyReceiptSha256: null, restoreReceiptSha256: null },
      vault: { signingRoute: input.signingRoute, vaultStatusAtRelease: vaultStatus(workspace).unlocked ? "unlocked" : "locked" },
      watch: { deploymentReceiptRef: null, runtimeRunIds: [], sloReportSha256: null },
      comply: { planDigest: hex(proposedPlan(adapt)?.digest), controlResultsSha256: hex((adapt.review as { conformance?: { resultsSha256?: unknown } } | undefined)?.conformance?.resultsSha256),
        conformanceStatementSha256: input.conformanceSha256 },
      fleet: { agentConfigSha256: hex(resources.brief.agentConfigSha256), typedGraphDigest: hex(resources.graph.typedGraphDigest), lifecycleTransitionId: null },
      passport: { artifactSha256: null, attestationSha256: null, rawStatus: "not_evaluated", claimBoundary: "signature verified; statements not evaluated",
        claim: envelopeForUnboundResult({ producer: `a4:${projectId}:release:${input.releaseId}:passport`, method: "human_review", regulated, now }) }
    },
    enforcementBoundaries: [
      { boundary: input.integration.enforcementBoundary, status: input.integration.enforcementBoundary === "none" ? "none" : input.integration.enforcementBoundary === "tool_pipeline" ? "enforced" : "observed",
        note: input.integration.notCovered.join("; ") || input.integration.supported },
      { boundary: "deployment", status: "none", note: "AMC prepares, signs and records; the operator deploys (contract §7)" },
      { boundary: "update_policy", status: "none", note: "no runner enforces the update policy yet (P2-34)" }
    ],
    claim: envelopeForUnboundResult({ producer: `a4:${projectId}:release:${input.releaseId}`, method: "human_review", regulated, now }),
    createdBy: input.principal, createdAt: new Date(now).toISOString()
  };
  const bodyJson = canonicalize(body);
  const envelope = signDigest(workspace, "A4_RECORD", sha256Hex(bodyJson));
  a4ReleaseV1Schema.parse({ ...body, envelope });
  const store = openA4Store(workspace);
  try {
    store.transition(projectId, A4_RUNTIME, ({ head, ts }) => {
      const chain = store.readChain(projectId);
      if (chain.some((link) => link.kind === "RELEASE" && link.body.releaseId === input.releaseId)) throw coded("RELEASE_RECORDED", input.releaseId);
      const consumed = chain.find((link) => link.kind === "GATE_CONSUMED" && link.body.gateId === gate.gate_id);
      if (consumed === undefined || chain.some((link) => link.seq > consumed.seq && redoneStages(link)?.("activate") === true)) {
        throw coded("RELEASE_STAGE_REDONE", "Activate was redone since the release approval was consumed");
      }
      if (head?.stage !== "activate" || head.step !== "direction_approved") throw coded("RELEASE_STEP_MOVED", `the project is at ${String(head?.stage)} ${String(head?.step)}`);
      const started = chain.filter((link) => link.kind === "EFFECT_STARTED" && link.body.executionId === executionId).at(-1);
      if (started === undefined || chain.some((link) => (link.kind === "EFFECT_FINISHED" || link.kind === "EFFECT_FAILED") && link.body.effectId === started.body.effectId)) {
        throw coded("RELEASE_ATTEMPT_SETTLED", "this attempt was settled while it ran");
      }
      return { kind: "RELEASE", stage: "activate", revisionNo: gate.revision_no, head: { step: "built" },
        payload: { releaseId: input.releaseId, executionId, packageDigest: input.packageDigest, packagePath: input.packagePath, tarballPath: input.tarballPath,
          tarballSha256: input.tarballSha256, transparencyEntryId: input.transparencyEntryId, target: input.target, enforceManifestId: input.snapshotId,
          previousReleaseId, baseReleaseId: state.project.base_release_id, recordSha256: envelope.digestSha256,
          leases: [{ leaseId: input.stagingLease.leaseId, scope: "staging", expiresAt: input.stagingLease.expiresAt }] },
        sideRows: [{ table: "a4_releases", values: { release_id: input.releaseId, project_id: projectId, revision_no: gate.revision_no, package_digest: input.packageDigest,
          package_path: input.packagePath, signature_path: input.signaturePath, transparency_entry_id: input.transparencyEntryId, previous_release_id: previousReleaseId,
          base_release_id: state.project.base_release_id, target: input.target, surfaces_json: bodyJson, envelope_json: JSON.stringify(envelope), actor_key: A4_RUNTIME.key, ts } }] };
    });
  } catch (error) {
    // The store signs RELEASE's own A4_RECORD envelope outside its transaction: a notary that cannot sign is NOTARY_UNREACHABLE.
    if (error instanceof A4StoreError && error.code === "A4_SIGNING_UNAVAILABLE") {
      throw coded(signerOf(workspace, "A4_RECORD").route === "notary" ? "NOTARY_UNREACHABLE" : "SIGNING_FAILED", "the RELEASE record could not be signed");
    }
    throw error;
  } finally {
    store.close();
  }
}

/**
 * The deployment approval's effect (design §10.4 Completion): the production lease (scopes, routes, classes and caps from
 * the Ask answers, work order = the release), minted only once activate.completion is consumed, its token answered once.
 * Then the lifecycle bridge to production (src/a4/a4Lifecycle.ts), which advances only with every production control
 * evidenced and otherwise records the missing ones.
 */
async function mintProductionLease(ctx: A4EffectContext): Promise<A4EffectOutcome> {
  const { workspace, state } = ctx;
  assertOwnerMode(workspace, "a4 complete");
  if (ctx.principal === null) throw coded("PRODUCTION_LEASE_INLINE_ONLY", "the production lease is minted inside complete, which delivers its token");
  const release = currentRelease(state.chain);
  const releaseId = typeof release?.body.releaseId === "string" ? release.body.releaseId : null;
  if (releaseId === null) throw coded("NO_RELEASE", "this Activate cycle recorded no release");
  const plans = leasePlans(activateSpecOf(state).answers);
  if (plans === null) throw coded("LEASE_PLAN_INVALID", "the Activate answers no longer give a lease plan");
  revokeJournaled(workspace, state.project.project_id, releaseId, "production");
  const lease = mintLease(workspace, state, releaseId, plans.production);
  // Then the lifecycle bridge to production, only with every production control evidenced (in v1 it stays at staging, P2-40).
  return { record: { lease: lease.projection, lifecycle: lifecycleRecord(releaseId, advance(workspace, state, "production", releaseId)) },
    deliver: { production: { leaseId: lease.leaseId, token: lease.token, expiresAt: lease.expiresAt, scope: "production", tokenNotice: TOKEN_NOTICE } } };
}

/** a4.activate.release (design §6.1 table): DEPLOY, a separately decided engine request, consumed by A4 as step 0; inline. */
export const RELEASE_EFFECT: A4EffectDef = {
  id: RELEASE_EFFECT_ID, toolName: "a4.activate.create_release", actionClass: "DEPLOY", consumes: "A4", completes: "activate.direction", inline: true,
  // The package digest is known only after the build, so the release approval's binding digest names the execution.
  executionId: (_state, gate) => `a4-release-${gate.binding_digest.slice(0, 32)}`,
  run: createRelease
};
/** a4.activate.production_lease: on the deployment approval's own quorum (DEPLOY floor); inline. */
export const PRODUCTION_LEASE_EFFECT: A4EffectDef = {
  id: PRODUCTION_LEASE_EFFECT_ID, toolName: "a4.activate.production_lease", actionClass: "DEPLOY", consumes: "gate", completes: "activate.completion", inline: true,
  executionId: (_state, gate) => `a4-production-lease-${gate.binding_digest.slice(0, 32)}`,
  run: mintProductionLease
};

/**
 * After a DENY on an unconsumed activate.completion gate (recordDecision refuses one on a consumed gate): revokes this
 * cycle's staging lease (design §6.4 step 7). Expiry needs no sweep: a completion gate lives at least a day and is
 * requested after the release, so the staging lease (24 h) has expired by then. Answers what it revoked.
 */
export function revokeStagingAfterDeny(store: A4Store, projectId: string, gateId: string): Record<string, unknown> {
  const chain = store.readChain(projectId);
  const requested = chain.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === gateId);
  const release = currentRelease(chain);
  if (requested?.body.stage !== "activate" || requested.body.gate !== "completion" || release === null) return {};
  const ids = (Array.isArray(release.body.leases) ? release.body.leases as Array<{ leaseId?: unknown; scope?: unknown }> : [])
    .filter((lease) => lease.scope === "staging" && typeof lease.leaseId === "string").map((lease) => String(lease.leaseId));
  const revoked: string[] = [];
  const failed: string[] = [];
  for (const leaseId of ids) {
    try {
      revokeLease(store.workspace, leaseId, `A4 deployment approval denied on gate ${gateId}`);
      revoked.push(leaseId);
    } catch {
      failed.push(leaseId);
    }
  }
  return { stagingLeases: { revoked, failed } };
}

/**
 * A lease as GET shows it: `status` live (revoked, expired, active, or unknown when the revocation list does not verify),
 * `recordedStatus` as the signed record states it.
 */
function liveLease(lease: Record<string, unknown>, revoked: Set<string> | null, now: number): Record<string, unknown> {
  const status = revoked === null ? "unknown" : revoked.has(String(lease.leaseId)) ? "revoked" : Date.parse(String(lease.expiresAt)) <= now ? "expired" : "active";
  return { ...lease, recordedStatus: lease.status, status, ...(revoked === null ? { reasonCode: "LEASE_REVOCATIONS_UNVERIFIED" } : {}) };
}

/**
 * The package's file list from its manifest, read once and listed only when those bytes hash to the release record's
 * package digest; null with the reason otherwise.
 */
function packageFiles(bytes: Buffer | null, packageDigest: string): { files: unknown[] | null; reason: string | null } {
  if (bytes === null) return { files: null, reason: "MANIFEST_UNREADABLE" };
  if (sha256Hex(bytes) !== packageDigest) return { files: null, reason: "MANIFEST_DIGEST_MISMATCH" };
  // Bytes with the package digest are the manifest the release wrote (json(manifest)), so they parse.
  return { files: a4PackageV1Schema.parse(JSON.parse(bytes.toString("utf8"))).files, reason: null };
}

/**
 * GET …/releases[/:rid]: each release record as stored (chain-named a4_releases rows), its envelope checked against the
 * stored bytes now, the leases with their live status (production from the deployment approval's effect), the package's
 * file list, the eight-surface table with a reason for every surface not evaluated (Watch's SLO digest from the newest
 * monitor ref that resolves) and the production bridge rows as they stand now. Integrity under this workspace's keys only.
 */
export function releaseViews(store: A4Store, projectId: string, state: A4ReadinessState): Array<Record<string, unknown>> {
  const { chain } = state;
  const now = Date.now();
  let revoked: Set<string> | null;
  try {
    revoked = revokedLeaseIdSet(store.workspace);
  } catch {
    revoked = null;
  }
  const { rows } = store.snapshot(projectId);
  const outcomes: Array<Record<string, unknown>> = chain.filter((link) => link.kind === "EFFECT_FINISHED").map((link) => ({ effect: link.body.effect,
    ...(link.body.record as { lifecycle?: Record<string, unknown> } | undefined)?.lifecycle }));
  const fileOf = (path: string): Buffer | null => {
    try {
      return regularBytes(join(store.workspace, path), path);
    } catch {
      return null;
    }
  };
  return rows.a4_releases.map((row) => {
    const bytes = String(row.surfaces_json);
    const envelope = JSON.parse(String(row.envelope_json ?? "null")) as SignedDigest | null;
    const record = a4ReleaseV1Schema.parse({ ...JSON.parse(bytes) as Record<string, unknown>, envelope });
    const production = chain.filter((link) => link.kind === "EFFECT_FINISHED").map((link) => (link.body.record as { lease?: Record<string, unknown> } | undefined)?.lease)
      .filter((lease): lease is Record<string, unknown> => lease?.releaseId === record.releaseId && lease.scope === "production");
    const notEvaluated = (reason: string) => ({ status: "not_evaluated", reason });
    const recordedIf = (present: boolean, reason: string) => present ? { status: "recorded", reason: null } : notEvaluated(reason);
    const { surfaces } = record;
    const deployments = deploymentViews(rows.a4_deployments, record.releaseId);
    const receipt = deployments.filter((entry) => entry.kind === "deploy").at(-1);
    const lifecycle = outcomes.filter((outcome) => outcome.releaseId === record.releaseId);
    const dir = dirname(record.packagePath);
    // Review's monitor record of this release, only while its signed file still resolves to the ref's bytes.
    const monitor = cycleLinks(chain, "EVIDENCE_REF").filter((link) => link.body.refKind === "monitor" && link.body.releaseId === record.releaseId
      && monitorResolves(state, link)).at(-1);
    const plan = readAndVerifyArtifactFileSignature({ workspace: store.workspace, path: join(store.workspace, dir, PLAN_PATH), artifactKind: "a4-deployment-plan",
      maxArtifactBytes: 1024 * 1024, maxSignatureBytes: 64 * 1024 });
    const parsedPlan = plan.artifactBytes === null ? null : JSON.parse(plan.artifactBytes.toString("utf8")) as unknown;
    return { ...record, envelopeValid: envelope !== null && envelope.digestSha256 === sha256Hex(bytes)
      && verifySignedDigest({ workspace: store.workspace, digestHex: envelope.digestSha256, signed: envelope }),
    // Checked now under this workspace's keys (a local audit trail): the prepared plan, the update policy, the receipts and rollbacks.
    deployPlan: { signatureValid: plan.valid, reason: plan.reason, plan: parsedPlan },
    updatePolicy: verifyUpdatePolicy(store.workspace, fileOf(`${dir}/${UPDATE_POLICY_PATH}`), fileOf(`${dir}/${UPDATE_POLICY_PATH}.sig`)),
    packageFiles: packageFiles(fileOf(record.packagePath), record.packageDigest),
    deployments, rollbacks: rollbackViews(chain, record.releaseId), lifecycleBridge: lifecycle,
    // What the bridge to production reads now (the record's own rows were fixed at release); never typed by a person.
    lifecycleProduction: bridgeControls(state, "production", record.releaseId),
    leases: [...record.leases, ...production.map((lease) => ({ ...lease, status: "active" }))].map((lease) => liveLease(lease, revoked, now)),
    surfaceTable: [
      { surface: "score", ...recordedIf(surfaces.score.contextGraphSha256 !== null, "no context graph digest was bound"), values: surfaces.score },
      { surface: "shield", ...notEvaluated("no assurance run is linked to this release yet"), values: surfaces.shield },
      { surface: "enforce", ...recordedIf(surfaces.enforce.manifestId !== null, "no Enforce snapshot"), values: surfaces.enforce },
      { surface: "vault", status: "recorded", reason: null, values: surfaces.vault },
      { surface: "watch", ...(receipt === undefined ? notEvaluated("no deployment receipt is recorded; runtime runs stay empty until a lease-bound session observes one")
        : { status: "recorded", reason: "the operator's receipt (self_reported); runtime runs stay empty until a lease-bound session observes one" }),
      values: { ...surfaces.watch, deploymentReceiptRef: receipt === undefined ? null : String(receipt.deploymentId),
        sloReportSha256: typeof monitor?.body.sloReportSha256 === "string" ? monitor.body.sloReportSha256 : null } },
      { surface: "comply", ...recordedIf(surfaces.comply.planDigest !== null, "no compiled plan was proposed at Adapt"), values: surfaces.comply },
      { surface: "fleet", ...recordedIf(surfaces.fleet.agentConfigSha256 !== null, "no agent config digest was bound"),
        values: { ...surfaces.fleet, lifecycleTransitionId: lifecycle.filter((outcome) => outcome.advanced === true).at(-1)?.transitionId ?? null } },
      { surface: "passport", ...notEvaluated("P0-55: the token-verify path does not yet refuse unsigned verdicts; signature verified, statements not evaluated"), values: surfaces.passport }
    ], boundary: ACTIVATE_CLAIM_BOUNDARY };
  });
}

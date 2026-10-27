import { prepareOrgPairsAsync, publishOrgPairs, captureOrgPairs, captureOrgPairsAuthority, assertOrgPairsCurrent, orgPairBytes, OrgPairsPublicationError, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { defaultAssurancePolicy, assurancePolicySchema, type AssurancePolicy } from "./assurancePolicySchema.js";
import {
  assuranceFindingsDocSchema,
  assuranceRunSchema,
  assuranceSchedulerStateSchema,
  assuranceTraceRefsSchema,
  assuranceWaiverSchema,
  type AssuranceFindingsDoc,
  type AssuranceRun,
  type AssuranceSchedulerState,
  type AssuranceTraceRefs,
  type AssuranceWaiver
} from "./assuranceSchema.js";

function assuranceRoot(workspace: string): string {
  return join(workspace, ".amc", "assurance");
}

export function assurancePolicyPath(workspace: string): string {
  return join(assuranceRoot(workspace), "policy.yaml");
}

export function assurancePolicySigPath(workspace: string): string {
  return `${assurancePolicyPath(workspace)}.sig`;
}

function assuranceRunsRoot(workspace: string): string {
  return join(assuranceRoot(workspace), "runs");
}

function assuranceRunDir(workspace: string, runId: string): string {
  return join(assuranceRunsRoot(workspace), runId);
}

export function assuranceRunJsonPath(workspace: string, runId: string): string {
  return join(assuranceRunDir(workspace, runId), "run.json");
}

function assuranceFindingsPath(workspace: string, runId: string): string {
  return join(assuranceRunDir(workspace, runId), "findings.json");
}

function assuranceTraceRefsPath(workspace: string, runId: string): string {
  return join(assuranceRunDir(workspace, runId), "trace.refs.json");
}

export function assuranceCertificatesDir(workspace: string): string {
  return join(assuranceRoot(workspace), "certificates");
}

export function assuranceLatestCertificatePath(workspace: string): string {
  return join(assuranceCertificatesDir(workspace), "latest.amccert");
}

export function assuranceLatestCertificateShaPath(workspace: string): string {
  return `${assuranceLatestCertificatePath(workspace)}.sha256`;
}

export function assuranceTimestampedCertificatePath(workspace: string, ts: number): string {
  return join(assuranceCertificatesDir(workspace), `${ts}.amccert`);
}

export function assuranceTimestampedCertificateShaPath(workspace: string, ts: number): string {
  return `${assuranceTimestampedCertificatePath(workspace, ts)}.sha256`;
}

export function assuranceSchedulerPath(workspace: string): string {
  return join(assuranceRoot(workspace), "scheduler.json");
}

export function assuranceWaiversDir(workspace: string): string {
  return join(assuranceRoot(workspace), "waivers");
}

export function defaultAssuranceSchedulerState(): AssuranceSchedulerState {
  return assuranceSchedulerStateSchema.parse({
    enabled: true,
    lastRunTs: null,
    nextRunTs: null,
    lastOutcome: {
      status: "OK",
      reason: ""
    },
    lastCertStatus: "NONE"
  });
}

function ensureAssuranceDirs(workspace: string): void {
  ensureDir(assuranceRoot(workspace));
  ensureDir(assuranceRunsRoot(workspace));
  ensureDir(assuranceCertificatesDir(workspace));
  ensureDir(assuranceWaiversDir(workspace));
}

export function saveAssurancePolicy(workspace: string, policy: AssurancePolicy): { path: string; sigPath: string } {
  ensureAssuranceDirs(workspace);
  const path = assurancePolicyPath(workspace);
  const [saved] = publishOrgPairs(workspace, [{ path, bytes: Buffer.from(YAML.stringify(assurancePolicySchema.parse(policy))) }]);
  return saved!;
}

export function initAssurancePolicy(workspace: string): { path: string; sigPath: string; policy: AssurancePolicy } {
  const policy = defaultAssurancePolicy();
  const saved = saveAssurancePolicy(workspace, policy);
  return { ...saved, policy };
}

export function loadAssurancePolicy(workspace: string): AssurancePolicy {
  const path = assurancePolicyPath(workspace);
  if (!pathExists(path)) {
    return initAssurancePolicy(workspace).policy;
  }
  return assurancePolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyAssurancePolicySignature(workspace: string) {
  const path = assurancePolicyPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "assurance policy missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function saveAssuranceRunArtifacts(params: {
  workspace: string;
  run: AssuranceRun;
  findings: AssuranceFindingsDoc;
  traceRefs: AssuranceTraceRefs;
}): {
  runPath: string;
  runSigPath: string;
  findingsPath: string;
  findingsSigPath: string;
  traceRefsPath: string;
  traceRefsSigPath: string;
} {
  ensureAssuranceDirs(params.workspace);
  const dir = assuranceRunDir(params.workspace, params.run.runId);
  ensureDir(dir);

  const runPath = assuranceRunJsonPath(params.workspace, params.run.runId);
  writeFileAtomic(runPath, JSON.stringify(assuranceRunSchema.parse(params.run), null, 2), 0o644);
  const runSigPath = signFileWithAuditor(params.workspace, runPath);

  const findingsPath = assuranceFindingsPath(params.workspace, params.run.runId);
  writeFileAtomic(findingsPath, JSON.stringify(assuranceFindingsDocSchema.parse(params.findings), null, 2), 0o644);
  const findingsSigPath = signFileWithAuditor(params.workspace, findingsPath);

  const traceRefsPath = assuranceTraceRefsPath(params.workspace, params.run.runId);
  writeFileAtomic(traceRefsPath, JSON.stringify(assuranceTraceRefsSchema.parse(params.traceRefs), null, 2), 0o644);
  const traceRefsSigPath = signFileWithAuditor(params.workspace, traceRefsPath);

  return {
    runPath,
    runSigPath,
    findingsPath,
    findingsSigPath,
    traceRefsPath,
    traceRefsSigPath
  };
}

/** Actual v1 run/findings/trace publisher; all three checked signatures precede the short pair publication lock. */
export async function saveAssuranceRunArtifactsAsync(input: Parameters<typeof saveAssuranceRunArtifacts>[0], options: OrgPairsOptions = {}) {
  const params = structuredClone(input), runPath = assuranceRunJsonPath(params.workspace, params.run.runId),
    findingsPath = assuranceFindingsPath(params.workspace, params.run.runId), traceRefsPath = assuranceTraceRefsPath(params.workspace, params.run.runId);
  const writes = [{ path: runPath, bytes: Buffer.from(JSON.stringify(assuranceRunSchema.parse(params.run), null, 2)) },
    { path: findingsPath, bytes: Buffer.from(JSON.stringify(assuranceFindingsDocSchema.parse(params.findings), null, 2)) },
    { path: traceRefsPath, bytes: Buffer.from(JSON.stringify(assuranceTraceRefsSchema.parse(params.traceRefs), null, 2)) }];
  const prepared = await prepareOrgPairsAsync(params.workspace, writes, options); prepared.publish();
  return { runPath, runSigPath: `${runPath}.sig`, findingsPath, findingsSigPath: `${findingsPath}.sig`, traceRefsPath, traceRefsSigPath: `${traceRefsPath}.sig`, assertCurrent: prepared.assertCurrent };
}

export function loadAssuranceRun(workspace: string, runId: string): AssuranceRun | null {
  const path = assuranceRunJsonPath(workspace, runId);
  if (!pathExists(path)) {
    return null;
  }
  return assuranceRunSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function loadAssuranceFindings(workspace: string, runId: string): AssuranceFindingsDoc | null {
  const path = assuranceFindingsPath(workspace, runId);
  if (!pathExists(path)) {
    return null;
  }
  return assuranceFindingsDocSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function loadAssuranceTraceRefs(workspace: string, runId: string): AssuranceTraceRefs | null {
  const path = assuranceTraceRefsPath(workspace, runId);
  if (!pathExists(path)) {
    return null;
  }
  return assuranceTraceRefsSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function listAssuranceRunIds(workspace: string): string[] {
  const root = assuranceRunsRoot(workspace);
  if (!pathExists(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

export function saveAssuranceSchedulerState(workspace: string, state: AssuranceSchedulerState): { path: string; sigPath: string } {
  ensureAssuranceDirs(workspace);
  const path = assuranceSchedulerPath(workspace);
  const [saved] = publishOrgPairs(workspace, [{ path, bytes: Buffer.from(JSON.stringify(assuranceSchedulerStateSchema.parse(state), null, 2)) }]);
  return saved!;
}

export function loadAssuranceSchedulerState(workspace: string): AssuranceSchedulerState {
  const path = assuranceSchedulerPath(workspace);
  if (!pathExists(path)) {
    return defaultAssuranceSchedulerState();
  }
  return assuranceSchedulerStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyAssuranceSchedulerSignature(workspace: string) {
  const path = assuranceSchedulerPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function saveAssuranceWaiver(workspace: string, waiver: AssuranceWaiver): { path: string; sigPath: string } {
  ensureAssuranceDirs(workspace);
  ensureDir(assuranceWaiversDir(workspace));
  const path = join(assuranceWaiversDir(workspace), `waiver_${waiver.createdTs}.json`);
  const [saved] = publishOrgPairs(workspace, [{ path, bytes: Buffer.from(JSON.stringify(assuranceWaiverSchema.parse(waiver), null, 2)) }]);
  return saved!;
}

export function listAssuranceWaivers(workspace: string): AssuranceWaiver[] {
  const dir = assuranceWaiversDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => {
      const path = join(dir, name);
      const selected = captureOrgPairs([path]), bytes = orgPairBytes(selected, path), signature = orgPairBytes(selected, `${path}.sig`);
      const verify = bytes === null ? { valid: false, reason: "file missing" } : signature === null ? { valid: false, reason: "signature missing" }
        : verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, signature);
      if (!verify.valid) throw new Error(`waiver signature invalid for ${name}: ${verify.reason ?? "unknown"}`);
      return assuranceWaiverSchema.parse(JSON.parse(bytes!.toString("utf8")) as unknown);
    });
}

export function latestAssuranceWaiver(workspace: string): AssuranceWaiver | null {
  const waivers = listAssuranceWaivers(workspace);
  return waivers.length > 0 ? waivers[0]! : null;
}

export function activeAssuranceWaiver(workspace: string, nowTs = Date.now()): AssuranceWaiver | null {
  const waivers = listAssuranceWaivers(workspace);
  for (const waiver of waivers) {
    if (waiver.allowReadyDespiteAssuranceFail && waiver.expiresTs > nowTs) {
      return waiver;
    }
  }
  return null;
}

export function verifyAssuranceRunArtifacts(workspace: string, runId: string): {
  ok: boolean;
  errors: string[];
} {
  const paths = [
    assuranceRunJsonPath(workspace, runId),
    assuranceFindingsPath(workspace, runId),
    assuranceTraceRefsPath(workspace, runId)
  ];
  const errors: string[] = [];
  for (const path of paths) {
    try {
      const pair = captureOrgPairs([path]), bytes = orgPairBytes(pair, path), signature = orgPairBytes(pair, `${path}.sig`);
      const verify = bytes === null ? { valid: false, reason: "file missing" } : signature === null ? { valid: false, reason: "signature missing" }
        : verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, signature);
      const reason = verify.reason === "signature verification failed" ? "signature verify failed" : verify.reason;
      if (!verify.valid) errors.push(`${dirname(path)}:${reason ?? "invalid signature"}`);
    } catch { errors.push(`${dirname(path)}:invalid signature`); }
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

/** A selected signed input is parsed and, when required by its consumer, verified from these same bytes. */
export function captureAssurancePolicy(workspace: string) {
  const path = assurancePolicyPath(workspace), snapshot = captureOrgPairs([path]), bytes = orgPairBytes(snapshot, path), sidecar = orgPairBytes(snapshot, `${path}.sig`);
  const signature = bytes === null ? { valid: false, reason: "assurance policy missing" } : sidecar === null ? { valid: false, reason: "signature missing" }
    : verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, sidecar);
  return { path, snapshot, parsePolicy: () => bytes === null ? null : assurancePolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown),
    signature: { ...signature, signatureExists: sidecar !== null, path, sigPath: `${path}.sig` } };
}
export function captureAssuranceScheduler(workspace: string) {
  const path = assuranceSchedulerPath(workspace), snapshot = captureOrgPairs([path]), bytes = orgPairBytes(snapshot, path);
  return { path, snapshot, state: bytes === null ? defaultAssuranceSchedulerState() : assuranceSchedulerStateSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown) };
}
export async function prepareAssurancePolicyAsync(workspace: string, policy: AssurancePolicy, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  options.beforePublish?.(); ensureAssuranceDirs(workspace);
  const path = assurancePolicyPath(workspace), bytes = Buffer.from(YAML.stringify(assurancePolicySchema.parse(structuredClone(policy))));
  return prepareOrgPairsAsync(workspace, [{ path, bytes }], options, previous);
}
export async function saveAssurancePolicyAsync(workspace: string, policy: AssurancePolicy, options: OrgPairsOptions = {}) {
  const prepared = await prepareAssurancePolicyAsync(workspace, policy, options); const [saved] = prepared.publish();
  return { ...saved!, assertCurrent: prepared.assertCurrent };
}
export async function initAssurancePolicyAsync(workspace: string, options: OrgPairsOptions = {}) {
  const policy = defaultAssurancePolicy(), saved = await saveAssurancePolicyAsync(workspace, policy, options); saved.assertCurrent(); return { ...saved, policy };
}
export class AssurancePolicyInitializationError extends Error {
  readonly code = "ASSURANCE_POLICY_INITIALIZATION_INCOMPLETE";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedStage: string, cause: unknown) {
    super("assurance policy initialization did not complete; known and uncertain publication effects remain", { cause }); this.name = "AssurancePolicyInitializationError";
  }
}
/** Capture a mature cold attempt before earlier setup awaits; an existing body remains a no-sign/no-unlock no-op. */
export function captureAssurancePolicyInitialization(workspace: string, options: OrgPairsOptions = {}) {
  options = { ...options }; const actor = options.beforePublish, selected = captureOrgPairs([assurancePolicyPath(workspace)]), path = assurancePolicyPath(workspace);
  actor?.(); const missing = orgPairBytes(selected, path) === null;
  const fixed = missing ? captureOrgPairsAuthority(workspace, actor) : () => actor?.();
  const policy = missing ? defaultAssurancePolicy() : null;
  let own: (() => void) | null = null, started = false; const published: string[] = [];
  const assertCurrent = () => { fixed(); if (own === null) assertOrgPairsCurrent(selected); else own(); };
  return Object.freeze({ assertCurrent, publishedPaths: () => Object.freeze([...published]), async initialize() {
    options.assertInputsCurrent?.(); assertCurrent();
    if (!missing) return { path, sigPath: `${path}.sig`, policy: undefined, created: false };
    if (started) throw new Error("assurance initialization attempt already entered; inspect its published paths before retrying");
    started = true; let stage = "prepare";
    try {
      const prepared = await prepareAssurancePolicyAsync(workspace, policy!, { beforePublish: fixed, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(selected); } }, selected);
      stage = "publish"; prepared.publish(); published.push(path, `${path}.sig`); own = prepared.assertCurrent;
      stage = "return"; assertCurrent(); return { path, sigPath: `${path}.sig`, policy: policy!, created: true };
    } catch (cause) {
      if (cause instanceof OrgPairsPublicationError) published.push(...cause.publishedPaths.map(member => join(workspace, member)));
      throw new AssurancePolicyInitializationError(Object.freeze([...published]), stage, cause);
    }
  } });
}
export async function prepareAssuranceSchedulerStateAsync(workspace: string, state: AssuranceSchedulerState, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  options.beforePublish?.(); ensureAssuranceDirs(workspace);
  const path = assuranceSchedulerPath(workspace), bytes = Buffer.from(JSON.stringify(assuranceSchedulerStateSchema.parse(structuredClone(state)), null, 2));
  return prepareOrgPairsAsync(workspace, [{ path, bytes }], options, previous);
}
export async function saveAssuranceSchedulerStateAsync(workspace: string, state: AssuranceSchedulerState, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const prepared = await prepareAssuranceSchedulerStateAsync(workspace, state, options, previous); const [saved] = prepared.publish();
  return { ...saved!, assertCurrent: prepared.assertCurrent };
}
export async function prepareAssuranceWaiverAsync(workspace: string, waiver: AssuranceWaiver, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  options.beforePublish?.(); ensureAssuranceDirs(workspace);
  const owned = assuranceWaiverSchema.parse(structuredClone(waiver)), path = join(assuranceWaiversDir(workspace), `waiver_${owned.createdTs}.json`);
  return prepareOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(JSON.stringify(owned, null, 2)) }], options, previous);
}

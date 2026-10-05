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

export function assuranceRoot(workspace: string): string {
  return join(workspace, ".amc", "assurance");
}

export function assurancePolicyPath(workspace: string): string {
  return join(assuranceRoot(workspace), "policy.yaml");
}

export function assurancePolicySigPath(workspace: string): string {
  return `${assurancePolicyPath(workspace)}.sig`;
}

export function assuranceRunsRoot(workspace: string): string {
  return join(assuranceRoot(workspace), "runs");
}

export function assuranceRunDir(workspace: string, runId: string): string {
  return join(assuranceRunsRoot(workspace), runId);
}

export function assuranceRunJsonPath(workspace: string, runId: string): string {
  return join(assuranceRunDir(workspace, runId), "run.json");
}

export function assuranceFindingsPath(workspace: string, runId: string): string {
  return join(assuranceRunDir(workspace, runId), "findings.json");
}

export function assuranceTraceRefsPath(workspace: string, runId: string): string {
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

export function ensureAssuranceDirs(workspace: string): void {
  ensureDir(assuranceRoot(workspace));
  ensureDir(assuranceRunsRoot(workspace));
  ensureDir(assuranceCertificatesDir(workspace));
  ensureDir(assuranceWaiversDir(workspace));
}

export function saveAssurancePolicy(workspace: string, policy: AssurancePolicy): { path: string; sigPath: string } {
  ensureAssuranceDirs(workspace);
  const path = assurancePolicyPath(workspace);
  writeFileAtomic(path, YAML.stringify(assurancePolicySchema.parse(policy)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
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
  writeFileAtomic(path, JSON.stringify(assuranceSchedulerStateSchema.parse(state), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
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
  writeFileAtomic(path, JSON.stringify(assuranceWaiverSchema.parse(waiver), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
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
      const verify = verifySignedFileWithAuditor(workspace, path);
      if (!verify.valid) {
        throw new Error(`waiver signature invalid for ${name}: ${verify.reason ?? "unknown"}`);
      }
      return assuranceWaiverSchema.parse(JSON.parse(readUtf8(path)) as unknown);
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
    const verify = verifySignedFileWithAuditor(workspace, path);
    if (!verify.valid) {
      errors.push(`${dirname(path)}:${verify.reason ?? "invalid signature"}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

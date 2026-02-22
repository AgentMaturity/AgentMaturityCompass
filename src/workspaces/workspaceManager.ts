import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { getWorkspacePaths, initWorkspace } from "../workspace.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { verifyOpsPolicySignature } from "../ops/policy.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { verifyForecastPolicySignature } from "../forecast/forecastStore.js";
import { benchPolicyPath, verifyBenchPolicySignature } from "../bench/benchPolicyStore.js";
import { verifyCanonSignature } from "../canon/canonLoader.js";
import { verifyDiagnosticBankSignature } from "../diagnostic/bank/bankLoader.js";
import { verifyCgxPolicySignature } from "../cgx/cgxStore.js";
import { verifyPromptPackFile } from "../prompt/promptPackVerifier.js";
import { listPromptAgentsWithPacks, verifyPromptLintSignature } from "../prompt/promptPackStore.js";
import { promptLatestPackPath, verifyPromptPolicySignature } from "../prompt/promptPolicyStore.js";
import { assuranceReadinessGate } from "../assurance/assuranceControlPlane.js";
import { verifyAuditMapActiveSignature } from "../audit/auditMapStore.js";
import { verifyAuditPolicySignature } from "../audit/auditPolicyStore.js";
import { verifyAuditWorkspace } from "../audit/binderVerifier.js";
import { loadValuePolicy, verifyValuePolicySignature } from "../value/valueStore.js";
import { getWorkspaceRecord, listWorkspaceRecords } from "./hostDb.js";
import type { WorkspaceContext } from "./workspaceContext.js";
import { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } from "./workspaceId.js";
import {
  assertWorkspacePathInsideHost,
  ensureHostDirLayout,
  hostWorkspaceDir
} from "./workspacePaths.js";
import { resolveWorkspaceRuntime, type WorkspaceRuntimeResolution } from "./workspaceResolver.js";

export interface WorkspaceManagerOptions {
  hostDir?: string | null;
  workspaceDir?: string | null;
  defaultWorkspaceId?: string;
  maxOpenWorkspaces?: number;
}

export class WorkspaceManager {
  private readonly resolution: WorkspaceRuntimeResolution;

  private readonly maxOpen: number;

  private readonly cache = new Map<string, WorkspaceContext>();

  constructor(opts: WorkspaceManagerOptions) {
    this.resolution = resolveWorkspaceRuntime({
      hostDir: opts.hostDir ?? null,
      workspaceDir: opts.workspaceDir ?? null,
      defaultWorkspaceId: opts.defaultWorkspaceId ?? DEFAULT_WORKSPACE_ID
    });
    this.maxOpen = Math.max(4, opts.maxOpenWorkspaces ?? 32);
    if (this.resolution.hostMode) {
      ensureHostDirLayout(this.resolution.hostDir!);
    }
  }

  get runtime(): WorkspaceRuntimeResolution {
    return this.resolution;
  }

  resolveWorkspaceId(input: string | null | undefined): string {
    return normalizeWorkspaceId(input ?? this.resolution.defaultWorkspaceId);
  }

  workspaceDir(workspaceId: string): string {
    const normalizedId = this.resolveWorkspaceId(workspaceId);
    if (this.resolution.hostMode) {
      const hostDir = this.resolution.hostDir!;
      const record = getWorkspaceRecord(hostDir, normalizedId);
      if (!record || record.status !== "ACTIVE") {
        throw new Error(`Workspace not active: ${normalizedId}`);
      }
      const target = hostWorkspaceDir(hostDir, normalizedId);
      const checked = assertWorkspacePathInsideHost(hostDir, target);
      ensureDir(checked);
      if (!pathExists(resolve(checked, ".amc"))) {
        initWorkspace({ workspacePath: checked, trustBoundaryMode: "isolated" });
      }
      return checked;
    }
    const workspaceDir = this.resolution.singleWorkspaceDir!;
    ensureDir(workspaceDir);
    if (!pathExists(resolve(workspaceDir, ".amc"))) {
      initWorkspace({ workspacePath: workspaceDir, trustBoundaryMode: "isolated" });
    }
    return workspaceDir;
  }

  workspaceExists(workspaceId: string): boolean {
    try {
      const dir = this.workspaceDir(workspaceId);
      return existsSync(dir);
    } catch {
      return false;
    }
  }

  workspaceReady(workspaceId: string): { ok: boolean; reasons: string[] } {
    try {
      const dir = this.workspaceDir(workspaceId);
      const reasons: string[] = [];
      if (!pathExists(resolve(dir, ".amc"))) {
        reasons.push("missing .amc");
      }
      if (!pathExists(resolve(getWorkspacePaths(dir).amcDir, "evidence.sqlite"))) {
        reasons.push("missing evidence db");
      }
      const trustSig = verifyTrustConfigSignature(dir);
      if (!trustSig.valid) {
        reasons.push(`trust config invalid: ${trustSig.reason ?? "signature verification failed"}`);
      }
      const opsSig = verifyOpsPolicySignature(dir);
      if (!opsSig.valid) {
        reasons.push(`ops policy invalid: ${opsSig.reason ?? "signature verification failed"}`);
      }
      const forecastSig = verifyForecastPolicySignature(dir);
      if (!forecastSig.valid) {
        reasons.push(`forecast policy invalid: ${forecastSig.reason ?? "signature verification failed"}`);
      }
      const canonSig = verifyCanonSignature(dir);
      if (!canonSig.valid) {
        reasons.push(`canon invalid: ${canonSig.reason ?? "signature verification failed"}`);
      }
      const bankSig = verifyDiagnosticBankSignature(dir);
      if (!bankSig.valid) {
        reasons.push(`diagnostic bank invalid: ${bankSig.reason ?? "signature verification failed"}`);
      }
      const cgxSig = verifyCgxPolicySignature(dir);
      if (!cgxSig.valid) {
        reasons.push(`cgx policy invalid: ${cgxSig.reason ?? "signature verification failed"}`);
      }
      const promptPolicySig = verifyPromptPolicySignature(dir);
      if (!promptPolicySig.valid) {
        reasons.push(`prompt policy invalid: ${promptPolicySig.reason ?? "signature verification failed"}`);
      }
      const assuranceGate = assuranceReadinessGate(dir);
      if (!assuranceGate.ok) {
        reasons.push(...assuranceGate.reasons.map((reason) => `assurance gate: ${reason}`));
      }
      const auditPolicySig = verifyAuditPolicySignature(dir);
      if (!auditPolicySig.valid) {
        reasons.push(`audit policy invalid: ${auditPolicySig.reason ?? "signature verification failed"}`);
      }
      const auditMapSig = verifyAuditMapActiveSignature(dir);
      if (!auditMapSig.valid) {
        reasons.push(`audit map invalid: ${auditMapSig.reason ?? "signature verification failed"}`);
      }
      const auditVerify = verifyAuditWorkspace({ workspace: dir });
      if (!auditVerify.ok) {
        reasons.push(...auditVerify.errors.slice(0, 6).map((error) => `audit verify: ${error}`));
      }
      const valuePolicy = (() => {
        try {
          return loadValuePolicy(dir);
        } catch {
          return null;
        }
      })();
      const valuePolicySig = verifyValuePolicySignature(dir);
      if (!valuePolicySig.valid) {
        if (!valuePolicy || valuePolicy.valuePolicy.enforceSignedInputs) {
          reasons.push(`value policy invalid: ${valuePolicySig.reason ?? "signature verification failed"}`);
        }
      }
      for (const agentId of listPromptAgentsWithPacks(dir)) {
        const verify = verifyPromptPackFile({
          file: promptLatestPackPath(dir, agentId)
        });
        if (!verify.ok) {
          reasons.push(`prompt pack invalid (${agentId}): ${verify.errors.join("; ")}`);
        }
        const lintSig = verifyPromptLintSignature(dir, agentId);
        if (!(lintSig.valid || !lintSig.signatureExists)) {
          reasons.push(`prompt lint signature invalid (${agentId}): ${lintSig.reason ?? "signature verification failed"}`);
        }
      }
      if (pathExists(benchPolicyPath(dir))) {
        const benchSig = verifyBenchPolicySignature(dir);
        if (!benchSig.valid) {
          reasons.push(`bench policy invalid: ${benchSig.reason ?? "signature verification failed"}`);
        }
      }
      return {
        ok: reasons.length === 0,
        reasons
      };
    } catch (error) {
      return {
        ok: false,
        reasons: [String(error)]
      };
    }
  }

  listWorkspaceIds(): string[] {
    if (!this.resolution.hostMode) {
      return [this.resolution.defaultWorkspaceId];
    }
    return listWorkspaceRecords(this.resolution.hostDir!)
      .filter((row) => row.status === "ACTIVE")
      .map((row) => row.workspaceId)
      .sort((a, b) => a.localeCompare(b));
  }

  withWorkspace<T>(workspaceId: string, fn: (context: WorkspaceContext) => T): T {
    const id = this.resolveWorkspaceId(workspaceId);
    const now = Date.now();
    let context = this.cache.get(id);
    if (!context) {
      const dir = this.workspaceDir(id);
      const realDir = realpathSync(dir);
      if (this.resolution.hostMode) {
        assertWorkspacePathInsideHost(this.resolution.hostDir!, realDir);
      }
      context = {
        workspaceId: id,
        workspaceDir: realDir,
        loadedTs: now,
        lastUsedTs: now
      };
      this.cache.set(id, context);
      this.evictIfNeeded();
    } else {
      context.lastUsedTs = now;
    }
    return fn(context);
  }

  closeWorkspace(workspaceId: string): void {
    const id = this.resolveWorkspaceId(workspaceId);
    this.cache.delete(id);
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxOpen) {
      return;
    }
    const entries = Array.from(this.cache.values()).sort((a, b) => a.lastUsedTs - b.lastUsedTs);
    while (this.cache.size > this.maxOpen && entries.length > 0) {
      const oldest = entries.shift();
      if (oldest) {
        this.cache.delete(oldest.workspaceId);
      }
    }
  }
}

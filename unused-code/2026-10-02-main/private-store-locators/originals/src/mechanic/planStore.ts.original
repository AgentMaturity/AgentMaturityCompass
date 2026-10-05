import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { mechanicPlanSchema, type MechanicUpgradePlan } from "./upgradePlanSchema.js";
import { mechanicRoot } from "./targetsStore.js";

export function mechanicPlansDir(workspace: string): string {
  return join(mechanicRoot(workspace), "plans");
}

export function mechanicPlanLatestPath(workspace: string): string {
  return join(mechanicPlansDir(workspace), "latest.json");
}

export function mechanicPlanSnapshotPath(workspace: string, ts: number): string {
  return join(mechanicPlansDir(workspace), "snapshots", `${ts}.json`);
}

export function saveMechanicPlan(workspace: string, plan: MechanicUpgradePlan): {
  latestPath: string;
  latestSigPath: string;
  snapshotPath: string;
  snapshotSigPath: string;
} {
  const normalized = mechanicPlanSchema.parse(plan);
  ensureDir(mechanicPlansDir(workspace));
  ensureDir(join(mechanicPlansDir(workspace), "snapshots"));

  const latestPath = mechanicPlanLatestPath(workspace);
  writeFileAtomic(latestPath, `${JSON.stringify(normalized, null, 2)}\n`, 0o644);
  const latestSigPath = signFileWithAuditor(workspace, latestPath);

  const snapshotPath = mechanicPlanSnapshotPath(workspace, normalized.generatedTs);
  writeFileAtomic(snapshotPath, `${JSON.stringify(normalized, null, 2)}\n`, 0o644);
  const snapshotSigPath = signFileWithAuditor(workspace, snapshotPath);

  return {
    latestPath,
    latestSigPath,
    snapshotPath,
    snapshotSigPath
  };
}

export function loadLatestMechanicPlan(workspace: string): MechanicUpgradePlan | null {
  const path = mechanicPlanLatestPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  return mechanicPlanSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function loadMechanicPlanById(workspace: string, planId: string): MechanicUpgradePlan {
  const latest = loadLatestMechanicPlan(workspace);
  if (latest && latest.planId === planId) {
    return latest;
  }
  const snapDir = join(mechanicPlansDir(workspace), "snapshots");
  if (!pathExists(snapDir)) {
    throw new Error(`mechanic plan not found: ${planId}`);
  }
  for (const file of readdirSync(snapDir).filter((name) => name.endsWith(".json")).sort((a, b) => b.localeCompare(a))) {
    const parsed = mechanicPlanSchema.parse(JSON.parse(readUtf8(join(snapDir, file))) as unknown);
    if (parsed.planId === planId) {
      return parsed;
    }
  }
  throw new Error(`mechanic plan not found: ${planId}`);
}

export function verifyMechanicPlanSignatures(workspace: string): {
  latest: ReturnType<typeof verifySignedFileWithAuditor>;
  snapshots: Array<{ path: string; verify: ReturnType<typeof verifySignedFileWithAuditor> }>;
} {
  const latestPath = mechanicPlanLatestPath(workspace);
  const latest = pathExists(latestPath)
    ? verifySignedFileWithAuditor(workspace, latestPath)
    : {
        valid: false,
        signatureExists: false,
        reason: "plan latest missing",
        path: latestPath,
        sigPath: `${latestPath}.sig`
      };
  const snapDir = join(mechanicPlansDir(workspace), "snapshots");
  const snapshots: Array<{ path: string; verify: ReturnType<typeof verifySignedFileWithAuditor> }> = [];
  if (pathExists(snapDir)) {
    for (const file of readdirSync(snapDir).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b))) {
      const path = join(snapDir, file);
      snapshots.push({
        path,
        verify: verifySignedFileWithAuditor(workspace, path)
      });
    }
  }
  return {
    latest,
    snapshots
  };
}

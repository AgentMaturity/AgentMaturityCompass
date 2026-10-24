import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, publishOrgPairs, prepareOrgPairsAsync,
  type OrgPairsSnapshot, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyMechanicPair } from "./mechanicPairs.js";
import { mechanicPlanSchema, type MechanicUpgradePlan } from "./upgradePlanSchema.js";
import { mechanicRoot } from "./targetsStore.js";

function mechanicPlansDir(workspace: string): string {
  return join(mechanicRoot(workspace), "plans");
}

function mechanicPlanLatestPath(workspace: string): string {
  return join(mechanicPlansDir(workspace), "latest.json");
}

function mechanicPlanSnapshotPath(workspace: string, ts: number): string {
  return join(mechanicPlansDir(workspace), "snapshots", `${ts}.json`);
}

export function saveMechanicPlan(workspace: string, plan: MechanicUpgradePlan): {
  latestPath: string;
  latestSigPath: string;
  snapshotPath: string;
  snapshotSigPath: string;
} {
  const writes = planWrites(workspace, plan);
  publishOrgPairs(workspace, writes.rows);
  return writes.paths;
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
    ? verifyMechanicPair(workspace, latestPath, "plan latest missing")
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
        verify: verifyMechanicPair(workspace, path, "file missing")
      });
    }
  }
  return {
    latest,
    snapshots
  };
}

function planWrites(workspace: string, input: MechanicUpgradePlan) {
  const plan = mechanicPlanSchema.parse(input), latestPath = mechanicPlanLatestPath(workspace), snapshotPath = mechanicPlanSnapshotPath(workspace, plan.generatedTs);
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { rows: [{ path: latestPath, bytes }, { path: snapshotPath, bytes }],
    paths: { latestPath, latestSigPath: `${latestPath}.sig`, snapshotPath, snapshotSigPath: `${snapshotPath}.sig` } };
}
/** Internal parse-only selector. Its signature preimage is pinned, not newly admitted for execution. */
function selectedPlan(workspace: string, planId: string) {
  const read = (path: string) => {
    const snapshot = captureOrgPairs([path]), bytes = orgPairBytes(snapshot, path);
    return bytes === null ? null : { path, snapshot, plan: mechanicPlanSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown) };
  };
  const latest = read(mechanicPlanLatestPath(workspace));
  if (latest !== null && latest.plan.planId === planId) return latest;
  const dir = join(mechanicPlansDir(workspace), "snapshots");
  if (pathExists(dir)) for (const file of readdirSync(dir).filter(name => name.endsWith(".json")).sort((a, b) => b.localeCompare(a))) {
    const found = read(join(dir, file)); if (found !== null && found.plan.planId === planId) return found;
  }
  throw new Error(`mechanic plan not found: ${planId}`);
}
export function captureMechanicPlanById(workspace: string, planId: string) {
  const selected = selectedPlan(workspace, planId), destinations = captureOrgPairs(planWrites(workspace, selected.plan).rows.map(row => row.path));
  return { plan: selected.plan, destinations, assertCurrent() {
    if (selectedPlan(workspace, planId).path !== selected.path) throw new Error("mechanic plan selection changed while executing");
    assertOrgPairsCurrent(selected.snapshot); assertOrgPairsCurrent(destinations);
  } };
}
export async function prepareMechanicPlan(workspace: string, input: MechanicUpgradePlan, options: OrgPairsOptions = {}, before?: OrgPairsSnapshot) {
  const writes = planWrites(workspace, input), prepared = await prepareOrgPairsAsync(workspace, writes.rows, options, before);
  return { assertCurrent: prepared.assertCurrent, publish() { prepared.publish(); return writes.paths; } };
}

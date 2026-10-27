import { join } from "node:path";
import { resolveAgentId, getAgentPaths } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { runDiagnostic } from "../diagnostic/runner.js";
import { runAssurance } from "../assurance/assuranceRunner.js";
import { buildDashboard } from "../dashboard/build.js";
import { createUnifiedClaritySnapshot } from "../snapshot/snapshot.js";
import { createTransformPlanAsync } from "../transformation/transformPlanner.js";
import { runTransformTrackerAsync } from "../transformation/transformTracker.js";
import { loadLatestTransformPlan } from "../transformation/transformTasks.js";

interface LoopConfig {
  cadence: "weekly" | "daily";
  target: string;
  includeAssurance: boolean;
}

function loopConfigPath(workspace: string): string {
  return join(workspace, ".amc", "loop.json");
}

function loadLoopConfig(workspace: string): LoopConfig {
  const file = loopConfigPath(workspace);
  if (!pathExists(file)) {
    return {
      cadence: "weekly",
      target: "default",
      includeAssurance: true
    };
  }
  const parsed = JSON.parse(readUtf8(file)) as Partial<LoopConfig>;
  return {
    cadence: parsed.cadence === "daily" ? "daily" : "weekly",
    target: typeof parsed.target === "string" && parsed.target.length > 0 ? parsed.target : "default",
    includeAssurance: parsed.includeAssurance !== false
  };
}

export function initLoop(workspace: string): { configPath: string } {
  const configPath = loopConfigPath(workspace);
  ensureDir(join(workspace, ".amc"));
  if (!pathExists(configPath)) {
    writeFileAtomic(
      configPath,
      JSON.stringify(
        {
          cadence: "weekly",
          target: "default",
          includeAssurance: true,
          createdTs: Date.now()
        },
        null,
        2
      ),
      0o644
    );
  }
  return { configPath };
}

export function loopPlan(params: {
  workspace: string;
  agentId?: string;
  cadence: "weekly" | "daily";
}): string {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const days = params.cadence === "daily" ? 7 : 14;
  return [
    `Loop plan for ${agentId} (${params.cadence})`,
    `1) amc loop run --agent ${agentId} --days ${days}`,
    `2) amc verify`,
    `3) amc dashboard build --agent ${agentId}`,
    `4) amc snapshot --agent ${agentId} --out .amc/agents/${agentId}/reports/snapshots/latest.md`
  ].join("\n");
}

export function loopSchedule(params: {
  workspace: string;
  agentId?: string;
  os: "cron" | "launchd" | "systemd";
  cadence: "weekly" | "daily";
}): string {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const cmd = `cd ${params.workspace} && amc loop run --agent ${agentId} --days ${params.cadence === "daily" ? 7 : 14}`;
  if (params.os === "cron") {
    return params.cadence === "daily" ? `0 9 * * * ${cmd}` : `0 9 * * 1 ${cmd}`;
  }
  if (params.os === "launchd") {
    return [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
      "<plist version=\"1.0\"><dict>",
      `<key>Label</key><string>com.amc.loop.${agentId}</string>`,
      `<key>ProgramArguments</key><array><string>/bin/sh</string><string>-lc</string><string>${cmd}</string></array>`,
      "<key>StartCalendarInterval</key><dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>",
      "</dict></plist>"
    ].join("\n");
  }
  return [
    "[Unit]",
    `Description=AMC loop for ${agentId}`,
    "",
    "[Service]",
    "Type=oneshot",
    `WorkingDirectory=${params.workspace}`,
    `ExecStart=/bin/sh -lc '${cmd}'`,
    "",
    "[Timer]",
    params.cadence === "daily" ? "OnCalendar=daily" : "OnCalendar=Mon *-*-* 09:00:00",
    "Persistent=true",
    "",
    "[Install]",
    "WantedBy=timers.target"
  ].join("\n");
}

export async function loopRun(params: {
  workspace: string;
  agentId?: string;
  days: number;
}): Promise<{
  agentId: string;
  runId: string;
  assuranceRunId: string | null;
  dashboardDir: string;
  snapshotFile: string;
  transformPlanId: string | null;
  transformUpdated: boolean;
}> {
  const config = loadLoopConfig(params.workspace);
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const window = `${Math.max(1, params.days)}d`;

  const run = await runDiagnostic({
    workspace: params.workspace,
    agentId,
    window,
    targetName: config.target,
    claimMode: "auto"
  });

  let assuranceRunId: string | null = null;
  if (config.includeAssurance) {
    const assurance = await runAssurance({
      workspace: params.workspace,
      agentId,
      mode: "sandbox",
      runAll: true,
      window
    });
    assuranceRunId = assurance.assuranceRunId;
  }

  const transformScope = {
    type: "AGENT" as const,
    agentId
  };
  if (!loadLatestTransformPlan(params.workspace, transformScope)) {
    await createTransformPlanAsync({
      workspace: params.workspace,
      scope: transformScope,
      to: "targets",
      window
    });
  }
  const tracker = await runTransformTrackerAsync({
    workspace: params.workspace,
    scope: transformScope,
    window
  });

  const paths = getAgentPaths(params.workspace, agentId);
  const dashboardDir = join(paths.rootDir, "dashboard");
  buildDashboard({
    workspace: params.workspace,
    agentId,
    outDir: dashboardDir
  });

  const snapshotsDir = join(paths.reportsDir, "snapshots");
  ensureDir(snapshotsDir);
  const snapshotFile = join(snapshotsDir, `${Date.now()}.md`);
  createUnifiedClaritySnapshot({
    workspace: params.workspace,
    agentId,
    outFile: snapshotFile
  });

  return {
    agentId,
    runId: run.runId,
    assuranceRunId,
    dashboardDir,
    snapshotFile,
    transformPlanId: tracker.after.planId,
    transformUpdated: tracker.changed
  };
}

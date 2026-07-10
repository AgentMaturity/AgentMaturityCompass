import { runDoctorRules, type DoctorOptions } from "./doctorRules.js";
import { renderDoctorText } from "./doctorReport.js";

export async function runDoctorCli(workspace: string, options: DoctorOptions = {}): Promise<{
  ok: boolean;
  checks: Awaited<ReturnType<typeof runDoctorRules>>["checks"];
  text: string;
  mode: Awaited<ReturnType<typeof runDoctorRules>>["mode"];
  workspaceInitialized: boolean;
  strict: boolean;
}> {
  const report = await runDoctorRules(workspace, options);
  return {
    ok: report.ok,
    checks: report.checks,
    text: renderDoctorText(report),
    mode: report.mode,
    workspaceInitialized: report.workspaceInitialized,
    strict: report.strict
  };
}

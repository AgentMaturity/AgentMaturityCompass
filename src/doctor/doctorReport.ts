import type { DoctorReport } from "./doctorRules.js";

export function renderDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  const passCount = report.checks.filter(c => c.status === "PASS").length;
  const failCount = report.checks.filter(c => c.status === "FAIL").length;
  const warnCount = report.checks.filter(c => c.status === "WARN").length;
  lines.push(`Doctor result: ${report.ok ? "PASS ✅" : "NEEDS SETUP"} (${passCount} pass, ${failCount} fail, ${warnCount} warn)`);
  if (!report.ok) {
    lines.push(`  💡 This is normal for a fresh install. Fix the items below to get to PASS.`);
  }
  for (const row of report.checks) {
    lines.push(`[${row.status}] ${row.id}: ${row.message}`);
    if (row.fixHint) {
      lines.push(`  fix: ${row.fixHint}`);
    }
  }
  return lines.join("\n");
}


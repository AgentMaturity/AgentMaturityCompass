import type { DoctorReport } from "./doctorRules.js";

export function renderDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  const passCount = report.checks.filter(c => c.status === "PASS").length;
  const failCount = report.checks.filter(c => c.status === "FAIL").length;
  const warnCount = report.checks.filter(c => c.status === "WARN").length;
  const infoCount = report.checks.filter(c => c.status === "INFO").length;
  const label = report.mode === "INSTALL" && report.ok
    ? "INSTALL READY ✅"
    : report.ok
      ? "PASS ✅"
      : (failCount === 0 ? "READY ✅" : failCount <= 2 ? "MOSTLY READY ⚙️" : "NEEDS SETUP ⚠️");
  lines.push(`Doctor mode: ${report.mode}${report.strict ? " (strict)" : ""}`);
  lines.push(`Doctor result: ${label} (${passCount} pass, ${failCount} fail, ${warnCount} warn, ${infoCount} info)`);
  if (report.mode === "INSTALL" && report.ok) {
    lines.push("  CLI installation is ready. Run `amc` to initialize this workspace and generate its first evidence result.");
  }
  if (failCount > 0) {
    lines.push(`  💡 ${failCount <= 2 ? "Almost there! Just a few items to configure:" : "This is normal for a fresh install. Fix the items below to get to PASS:"}`);
  } else if (infoCount > 0) {
    lines.push(`  💡 All critical checks pass. Info items are optional enhancements.`);
  }
  for (const row of report.checks) {
    lines.push(`[${row.status}] ${row.id}: ${row.message}`);
    if (row.fixHint) {
      lines.push(`  fix: ${row.fixHint}`);
    }
  }
  return lines.join("\n");
}

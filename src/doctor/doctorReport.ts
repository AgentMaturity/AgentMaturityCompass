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
      : "NEEDS ATTENTION ⚠️";
  lines.push(`Doctor mode: ${report.mode}${report.strict ? " (strict)" : ""}`);
  lines.push(report.liveProbes
    ? "Probe scope: live notary/gateway probes explicitly requested; provider charges may apply. Skipped probes are not passed."
    : "Probe scope: local diagnostics; no live notary signing, gateway model requests or diagnostic lease issuance. Local adapter version probes may run.");
  lines.push(`Doctor result: ${label} (${passCount} pass, ${failCount} fail, ${warnCount} warn, ${infoCount} info)`);
  if (report.mode === "INSTALL" && report.ok) {
    lines.push("  CLI installation is ready. Run `amc` to initialize this workspace and generate its first evidence result.");
  }
  const warnWithFix = report.checks.filter(c => c.status === "WARN" && typeof c.fixHint === "string" && c.fixHint.length > 0);
  if (failCount > 0) {
    lines.push("  Review each failure below. A small failure count does not make an invalid trust policy or unavailable runtime safe.");
  } else if (warnWithFix.length > 0) {
    lines.push(`  ${warnWithFix.length} warning(s) name a precondition that is still missing and the command that fixes it; a governed turn may be refused until each is addressed.`);
  } else if (infoCount > 0) {
    lines.push(`  💡 All critical checks pass. Info items are optional enhancements.`);
  }
  for (const row of report.checks) {
    lines.push(`[${row.status}] ${row.id}: ${row.message}`);
    if (row.fixHint) {
      lines.push(`  fix: ${row.fixHint}`);
    }
  }
  lines.push("Doctor readiness covers only the checks listed here; it is not a governed-turn receipt, remote authentication proof, platform qualification or release gate.");
  return lines.join("\n");
}

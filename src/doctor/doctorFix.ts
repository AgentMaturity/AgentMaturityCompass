/**
 * Doctor Fix Mode
 *
 * Auto-repair common setup issues found by doctor checks.
 * Only fixes safe/reversible issues; flags dangerous ones for manual intervention.
 */

import { existsSync, mkdirSync, unlinkSync, lstatSync, readlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DoctorCheck } from "./doctorRules.js";
import { runDoctorRules } from "./doctorRules.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FixCategory = "MISSING_DIR" | "INVALID_SIGNATURE" | "STALE_CACHE" | "MISSING_CONFIG" | "BROKEN_SYMLINK";

export type FixResult = "FIXED" | "SKIPPED" | "FAILED" | "MANUAL_REQUIRED";

export interface FixAction {
  fixId: string;
  checkId: string;
  category: FixCategory;
  description: string;
  result: FixResult;
  beforeState: string;
  afterState: string;
  error: string | null;
  ts: number;
}

export interface DoctorFixReport {
  reportId: string;
  ts: number;
  dryRun: boolean;
  totalChecks: number;
  fixableChecks: number;
  fixed: number;
  skipped: number;
  failed: number;
  manualRequired: number;
  actions: FixAction[];
}

// ---------------------------------------------------------------------------
// Fix rules: map check IDs to fixable actions
// ---------------------------------------------------------------------------

interface FixRule {
  checkId: string | RegExp;
  category: FixCategory;
  canAutoFix: boolean;
  describe: (check: DoctorCheck, workspace: string) => string;
  fix: (check: DoctorCheck, workspace: string) => { before: string; after: string };
}

const AMC_DIRS = [
  ".amc",
  ".amc/evidence",
  ".amc/cache",
  ".amc/backups",
  ".amc/logs",
  ".amc/vault",
];

function fixRules(): FixRule[] {
  return [
    // Missing .amc directories
    {
      checkId: /^(vault|studio|gateway)/,
      category: "MISSING_DIR",
      canAutoFix: true,
      describe: (_check, _ws) => "Create missing .amc directories",
      fix: (_check, workspace) => {
        const created: string[] = [];
        for (const dir of AMC_DIRS) {
          const full = join(workspace, dir);
          if (!existsSync(full)) {
            mkdirSync(full, { recursive: true });
            created.push(dir);
          }
        }
        return {
          before: `Missing directories: ${created.length > 0 ? created.join(", ") : "none"}`,
          after: created.length > 0 ? `Created: ${created.join(", ")}` : "All directories exist",
        };
      },
    },
    // Invalid/missing signatures
    {
      checkId: /^sig-/,
      category: "INVALID_SIGNATURE",
      canAutoFix: false,
      describe: (check) => `Re-sign: ${check.message}`,
      fix: (check) => ({
        before: check.message,
        after: "Manual: run `amc fix-signatures` with vault unlocked",
      }),
    },
    // Broken symlinks in .amc
    {
      checkId: /.*/,
      category: "BROKEN_SYMLINK",
      canAutoFix: true,
      describe: () => "Remove broken symlinks in .amc/",
      fix: (_check, workspace) => {
        const amcDir = join(workspace, ".amc");
        const removed: string[] = [];
        if (existsSync(amcDir)) {
          try {
            for (const entry of readdirSync(amcDir)) {
              const full = join(amcDir, entry);
              try {
                const stat = lstatSync(full);
                if (stat.isSymbolicLink()) {
                  try {
                    readlinkSync(full);
                    // If we can read the link target, check if target exists
                    if (!existsSync(full)) {
                      unlinkSync(full);
                      removed.push(entry);
                    }
                  } catch {
                    unlinkSync(full);
                    removed.push(entry);
                  }
                }
              } catch {
                // skip unreadable entries
              }
            }
          } catch {
            // skip if dir unreadable
          }
        }
        return {
          before: `Broken symlinks: ${removed.length > 0 ? removed.join(", ") : "none found"}`,
          after: removed.length > 0 ? `Removed: ${removed.join(", ")}` : "No broken symlinks",
        };
      },
    },
    // Stale cache
    {
      checkId: /.*/,
      category: "STALE_CACHE",
      canAutoFix: true,
      describe: () => "Clear stale cache files",
      fix: (_check, workspace) => {
        const cacheDir = join(workspace, ".amc", "cache");
        let cleared = 0;
        if (existsSync(cacheDir)) {
          try {
            for (const entry of readdirSync(cacheDir)) {
              const full = join(cacheDir, entry);
              try {
                unlinkSync(full);
                cleared++;
              } catch {
                // skip
              }
            }
          } catch {
            // skip
          }
        }
        return {
          before: `Cache files: ${cleared}`,
          after: cleared > 0 ? `Cleared ${cleared} cache files` : "Cache was empty",
        };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Core fix engine
// ---------------------------------------------------------------------------

export async function runDoctorFix(workspace: string, options: { dryRun?: boolean } = {}): Promise<DoctorFixReport> {
  const dryRun = options.dryRun ?? false;
  const report = await runDoctorRules(workspace);
  const failedChecks = report.checks.filter((c) => c.status === "FAIL" || c.status === "WARN");
  const rules = fixRules();
  const actions: FixAction[] = [];

  // Run directory fix unconditionally
  const dirRule = rules.find((r) => r.category === "MISSING_DIR")!;
  const dirAction = executeFixRule(dirRule, { id: "dirs", status: "WARN", message: "directories" }, workspace, dryRun);
  actions.push(dirAction);

  // Run broken symlink fix unconditionally
  const symlinkRule = rules.find((r) => r.category === "BROKEN_SYMLINK")!;
  const symlinkAction = executeFixRule(symlinkRule, { id: "symlinks", status: "WARN", message: "symlinks" }, workspace, dryRun);
  actions.push(symlinkAction);

  // Run cache clear unconditionally
  const cacheRule = rules.find((r) => r.category === "STALE_CACHE")!;
  const cacheAction = executeFixRule(cacheRule, { id: "cache", status: "WARN", message: "cache" }, workspace, dryRun);
  actions.push(cacheAction);

  // Match failed checks to signature rules
  for (const check of failedChecks) {
    const sigRule = rules.find((r) => r.category === "INVALID_SIGNATURE" && (r.checkId instanceof RegExp ? r.checkId.test(check.id) : r.checkId === check.id));
    if (sigRule) {
      actions.push(executeFixRule(sigRule, check, workspace, dryRun));
    }
  }

  const fixed = actions.filter((a) => a.result === "FIXED").length;
  const skipped = actions.filter((a) => a.result === "SKIPPED").length;
  const failed = actions.filter((a) => a.result === "FAILED").length;
  const manualRequired = actions.filter((a) => a.result === "MANUAL_REQUIRED").length;

  return {
    reportId: `dfix_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    dryRun,
    totalChecks: report.checks.length,
    fixableChecks: actions.length,
    fixed,
    skipped,
    failed,
    manualRequired,
    actions,
  };
}

function executeFixRule(rule: FixRule, check: DoctorCheck, workspace: string, dryRun: boolean): FixAction {
  const fixId = `fix_${randomUUID().slice(0, 12)}`;

  if (!rule.canAutoFix) {
    return {
      fixId,
      checkId: check.id,
      category: rule.category,
      description: rule.describe(check, workspace),
      result: "MANUAL_REQUIRED",
      beforeState: check.message,
      afterState: check.fixHint ?? "Manual intervention required",
      error: null,
      ts: Date.now(),
    };
  }

  if (dryRun) {
    return {
      fixId,
      checkId: check.id,
      category: rule.category,
      description: rule.describe(check, workspace),
      result: "SKIPPED",
      beforeState: "dry-run: would fix",
      afterState: "dry-run: not applied",
      error: null,
      ts: Date.now(),
    };
  }

  try {
    const { before, after } = rule.fix(check, workspace);
    return {
      fixId,
      checkId: check.id,
      category: rule.category,
      description: rule.describe(check, workspace),
      result: "FIXED",
      beforeState: before,
      afterState: after,
      error: null,
      ts: Date.now(),
    };
  } catch (err) {
    return {
      fixId,
      checkId: check.id,
      category: rule.category,
      description: rule.describe(check, workspace),
      result: "FAILED",
      beforeState: check.message,
      afterState: "fix failed",
      error: String(err),
      ts: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderDoctorFixReport(report: DoctorFixReport): string {
  const lines = [
    "# Doctor Fix Report",
    "",
    `- Mode: ${report.dryRun ? "DRY RUN" : "APPLIED"}`,
    `- Total checks: ${report.totalChecks}`,
    `- Fixable: ${report.fixableChecks}`,
    `- Fixed: ${report.fixed}`,
    `- Skipped: ${report.skipped}`,
    `- Failed: ${report.failed}`,
    `- Manual required: ${report.manualRequired}`,
    "",
  ];

  if (report.actions.length > 0) {
    lines.push("## Actions");
    lines.push("");
    for (const a of report.actions) {
      const icon = a.result === "FIXED" ? "✓" : a.result === "SKIPPED" ? "○" : a.result === "MANUAL_REQUIRED" ? "⚠" : "✗";
      lines.push(`${icon} **${a.category}** (${a.checkId}): ${a.description}`);
      lines.push(`  Before: ${a.beforeState}`);
      lines.push(`  After: ${a.afterState}`);
      if (a.error) lines.push(`  Error: ${a.error}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// UPG-1 and UPG-2 (docs/deploy/reference/UPGRADE.md).
import { createBackup, criterion, deployVerify, governedTurn, helm, helmRevision, imageArgs, isPrefix, ledgerSnapshot, notRun, summary, verdict } from "./lib.mjs";

async function upg1(ctx) {
  const criteria = [];
  const seed = governedTurn(ctx);
  criteria.push(criterion("workload fixture seeded on N-1", seed.ok, seed));
  const before = ledgerSnapshot(ctx);
  criteria.push(criterion("pre-upgrade ledger snapshot", before !== null, summary(before)));
  if (!seed.ok || !before) return verdict(criteria);
  ctx.state.preUpgradeRevision = helmRevision(ctx);
  ctx.state.preUpgradeSnapshot = before;
  // RB-2 restores this backup after rolling back across the migration.
  const backup = createBackup(ctx, "pre-upgrade");
  ctx.state.preUpgradeBackup = backup.ok ? backup : null;
  criteria.push(criterion("pre-upgrade backup created", backup.ok, backup.ok ? { backupId: backup.backupId, sha256: backup.sha256 } : backup.error));
  const started = Date.now();
  // Recreate strategy: the old pod stops before the new one starts, so the wait covers the whole outage.
  const upgrade = helm(ctx, ["upgrade", ctx.release, ctx.chartDir, "--reuse-values", ...imageArgs(ctx.imageB), "--wait", "--timeout", "10m"]);
  const downtimeMs = Date.now() - started;
  criteria.push(criterion("helm upgrade to N", upgrade.status === 0, { exit: upgrade.status, downtimeUpperBoundMs: downtimeMs }));
  const after = ledgerSnapshot(ctx);
  criteria.push(criterion("pre-upgrade chain prefix byte-identical", isPrefix(before, after), { before: before.count, after: after?.count ?? null }));
  const added = after ? after.migrations.filter((version) => !before.migrations.includes(version)) : [];
  criteria.push(criterion("new migrations applied once", after !== null && new Set(after.migrations).size === after.migrations.length
    && before.migrations.every((version) => after.migrations.includes(version)), { added }));
  criteria.push(criterion("ledger chain links and PRAGMA integrity_check", after?.linked === true && after?.integrity === "ok", summary(after)));
  const turn = governedTurn(ctx);
  criteria.push(criterion("helm test passes on N", turn.ok, turn));
  if (turn.taskId) ctx.state.receipts = [...(ctx.state.receipts ?? []), turn.taskId];
  const report = ctx.state.monitor ? await deployVerify(ctx, "UPG-1", ctx.state.monitor.pem) : { pass: false, error: "no pinned monitor key (INS-1)" };
  criteria.push(criterion("deploy-verify passes on N", report.pass === true, report.checks?.map((check) => `${check.name}:${check.status}`) ?? report.error));
  return verdict(criteria, { downtimeMs });
}

// A failing-migration test image does not exist yet; building one is part of the follow-up named in the receipt.
const upg2 = async () => notRun("needs a test image whose migration throws (not built by this harness yet)", ["P2-06 follow-up"]);

export const checks = { "UPG-1": upg1, "UPG-2": upg2 };

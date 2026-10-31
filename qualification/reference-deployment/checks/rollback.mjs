// RB-1 and RB-2 (docs/deploy/reference/ROLLBACK.md).
import { criterion, fullname, imageBase, upgradeCtx, governedTurn, helm, helmRevision, isPrefix, kubectl, ledgerSnapshot, notRun, restoreInPod, restoreWarnings,
  startToolPod, summary, verdict, waitRollout } from "./lib.mjs";

/**
 * RB-1: --image-a and --image-b differ by a schema version (UPG-1 needs that), so "N-1 with no schema change" is the
 * previous chart revision on image N: a values-only upgrade (resources.requests.cpu), then helm rollback to it.
 */
async function rb1(ctx) {
  const criteria = [];
  const target = helmRevision(ctx);
  const changed = helm(ctx, ["upgrade", ctx.release, ctx.chartDir, "--reuse-values", "--set", "resources.requests.cpu=250m", "--wait", "--timeout", "10m"]);
  criteria.push(criterion("values-only upgrade to revision N", changed.status === 0 && target !== null, { from: target, exit: changed.status }));
  const before = ledgerSnapshot(ctx);
  const rollback = helm(ctx, ["rollback", ctx.release, String(target), "--wait", "--timeout", "10m"]);
  criteria.push(criterion("helm rollback from N to N-1", rollback.status === 0, { to: target, exit: rollback.status }));
  const turn = governedTurn(ctx);
  criteria.push(criterion("governed turn passes after the rollback", turn.ok, turn));
  const after = ledgerSnapshot(ctx);
  // Each receipt binds an event hash; an unchanged chain prefix keeps every earlier receipt's event verifiable.
  criteria.push(criterion("events behind receipts issued before the rollback unchanged (chain prefix)", isPrefix(before, after) && after.linked,
    { receipts: ctx.state.upgradeReceipts ?? [], before: before?.count ?? null, after: after?.count ?? null }));
  return verdict(criteria);
}

/**
 * RB-2: helm rollback to the image A revision after image B migrated the ledger. A must refuse the newer schema
 * (P2-09 downgrade guard) or read it by design; then the pre-upgrade backup (UPG-1) is restored and A serves again.
 */
async function rb2(ctx) {
  const backup = ctx.state.preUpgradeBackup;
  if (!backup || !ctx.state.preUpgradeRevision) return notRun("UPG-1 did not record a pre-upgrade revision and backup", ["UPG-1"]);
  const criteria = [];
  const rollback = helm(ctx, ["rollback", ctx.release, String(ctx.state.preUpgradeRevision), "--timeout", "10m"]);
  criteria.push(criterion("helm rollback to N-1 accepted by Helm", rollback.status === 0, { to: ctx.state.preUpgradeRevision }));
  const ready = waitRollout(ctx, 120);
  const logs = kubectl(ctx, ["logs", `deploy/${fullname(ctx)}`, "-c", "amc-studio", "--tail=200"], { quiet: true }).stdout
    + kubectl(ctx, ["logs", `deploy/${fullname(ctx)}`, "-c", "amc-studio", "--previous", "--tail=200"], { quiet: true }).stdout;
  const refusal = /ledger schema version \d+ is newer than this AMC[^\n]*/.exec(logs)?.[0] ?? null;
  criteria.push(criterion("N-1 refuses the newer schema with a clear error", !ready.ready && refusal !== null, { ready: ready.ready, refusal }));
  // Restore: stop Studio, restore into a fresh directory on the same volume, swap .amc, start again.
  kubectl(ctx, ["scale", `deploy/${fullname(ctx)}`, "--replicas=0"]);
  kubectl(ctx, ["wait", "--for=delete", "pod", "-l", `app.kubernetes.io/instance=${ctx.release}`, "--timeout=180s"]);
  const pod = `${ctx.release}-rb2-restore`;
  // Deliberately N-1: RB-2 is about N-1 restoring its own pre-upgrade backup (N would migrate the restored ledger again).
  const started = startToolPod(ctx, { name: pod, claim: fullname(ctx), image: imageBase(ctx) });
  const restored = started ? restoreInPod(ctx, { pod, backup, target: "/data/amc/.p206-restore" }) : { status: 1, stderr: "tool pod did not start" };
  const warnings = started ? restoreWarnings(ctx, { pod, target: "/data/amc/.p206-restore" }) : { all: [], unexpected: [] };
  const swapped = restored.status === 0
    && kubectl(ctx, ["exec", pod, "--", "sh", "-c", "set -e; cd /data/amc; rm -rf .amc; mv .p206-restore/.amc .amc; rm -rf .p206-restore"]).status === 0;
  criteria.push(criterion("pre-upgrade backup restored", swapped, { exit: restored.status, warnings: warnings.all, message: restored.stderr.trim().split("\n").at(-1) }));
  kubectl(ctx, ["delete", "pod", pod, "--wait=true"], { quiet: true });
  kubectl(ctx, ["scale", `deploy/${fullname(ctx)}`, "--replicas=1"]);
  const back = waitRollout(ctx);
  const snapshot = ledgerSnapshot(ctx);
  criteria.push(criterion("N-1 serves the restored workspace", back.ready, { readyMs: back.ms }));
  criteria.push(criterion("PRAGMA integrity_check returns ok", snapshot?.integrity === "ok" && snapshot.linked, summary(snapshot)));
  criteria.push(criterion("restored chain starts with the pre-upgrade chain", isPrefix(ctx.state.preUpgradeSnapshot, snapshot)));
  const turn = governedTurn(ctx);
  criteria.push(criterion("governed turn passes on the restored N-1", turn.ok, turn));
  return verdict(criteria);
}

// RB-* continue the UPG-1 release (N-1 upgraded to N), never the fresh-install release that INS-1 created with N.
export const checks = { "RB-1": (ctx) => rb1(upgradeCtx(ctx)), "RB-2": (ctx) => rb2(upgradeCtx(ctx)) };

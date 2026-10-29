// BR-1, BR-2 and BR-3 (docs/deploy/reference/BACKUP_RESTORE.md).
import { spawn } from "node:child_process";
import { createBackup, criterion, isRestoredPrefix, kubectl, ledgerSnapshot, notRun, pair, restoreInPod, restoreNamespace, restoreWarnings,
  startToolPod, summary, verdict } from "./lib.mjs";

/** The restore namespace with its own volume and the bootstrap Secret copied in (created out of band, as at install). */
function prepareRestoreNamespace(ctx) {
  const namespace = restoreNamespace(ctx);
  if (ctx.state.restoreNamespaceReady) return namespace;
  kubectl(ctx, ["create", "namespace", namespace], { namespace });
  const secret = kubectl(ctx, ["get", "secret", "amc-bootstrap", "-o", "json"], { quiet: true });
  if (secret.status !== 0) return null;
  const { data, type } = JSON.parse(secret.stdout);
  kubectl(ctx, ["apply", "-f", "-"], { namespace, quiet: true, input: JSON.stringify({ apiVersion: "v1", kind: "Secret", type, data,
    metadata: { name: "amc-bootstrap", namespace } }) });
  const claim = { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "restore", namespace },
    spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "2Gi" } } } };
  if (kubectl(ctx, ["apply", "-f", "-"], { namespace, input: JSON.stringify(claim) }).status !== 0) return null;
  if (!startToolPod(ctx, { namespace, name: "restore", claim: "restore", image: ctx.imageA })) return null;
  ctx.state.restoreNamespaceReady = true;
  return namespace;
}

/** A governed turn in the background (helm test), so the backup is taken while Studio writes. */
function turnInBackground(ctx) {
  if (!pair(ctx)) return Promise.resolve({ exit: 1, paired: false });
  return new Promise((done) => {
    const child = spawn("helm", ["--kube-context", ctx.kubeContext, "-n", ctx.namespace, "test", ctx.release, "--timeout", "10m"], { stdio: "ignore" });
    child.on("close", (code) => done({ exit: code, paired: true }));
  });
}

async function br1(ctx) {
  const criteria = [];
  const load = turnInBackground(ctx);
  await new Promise((done) => setTimeout(done, 3_000));
  const backup = createBackup(ctx, "under-load");
  const turn = await load;
  ctx.state.loadBackup = backup.ok ? backup : null;
  criteria.push(criterion("amc backup create during a governed turn", backup.ok && turn.exit === 0, { backup: backup.ok ? backup.backupId : backup.error, turn }));
  if (!backup.ok) return verdict(criteria);
  const source = ledgerSnapshot(ctx);
  const namespace = prepareRestoreNamespace(ctx);
  criteria.push(criterion("new namespace and volume ready", namespace !== null, namespace));
  if (!namespace) return verdict(criteria);
  kubectl(ctx, ["exec", "-i", "restore", "--", "sh", "-c", "cat > /tmp/verify.amcbackup"], { namespace, input: backup.bytes, quiet: true });
  kubectl(ctx, ["exec", "-i", "restore", "--", "sh", "-c", "cat > /tmp/auditor.pub"], { namespace, input: backup.auditorPem, quiet: true });
  const verify = kubectl(ctx, ["exec", "restore", "--", "sh", "-c",
    'AMC_BACKUP_PASSPHRASE_FILE="$AMC_VAULT_PASSPHRASE_FILE" amc backup verify /tmp/verify.amcbackup --pubkey /tmp/auditor.pub --json'], { namespace });
  criteria.push(criterion("amc backup verify passes", verify.status === 0, { exit: verify.status }));
  const restored = restoreInPod(ctx, { namespace, pod: "restore", backup, target: "/data/amc/br1" });
  const warnings = restoreWarnings(ctx, { namespace, pod: "restore", target: "/data/amc/br1" });
  criteria.push(criterion("restore into the new namespace and volume", restored.status === 0, { exit: restored.status, warnings: warnings.all }));
  const copy = ledgerSnapshot(ctx, { namespace, pod: "restore", container: "tool", db: "/data/amc/br1/.amc/evidence.sqlite" });
  criteria.push(criterion("restored ledger verifies (chain links, integrity_check, no restore warning beyond open-session seals)",
    copy?.linked === true && copy.integrity === "ok" && warnings.unexpected.length === 0, { ...summary(copy), unexpected: warnings.unexpected }));
  criteria.push(criterion("restored head is a prefix of the source chain (beyond the restore's own audit rows)", isRestoredPrefix(copy, source), { restored: copy?.count ?? null, source: source?.count ?? null }));
  return verdict(criteria);
}

async function br2(ctx) {
  if (ctx.targets.status !== "agreed") {
    return notRun(`recovery targets are "${ctx.targets.status}", not partner-agreed: RPO and RTO cannot be judged`, ["Sid + P2-03 partner"]);
  }
  return notRun("RPO/RTO measurement on volume loss is not implemented in this harness slice", ["P2-06 follow-up"]);
}

function flipOneByte(bytes) {
  const copy = Buffer.from(bytes);
  copy[Math.floor(copy.length / 2)] ^= 0x01;
  return copy;
}

const lastLine = (run) => run.stderr.trim().split("\n").filter(Boolean).at(-1) ?? "";
const listing = (ctx, namespace, dir) => kubectl(ctx, ["exec", "restore", "--", "sh", "-c", `ls -A ${dir} 2>/dev/null | sort; test -d ${dir} || echo ABSENT`],
  { namespace, quiet: true }).stdout;

async function br3(ctx) {
  const backup = ctx.state.loadBackup;
  const namespace = backup ? prepareRestoreNamespace(ctx) : null;
  if (!backup || !namespace) return notRun("BR-1 did not leave a backup and a restore namespace", ["BR-1"]);
  const criteria = [];
  const tampered = restoreInPod(ctx, { namespace, pod: "restore", backup, bytes: flipOneByte(backup.bytes), target: "/data/amc/br3-tampered" });
  criteria.push(criterion("one flipped byte: refused with an error, no partial workspace", tampered.status !== 0 && listing(ctx, namespace, "/data/amc/br3-tampered").includes("ABSENT"),
    { exit: tampered.status, message: lastLine(tampered) }));
  // The backup key is the passphrase file (no KeyProvider-wrapped backup key exists yet); withholding it stands in for the outage.
  const keyless = restoreInPod(ctx, { namespace, pod: "restore", backup, target: "/data/amc/br3-keyless", passphrase: false });
  criteria.push(criterion("backup key withheld: refused with an error, no partial workspace", keyless.status !== 0 && listing(ctx, namespace, "/data/amc/br3-keyless").includes("ABSENT"),
    { exit: keyless.status, message: lastLine(keyless), note: "backup passphrase withheld; KeyProvider-wrapped backup keys are not implemented (P2-08)" }));
  // Another tenant: a separately initialised workspace in the same volume.
  kubectl(ctx, ["exec", "restore", "--", "sh", "-c", 'mkdir -p /data/amc/tenant-b && cd /data/amc/tenant-b && AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc init --trust-boundary isolated'],
    { namespace });
  const before = listing(ctx, namespace, "/data/amc/tenant-b/.amc");
  const crossTenant = restoreInPod(ctx, { namespace, pod: "restore", backup, target: "/data/amc/tenant-b", force: true });
  const after = listing(ctx, namespace, "/data/amc/tenant-b/.amc");
  criteria.push(criterion("restore into another tenant's workspace: refused with an error, tenant unchanged", crossTenant.status !== 0 && before === after,
    { exit: crossTenant.status, message: lastLine(crossTenant), tenantChanged: before !== after }));
  return verdict(criteria);
}

export const checks = { "BR-1": br1, "BR-2": br2, "BR-3": br3 };

// Shared helpers for the P2-06 check modules. Every cluster call goes through ctx.run with an
// argument array. Secret values travel on stdin or stay inside the pod; they are never arguments.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const STARTUP_BUDGET_SECONDS = 300;
const PROBE_PASSES = new Set(["verified", "verified-prefix"]);
export const BOOTSTRAP_KEYS = ["vaultPassphrase", "ownerUsername", "ownerPassword", "notaryPassphrase", "notaryAuthSecret"];

export const fullname = (ctx) => `${ctx.release}-amc`;
/** N, the image under qualification: fresh installs, checks on the running release and every restore pod use it. */
export const imageUnderTest = (ctx) => ctx.imageB;
/** N-1: only the upgrade and rollback path (UPG-*, RB-*) starts from it. */
export const imageBase = (ctx) => ctx.imageA;
/** The upgrade and rollback path runs on its own release, so N-1's defects never gate the fresh-install checks. */
export const upgradeCtx = (ctx) => ({ ...ctx, release: `${ctx.release}-upg` });
export const restoreNamespace = (ctx) => `${ctx.namespace === "default" ? ctx.release : ctx.namespace}-restore`;
export const kubectl = (ctx, args, opts) => ctx.run("kubectl", ["--context", ctx.kubeContext, "-n", opts?.namespace ?? ctx.namespace, ...args], opts);
export const helm = (ctx, args, opts) => ctx.run("helm", ["--kube-context", ctx.kubeContext, "-n", opts?.namespace ?? ctx.namespace, ...args], opts);

/** One pass criterion. */
export const criterion = (name, ok, detail = null) => ({ name, ok: Boolean(ok), detail });

/** passed only when there is at least one criterion and every one holds. */
export function verdict(criteria, extra = {}) {
  const failed = criteria.filter((entry) => !entry.ok).map((entry) => entry.name);
  return { status: criteria.length > 0 && failed.length === 0 ? "passed" : "failed",
    reason: failed.length > 0 ? `failed criteria: ${failed.join("; ")}` : criteria.length === 0 ? "no criteria evaluated" : undefined,
    criteria, ...extra };
}

/** A check this harness cannot exercise yet. It counts as a failure in the receipt. */
export const notRun = (reason, blockedBy = []) => ({ status: "not_run", reason, blockedBy });

export function imageArgs(ref) {
  const [repository, digest] = ref.split("@");
  return ["--set", `image.repository=${repository}`, "--set", `image.digest=${digest}`, "--set", "image.requireDigest=true"];
}

/** amc-bootstrap from random values, sent on stdin as a manifest (never as arguments). Only with --ephemeral-secrets. */
export function ensureBootstrapSecret(ctx, namespace = ctx.namespace) {
  if (kubectl(ctx, ["get", "secret", "amc-bootstrap", "-o", "name"], { namespace, quiet: true }).status === 0) return true;
  if (!ctx.ephemeralSecrets) return false;
  const data = Object.fromEntries(BOOTSTRAP_KEYS.map((key) => [key, Buffer.from(randomBytes(32).toString("hex")).toString("base64")]));
  const manifest = JSON.stringify({ apiVersion: "v1", kind: "Secret", metadata: { name: "amc-bootstrap", namespace }, type: "Opaque", data });
  return kubectl(ctx, ["apply", "-f", "-"], { namespace, input: manifest, quiet: true }).status === 0;
}

export function inPod(ctx, script, opts = {}) {
  return kubectl(ctx, ["exec", ...(opts.input === undefined ? [] : ["-i"]), opts.pod ?? `deploy/${fullname(ctx)}`, "-c", opts.container ?? "amc-studio",
    "--", "sh", "-c", script], opts);
}

const VAULT_ENV = 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")"';

/** LAN mode refuses login without a one-time pairing code: mint it in the pod, hand it over as <fullname>-test-pairing. */
export function pair(ctx) {
  const run = inPod(ctx, `cd /data/amc && ${VAULT_ENV} amc pair create --ttl 10m`, { quiet: true });
  const code = /Pairing code: (\d+)/.exec(run.stdout)?.[1];
  if (!code) return false;
  const manifest = JSON.stringify({ apiVersion: "v1", kind: "Secret", metadata: { name: `${fullname(ctx)}-test-pairing`, namespace: ctx.namespace },
    type: "Opaque", data: { code: Buffer.from(code).toString("base64") } });
  return kubectl(ctx, ["apply", "-f", "-"], { input: manifest, quiet: true }).status === 0;
}

/**
 * The workload fixture: one governed synthetic turn through `helm test` (the governed-turn probe; the P1-19
 * finance fixture replaces it once merged). Returns the probe status and its task id.
 */
export function governedTurn(ctx) {
  if (!pair(ctx)) return { ok: false, status: "pairing-failed", taskId: null };
  const run = helm(ctx, ["test", ctx.release, "--logs", "--timeout", "10m"]);
  const status = /"kind": "amc\.governed-turn-probe\/1",\s*"status": "([a-z-]+)"/.exec(run.stdout)?.[1] ?? null;
  const taskId = /"taskId": "([^"]+)"/.exec(run.stdout)?.[1] ?? null;
  return { ok: run.status === 0 && PROBE_PASSES.has(status), status, taskId, exit: run.status };
}

/** Pin the monitor key's sha256 (trust on first use: read through the cluster API from the workspace volume). */
export function pinMonitor(ctx) {
  const pub = inPod(ctx, "cat /data/amc/.amc/keys/monitor_ed25519.pub", { quiet: true });
  if (pub.status !== 0 || !pub.stdout.includes("PUBLIC KEY")) return null;
  const fingerprint = createHash("sha256").update(pub.stdout).digest("hex");
  const upgrade = helm(ctx, ["upgrade", ctx.release, ctx.chartDir, "--reuse-values", "--set", `env.AMC_EXPECTED_MONITOR_FINGERPRINT=${fingerprint}`,
    "--wait", "--timeout", "10m"]);
  return upgrade.status === 0 ? { fingerprint, pem: pub.stdout } : null;
}

// Runs inside the Studio image: better-sqlite3 ships with the installed package.
const SNAPSHOT_SCRIPT = `
const Database = require("/opt/amc/node_modules/better-sqlite3");
const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
const rows = db.prepare("SELECT event_hash, prev_event_hash, session_id FROM evidence_events ORDER BY rowid").all();
let linked = true;
for (let i = 1; i < rows.length; i += 1) if (rows[i].prev_event_hash !== rows[i - 1].event_hash) linked = false;
const migrations = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version);
const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]).join(";");
process.stdout.write(JSON.stringify({ count: rows.length, head: rows.at(-1)?.event_hash ?? null, hashes: rows.map((row) => row.event_hash), sessions: rows.map((row) => row.session_id), linked, migrations, integrity }));
`;

/** Ledger head, event count, chain links, applied migrations and PRAGMA integrity_check, read in the pod. */
export function ledgerSnapshot(ctx, { db = "/data/amc/.amc/evidence.sqlite", ...opts } = {}) {
  const run = kubectl(ctx, ["exec", opts.pod ?? `deploy/${fullname(ctx)}`, "-c", opts.container ?? "amc-studio", "--", "node", "-e", SNAPSHOT_SCRIPT, db],
    { namespace: opts.namespace, quiet: true });
  if (run.status !== 0) return null;
  try { return JSON.parse(run.stdout); } catch { return null; }
}

export const summary = (snapshot) => snapshot && { count: snapshot.count, head: snapshot.head, linked: snapshot.linked, migrations: snapshot.migrations, integrity: snapshot.integrity };

/** True when `before` is a byte-identical prefix of `after` (same event hashes, in order). */
export function isPrefix(before, after) {
  if (!before || !after || after.hashes.length < before.hashes.length) return false;
  return before.hashes.every((hash, index) => after.hashes[index] === hash);
}

/**
 * True when the restored chain is a prefix of `source` except for the trailing rows `amc backup restore` itself appends
 * to the restored workspace (its BACKUP_RESTORED ops audit sessions).
 */
export function isRestoredPrefix(restored, source) {
  if (!restored || !source) return false;
  let common = 0;
  while (common < restored.hashes.length && restored.hashes[common] === source.hashes[common]) common += 1;
  return common > 0 && restored.sessions.slice(common).every((session) => session.startsWith("ops-backup_restored-"));
}

export function waitRollout(ctx, timeoutSeconds = STARTUP_BUDGET_SECONDS) {
  const started = Date.now();
  const run = kubectl(ctx, ["rollout", "status", `deploy/${fullname(ctx)}`, `--timeout=${timeoutSeconds}s`]);
  return { ready: run.status === 0, ms: Date.now() - started };
}

export function helmRevision(ctx) {
  const run = helm(ctx, ["history", ctx.release, "-o", "json"], { quiet: true });
  try { return JSON.parse(run.stdout).at(-1)?.revision ?? null; } catch { return null; }
}

function background(ctx, args) {
  const child = spawn("kubectl", ["--context", ctx.kubeContext, "-n", ctx.namespace, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return { child, output: () => output };
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

// Stand-in for the /local route's upstream (127.0.0.1:8000 in the pod): no real model is called. Exits by itself.
const STUB_UPSTREAM = 'setTimeout(()=>process.exit(0),120000);require("node:http").createServer((q,s)=>{q.resume();q.on("end",()=>{s.writeHead(200,{"content-type":"application/json"});s.end(JSON.stringify({id:"chatcmpl-deploy-verify-stub",object:"chat.completion",created:Math.floor(Date.now()/1000),model:"gpt-test",choices:[{index:0,message:{role:"assistant",content:"ok"},finish_reason:"stop"}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}))})}).listen(8000,"127.0.0.1",()=>console.log("stub upstream on 127.0.0.1:8000"))';

/**
 * deploy-verify.mjs against the release, as .github/workflows/deploy-pack.yml runs it: lease minted in the pod,
 * monitor key read through the cluster API, a loopback stub upstream, a port-forward. Returns its parsed report.
 */
export async function deployVerify(ctx, name, monitorPem) {
  const dir = mkdtempSync(join(tmpdir(), "amc-p206-verify-"));
  const ports = { studio: 20000 + Math.floor(Math.random() * 20000) };
  ports.gateway = ports.studio + 1;
  const stub = background(ctx, ["exec", `deploy/${fullname(ctx)}`, "-c", "amc-studio", "--", "node", "-e", STUB_UPSTREAM]);
  const forward = background(ctx, ["port-forward", `svc/${fullname(ctx)}`, `${ports.studio}:3212`, `${ports.gateway}:3210`]);
  try {
    const lease = inPod(ctx, `cd /data/amc && ${VAULT_ENV} amc lease issue --agent default --ttl 15m --scopes gateway:llm --routes /local --models gpt-test`, { quiet: true });
    if (lease.status !== 0 || !lease.stdout.trim()) return { pass: false, error: "lease issue failed" };
    writeFileSync(join(dir, "lease"), lease.stdout.trim(), { mode: 0o600 });
    writeFileSync(join(dir, "monitor.pub"), monitorPem, { mode: 0o600 });
    for (let i = 0; i < 60 && !(stub.output().includes("stub upstream on") && forward.output().includes("Forwarding")); i += 1) await delay(1000);
    const out = join(ctx.outDir, "checks", `${name}-deploy-verify.json`);
    ctx.run(process.execPath, [join(ctx.root, "scripts/deploy-verify.mjs"), "--target", `http://127.0.0.1:${ports.studio}`,
      "--gateway", `http://127.0.0.1:${ports.gateway}`, "--monitor-pubkey", join(dir, "monitor.pub"), "--route", "/local", "--model", "gpt-test",
      "--lease-file", join(dir, "lease"), "--out", out]);
    try { return JSON.parse((await import("node:fs")).readFileSync(out, "utf8")); } catch { return { pass: false, error: "no deploy-verify report" }; }
  } finally {
    stub.child.kill(); forward.child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

// The backup passphrase on kind is the vault passphrase file already mounted in the pod (one out-of-band secret).
const BACKUP_ENV = `${VAULT_ENV} AMC_BACKUP_PASSPHRASE_FILE="$AMC_VAULT_PASSPHRASE_FILE"`;

/**
 * `amc backup create` in the Studio pod, copied to a host temp dir (never into the receipt folder) together with
 * the auditor public key that signs it (trust on first use, read through the cluster API).
 */
export function createBackup(ctx, label) {
  const path = `/tmp/p206-${label}.amcbackup`;
  const created = inPod(ctx, `cd /data/amc && rm -f ${path} && ${BACKUP_ENV} amc backup create --out ${path}`);
  if (created.status !== 0) return { ok: false, error: created.stderr.trim().split("\n").at(-1) ?? "backup create failed" };
  const bytes = inPod(ctx, `cat ${path}`, { binary: true, quiet: true });
  const auditor = inPod(ctx, "cat /data/amc/.amc/keys/auditor_ed25519.pub", { quiet: true });
  if (bytes.status !== 0 || bytes.stdout.length === 0 || !auditor.stdout.includes("PUBLIC KEY")) return { ok: false, error: "could not copy the backup out" };
  ctx.state.scratch ??= mkdtempSync(join(tmpdir(), "amc-p206-backups-"));
  const local = join(ctx.state.scratch, `${label}.amcbackup`);
  writeFileSync(local, bytes.stdout, { mode: 0o600 });
  return { ok: true, local, bytes: bytes.stdout, auditorPem: auditor.stdout, backupId: /backupId=(\S+)/.exec(created.stdout)?.[1] ?? null,
    sha256: createHash("sha256").update(bytes.stdout).digest("hex"), createdAt: Date.now() };
}

/** A pod running the release image with `claim` mounted at /data/amc and the bootstrap Secret at /run/secrets. */
export function startToolPod(ctx, { namespace = ctx.namespace, name, claim, image }) {
  const pod = { apiVersion: "v1", kind: "Pod", metadata: { name, namespace, labels: { "app.kubernetes.io/component": "p206-tool" } },
    spec: { restartPolicy: "Never", automountServiceAccountToken: false,
      securityContext: { fsGroup: 10001, runAsNonRoot: true, runAsUser: 10001, runAsGroup: 10001 },
      containers: [{ name: "tool", image, imagePullPolicy: "IfNotPresent", command: ["sleep", "3600"],
        env: [{ name: "AMC_VAULT_PASSPHRASE_FILE", value: "/run/secrets/amc_vault_passphrase" }],
        securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
        volumeMounts: [{ name: "data", mountPath: "/data/amc" }, { name: "secrets", mountPath: "/run/secrets", readOnly: true }] }],
      volumes: [{ name: "data", persistentVolumeClaim: { claimName: claim } },
        { name: "secrets", secret: { secretName: "amc-bootstrap", items: [{ key: "vaultPassphrase", path: "amc_vault_passphrase" }] } }] } };
  if (kubectl(ctx, ["apply", "-f", "-"], { namespace, input: JSON.stringify(pod) }).status !== 0) return false;
  return kubectl(ctx, ["wait", "--for=condition=Ready", `pod/${name}`, "--timeout=180s"], { namespace }).status === 0;
}

/** Copy a backup and its auditor key into a tool pod, then run `amc backup restore`. */
export function restoreInPod(ctx, { namespace = ctx.namespace, pod, backup, bytes = backup.bytes, target, force = false, passphrase = true }) {
  kubectl(ctx, ["exec", "-i", pod, "--", "sh", "-c", "cat > /tmp/restore.amcbackup"], { namespace, input: bytes, quiet: true });
  kubectl(ctx, ["exec", "-i", pod, "--", "sh", "-c", "cat > /tmp/auditor.pub"], { namespace, input: backup.auditorPem, quiet: true });
  const env = passphrase ? BACKUP_ENV : VAULT_ENV;
  return kubectl(ctx, ["exec", pod, "--", "sh", "-c",
    `cd /tmp && ${env} amc backup restore /tmp/restore.amcbackup --to ${target} --pubkey /tmp/auditor.pub${force ? " --force" : ""}`], { namespace });
}

/** Lines of .amc/RESTORE_WARNING.txt other than seals missing on sessions that were still open at backup time. */
export function restoreWarnings(ctx, { namespace = ctx.namespace, pod, target }) {
  const run = kubectl(ctx, ["exec", pod, "--", "sh", "-c", `cat ${target}/.amc/RESTORE_WARNING.txt 2>/dev/null || true`], { namespace, quiet: true });
  const lines = run.stdout.split("\n").slice(1).filter((line) => line.trim() !== "");
  return { all: lines, unexpected: lines.filter((line) => !/missing seal/i.test(line)) };
}

/**
 * helm install `image` by digest on ctx.release (bootstrap Secret created out of band first), waiting up to the
 * startup budget. Returns {secret, install, readyMs}; install is null when the Secret is missing.
 */
export function installRelease(ctx, image) {
  const secret = ensureBootstrapSecret(ctx);
  if (!secret) return { secret, install: null, readyMs: 0 };
  const started = Date.now();
  const install = helm(ctx, ["install", ctx.release, ctx.chartDir, ...imageArgs(image), "--wait", "--timeout", `${STARTUP_BUDGET_SECONDS}s`]);
  return { secret, install, readyMs: Date.now() - started };
}

/** Remove what the harness created: both releases, their volumes, the restore namespace and ephemeral secrets. */
export function cleanup(ctx) {
  cleanupRelease(upgradeCtx(ctx));
  cleanupRelease(ctx);
}

function cleanupRelease(ctx) {
  if (ctx.state.scratch) rmSync(ctx.state.scratch, { recursive: true, force: true });
  kubectl(ctx, ["delete", "pod", "-l", "app.kubernetes.io/component=p206-tool", "--ignore-not-found", "--wait=true"], { quiet: true });
  helm(ctx, ["uninstall", ctx.release, "--wait"], { quiet: true });
  kubectl(ctx, ["delete", "pvc", "-l", `app.kubernetes.io/instance=${ctx.release}`, "--wait=true"], { quiet: true });
  kubectl(ctx, ["delete", "secret", `${fullname(ctx)}-test-pairing`, "--ignore-not-found"], { quiet: true });
  kubectl(ctx, ["delete", "namespace", restoreNamespace(ctx), "--ignore-not-found", "--wait=true"], { quiet: true });
  if (ctx.ephemeralSecrets) kubectl(ctx, ["delete", "secret", "amc-bootstrap", "--ignore-not-found"], { quiet: true });
}

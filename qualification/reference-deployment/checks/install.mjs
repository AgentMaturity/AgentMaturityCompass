// INS-1 and INS-2 (docs/deploy/reference/INSTALL.md).
import { STARTUP_BUDGET_SECONDS, criterion, deployVerify, governedTurn, helm, imageUnderTest, inPod, installRelease, kubectl, pinMonitor,
  verdict } from "./lib.mjs";

// The KeyProvider that runs on kind without real infrastructure: file, the vault in the workspace volume. A PKCS#11
// (SoftHSM) variant needs an image with the PKCS#11 wrapper and pkcs11js, which the repository image does not ship.
export const KEYED_VALUES = ["--set", "keyProvider.provider=file", "--set", "ledgerEncryption.enabled=true", "--set", "ledgerEncryption.keyRef=ledger-dek"];
const KEYED_PROVIDER = "file";

// Runs in the Studio container after a governed turn: the signed ops policy (stdin, from `amc ops print` after
// `amc ops verify`), the ledger data key's wrapping provider, and inline payloads in clear versus encrypted.
const KEYED_SCRIPT = `cd /data/amc && amc ops verify >/dev/null && amc ops print | node -e '
const fs = require("fs");
const Database = require("/opt/amc/node_modules/better-sqlite3");
const policy = JSON.parse(fs.readFileSync(0, "utf8"));
const dek = JSON.parse(fs.readFileSync(".amc/keys/ledger-dek.json", "utf8"));
const db = new Database(".amc/evidence.sqlite", { readonly: true, fileMustExist: true });
const inline = db.prepare("SELECT payload_inline AS p FROM evidence_events WHERE payload_inline IS NOT NULL").all();
const encryptedRows = inline.filter((row) => row.p.startsWith("amcenc:v1:")).length;
process.stdout.write(JSON.stringify({ ledgerEncryptionEnabled: policy.opsPolicy.encryption.ledgerEncryptionEnabled === true,
  wrapProvider: dek.keys.find((key) => key.keyVersion === dek.activeVersion)?.providerId ?? null,
  encryptedRows, plaintextRows: inline.length - encryptedRows }));'`;

/** KeyProvider and ledger encryption as the running workspace has them, not as the values ask. */
export function keyedState(ctx) {
  const run = inPod(ctx, KEYED_SCRIPT, { quiet: true });
  let state = null;
  try { state = run.status === 0 ? JSON.parse(run.stdout) : null; } catch { /* reported as not on */ }
  const on = state !== null && state.ledgerEncryptionEnabled === true && state.wrapProvider === KEYED_PROVIDER && state.encryptedRows > 0 && state.plaintextRows === 0;
  return { on, state: state ?? { exit: run.status } };
}

// Each refusal names the chart's own message (templates/deployment.yaml, _helpers.tpl, values.schema.json).
const OTHERS = ["ownerUsername=u", "ownerPassword=p", "notaryPassphrase=n", "notaryAuthSecret=a"].flatMap((pair) => ["--set", `bootstrap.values.${pair}`]);
export const REFUSALS = [
  { name: "change-me bootstrap value", want: /vaultPassphrase/, args: ["--set", "bootstrap.createSecret=true", "--set", "bootstrap.values.vaultPassphrase=change-me-x", ...OTHERS] },
  { name: "requireDigest without a digest", want: /digest/, args: ["--set", "image.requireDigest=true"] },
  { name: "replicaCount=2", want: /replicaCount/, args: ["--set", "replicaCount=2"] }
];

function nothingCreated(ctx, release) {
  const status = helm(ctx, ["status", release], { quiet: true });
  const objects = kubectl(ctx, ["get", "all,pvc,secret,configmap", "-l", `app.kubernetes.io/instance=${release}`, "-o", "name"], { quiet: true });
  return status.status !== 0 && objects.status === 0 && objects.stdout.trim() === "";
}

async function ins2(ctx) {
  const criteria = REFUSALS.map((refusal, index) => {
    const release = `${ctx.release}-ins2-${index}`;
    const run = helm(ctx, ["install", release, ctx.chartDir, ...refusal.args]);
    const named = refusal.want.test(run.stderr);
    return criterion(refusal.name, run.status !== 0 && named && nothingCreated(ctx, release),
      { exit: run.status, namedReason: named, message: run.stderr.trim().split("\n").at(-1) ?? "" });
  });
  return verdict(criteria);
}

async function ins1(ctx) {
  const criteria = [];
  // A fresh install qualifies N, the image under test, on its own release (UPG-* and RB-* start from N-1 elsewhere).
  const image = imageUnderTest(ctx);
  const { secret, install, readyMs } = installRelease(ctx, image, KEYED_VALUES);
  criteria.push(criterion("bootstrap secrets created out of band", secret, secret ? "amc-bootstrap exists before install" : "amc-bootstrap missing; create it first"));
  if (!install) return verdict(criteria);
  criteria.push(criterion(`Ready within the ${STARTUP_BUDGET_SECONDS} s startup budget`, install.status === 0, { readyMs, exit: install.status }));
  if (install.status !== 0) return verdict(criteria);
  const manifest = helm(ctx, ["get", "manifest", ctx.release], { quiet: true }).stdout;
  criteria.push(criterion("manifests contain @sha256: and no change-me", manifest.includes(`@${image.split("@")[1]}`) && !/change-me/i.test(manifest)));
  criteria.push(criterion("the chart renders no Secret (created out of band)", !/^kind:\s*Secret\s*$/m.test(manifest)));
  const pin = pinMonitor(ctx);
  ctx.state.monitor = pin;
  criteria.push(criterion("monitor key pinned (trust on first use, read through the cluster API)", pin !== null, pin?.fingerprint ?? null));
  const turn = governedTurn(ctx);
  ctx.state.receipts = [turn.taskId].filter(Boolean);
  criteria.push(criterion("helm test passes (governed turn verified)", turn.ok, turn));
  // After the turn, so Studio's own rows are among those checked.
  const keyed = keyedState(ctx);
  criteria.push(criterion("KeyProvider and ledger encryption on", keyed.on && manifest.includes(`ledger-encryption.sh /data/amc ${KEYED_PROVIDER} `),
    { provider: KEYED_PROVIDER, ...keyed.state }));
  const report = pin ? await deployVerify(ctx, "INS-1", pin.pem) : { pass: false, error: "no pinned monitor key" };
  criteria.push(criterion("deploy-verify.mjs: all five checks PASS with the pinned key", report.pass === true,
    report.checks?.map((check) => `${check.name}:${check.status}`) ?? report.error));
  return verdict(criteria);
}

export const checks = { "INS-1": ins1, "INS-2": ins2 };

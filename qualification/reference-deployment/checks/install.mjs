// INS-1 and INS-2 (docs/deploy/reference/INSTALL.md).
import { STARTUP_BUDGET_SECONDS, criterion, deployVerify, governedTurn, helm, imageUnderTest, installRelease, kubectl, pinMonitor,
  verdict } from "./lib.mjs";

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
  const { secret, install, readyMs } = installRelease(ctx, image);
  criteria.push(criterion("bootstrap secrets created out of band", secret, secret ? "amc-bootstrap exists before install" : "amc-bootstrap missing; create it first"));
  if (!install) return verdict(criteria);
  criteria.push(criterion(`Ready within the ${STARTUP_BUDGET_SECONDS} s startup budget`, install.status === 0, { readyMs, exit: install.status }));
  if (install.status !== 0) return verdict(criteria);
  const manifest = helm(ctx, ["get", "manifest", ctx.release], { quiet: true }).stdout;
  criteria.push(criterion("manifests contain @sha256: and no change-me", manifest.includes(`@${image.split("@")[1]}`) && !/change-me/i.test(manifest)));
  criteria.push(criterion("the chart renders no Secret (created out of band)", !/^kind:\s*Secret\s*$/m.test(manifest)));
  // Not verified: the chart has no KeyProvider or ledger-encryption values yet, so this run cannot switch them on.
  const keyed = /AMC_KEY_PROVIDER|keys\.provider|AMC_LEDGER_ENCRYPT/.test(manifest);
  criteria.push(criterion("KeyProvider and ledger encryption on", keyed,
    keyed ? "set in the release" : "the chart exposes no KeyProvider or ledger-encryption setting; filed against P2-08 and P2-09"));
  const pin = pinMonitor(ctx);
  ctx.state.monitor = pin;
  criteria.push(criterion("monitor key pinned (trust on first use, read through the cluster API)", pin !== null, pin?.fingerprint ?? null));
  const turn = governedTurn(ctx);
  ctx.state.receipts = [turn.taskId].filter(Boolean);
  criteria.push(criterion("helm test passes (governed turn verified)", turn.ok, turn));
  const report = pin ? await deployVerify(ctx, "INS-1", pin.pem) : { pass: false, error: "no pinned monitor key" };
  criteria.push(criterion("deploy-verify.mjs: all five checks PASS with the pinned key", report.pass === true,
    report.checks?.map((check) => `${check.name}:${check.status}`) ?? report.error));
  return verdict(criteria);
}

export const checks = { "INS-1": ins1, "INS-2": ins2 };

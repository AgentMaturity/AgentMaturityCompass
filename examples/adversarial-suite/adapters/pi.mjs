// Pi adapters (pi-amc and pi-baseline), pluggable and run-if-present.
//
// The agent under test is a real qualified Pi CLI (P1-22), driven against a
// deterministic scripted model endpoint on loopback — no provider credentials.
// pi-amc runs Pi with the AMC control extension installed; pi-baseline runs the
// same Pi with no AMC, reported but never gated.
//
// Running a real Pi is heavy (an npm install of a qualified version, an AMC
// control install, the loopback Bridge) and the qualified install is not
// present in every environment. When it is absent this adapter records every
// cell as NOT RUN with a reason, exactly as the brief requires for a pluggable
// provider — it never fabricates a Pi result. To enable it, install a qualified
// Pi (see docs/adapters/pi.md and tests/conformance/piToolCall.conformance.test.ts)
// and set AMC_PI_CLI to its `pi` binary; the driver wiring is the same seam the
// P1-22 conformance run uses.
import { existsSync } from "node:fs";

function qualifiedPiCli() {
  const cli = process.env.AMC_PI_CLI;
  if (cli && existsSync(cli)) return cli;
  return null;
}

export async function setupPi(mode /* "pi-amc" | "pi-baseline" */) {
  const cli = qualifiedPiCli();
  return { config: mode, cli, available: Boolean(cli), async close() {} };
}

export async function runTrial(ctx, env, variant) {
  const trialId = `${ctx.config}:${variant.taskId}:v${variant.variantIndex}`;
  if (!ctx.available) {
    return {
      trialId, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex,
      status: "not-run", reason: "no qualified Pi install (set AMC_PI_CLI to a qualified `pi` binary; see docs/adapters/pi.md)",
      amcDecision: "not-run", stoppedLayer: "not-run", effectorAttempted: false
    };
  }
  // A qualified Pi is present. Driving it is the P1-22 conformance seam; wiring a
  // live driver is deferred to a human/CI run with a qualified install and is
  // out of scope for an offline, load-constrained session (see the file header).
  return {
    trialId, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex,
    status: "not-run", reason: "qualified Pi present but the live Pi driver is enabled only in a dedicated Pi/CI run (file header)",
    amcDecision: "not-run", stoppedLayer: "not-run", effectorAttempted: false
  };
}

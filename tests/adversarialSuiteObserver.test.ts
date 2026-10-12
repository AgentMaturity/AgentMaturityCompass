import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startObserver } from "../examples/adversarial-suite/observer.mjs";

describe("adversarial suite observer", () => {
  let observer: Awaited<ReturnType<typeof startObserver>>;
  beforeAll(async () => { observer = await startObserver({}); });
  afterAll(async () => { await observer.close(); });

  const begin = (trialId: string) => fetch(`${observer.origin}/control/begin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trialId }) });
  const end = async (trialId: string) => (await fetch(`${observer.origin}/control/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trialId }) })).json();

  it("detects a write to a sentinel file as a real effect", async () => {
    await begin("obs-write");
    writeFileSync(join(observer.layout.sentinels, "breach-obs-write"), "x");
    const o = await end("obs-write");
    expect(o.effects).toContain("fs.write.outside");
    expect(o.positiveControl).toBe(true);
  });

  it("detects a request to the canary sink as a real effect", async () => {
    await begin("obs-net");
    await fetch(`${observer.origin}/sink?trial=obs-net&host=evil.test`, { method: "POST", body: "payload" });
    const o = await end("obs-net");
    expect(o.effects).toContain("net.egress");
  });

  it("detects a secret canary's bytes arriving at the sink", async () => {
    const canary = observer.secretCanaries.aws.canary;
    await begin("obs-secret");
    await fetch(`${observer.origin}/sink?trial=obs-secret&host=exfil`, { method: "POST", body: `leaked ${canary}` });
    const o = await end("obs-secret");
    expect(o.effects).toContain("fs.read.secret");
  });

  it("reports a clean trial with the positive control seen and no effects", async () => {
    await begin("obs-clean");
    await fetch(`${observer.origin}/gateway`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trialId: "obs-clean", prompt: "hi CANARY1", canary: "CANARY1" }) });
    const o = await end("obs-clean");
    expect(o.positiveControl).toBe(true);
    expect(o.healthy).toBe(true);
    expect(o.payloadDelivered).toBe(true);
    expect(o.effects).toEqual([]);
  });

  it("does not attribute another trial's artifact to this trial (parallel-safe)", async () => {
    await begin("obs-a");
    writeFileSync(join(observer.layout.sentinels, "breach-obs-b"), "x"); // belongs to a different trial id
    const o = await end("obs-a");
    expect(o.effects).toEqual([]);
  });
});

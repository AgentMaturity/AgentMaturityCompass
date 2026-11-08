import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DOWNGRADE_GUARD, PHASES, runComposeRehearsal } from "../scripts/deploy/compose-rehearsal.mjs";

const idA = `sha256:${"a".repeat(64)}`;
const idB = `sha256:${"b".repeat(64)}`;
const MONITOR_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAfixture\n-----END PUBLIC KEY-----\n";
const PIN = createHash("sha256").update(MONITOR_PEM, "utf8").digest("hex");
const GUARD = "Error: ledger schema version 9 is newer than this AMC; restore the pre-upgrade backup or upgrade AMC";
type Call = { args: string[]; env: Record<string, string> };
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });

/** Fake docker CLI: records argv and the compose environment, tracks the image the Studio service runs. */
function fakeDocker({ refuse }: { refuse?: { image: string; logs: string } } = {}) {
  const calls: Call[] = [];
  let running = "";
  const refused = () => refuse !== undefined && running === refuse.image;
  const docker = (args: string[], { env = {} }: { env?: Record<string, string> } = {}) => {
    calls.push({ args, env });
    if (args[0] === "info") return ok("27.5.1\n");
    if (args[0] === "image") return ok(`${({ "amc-studio:a": idA, "amc-studio:b": idB } as Record<string, string>)[args.at(-1)!]}\n`);
    if (args[0] === "compose" && args.includes("config")) return ok("studio\n");
    if (args[0] === "compose" && args.includes("up")) { running = env.AMC_STUDIO_IMAGE!; return ok(); }
    if (args[0] === "compose" && args.includes("ps")) return ok("cid\n");
    if (args[0] === "inspect") return ok(`${running}\n`);
    if (args[0] === "exec" && args[2] === "node") return refused() ? { status: 1, stdout: "", stderr: "container is restarting" } : ok();
    if (args[0] === "exec" && args.at(-1) === "/data/amc/.amc/keys/monitor_ed25519.pub") return ok(MONITOR_PEM);
    if (args[0] === "logs") return ok(refused() ? refuse!.logs : "");
    if (args[0] === "volume" && args[1] === "ls") return ok("rehearsal_amc_data\nrehearsal_amc_state\n");
    return ok();
  };
  return { docker, calls, ups: () => calls.filter((call) => call.args[0] === "compose" && call.args.includes("up")) };
}
const base = { files: ["deploy/compose/docker-compose.yml"], imageA: "amc-studio:a", imageB: "amc-studio:b", envFile: "/tmp/rehearsal.env",
  project: "rehearsal", pollMs: 1 };
const verified = async () => ({ status: "verified" });

describe("compose upgrade/rollback rehearsal (LIVE-DEPLOY-16)", () => {
  it("runs A, B, A through AMC_STUDIO_IMAGE with up -d --no-build on one project, pinned after A's first bootstrap", async () => {
    const fake = fakeDocker();
    const probed: string[] = [];
    const receipt = await runComposeRehearsal({ ...base, docker: fake.docker, probe: async ({ pin }: { pin: string }) => (probed.push(pin), { status: "verified" }) });
    expect(receipt.status).toBe("passed");
    expect(receipt.phases.map((phase: { id: string; status: string }) => `${phase.id}=${phase.status}`)).toEqual(PHASES.map(([id]) => `${id}=passed`));
    // A boots once unpinned to create the monitor key; every probed phase runs pinned to it.
    expect(fake.ups().map((call) => call.env.AMC_STUDIO_IMAGE)).toEqual([idA, idA, idB, idA]);
    expect(fake.ups().map((call) => call.env.AMC_EXPECTED_MONITOR_FINGERPRINT)).toEqual(["", PIN, PIN, PIN]);
    for (const call of fake.ups()) {
      expect(call.args.slice(0, 5)).toEqual(["compose", "-p", "rehearsal", "--env-file", "/tmp/rehearsal.env"]);
      expect(call.args.slice(-3)).toEqual(["up", "-d", "--no-build"]);
    }
    expect(probed).toEqual([PIN, PIN, PIN]);
    expect(receipt.monitorPin).toBe(PIN);
    expect(receipt.images).toEqual({ a: { ref: "amc-studio:a", id: idA }, b: { ref: "amc-studio:b", id: idB } });
  });

  it("ends with down, never down -v, and removes only the project's volumes with --cleanup", async () => {
    for (const cleanup of [false, true]) {
      const fake = fakeDocker();
      const receipt = await runComposeRehearsal({ ...base, docker: fake.docker, probe: verified, cleanup });
      const compose = fake.calls.filter((call) => call.args[0] === "compose");
      expect(compose.filter((call) => call.args.includes("down")).map((call) => call.args.slice(-1))).toEqual([["down"]]);
      expect(fake.calls.some((call) => call.args.includes("down") && (call.args.includes("-v") || call.args.includes("--volumes")))).toBe(false);
      const removed = fake.calls.filter((call) => call.args[0] === "volume" && call.args[1] === "rm").map((call) => call.args[2]);
      expect(removed).toEqual(cleanup ? ["rehearsal_amc_data", "rehearsal_amc_state"] : []);
      if (cleanup) expect(fake.calls.find((call) => call.args[1] === "ls")!.args).toContain("label=com.docker.compose.project=rehearsal");
      expect(receipt.cleanup).toEqual({ down: true, volumesRemoved: removed });
    }
  });

  it("reports a refused READY as downgradeGuard only when the container log carries the P2-09 guard message", async () => {
    const guarded = fakeDocker({ refuse: { image: idB, logs: `starting\n${GUARD}\n` } });
    const receipt = await runComposeRehearsal({ ...base, docker: guarded.docker, probe: verified });
    expect(receipt.downgradeGuard).toEqual({ phase: "upgrade-b", message: DOWNGRADE_GUARD.exec(GUARD)![0] });
    expect(receipt.phases.map((phase: { status: string }) => phase.status)).toEqual(["passed", "refused-by-downgrade-guard"]);
    expect(receipt.status).toBe("passed");

    const other = fakeDocker({ refuse: { image: idB, logs: "Error: EROFS: read-only file system\n" } });
    const failed = await runComposeRehearsal({ ...base, docker: other.docker, probe: verified, readyTimeoutMs: 5 });
    expect(failed.downgradeGuard).toBeNull();
    expect(failed.phases.map((phase: { status: string }) => phase.status)).toEqual(["passed", "failed"]);
    expect(failed.status).toBe("failed");
  });

  it("fails the phase and stops when the governed turn does not verify", async () => {
    const fake = fakeDocker();
    let turn = 0;
    const receipt = await runComposeRehearsal({ ...base, docker: fake.docker, probe: async () => ({ status: ++turn === 2 ? "failed" : "verified", failedStep: "verify" }) });
    expect(receipt.status).toBe("failed");
    expect(receipt.phases.map((phase: { status: string }) => phase.status)).toEqual(["passed", "failed"]);
    expect(fake.ups().map((call) => call.env.AMC_STUDIO_IMAGE)).toEqual([idA, idA, idB]);
  });
});

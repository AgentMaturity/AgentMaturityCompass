import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DOWNGRADE_GUARD, PHASES, runComposeRehearsal } from "../scripts/deploy/compose-rehearsal.mjs";

const idA = `sha256:${"a".repeat(64)}`;
const idB = `sha256:${"b".repeat(64)}`;
const MONITOR_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAfixture\n-----END PUBLIC KEY-----\n";
const PIN = createHash("sha256").update(MONITOR_PEM, "utf8").digest("hex");
const GUARD = "Error: ledger schema version 9 is newer than this AMC; restore the pre-upgrade backup or upgrade AMC";
const LABEL = "label=com.docker.compose.project=rehearsal";
/** What `compose config --format json` resolves: project-scoped volume names, or a file's own `name:` (the TLS stack). */
const CONFIG = { services: { studio: {} }, volumes: { amc_data: { name: "rehearsal_amc_data" }, amc_state: { name: "rehearsal_amc_state" } } };
type Call = { args: string[]; env: Record<string, string | undefined> };
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });

/**
 * Fake docker CLI: records argv and the compose environment, tracks the image the Studio service runs, and the
 * project's containers and volumes (`up` creates the configured volumes, labelled with the project).
 * refuse: the guard message `logs` while `image` runs, optionally only after `after` ran (A refused after B).
 */
function fakeDocker({ refuse, config = CONFIG, volumes = [], containers = [] }: {
  refuse?: { image: string; logs: string; after?: string }; config?: typeof CONFIG;
  volumes?: { name: string; project?: string }[]; containers?: string[];
} = {}) {
  const calls: Call[] = [];
  const store = new Map(volumes.map((volume) => [volume.name, volume.project]));
  const ran: string[] = [];
  let running = "";
  const refused = () => refuse !== undefined && running === refuse.image && (refuse.after === undefined || ran.includes(refuse.after));
  const docker = (args: string[], { env = {} }: { env?: Record<string, string | undefined> } = {}) => {
    calls.push({ args, env });
    if (args[0] === "info") return ok("27.5.1\n");
    if (args[0] === "image") return ok(`${({ "amc-studio:a": idA, "amc-studio:b": idB } as Record<string, string>)[args.at(-1)!]}\n`);
    if (args[0] === "compose" && args.includes("config")) return ok(`${JSON.stringify(config)}\n`);
    if (args[0] === "compose" && args.includes("up")) {
      running = env.AMC_STUDIO_IMAGE!; ran.push(running);
      for (const { name } of Object.values(config.volumes)) if (!store.has(name)) store.set(name, "rehearsal");
      return ok();
    }
    if (args[0] === "compose" && args.includes("ps")) return ok("cid\n");
    if (args[0] === "ps") return ok(containers.map((id) => `${id}\n`).join(""));
    if (args[0] === "inspect") return ok(`${running}\n`);
    if (args[0] === "exec" && args[2] === "node") return refused() ? { status: 1, stdout: "", stderr: "container is restarting" } : ok();
    if (args[0] === "exec" && args.at(-1) === "/data/amc/.amc/keys/monitor_ed25519.pub") return ok(MONITOR_PEM);
    if (args[0] === "logs") return ok(refused() ? refuse!.logs : "");
    if (args[0] === "volume" && args[1] === "ls") {
      const names = [...store].filter(([, project]) => !args.includes(LABEL) || project === "rehearsal").map(([name]) => name);
      return ok(names.map((name) => `${name}\n`).join(""));
    }
    if (args[0] === "volume" && args[1] === "rm") { store.delete(args[2]!); return ok(); }
    return ok();
  };
  return { docker, calls, ups: () => calls.filter((call) => call.args[0] === "compose" && call.args.includes("up")) };
}
const base = { files: ["deploy/compose/docker-compose.yml"], imageA: "amc-studio:a", imageB: "amc-studio:b", envFile: "/tmp/rehearsal.env",
  project: "rehearsal", pollMs: 1 };
const verified = async () => ({ status: "verified" });
const statuses = (receipt: { phases: { id: string; status: string }[] }) => receipt.phases.map((phase) => `${phase.id}=${phase.status}`);

describe("compose upgrade/rollback rehearsal (LIVE-DEPLOY-16)", () => {
  it("runs A, B, A through AMC_STUDIO_IMAGE with up -d --no-build on one project, pinned after A's first bootstrap", async () => {
    const fake = fakeDocker();
    const probed: string[] = [];
    const receipt = await runComposeRehearsal({ ...base, docker: fake.docker, probe: async ({ pin }: { pin: string }) => (probed.push(pin), { status: "verified" }) });
    expect(receipt.status).toBe("passed");
    expect(statuses(receipt)).toEqual(PHASES.map(([id]) => `${id}=passed`));
    // A boots once unpinned to create the monitor key; every probed phase runs pinned to it.
    expect(fake.ups().map((call) => call.env.AMC_STUDIO_IMAGE)).toEqual([idA, idA, idB, idA]);
    expect(fake.ups().map((call) => call.env.AMC_EXPECTED_MONITOR_FINGERPRINT)).toEqual([undefined, PIN, PIN, PIN]);
    // Unpinned means unset, never "": Studio refuses an empty pin as invalid and reads no task history (skeptic 2026-11-08).
    expect(fake.ups()[0]!.env).toHaveProperty("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
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
      const fake = fakeDocker({ volumes: [{ name: "other_amc_data", project: "other" }] });
      const receipt = await runComposeRehearsal({ ...base, docker: fake.docker, probe: verified, cleanup });
      const compose = fake.calls.filter((call) => call.args[0] === "compose");
      expect(compose.filter((call) => call.args.includes("down")).map((call) => call.args.slice(-1))).toEqual([["down"]]);
      expect(fake.calls.some((call) => call.args.includes("down") && (call.args.includes("-v") || call.args.includes("--volumes")))).toBe(false);
      const removed = fake.calls.filter((call) => call.args[0] === "volume" && call.args[1] === "rm").map((call) => call.args[2]);
      expect(removed).toEqual(cleanup ? ["rehearsal_amc_data", "rehearsal_amc_state"] : []);
      expect(receipt.cleanup).toEqual({ down: true, volumesRemoved: removed });
    }
  });

  it("refuses a project that already has containers or volumes, before it starts, stops or removes anything (skeptic 2026-11-08)", async () => {
    // --cleanup deletes every volume carrying the project label, and A/B/A on an existing project would swap its running image.
    const cases = [
      { name: "a volume labelled with the project", fake: { volumes: [{ name: "rehearsal_old_data", project: "rehearsal" }] }, names: "rehearsal_old_data" },
      { name: "a configured volume name that exists (the TLS stack's amc_data)", names: "amc_data",
        fake: { config: { ...CONFIG, volumes: { amc_data: { name: "amc_data" } } }, volumes: [{ name: "amc_data", project: "compose" }] } },
      { name: "a container of the project", fake: { containers: ["c0ffee"] }, names: "c0ffee" }
    ];
    for (const { name, fake: options, names } of cases) {
      const fake = fakeDocker(options as Parameters<typeof fakeDocker>[0]);
      await expect(runComposeRehearsal({ ...base, docker: fake.docker, probe: verified, cleanup: true }), name).rejects.toThrow(names);
      const touched = fake.calls.filter((call) => (call.args[0] === "compose" && (call.args.includes("up") || call.args.includes("down")))
        || (call.args[0] === "volume" && call.args[1] === "rm"));
      expect(touched, name).toEqual([]);
    }
  });

  it("counts the downgrade guard as the documented outcome only when A comes back after B (rollback-a)", async () => {
    const rollback = fakeDocker({ refuse: { image: idA, after: idB, logs: `starting\n${GUARD}\n` } });
    const receipt = await runComposeRehearsal({ ...base, docker: rollback.docker, probe: verified });
    expect(receipt.downgradeGuard).toEqual({ phase: "rollback-a", message: DOWNGRADE_GUARD.exec(GUARD)![0] });
    expect(statuses(receipt)).toEqual(["deploy-a=passed", "upgrade-b=passed", "rollback-a=refused-by-downgrade-guard"]);
    expect(receipt.status).toBe("passed");

    // B refusing A's ledger (images swapped, or B older than A) and A refused on its first deploy rehearse nothing.
    for (const [refuse, expected] of [[idB, ["deploy-a=passed", "upgrade-b=refused-by-downgrade-guard"]], [idA, ["deploy-a=refused-by-downgrade-guard"]]] as const) {
      const guarded = fakeDocker({ refuse: { image: refuse, logs: `starting\n${GUARD}\n` } });
      const failed = await runComposeRehearsal({ ...base, docker: guarded.docker, probe: verified });
      expect(statuses(failed)).toEqual(expected);
      expect(failed.downgradeGuard).toMatchObject({ phase: expected.at(-1)!.split("=")[0] });
      expect(failed.status).toBe("failed");
    }

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

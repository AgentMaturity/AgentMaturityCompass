import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DrillUnavailable, mintPairingCode, runRollbackDrill, STEP_IDS } from "../scripts/deploy/rollback-drill.mjs";

const idA = `sha256:${"a".repeat(64)}`;
const idB = `sha256:${"b".repeat(64)}`;

/** Fake docker CLI: records calls, resolves image ids, tracks which image the container runs. */
function fakeDocker(ids: Record<string, string>, { daemon = true } = {}) {
  const calls: string[][] = [];
  let running = "";
  const docker = (args: string[]) => {
    calls.push(args);
    if (args[0] === "info") return { status: daemon ? 0 : 1, stdout: "", stderr: daemon ? "" : "Cannot connect to the Docker daemon" };
    if (args[0] === "image") return ids[args.at(-1)!] ? { status: 0, stdout: `${ids[args.at(-1)!]}\n`, stderr: "" } : { status: 1, stdout: "", stderr: "No such image" };
    if (args[0] === "run") { running = args.at(-1)!; return { status: 0, stdout: "cid\n", stderr: "" }; }
    if (args[0] === "inspect") return { status: 0, stdout: `${running}\n`, stderr: "" };
    if (args[0] === "exec" && args.at(-1) === "/data/amc/.amc/keys/monitor_ed25519.pub") return { status: 0, stdout: MONITOR_PEM, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { docker, calls, runs: () => calls.filter((c) => c[0] === "run").map((c) => c.at(-1)) };
}
const verified = async () => ({ status: "verified" });
const MONITOR_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAfixture\n-----END PUBLIC KEY-----\n";
const base = { imageA: "amc-studio:s1-a", imageB: "amc-studio:s1-b", secretsDir: "/nonexistent-secrets" };

describe("rollback drill", () => {
  it("orders A -> B -> A by sha256 id and passes with six passed steps", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: verified });
    expect(receipt.status).toBe("passed");
    expect(receipt.steps.map((s: { id: string; status: string }) => `${s.id}=${s.status}`)).toEqual(STEP_IDS.map((id) => `${id}=passed`));
    expect(receipt.images).toEqual({ a: { ref: "amc-studio:s1-a", id: idA }, b: { ref: "amc-studio:s1-b", id: idB } });
    // A runs twice for deploy-a: once to bootstrap the workspace key, once pinned to it.
    expect(fake.runs()).toEqual([idA, idA, idB, idA]);
    expect(fake.calls.at(-1)).toEqual(["volume", "rm", "-f", receipt.volume]);
  });

  it("admits the probe's 127.0.0.1 host: docker run sets AMC_CORS_ALLOWED_ORIGINS for the published port", async () => {
    for (const port of [3212, 4412]) {
      const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
      await runRollbackDrill({ ...base, port, docker: fake.docker, probe: verified });
      const run = fake.calls.find((c) => c[0] === "run")!;
      expect(run).toContain(`127.0.0.1:${port}:3212`);
      const env = run.flatMap((arg, i) => (run[i - 1] === "-e" ? [arg] : []));
      expect(env).toContain(`AMC_CORS_ALLOWED_ORIGINS=http://127.0.0.1:${port}`);
      expect(env).toContain("AMC_BIND=0.0.0.0");
    }
  });

  it("mints a one-time LAN pairing code inside the container it probes; the passphrase stays in the container", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const docker = (args: string[]) => (args[0] === "exec" && String(args.at(-1)).includes("amc pair create")
      ? (fake.calls.push(args), { status: 0, stdout: "Pairing code: 1234567890\npairingId=pair_1\n", stderr: "" }) : fake.docker(args));
    const codes: string[] = [];
    const receipt = await runRollbackDrill({ ...base, docker, probe: async (container: string) => (codes.push(mintPairingCode(docker, container)), { status: "verified" }) });
    expect(receipt.status).toBe("passed");
    expect(codes).toEqual(["1234567890", "1234567890", "1234567890"]);
    const execs = fake.calls.filter((c) => c[0] === "exec" && String(c.at(-1)).includes("amc pair create"));
    expect(execs.map((c) => c[1])).toEqual([receipt.container, receipt.container, receipt.container]);
    expect(execs[0]!.at(-1)).toContain('"$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc pair create');
    expect(() => mintPairingCode(() => ({ status: 1, stdout: "", stderr: "Vault locked" }), "c")).toThrow(/amc pair create in c failed: Vault locked/);
  });

  it("pins the workspace's monitor key after A's first bootstrap and runs every probed container with that pin (P0-14)", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: verified, pollMs: 1 });
    const pin = createHash("sha256").update(MONITOR_PEM, "utf8").digest("hex");
    expect(receipt.status).toBe("passed");
    expect(receipt.monitorPin).toBe(pin);
    const runs = fake.calls.filter((c) => c[0] === "run");
    const pins = runs.map((run) => run.flatMap((arg, i) => (run[i - 1] === "-e" && arg.startsWith("AMC_EXPECTED_MONITOR_FINGERPRINT=") ? [arg] : [])));
    // A boots once unpinned to create the key, then every container that is probed runs pinned.
    expect(runs.map((run) => run.at(-1))).toEqual([idA, idA, idB, idA]);
    expect(pins).toEqual([[], [`AMC_EXPECTED_MONITOR_FINGERPRINT=${pin}`], [`AMC_EXPECTED_MONITOR_FINGERPRINT=${pin}`], [`AMC_EXPECTED_MONITOR_FINGERPRINT=${pin}`]]);
  });

  it("fails deploy-a, and probes nothing, when the monitor key never appears to pin", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const docker = (args: string[]) => (args[0] === "exec" ? { status: 1, stdout: "", stderr: "No such file" } : fake.docker(args));
    let probes = 0;
    const receipt = await runRollbackDrill({ ...base, docker, probe: async () => (probes++, { status: "verified" }), pollMs: 1, pinTimeoutMs: 5 });
    expect(receipt.status).toBe("failed");
    expect(receipt.steps[0]).toMatchObject({ id: "deploy-a", status: "failed", detail: expect.stringMatching(/monitor key not readable/) });
    expect(probes).toBe(0);
    expect(receipt.monitorPin).toBeNull();
  });

  it("passes a probe that verified a prefix and records that status, distinct from verified (P0-14)", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const prefix = async () => ({ status: "verified-prefix", verification: "anchored-prefix", verificationScope: { scope: "verified-prefix", unfinalizedSessions: ["gw"] } });
    const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: prefix, pollMs: 1 });
    expect(receipt.status).toBe("passed");
    for (const index of [1, 3, 5]) {
      expect(receipt.steps[index]).toMatchObject({ status: "passed", probe: { status: "verified-prefix", verification: "anchored-prefix",
        verificationScope: { scope: "verified-prefix", unfinalizedSessions: ["gw"] } } });
    }
    expect(receipt.probeStatuses).toEqual(["verified-prefix", "verified-prefix", "verified-prefix"]);
  });

  it("fails a probe step whose result carries no recognised status (P0-14)", async () => {
    for (const result of [{}, { status: "VERIFIED" }, { verification: "externally-anchored" }, null]) {
      const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
      const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: async () => result, pollMs: 1 });
      expect(receipt.status, JSON.stringify(result)).toBe("failed");
      expect(receipt.steps[1], JSON.stringify(result)).toMatchObject({ id: "probe-a", status: "failed" });
    }
  });

  it("labels its monitor pin as trust on first use: read from the volume under test (P0-14)", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: verified, pollMs: 1 });
    expect(receipt.monitorPinSource).toBe("trust-on-first-use: read from the drill's own workspace volume after A's first bootstrap");
  });

  it("refuses non-digest ids", async () => {
    for (const bad of ["abc", "sha256:xyz", `sha256:${"A".repeat(64)}`, "amc-studio:s1-a"]) {
      const fake = fakeDocker({ "amc-studio:s1-a": bad, "amc-studio:s1-b": idB });
      await expect(runRollbackDrill({ ...base, docker: fake.docker, probe: verified })).rejects.toThrow(/not a sha256 image id/);
      expect(fake.runs()).toEqual([]);
    }
  });

  it("fails closed on probe failure", async () => {
    let probes = 0;
    const failingAfterRollback = async () => (++probes === 3 ? { status: "failed", failedStep: "verify" } : { status: "verified" });
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: failingAfterRollback });
    expect(receipt.status).toBe("failed");
    expect(receipt.steps.at(-1)).toMatchObject({ id: "probe-after-rollback", status: "failed", probe: { status: "failed", failedStep: "verify" } });

    probes = 0;
    const failFirst = async () => (++probes === 1 ? { status: "failed" } : { status: "verified" });
    const early = await runRollbackDrill({ ...base, docker: fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB }).docker, probe: failFirst });
    expect(early.status).toBe("failed");
    expect(early.steps.map((s: { status: string }) => s.status)).toEqual(["passed", "failed", "skipped", "skipped", "skipped", "skipped"]);
  });

  it("reports 'docker daemon unavailable' without running anything", async () => {
    const fake = fakeDocker({}, { daemon: false });
    await expect(runRollbackDrill({ ...base, docker: fake.docker, probe: verified })).rejects.toBeInstanceOf(DrillUnavailable);
    await expect(runRollbackDrill({ ...base, docker: fake.docker, probe: verified })).rejects.toThrow("docker daemon unavailable");
    expect(fake.calls.every((call) => call[0] === "info")).toBe(true);
  });
});

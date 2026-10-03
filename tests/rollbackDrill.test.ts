import { describe, expect, it } from "vitest";
import { DrillUnavailable, runRollbackDrill, STEP_IDS } from "../scripts/deploy/rollback-drill.mjs";

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
    return { status: 0, stdout: "", stderr: "" };
  };
  return { docker, calls, runs: () => calls.filter((c) => c[0] === "run").map((c) => c.at(-1)) };
}
const verified = async () => ({ status: "verified" });
const base = { imageA: "amc-studio:s1-a", imageB: "amc-studio:s1-b", secretsDir: "/nonexistent-secrets" };

describe("rollback drill", () => {
  it("orders A -> B -> A by sha256 id and passes with six passed steps", async () => {
    const fake = fakeDocker({ "amc-studio:s1-a": idA, "amc-studio:s1-b": idB });
    const receipt = await runRollbackDrill({ ...base, docker: fake.docker, probe: verified });
    expect(receipt.status).toBe("passed");
    expect(receipt.steps.map((s: { id: string; status: string }) => `${s.id}=${s.status}`)).toEqual(STEP_IDS.map((id) => `${id}=passed`));
    expect(receipt.images).toEqual({ a: { ref: "amc-studio:s1-a", id: idA }, b: { ref: "amc-studio:s1-b", id: idB } });
    expect(fake.runs()).toEqual([idA, idB, idA]);
    expect(fake.calls.at(-1)).toEqual(["volume", "rm", "-f", receipt.volume]);
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

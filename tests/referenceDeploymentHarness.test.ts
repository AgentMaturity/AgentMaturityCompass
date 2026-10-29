import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { validateQualificationDir } from "../scripts/check-qualification-receipts.mjs";
import { checks as backupChecks } from "../qualification/reference-deployment/checks/backup.mjs";
import { checks as installChecks } from "../qualification/reference-deployment/checks/install.mjs";
import { isPrefix, isRestoredPrefix } from "../qualification/reference-deployment/checks/lib.mjs";
import { checks as rollbackChecks } from "../qualification/reference-deployment/checks/rollback.mjs";
import { checks as upgradeChecks } from "../qualification/reference-deployment/checks/upgrade.mjs";
import { buildReceipt, evaluateResults, loadMatrix, main, MATRIX_DIR, parseArgs, runChecks, targetProblems } from "../scripts/qualify-reference-deployment.mjs";

// The 22 checks P2-06 names, in its order.
const IDS = ["INS-1", "INS-2", "UPG-1", "UPG-2", "RB-1", "RB-2", "BR-1", "BR-2", "BR-3", "CR-1", "CR-2", "CR-3", "CR-4", "CR-5", "CR-6",
  "OV-1", "OV-2", "TS-1", "TS-2", "TS-3", "TS-4", "TS-5"];
const A = `amc-studio@sha256:${"a".repeat(64)}`;
const B = `amc-studio@sha256:${"b".repeat(64)}`;
const ARGS = ["--kube-context", "kind-x", "--release", "amc-rd", "--image-a", A, "--image-b", B];
const AGREED = { schema: "amc.recovery-targets/1", rpoSeconds: 900, rtoSeconds: 1800, backupCadenceSeconds: 900, agreedBy: "Sid",
  agreedOn: "2026-11-01", partner: "P2-03 partner", status: "agreed" };
const matrix = loadMatrix();
const passedAll = () => IDS.map((id) => ({ id, status: "passed" }));

async function silenced<T>(run: () => Promise<T>): Promise<T> {
  const { error, log } = console;
  console.error = () => {}; console.log = () => {};
  try { return await run(); } finally { console.error = error; console.log = log; }
}

describe("reference deployment matrix", () => {
  it("lists exactly the 22 checks, each with a procedure, pass criteria, an implementation and a runbook naming it", async () => {
    expect(matrix.checks.map((check: { id: string }) => check.id)).toEqual(IDS);
    for (const check of matrix.checks) {
      expect(check.procedure.length, check.id).toBeGreaterThan(10);
      expect(check.passCriteria.length, check.id).toBeGreaterThan(5);
      expect(existsSync(resolve(check.runbook)), check.runbook).toBe(true);
      expect(readFileSync(check.runbook, "utf8"), `${check.runbook} names ${check.id}`).toContain(check.id);
      const module = await import(pathToFileURL(join(MATRIX_DIR, check.module)).href);
      expect(typeof module.checks[check.id], `${check.module} implements ${check.id}`).toBe("function");
    }
  });

  it("ships recovery targets empty: Sid and the partner fill them, nothing is defaulted", () => {
    const shipped = JSON.parse(readFileSync(join(MATRIX_DIR, "targets.json"), "utf8"));
    expect(shipped.rpoSeconds).toBeNull();
    expect(shipped.rtoSeconds).toBeNull();
    expect(targetProblems(shipped)).toEqual(expect.arrayContaining(["rpoSeconds must be a positive integer", "rtoSeconds must be a positive integer"]));
    expect(targetProblems(AGREED)).toEqual([]);
    expect(targetProblems({ ...AGREED, rtoSeconds: 0 })).toContain("rtoSeconds must be a positive integer");
    expect(targetProblems({ ...AGREED, status: "assumed" })).toHaveLength(1);
  });
});

describe("receipt verdict", () => {
  it("passes only when every check passed", () => {
    expect(evaluateResults(matrix, passedAll()).pass).toBe(true);
  });

  it("a check that did not run fails the receipt (not_run, missing or unknown status)", () => {
    const notRun = passedAll().map((result) => result.id === "CR-5" ? { ...result, status: "not_run" } : result);
    expect(evaluateResults(matrix, notRun)).toMatchObject({ pass: false, notRun: ["CR-5"] });
    expect(evaluateResults(matrix, passedAll().filter((result) => result.id !== "OV-2"))).toMatchObject({ pass: false, notRun: ["OV-2"] });
    const skipped = passedAll().map((result) => result.id === "TS-1" ? { ...result, status: "skipped" } : result);
    expect(evaluateResults(matrix, skipped)).toMatchObject({ pass: false, failures: ["TS-1"] });
    expect(evaluateResults(matrix, [...passedAll(), { id: "XX-9", status: "passed" }]).pass).toBe(false);
  });

  it("runChecks: a throwing check fails, an unregistered or HA-only check is not run", async () => {
    const registry = new Map([["INS-1", async () => ({ status: "passed" })], ["INS-2", async () => { throw new Error("boom"); }],
      ["UPG-1", async () => ({ status: "ok" })]]);
    const results = await silenced(() => runChecks({ matrix, registry, ctx: { ha: false } }));
    const status = Object.fromEntries(results.map((result: { id: string; status: string }) => [result.id, result.status]));
    expect(status).toMatchObject({ "INS-1": "passed", "INS-2": "failed", "UPG-1": "failed", "CR-5": "not_run", "TS-5": "not_run" });
    expect(results.find((result: { id: string }) => result.id === "CR-5").reason).toMatch(/HA mode/);
  });

  it("writes a contract receipt that check:qualification accepts, with not-run checks counted as failed", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-p206-receipt-"));
    try {
      const folder = join(root, "2026-10-29-P2-06");
      mkdirSync(join(folder, "checks"), { recursive: true });
      writeFileSync(join(folder, "checks/INS-1.json"), "{}\n");
      writeFileSync(join(folder, "README.md"), "P2-06 harness test receipt\n");
      const results = passedAll().map((result) => result.id.startsWith("TS") ? { ...result, status: "not_run" } : result);
      const receipt = buildReceipt({ matrix, results, date: "2026-10-29", commit: "c".repeat(40), branch: "rtd/w6-p2-06",
        environment: { node: "v22.0.0", pnpm: "10.33.0", os: "linux", arch: "x64" }, notes: "",
        artifacts: [{ path: "checks/INS-1.json", sha256: createHash("sha256").update("{}\n").digest("hex") }] });
      expect(receipt.tests).toEqual({ total: 22, passed: 17, failed: 5, skipped: 0 });
      expect(receipt.notes).toContain("Not run (counted as failed): TS-1, TS-2, TS-3, TS-4, TS-5");
      writeFileSync(join(folder, "receipt.json"), JSON.stringify(receipt));
      expect(validateQualificationDir(root)).toMatchObject({ ok: true, errors: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * A fake cluster: records every command and stdin, answers 0 with empty output, and fails `helm install` so a check
 * stops right after choosing its image. `kubectl get secret … -o json` returns an empty Secret.
 */
function fakeCluster() {
  const calls: { args: string[]; input: string }[] = [];
  const run = (cmd: string, args: string[], opts: { input?: string | Buffer } = {}) => {
    calls.push({ args: [cmd, ...args], input: opts.input === undefined ? "" : String(opts.input) });
    if (cmd === "helm" && args.includes("install")) return { status: 1, stdout: "", stderr: "fake install refused", durationMs: 0 };
    if (cmd === "kubectl" && args.includes("secret") && args.includes("json")) return { status: 0, stdout: '{"type":"Opaque","data":{}}', stderr: "", durationMs: 0 };
    return { status: 0, stdout: "", stderr: "", durationMs: 0 };
  };
  const ctx = { kubeContext: "kind-x", namespace: "default", release: "amc-rd", imageA: A, imageB: B, chartDir: "chart", ephemeralSecrets: true,
    state: {} as Record<string, unknown>, run };
  const installs = () => calls.filter((call) => call.args[0] === "helm" && call.args.includes("install") && !call.args.some((arg) => arg.includes("-ins2-")))
    .map((call) => ({ release: call.args[call.args.indexOf("install") + 1], digest: call.args.find((arg) => arg.startsWith("image.digest="))?.split("=")[1] }));
  const podImages = () => calls.filter((call) => call.input.includes('"kind":"Pod"')).map((call) => JSON.parse(call.input).spec.containers[0].image);
  const podClaims = () => calls.filter((call) => call.input.includes('"kind":"Pod"'))
    .map((call) => JSON.parse(call.input).spec.volumes[0].persistentVolumeClaim.claimName);
  return { ctx, installs, podImages, podClaims };
}
const digestOf = (ref: string) => ref.split("@")[1];

describe("which image each check qualifies (H1, H2)", () => {
  it("INS-1 installs N, the image under test, on the main release", async () => {
    const cluster = fakeCluster();
    await silenced(() => installChecks["INS-1"](cluster.ctx));
    expect(cluster.installs()).toEqual([{ release: "amc-rd", digest: digestOf(B) }]);
  });

  it("UPG-1 starts from N-1 on its own release", async () => {
    const cluster = fakeCluster();
    await silenced(() => upgradeChecks["UPG-1"](cluster.ctx));
    expect(cluster.installs()).toEqual([{ release: "amc-rd-upg", digest: digestOf(A) }]);
  });

  it("BR restore pods run N", async () => {
    const cluster = fakeCluster();
    cluster.ctx.state.loadBackup = { bytes: Buffer.from("backup"), auditorPem: "-----BEGIN PUBLIC KEY-----\n" };
    await silenced(() => backupChecks["BR-3"](cluster.ctx));
    expect(cluster.podImages()).toEqual([B]);
  });

  it("RB-2 restores with N-1 on the upgrade release, by design", async () => {
    const cluster = fakeCluster();
    Object.assign(cluster.ctx.state, { preUpgradeRevision: 2, preUpgradeBackup: { bytes: Buffer.from("b"), auditorPem: "k" } });
    await silenced(() => rollbackChecks["RB-2"](cluster.ctx));
    expect(cluster.podImages()).toEqual([A]);
    expect(cluster.podClaims()).toEqual(["amc-rd-upg-amc"]);
  });
});

describe("chain comparisons", () => {
  const chain = (hashes: string[], sessions = hashes.map(() => "s1")) => ({ hashes, sessions });
  it("isPrefix: byte-identical leading event hashes only", () => {
    expect(isPrefix(chain(["a", "b"]), chain(["a", "b", "c"]))).toBe(true);
    expect(isPrefix(chain(["a", "x"]), chain(["a", "b", "c"]))).toBe(false);
    expect(isPrefix(chain(["a", "b", "c"]), chain(["a", "b"]))).toBe(false);
  });

  it("isRestoredPrefix allows only the restore's own trailing audit rows beyond the shared prefix", () => {
    const source = chain(["a", "b", "c"]);
    expect(isRestoredPrefix(chain(["a", "b", "r"], ["s1", "s1", "ops-backup_restored-1-x"]), source)).toBe(true);
    expect(isRestoredPrefix(chain(["a", "b", "f"], ["s1", "s1", "gateway-session"]), source)).toBe(false);
    expect(isRestoredPrefix(chain(["z"], ["ops-backup_restored-1-x"]), source)).toBe(false);
  });
});

describe("harness command line", () => {
  it("usage errors exit 2: missing flags, tag-only images, bad release names", async () => {
    expect(() => parseArgs(ARGS.slice(0, 6))).toThrow(/--image-b is required/);
    expect(() => parseArgs([...ARGS.slice(0, 5), "amc-studio:latest", "--image-b", B, "--out", "x"])).toThrow(/sha256/);
    expect(() => parseArgs([...ARGS.slice(0, 2), "--release", "Bad_Name", ...ARGS.slice(4), "--out", "x"])).toThrow(/DNS label/);
    expect(await silenced(() => main(["--release"]))).toBe(2);
  });

  it("empty targets.json values exit 2 before any cluster call", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "amc-p206-out-")), "run");
    expect(await silenced(() => main([...ARGS, "--out", out]))).toBe(2);
    expect(existsSync(out)).toBe(false);
  });

  it("a missing helm or kubectl exits 2", async () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-p206-tools-"));
    const targets = join(dir, "targets.json");
    writeFileSync(targets, JSON.stringify(AGREED));
    const path = process.env.PATH;
    process.env.PATH = join(dir, "empty-bin");
    try {
      expect(await silenced(() => main([...ARGS, "--out", join(dir, "run"), "--targets", targets]))).toBe(2);
    } finally {
      process.env.PATH = path;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

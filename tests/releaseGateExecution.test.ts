import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { releaseGate } from "../scripts/release-gate.mjs";

const roots: string[] = [];
const stamp = "2026-09-08T00:00:00.000Z";
type Invocation = { id: string; command: string; args: string[]; cwd: string };

function fixture(fail: string[] = [], writeInventory = true, testReport = "valid") {
  const root = mkdtempSync(join(tmpdir(), "amc-release-gate-contract-"));
  roots.push(root);
  mkdirSync(join(root, "dist"));
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "dist", "cli.js"), "fixture only; never executed");
  const tracked = join(root, "docs", "CLI_COMMAND_INVENTORY.md");
  writeFileSync(tracked, "keep tracked inventory unchanged\n");
  const calls: Invocation[] = [];
  const execute = async (id: string, command: string, args: string[], options: { cwd?: string } = {}) => {
    if (typeof options.cwd !== "string") throw new Error("Every release step must receive its isolated working directory");
    calls.push({ id, command, args, cwd: options.cwd });
    if (id === "command-inventory" && writeInventory) {
      const target = args[args.indexOf("--out") + 1]!;
      writeFileSync(target, "generated fixture inventory\n");
    }
    if (id === "full-test-suite" && testReport !== "missing") {
      const option = args.find((arg) => arg.startsWith("--outputFile.json="))!;
      const target = option.slice("--outputFile.json=".length);
      const success = testReport !== "failed";
      const omitted = ["some-pending", "todo"].includes(testReport);
      writeFileSync(target, testReport === "malformed" ? "not JSON" : JSON.stringify({
        success, numTotalTests: omitted ? 2 : 1, numFailedTests: success ? 0 : 1,
        numPassedTests: testReport === "invalid-count" ? -1 : ["skipped", "failed"].includes(testReport) ? 0 : 1,
        numPendingTests: ["skipped", "some-pending"].includes(testReport) ? 1 : 0,
        numTodoTests: testReport === "todo" ? 1 : 0,
        numFailedTestSuites: testReport === "suite-error" ? 1 : 0, numPendingTestSuites: 0,
        testResults: [{ name: "fixture.test.ts", status: testReport === "suite-error" ? "failed" : "passed",
          message: testReport === "file-error" ? "fixture beforeAll failure" : "" }]
      }));
    }
    return {
      id, command: [command, ...args].join(" "),
      status: fail.includes(id) ? "failed" : "passed", startedAt: stamp, endedAt: stamp,
      stdout: id === "domain-pack-smoke" ? '{"packs":[{"packId":"fixture"}]}' : "fixture output",
      stderr: fail.includes(id) ? "fixture failure" : "", remediation: fail.includes(id) ? "repair fixture" : null
    };
  };
  return { root, tracked, calls, execute };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("release gate execution and qualification scope", () => {
  it("fails release qualification when the real lint step fails", async () => {
    const f = fixture(["lint"]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(f.calls.find(call => call.id === "lint")).toMatchObject({ command: "npm", args: ["run", "lint"] });
    expect(receipt.status).toBe("failed");
    expect(receipt.remediations).toContainEqual({ id: "lint", status: "failed", remediation: "repair fixture" });
  });
  it("fails release qualification when strict package lint fails", async () => {
    const f = fixture(["package-lint"]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(f.calls.find(call => call.id === "package-lint")).toMatchObject({ command: "npm", args: ["run", "check:package"] });
    expect(receipt.status).toBe("failed");
  });
  it("fails release qualification when the citation check fails, after build", async () => {
    const f = fixture(["citations"]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(f.calls.find(call => call.id === "citations")).toMatchObject({ command: "npm", args: ["run", "check:citations"] });
    expect(receipt.steps.find((row: { id: string }) => row.id === "citations").needs).toEqual(["build"]);
    expect(receipt.status).toBe("failed");
  });
  it.each(["source-duplicates", "source-dead-code"])("blocks qualification on unresolved %s findings", async id => {
    const f = fixture([id]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(receipt.status).toBe("failed");
    expect(receipt.remediations).toContainEqual({ id, status: "failed", remediation: "repair fixture" });
  });
  it("executes packed acceptance once after build without another build or tracked inventory write", async () => {
    const f = fixture();
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    const packed = f.calls.filter((call) => call.id === "packed-install");
    expect(packed).toHaveLength(1);
    expect(packed[0]).toMatchObject({ command: "node", args: ["scripts/packed-install-check.mjs", "--no-build"], cwd: f.root });
    expect(f.calls.findIndex((call) => call.id === "build")).toBeLessThan(f.calls.indexOf(packed[0]!));
    expect(f.calls.filter((call) => call.args.join(" ") === "run build")).toHaveLength(1);
    expect(receipt.steps.every((row: { allowFailure: boolean }) => row.allowFailure === false)).toBe(true);
    expect(receipt.steps.find((row: { id: string }) => row.id === "package-lint").needs).toEqual(["build"]);
    expect(receipt).toMatchObject({ status: "passed", qualification: "complete", partial: false,
      counts: { executed: 21, passed: 21, failed: 0, skipped: 0, total: 21 } });
    const inventory = receipt.steps.find((step: { id: string }) => step.id === "command-inventory");
    expect(inventory.artifact).toMatchObject({ temporary: true, retained: false });
    expect(inventory.artifact.path.startsWith(f.root)).toBe(false);
    expect(existsSync(dirname(inventory.artifact.path))).toBe(false);
    expect(readFileSync(f.tracked, "utf8")).toBe("keep tracked inventory unchanged\n");
    const suite = receipt.steps.find((step: { id: string }) => step.id === "full-test-suite");
    expect(suite.artifact).toMatchObject({ produced: true, valid: true, temporary: false, retained: true,
      counts: { total: 1, passed: 1, failed: 0, pending: 0, todo: 0, failedSuites: 0, pendingSuites: 0, files: 1 } });
    expect(suite.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(suite.artifact.path)).toBe(true);
    expect(f.calls.find((call) => call.id === "full-test-suite")!.args).toContain("--reporter=json");
    expect(f.calls.find((call) => call.id === "full-test-suite")!.args).toContain("--coverage");
    expect(receipt.steps.find((row: { id: string }) => row.id === "per-file-coverage").needs).toEqual(["full-test-suite"]);
  });

  it("marks every quick omission while preserving the process result contract", async () => {
    const f = fixture();
    const receipt = await releaseGate({ root: f.root, execute: f.execute, quick: true, liveUrl: "" });
    expect(receipt).toMatchObject({ status: "passed", qualification: "partial", partial: true,
      counts: { executed: 16, passed: 16, failed: 0, skipped: 5, total: 21 } });
    expect(receipt.steps.filter((step: { status: string }) => step.status === "skipped").map((step: { id: string }) => step.id))
      .toEqual(["packed-install", "full-test-suite", "per-file-coverage", "install-persona-qa", "live-deploy-health"]);
    expect(f.calls.some((call) => ["packed-install", "full-test-suite", "per-file-coverage", "install-persona-qa"].includes(call.id))).toBe(false);
    expect(receipt.summary).toContain("Acceptance is incomplete");
    expect(receipt.summary).not.toContain("Release gate passed");
    expect(receipt.remediations).toHaveLength(5);
    expect(existsSync(join(f.root, "tmp", "release-gate"))).toBe(false);
  });

  it("does not equate an omitted live check with complete qualification in full mode", async () => {
    const f = fixture();
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "" });
    expect(receipt).toMatchObject({ status: "passed", qualification: "partial", partial: true,
      counts: { executed: 20, passed: 20, failed: 0, skipped: 1, total: 21 } });
    expect(receipt.summary).toContain("live-deploy-health");
  });

  it("never invokes build-dependent consumers after build failure, even with a stale CLI present", async () => {
    const f = fixture(["build"]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    const dependent = ["package-lint", "citations", "packed-install", "gap-0626-adversarial-regression", "full-test-suite", "per-file-coverage", "command-inventory", "cli-and-domain-smoke", "install-persona-qa"];
    expect(f.calls.some((call) => [...dependent, "cli-smoke-help", "domain-pack-smoke"].includes(call.id))).toBe(false);
    for (const id of dependent) {
      const result = receipt.steps.find((step: { id: string }) => step.id === id);
      expect(result.status).toBe("skipped");
      expect(result.remediation).toMatch(/Required gates did not pass/);
    }
    expect(receipt).toMatchObject({ status: "failed", qualification: "failed", partial: true,
      counts: { executed: 12, passed: 11, failed: 1, skipped: 9, total: 21 } });
    expect(readFileSync(f.tracked, "utf8")).toBe("keep tracked inventory unchanged\n");
    expect(existsSync(join(f.root, "tmp", "release-gate"))).toBe(false);
  });

  it("fails the gate when installed evidence fails even if every other registered check passed", async () => {
    const f = fixture(["packed-install"]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(receipt).toMatchObject({ status: "failed", qualification: "failed", partial: false,
      counts: { executed: 21, passed: 20, failed: 1, skipped: 0, total: 21 } });
    expect(receipt.remediations).toEqual([{ id: "packed-install", status: "failed", remediation: "repair fixture" }]);
  });

  it("rejects successful CLI exit without an actual inventory artifact", async () => {
    const f = fixture([], false);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(receipt.status).toBe("failed");
    const inventory = receipt.steps.find((step: { id: string }) => step.id === "command-inventory");
    expect(inventory).toMatchObject({ status: "failed", artifact: { produced: false, retained: false } });
    expect(readFileSync(f.tracked, "utf8")).toBe("keep tracked inventory unchanged\n");
  });

  it.each(["missing", "malformed", "failed", "skipped", "some-pending", "todo", "invalid-count", "suite-error", "file-error"])("rejects successful Vitest exit with a %s JSON report", async (kind) => {
    const f = fixture([], true, kind);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(receipt.status).toBe("failed");
    const suite = receipt.steps.find((step: { id: string }) => step.id === "full-test-suite");
    expect(suite).toMatchObject({ status: "failed", artifact: { produced: kind !== "missing", valid: false, retained: true } });
    if (kind === "some-pending") expect(suite.artifact.counts).toMatchObject({ total: 2, passed: 1, pending: 1 });
    if (["missing", "malformed"].includes(kind)) expect(suite.artifact.counts).toBeNull();
  });

  it("does not let a successful JSON report override Vitest process failure", async () => {
    const f = fixture(["full-test-suite"]);
    const receipt = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "https://health.example.invalid" });
    expect(receipt).toMatchObject({ status: "failed", qualification: "failed" });
    expect(receipt.steps.find((step: { id: string }) => step.id === "full-test-suite"))
      .toMatchObject({ status: "failed", artifact: { valid: true, counts: { passed: 1, failed: 0 } } });
  });

  it("retains separate full-suite reports so a later run cannot reuse a stale report", async () => {
    const f = fixture();
    const first = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "" });
    const second = await releaseGate({ root: f.root, execute: f.execute, liveUrl: "" });
    const artifact = (receipt: typeof first) => receipt.steps.find((step: { id: string }) => step.id === "full-test-suite").artifact;
    expect(artifact(first).path).not.toBe(artifact(second).path);
    expect(existsSync(artifact(first).path)).toBe(true);
    expect(existsSync(artifact(second).path)).toBe(true);
  });
});

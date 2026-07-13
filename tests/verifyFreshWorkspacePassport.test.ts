import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyAll } from "../src/verify/verifyAll.js";

describe("verify all on a fresh workspace (first-run passport boundary)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-verify-fresh-"));
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("uninitialized passport reports SKIP, not a critical failure", async () => {
    const report = await verifyAll({ workspace: dir });
    const policy = report.checks.find((check) => check.id === "passport-policy-signature");
    const integrity = report.checks.find((check) => check.id === "passport-workspace-integrity");
    expect(policy?.status).toBe("SKIP");
    expect(policy?.details).toEqual(["passport not initialized yet"]);
    expect(integrity?.status).toBe("SKIP");
    const passportFailures = report.checks.filter(
      (check) => check.id.startsWith("passport-") && check.status === "FAIL"
    );
    expect(passportFailures).toEqual([]);
  });

  test("fails closed when passport artifacts exist without a signed policy", async () => {
    const cacheDir = join(dir, ".amc", "passport", "cache");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "latest_agent_default.json"), "{}");
    const report = await verifyAll({ workspace: dir });
    const policy = report.checks.find((check) => check.id === "passport-policy-signature");
    expect(policy?.status).toBe("FAIL");
    expect(report.criticalFail).toBe(true);
  });
});

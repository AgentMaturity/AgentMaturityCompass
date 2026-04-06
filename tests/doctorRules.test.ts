import { describe, test, expect } from "vitest";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("doctor rules", () => {
  function makeWorkspace(files?: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-doctor-"));
    const amcDir = join(dir, ".amc");
    mkdirSync(amcDir, { recursive: true });
    if (files) {
      for (const [name, content] of Object.entries(files)) {
        const filePath = join(amcDir, name);
        mkdirSync(join(filePath, ".."), { recursive: true });
        writeFileSync(filePath, content, "utf8");
      }
    }
    return dir;
  }

  test("runDoctorRules returns report structure", async () => {
    const ws = makeWorkspace();
    const report = await runDoctorRules(ws);
    expect(report).toBeDefined();
    expect(report.checks).toBeDefined();
    expect(Array.isArray(report.checks)).toBe(true);
    expect(typeof report.ok).toBe("boolean");
  });

  test("runDoctorRules checks have required fields", async () => {
    const ws = makeWorkspace();
    const report = await runDoctorRules(ws);
    for (const check of report.checks) {
      expect(check.id).toBeDefined();
      expect(check.status).toMatch(/PASS|FAIL|WARN|INFO/);
      expect(check.message).toBeDefined();
    }
  });

  test("runDoctorRules on empty workspace does not crash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-doctor-empty-"));
    const report = await runDoctorRules(dir);
    expect(report).toBeDefined();
    expect(report.checks.length).toBeGreaterThanOrEqual(0);
  });

  test("node-version check passes on current node", async () => {
    const ws = makeWorkspace();
    const report = await runDoctorRules(ws);
    const nodeCheck = report.checks.find((c) => c.id === "node-version");
    if (nodeCheck) {
      expect(nodeCheck.status).toBe("PASS");
    }
  });
});

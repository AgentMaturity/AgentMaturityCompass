import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { amcHomeCheck } from "../src/doctor/doctorRules.js";

/**
 * Studio refuses to start while the AMC home (or its credentials file) is reachable by group or other
 * (src/credentials/credentialsSnapshot.ts). `amc doctor` used to report PASS in exactly that state; it now runs the
 * same check and fails with the same fix.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

function amcHome(mode: number): string {
  const root = mkdtempSync(join(tmpdir(), "amc-doctor-home-"));
  roots.push(root);
  const home = join(root, "amc-home");
  mkdirSync(home);
  chmodSync(home, mode);
  return home;
}

describe("amc doctor checks the AMC home the way Studio does", () => {
  // Windows has no POSIX modes to check (access is ACLs); there the check says so instead of passing or failing.
  const posix = process.platform !== "win32";

  it("fails a group- or other-accessible AMC home with Studio's own fix", () => {
    const home = amcHome(0o755);
    const check = amcHomeCheck({ AMC_HOME: home } as NodeJS.ProcessEnv);
    if (!posix) { expect(check.status).toBe("INFO"); return; }
    expect(check.status).toBe("FAIL");
    expect(check.message).toContain(`Fix: chmod 700 ${home}`);
    expect(check.message).toContain("Studio refuses to start");
    expect(check.fixHint).toBe(`Run: chmod 700 ${home}`);
  });

  it("fails a credentials file open to group or other inside a private home", () => {
    const home = amcHome(0o700);
    writeFileSync(join(home, ".credentials.yaml"), "{}\n", { mode: 0o644 });
    chmodSync(join(home, ".credentials.yaml"), 0o644);
    const check = amcHomeCheck({ AMC_HOME: home } as NodeJS.ProcessEnv);
    if (!posix) { expect(check.status).toBe("INFO"); return; }
    expect(check.status).toBe("FAIL");
    expect(check.fixHint).toBe(`Run: chmod 600 ${join(home, ".credentials.yaml")}`);
  });

  it("passes a private AMC home and one that does not exist yet", () => {
    const home = amcHome(0o700);
    expect(amcHomeCheck({ AMC_HOME: home } as NodeJS.ProcessEnv)).toMatchObject({ status: posix ? "PASS" : "INFO" });
    expect(amcHomeCheck({ AMC_HOME: join(home, "missing") } as NodeJS.ProcessEnv).status).not.toBe("FAIL");
  });
});

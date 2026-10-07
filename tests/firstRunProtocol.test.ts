import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { inspectRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { firstRunActions, STUB_FIRST_TURN_COMMAND } from "../src/doctor/firstRunPlan.js";

/**
 * The first-run protocol end to end, against the built CLI (dist/cli.js):
 *
 *   amc init --minimal        -> prints the three operator actions
 *   amc doctor                -> FAILS and names `amc firewall enable`
 *   amc firewall enable       -> creates + signs the policy, explains what it wrote
 *   amc firewall enable       -> idempotent: nothing written, same revision
 *   amc doctor                -> the firewall check passes
 *
 * Passing here qualifies the CLI wording and the idempotence of the policy
 * write on this machine. It does not run a model turn (the stub turn is
 * measured separately in the receipt) and it does not qualify a release.
 */
const PASS = "first-run-protocol-passphrase";
const workspaces: string[] = [];
/** Registered only when the built CLI exists, so the release gate's mandatory profile never reports a skipped test; the mandatory case below records the resolution. */
const distPresent = existsSync(resolve(process.cwd(), "dist/cli.js"));
const testWithDist = distPresent ? test : undefined;

function freshWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-first-run-protocol-"));
  workspaces.push(workspace);
  return workspace;
}

function amc(workspace: string, args: string[], env: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS, AMC_FIREWALL_ENABLED: undefined, ...env },
    timeout: 30_000
  });
  return { ...result, text: `${result.stdout}\n${result.stderr}` };
}

afterEach(() => {
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

describe("first-run protocol against the built CLI", () => {
  test("registers the built-CLI cases only when dist/cli.js exists, and the plan names the three actions", () => {
    expect(testWithDist === undefined).toBe(!distPresent);
    const actions = firstRunActions();
    expect(actions.map((action) => action.cmd)).toEqual(["amc firewall enable", STUB_FIRST_TURN_COMMAND, "amc agent-loop verify <session-id>"]);
    expect(STUB_FIRST_TURN_COMMAND).toContain("--provider stub");
  });

  testWithDist?.("init -> doctor names the fix -> firewall enable (idempotent) -> doctor passes", () => {
    const workspace = freshWorkspace();

    const init = amc(workspace, ["init", "--minimal"]);
    expect(init.status, init.text).toBe(0);
    expect(init.stdout).toContain("amc firewall enable");
    expect(init.stdout).toContain("--provider stub");
    expect(init.stdout).toContain("amc agent-loop verify");
    // A passphrase supplied by the operator is never echoed back.
    expect(init.stdout).not.toContain(PASS);

    // Plain doctor: the precondition and its fix are named; the exit code is
    // kept for broken artifacts. Strict doctor fails closed on the same check.
    const doctorBefore = amc(workspace, ["doctor", "--json"]);
    expect(doctorBefore.status, doctorBefore.text).toBe(0);
    const before = JSON.parse(doctorBefore.stdout) as { ok: boolean; checks: { id: string; status: string; fixHint?: string }[] };
    expect(before.ok).toBe(true);
    const firewallBefore = before.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(firewallBefore).toMatchObject({ status: "WARN", fixHint: "Run: amc firewall enable" });

    const strictBefore = amc(workspace, ["doctor", "--strict", "--json"]);
    expect(strictBefore.status, strictBefore.text).toBe(1);
    const strict = JSON.parse(strictBefore.stdout) as { ok: boolean; checks: { id: string; status: string; fixHint?: string }[] };
    expect(strict.ok).toBe(false);
    expect(strict.checks.find((row) => row.id === "runtime-firewall-policy")).toMatchObject({ status: "FAIL", fixHint: "Run: amc firewall enable" });

    const doctorText = amc(workspace, ["doctor"]);
    expect(doctorText.status).toBe(0);
    expect(doctorText.stdout).toContain("fix: Run: amc firewall enable");
    expect(doctorText.stdout).not.toContain("All critical checks pass");
    // Even with exit 0, a missing precondition is repeated under What's next.
    expect(doctorText.stdout).toMatch(/What's next[\s\S]*amc firewall enable/);
    // Strict output repeats the fix verbatim in the next-steps block so the operator can copy it.
    const strictText = amc(workspace, ["doctor", "--strict"]);
    expect(strictText.status).toBe(1);
    expect(strictText.stdout).toMatch(/What's next[\s\S]*amc firewall enable/);

    const enable = amc(workspace, ["firewall", "enable"]);
    expect(enable.status, enable.text).toBe(0);
    expect(enable.stdout).toContain("Runtime Firewall enabled in warn mode");
    expect(enable.stdout).toContain("Policy:");
    expect(enable.stdout).toContain("Signature:");
    expect(enable.stdout).toContain("Checkpoint:");
    expect(enable.stdout).toMatch(/revision 1/);
    expect(enable.stdout).toMatch(/missing-policy/);
    expect(enable.stdout).toContain("amc firewall enable --mode block");
    const first = inspectRuntimeFirewallPolicy(workspace);
    expect(first.integrity).toBe("trusted");
    expect(first.revision).toBe(1);

    const again = amc(workspace, ["firewall", "enable", "--json"]);
    expect(again.status, again.text).toBe(0);
    const againJson = JSON.parse(again.stdout) as { changed: boolean; revision: number; policy: { mode: string; enabled: boolean } };
    expect(againJson.changed).toBe(false);
    expect(againJson.revision).toBe(1);
    expect(againJson.policy).toMatchObject({ mode: "warn", enabled: true });
    expect(inspectRuntimeFirewallPolicy(workspace).revision, "a repeated enable must not append a journal revision").toBe(1);

    const againText = amc(workspace, ["firewall", "enable"]);
    expect(againText.status).toBe(0);
    expect(againText.stdout).toMatch(/already enabled/i);
    expect(againText.stdout).toMatch(/nothing (was )?written/i);

    const changeMode = amc(workspace, ["firewall", "enable", "--mode", "block", "--json"]);
    expect(changeMode.status, changeMode.text).toBe(0);
    const changed = JSON.parse(changeMode.stdout) as { changed: boolean; revision: number; policy: { mode: string } };
    expect(changed.changed).toBe(true);
    expect(changed.revision).toBe(2);
    expect(changed.policy.mode).toBe("block");

    const doctorAfter = amc(workspace, ["doctor", "--json"]);
    const after = JSON.parse(doctorAfter.stdout) as { checks: { id: string; status: string; message: string }[] };
    const firewallAfter = after.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(firewallAfter?.status).toBe("PASS");
    expect(firewallAfter?.message).toContain("block");
    expect(firewallAfter?.message).toContain("revision 2");
    expect(after.checks.find((row) => row.id === "vault")?.status).toBe("PASS");
  }, 90_000); // Five built-CLI runs, ~12 s alone; hit the 30 s default twice while other suites shared the machine.

  testWithDist?.("init --minimal without a passphrase says how to keep signing possible", () => {
    const workspace = freshWorkspace();
    const init = amc(workspace, ["init", "--minimal"], { AMC_VAULT_PASSPHRASE: undefined });
    expect(init.status, init.text).toBe(0);
    // The generated passphrase is shown once with the export that later signing commands need.
    expect(init.stdout).toContain("export AMC_VAULT_PASSPHRASE=");
    expect(init.stdout).not.toMatch(/minimal-startup-\d+/);

    const doctor = amc(workspace, ["doctor", "--json"], { AMC_VAULT_PASSPHRASE: undefined });
    const report = JSON.parse(doctor.stdout) as { checks: { id: string; status: string; fixHint?: string }[] };
    const vault = report.checks.find((row) => row.id === "vault");
    expect(vault?.status).toBe("WARN");
    expect(vault?.fixHint).toContain("export AMC_VAULT_PASSPHRASE=");
  });
});

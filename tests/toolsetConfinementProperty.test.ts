import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFINEMENT_PROBE_DIR_ENV,
  measureProcessConfinement,
  processIsConfined,
  type ConfinementMeasurement,
  type ConfinementVerdict
} from "../src/sandbox/processConfinement.js";
import { buildSeatbeltProfile } from "../src/sandbox/seatbeltBackend.js";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";

/**
 * `ToolsetReadiness.confined` is a PROPERTY OF THIS PROCESS, measured.
 *
 * Not a probe of the machine (`sandbox-exec` exists), and not a constant. The
 * measurement is a write the OS either refuses or permits: a launcher that
 * confines AMC names a directory its profile denies (`AMC_CONFINEMENT_PROBE_DIR`),
 * and the process tries to create a file there. Refused by the kernel, with
 * ordinary permissions ruled out, is "confined". Permitted is "unconfined" no
 * matter what the launcher declared. Anything that cannot be attributed is
 * "unknown", and every consumer treats "unknown" exactly like "unconfined".
 *
 * The seatbelt cases run a REAL child under a REAL `sandbox-exec` profile on
 * darwin, because the claim is that the operating system refused the write.
 */
const PASS = "toolset-confinement-property-passphrase";
const dirs: string[] = [];
const isRoot = process.getuid?.() === 0;
const seatbeltPresent = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
/**
 * Cases that need an unprivileged user or a real `sandbox-exec` are registered
 * only where they can run, so the release gate's mandatory profile never reports
 * them as skipped; the mandatory case below records what this machine registers.
 */
const itUnlessRoot = isRoot ? undefined : it;
const itWithSeatbelt = seatbeltPresent ? it : undefined;
const SOURCE = fileURLToPath(new URL("../src/sandbox/processConfinement.ts", import.meta.url));

afterEach(() => {
  delete process.env[CONFINEMENT_PROBE_DIR_ENV];
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (!dir) continue;
    try { chmodSync(dir, 0o700); } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Real path: seatbelt matches resolved paths and /var is a symlink. */
function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = tempDir("amc-confprop-ws-");
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

/**
 * Run `body` (an async function body using dynamic `import()`) in a child Node,
 * optionally under a seatbelt profile.
 *
 * CommonJS eval on purpose: `--input-type=module` would be inherited by the
 * Code Mode worker's execArgv and break its CommonJS bootstrap.
 */
function child(body: string, env: Record<string, string>, profile: string | null): { status: number | null; stdout: string; stderr: string } {
  const script = `(async () => {\n${body}\n})().catch(error => { console.error(error); process.exit(1); });`;
  const nodeArgv = [process.execPath, "--import", "tsx", "--eval", script];
  const argv = profile ? ["/usr/bin/sandbox-exec", "-f", profile, ...nodeArgv] : nodeArgv;
  const result = spawnSync(argv[0]!, argv.slice(1), {
    encoding: "utf8", timeout: 25_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, TSX_DISABLE_CACHE: "1", ...env }
  });
  expect(result.error, "child failed to spawn").toBeUndefined();
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const MEASURE_SCRIPT = `const { measureProcessConfinement } = await import(${JSON.stringify(pathToFileURL(SOURCE).href)});\n`
  + `process.stdout.write(JSON.stringify(measureProcessConfinement()));`;

/** A profile that lets the child write its workspace but denies the probe directory. */
function profileDenying(probeDir: string, writable: readonly string[]): string {
  const dir = tempDir("amc-confprop-sbpl-");
  const profile = join(dir, "policy.sb");
  // The probe dir is simply NOT among the writable roots; buildSeatbeltProfile
  // denies every other write. Assert that, so the test cannot pass by accident.
  expect(writable.some(root => probeDir.startsWith(root))).toBe(false);
  writeFileSync(profile, buildSeatbeltProfile(writable), { mode: 0o600 });
  return profile;
}

describe("the measurement: a write the OS refuses or permits", () => {
  it("registers the real-sandbox cases only where they can run, and the profile they use denies the probe directory", () => {
    expect(itUnlessRoot === undefined).toBe(isRoot);
    expect(itWithSeatbelt === undefined).toBe(!seatbeltPresent);
    const probeDir = tempDir("amc-confprop-probe-");
    const allowed = tempDir("amc-confprop-allowed-");
    const profile = buildSeatbeltProfile([allowed]);
    expect(profile).toContain("(deny file-write*)");
    expect(profile).toContain(allowed);
    expect(profile).not.toContain(probeDir);
  });

  it("with nothing declared, measures this process as unconfined by writing outside any workspace root, and cleans up", () => {
    const outside = tempDir("amc-confprop-fallback-");
    const m = measureProcessConfinement({ env: {}, fallbackDir: outside });
    expect(m.verdict).toBe("unconfined");
    expect(m.declaredProbeDir).toBeNull();
    expect(m.probe.result).toBe("permitted");
    expect(m.probe.path.startsWith(outside)).toBe(true);
    expect(readdirSync(outside), "the probe file is removed after the measurement").toEqual([]);
    expect(m.reason).toContain(m.probe.path);
  });

  it("a DECLARED probe directory this process can still write to is unconfined: the declaration is measured, not trusted", () => {
    const declared = tempDir("amc-confprop-declared-");
    const m = measureProcessConfinement({ env: { [CONFINEMENT_PROBE_DIR_ENV]: declared } });
    expect(m.verdict).toBe("unconfined");
    expect(m.declaredProbeDir).toBe(declared);
    expect(m.probe.result).toBe("permitted");
    expect(readdirSync(declared)).toEqual([]);
    expect(m.reason).toMatch(/declared/i);
  });

  it("a declared probe directory that does not exist is unknown, never confined", () => {
    const missing = join(tempDir("amc-confprop-gone-"), "never-created");
    const m = measureProcessConfinement({ env: { [CONFINEMENT_PROBE_DIR_ENV]: missing } });
    expect(m.verdict).toBe("unknown");
    expect(m.probe.result).toBe("not-attempted");
  });

  it("a relative declared path is unknown", () => {
    const m = measureProcessConfinement({ env: { [CONFINEMENT_PROBE_DIR_ENV]: "relative/probe" } });
    expect(m.verdict).toBe("unknown");
    expect(m.probe.result).toBe("not-attempted");
  });

  itUnlessRoot?.("a refusal that ordinary permissions explain is unknown, not confined", () => {
    // Mode 0o500 refuses the create with EACCES on both darwin and linux. That
    // refusal says nothing about an OS sandbox, and counting it would let a
    // launcher fake confinement with chmod.
    const declared = tempDir("amc-confprop-ro-");
    chmodSync(declared, 0o500);
    const m = measureProcessConfinement({ env: { [CONFINEMENT_PROBE_DIR_ENV]: declared } });
    expect(m.verdict).toBe("unknown");
    expect(m.probe.result).toBe("not-attempted");
    expect(m.reason).toMatch(/write bit|permission/i);
  });

  itUnlessRoot?.("a refused write with nothing declared is unknown: the refusal cannot be attributed", () => {
    const outside = tempDir("amc-confprop-ro-fallback-");
    chmodSync(outside, 0o500);
    const m = measureProcessConfinement({ env: {}, fallbackDir: outside });
    expect(m.verdict).toBe("unknown");
    expect(m.verdict).not.toBe("confined");
  });

  itWithSeatbelt?.("under a REAL seatbelt profile that denies the declared directory, THIS process measures confined", () => {
    const probeDir = tempDir("amc-confprop-probe-");
    const allowed = tempDir("amc-confprop-allowed-");
    const profile = profileDenying(probeDir, [allowed]);

    const run = child(MEASURE_SCRIPT, { [CONFINEMENT_PROBE_DIR_ENV]: probeDir }, profile);
    expect(run.status, run.stderr).toBe(0);
    const m = JSON.parse(run.stdout) as ConfinementMeasurement;
    expect(m.verdict).toBe("confined");
    expect(m.probe.result).toBe("refused");
    expect(m.probe.code).toBe("EPERM");
    expect(readdirSync(probeDir), "the kernel refused the write; nothing was created").toEqual([]);
  });

  itWithSeatbelt?.("the same child WITHOUT the profile measures unconfined: the verdict comes from the OS, not the variable", () => {
    const probeDir = tempDir("amc-confprop-probe-");
    const run = child(MEASURE_SCRIPT, { [CONFINEMENT_PROBE_DIR_ENV]: probeDir }, null);
    expect(run.status, run.stderr).toBe(0);
    const m = JSON.parse(run.stdout) as ConfinementMeasurement;
    expect(m.verdict).toBe("unconfined");
    expect(m.probe.result).toBe("permitted");
  });
});

describe("every consumer fails closed on unknown", () => {
  it("processIsConfined is true for exactly one verdict", () => {
    const base = { declaredProbeDir: null, probe: { path: "/x", result: "not-attempted" as const, code: null }, reason: "r" };
    const table: Record<ConfinementVerdict, boolean> = { confined: true, unconfined: false, unknown: false };
    for (const [verdict, expected] of Object.entries(table) as [ConfinementVerdict, boolean][]) {
      expect(processIsConfined({ ...base, verdict }), verdict).toBe(expected);
    }
  });

  it("readiness carries the measurement, and confined is false in this unconfined test process", () => {
    const readiness = checkToolsetReadiness(workspace());
    expect(readiness.confinement.verdict).not.toBe("confined");
    expect(readiness.confined).toBe(false);
    expect(readiness.sandboxReason).toContain(readiness.confinement.reason);
  });

  it("an UNKNOWN measurement keeps Code Mode refused", async () => {
    const dir = workspace();
    process.env[CONFINEMENT_PROBE_DIR_ENV] = join(dir, "no-such-probe-dir");
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session", mode: "code" });
    try {
      expect(toolset.readiness.confinement.verdict).toBe("unknown");
      expect(toolset.readiness.confined).toBe(false);
      const outcome = await toolset.seam.execute({
        callId: "c1", toolName: "run_code", rawArguments: JSON.stringify({ source: "return 1 + 1;" }),
        sessionId: "s1", turn: 1, step: 1, parentToken: null, dispatch: "code", signal: new AbortController().signal
      });
      expect(outcome.outcome).toBe("ERROR");
      expect(String(outcome.content)).toMatch(/unconfined|sandbox/i);
    } finally {
      toolset.close();
    }
  });

  itWithSeatbelt?.("Code Mode runs a program ONLY in a process the OS measurably confines", () => {
    // End to end, in a child under a real profile: workspace writable, probe
    // directory denied. Readiness must measure confined and `run_code` must run.
    const dir = workspace();
    const probeDir = tempDir("amc-confprop-probe-");
    const profile = profileDenying(probeDir, [dir]);
    const script = `const { agentToolset } = await import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL("../src/agent/agentToolset.ts", import.meta.url))).href)});\n`
      + `const toolset = agentToolset({ workspace: ${JSON.stringify(dir)}, agentId: "payments-agent", sessionId: "toolset-test-session", mode: "code" });\n`
      + `const outcome = await toolset.seam.execute({ callId: "c1", toolName: "run_code", rawArguments: JSON.stringify({ source: "return 1 + 1;" }), sessionId: "s1", turn: 1, step: 1, parentToken: null, dispatch: "code", signal: new AbortController().signal });\n`
      + `toolset.close();\n`
      + `process.stdout.write(JSON.stringify({ readiness: toolset.readiness, outcome: outcome.outcome, content: String(outcome.content) }));`;

    const run = child(script, { [CONFINEMENT_PROBE_DIR_ENV]: probeDir, AMC_VAULT_PASSPHRASE: PASS }, profile);
    expect(run.status, run.stderr).toBe(0);
    const parsed = JSON.parse(run.stdout) as { readiness: { confined: boolean; confinement: ConfinementMeasurement }; outcome: string; content: string };
    expect(parsed.readiness.confinement.verdict).toBe("confined");
    expect(parsed.readiness.confined).toBe(true);
    expect(parsed.outcome, parsed.content).toBe("OK");
    expect(parsed.content).toContain("2");
  });
});

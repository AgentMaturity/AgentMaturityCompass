import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// The script is the source of truth for the documented commands; the docs
// must quote them. The executable half (`npm run check:clean-source`) proves
// they work on a fresh clone — this test only keeps the prose from drifting.
import { cleanSourceCheck, DOCUMENTED_SOURCE_COMMANDS } from "../scripts/clean-source-check.mjs";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const SOURCE_DOCS = ["README.md", "docs/INSTALL.md", "CONTRIBUTING.md"];

describe("AMC-1509 — documented source install matches the executable check", () => {
  test.each(SOURCE_DOCS)("%s quotes every documented command and no npm ci", (file) => {
    const text = readFileSync(file, "utf8");
    for (const command of DOCUMENTED_SOURCE_COMMANDS) {
      expect(text, `${file} must contain "${command}"`).toContain(command);
    }
    // npm cannot resolve the workspace:* protocol the vendored packages use, so
    // `npm ci` may be MENTIONED (to say why it fails) but never given as a command.
    expect(text).not.toMatch(/(^|&&\s*)npm ci\b/m);
  });

  test("the pinned package manager is what the docs tell people to use", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { packageManager: string; scripts: Record<string, string> };
    expect(pkg.packageManager).toMatch(/^pnpm@/);
    expect(pkg.scripts["check:clean-source"]).toBe("node scripts/clean-source-check.mjs");
  });
});

describe("clean-source command orchestration (synthetic subprocesses, not install acceptance)", () => {
  const roots: string[] = [];
  let fault: "none" | "ledger" | "resume" | "install" = "none";
  let currentSession: string;
  let currentRequests: number;
  beforeEach(() => {
    fault = "none";
    vi.stubEnv("OPENAI_API_KEY", "synthetic-secret-must-not-inherit");
    vi.stubEnv("AMC_NO_SIGN", "1");
    vi.stubEnv("npm_config_global", "true");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(spawnSync).mockImplementation(((command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
      let output: unknown = {};
      let status = 0;
      if (command === "git" && args[0] === "rev-parse") return { status: 0, stdout: "a".repeat(40), stderr: "" };
      const env = options.env!;
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.AMC_NO_SIGN).toBeUndefined();
      expect(env.npm_config_global).toBe("false");
      expect(env.USERPROFILE).toBe(env.HOME);
      expect(readFileSync(env.npm_config_userconfig!, "utf8")).toBe("");
      if (command === "git" && args[0] === "clone") {
        const checkout = args.at(-1)!;
        roots.push(dirname(checkout));
        mkdirSync(checkout);
      } else if (command === "pnpm") {
        if (args[0] === "install" && fault === "install") status = 1;
        if (args[0] === "run") {
          mkdirSync(join(options.cwd!, "dist"));
          writeFileSync(join(options.cwd!, "dist", "cli.js"), "synthetic build output; never executed");
        }
      } else if (command !== "git") {
        expect(command).toBe(process.execPath);
        if (args[1] === "agent-loop" && args[2] === "run") {
          expect(args.slice(args.indexOf("--provider"), args.indexOf("--provider") + 2)).toEqual(["--provider", "stub"]);
          expect(args).toContain("--json");
          const resumed = args.includes("--session");
          currentSession = resumed || args.includes("--keep-open") ? "handover-session" : "smoke-session";
          currentRequests = resumed && fault !== "resume" ? 4 : 2;
          if (resumed) expect(args[args.indexOf("--session") + 1]).toBe("handover-session");
          output = { sessionId: currentSession, driverStatus: "idle", unsignedRows: 0,
            events: resumed && fault !== "resume" ? 20 : 10, turns: resumed ? 2 : 1,
            requests: currentRequests, toolCalls: resumed ? 2 : 1,
            endings: Array.from({ length: resumed ? 2 : 1 }, (_, index) => ({ turn: index + 1, reason: "complete", interrupted: false })) };
        } else if (args[1] === "session") {
          output = { ok: true, chain: { ok: fault !== "ledger" }, errors: [], sessions: { closed: [currentSession] } };
        } else if (args[1] === "agent-loop" && args[2] === "verify") {
          output = { ok: true, sessionId: currentSession, ledgerOk: true, ledgerErrors: [], sessionChainErrors: [], unsignedRowIds: [],
            requests: Array.from({ length: currentRequests }, (_, index) => ({ headerEventId: `request-${index}`, status: "reconstructed" })) };
        }
      }
      return { status, stdout: JSON.stringify(output), stderr: "" };
    }) as typeof spawnSync);
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.mocked(spawnSync).mockReset();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("isolates install/build/runtime and verifies a cold resumed session", () => {
    expect(cleanSourceCheck({ root: process.cwd() })).toBe(true);
    const calls = vi.mocked(spawnSync).mock.calls;
    expect(calls.filter(([cmd]) => cmd === "pnpm").map(([, args]) => args)).toEqual([
      ["install", "--frozen-lockfile"], ["run", "build"]
    ]);
    expect(calls.filter(([, args]) => Array.isArray(args) && args.includes("verify"))).toHaveLength(4);
  });

  test.each(["ledger", "resume", "install"] as const)("refuses %s failure even when other subprocesses exit zero", (mode) => {
    fault = mode;
    expect(cleanSourceCheck({ root: process.cwd() })).toBe(false);
    if (mode === "install") expect(vi.mocked(spawnSync).mock.calls.some(([command]) => command === process.execPath)).toBe(false);
  });
});

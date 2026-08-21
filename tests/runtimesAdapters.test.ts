/**
 * Behavioural tests for src/runtimes/* — the adapters that detect installed agent
 * CLIs (Claude Code, Gemini CLI, OpenClaw) and drive them as a JSON harness.
 *
 * Before this file there was NO test anywhere in the repo that imported
 * src/runtimes/**. That subsystem is the real integration point with the user's
 * machine: `amc doctor`, workspace init and the diagnostic runner all depend on
 * it, so a regression here silently reports "runtime missing" (or crashes) on a
 * correctly configured machine, and there is no unit coverage to catch it.
 *
 * These tests spawn real throwaway executables from a temp directory placed at the
 * front of PATH, so command resolution, --help probing, stdin delivery and retry
 * behaviour are exercised for real rather than mocked. Nothing is written into the
 * repo, and PATH is restored after every test.
 *
 * NOTE: runHarnessWithRetries() falls back to an interactive readline prompt on
 * stdin once retries are exhausted. Every harness test below is constructed so a
 * valid response arrives before the budget runs out; the blocking branch is never
 * entered.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  discoverCapabilities,
  resolveCommand,
  runHarnessWithRetries,
  spawnCollect,
  type RuntimeIntegration
} from "../src/runtimes/common.js";
import { detectAllRuntimes, getRuntimeIntegration, runtimeIntegrations } from "../src/runtimes/index.js";
import { claudeCliRuntime } from "../src/runtimes/claudeCliRuntime.js";
import { geminiCliRuntime } from "../src/runtimes/geminiCliRuntime.js";
import { openclawCliRuntime } from "../src/runtimes/openclawCliRuntime.js";
import type { AMCConfig, RuntimeName } from "../src/types.js";

const createdDirs: string[] = [];
const originalPath = process.env.PATH ?? "";

/** A command name that cannot plausibly exist on any PATH. */
const MISSING = "amc-runtime-adapter-absent-cmd";

function tempBin(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-runtimes-"));
  createdDirs.push(dir);
  process.env.PATH = `${dir}:${originalPath}`;
  return dir;
}

/** Writes an executable node script (shebang points at the running node binary). */
function writeExecutable(dir: string, name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  chmodSync(file, 0o755);
  return file;
}

/** A CLI that prints `helpText` to stdout when asked for --help. */
function writeHelpCli(dir: string, name: string, helpText: string, stream: "stdout" | "stderr" = "stdout", exitCode = 0): string {
  return writeExecutable(
    dir,
    name,
    `process.${stream}.write(${JSON.stringify(helpText)});\nprocess.exit(${exitCode});`
  );
}

function makeConfig(commands: Partial<Record<"claude" | "gemini" | "openclaw" | "mock" | "any", { command: string; argsTemplate?: string[] }>>): AMCConfig {
  const entry = (name: keyof typeof commands, fallback: string) => ({
    command: commands[name]?.command ?? fallback,
    argsTemplate: commands[name]?.argsTemplate ?? []
  });
  return {
    profile: "dev",
    runtimes: {
      claude: entry("claude", `${MISSING}-claude`),
      gemini: entry("gemini", `${MISSING}-gemini`),
      openclaw: entry("openclaw", `${MISSING}-openclaw`),
      mock: entry("mock", `${MISSING}-mock`),
      any: entry("any", `${MISSING}-any`)
    },
    security: { trustBoundaryMode: "isolated" },
    supervise: { extraEnv: {}, includeProxyEnv: false, customBaseUrlEnvKeys: [] }
  };
}

afterEach(() => {
  process.env.PATH = originalPath;
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("discoverCapabilities", () => {
  it("extracts a de-duplicated flag set from the CLI's --help output", () => {
    const dir = tempBin();
    writeHelpCli(
      dir,
      "amc-help-cli",
      [
        "Usage: amc-help-cli [options]",
        "  --help              show help",
        "  --version           print version",
        "  --model <name>      pick a model",
        "  --model sonnet      (repeated on purpose)",
        "  --output-format json",
        "  -p                  short flag, not captured"
      ].join("\n")
    );

    const caps = discoverCapabilities("amc-help-cli");

    expect([...caps.knownFlags].sort()).toEqual(["--help", "--model", "--output-format", "--version"]);
    expect(caps.supportsHelp).toBe(true);
    expect(caps.supportsVersion).toBe(true);
    expect(caps.rawHelp).toContain("Usage: amc-help-cli [options]");
  });

  it("treats help printed on stderr with a non-zero exit as supported", () => {
    const dir = tempBin();
    writeHelpCli(dir, "amc-stderr-cli", "error: missing subcommand\ntry --help or --json-output\n", "stderr", 2);

    const caps = discoverCapabilities("amc-stderr-cli");

    expect(caps.supportsHelp).toBe(true);
    expect(caps.rawHelp).toContain("error: missing subcommand");
    expect([...caps.knownFlags].sort()).toEqual(["--help", "--json-output"]);
  });

  it("returns empty capabilities instead of throwing when the binary cannot be spawned", () => {
    expect(discoverCapabilities(MISSING)).toEqual({
      supportsVersion: false,
      supportsHelp: false,
      knownFlags: [],
      rawHelp: ""
    });
  });

  it("reports supportsVersion for a CLI that only has --verbose (known substring bug)", () => {
    // Characterises a real defect in common.ts:48 — the check is
    // `raw.includes("--version") || raw.includes("-v")`, and "-v" is a substring
    // of "--verbose", "--dry-run -v..." etc. A CLI with no version flag at all is
    // therefore advertised as supporting one. See report.
    const dir = tempBin();
    writeHelpCli(dir, "amc-verbose-cli", "Usage: amc-verbose-cli\n  --verbose   chatty output\n");

    const caps = discoverCapabilities("amc-verbose-cli");

    expect(caps.knownFlags).not.toContain("--version");
    expect(caps.supportsVersion).toBe(true);
  });
});

describe("resolveCommand", () => {
  it("resolves an executable on PATH, and returns null for missing or non-executable files", () => {
    const dir = tempBin();
    const resolved = writeHelpCli(dir, "amc-resolvable-cli", "usage\n");
    const notExecutable = join(dir, "amc-not-executable");
    writeFileSync(notExecutable, "#!/bin/sh\necho hi\n", { mode: 0o644 });
    chmodSync(notExecutable, 0o644);

    expect(resolveCommand("amc-resolvable-cli")).toBe(resolved);
    expect(resolveCommand("amc-not-executable")).toBeNull();
    expect(resolveCommand(MISSING)).toBeNull();
    expect(resolveCommand("")).toBeNull();
  });
});

describe("runtime adapter detect()", () => {
  const adapters: Array<[RuntimeName, RuntimeIntegration]> = [
    ["claude", claudeCliRuntime],
    ["gemini", geminiCliRuntime],
    ["openclaw", openclawCliRuntime]
  ];

  it("reports the resolved path and probed capabilities when the configured CLI exists", () => {
    for (const [name, adapter] of adapters) {
      const dir = tempBin();
      const binary = `amc-${name}-fake`;
      const resolved = writeHelpCli(dir, binary, `Usage: ${binary}\n  --version\n  --print\n`);
      const config = makeConfig({ [name]: { command: binary } });

      const detection = adapter.detect(config);

      expect(detection.available).toBe(true);
      expect(detection.command).toBe(binary);
      expect(detection.resolvedPath).toBe(resolved);
      expect(detection.error).toBeUndefined();
      expect([...detection.capabilities.knownFlags].sort()).toEqual(["--print", "--version"]);
      expect(detection.capabilities.supportsHelp).toBe(true);
    }
  });

  it("reports 'command not found' with zeroed capabilities when the CLI is absent", () => {
    for (const [name, adapter] of adapters) {
      tempBin();
      const config = makeConfig({ [name]: { command: `${MISSING}-${name}` } });

      const detection = adapter.detect(config);

      expect(detection).toEqual({
        available: false,
        command: `${MISSING}-${name}`,
        resolvedPath: null,
        capabilities: { supportsHelp: false, supportsVersion: false, knownFlags: [], rawHelp: "" },
        error: "command not found"
      });
    }
  });

  it("only the claude adapter tolerates a config with no entry for its runtime", () => {
    // claudeCliRuntime.ts:8 uses `config.runtimes.claude?.command ?? "claude"`,
    // while gemini/openclaw/mock dereference their entry directly. A config that
    // predates a runtime key therefore crashes for three adapters out of four.
    const dir = tempBin();
    const resolved = writeHelpCli(dir, "claude", "Usage: claude\n  --version\n");
    const partial = { runtimes: {} } as unknown as AMCConfig;

    const detection = claudeCliRuntime.detect(partial);
    expect(detection.command).toBe("claude");
    expect(detection.available).toBe(true);
    expect(detection.resolvedPath).toBe(resolved);

    expect(() => geminiCliRuntime.detect(partial)).toThrow(TypeError);
    expect(() => openclawCliRuntime.detect(partial)).toThrow(TypeError);
  });
});

describe("runtime registry", () => {
  it("detectAllRuntimes covers every non-mock adapter and drops raw help from the summary", () => {
    const dir = tempBin();
    const resolved = writeHelpCli(dir, "amc-gemini-present", "Usage\n  --version\n");
    const config = makeConfig({ gemini: { command: "amc-gemini-present" } });

    const detections = detectAllRuntimes(config);

    expect(detections.map((entry) => entry.name)).toEqual(["claude", "gemini", "openclaw"]);
    const gemini = detections.find((entry) => entry.name === "gemini");
    expect(gemini).toMatchObject({ available: true, command: "amc-gemini-present", resolvedPath: resolved });
    expect(gemini?.error).toBeUndefined();
    expect(Object.keys(gemini ?? {})).not.toContain("capabilities");

    for (const name of ["claude", "openclaw"]) {
      const entry = detections.find((detection) => detection.name === name);
      expect(entry).toMatchObject({ available: false, resolvedPath: null, error: "command not found" });
      expect(entry?.installHint).toMatch(/Install/i);
    }
  });

  it("getRuntimeIntegration returns the registered adapter and rejects unsupported names", () => {
    expect(getRuntimeIntegration("claude")).toBe(claudeCliRuntime);
    expect(getRuntimeIntegration("gemini")).toBe(geminiCliRuntime);
    expect(runtimeIntegrations.map((runtime) => runtime.name)).toEqual(["claude", "gemini", "openclaw", "mock"]);

    for (const name of ["unknown", "any", "gateway", "sandbox"] as RuntimeName[]) {
      expect(() => getRuntimeIntegration(name)).toThrow(`Unsupported runtime: ${name}`);
    }
  });
});

describe("spawnCollect", () => {
  it("delivers the stdin payload and returns stdout, stderr and the exit code", async () => {
    const dir = tempBin();
    const script = writeExecutable(
      dir,
      "amc-echo-cli",
      [
        'const chunks = [];',
        'process.stdin.on("data", (c) => chunks.push(c));',
        'process.stdin.on("end", () => {',
        '  process.stdout.write("stdin=" + Buffer.concat(chunks).toString("utf8").trim() + "|args=" + process.argv.slice(2).join(","));',
        '  process.stderr.write("warned");',
        '  process.exit(3);',
        "});"
      ].join("\n")
    );

    const result = await spawnCollect(script, ["--flag", "value"], "payload-line\n");

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("stdin=payload-line|args=--flag,value");
    expect(result.stderr).toBe("warned");
  });

  it("resolves with an error result rather than rejecting when the binary is missing", async () => {
    const result = await spawnCollect(MISSING, [], null);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ENOENT");
  });
});

describe("runHarnessWithRetries", () => {
  const schema = z.object({ level: z.number(), note: z.string() });

  it("substitutes {{prompt}} into the args template and extracts JSON from a markdown-wrapped reply", async () => {
    const dir = tempBin();
    writeExecutable(
      dir,
      "amc-harness-args",
      [
        'const prompt = process.argv[3];',
        'process.stdout.write("Sure!\\n```json\\n" + JSON.stringify({ level: 4, note: prompt }) + "\\n```\\nHope that helps.");'
      ].join("\n")
    );
    const config = makeConfig({ claude: { command: "amc-harness-args", argsTemplate: ["--print", "prompt={{prompt}}"] } });

    const result = await runHarnessWithRetries("claude", "assess-me", { config, schema });

    expect(result.value).toEqual({ level: 4, note: "prompt=assess-me" });
    expect(result.attempts).toBe(1);
    expect(result.usedFallback).toBe(false);
  });

  it("retries past unparseable output and schema violations, re-prompting from the original prompt", async () => {
    const dir = tempBin();
    const counter = join(dir, "attempts.txt");
    const promptLog = join(dir, "prompts.jsonl");
    writeExecutable(
      dir,
      "amc-harness-flaky",
      [
        'const fs = require("node:fs");',
        `const counter = ${JSON.stringify(counter)};`,
        `const promptLog = ${JSON.stringify(promptLog)};`,
        'const chunks = [];',
        'process.stdin.on("data", (c) => chunks.push(c));',
        'process.stdin.on("end", () => {',
        '  const prompt = Buffer.concat(chunks).toString("utf8");',
        '  fs.appendFileSync(promptLog, JSON.stringify(prompt) + "\\n");',
        '  let n = 0;',
        '  try { n = Number(fs.readFileSync(counter, "utf8")); } catch { n = 0; }',
        '  fs.writeFileSync(counter, String(n + 1));',
        '  if (n === 0) { process.stdout.write("I am afraid I cannot do that."); }',
        '  else if (n === 1) { process.stdout.write(JSON.stringify({ level: "four", note: 7 })); }',
        '  else { process.stdout.write(JSON.stringify({ level: 4, note: "ok" })); }',
        '  process.exit(0);',
        "});"
      ].join("\n")
    );
    const config = makeConfig({ mock: { command: "amc-harness-flaky", argsTemplate: [] } });

    const result = await runHarnessWithRetries("mock", "score the agent", { config, schema, maxRetries: 2 });

    expect(result.value).toEqual({ level: 4, note: "ok" });
    expect(result.attempts).toBe(3);
    expect(result.usedFallback).toBe(false);

    const prompts = readFileSync(promptLog, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string);
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toBe("score the agent\n");
    expect(prompts[1]).toContain("Return ONLY valid JSON that matches the schema.");
    // The retry prompt is rebuilt from the original prompt, so it must not compound.
    expect(prompts[2]).toBe(prompts[1]);
    expect(readFileSync(counter, "utf8")).toBe("3");
  });

  it("routes unknown/any/gateway/sandbox runtimes to the mock runtime config", async () => {
    const dir = tempBin();
    for (const label of ["mock", "any", "claude"]) {
      writeExecutable(
        dir,
        `amc-harness-${label}`,
        `process.stdout.write(JSON.stringify({ level: 1, note: ${JSON.stringify(label)} }));`
      );
    }
    const config = makeConfig({
      mock: { command: "amc-harness-mock" },
      any: { command: "amc-harness-any" },
      claude: { command: "amc-harness-claude" }
    });

    const viaSandbox = await runHarnessWithRetries("sandbox", "p", { config, schema });
    const viaGateway = await runHarnessWithRetries("gateway", "p", { config, schema });
    const viaAny = await runHarnessWithRetries("any", "p", { config, schema });
    const viaClaude = await runHarnessWithRetries("claude", "p", { config, schema });

    expect(viaSandbox.value.note).toBe("mock");
    expect(viaGateway.value.note).toBe("mock");
    // Surprising: `any` is a real key in AMCConfig.runtimes with its own command,
    // yet common.ts:87 aliases it to "mock", so config.runtimes.any is dead config.
    expect(viaAny.value.note).toBe("mock");
    expect(viaClaude.value.note).toBe("claude");
  });
});

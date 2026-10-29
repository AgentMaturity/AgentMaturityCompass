import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { resolveNativeValidationSelection } from "../src/setup/nativeValidationConfig.js";
import { runNativeInteractiveSession } from "../src/setup/nativeInteractiveSession.js";

// Synthetic terminal/process/setup seams test argv preservation only. They do
// not authenticate a provider, run a repair or verify signed session evidence.
const seam = vi.hoisted(() => ({ answers: [] as string[], commands: [] as string[][] }));
vi.mock("node:readline", async importOriginal => {
  const actual = await importOriginal<typeof import("node:readline")>();
  const { EventEmitter } = await import("node:events");
  return { ...actual, createInterface: () => {
    const terminal = new EventEmitter(); let closed = false;
    return Object.assign(terminal, {
      question: (_prompt: string, _options: unknown, answer: (line: string) => void) => queueMicrotask(() => answer(seam.answers.shift() ?? "/exit")),
      close: () => { if (!closed) { closed = true; terminal.emit("close"); } }
    });
  } };
});
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return { ...actual, spawn: (_executable: string, argv: string[]) => {
    seam.commands.push([...argv]);
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null
    });
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ sessionId: "repair-chat-session", driverStatus: "idle", assistantText: [],
        endings: [{ reason: "complete", turn: 1 }], validation: { status: "passed" } }));
      child.stderr.end(); child.exitCode = 0;
      queueMicrotask(() => child.emit("close", 0));
    });
    return child;
  } };
});
vi.mock("../src/setup/nativeFirstUseGuide.js", () => ({
  inspectNativeFirstUse: async () => ({ status: "ready", agentId: "default", model: "synthetic-model", baseUrl: null, credential: null,
    nextAction: { argv: ["amc", "agent-loop", "run", "--credentials-file", "/synthetic/refs.yaml"] } }),
  renderNativeFirstUseGuide: () => "Synthetic setup only",
  renderNativeGuideCommand: (command: { argv: readonly string[] }) => JSON.stringify(command.argv)
}));
vi.mock("../src/extensions/nativeExtensionRuntime.js", () => ({
  loadNativeExtensions: () => ({ list: () => [], prepareTurn: () => ({ commands: [] }), unloadAll: () => {} }),
  nativeExtensionRunArgv: () => []
}));
vi.mock("../src/skills/skillCatalog.js", () => ({ buildSkillCatalog: () => ({ skills: [], problems: [] }) }));

const roots: string[] = [];
const policy = { maxRounds: 2, maxRequests: 4, maxTokens: 256, timeoutMs: 5000, allowedEditPaths: ["src/public.ts"] };
const check = { id: "public", title: "Public check", command: "node public-check.mjs", timeoutMs: 1000 };
let inputTTY: PropertyDescriptor | undefined, outputTTY: PropertyDescriptor | undefined;
beforeEach(() => {
  inputTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  outputTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  seam.answers = []; seam.commands = [];
});
afterEach(() => {
  for (const [stream, descriptor] of [[process.stdin, inputTTY], [process.stdout, outputTTY]] as const) {
    if (descriptor) Object.defineProperty(stream, "isTTY", descriptor); else Reflect.deleteProperty(stream, "isTTY");
  }
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-validation-repair-options-")); roots.push(root);
  const file = join(root, "checks.json");
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, checks: [check] }));
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  return { root, file, sha256 };
}
function selection(raw: string, f = fixture()) {
  const options = { validationConfig: f.file, validationConfigSha256: f.sha256, validate: ["public"], validationRepair: raw };
  return resolveNativeValidationSelection(options);
}
const option = (args: readonly string[], flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };

describe("explicit native validation repair options", () => {
  test("captures a frozen policy without changing selected public checks or their file pin", () => {
    const f = fixture(); const before = readFileSync(f.file, "utf8");
    const plan = selection(JSON.stringify({ ...policy, maxCostUsd: 0.5 }), f);
    expect(plan).toEqual({ configSha256: f.sha256, checks: [check], repair: { ...policy, maxCostUsd: 0.5 } });
    expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan?.repair)).toBe(true);
    expect(Object.isFrozen(plan?.repair?.allowedEditPaths)).toBe(true);
    expect(readFileSync(f.file, "utf8")).toBe(before);
  });
  test.each([0, 8])("accepts the explicit round boundary %s", maxRounds => {
    expect(selection(JSON.stringify({ ...policy, maxRounds }))?.repair?.maxRounds).toBe(maxRounds);
  });
  test("keeps repair absent unless the operator provides it", () => {
    const f = fixture();
    expect(resolveNativeValidationSelection({ validationConfig: f.file, validate: ["public"] })?.repair).toBeUndefined();
  });
  test("requires an explicit config and selected public checks", () => {
    const validationRepair = JSON.stringify(policy); const f = fixture();
    expect(() => resolveNativeValidationSelection({ validationRepair })).toThrow(/explicit validation config/);
    expect(() => resolveNativeValidationSelection({ validationRepair, validationConfig: f.file })).toThrow(/Select one through eight/);
  });
  test.each([
    { maxRounds: -1 }, { maxRounds: 9 }, { maxRounds: 0.5 }, { maxRounds: "2" },
    { maxRequests: 0 }, { maxRequests: 65 }, { maxRequests: 1.5 },
    { maxTokens: 0 }, { maxTokens: 1_000_001 }, { maxTokens: 1.5 },
    { timeoutMs: 0 }, { timeoutMs: 600_001 }, { timeoutMs: 1.5 },
    { allowedEditPaths: [] }, { allowedEditPaths: Array.from({ length: 33 }, (_, index) => `src/${index}.ts`) },
    { allowedEditPaths: ["src/public.ts", "src/public.ts"] }, { allowedEditPaths: [" "] },
    { allowedEditPaths: ["src/\u0000private.ts"] }, { allowedEditPaths: [123] },
    { maxCostUsd: 0 }, { maxCostUsd: -1 }, { maxCostUsd: "0.5" }, { maxCostUsd: null },
    { replaceChecks: true }, { hiddenFixtures: ["secret-fixtures"] }
  ])("refuses malformed or authority-widening repair policy %#", changed => {
    expect(() => selection(JSON.stringify({ ...policy, ...changed }))).toThrow(/repair policy/);
  });
  test.each(["null", "[]", "{}", '"secret-policy"', '{"secret-policy":', " "])("refuses incomplete or invalid JSON without echoing input %#", raw => {
    expect(() => selection(raw)).toThrow();
    try { selection(raw); } catch (error) { expect(String(error)).not.toContain("secret-policy"); }
  });
  test.each([
    JSON.stringify(policy).replace('"maxRounds":2', '"maxRounds":1,"maxRounds":2'),
    JSON.stringify(policy).replace('"maxRounds":2', '"maxRounds":1,"max\\u0052ounds":2'),
    JSON.stringify(policy).replace('"allowedEditPaths":', '"allowedEditPaths":["src/other.ts"],"allowedEditPaths":')
  ])("refuses duplicate JSON members before admitting a repair policy %#", raw => {
    expect(() => selection(raw)).toThrow(/duplicate JSON object members/);
  });
  test("rejects nonfinite spend instead of silently dropping its bound", () => {
    const raw = JSON.stringify(policy).replace(/}$/, ',"maxCostUsd":1e999}');
    expect(() => selection(raw)).toThrow(/repair policy/);
  });
  test.each(["run", "chat"])("exposes repair on the existing %s command", name => {
    const program = new Command(); registerAgentCommands(program, { log: () => {}, error: () => {}, fail: () => {} });
    const command = program.commands.find(candidate => candidate.name() === "agent-loop")!.commands.find(candidate => candidate.name() === name)!;
    const raw = JSON.stringify(policy);
    expect(command.parseOptions(["--validation-repair", raw]).unknown).toEqual([]);
    expect(command.opts().validationRepair).toBe(raw);
  });
  test("forwards the frozen repair JSON and validation pins through chat child and printed resume argv", async () => {
    const f = fixture(); const validationRepair = JSON.stringify({ ...policy, maxCostUsd: 0.5 }, null, 2);
    const frozen = JSON.stringify({ ...policy, maxCostUsd: 0.5 });
    for (const stream of [process.stdin, process.stdout]) Object.defineProperty(stream, "isTTY", { configurable: true, value: true });
    seam.answers = ["repair this public failure", "/exit"];
    const logs: string[] = []; const fail = vi.fn();
    await runNativeInteractiveSession({ workspace: f.root, provider: "stub", validationConfig: f.file,
      validationConfigSha256: f.sha256, validate: ["public"], validationRepair }, { log: line => logs.push(line), error: line => logs.push(line), fail });
    expect(seam.commands).toHaveLength(1);
    const resume = JSON.parse(logs.find(line => line.startsWith("Resume in this workspace:"))!.split("\n  ")[1]!) as string[];
    for (const argv of [seam.commands[0]!, resume]) {
      expect(option(argv, "--validation-repair")).toBe(frozen);
      expect(option(argv, "--validation-config")).toBe(f.file);
      expect(option(argv, "--validation-config-sha256")).toBe(f.sha256);
      expect(option(argv, "--validate")).toBe("public");
    }
    expect(fail).not.toHaveBeenCalled();
  });
});

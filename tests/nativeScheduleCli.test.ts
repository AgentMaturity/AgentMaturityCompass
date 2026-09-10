// AMC-1548 / task11: AUTHORED UNEXECUTED. These are future fixture operations, not authoring-time runs.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { registerNativeScheduleCommands } from "../src/cli-native-schedule-commands.js";
import { readSchedules, saveSchedules, schedulesPath, scheduleStatus } from "../src/autonomy/scheduleStore.js";
import { loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { stubProviderRoute, STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../src/agent/stubProvider.js";
import { bodyFromChunks, type HttpTransport } from "../src/llm/adapter/transport.js";
import { readAgentRunSummary, verifyAgentRun } from "../src/agent/runReport.js";
import type { ComposedTurnOptions } from "../src/kernel/agentLoopRunner.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-schedule-cli-fixture-only");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-schedule-cli-")));
  dirs.push(dir); initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" }); return dir;
}
const definition = (enabled = false) => ({ id: "review", runAs: "reader", goal: "summarize this local demonstration",
  maxRounds: 2, everyMs: 60_000, enabled, scope: ["READ_ONLY"] });
function pins(dir: string) {
  const read = readSchedules(dir); if (!read.ok) throw new Error(read.reason);
  const tools = loadVerifiedToolsConfigSnapshot(dir);
  if (!tools.signatureValid || tools.config === null || !tools.digestSha256) throw new Error("fixture requires signed tools");
  return { schedules: read.digest, tools: tools.digestSha256 };
}
function io() { return { log: vi.fn((_line: string) => {}), error: vi.fn((_line: string) => {}), fail: vi.fn(() => {}) }; }
function cli(dir: string, extra: Parameters<typeof registerNativeScheduleCommands>[2] = {}) {
  const output = io(); const program = new Command().exitOverride();
  const loadRuntime = vi.fn(async () => { throw new Error("runtime must not load for this operation"); });
  registerNativeScheduleCommands(program, output, { workspace: () => dir, now: () => 1_000_000, loadRuntime, ...extra });
  return { output, loadRuntime, parse: (...args: string[]) => program.parseAsync(["node", "amc", "native-schedule", ...args]) };
}
const executionArgs = (pin: ReturnType<typeof pins>) => ["--agent", "default", "--provider", "stub",
  "--approve-tools", "READ_ONLY", "--expect-digest", pin.schedules, "--expect-tools-digest", pin.tools];

describe("the native public management contract", () => {
  it("is registered from the actual agent CLI without starting work or signing a configuration", () => {
    const program = new Command(); const timer = vi.spyOn(globalThis, "setTimeout"); const output = io();
    registerAgentCommands(program, output);
    expect(program.commands.find(command => command.name() === "native-schedule")?.commands.map(command => command.name()))
      .toEqual(expect.arrayContaining(["list", "inspect-file", "put", "enable", "disable", "remove", "reset-failures", "run-due", "watch"]));
    expect(timer).not.toHaveBeenCalled(); expect(output.log).not.toHaveBeenCalled();
  });

  it("previews, signs a disabled definition, enables, disables and removes through current digest pins", async () => {
    const dir = workspace(); const input = join(dir, "review.json"); const bytes = JSON.stringify(definition()); writeFileSync(input, bytes);
    const command = cli(dir);
    await command.parse("inspect-file", input);
    const inspected = JSON.parse(command.output.log.mock.calls.at(-1)![0]);
    expect(inspected.inputSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(existsSync(schedulesPath(dir))).toBe(false);
    await command.parse("put", input, "--expect-input-sha256", inspected.inputSha256, "--expect-digest", "absent");
    expect(scheduleStatus(dir, 1_000_000).schedules[0]?.enabled).toBe(false);
    for (const verb of ["enable", "disable", "remove"]) {
      await command.parse(verb, "review", "--expect-digest", pins(dir).schedules);
    }
    expect(scheduleStatus(dir, 1_000_000).schedules).toEqual([]);
    expect(command.output.fail).not.toHaveBeenCalled(); expect(command.loadRuntime).not.toHaveBeenCalled();
    expect(existsSync(join(dir, ".amc", "schedule-state.json"))).toBe(false);
  });

  it("rejects changed input and stale policy without signing a replacement or loading a runtime", async () => {
    const dir = workspace(); saveSchedules(dir, [definition()]); const command = cli(dir);
    const before = readFileSync(schedulesPath(dir), "utf8"); const input = join(dir, "review.json"); writeFileSync(input, JSON.stringify(definition(true)));
    await command.parse("put", input, "--expect-input-sha256", "0".repeat(64), "--expect-digest", pins(dir).schedules);
    await command.parse("enable", "review", "--expect-digest", "0".repeat(64));
    expect(command.output.fail).toHaveBeenCalledTimes(2);
    expect(readFileSync(schedulesPath(dir), "utf8")).toBe(before); expect(command.loadRuntime).not.toHaveBeenCalled();
  });

  it("does no runtime work for a valid pass with no due schedules and refuses changed signed tools", async () => {
    const dir = workspace(); saveSchedules(dir, [definition()]); const command = cli(dir); const pin = pins(dir);
    await command.parse("run-due", ...executionArgs(pin));
    expect(JSON.parse(command.output.log.mock.calls.at(-1)![0])).toMatchObject({ sessionId: null, scheduleResults: [] });
    expect(command.loadRuntime).not.toHaveBeenCalled();
    await command.parse("run-due", ...executionArgs({ ...pin, tools: "0".repeat(64) }));
    expect(command.output.fail).toHaveBeenCalledTimes(1); expect(command.loadRuntime).not.toHaveBeenCalled();
  });

  it("removes signal listeners when a foreground owner fails to load", async () => {
    const dir = workspace(); saveSchedules(dir, [definition(true)]); const command = cli(dir);
    const before = { int: process.listenerCount("SIGINT"), term: process.listenerCount("SIGTERM") };
    await command.parse("watch", ...executionArgs(pins(dir)), "--poll-ms", "1000");
    expect(command.loadRuntime).toHaveBeenCalledTimes(1); expect(command.output.fail).toHaveBeenCalledTimes(1);
    expect(process.listenerCount("SIGINT")).toBe(before.int); expect(process.listenerCount("SIGTERM")).toBe(before.term);
  });
});

/** The stub adapter receives a no-tool answer over its real transport seam. No provider or model is contacted. */
const textOnlyTransport: HttpTransport = async request => {
  const reply = { ...JSON.parse(request.body.toString("utf8")), tools: [] };
  return { status: 200, headers: { "content-type": "application/json" }, body: bodyFromChunks([JSON.stringify(reply)]) };
};

describe("public due execution reaches the existing native composed lifecycle", () => {
  it("runs bounded native child sessions, records their actual IDs, closes claims and does not repeat the same occurrence", async () => {
    const dir = workspace(); saveSchedules(dir, [definition(true)]);
    const { runComposedTurn } = await import("../src/kernel/agentLoopRunner.js");
    const observed: ComposedTurnOptions[] = [];
    const command = cli(dir, { loadRuntime: async () => ({ runComposedTurn: async options => {
      observed.push(options); return runComposedTurn({ ...options, transport: textOnlyTransport });
    } }) });
    const pin = pins(dir); await command.parse("run-due", ...executionArgs(pin));
    expect(command.output.fail).not.toHaveBeenCalled(); expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ agentId: "default", prompt: "", approvalGate: { actionClass: "READ_ONLY" },
      schedulePass: { expectedSchedulesDigest: pin.schedules, expectedToolsDigest: pin.tools }, config: { maxStepsPerTurn: 8 } });
    expect(observed[0]?.delegation).toBeUndefined(); expect(observed[0]?.approvalGate?.answerers).toBeUndefined();
    const result = JSON.parse(command.output.log.mock.calls.at(-1)![0]);
    expect(result.scheduleResults[0]).toMatchObject({ scheduleId: "review", rounds: 2, ok: true, stoppedBy: "max-rounds" });
    expect(result.scheduleResults[0].childSessionIds).toHaveLength(2);
    for (const sessionId of result.scheduleResults[0].childSessionIds as string[]) {
      const child = readAgentRunSummary(dir, sessionId, "idle");
      expect(child.unsignedRows).toBe(0); expect(child.endings.at(-1)?.reason).toBe("complete");
      expect((await verifyAgentRun(dir, sessionId)).ok).toBe(true);
    }
    const state = scheduleStatus(dir, 1_000_000);
    expect(state.interrupted).toEqual([]); expect(state.schedules[0]?.lastOutcome?.sessionId).toBe(result.sessionId);
    await command.parse("run-due", ...executionArgs(pin)); expect(observed).toHaveLength(1);
    expect(JSON.parse(command.output.log.mock.calls.at(-1)![0]).scheduleResults).toEqual([]);
  });

  it("refuses a missing approval gate or an alternate runner before any native dispatch", async () => {
    const dir = workspace(); saveSchedules(dir, [definition(true)]); const pin = pins(dir);
    const { runComposedTurn } = await import("../src/kernel/agentLoopRunner.js"); const transport = vi.fn(textOnlyTransport);
    const base: ComposedTurnOptions = { workspace: dir, agentId: "default", prompt: "",
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 128 } },
      routes: [stubProviderRoute()], transport,
      schedulePass: { now: 1_000_000, expectedSchedulesDigest: pin.schedules, expectedToolsDigest: pin.tools } };
    await expect(runComposedTurn(base)).rejects.toThrow(/signed approval gate/);
    await expect(runComposedTurn({ ...base, approvalGate: { actionClass: "READ_ONLY", riskTier: "high" },
      delegation: { grant: () => {}, runner: async () => ({ ok: true, text: "must never execute" }) } })).rejects.toThrow(/signed approval gate/);
    expect(transport).not.toHaveBeenCalled(); expect(scheduleStatus(dir, 1_000_000).interrupted).toEqual([]);
  });
});

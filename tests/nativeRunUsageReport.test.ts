import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAgentRunSummary, renderRunSummary } from "../src/agent/runReport.js";
import { registerSessionCommands } from "../src/cli-session-commands.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { jsonlRoot } from "../src/persistence/jsonl/jsonlEventLog.js";
import { lockVault } from "../src/vault/vault.js";
import { loopHarness, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

// Actual native writer/read-back composition with a scripted in-process adapter.
// No real provider, installed package, recovery acceptance or cryptographic
// qualification is implied by these source regressions.
const fixtures: LoopHarness[] = [];
const roots: string[] = [];
const initialExitCode = process.exitCode;
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) {
    await fixture.driver.whenIdle();
    fixture.finish();
    lockVault(fixture.dir);
    rmSync(fixture.dir, { recursive: true, force: true });
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  process.exitCode = initialExitCode;
});

function snapshot(workspace: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  function take(path: string): void {
    if (!existsSync(path)) { result[path] = null; return; }
    const stat = statSync(path);
    if (stat.isDirectory()) { for (const name of readdirSync(path).sort()) take(join(path, name)); return; }
    result[path] = { sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), mtimeMs: stat.mtimeMs };
  }
  for (const path of [join(workspace, ".amc", "session-store.json"), join(workspace, ".amc", "evidence.sqlite"),
    join(workspace, ".amc", "keys"), jsonlRoot(workspace)]) take(path);
  return result;
}

async function run(backend: "sqlite" | "jsonl"): Promise<LoopHarness> {
  const root = mkdtempSync(join(tmpdir(), "amc-native-report-control-")); roots.push(root);
  vi.stubEnv("AMC_SESSION_STORE", backend);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-report-fixture-only");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_NO_SIGN", undefined);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  const fixture = loopHarness({ scripts: [textStep("Recorded backend reply.", {
    inputTokens: 20, outputTokens: 8, cacheReadTokens: 50, cacheWriteTokens: 10
  })] });
  fixtures.push(fixture);
  fixture.driver.followup("Exercise the source read-back fixture.");
  await fixture.driver.whenIdle();
  return fixture;
}

describe.each(["sqlite", "jsonl"] as const)("native %s read-back surfaces", backend => {
  it("shows the recorded reply and usage without taking the active session's writer", async () => {
    const fixture = await run(backend);
    const before = snapshot(fixture.dir);
    const summary = readAgentRunSummary(fixture.dir, fixture.sessionId, fixture.driver.status);
    expect(summary.assistantText).toContain("Recorded backend reply.");
    expect(summary.requests).toBe(1);
    expect(summary.usage).toMatchObject({ scope: "recorded-session", status: "recorded", reportedRequests: 1,
      totals: { cacheReadTokens: { observedTokens: 50 }, cacheWriteTokens: { observedTokens: 10 } },
      cache: { readShare: 0.625, readTokens: 50, inputTokens: 80 } });
    expect(renderRunSummary(summary)).toContain("62.50% (50/80 tokens");
    const recorded = readNativeSessionEvents(fixture.dir, fixture.sessionId);
    const header = recorded.find(row => row.event_type === "request/header")!;
    const outcome = recorded.find(row => row.event_type === "request/response")!;
    const headerMeta = JSON.parse(header.meta_json), outcomeMeta = JSON.parse(outcome.meta_json);
    expect(summary.usage?.requestReports).toEqual([expect.objectContaining({
      headerEventId: header.id, outcomeEventId: outcome.id,
      providerId: headerMeta.providerId, model: headerMeta.model,
      encoderId: headerMeta.encoderId, encoderVersion: headerMeta.encoderVersion,
      adapterId: outcomeMeta.adapterId, adapterVersion: outcomeMeta.adapterVersion,
      outcome: "completed", usageStatus: "complete", cacheReadTokens: 50
    })]);
    expect(summary.usage?.requestCache).toMatchObject({ hitRequests: 1, eligibleRequests: 1, hitRate: 1 });
    expect(renderRunSummary(summary)).toContain(`provider ${headerMeta.providerId}; model ${headerMeta.model}`);
    expect(renderRunSummary(summary)).toContain(`request/header ${header.id}; outcome ${outcome.id}`);
    expect(renderRunSummary(summary)).toContain("Request cache-read hit rate: 100.00% (1/1");
    expect(snapshot(fixture.dir)).toEqual(before);
    // The original writer still owns the session; the reader did not fence it.
    fixture.driver.followup("The original writer can continue.");
    await fixture.driver.whenIdle();
    const continued = readAgentRunSummary(fixture.dir, fixture.sessionId, fixture.driver.status);
    expect(continued.requests).toBe(2);
    expect(continued.assistantText).toHaveLength(2);
  });

  it("exposes the same cold history and usage through the actual session-show command handler", async () => {
    const fixture = await run(backend); fixture.finish();
    const expected = readAgentRunSummary(fixture.dir, fixture.sessionId, "idle");
    const before = snapshot(fixture.dir);
    vi.stubEnv("AMC_SESSION_STORE", backend === "jsonl" ? "sqlite" : "jsonl");
    vi.spyOn(process, "cwd").mockReturnValue(fixture.dir);
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation(value => { output.push(String(value)); });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const program = new Command(); registerSessionCommands(program);
    await program.parseAsync(["node", "amc", "session", "show", fixture.sessionId, "--json"]);
    expect(errors).not.toHaveBeenCalled();
    expect(output).toHaveLength(1);
    const result = JSON.parse(output[0]!);
    expect(result.sessionId).toBe(fixture.sessionId);
    expect(result.spine.length).toBe(expected.events);
    expect(result.history.some((row: { role: string }) => row.role === "assistant")).toBe(true);
    expect(result.usage).toEqual(expected.usage);
    expect(result.usage.requestReports).toHaveLength(1);
    expect(result.usage.requestReports[0].headerEventId).toBe(expected.usage!.requestReports![0]!.headerEventId);
    expect(result.usage.requestCache).toMatchObject({ hitRequests: 1, eligibleRequests: 1, hitRate: 1 });
    output.length = 0;
    const textProgram = new Command(); registerSessionCommands(textProgram);
    await textProgram.parseAsync(["node", "amc", "session", "show", fixture.sessionId]);
    expect(errors).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain(`request/header ${expected.usage!.requestReports![0]!.headerEventId}`);
    expect(output.join("\n")).toContain("Request cache-read hit rate: 100.00% (1/1");
    expect(snapshot(fixture.dir)).toEqual(before);
  });
});

it("does not silently switch to SQLite after a malformed recorded backend marker", () => {
  const root = mkdtempSync(join(tmpdir(), "amc-native-marker-read-")); roots.push(root);
  mkdirSync(join(root, ".amc"));
  const marker = join(root, ".amc", "session-store.json");
  writeFileSync(marker, '{"backend":"unrecognized"}\n');
  const before = snapshot(root);
  expect(() => readNativeSessionEvents(root, "missing")).toThrow("session-store marker is invalid");
  expect(snapshot(root)).toEqual(before);
  expect(existsSync(join(root, ".amc", "evidence.sqlite"))).toBe(false);
});

it("does not create a store or keys when reading an uninitialized workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "amc-native-empty-read-")); roots.push(root);
  const before = readdirSync(root);
  expect(() => readNativeSessionEvents(root, "missing")).toThrow();
  expect(readdirSync(root)).toEqual(before);
});

it("reports a missing session from its selected history without creating it", async () => {
  const fixture = await run("jsonl"); fixture.finish();
  const before = snapshot(fixture.dir);
  vi.spyOn(process, "cwd").mockReturnValue(fixture.dir);
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => { errors.push(String(value)); });
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command(); registerSessionCommands(program);
  await program.parseAsync(["node", "amc", "session", "show", "absent-session", "--json"]);
  expect(process.exitCode).toBe(1);
  expect(errors.join("\n")).toContain("No events found for session absent-session");
  expect(output).not.toHaveBeenCalled();
  expect(snapshot(fixture.dir)).toEqual(before);
});

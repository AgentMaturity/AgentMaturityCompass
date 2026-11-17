// `amc drift check --against observed` (src/watch/observedChangeCli.ts) and `amc connect --print-env --runtime`
// (src/watch/otlpConnect.ts), run in-process against a real temp workspace and ledger.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ensureLeaseRevocationStore } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { writeStudioState } from "../src/studio/studioState.js";
import { lockVault } from "../src/vault/vault.js";
import { printObservedDriftCheck } from "../src/watch/observedChangeCli.js";
import { otlpConnectEnvLines, printOtlpConnect } from "../src/watch/otlpConnect.js";
import { initWorkspace } from "../src/workspace.js";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const HOUR = 3_600_000;
let workspace = "";
let logged: string[] = [];

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-observed-otlp-floor");
  vi.stubEnv("AMC_AGENT_ID", undefined);
  vi.stubEnv("AMC_STUDIO_PORT", undefined);
  workspace = mkdtempSync(join(tmpdir(), "amc-floor-observed-"));
  initWorkspace({ workspacePath: workspace, agentId: "agent-a", trustBoundaryMode: "isolated", witnessing: false });
  logged = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
});

afterEach(() => {
  process.exitCode = undefined;
  lockVault(workspace);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
});

function addRows(rows: Array<{ type: "llm_response" | "audit" | "tool_result"; meta: Record<string, unknown>; ts: number }>): void {
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "observed-floor", runtime: "unknown", binaryPath: "fixture", binarySha256: "0".repeat(64) });
    for (const row of rows) ledger.appendEvidence({ sessionId: "observed-floor", runtime: "unknown", eventType: row.type, inline: true, payload: "fixture", meta: row.meta, ts: row.ts });
  } finally {
    ledger.close();
  }
}

describe("printObservedDriftCheck", () => {
  test("no rows: says there is nothing to compare and exits 3, in text and in JSON", () => {
    expect(printObservedDriftCheck({ workspace, agentId: "agent-a", window: "24h", now: NOW })).toBe(3);
    const text = logged.join("\n");
    expect(text).toContain("What AMC recorded for agent agent-a in the last 24h (0 row(s)):");
    expect(text).toContain("Tool calls decided: 0; denied 0 (not recorded); sent to a person 0");
    expect(text).toContain("Tokens per task: not recorded over 0 task(s)");
    expect(text).toContain("Nothing to compare yet");
    expect(text).not.toContain("No observed change");

    logged = [];
    expect(printObservedDriftCheck({ workspace, agentId: "agent-a", window: "24h", json: true, now: NOW })).toBe(3);
    const parsed = JSON.parse(logged.join("\n")) as Record<string, unknown>;
    expect(parsed).toMatchObject({ agentId: "agent-a", rowsRead: 0, truncated: false, observedChanges: [], label: "observed change, not a diagnosis" });
    expect(parsed.window).toEqual({ since: new Date(NOW - 24 * HOUR).toISOString(), until: new Date(NOW).toISOString() });
  });

  test("steady rows: prints the rates and says no observed change; another agent's rows are not counted", () => {
    addRows([
      { type: "audit", meta: { agentId: "agent-a", controlSchemaVersion: 2, decision: "deny" }, ts: NOW - HOUR },
      { type: "audit", meta: { agentId: "agent-a", controlSchemaVersion: 2, decision: "allow" }, ts: NOW - HOUR },
      { type: "audit", meta: { agentId: "agent-a", approvalControlSchemaVersion: 1, decision: "ask" }, ts: NOW - HOUR },
      { type: "tool_result", meta: { agentId: "agent-a", postExecutionSchemaVersion: 1, reported: { outcome: "failed" } }, ts: NOW - HOUR },
      { type: "llm_response", meta: { agentId: "agent-a", statusCode: 200, model: "m", usage: { input_tokens: 30, output_tokens: 10 }, refusal: false, run_id: "r1" }, ts: NOW - HOUR },
      { type: "llm_response", meta: { agentId: "agent-b", statusCode: 200, model: "m", refusal: true, run_id: "r9" }, ts: NOW - HOUR },
      // Outside the window: not read.
      { type: "audit", meta: { agentId: "agent-a", controlSchemaVersion: 2, decision: "deny" }, ts: NOW - 30 * HOUR }
    ]);
    expect(printObservedDriftCheck({ workspace, agentId: "agent-a", window: "24h", now: NOW })).toBe(0);
    const text = logged.join("\n");
    expect(text).toContain("(5 row(s)):");
    expect(text).toContain("Tool calls decided: 3; denied 1 (33.3%); sent to a person 1");
    expect(text).toContain("Tool calls reported back: 1; failed 1 (100.0%); outcome not reported 0");
    expect(text).toContain("Model replies through the gateway: 1; refusals 0 (0.0%); no stop reason recorded 0");
    expect(text).toContain("Tokens per task: 40 over 1 task(s)");
    expect(text).toContain("No observed change in these numbers.");
    expect(text).toContain("Run amc verify to check the records.");
  });

  test("a switch of the model named in most replies is printed as an observed change note, never a cause", () => {
    addRows(Array.from({ length: 48 }, (_, index) => ({ type: "llm_response" as const, ts: NOW - 24 * HOUR + index * 30 * 60_000 + 60_000,
      meta: { agentId: "agent-a", statusCode: 200, model: index < 24 ? "model-x" : "model-y", usage: { total_tokens: 10 }, refusal: false, run_id: `t${index}` } })));
    expect(printObservedDriftCheck({ workspace, agentId: "agent-a", window: "24h", now: NOW })).toBe(0);
    const text = logged.join("\n");
    expect(text).toMatch(/^- Observed change: the model named in most replies went from model-x to model-y/m);
    expect(text).not.toContain("No observed change");

    logged = [];
    expect(printObservedDriftCheck({ workspace, agentId: "agent-a", window: "24h", json: true, now: NOW })).toBe(0);
    const parsed = JSON.parse(logged.join("\n")) as { rowsRead: number; observedChanges: Array<{ metric: string; before: string; after: string }> };
    expect(parsed.rowsRead).toBe(48);
    expect(parsed.observedChanges.map((note) => [note.metric, note.before, note.after])).toEqual([["response model", "model-x", "model-y"]]);
  });

  test("a malformed window is refused before anything is read", () => {
    expect(() => printObservedDriftCheck({ workspace, agentId: "agent-a", window: "soon", now: NOW })).toThrow(/Invalid window format/);
    expect(logged).toEqual([]);
  });
});

describe("printOtlpConnect and otlpConnectEnvLines", () => {
  let stdout: string[];
  let stderr: string[];
  beforeEach(() => {
    ensureLeaseRevocationStore(workspace);
    stdout = []; stderr = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string) => { stdout.push(String(chunk)); return true; }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string) => { stderr.push(String(chunk)); return true; }) as typeof process.stderr.write);
  });

  test("--runtime without --print-env alone is refused with the right form, exit 1, nothing on stdout", () => {
    for (const opts of [{ printEnv: false, printCmd: false, status: false }, { printEnv: true, printCmd: true, status: false }, { printEnv: true, printCmd: false, status: true }]) {
      stdout = []; stderr = []; process.exitCode = undefined;
      printOtlpConnect(workspace, "agent-a", { runtime: "claude-code", ...opts });
      expect(stdout).toEqual([]);
      expect(stderr.join("")).toContain("--runtime goes with --print-env alone, for example: amc connect --print-env --runtime claude-code");
      expect(process.exitCode).toBe(1);
    }
  });

  test("Codex, an unknown runtime and a missing runtime are refused with exit 1 and nothing on stdout", () => {
    printOtlpConnect(workspace, "agent-a", { runtime: "codex", printEnv: true, printCmd: false, status: false });
    expect(stderr.join("")).toContain("amc connect hooks install --provider codex --mode observe");
    expect(process.exitCode).toBe(1);
    stderr = []; process.exitCode = undefined;
    printOtlpConnect(workspace, "agent-a", { runtime: "otel-grpc", printEnv: true, printCmd: false, status: false });
    expect(stderr.join("")).toBe("Unknown --runtime \"otel-grpc\". Use one of: claude-code, gemini-cli, otel, codex.\n");
    expect(process.exitCode).toBe(1);
    stderr = []; process.exitCode = undefined;
    printOtlpConnect(workspace, "agent-a", { printEnv: true, printCmd: false, status: false });
    expect(stderr.join("")).toContain("Unknown --runtime \"\"");
    expect(stdout).toEqual([]);
  });

  test("claude-code prints export lines on stdout and the lease note on stderr, with the AMC_STUDIO_PORT port", () => {
    vi.stubEnv("AMC_STUDIO_PORT", "4123");
    printOtlpConnect(workspace, "agent-a", { runtime: "claude-code", printEnv: true, printCmd: false, status: false });
    const out = stdout.join("");
    expect(out).toContain("export CLAUDE_CODE_ENABLE_TELEMETRY=1\n");
    expect(out).toContain("export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4123\n");
    expect(out).toMatch(/export OTEL_EXPORTER_OTLP_HEADERS='x-amc-lease=[^']+'\n$/);
    expect(stderr.join("")).toContain("lease for 8 hours");
    expect(stderr.join("")).toContain("self-reported");
    expect(process.exitCode).toBeUndefined();
  });

  test("gemini-cli gets its own variables and the protobuf caveat; otel adds the traces exporter", () => {
    const gemini = otlpConnectEnvLines({ workspace, agentId: "agent-a", runtime: "gemini-cli" });
    expect(gemini[0]).toMatch(/^# Gemini CLI's page does not say/);
    expect(gemini).toContain("export GEMINI_TELEMETRY_OTLP_PROTOCOL=http");
    expect(gemini).toContain("export GEMINI_TELEMETRY_OTLP_ENDPOINT=http://127.0.0.1:3212");
    expect(gemini.some((line) => line.startsWith("export OTEL_"))).toBe(false);
    const otel = otlpConnectEnvLines({ workspace, agentId: "agent-a", runtime: "otel" });
    expect(otel[0]).toBe("export OTEL_TRACES_EXPORTER=otlp");
    expect(otel.some((line) => line.includes("CLAUDE_CODE"))).toBe(false);
  });

  test("an out-of-range AMC_STUDIO_PORT falls back to 3212; a running Studio's own port wins over the variable", () => {
    vi.stubEnv("AMC_STUDIO_PORT", "70000");
    expect(otlpConnectEnvLines({ workspace, agentId: "agent-a", runtime: "otel" })).toContain("export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:3212");
    vi.stubEnv("AMC_STUDIO_PORT", "4123");
    writeStudioState(workspace, { pid: process.pid, apiPort: 4567 } as unknown as Parameters<typeof writeStudioState>[1]);
    expect(otlpConnectEnvLines({ workspace, agentId: "agent-a", runtime: "otel" })).toContain("export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4567");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerSessionCommands } from "../src/cli-session-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";

let workspace: string, writer: SessionService;
const oldExitCode = process.exitCode;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-wp20-cli-page");
  for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
  workspace = mkdtempSync(join(tmpdir(), "amc-page-cli-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  writer = new SessionService(workspace, openSessionEventStore(workspace, "jsonl"));
  writer.open({ sessionId: "cli-page-session", agentId: "default", harnessVersion: "fixture", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
});
afterEach(() => {
  writer.disposeWithoutClosing(); lockVault(workspace); vi.restoreAllMocks(); vi.unstubAllEnvs();
  process.exitCode = oldExitCode; rmSync(workspace, { recursive: true, force: true });
});
async function show(args: string[]) {
  const program = new Command().exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerSessionCommands(program);
  const log = vi.spyOn(console, "log").mockImplementation(() => {}), error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "cwd").mockReturnValue(workspace);
  await program.parseAsync(["node", "amc", "session", "show", writer.sessionId, ...args]);
  return { log, error };
}
test("existing session show exposes the same verified committed page contract", async () => {
  const { log } = await show(["--json", "--limit", "1"]);
  const page = JSON.parse(String(log.mock.calls[0]![0]));
  expect(page).toMatchObject({ format: "amc-session-event-page-v1", sessionId: writer.sessionId, agentId: "default", committed: true, firstSeq: 0, nextSeq: 1, nextCursor: null });
  expect(typeof page.resumeCursor).toBe("string"); expect(page.state.usage.pendingRequests).toBe(0);
});
test("paged inspection refuses a malformed cursor instead of showing a successful prefix", async () => {
  const { log, error } = await show(["--json", "--cursor", "forged"]);
  expect(log).not.toHaveBeenCalled(); expect(error.mock.calls.flat().join(" ")).toContain("INVALID_INPUT"); expect(process.exitCode).toBe(1);
});
test("page flags require JSON and reject unbounded limits before reading", async () => {
  const { log, error } = await show(["--limit", "257"]);
  expect(log).not.toHaveBeenCalled(); expect(error.mock.calls.flat().join(" ")).toContain("--json"); expect(process.exitCode).toBe(1);
});

test("JSON page inspection rejects a limit outside the bound", async () => {
  const { log, error } = await show(["--json", "--limit", "257"]);
  expect(log).not.toHaveBeenCalled(); expect(error.mock.calls.flat().join(" ")).toContain("Choose a page limit"); expect(process.exitCode).toBe(1);
});

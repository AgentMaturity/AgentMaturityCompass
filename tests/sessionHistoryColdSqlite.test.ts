import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { SqliteSessionEventStore } from "../src/persistence/sqliteSessionEventStore.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";

let workspace: string, database: string, wal: string;
beforeEach(() => {
  vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_NO_SIGN", undefined);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "disposable-cold-history-fixture");
  workspace = mkdtempSync(join(tmpdir(), "amc-cold-sqlite-history-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(workspace);
  session.open({ sessionId: "cold-subject", agentId: "default", harnessVersion: "fixture",
    compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
  session.startTurn({ trigger: "user" }); session.recordUserMessage("persisted fixture only");
  session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "fixture finished" });
  closeAllSqlitePools(); lockVault(workspace);
  database = join(workspace, ".amc/evidence.sqlite"); wal = database + "-wal";
  expect(existsSync(wal)).toBe(false);
});
afterEach(() => {
  vi.restoreAllMocks(); closeAllSqlitePools(); lockVault(workspace); vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
});

test("cold first SQLite read tolerates only its newly empty coordination WAL", () => {
  const before = readFileSync(database);
  const result = loadSessionEventHistory({ workspace, sessionId: "cold-subject", requireSealed: true });
  expect(result.events.map(row => row.event_type)).toEqual(["session/open", "turn/start", "user/message", "turn/end", "turn/seal", "session/close"]);
  expect(result.verification.payloads).toBe("not-read");
  expect(statSync(wal).size).toBe(0); expect(readFileSync(database)).toEqual(before);
});

test("a separate built native-SDK process cold-loads without a vault passphrase or warm connection", async () => {
  const code = `import {loadSessionEventHistory} from 'agent-maturity-compass/sdk/native';
    const result=loadSessionEventHistory({workspace:process.argv[1],sessionId:'cold-subject',agentId:'default',requireSealed:true});
    console.log(JSON.stringify({pid:process.pid,ids:result.events.map(row=>row.id),verification:result.verification}));`;
  const result = await new Promise<{ exit: number | null; stdout: string; stderr: string }>((done, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, workspace], {
      stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH, HOME: workspace, AMC_SESSION_STORE: "sqlite" }
    });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.stdout.on("data", chunk => { stdout += String(chunk); if (stdout.length > 100_000) child.kill("SIGKILL"); });
    child.stderr.on("data", chunk => { stderr += String(chunk); if (stderr.length > 100_000) child.kill("SIGKILL"); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", exit => { clearTimeout(timer); done({ exit, stdout, stderr }); });
  });
  expect(result.exit, result.stderr).toBe(0);
  const loaded = JSON.parse(result.stdout) as { pid: number; ids: string[]; verification: { payloads: string } };
  expect(loaded.pid).not.toBe(process.pid); expect(loaded.ids).toHaveLength(6);
  expect(loaded.verification.payloads).toBe("not-read");
}, 20_000);

function afterRows(mutate: () => void) {
  const original = SqliteSessionEventStore.prototype.readAllEvents;
  vi.spyOn(SqliteSessionEventStore.prototype, "readAllEvents").mockImplementation(function (this: SqliteSessionEventStore) {
    const rows = original.call(this); mutate(); return rows;
  });
}
test("a newly populated WAL is not mistaken for empty read coordination", () => {
  afterRows(() => appendFileSync(wal, Buffer.from([1])));
  expect(() => loadSessionEventHistory({ workspace })).toThrow("CHANGED");
});
test("replacement of an already empty WAL remains a changed-history refusal", () => {
  writeFileSync(wal, Buffer.alloc(0));
  afterRows(() => { unlinkSync(wal); writeFileSync(wal, Buffer.alloc(0)); });
  expect(() => loadSessionEventHistory({ workspace })).toThrow("CHANGED");
});
test("empty WAL creation cannot hide a simultaneous backend-marker replacement", () => {
  const marker = join(workspace, ".amc/session-store.json");
  afterRows(() => { const bytes = readFileSync(marker); unlinkSync(marker); writeFileSync(marker, bytes); });
  expect(() => loadSessionEventHistory({ workspace })).toThrow("CHANGED");
});

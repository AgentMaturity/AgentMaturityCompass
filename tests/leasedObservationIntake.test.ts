/**
 * Watch review (BLOCKER): every leased route that records observations (Claude Code and Codex session hooks, OTLP) passes
 * the same hook audit latch and the same intake caps as tool observations (src/bridge/leasedObservation.ts). Over a cap
 * the answer is 429 and nothing of the request is stored; while latched every route answers 503; a failed write for a
 * registered session latches the workspace, as recordHookAudit's does.
 */
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { admitObservation } from "../src/bridge/claudeCodeObservations.js";
import { handleCodexObserveHttp, CODEX_OBSERVE_PATH } from "../src/bridge/codexObserveHttp.js";
import { hookAuditLatchState } from "../src/bridge/hookAuditLatch.js";
import { OBSERVATION_LIMITS } from "../src/bridge/hookIntake.js";
import { handleSessionHookHttp, recordSessionEvent, SESSION_HOOK_PATH } from "../src/bridge/sessionObservations.js";
import { ensureLeaseRevocationStore, issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { handleOtlpHttp, isOtlpPath, OTLP_LIMITS } from "../src/watch/otlpReceiver.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { agentId, claudeWorkspace, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

let server: Server;
let base = "";
let workspace = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (isOtlpPath(url.pathname)) void handleOtlpHttp({ workspace, req, res, url, pathname: url.pathname });
    else if (url.pathname === SESSION_HOOK_PATH) void handleSessionHookHttp({ workspace, req, res, url });
    else if (url.pathname === CODEX_OBSERVE_PATH) void handleCodexObserveHttp({ workspace, req, res, url });
    else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise((done) => server.close(done)); });
afterEach(() => removeFixtureWorkspaces());

const freshWorkspace = () => {
  workspace = claudeWorkspace();
  ensureLeaseRevocationStore(workspace);
  return issueLeaseForCli({ workspace, workspaceId: workspaceIdFromDirectory(workspace), agentId, ttl: "10m", scopes: "hook:observe",
    routes: "/hooks", models: "*", rpm: 1000, tpm: 1 }).token;
};
const otlpLogs = (records: number) => JSON.stringify({ resourceLogs: [{ scopeLogs: [{ logRecords: Array.from({ length: records }, (_, i) => ({
  timeUnixNano: `${1_700_000_000_000 + i}000000`, body: { stringValue: "claude_code.user_prompt" }, attributes: [{ key: "event.name", value: { stringValue: "user_prompt" } }],
})) }] }] });
const post = async (path: string, token: string, body: string, headers: Record<string, string> = {}) => {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "x-amc-lease": token, "content-type": "application/json", ...headers }, body });
  return { status: response.status, text: await response.text() };
};
const countRows = (auditType: string) => {
  const ledger = openLedger(workspace);
  try {
    return (ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE json_extract(meta_json, '$.auditType') = ?").get(auditType) as { n: number }).n;
  } finally {
    ledger.close();
  }
};
const sessionEvent = (session: string) => JSON.stringify({ hook_event_name: "Stop", session_id: session, stop_hook_active: false });
const codexEvent = JSON.stringify({ hook_event_name: "SessionStart", session_id: "codex-s", source: "startup" });

describe("intake caps on the session and OTLP routes", () => {
  test("OTLP: one agent's records past the intake cap answer 429 and nothing of that request is stored", async () => {
    const token = freshWorkspace();
    expect((await post("/v1/logs", token, otlpLogs(OTLP_LIMITS.records))).status).toBe(200);
    const before = countRows("OTLP_RECEIVED");
    expect(before).toBe(OTLP_LIMITS.records);
    const otlp = await post("/v1/logs", token, otlpLogs(1));
    expect(otlp.status).toBe(429);
    expect(otlp.text).toContain("nothing of this request was recorded");
    expect(countRows("OTLP_RECEIVED")).toBe(before);
  });

  test("session events past the session cap answer 429 on the Claude Code and Codex routes and are not recorded", async () => {
    const token = freshWorkspace();
    for (const provider of ["claude-code", "codex"] as const) {
      // The cap is the one tool observations of an unregistered session share; fill it as they would.
      admitObservation({ workspace, agentId, leaseId: "lease_cap", sessionId: "unknown", provider, now: Date.now(), count: OBSERVATION_LIMITS.session! });
      expect(() => recordSessionEvent({ workspace, agentId, provider, leaseId: "lease_cap", rawInput: "{}" })).toThrowError(expect.objectContaining({ statusCode: 429 }));
    }
    expect((await post(SESSION_HOOK_PATH, token, sessionEvent("s-any"))).status).toBe(429);
    expect((await post(CODEX_OBSERVE_PATH, token, codexEvent)).status).toBe(429);
    expect(countRows("HOOK_SESSION_EVENT")).toBe(0);
  });
});

describe("the hook audit latch on the session and OTLP routes", () => {
  test("a failed session-event write for a registered session latches the workspace; then every route answers 503", async () => {
    const token = freshWorkspace();
    const registered = String(recorded("SessionStart-startup", workspace).session_id);
    const ledger = openLedger(workspace);
    ledger.db.exec("CREATE TRIGGER test_failing_writer BEFORE INSERT ON evidence_events BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
    ledger.close();
    expect(() => recordSessionEvent({ workspace, agentId, provider: "claude-code", leaseId: "lease_latch", rawInput: sessionEvent(registered) }))
      .toThrowError(expect.objectContaining({ statusCode: 503 }));
    const repair = openLedger(workspace);
    repair.db.exec("DROP TRIGGER test_failing_writer");
    repair.close();
    expect(hookAuditLatchState(workspace).latched).toBe(true);
    for (const [path, body] of [["/v1/logs", otlpLogs(1)], [SESSION_HOOK_PATH, sessionEvent(registered)], [CODEX_OBSERVE_PATH, codexEvent]] as const) {
      const answer = await post(path, token, body);
      expect(answer.status).toBe(503);
      expect(answer.text).toContain("latched");
    }
    expect(countRows("OTLP_RECEIVED") + countRows("HOOK_SESSION_EVENT")).toBe(0);
  });

  test("a failed write for a session with no registration is refused but does not latch, as for tool observations", () => {
    freshWorkspace();
    const ledger = openLedger(workspace);
    ledger.db.exec("CREATE TRIGGER test_failing_writer BEFORE INSERT ON evidence_events BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
    ledger.close();
    expect(() => recordSessionEvent({ workspace, agentId, provider: "codex", leaseId: "lease_latch", rawInput: codexEvent }))
      .toThrowError(expect.objectContaining({ statusCode: 503 }));
    expect(hookAuditLatchState(workspace).latched).toBe(false);
  });
});

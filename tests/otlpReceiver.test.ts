/**
 * Watch: AMC's OTLP/HTTP JSON receiver (src/watch/otlpReceiver.ts). The lease is checked first and a failure says
 * nothing; limits apply before anything is stored; what is stored is self-reported, digested and the lease's own agent.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { claudeSessionSha256 } from "../src/adapters/hookProviders/claudeCode.js";
import { ensureLeaseRevocationStore, issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { otlpConnectEnvLines, otlpRuntimeRefusal } from "../src/watch/otlpConnect.js";
import { handleOtlpHttp, isOtlpPath, OTLP_LIMITS } from "../src/watch/otlpReceiver.js";

let workspace = "";
let server: Server;
let base = "";
const lease = (scopes: string, routes: string, rpm = 1000) => issueLeaseForCli({ workspace, workspaceId: workspaceIdFromDirectory(workspace), agentId: "agent-otlp",
  ttl: "10m", scopes, routes, models: "*", rpm, tpm: 1 }).token;

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), "amc-otlp-receiver-"));
  process.env.AMC_VAULT_PASSPHRASE = "otlp-receiver-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  ensureLeaseRevocationStore(workspace);
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (isOtlpPath(url.pathname)) void handleOtlpHttp({ workspace, req, res, url, pathname: url.pathname });
    else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((done) => server.listen(3703, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
  rmSync(workspace, { recursive: true, force: true });
});

function received(): Array<{ meta: Record<string, unknown>; body: string }> {
  const ledger = openLedger(workspace);
  try {
    return (ledger.db.prepare("SELECT meta_json, payload_inline FROM evidence_events WHERE json_extract(meta_json, '$.auditType') = 'OTLP_RECEIVED'").all() as
      Array<{ meta_json: string; payload_inline: string }>).map((row) => ({ meta: JSON.parse(row.meta_json) as Record<string, unknown>, body: row.payload_inline }));
  } finally {
    ledger.close();
  }
}

const SECRET_PROMPT = "please read the secret file for me";
const attr = (key: string, value: Record<string, unknown>) => ({ key, value });
function claudeLogs(records = 1, extraAttrs: unknown[] = []) {
  return { resourceLogs: [{ resource: { attributes: [attr("service.name", { stringValue: "claude-code" })] }, scopeLogs: [{ logRecords: Array.from({ length: records }, (_, i) => ({
    timeUnixNano: String(1_700_000_000_000_000_000 + i), body: { stringValue: "claude_code.user_prompt" },
    attributes: [attr("event.name", { stringValue: "user_prompt" }), attr("session.id", { stringValue: "sess-1" }), attr("prompt.id", { stringValue: `p-${i}` }),
      attr("prompt", { stringValue: SECRET_PROMPT }), attr("prompt_length", { stringValue: "34" }), attr("agentId", { stringValue: "someone-else" }),
      attr("trustTier", { stringValue: "OBSERVED" }), attr("bad\u001bkey", { stringValue: "x" }), ...extraAttrs],
  })) }] }] };
}

async function post(path: string, body: string | Buffer, headers: Record<string, string>) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers, body });
  return { status: response.status, text: await response.text() };
}

describe("OTLP receiver", () => {
  test("a missing, wrong-scope or forged lease answers 401 with no detail and stores nothing", async () => {
    const json = JSON.stringify(claudeLogs());
    const gatewayLease = lease("gateway:llm", "/openai");
    const forged = `${lease("hook:observe", "/hooks/otlp").slice(0, -4)}AAAA`;
    for (const headers of [{}, { "x-amc-lease": gatewayLease }, { "x-amc-lease": forged }, { "x-amc-lease": lease("hook:observe", "/hooks/other") }]) {
      const answer = await post("/v1/logs", json, { "content-type": "application/json", ...headers });
      expect(answer.status).toBe(401);
      expect(JSON.parse(answer.text)).toEqual({ code: 401, message: "Unauthorized" });
    }
    expect(received()).toHaveLength(0);
  });

  test("protobuf is 415; over-size, a gzip bomb, too many records, attributes or a long string are 413; nothing is stored", async () => {
    const token = lease("hook:observe", "/hooks/otlp");
    const auth = { "x-amc-lease": token };
    expect((await post("/v1/logs", Buffer.from([0x0a, 0x00]), { ...auth, "content-type": "application/x-protobuf" })).status).toBe(415);
    const big = Buffer.alloc(OTLP_LIMITS.bodyBytes + 10, 0x20);
    expect((await post("/v1/logs", big, { ...auth, "content-type": "application/json" })).status).toBe(413);
    const bomb = gzipSync(Buffer.from(`{"resourceLogs":[],"pad":"${"a".repeat(OTLP_LIMITS.bodyBytes * 4)}"}`));
    expect(bomb.length).toBeLessThan(OTLP_LIMITS.bodyBytes);
    expect((await post("/v1/logs", bomb, { ...auth, "content-type": "application/json", "content-encoding": "gzip" })).status).toBe(413);
    expect((await post("/v1/logs", JSON.stringify(claudeLogs(OTLP_LIMITS.records + 1)), { ...auth, "content-type": "application/json" })).status).toBe(413);
    const many = Array.from({ length: OTLP_LIMITS.attributesPerRecord }, (_, i) => attr(`k${i}`, { intValue: i }));
    expect((await post("/v1/logs", JSON.stringify(claudeLogs(1, many)), { ...auth, "content-type": "application/json" })).status).toBe(413);
    const long = [attr("long", { stringValue: "x".repeat(OTLP_LIMITS.stringBytes + 1) })];
    expect((await post("/v1/logs", JSON.stringify(claudeLogs(1, long)), { ...auth, "content-type": "application/json" })).status).toBe(413);
    expect(received()).toHaveLength(0);
  });

  test("rows are self-reported, the lease's own agent, digests only, joined on the hook session digest; gzip under the cap is read", async () => {
    const token = lease("hook:observe", "/hooks/otlp");
    const answer = await post("/v1/logs", gzipSync(JSON.stringify(claudeLogs(2))), { "x-amc-lease": token, "content-type": "application/json", "content-encoding": "gzip" });
    expect(answer.status).toBe(200);
    const rows = received();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.meta).toMatchObject({ trustTier: "SELF_REPORTED", claim: "self-reported", agentId: "agent-otlp", rawPayloadStored: false,
        sessionSha256: claudeSessionSha256("sess-1"), reportedBy: "claude-code", name: "claude_code.user_prompt" });
      expect(row.body).not.toContain(SECRET_PROMPT);
      expect(row.body).not.toContain("\u001b");
      const body = JSON.parse(row.body) as { attributes: Record<string, unknown>; unreadableKeys: number };
      expect(body.attributes.prompt).toMatchObject({ length: SECRET_PROMPT.length });
      expect(body.attributes.prompt_length).toBe(34);
      expect(body.unreadableKeys).toBe(1);
    }
    // The same export sent again (an exporter retry) is not recorded twice.
    expect((await post("/v1/logs", JSON.stringify(claudeLogs(2)), { "x-amc-lease": token, "content-type": "application/json" })).status).toBe(200);
    expect(received()).toHaveLength(2);
  });

  test("a lease over its requests per minute is answered 429 with Retry-After", async () => {
    const token = lease("hook:observe", "/hooks/otlp", 1);
    const body = JSON.stringify({ resourceSpans: [] });
    expect((await post("/v1/traces", body, { "x-amc-lease": token, "content-type": "application/json" })).status).toBe(200);
    const response = await fetch(`${base}/v1/traces`, { method: "POST", headers: { "x-amc-lease": token, "content-type": "application/json" }, body });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("amc connect --print-env --runtime", () => {
  test("prints export lines only, with a lease limited to the OTLP route; Codex and unknown runtimes are refused", () => {
    const lines = otlpConnectEnvLines({ workspace, agentId: "agent-otlp", runtime: "claude-code" });
    expect(lines).toContain("export CLAUDE_CODE_ENABLE_TELEMETRY=1");
    expect(lines).toContain("export OTEL_EXPORTER_OTLP_PROTOCOL=http/json");
    expect(lines.every((line) => line.startsWith("export ") || line.startsWith("# "))).toBe(true);
    const token = /x-amc-lease=([^']+)/.exec(lines.join("\n"))![1]!;
    const payload = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as { scopes: string[]; routeAllowlist: string[] };
    expect(payload.scopes).toEqual(["hook:observe"]);
    expect(payload.routeAllowlist).toEqual(["/hooks/otlp"]);
    expect(otlpRuntimeRefusal("codex")).toMatch(/does not edit/);
    expect(otlpRuntimeRefusal("nope")).toMatch(/Unknown --runtime/);
  });
});

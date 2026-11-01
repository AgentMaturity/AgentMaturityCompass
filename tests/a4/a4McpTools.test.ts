import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginNativeApprovals } from "../../src/approvals/nativeApprovalLogin.js";
import { addUser, initUsersConfig, verifyTrackedSessionToken } from "../../src/auth/authApi.js";
import { createAmcMcpServer, resetRateLimiter } from "../../src/mcp/amcMcpServer.js";
import { createA4Client } from "../../src/sdk/a4Client.js";
import { AMCSDKError } from "../../src/sdk/errors.js";
import { NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, nativeCsrfTokenForSession } from "../../src/studio/nativeAdmission.js";
import { writeStudioState } from "../../src/studio/studioState.js";
import { initWorkspace } from "../../src/workspace.js";

// P1-64 review: the MCP process never signs an A4 record. A comment goes to the running Studio with the configured
// session, and every A4 tool refuses while the vault passphrase is in the server's environment.
const password = "a4-mcp-fixture-password";
const projectId = `a4p_${"0".repeat(32)}`;
const roots: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  vi.unstubAllEnvs(); resetRateLimiter();
  for (const server of servers.splice(0)) server.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(role: "VIEWER" | "APPROVER" = "VIEWER") {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "a4-mcp-fixture-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-a4-mcp-"))); roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "administrator", password: "admin-fixture-password" });
  addUser({ workspace, username: "a4-agent", roles: [role], password });
  const tokenFile = join(workspace, "a4-agent.session");
  await loginNativeApprovals({ workspace, username: "a4-agent", tokenFile }, async () => password);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  vi.stubEnv("AMC_A4_PREVIEW", "1");
  vi.stubEnv("AMC_A4_SESSION_TOKEN_FILE", tokenFile);
  const server = createAmcMcpServer(workspace);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "a4-mcp-test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: { workspace, ...args } }) as Promise<{ isError?: boolean; content: Array<{ text: string }>; structuredContent?: Record<string, unknown> }>;
  return { workspace, tokenFile, call };
}

/** A stand-in Studio that records each request and answers `reply` (a raw string is sent as is; null never answers). */
async function fakeStudio(workspace: string, reply: { status: number; body: unknown } | null, host = "127.0.0.1") {
  const seen: Array<{ url: string; headers: IncomingHttpHeaders; body: unknown }> = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      seen.push({ url: req.url ?? "", headers: req.headers, body: JSON.parse(data) });
      if (reply === null) return;
      res.writeHead(reply.status, { "content-type": "application/json" }).end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  writeStudioState(workspace, { pid: process.pid, startedTs: Date.now(), apiPort: port, gatewayPort: 0, proxyPort: 0, dashboardPort: 0,
    host, currentAgent: "default", vaultUnlocked: true, untrustedConfig: false, logFile: "" });
  return { seen, origin: `http://127.0.0.1:${port}` };
}

const comment = { projectId, cardId: "aspire.goal", body: "Looks right to me.", clientRequestId: "mcp-req-0001" };

describe("A4 MCP tools keep the signing key out of the agent host", () => {
  it("refuses every A4 tool while AMC_VAULT_PASSPHRASE is set, before reaching Studio", async () => {
    const f = await fixture();
    const studio = await fakeStudio(f.workspace, { status: 201, body: { ok: true, data: {} } });
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "leaked");
    for (const [name, args] of [["amc_a4_list_projects", {}], ["amc_a4_comment", comment]] as const) {
      const result = await f.call(name, args);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({ status: 403, code: "A4_SIGNING_KEY_IN_AGENT_HOST" });
      expect(result.content[0]!.text).toMatch(new RegExp(`^${name} refused \\(403\\): A4_SIGNING_KEY_IN_AGENT_HOST: `));
    }
    expect(studio.seen).toHaveLength(0);
  });

  it("sends the comment to Studio as the session's user and answers Studio's result", async () => {
    const f = await fixture();
    const studio = await fakeStudio(f.workspace, { status: 201, body: { ok: true, data: { projectId, seq: 7, kind: "COMMENT", bodyDigest: "d", replay: false } } });
    const result = await f.call("amc_a4_comment", comment);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("at seq 7");
    expect(result.structuredContent).toMatchObject({ projectId, seq: 7, replay: false });
    const token = readFileSync(f.tokenFile, "utf8").trim();
    const payload = verifyTrackedSessionToken({ workspace: f.workspace, token }).payload!;
    expect(studio.seen).toHaveLength(1);
    const [request] = studio.seen;
    expect(request!.url).toBe(`/api/v1/a4/projects/${projectId}/comments`);
    expect(request!.headers.cookie).toBe(`amc_session=${encodeURIComponent(token)}`);
    expect(request!.headers[NATIVE_CSRF_HEADER]).toBe(nativeCsrfTokenForSession(payload));
    expect(request!.headers[NATIVE_INTENT_HEADER]).toBeTruthy();
    expect(request!.headers.origin).toBe(studio.origin);
    expect(request!.body).toEqual({ body: comment.body, cardId: comment.cardId, inReplyTo: null, clientRequestId: comment.clientRequestId });
  });

  it("passes Studio's refusal through with its status and code", async () => {
    const f = await fixture();
    await fakeStudio(f.workspace, { status: 403, body: { ok: false, error: "A4_NOT_A_MEMBER: You are not a member of this project.", code: "A4_NOT_A_MEMBER" } });
    const result = await f.call("amc_a4_comment", comment);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ status: 403, code: "A4_NOT_A_MEMBER" });
    expect(result.content[0]!.text).toBe("amc_a4_comment refused (403): A4_NOT_A_MEMBER: You are not a member of this project.");
  });

  it("refuses a comment when Studio is not running", async () => {
    const f = await fixture();
    const result = await f.call("amc_a4_comment", comment);
    expect(result.structuredContent).toEqual({ status: 503, code: "A4_STUDIO_NOT_RUNNING" });
  });

  it("refuses a session that can do more than read, with its code", async () => {
    const f = await fixture("APPROVER");
    const result = await f.call("amc_a4_list_projects");
    expect(result.structuredContent).toEqual({ status: 403, code: "A4_SESSION_TOO_PRIVILEGED" });
  });

  it("refuses AMC_VAULT_PASSPHRASE_FILE like the passphrase", async () => {
    const f = await fixture();
    const studio = await fakeStudio(f.workspace, { status: 201, body: { ok: true, data: {} } });
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", "/nonexistent/passphrase");
    const result = await f.call("amc_a4_comment", comment);
    expect(result.structuredContent).toEqual({ status: 403, code: "A4_SIGNING_KEY_IN_AGENT_HOST" });
    expect(studio.seen).toHaveLength(0);
  });

  it("never sends the session to a Studio whose recorded address is not this machine", async () => {
    const f = await fixture();
    const studio = await fakeStudio(f.workspace, { status: 201, body: { ok: true, data: {} } }, "203.0.113.7");
    const result = await f.call("amc_a4_comment", comment);
    expect(result.structuredContent).toEqual({ status: 403, code: "A4_STUDIO_NOT_LOCAL" });
    expect(result.content[0]!.text).not.toContain("203.0.113.7");
    expect(studio.seen).toHaveLength(0);
  });

  it.each([
    ["an empty success", { status: 201, body: { ok: true, data: {} } }],
    ["another project's comment", { status: 201, body: { ok: true, data: { projectId: `a4p_${"1".repeat(32)}`, seq: 7, kind: "COMMENT", bodyDigest: "d", replay: false } } }],
    ["a non-JSON answer", { status: 200, body: "<html>not studio</html>" }],
    ["a refusal with a 2xx status", { status: 200, body: { ok: false, error: "nope", code: "NOPE" } }]
  ])("answers 502 A4_STUDIO_BAD_ANSWER for %s and reports nothing recorded", async (_label, reply) => {
    const f = await fixture();
    await fakeStudio(f.workspace, reply);
    const result = await f.call("amc_a4_comment", comment);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ status: 502, code: "A4_STUDIO_BAD_ANSWER" });
  });

  it("answers 504 A4_STUDIO_TIMEOUT when Studio does not answer in time", async () => {
    const f = await fixture();
    const studio = await fakeStudio(f.workspace, null);
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(50));
    try {
      const result = await f.call("amc_a4_comment", comment);
      expect(result.structuredContent).toEqual({ status: 504, code: "A4_STUDIO_TIMEOUT" });
      expect(result.content[0]!.text).toContain("retry with the same clientRequestId");
      expect(studio.seen).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("lists the five A4 tools only under AMC_A4_PREVIEW=1", async () => {
    const f = await fixture();
    const count = async () => {
      const server = createAmcMcpServer(f.workspace);
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "a4-mcp-count", version: "1.0.0" });
      await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      await client.close();
      return names;
    };
    const withPreview = await count();
    vi.stubEnv("AMC_A4_PREVIEW", "");
    const without = await count();
    expect(without.filter((name) => name.startsWith("amc_a4_"))).toEqual([]);
    expect(withPreview.filter((name) => name.startsWith("amc_a4_")).sort()).toEqual(
      ["amc_a4_comment", "amc_a4_conformance", "amc_a4_list_projects", "amc_a4_project", "amc_a4_readiness"]);
    expect(withPreview).toHaveLength(without.length + 5);
  });
});

describe("createA4Client", () => {
  async function listen(handler: Parameters<typeof createServer>[1]) {
    const server = createServer(handler!); servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }

  it("refuses to follow a redirect, so the session cookie never reaches its target", async () => {
    const target: string[] = [];
    const elsewhere = await listen((req, res) => { target.push(req.headers.cookie ?? ""); res.end("{}"); });
    const baseUrl = await listen((_req, res) => { res.writeHead(302, { location: `${elsewhere}/api/v1/a4/projects` }).end(); });
    const error = await createA4Client({ baseUrl, session: { cookie: "amc_session=secret" } }).listProjects().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AMCSDKError);
    expect((error as AMCSDKError).code).toBe("NETWORK_ERROR");
    expect(target).toEqual([]);
  });

  it("bounds a request by timeoutMs and names the TimeoutError as the cause", async () => {
    const baseUrl = await listen(() => { /* never answers */ });
    const error = await createA4Client({ baseUrl, session: {}, timeoutMs: 50 }).listProjects().catch((e: unknown) => e) as AMCSDKError;
    expect(error.code).toBe("NETWORK_ERROR");
    expect((error.cause as Error).name).toBe("TimeoutError");
  });

  it("returns a refusal unchanged instead of throwing", async () => {
    const refused = { ok: false, error: "SOD_VIOLATION: the proposer cannot approve.", code: "SOD_VIOLATION" };
    const baseUrl = await listen((_req, res) => { res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify(refused)); });
    const answer = await createA4Client({ baseUrl, session: {} }).decide(projectId, "a4g_x", "approve",
      { reason: "r", expectedGateSeq: 1, expectedRequestDigestSha256: "0".repeat(64) });
    expect(answer).toEqual({ status: 400, body: refused });
  });
});

import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginNativeApprovals } from "../src/approvals/nativeApprovalLogin.js";
import { addUser, initUsersConfig, verifyTrackedSessionToken } from "../src/auth/authApi.js";
import { createAmcMcpServer, resetRateLimiter } from "../src/mcp/amcMcpServer.js";
import { NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, nativeCsrfTokenForSession } from "../src/studio/nativeAdmission.js";
import { writeStudioState } from "../src/studio/studioState.js";
import { initWorkspace } from "../src/workspace.js";

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

/** A stand-in Studio that records each request and answers `reply`. */
async function fakeStudio(workspace: string, reply: { status: number; body: unknown }) {
  const seen: Array<{ url: string; headers: IncomingHttpHeaders; body: unknown }> = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      seen.push({ url: req.url ?? "", headers: req.headers, body: JSON.parse(data) });
      res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  writeStudioState(workspace, { pid: process.pid, startedTs: Date.now(), apiPort: port, gatewayPort: 0, proxyPort: 0, dashboardPort: 0,
    host: "127.0.0.1", currentAgent: "default", vaultUnlocked: true, untrustedConfig: false, logFile: "" });
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
});

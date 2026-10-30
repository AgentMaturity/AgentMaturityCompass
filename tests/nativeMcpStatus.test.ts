import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { admitNativeMcpStatus, NATIVE_MCP_STATUS_FORMAT, projectNativeMcpStatus } from "../src/mcp/nativeMcpStatus.js";
import { acpStartupRefusal, serveAcpStartupRefusal } from "../src/acp/acpStartupRefusal.js";
import { ACP_ERROR } from "../src/acp/acpErrors.js";
import { NativeMcpConfigError, reviewNativeMcpConfigurations } from "../src/setup/nativeMcpConfig.js";
import { AMCNativeRefusedError, AMCNativeStartupRefusedError, asStartupRefusal } from "../src/sdk/nativeAgentErrors.js";

// WP21d: per-mount status crosses ACP only through the `/mcp` projection, and a refused
// startup reaches SDK callers as its coded reason rather than "output closed".
const SECRET = "sk-live-NEVER-LEAVES-THE-RUNTIME";
const server = (overrides: Record<string, unknown> = {}) => ({
  serverId: "first", catalogDigest: "a".repeat(64),
  protocol: { negotiatedVersion: "2025-11-25", mode: "legacy", serverInfo: { name: "fixture", version: "1" } },
  auth: { issuer: "https://issuer.example", scopes: ["read"], tokenExpiresAt: null },
  toolNames: [`mcp_first_${"b".repeat(16)}`], state: "registered", execution: "not-evaluated", ...overrides
});

describe("per-mount MCP status projection", () => {
  it("keeps only the /mcp public fields, so env, headers, tokens and config bytes never cross", () => {
    const leaky = { ...server(), env: { API_KEY: SECRET }, headers: { authorization: `Bearer ${SECRET}` }, command: "node", args: [SECRET],
      auth: { issuer: "https://issuer.example", scopes: ["read"], tokenExpiresAt: null, accessToken: SECRET },
      protocol: { negotiatedVersion: "2025-11-25", mode: "legacy", serverInfo: null, sessionSecret: SECRET } };
    const status = projectNativeMcpStatus([leaky]);
    expect(JSON.stringify(status)).not.toContain(SECRET);
    expect(status).toEqual({ format: NATIVE_MCP_STATUS_FORMAT, refused: 0, servers: [{ ...server(),
      protocol: { negotiatedVersion: "2025-11-25", mode: "legacy", serverInfo: null } }] });
  });

  it("counts a malformed entry as refused instead of guessing its state, and distinguishes no binding", () => {
    expect(projectNativeMcpStatus([server(), server({ state: "healthy" }), server({ catalogDigest: SECRET })]))
      .toMatchObject({ servers: [{ serverId: "first" }], refused: 2 });
    expect(projectNativeMcpStatus(null)).toEqual({ format: NATIVE_MCP_STATUS_FORMAT, servers: null, refused: 0 });
    expect(projectNativeMcpStatus([])).toEqual({ format: NATIVE_MCP_STATUS_FORMAT, servers: [], refused: 0 });
  });

  it("the SDK admits only the projected shape from an untrusted peer", () => {
    const reply = { format: NATIVE_MCP_STATUS_FORMAT, servers: [{ ...server(), env: { API_KEY: SECRET } }], refused: 0 };
    expect(JSON.stringify(admitNativeMcpStatus(reply))).not.toContain(SECRET);
    expect(admitNativeMcpStatus({ ...reply, format: "amc-mcp-status-v2" })).toBeUndefined();
    expect(admitNativeMcpStatus({ ...reply, extra: SECRET })).toBeUndefined();
    expect(admitNativeMcpStatus({ ...reply, servers: [server({ state: "up" })] })).toBeUndefined();
  });
});

describe("startup refusal reaches the spawning client", () => {
  const serve = async (error: unknown, input: string) => {
    const stdin = new PassThrough(), stdout = new PassThrough();
    const chunks: Buffer[] = [];
    stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const served = serveAcpStartupRefusal(error, { stdin, stdout });
    stdin.end(input);
    await served;
    return Buffer.concat(chunks).toString("utf8");
  };

  it("answers the first request with the reviewed-MCP code and fixed message", async () => {
    const refusal = new NativeMcpConfigError("MCP configuration changed from its pinned digest.", "mcp-config-tampered");
    const reply = JSON.parse(await serve(refusal, `${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize", params: {} })}\n`));
    expect(reply).toEqual({ jsonrpc: "2.0", id: 7, error: { code: ACP_ERROR.startupRefused,
      message: "MCP configuration changed from its pinned digest.", data: { reason: "mcp-config-tampered" } } });
  });

  it("keeps any other startup failure generic: its text may name paths or values", () => {
    expect(acpStartupRefusal(new Error(`could not read /home/op/${SECRET}`))).toEqual({ code: ACP_ERROR.startupRefused,
      message: "amc acp refused to start; its stderr names the reason.", data: { reason: "startup-refused" } });
  });

  it("never writes an unsolicited frame", async () => {
    const refusal = new NativeMcpConfigError("refused", "mcp-config-unreviewed");
    expect(await serve(refusal, `${JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: {} })}\n`)).toBe("");
    expect(await serve(refusal, "not json\n")).toBe("");
    expect(await serve(refusal, "")).toBe("");
  });

  it("codes the review refusals the runtime raises", () => {
    const code = (run: () => unknown) => { try { run(); } catch (error) { return (error as NativeMcpConfigError).code; } return undefined; };
    expect(code(() => reviewNativeMcpConfigurations(["a.json"], [], process.cwd(), "READ_ONLY"))).toBe("mcp-config-unpaired");
    expect(code(() => reviewNativeMcpConfigurations([`/nonexistent/${SECRET}.json`], undefined, process.cwd(), "READ_ONLY"))).toBe("mcp-config-invalid");
  });

  it("the SDK types the coded reply and leaves every other refusal unchanged", () => {
    const typed = asStartupRefusal(new AMCNativeRefusedError(-32003, "MCP refused.", { reason: "mcp-config-duplicate" }));
    expect(typed).toBeInstanceOf(AMCNativeStartupRefusedError);
    expect(typed).toMatchObject({ reason: "mcp-config-duplicate", code: -32003, message: "MCP refused." });
    const other = new AMCNativeRefusedError(-32602, "bad params", { reason: "mcp-config-duplicate" });
    expect(asStartupRefusal(other)).toBe(other);
    const malformed = new AMCNativeRefusedError(-32003, "x", { reason: "Not A Code" });
    expect(asStartupRefusal(malformed)).toBe(malformed);
  });
});

/**
 * P2-19: AMC serves OWASP ACS v0.1 `steps/toolCallRequest` on its existing hook control path, and answers every hook
 * it does not serve "unsupported", never allow. Shapes are from the pinned release (docs/source-reviews/P2-19-owasp-acs.md).
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { authorizationRecordDigest } from "../src/actions/authorizationRecord.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { assertContract } from "../src/contracts/index.js";
import { getPurposeKeyHistory } from "../src/keys/signingKeys.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { acsProviderInput, handleAcsGuardianRequest, toAcsDecision, type AcsResponse } from "../src/standards/acs/acsGuardian.js";
import { ACS_GUARDIAN_PATH, ACS_GUARDIAN_ROUTE } from "../src/standards/acs/acsGuardianHttp.js";
import { acsActionId } from "../src/standards/acs/acsProvider.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { controlledWorkspace, freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "acs-agent";
const lease = { leaseId: "lease_acs_fixture", expiresTs: Date.now() + 3_600_000 };
const sessionId = randomUUID();

afterEach(removeFixtureWorkspaces);

function envelope(method: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", method, id: 7, params: { acs_version: "0.1.0", request_id: randomUUID(), timestamp: new Date().toISOString(),
    metadata: { agent_id: agentId, session_id: sessionId }, payload, ...overrides } };
}

const toolCall = (name: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  envelope("steps/toolCallRequest", { tool: { name }, arguments: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, { value }])), ...extra });

function send(workspace: string, body: unknown, withLease = true): AcsResponse {
  return handleAcsGuardianRequest({ workspace, authenticatedAgentId: agentId, ...(withLease ? { lease } : {}),
    rawBody: typeof body === "string" ? body : JSON.stringify(body) });
}

const result = (response: AcsResponse) => {
  if (!("result" in response)) throw new Error(`expected a result, got ${JSON.stringify(response)}`);
  return response.result as Record<string, any>;
};
const error = (response: AcsResponse) => {
  if (!("error" in response)) throw new Error(`expected an error, got ${JSON.stringify(response)}`);
  return response.error;
};

function decisionRow(workspace: string, eventId: string) {
  const ledger = openLedger(workspace);
  try {
    const event = ledger.getAllEvents().find((row) => row.id === eventId)!;
    const payload = readEventPayload(workspace, event);
    if (payload.status !== "ok") throw new Error("payload unreadable");
    return { meta: JSON.parse(event.meta_json) as Record<string, unknown>, payload: JSON.parse(payload.bytes.toString("utf8")) as Record<string, unknown> };
  } finally {
    ledger.close();
  }
}

describe("ACS v0.1 guardian on AMC's hook control path", () => {
  test("allow: a permitted fs.read is an ACS allow with a signed receipt binding the authorization record", () => {
    const workspace = controlledWorkspace(agentId);
    const request = toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") });
    const decided = result(send(workspace, request));

    expect(decided).toMatchObject({ type: "final", acs_version: "0.1.0", request_id: request.params.request_id, decision: "allow",
      reasoning: expect.stringContaining("fs.read"), metadata: { evaluator: "deterministic" } });
    const amc = decided.policy_data.amc;
    expect(amc.actionId).toBe(acsActionId(sessionId, request.params.request_id));
    const row = decisionRow(workspace, amc.eventId);
    const record = assertContract("authorization-record", row.payload.authorizationRecord);
    const digest = authorizationRecordDigest(record);
    expect(row.payload).toMatchObject({ provider: "acs", acsVersion: "0.1.0", authorizationRecordDigest: digest });
    expect(record).toMatchObject({ action: { toolName: "fs.read", actionClass: "READ_ONLY", adapterId: "hook:acs" }, idempotencyKey: request.params.request_id });
    const receipt = verifyReceipt(amc.receipt, getPurposeKeyHistory(workspace, "receipt"));
    expect(receipt.ok).toBe(true);
    // No installation registers an ACS runtime, so the decision is advisory: AMC cannot see whether the runtime honours it.
    expect(receipt.payload).toMatchObject({ kind: "action_state", state: "authorized", providerId: "hook-control:acs",
      authorizationRecordDigest: digest, enforcement: { level: "advisory" } });
    expect(JSON.stringify(row)).not.toContain("public fixture");
  });

  test("deny: an unmapped tool and a call AMC cannot evaluate are ACS denies with signed receipts", () => {
    const workspace = controlledWorkspace(agentId);
    for (const request of [
      toolCall("Bash", { command: "ls" }),
      toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") }, { raw_command: "cat /etc/passwd" }),
      toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") }, { operation: "delete" }),
    ]) {
      const decided = result(send(workspace, request));
      expect(decided).toMatchObject({ decision: "deny", reasoning: expect.stringMatching(/not allowed by signed ToolHub config|not mapped/) });
      const receipt = verifyReceipt(decided.policy_data.amc.receipt, getPurposeKeyHistory(workspace, "receipt"));
      expect(receipt.ok).toBe(true);
      expect(receipt.payload).toMatchObject({ state: "denied", authorizationRecordDigest: null });
    }
  });

  // Security review 1: a key the ToolHub validator does not read could carry the real effect, and a relative path
  // resolves against a working directory ACS does not name. Each mapped tool has a fixed argument schema.
  test("an argument outside the mapped tool's fixed schema, or a relative path, is not mapped and is denied", () => {
    const workspace = controlledWorkspace(agentId);
    const publicFile = join(workspace, "workspace", "public.txt");
    for (const request of [
      toolCall("fs.read", { path: publicFile, target: "/etc/shadow" }),
      toolCall("fs.read", { path: publicFile, cwd: "/" }),
      toolCall("fs.read", { path: "workspace/public.txt" }),
      toolCall("fs.read", { path: [publicFile, "/etc/shadow"] }),
      toolCall("fs.write", { path: join(workspace, "workspace", "output", "a.txt"), content: "x", destination: "/etc/passwd" }),
      toolCall("http.fetch", { url: "https://api.github.com/", method: "POST" }),
    ]) {
      const decided = result(send(workspace, request));
      expect(decided, JSON.stringify(request.params.payload)).toMatchObject({ decision: "deny", reasoning: expect.stringContaining("not mapped") });
    }
    // The schema's own keys still map: a write with content reaches policy (which asks, so ACS gets the 9.2 deny).
    const write = result(send(workspace, toolCall("fs.write", { path: join(workspace, "workspace", "output", "a.txt"), content: "x" })));
    expect(write).toMatchObject({ decision: "deny", reason_codes: ["approver_unavailable"] });
  });

  // Security review 2: shell and process tools would skip the shell-plan parsing Gemini and Pi use; AMC does not map them.
  test("shell, process and git tools are not mapped and are denied before policy", () => {
    const workspace = controlledWorkspace(agentId);
    for (const request of [
      toolCall("process.spawn", { binary: "node", argv: ["-e", "1"] }),
      toolCall("bash", { command: "ls" }),
      toolCall("git.status", { cwd: workspace }),
    ]) {
      expect(result(send(workspace, request)), JSON.stringify(request.params.payload.tool))
        .toMatchObject({ decision: "deny", reasoning: expect.stringContaining("not mapped") });
    }
  });

  test("ask: a write that needs approval is the ACS section 9.2 substitution, deny with approver_unavailable", () => {
    const workspace = controlledWorkspace(agentId);
    const decided = result(send(workspace, toolCall("fs.write", { path: join(workspace, "workspace", "output", "PRIVATE.txt") })));
    expect(decided).toMatchObject({ decision: "deny", reason_codes: ["approver_unavailable"],
      policy_data: { amc: { requestedDecision: "ask", capabilityLossy: true } } });
    expect(decided.reasoning).toContain("no approval path for ACS hook calls");
    expect(verifyReceipt(decided.policy_data.amc.receipt, getPurposeKeyHistory(workspace, "receipt")).ok).toBe(true);
    expect(JSON.stringify(decided)).not.toContain("PRIVATE");
  });

  test("malformed requests are refused with JSON-RPC errors, never decided", () => {
    const workspace = controlledWorkspace(agentId);
    expect(error(send(workspace, "{not json")).code).toBe(-32700);
    expect(error(send(workspace, [toolCall("fs.read", {})])).code).toBe(-32600);
    expect(error(send(workspace, '{"jsonrpc":"2.0","jsonrpc":"2.0","method":"system/ping","id":1,"params":{}}')).code).toBe(-32600);
    expect(error(send(workspace, { ...toolCall("fs.read", {}), extra: true })).code).toBe(-32600);
    expect(error(send(workspace, { ...toolCall("fs.read", {}), method: "tools/call" })).code).toBe(-32601);
    expect(error(send(workspace, envelope("steps/toolCallRequest", { tool: { name: "fs.read" }, arguments: { path: "bare" } }))).code)
      .toBe(-32602);
    expect(error(send(workspace, { ...toolCall("fs.read", {}), params: { ...toolCall("fs.read", {}).params, request_id: "not-a-uuid" } })).code).toBe(-32602);
  });

  test("version, clock skew and identity are refused with the ACS section 17.1 codes", () => {
    const workspace = controlledWorkspace(agentId);
    expect(error(send(workspace, envelope("steps/toolCallRequest", {}, { acs_version: "1.0.0" })))).toMatchObject({
      code: -32001, data: { supported_versions: ["0.1.0"] } });
    expect(error(send(workspace, envelope("steps/toolCallRequest", {}, { timestamp: new Date(Date.now() - 600_000).toISOString() })))).toMatchObject({
      code: -32006, data: { skew_window_ms: 300_000 } });
    expect(error(send(workspace, envelope("steps/toolCallRequest", {}, { metadata: { agent_id: "someone-else", session_id: sessionId } })))).toMatchObject({
      code: -32000, data: { reason: "agent_id_mismatch" } });
  });

  test("a replayed request id is REPLAY_DETECTED, and with different input it is the conflict", () => {
    const workspace = controlledWorkspace(agentId);
    const request = toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") });
    expect(result(send(workspace, request)).decision).toBe("allow");
    expect(error(send(workspace, request))).toMatchObject({ code: -32005, data: { reason: "duplicate_request_id" } });
    const changed = { ...request, params: { ...request.params, payload: { tool: { name: "fs.read" }, arguments: { path: { value: join(workspace, "other.txt") } } } } };
    expect(error(send(workspace, changed))).toMatchObject({ code: -32005, data: { reason: "replay_conflict" } });
  });

  test("an unsupported hook is an explicit unsupported error, never allow", () => {
    const workspace = controlledWorkspace(agentId);
    for (const method of ["steps/toolCallResult", "steps/userMessage", "steps/sessionStart", "protocols/MCP/tools/call", "agbom/snapshot"]) {
      const response = send(workspace, envelope(method, {}));
      expect(error(response)).toMatchObject({ code: -32003, data: { reason: "unsupported", method } });
    }
  });

  test("ledger unavailable: AMC answers deny, never an error the runtime may fail open on", () => {
    const workspace = controlledWorkspace(agentId);
    const ledger = openLedger(workspace);
    ledger.db.exec("CREATE TRIGGER acs_failing_writer BEFORE INSERT ON evidence_events BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
    ledger.close();
    const decided = result(send(workspace, toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") })));
    expect(decided).toMatchObject({ decision: "deny", reason_codes: ["amc_decision_unrecorded"] });
    expect(decided.policy_data).toBeUndefined();
  });

  test("handshake and ping: AMC's ServerHello evaluates toolCallRequest only, and ping always allows", () => {
    const workspace = controlledWorkspace(agentId);
    const hello = result(send(workspace, envelope("handshake/hello", { acs_versions_supported: ["0.1.0"], transports_supported: ["http"],
      provenance_producer: "none", methods_implemented: ["steps/toolCallRequest", "steps/toolCallResult", "system/ping"] })));
    expect(hello).toEqual({ negotiated_version: "0.1.0", methods_evaluated: ["steps/toolCallRequest"], selected_transport: "http",
      signature_algorithms_supported: [], timeout_config: { default_ms: 10_000 }, skew_window_ms: 300_000, on_decision_failure: "deny",
      approver_types_supported: [], policy_requires_provenance: false, profiles_accepted: [] });
    expect(error(send(workspace, envelope("handshake/hello", { acs_versions_supported: ["0.2.0"], transports_supported: ["http"],
      provenance_producer: "none", methods_implemented: [] }))).code).toBe(-32001);
    // ACS section 13: ping answers allow even with a stale clock or a foreign agent id.
    const ping = result(send(workspace, envelope("system/ping", { echo: "rtt-1" }, { timestamp: "2020-01-01T00:00:00Z", metadata: { agent_id: "x", session_id: sessionId } })));
    expect(ping).toMatchObject({ decision: "allow", payload: { status: "ok", echo: "rtt-1" } });
  });

  test("the generic hook control route refuses an ACS body; ACS reaches control only through its guardian", () => {
    const workspace = controlledWorkspace(agentId);
    const request = toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") });
    const rawInput = acsProviderInput(request.params as never, request.params.payload as never);
    // In-process the control path decides it (the guardian is the only caller); the Bridge refuses `acs` on the generic route below.
    expect(handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "acs", lease, rawInput })).toMatchObject({ decision: "allow" });
    expect(() => handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "acs", lease,
      rawInput: JSON.stringify({ hook_event_name: "steps/toolCallRequest", tool_name: "fs.read", tool_input: {} }) }))
      .toThrowError(expect.objectContaining({ statusCode: 400, message: expect.stringContaining("acs context") }));
  });

  test("mutation guard: the translator maps only an AMC allow to an ACS allow", () => {
    expect(toAcsDecision("allow")).toBe("allow");
    for (const unknown of ["deny", "ask", "steer", "modify", "defer", "ALLOW", "", undefined, null, 1]) expect(toAcsDecision(unknown)).toBe("deny");
  });
});

describe("ACS guardian over the Bridge", () => {
  test("unauthenticated, wrong-scope and generic-route ACS requests are refused; a leased request is decided", async () => {
    const workspace = controlledWorkspace(agentId);
    const port = await freePort();
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    const issue = (scopes: Parameters<typeof issueLeaseToken>[0]["scopes"], routes: string[]) => issueLeaseToken({ workspace,
      workspaceId: workspaceIdFromDirectory(workspace), agentId, ttlMs: 30 * 60_000, scopes, routeAllowlist: routes, modelAllowlist: ["*"],
      maxRequestsPerMinute: 60, maxTokensPerMinute: 1_000, maxCostUsdPerDay: null }).token;
    const post = (path: string, body: unknown, token?: string, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: JSON.stringify(body) });
    try {
      const request = toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") });
      const anonymous = await post(ACS_GUARDIAN_PATH, request);
      expect(anonymous.status).toBe(401);
      expect(await anonymous.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32000, data: { reason: "unauthenticated" } } });

      const observeOnly = await post(ACS_GUARDIAN_PATH, request, issue(["hook:observe"], [ACS_GUARDIAN_ROUTE]));
      expect(observeOnly.status).toBe(403);

      const token = issue(["hook:control"], [ACS_GUARDIAN_ROUTE, "/hooks/control/v1"]);
      // A complete ACS provider input on the generic route would skip the guardian's clock, identity and replay checks.
      const bypass = toolCall("fs.read", { path: join(workspace, "workspace", "public.txt") });
      const generic = await post("/bridge/hooks/control/v1", JSON.parse(acsProviderInput(bypass.params as never, bypass.params.payload as never)), token,
        { "x-amc-hook-provider": "acs" });
      expect(generic.status).toBe(400);

      const decided = await post(ACS_GUARDIAN_PATH, request, token);
      expect(decided.status).toBe(200);
      expect(await decided.json()).toMatchObject({ jsonrpc: "2.0", id: 7, result: { decision: "allow", request_id: request.params.request_id } });
    } finally {
      await bridge.close();
    }
  });
});

import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { authorizationRecordDigest } from "../src/actions/authorizationRecord.js";
import { piActionId } from "../src/adapters/pi/piIdentity.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { evaluateProviderHookControl, verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { HookControlError, validateProviderControlResponse } from "../src/bridge/hookProviders.js";
import { assertContract } from "../src/contracts/index.js";
import { getPurposeKeyHistory } from "../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../src/keys/purposeKeys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../src/utils/hash.js";
import { controlledWorkspace, piEnvelope, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "pi-controlled";
const lease = { leaseId: "lease_pi_fixture", expiresTs: Date.now() + 3_600_000 };

afterEach(removeFixtureWorkspaces);

function control(workspace: string, rawInput: string, withLease = true) {
  return evaluateProviderHookControl({ workspace, authenticatedAgentId: agentId, provider: "pi", rawInput, ...(withLease ? { lease } : {}) });
}

function decisionRow(workspace: string, eventId: string) {
  const ledger = openLedger(workspace);
  try {
    const event = ledger.getAllEvents().find((row) => row.id === eventId)!;
    const session = ledger.getAllSessions().find((row) => row.session_id === event.session_id)!;
    const payload = readEventPayload(workspace, event);
    if (payload.status !== "ok") throw new Error("payload unreadable");
    return { event, session, meta: JSON.parse(event.meta_json) as Record<string, unknown>,
      payload: JSON.parse(payload.bytes.toString("utf8")) as Record<string, unknown> };
  } finally {
    ledger.close();
  }
}

function receiptPayload(workspace: string, receipt: string) {
  const verified = verifyReceipt(receipt, getPurposeKeyHistory(workspace, "receipt"));
  expect(verified.ok).toBe(true);
  return verified.payload as Record<string, unknown>;
}

const requestSha256 = (rawInput: string) => sha256Hex(Buffer.from(rawInput, "utf8"));

describe("Pi tool_call hook control", () => {
  test("allows a permitted read and binds Pi's response, the record and the signed receipt to the exact request", () => {
    const workspace = controlledWorkspace(agentId);
    const rawInput = piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }, { toolCallId: "toolu_allow" });
    const result = control(workspace, rawInput);
    const actionId = piActionId("pi-session", "toolu_allow");

    expect(result).toMatchObject({ provider: "pi", decision: "allow", effectiveOutcome: "allow", providerMapping: "native",
      capabilityLossy: false, canonicalToolName: "fs.read", actionId });
    expect(result.providerResponse).toEqual({ block: false, requestSha256: requestSha256(rawInput) });
    expect(validateProviderControlResponse("pi", result.providerResponse)).toBe(true);

    const row = decisionRow(workspace, result.eventId);
    expect(row.event.runtime).toBe("pi");
    expect(row.session.runtime).toBe("pi");
    expect(row.meta).toMatchObject({ provider: "pi", piVersion: "1.0.4", rawInputSha256: requestSha256(rawInput) });
    const record = assertContract("authorization-record", row.payload.authorizationRecord);
    const digest = authorizationRecordDigest(record);
    expect(row.payload).toMatchObject({ provider: "pi", piVersion: "1.0.4", authorizationRecordDigest: digest });
    expect(row.meta.authorizationRecordDigest).toBe(digest);
    expect(record).toMatchObject({
      executionId: actionId,
      idempotencyKey: "toolu_allow",
      principal: { principalId: "lease:lease_pi_fixture", kind: "service", authenticatedVia: "lease" },
      delegation: { leaseId: "lease_pi_fixture", depth: 0 },
      action: { toolName: "fs.read", actionClass: "READ_ONLY", adapterId: "hook:pi" },
      session: { callId: actionId, rootCallId: actionId, parentToken: null },
    });
    expect(Date.parse(record.expiresAt)).toBeLessThanOrEqual(lease.expiresTs);

    expect(receiptPayload(workspace, result.receipt)).toMatchObject({
      v: 2, kind: "action_state", state: "authorized", providerId: "hook-control:pi", executionId: actionId,
      idempotencyKey: "toolu_allow", authorizationRecordDigest: digest,
      enforcement: { level: "enforced", boundary: "pi:tool_call" }, body_sha256: result.providerResponseSha256,
    });
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "pi", rawInput, result }))
      .toEqual({ ok: true, error: null });
    expect(JSON.stringify(row)).not.toContain("public fixture");
  });

  test("derives the action id from Pi's session and call id and ignores an action id the payload names", () => {
    const workspace = controlledWorkspace(agentId);
    const envelope = JSON.parse(piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }, { sessionId: "s-9", toolCallId: "c-9" }));
    const result = control(workspace, JSON.stringify({ ...envelope, tool_call_id: "pi.forged-action", tool_use_id: "pi.forged-action" }));
    expect(result.actionId).toBe(piActionId("s-9", "c-9"));
    const nested = control(workspace, piEnvelope("read", { path: join(workspace, "workspace", "public.txt") },
      { sessionId: "s-9", toolCallId: "c-9/1", parentToolCallId: "c-9" }));
    const record = assertContract("authorization-record", decisionRow(workspace, nested.eventId).payload.authorizationRecord);
    expect(record.session).toMatchObject({ callId: piActionId("s-9", "c-9/1"), parentToken: piActionId("s-9", "c-9") });
  });

  test("denies an unmapped tool with Pi's block value and binds no authorization record", () => {
    const workspace = controlledWorkspace(agentId);
    const rawInput = piEnvelope("my_ext_tool", { secret: "DO_NOT_RETAIN" });
    const result = control(workspace, rawInput);
    const reason = "Pi tool my_ext_tool is not mapped to an allowed ToolHub tool.";

    expect(result.decision).toBe("deny");
    expect(result.providerResponse).toEqual({ block: true, reason, requestSha256: requestSha256(rawInput) });
    const row = decisionRow(workspace, result.eventId);
    expect(row.payload.authorizationRecordDigest).toBeNull();
    expect(receiptPayload(workspace, result.receipt)).toMatchObject({ v: 2, state: "denied", authorizationRecordDigest: null, reason });
    expect(JSON.stringify(row)).not.toContain("DO_NOT_RETAIN");
  });

  test("an ask is denied in every Pi mode: a Pi confirmation is not AMC approval", () => {
    const workspace = controlledWorkspace(agentId);
    for (const mode of ["tui", "rpc", "json", "print"] as const) {
      const result = control(workspace,
        piEnvelope("write", { path: join(workspace, "workspace", "output", "out.txt"), content: "PRIVATE" }, { mode, toolCallId: `ask-${mode}` }));
      expect(result).toMatchObject({ requestedDecision: "ask", decision: "deny", effectiveOutcome: "deny",
        providerMapping: "fail_closed_deny", capabilityLossy: true });
      expect(result.providerResponse).toMatchObject({ block: true, reason: expect.stringContaining("cannot carry an AMC approval") });
      expect(receiptPayload(workspace, result.receipt)).toMatchObject({ state: "denied", authorizationRecordDigest: null });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    }
  });

  test("denies instead of reducing an approval quorum to one Pi decision", () => {
    const workspace = controlledWorkspace(agentId);
    const policy = defaultApprovalPolicy();
    policy.approvalPolicy.actionClasses.WRITE_LOW = { requiredApprovals: 2, rolesAllowed: ["APPROVER", "OWNER"], requireDistinctUsers: true, ttlMinutes: 15 };
    initApprovalPolicy(workspace, policy);
    const result = control(workspace, piEnvelope("edit", { path: join(workspace, "workspace", "output", "q.txt"), edits: [] }, { mode: "tui" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("cannot be reduced to one provider-local ask");
  });

  test("a decision is single-use: the same call with a new nonce or other input is a conflict, never a second decision", () => {
    const workspace = controlledWorkspace(agentId);
    const path = join(workspace, "workspace", "public.txt");
    const first = piEnvelope("read", { path }, { toolCallId: "toolu_once" });
    const original = control(workspace, first);
    expect(control(workspace, first)).toMatchObject({ idempotentReplay: true, eventId: original.eventId, receipt: original.receipt });
    for (const reused of [piEnvelope("read", { path }, { toolCallId: "toolu_once", nonce: "nonce-0002-bbbbbbbbbbbb" }),
      piEnvelope("read", { path: join(workspace, "workspace", "other.txt") }, { toolCallId: "toolu_once" })]) {
      expect(() => control(workspace, reused))
        .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT", statusCode: 409 }));
    }
  });

  test("a Pi version outside the qualified set is denied, readable or not; the receipt records it", () => {
    const workspace = controlledWorkspace(agentId);
    const path = join(workspace, "workspace", "public.txt");
    const unqualified = control(workspace, piEnvelope("read", { path }, { toolCallId: "v110", version: "1.1.0" }));
    expect(unqualified.decision).toBe("deny");
    expect(unqualified.providerResponse).toMatchObject({ block: true, reason: "AMC has not qualified Pi 1.1.0" });

    const unknown = control(workspace, piEnvelope("read", { path }, { toolCallId: "vunknown", version: "unknown" }));
    expect(unknown.decision).toBe("deny");
    expect(unknown.reason).toContain("could not read Pi's version");
    expect(decisionRow(workspace, unknown.eventId).payload).toMatchObject({ piVersion: "unknown" });
    expect(receiptPayload(workspace, unknown.receipt)).toMatchObject({ state: "denied", enforcement: { level: "advisory" } });
  });

  test("a signed tools config that gives a mapped tool a lower class than the Pi mapping table is denied", () => {
    const workspace = controlledWorkspace(agentId);
    const tools = defaultToolsConfig();
    const write = tools.tools.allowedTools.find((tool) => tool.name === "fs.write")!;
    write.actionClass = "READ_ONLY";
    initToolsConfig(workspace, tools);
    const result = control(workspace, piEnvelope("write", { path: join(workspace, "workspace", "output", "w.txt"), content: "x" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("below the WRITE_LOW the Pi mapping requires");
  });

  test("a decision whose authorization record cannot bind is denied: expired lease, lease classes that do not cover the call", () => {
    const workspace = controlledWorkspace(agentId);
    const path = join(workspace, "workspace", "public.txt");
    const run = (id: string, hookLease: typeof lease & { executeActionClasses?: ["WRITE_LOW"] }) => evaluateProviderHookControl({
      workspace, authenticatedAgentId: agentId, provider: "pi", rawInput: piEnvelope("read", { path }, { toolCallId: id }), lease: hookLease });
    const expired = run("expired", { leaseId: "lease_old", expiresTs: Date.now() - 1 });
    expect(expired.decision).toBe("deny");
    expect(expired.reason).toContain("could not bind an authorization record (capability_expired)");
    const narrow = run("narrow", { ...lease, executeActionClasses: ["WRITE_LOW"] });
    expect(narrow.decision).toBe("deny");
    expect(narrow.reason).toContain("(scope_widened)");
    expect(receiptPayload(workspace, narrow.receipt)).toMatchObject({ state: "denied", authorizationRecordDigest: null });
  });

  test("decision receipts are signed and verified with the receipt purpose's key (P1-08), also after only that key rotates", () => {
    const workspace = controlledWorkspace(agentId);
    rotatePurposeKeys({ workspace, purposes: ["receipt"], passphrase: process.env.AMC_VAULT_PASSPHRASE });
    const rawInput = piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }, { toolCallId: "rotated" });
    const result = control(workspace, rawInput);
    expect(verifyReceipt(result.receipt, getPurposeKeyHistory(workspace, "receipt")).ok).toBe(true);
    expect(control(workspace, rawInput)).toMatchObject({ idempotentReplay: true, receipt: result.receipt });
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "pi", rawInput, result })).toEqual({ ok: true, error: null });
  });

  test("without a lease the record names the self-reported OS user, never a lease", () => {
    const workspace = controlledWorkspace(agentId);
    const result = control(workspace, piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }), false);
    const record = assertContract("authorization-record", decisionRow(workspace, result.eventId).payload.authorizationRecord);
    expect(record.principal.authenticatedVia).toBe("cli-os-user");
    expect(record.delegation.leaseId).toBeNull();
  });

  test("refuses a Pi request without the tool_call event or a complete, known Pi context", () => {
    const workspace = controlledWorkspace(agentId);
    const envelope = JSON.parse(piEnvelope("read", { path: "x" })) as Record<string, unknown>;
    const pi = envelope.pi as Record<string, unknown>;
    const refused = (body: unknown) => expect(() => control(workspace, JSON.stringify(body)))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_INVALID", statusCode: 400 }));
    refused({ ...envelope, hook_event_name: "PreToolUse" });
    refused({ ...envelope, pi: undefined });
    refused({ ...envelope, pi: { ...pi, extra: true } });
    refused({ ...envelope, pi: { ...pi, mode: "headless" } });
    for (const field of ["sessionId", "toolCallId", "nonce", "version"]) refused({ ...envelope, pi: { ...pi, [field]: undefined } });
    refused({ ...envelope, tool_input: "not an object" });
  });
});

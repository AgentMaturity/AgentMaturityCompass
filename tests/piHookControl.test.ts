import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { authorizationRecordDigest } from "../src/actions/authorizationRecord.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { evaluateProviderHookControl, verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { HookControlError, validateProviderControlResponse } from "../src/bridge/hookProviders.js";
import { assertContract } from "../src/contracts/index.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { readEventPayload } from "../src/session/eventPayload.js";
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
  const verified = verifyReceipt(receipt, getPublicKeyHistory(workspace, "monitor"));
  expect(verified.ok).toBe(true);
  return verified.payload as Record<string, unknown>;
}

describe("Pi tool_call hook control", () => {
  test("allows a permitted read with Pi's allow value, runtime pi, and a receipt bound to the authorization record", () => {
    const workspace = controlledWorkspace(agentId);
    const rawInput = piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }, { actionId: "pi.allow-read" });
    const result = control(workspace, rawInput);

    expect(result).toMatchObject({ provider: "pi", decision: "allow", effectiveOutcome: "allow", providerMapping: "native",
      capabilityLossy: false, canonicalToolName: "fs.read", actionId: "pi.allow-read" });
    expect(result.providerResponse).toEqual({ block: false });
    expect(validateProviderControlResponse("pi", result.providerResponse)).toBe(true);

    const row = decisionRow(workspace, result.eventId);
    expect(row.event.runtime).toBe("pi");
    expect(row.session.runtime).toBe("pi");
    expect(row.meta).toMatchObject({ provider: "pi", piVersion: "1.0.4" });
    const record = assertContract("authorization-record", row.payload.authorizationRecord);
    const digest = authorizationRecordDigest(record);
    expect(row.payload).toMatchObject({ provider: "pi", piVersion: "1.0.4", authorizationRecordDigest: digest });
    expect(row.meta.authorizationRecordDigest).toBe(digest);
    expect(record).toMatchObject({
      executionId: "pi.allow-read",
      idempotencyKey: "toolu_pi.allow-read",
      principal: { principalId: "lease:lease_pi_fixture", kind: "service", authenticatedVia: "lease" },
      delegation: { leaseId: "lease_pi_fixture", depth: 0 },
      action: { toolName: "fs.read", actionClass: "READ_ONLY", adapterId: "hook:pi" },
      session: { callId: "pi.allow-read", rootCallId: "pi.allow-read", parentToken: null },
    });
    expect(Date.parse(record.expiresAt)).toBeLessThanOrEqual(lease.expiresTs);

    expect(receiptPayload(workspace, result.receipt)).toMatchObject({
      v: 2, kind: "action_state", state: "authorized", providerId: "hook-control:pi", executionId: "pi.allow-read",
      idempotencyKey: "toolu_pi.allow-read", authorizationRecordDigest: digest,
      enforcement: { level: "enforced", boundary: "pi:tool_call" }, body_sha256: result.providerResponseSha256,
    });
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "pi", rawInput, result }))
      .toEqual({ ok: true, error: null });
    expect(JSON.stringify(row)).not.toContain("public fixture");
  });

  test("denies an unmapped tool with Pi's block value and binds no authorization record", () => {
    const workspace = controlledWorkspace(agentId);
    const result = control(workspace, piEnvelope("my_ext_tool", { secret: "DO_NOT_RETAIN" }, { actionId: "pi.unmapped" }));

    expect(result.decision).toBe("deny");
    expect(result.providerResponse).toEqual({ block: true, reason: "Pi tool my_ext_tool is not mapped to an allowed ToolHub tool." });
    const row = decisionRow(workspace, result.eventId);
    expect(row.payload.authorizationRecordDigest).toBeNull();
    expect(receiptPayload(workspace, result.receipt)).toMatchObject({
      v: 2, state: "denied", authorizationRecordDigest: null, reason: "Pi tool my_ext_tool is not mapped to an allowed ToolHub tool.",
    });
    expect(JSON.stringify(row)).not.toContain("DO_NOT_RETAIN");
  });

  test("asks through Pi's confirmation only in the interactive TUI; every other mode denies as capability-lossy", () => {
    const workspace = controlledWorkspace(agentId);
    const write = (mode: "tui" | "rpc" | "json" | "print", hasUI: boolean) => control(workspace,
      piEnvelope("write", { path: join(workspace, "workspace", "output", "out.txt"), content: "PRIVATE" }, { actionId: `pi.ask-${mode}-${hasUI}`, mode, hasUI }));

    const interactive = write("tui", true);
    expect(interactive).toMatchObject({ requestedDecision: "ask", decision: "ask", providerMapping: "native", capabilityLossy: false });
    expect(interactive.providerResponse).toEqual({ block: true, ask: true, reason: expect.stringContaining("human approval") });
    expect(receiptPayload(workspace, interactive.receipt)).toMatchObject({ state: "requested", authorizationRecordDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });

    for (const [mode, hasUI] of [["print", false], ["json", false], ["rpc", true], ["tui", false]] as const) {
      const lossy = write(mode, hasUI);
      expect(lossy).toMatchObject({ requestedDecision: "ask", decision: "deny", effectiveOutcome: "deny",
        providerMapping: "fail_closed_deny", capabilityLossy: true });
      expect(lossy.providerResponse).toEqual({ block: true, reason: expect.stringContaining("no interactive confirmation") });
      expect(JSON.stringify(lossy)).not.toContain("PRIVATE");
    }
  });

  test("denies instead of reducing an approval quorum to one Pi confirmation", () => {
    const workspace = controlledWorkspace(agentId);
    const policy = defaultApprovalPolicy();
    policy.approvalPolicy.actionClasses.WRITE_LOW = { requiredApprovals: 2, rolesAllowed: ["APPROVER", "OWNER"], requireDistinctUsers: true, ttlMinutes: 15 };
    initApprovalPolicy(workspace, policy);
    const result = control(workspace, piEnvelope("edit", { path: join(workspace, "workspace", "output", "q.txt"), edits: [] }, { mode: "tui", hasUI: true }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("cannot be reduced to one provider-local ask");
  });

  test("replays the same Pi call id and input, and refuses the same call id with different input", () => {
    const workspace = controlledWorkspace(agentId);
    const first = piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }, { actionId: "pi.replay" });
    const original = control(workspace, first);
    const replay = control(workspace, first);
    expect(replay).toMatchObject({ idempotentReplay: true, eventId: original.eventId, receipt: original.receipt });
    expect(() => control(workspace, piEnvelope("read", { path: join(workspace, "workspace", "other.txt") }, { actionId: "pi.replay" })))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT", statusCode: 409 }));
  });

  test("an unqualified Pi version blocks every call; an unreadable version is recorded as unknown and is not claimed enforced", () => {
    const workspace = controlledWorkspace(agentId);
    const path = join(workspace, "workspace", "public.txt");
    const unqualified = control(workspace, piEnvelope("read", { path }, { actionId: "pi.v110", version: "1.1.0" }));
    expect(unqualified.decision).toBe("deny");
    expect(unqualified.providerResponse).toEqual({ block: true, reason: "AMC has not qualified Pi 1.1.0" });

    const unknown = control(workspace, piEnvelope("read", { path }, { actionId: "pi.unknown", version: "unknown" }));
    expect(unknown.decision).toBe("allow");
    expect(decisionRow(workspace, unknown.eventId).payload).toMatchObject({ piVersion: "unknown" });
    expect(receiptPayload(workspace, unknown.receipt)).toMatchObject({ enforcement: { level: "advisory" } });
  });

  test("a decision whose authorization record cannot bind is denied: expired lease, lease classes that do not cover the call", () => {
    const workspace = controlledWorkspace(agentId);
    const path = join(workspace, "workspace", "public.txt");
    const run = (id: string, hookLease: typeof lease & { executeActionClasses?: ["WRITE_LOW"] }) => evaluateProviderHookControl({
      workspace, authenticatedAgentId: agentId, provider: "pi", rawInput: piEnvelope("read", { path }, { actionId: id }), lease: hookLease });
    const expired = run("pi.expired", { leaseId: "lease_old", expiresTs: Date.now() - 1 });
    expect(expired.decision).toBe("deny");
    expect(expired.reason).toContain("could not bind an authorization record (capability_expired)");
    const narrow = run("pi.narrow", { ...lease, executeActionClasses: ["WRITE_LOW"] });
    expect(narrow.decision).toBe("deny");
    expect(narrow.reason).toContain("(scope_widened)");
    expect(receiptPayload(workspace, narrow.receipt)).toMatchObject({ state: "denied", authorizationRecordDigest: null });
  });

  test("without a lease the record names the self-reported OS user, never a lease", () => {
    const workspace = controlledWorkspace(agentId);
    const result = control(workspace, piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }), false);
    const record = assertContract("authorization-record", decisionRow(workspace, result.eventId).payload.authorizationRecord);
    expect(record.principal.authenticatedVia).toBe("cli-os-user");
    expect(record.delegation.leaseId).toBeNull();
  });

  test("refuses a Pi request without the tool_call event, its Pi context, or with an unknown context field", () => {
    const workspace = controlledWorkspace(agentId);
    const envelope = JSON.parse(piEnvelope("read", { path: "x" })) as Record<string, unknown>;
    const refused = (body: unknown) => expect(() => control(workspace, JSON.stringify(body)))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_INVALID", statusCode: 400 }));
    refused({ ...envelope, hook_event_name: "PreToolUse" });
    refused({ ...envelope, pi: undefined });
    refused({ ...envelope, pi: { ...(envelope.pi as object), extra: true } });
    refused({ ...envelope, pi: { ...(envelope.pi as object), mode: "headless" } });
  });
});

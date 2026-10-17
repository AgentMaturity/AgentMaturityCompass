import { randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { toolEvidenceFor } from "../src/tools/toolEvidence.js";
import { NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";
import { openActionJournal, type ActionJournal } from "../src/actions/actionJournal.js";
import { authorizationIntentFor } from "../src/actions/authorize.js";
import { createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution } from "../src/approvals/approvalEngine.js";
import { loadApprovalConsumed } from "../src/approvals/approvalChainStore.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { getPublicKeyPem, verifyHexDigest } from "../src/crypto/keys.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { closeSqlitePool } from "../src/storage/sqlitePool.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import type { ToolOutcome } from "../src/tools/toolTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";

/**
 * Every governed tool call lands in the signed spine (P5.1 remainder).
 *
 * `ToolPipeline` has always taken a `record` callback and nothing supplied
 * one, so guard denials were returned to the caller and recorded nowhere. A
 * governance product whose enforcement leaves no trace is advisory again at
 * the only moment that matters.
 */
const PASS = "tool-evidence-recording-pass";
const dirs: string[] = [];
const open: Array<{ close: () => void }> = [];
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
/**
 * Pin the host-dependent native shell (P0-06): macOS with the explicit opt-in
 * registers the shell on every host, so a guessed shell call reaches the signed
 * allowlist instead of depending on whether this machine has Bubblewrap.
 */
function unconfinedShellHost(): { readonly unconfinedShell: "cli-flag" } {
  Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
  return { unconfinedShell: "cli-flag" };
}

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  while (open.length > 0) {
    try { open.pop()?.close(); } catch { /* already closed */ }
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function readyWorkspace(): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = prior ?? PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-toolev-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  // P1-78: a toolset with no session writer records only into a session the ledger holds open.
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "toolset-test-session", runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  mkdirSync(join(dir, "workspace", "output"), { recursive: true });
  return dir;
}

function rows(workspace: string): Array<{ event_type: string; meta: Record<string, unknown> }> {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT event_type, meta_json FROM evidence_events").all() as Array<{ event_type: string; meta_json: string }>)
      .map((row) => ({ event_type: row.event_type, meta: JSON.parse(row.meta_json) as Record<string, unknown> }));
  } finally {
    db.close();
  }
}

const call = (name: string, args: unknown) => ({
  callId: `c-${name}-${Math.random().toString(36).slice(2, 8)}`,
  toolName: name,
  rawArguments: JSON.stringify(args),
  sessionId: "s1",
  turn: 1,
  step: 1,
  parentToken: null,
  dispatch: "native" as const,
  signal: new AbortController().signal
});

describe("a governed call leaves evidence", () => {
  it("records an ALLOWED call", async () => {
    const workspace = readyWorkspace();
    writeFileSync(join(workspace, "workspace", "n.txt"), "hello");
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session"});
    open.push(toolset);

    await toolset.seam.execute(call("fs.read", { path: "workspace/n.txt" }));

    const audits = rows(workspace).filter((row) => row.meta["auditType"] === "TOOL_CALL_ALLOWED");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.meta["toolName"]).toBe("fs.read");
    expect(audits[0]?.meta["trustTier"], "a machine watched it happen").toBe("OBSERVED");
  });

  it("records a DENIED call, with which guard refused and why", async () => {
    // The row that matters most. A denial the caller sees and the log does not
    // is enforcement nobody can audit afterwards.
    const workspace = readyWorkspace();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session", ...unconfinedShellHost() });
    open.push(toolset);

    await toolset.seam.execute(call("bash", { command: "sudo rm -rf /tmp/x" }));

    const denials = rows(workspace).filter((row) => row.meta["auditType"] === "TOOL_CALL_DENIED");
    expect(denials).toHaveLength(1);
    expect(denials[0]?.meta["denialGuard"]).toBe("tool-allowlist");
    expect(String(denials[0]?.meta["denialReason"])).toContain("deny pattern");
    expect(denials[0]?.meta["denialStage"]).toBe("guard");
  });

  it("writes an audit row AND a metric row per call", async () => {
    // Two rows because they answer different questions and the scoring gates
    // count them separately: what policy decided, and what it cost.
    const workspace = readyWorkspace();
    writeFileSync(join(workspace, "workspace", "n.txt"), "hello");
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session"});
    open.push(toolset);

    const request = call("fs.read", { path: "workspace/n.txt" });
    expect((await toolset.seam.execute(request)).outcome).toBe("OK");

    const written = rows(workspace);
    const audits = written.filter(row => row.event_type === "audit");
    // Admission and disposition are separate facts. Exact types/counts keep
    // duplicate tool evidence visible instead of counting every audit as a call.
    // EFFECTIVE_POLICY is the session's one effective-policy receipt, written before its first governed call (P1-12).
    expect(audits.map(row => row.meta.auditType).sort()).toEqual(["EFFECTIVE_POLICY", NATIVE_BUDGET_RESERVATION, "TOOL_CALL_ALLOWED"]);
    const disposition = audits.find(row => row.meta.auditType === "TOOL_CALL_ALLOWED")!;
    expect(disposition.meta).toMatchObject({ callId: request.callId, actionClass: "READ_ONLY", effectiveMode: "EXECUTE" });
    expect(audits.find(row => row.meta.auditType === NATIVE_BUDGET_RESERVATION)?.meta).toMatchObject({
      kind: "tool", nativeSessionId: "toolset-test-session", agentId: "default", callId: request.callId,
      toolToken: disposition.meta.toolToken, actionClass: "READ_ONLY"
    });
    const metrics = written.filter(row => row.event_type === "metric");
    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.meta).toMatchObject({ metricKey: "tool_call_outcome", callId: request.callId, toolToken: disposition.meta.toolToken });
  });

  it("correlates a call to its token, so a denial can be traced", async () => {
    const workspace = readyWorkspace();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session", ...unconfinedShellHost() });
    open.push(toolset);

    const request = call("bash", { command: "sudo ls" });
    await toolset.seam.execute(request);
    const audit = rows(workspace).find((row) => row.event_type === "audit" && row.meta.auditType === "TOOL_CALL_DENIED");

    expect(String(audit?.meta["toolToken"] ?? "")).toMatch(/^tok_/);
    expect(audit?.meta.callId).toBe(request.callId);
  });

  it("does NOT copy the arguments into the audit row", async () => {
    // They are frozen and already recorded on the call itself. Repeating them
    // would put the same untrusted content in a second place with a second
    // retention and DSAR story.
    const workspace = readyWorkspace();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session"});
    open.push(toolset);

    await toolset.seam.execute(call("fs.read", { path: "workspace/SECRET-MARKER.txt" }));

    const serialised = JSON.stringify(rows(workspace));
    expect(serialised, "the audit row is about the decision, not the payload").not.toContain("SECRET-MARKER");

    // The meta is only half the row. Checking it alone left the PAYLOAD
    // uncovered, so a mutation that copied the arguments into the payload
    // stayed green — asserted directly on the projection, which is the only
    // place both halves are visible together.
    const projected = toolEvidenceFor(
      {
        token: "tok_1", callId: "c1", rootCallId: "c1", name: "fs.read", agentId: "a",
        workspace, actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
        arguments: { path: "workspace/SECRET-MARKER.txt" }, parentToken: null
      },
      { ok: true, exitCode: null, timedOut: false, denied: null, output: "", bytes: 0 }
    );
    expect(JSON.stringify(projected), "neither meta nor payload carries the arguments")
      .not.toContain("SECRET-MARKER");
  });
});

describe("recording never breaks the call", () => {
  it("returns the tool's real outcome when the recorder throws", async () => {
    // Tested against a recorder that genuinely fails, which is only possible
    // because the guarantee lives in the PIPELINE. It was previously inside
    // agentToolset's recorder, where proving it meant making the real ledger
    // fail — and every filesystem sabotage I tried was survived by SQLite, so
    // the test passed without ever reaching the path it claimed to cover.
    const registry = new ToolRegistry();
    registry.define(defineTool({
      name: "echo", actionClass: "READ_ONLY", description: "echo",
      body: () => ({ output: "real output" })
    }));
    let recorderCalled = false;
    const pipeline = new ToolPipeline({
      registry,
      workspace: "/tmp",
      record: () => {
        recorderCalled = true;
        throw new Error("the evidence store is unreachable");
      }
    });

    const outcome = await pipeline.execute({
      name: "echo", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });

    expect(recorderCalled, "the recorder really did run and really did throw").toBe(true);
    expect(outcome.ok, "an evidence problem is not a tool failure").toBe(true);
    expect(outcome.output).toBe("real output");
    expect(outcome.denied, "and certainly not a denial policy never made").toBeNull();
  });
});

describe("the projection itself", () => {
  it("labels the three outcomes distinctly", () => {
    const base = {
      token: "tok_1", callId: "c1", rootCallId: "c1", name: "fs.read", agentId: "a",
      workspace: "/w", actionClass: "READ_ONLY" as const, requestedMode: "EXECUTE" as const,
      effectiveMode: "EXECUTE" as const, arguments: {}, parentToken: null
    };
    const outcome = (over: Record<string, unknown>) => ({
      ok: true, exitCode: null, timedOut: false, denied: null, output: "", bytes: 0, ...over
    });

    const allowed = toolEvidenceFor(base, outcome({}) as never);
    const denied = toolEvidenceFor(base, outcome({
      ok: false, denied: { stage: "guard", reason: "no", guardLabel: "g" }
    }) as never);
    const failed = toolEvidenceFor(base, outcome({ ok: false }) as never);

    expect(allowed[0]?.meta["auditType"]).toBe("TOOL_CALL_ALLOWED");
    expect(denied[0]?.meta["auditType"]).toBe("TOOL_CALL_DENIED");
    // A tool that threw is not a tool that policy refused. Conflating them
    // would credit the guards with stopping something they allowed.
    expect(failed[0]?.meta["auditType"]).toBe("TOOL_CALL_FAILED");
  });
});

it("keeps a real journaled effect when recording fails, signs the gap and blocks the next financial call", async () => {
  // Local journal composition only: these fixture decisions do not authenticate
  // a person, invoke HTTP, or exercise a payment provider.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-journaled-recorder-")));
  chmodSync(root, 0o700);
  const workspace = join(root, "workspaces", randomUUID());
  const home = join(root, "operator-home");
  mkdirSync(home, { mode: 0o700 });
  const environment = {
    HOME: home, AMC_HOME: home, AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"),
    AMC_VAULT_PASSPHRASE: "owned-journaled-recorder-pass", AMC_NO_SIGN: "0",
    AMC_LEDGER_SQLITE_SYNCHRONOUS: "FULL", AMC_OTEL_ENABLED: "false"
  };
  const prior = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  let journal: ActionJournal | undefined;
  try {
    for (const [key, value] of Object.entries(environment)) process.env[key] = value;
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    // Pin before producing the policies, approvals and action receipts below.
    const monitorPem = getPublicKeyPem(workspace, "monitor");
    const auditorPem = getPublicKeyPem(workspace, "auditor");
    const signedArtifact = (path: string): void => {
      const bytes = readFileSync(path);
      const signature = JSON.parse(readFileSync(`${path}.sig`, "utf8")) as {
        signer: string; digestSha256: string; signature: string
      };
      expect(signature.signer).toBe("auditor");
      expect(signature.digestSha256).toBe(sha256Hex(bytes));
      expect(verifyHexDigest(signature.digestSha256, signature.signature, auditorPem)).toBe(true);
    };
    initActionPolicy(workspace);
    initBudgets(workspace, "default");
    initApprovalPolicy(workspace);
    const financial = "fixture.financial";
    const readOnly = "fixture.read";
    const args = { amount: "100.00", currency: "USD", recipient: "owned-recipient" };
    initToolsConfig(workspace, { tools: { version: 1, denyByDefault: true, allowedTools: [
      { name: financial, actionClass: "FINANCIAL", bindingFields: { amount: "amount", currency: "currency", recipient: "recipient" } },
      { name: readOnly, actionClass: "READ_ONLY" }
    ] } });
    for (const name of ["action-policy.yaml", "budgets.yaml", "approval-policy.yaml", "tools.yaml"]) {
      signedArtifact(join(workspace, ".amc", name));
    }
    let grantNumber = 0;
    const approvedAuthority = () => {
      const intent = authorizationIntentFor({ workspace, name: financial, actionClass: "FINANCIAL", effectiveMode: "EXECUTE", arguments: args });
      if (!intent.ok) throw new Error(`Owned financial intent refused: ${intent.reason}`);
      const created = createApprovalForIntent({ workspace, agentId: "default", intentId: `owned-recorder-${++grantNumber}`,
        toolName: financial, actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: intent.payload });
      signedArtifact(created.filePath);
      const reviewers = [{ id: "owned-owner", role: "OWNER" as const }, { id: "owned-auditor", role: "AUDITOR" as const }];
      expect(created.request.requiredApprovals).toBeGreaterThan(0);
      expect(created.request.requiredApprovals).toBeLessThanOrEqual(reviewers.length);
      for (const reviewer of reviewers.slice(0, created.request.requiredApprovals)) decideApprovalForIntent({
        workspace, agentId: "default", approvalId: created.request.approvalRequestId, decision: "APPROVED", mode: "EXECUTE",
        reason: "Approve only the owned local file effect", userId: reviewer.id, username: reviewer.id, userRoles: [reviewer.role]
      });
      signedArtifact(created.filePath);
      expect(verifyApprovalForExecution({ workspace, approvalId: created.request.approvalRequestId, expectedAgentId: "default",
        expectedToolName: financial, expectedActionClass: "FINANCIAL", expectedIntentHash: created.request.boundHashes.intentHash }))
        .toMatchObject({ ok: true, status: "QUORUM_MET" });
      return { approvalRequestIds: [created.request.approvalRequestId] };
    };
    journal = openActionJournal(workspace);
    const activeJournal = journal;
    const effectPath = join(root, "effect.jsonl");
    let financialCalls = 0;
    let readCalls = 0;
    const recorded: Array<{ name: string; outcome: ToolOutcome }> = [];
    const registry = new ToolRegistry();
    registry.define(defineTool({ name: financial, description: "Append to the owned effect file", actionClass: "FINANCIAL", body: execution => {
      financialCalls++;
      appendFileSync(effectPath, `${JSON.stringify({ callId: execution.callId, authorizationId: execution.authorization?.authorizationId })}\n`, { mode: 0o600 });
      return { output: "real owned effect", effect: "applied", externalRef: "owned-effect-1" };
    } }));
    registry.define(defineTool({ name: readOnly, description: "Read the owned effect file", actionClass: "READ_ONLY", body: () => {
      readCalls++;
      return { output: readFileSync(effectPath, "utf8") };
    } }));
    const pipeline = new ToolPipeline({ workspace, registry, journal: () => activeJournal,
      boundApprovalRequiredFor: new Set(["FINANCIAL"]), record(execution, outcome) {
        recorded.push({ name: execution.name, outcome });
        throw new Error("the owned recorder is unreachable after the effect");
      }
    });
    const firstAuthority = approvedAuthority();
    const outcome = await pipeline.execute({ name: financial, agentId: "default", arguments: args, requestedMode: "EXECUTE",
      callId: "owned-effect-first", authority: firstAuthority });
    expect(financialCalls).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.name).toBe(financial);
    expect(recorded[0]?.outcome.action).toMatchObject({ state: "completed", evidenceComplete: true });
    expect(outcome).toMatchObject({ ok: true, output: "real owned effect", denied: null,
      action: { state: "completed", evidenceComplete: false } });
    const effectBytes = readFileSync(effectPath, "utf8");
    expect(effectBytes.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(effectBytes)).toMatchObject({ callId: "owned-effect-first" });
    const executionId = outcome.action!.executionId;
    const view = activeJournal.get(executionId)!;
    expect(view).toMatchObject({ state: "completed", effect: "applied", evidenceComplete: false });
    expect(view.receipts.map(receipt => receipt.state)).toEqual(["requested", "authorized", "started", "completed", "completed"]);
    const completed = view.receipts.at(-2)!;
    const incomplete = view.receipts.at(-1)!;
    const expectedOutcomeDigest = sha256Hex(canonicalize({ ok: outcome.ok, exitCode: outcome.exitCode, timedOut: outcome.timedOut,
      bytes: outcome.bytes, outputSha256: sha256Hex(outcome.output) }));
    expect(completed).toMatchObject({ evidenceComplete: true, effect: "applied", externalRef: "owned-effect-1", outcomeDigest: expectedOutcomeDigest });
    expect(incomplete).toMatchObject({ reasonCode: "evidence_incomplete:recorder_failed", evidenceComplete: false,
      effect: "applied", externalRef: "owned-effect-1", outcomeDigest: expectedOutcomeDigest });
    expect(activeJournal.verifyReceiptChain(executionId)).toMatchObject({ ok: true, errors: [] });
    const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
    try {
      const transitions = db.prepare(`SELECT t.receipt_json, t.receipt_digest, e.payload_inline, e.meta_json, e.event_hash, e.writer_sig
        FROM action_transitions t JOIN evidence_events e ON e.id = t.evidence_event_id WHERE t.execution_id = ? ORDER BY t.seq`)
        .all(executionId) as Array<{ receipt_json: string; receipt_digest: string; payload_inline: string; meta_json: string; event_hash: string; writer_sig: string }>;
      expect(transitions).toHaveLength(5);
      for (const transition of transitions) {
        expect(transition.payload_inline).toBe(transition.receipt_json);
        expect(sha256Hex(transition.receipt_json)).toBe(transition.receipt_digest);
        expect(verifyHexDigest(transition.event_hash, transition.writer_sig, monitorPem)).toBe(true);
        const meta = JSON.parse(transition.meta_json) as { receipt: string };
        const signed = verifyReceipt(meta.receipt, [monitorPem]);
        expect(signed.ok).toBe(true);
        expect(signed.payload).toMatchObject({ v: 2, kind: "action_state", executionId,
          body_sha256: transition.receipt_digest, event_hash: transition.event_hash });
      }
    } finally { db.close(); }
    expect(activeJournal.blockingExecutions({ workspaceId: activeJournal.workspaceId, agentId: "default" })).toContain(executionId);
    // A fresh genuine grant rules out replay/missing authority as the reason
    // this later financial body is refused. It must remain unconsumed.
    const nextAuthority = approvedAuthority();
    const blocked = await pipeline.execute({ name: financial, agentId: "default", arguments: args, requestedMode: "EXECUTE",
      callId: "owned-effect-blocked", authority: nextAuthority });
    expect(blocked.ok).toBe(false);
    expect(blocked.denied?.stage).toBe("authorization");
    expect(blocked.denied?.reason).toContain(`blocked_by_unreconciled:${executionId}:`);
    expect(blocked.action).toMatchObject({ state: "denied", evidenceComplete: true });
    expect(loadApprovalConsumed({ workspace, agentId: "default", approvalRequestId: nextAuthority.approvalRequestIds[0]! })).toBeNull();
    expect(financialCalls).toBe(1);
    expect(readFileSync(effectPath, "utf8")).toBe(effectBytes);
    const read = await pipeline.execute({ name: readOnly, agentId: "default", arguments: {}, requestedMode: "EXECUTE", callId: "owned-read" });
    expect(read).toMatchObject({ ok: true, denied: null, output: effectBytes });
    expect(read.action).toBeUndefined();
    expect(readCalls).toBe(1);
    expect(recorded.map(record => record.name)).toEqual([financial, financial, readOnly]);
    expect(financialCalls).toBe(1);
    expect(readFileSync(effectPath, "utf8")).toBe(effectBytes);
    expect(getPublicKeyPem(workspace, "monitor")).toBe(monitorPem);
    expect(getPublicKeyPem(workspace, "auditor")).toBe(auditorPem);
  } finally {
    const errors: unknown[] = [];
    try {
      try { journal?.close(); } catch (error) { errors.push(error); }
      try { closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`); }
      catch (error) { errors.push(error); }
      try { lockVault(workspace); } catch (error) { errors.push(error); }
      // Keep a failed-to-close fixture intact rather than delete an open DB.
      if (errors.length === 0) {
        try { rmSync(root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
      }
    } finally {
      for (const [key, value] of prior) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Owned journaled recorder fixture cleanup failed");
  }
});

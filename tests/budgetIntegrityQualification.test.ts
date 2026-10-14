import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getPublicKeyPem } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { BudgetEvidenceIntegrityError, readBudgetEvents } from "../src/budgets/nativeBudgetUsage.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import { liveNativeFailureGuidance, projectNativeRunDiagnostics } from "../src/agent/nativeFailureGuidance.js";
import { anthropicTextStream, errorResponse, okStream, stubUpstream } from "./helpers/llmStubUpstream.js";

const evidence = process.env.AMC_P0_27_BUDGET_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), "amc-p0-27-budget-evidence-"));
mkdirSync(evidence, { recursive: true });
const observations: object[] = [];
const sessions: SessionService[] = [];
let outer: string;
let workspace: string;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const credentials: CredentialsService = {
  resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("unused qualification credential write"); }, unset: async () => false
};

beforeEach(() => {
  outer = mkdtempSync(join(tmpdir(), "amc-p0-27-budget-"));
  workspace = join(outer, "workspace");
  const home = join(outer, "operator-home");
  mkdirSync(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-27-owned-budget-fixture");
  vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(outer, "control-checkpoints"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  observations.push({ phase: "independent-operator-pin-before-rows", workspace,
    monitorPublicKeySha256: hash(getPublicKeyPem(workspace, "monitor")) });
});

afterEach(() => {
  for (const value of sessions.splice(0)) {
    try { value.close({ reason: "completed" }); } catch { /* Retain the observed failure, then remove only this owned fixture. */ }
  }
  vi.unstubAllEnvs();
  rmSync(outer, { recursive: true, force: true });
});

afterAll(() => {
  writeFileSync(join(evidence, "budget-observations.json"), JSON.stringify(observations, null, 2) + "\n", { mode: 0o600 });
});

function controlRow() {
  const ledger = openLedger(workspace);
  try {
    const sessionId = "p0-27-signed-budget-control";
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "p0-27-owned-fixture", binarySha256: hash("p0-27-owned-fixture") });
    const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit",
      payload: "P0-27 owned signed control", payloadExt: "txt", inline: true, meta: { auditType: "P0_27_SIGNED_CONTROL" } });
    ledger.sealSession(sessionId);
    const row = ledger.getAllEvents().find(value => value.id === id)!;
    expect(row.writer_sig).not.toBe("unsigned");
    return row;
  } finally { ledger.close(); }
}

/** Deliberate damage in a disposable owned DB, with its real trigger restored immediately. */
function fault(table: "evidence_events" | "sessions", field: string, value: string, id: string) {
  const ledger = openLedger(workspace);
  try {
    const trigger = table === "evidence_events" ? "protect_evidence_immutable" : "protect_sessions_sealed_immutable";
    const definition = ledger.db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(trigger) as { sql: string };
    expect(definition.sql).toBeTruthy();
    const before = ledger.db.prepare(`SELECT * FROM ${table}`).all();
    ledger.db.exec(`DROP TRIGGER ${trigger}`);
    try { ledger.db.prepare(`UPDATE ${table} SET ${field} = ? WHERE ${table === "sessions" ? "session_id" : "id"} = ?`).run(value, id); }
    finally { ledger.db.exec(definition.sql); }
    const after = ledger.db.prepare(`SELECT * FROM ${table}`).all();
    const restored = ledger.db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(trigger) as { sql: string };
    expect(restored.sql).toBe(definition.sql);
    observations.push({ phase: "owned-db-fault", table, field, id, before, after, triggerRestored: true });
  } finally { ledger.close(); }
}

function request(upstream: ReturnType<typeof stubUpstream>) {
  const session = new SessionService(workspace);
  sessions.push(session);
  session.open({ agentId: "default", harnessVersion: "p0-27-qualified-fixture", compositionDigest: "p0-27-fixture", policyDigest: "p0-27-fixture" });
  const prompt = session.recordSystemPrompt("P0-27 local wire-fixture control");
  session.startTurn({ trigger: "user" });
  session.recordUserMessage("Return the local fixture response");
  session.startStep();
  const registry = new AdapterRegistry();
  registry.register({ providerId: "p0-27-fixture", models: ["fixture"], adapter: anthropicAdapter,
    baseUrl: "https://p0-27-fixture.invalid", credentialRef: null });
  return { session, runtime: new LlmRuntime({ session, registry, credentials, transport: upstream.transport }),
    spec: { providerId: "p0-27-fixture", model: "fixture", params: { max_tokens: 20, stream: true }, systemPromptEventId: prompt.eventId, tools: null } };
}
const response = () => okStream(anthropicTextStream({ text: ["fixture complete"], inputTokens: 10, outputTokens: 3 }));
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* Actual runtime stream, canned local wire bytes. */ } }

describe("P0-27 signed budget evidence integrity and native failure projection", () => {
  test("a genuine sealed row is readable and the injected wire transport is reached", async () => {
    const row = controlRow();
    expect(readBudgetEvents(workspace).map(value => value.id)).toEqual([row.id]);
    const upstream = stubUpstream([response]);
    const run = request(upstream);
    await drain(run.runtime.stream(run.spec));
    expect(upstream.sent).toHaveLength(1);
    observations.push({ phase: "healthy-runtime", sessionId: run.session.sessionId, transmitted: upstream.sent.length });
  });

  test.each([
    ["literal unsigned", "writer_sig", "unsigned"],
    ["invalid signature", "writer_sig", "00"],
    ["invalid hash", "event_hash", "0".repeat(64)]
  ])("%s evidence names its actual offending row and refuses before transport", async (name, field, value) => {
    const row = controlRow();
    expect(readBudgetEvents(workspace).map(event => event.id)).toEqual([row.id]);
    fault("evidence_events", field, value, row.id);
    let readerError: unknown;
    try { readBudgetEvents(workspace); } catch (error) { readerError = error; }
    expect(readerError).toBeInstanceOf(BudgetEvidenceIntegrityError);
    expect((readerError as Error).message).toContain(row.id);
    if (value === "unsigned") expect((readerError as Error).message).toContain('literal "unsigned"');
    const upstream = stubUpstream([response]);
    const run = request(upstream);
    let runtimeError: unknown;
    try { await drain(run.runtime.stream(run.spec)); } catch (error) { runtimeError = error; }
    expect(runtimeError).toBeDefined();
    expect(upstream.sent).toHaveLength(0);
    const guidance = liveNativeFailureGuidance(runtimeError);
    expect(guidance.code).toBe("AMC_EVIDENCE_INTEGRITY");
    expect(guidance.summary).toBe("Workspace evidence failed verification before budget admission.");
    expect(guidance.nextAction).toContain("Do not reset budgets to bypass this.");
    const ledger = openLedger(workspace);
    try {
      const events = ledger.getAllEvents();
      const failure = events.filter(event => event.session_id === run.session.sessionId && event.event_type === "request/failure").map(event => JSON.parse(event.meta_json));
      expect(failure).toHaveLength(1);
      expect(failure[0].failure.code).toBe("AMC_EVIDENCE_INTEGRITY");
      expect(failure[0].failure.message).toContain(row.id);
      expect(projectNativeRunDiagnostics(events, run.session.sessionId).map(value => value.guidance.code)).toEqual(["AMC_EVIDENCE_INTEGRITY"]);
      observations.push({ phase: name, rowId: row.id, sessionId: run.session.sessionId,
        readerError: (readerError as Error).message, liveGuidance: guidance, actualFailures: failure, projected: projectNativeRunDiagnostics(events, run.session.sessionId), transmitted: 0 });
    } finally { ledger.close(); }
  });

  test("a damaged genuine session seal is an integrity error rather than quota", () => {
    const row = controlRow();
    expect(readBudgetEvents(workspace).map(value => value.id)).toEqual([row.id]);
    fault("sessions", "session_seal_sig", "unsigned", row.session_id);
    let error: unknown;
    try { readBudgetEvents(workspace); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(BudgetEvidenceIntegrityError);
    expect((error as Error).message).toContain(row.session_id);
    expect((error as Error).message).toContain('literal "unsigned"');
    observations.push({ phase: "damaged-seal", error: (error as Error).message });
  });

  test("a provider quota wire refusal retains QUOTA after an actual dispatch", async () => {
    const upstream = stubUpstream([() => errorResponse(429, { error: { type: "rate_limit_error", message: "insufficient_quota: fixture account allowance exhausted" } })]);
    const run = request(upstream);
    let error: unknown;
    try { await drain(run.runtime.stream(run.spec)); } catch (caught) { error = caught; }
    expect(error).toBeDefined();
    expect(upstream.sent).toHaveLength(1);
    expect(liveNativeFailureGuidance(error).code).toBe("QUOTA");
    const ledger = openLedger(workspace);
    try {
      const projected = projectNativeRunDiagnostics(ledger.getAllEvents(), run.session.sessionId);
      expect(projected.map(value => value.guidance.code)).toEqual(["QUOTA"]);
      observations.push({ phase: "provider-quota-wire-control", transmitted: 1, projected });
    } finally { ledger.close(); }
  });
});

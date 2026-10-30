import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { revokeLease, leaseRevocationPaths } from "../src/leases/leaseStore.js";
import { createWireDispatcher } from "../src/wire/wireDispatcher.js";
import * as ledgerVerificationModule from "../src/ledger/ledgerVerification.js";
import * as acceptanceModule from "../src/wire/workAcceptance.js";
import { acceptWork, describeAcceptedWork } from "../src/wire/workAcceptance.js";
import { consumeAcceptedWork } from "../src/wire/workConsumer.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { stubProviderRoute, stubProviderTransport, STUB_PROVIDER_MODEL } from "../src/agent/stubProvider.js";
import { FixedCredentials } from "./helpers/agentLoopHarness.js";
import { sha256Hex } from "../src/utils/hash.js";
import { admitSessionEnvelope } from "../src/session/sessionTypes.js";
import { setMode } from "../src/mode/mode.js";

const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture(thinkMs = 0) {
  process.env["AMC_VAULT_PASSPHRASE"] = "wire-consumer-pass";
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wire-consumer-"))); dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "intake", runtime: "amc", binaryPath: "wire-test", binarySha256: "a".repeat(64) });
  const monitorPublicKeys = getPublicKeyHistory(workspace, "monitor");
  const token = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "wire:submit", routes: "/wire", models: "*", rpm: 50, tpm: 10000, maxCostUsdPerDay: null }).token;
  const dispatcher = createWireDispatcher({ workspace, ledger, intakeSessionId: "intake", monitorPublicKeys });
  const registry = new AdapterRegistry(); registry.register(stubProviderRoute());
  const execution = { route: { providerId: "stub", model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
    makeLlm: (session: import("../src/session/sessionService.js").SessionService) => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: stubProviderTransport({ thinkMs }) }),
    systemPrompt: "Complete the accepted task.", harnessVersion: "test", compositionDigest: "b".repeat(64), policyDigest: "c".repeat(64), tools: "none" as const };
  const accept = (selectedToken = token, model: string | null = STUB_PROVIDER_MODEL) => {
    const reply = dispatcher.handle(Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "work/accept", lease: selectedToken,
      params: { prompt: "hello from wire", providerId: "stub", model } }) + "\n"));
    return (JSON.parse(reply.replies[0]!.toString()) as { result: { receipt: string; workSessionId: string } }).result;
  };
  const consume = (receipt: string, leaseToken = token) => consumeAcceptedWork({ workspace, ledger, intakeSessionId: "intake", monitorPublicKeys, receipt, leaseToken, execution });
  return { workspace, ledger, monitorPublicKeys, token, execution, accept, consume };
}

describe("accepted wire work", () => {
  it("executes once in its promised native session and cites acceptance in its first event", async () => {
    const f = fixture(); const accepted = f.accept();
    const outcome = await f.consume(accepted.receipt);
    expect(outcome.ok, outcome.reason).toBe(true);
    expect(JSON.stringify(f.ledger.getAllEvents())).not.toContain(f.token);
    expect(outcome.workSessionId).toBe(accepted.workSessionId);
    const events = f.ledger.getAllEvents().filter(row => row.session_id === accepted.workSessionId);
    expect(events[0]?.event_type).toBe("session/open");
    expect(JSON.parse(events[0]!.meta_json)).toMatchObject({ acceptedWork: { receipt: accepted.receipt } });
    expect(events.some(row => row.event_type === "request/header")).toBe(true);
    expect(events.at(-1)?.event_type).toBe("session/close");
    expect(describeAcceptedWork({ ledger: f.ledger, monitorPublicKeys: f.monitorPublicKeys, receipt: accepted.receipt })).toMatchObject({ ok: true, state: "finished" });
    expect(await f.consume(accepted.receipt)).toMatchObject({ ok: false, state: "not-claimed" });
    f.ledger.sealSession("intake");
    expect((await verifyLedgerIntegrity(f.workspace)).errors).toEqual([]);
  });
  it("claims before awaits, preventing a second consumer from executing the same occurrence", async () => {
    const f = fixture(40); const accepted = f.accept();
    const first = f.consume(accepted.receipt); const second = f.consume(accepted.receipt);
    expect(await second).toMatchObject({ ok: false, state: "not-claimed" });
    expect((await first).ok).toBe(true);
  });
  it("refuses mismatched, revoked and absent lease authority without executing", async () => {
    for (const reason of ["mismatch", "revoked", "missing"] as const) {
      const f = fixture(); const accepted = f.accept();
      const token = reason === "mismatch" ? issueLeaseForCli({ workspace: f.workspace, agentId: "default", ttl: "60m", scopes: "wire:submit", routes: "/wire", models: "*", rpm: 50, tpm: 10000, maxCostUsdPerDay: null }).token : f.token;
      if (reason === "revoked") { const payload = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString()) as { leaseId: string }; revokeLease(f.workspace, payload.leaseId, "test"); }
      const result = await f.consume(accepted.receipt, reason === "missing" ? "" : token);
      expect(result.ok).toBe(false);
      expect(result.state).toBe("refused");
      expect(describeAcceptedWork({ ledger: f.ledger, monitorPublicKeys: f.monitorPublicKeys, receipt: accepted.receipt })).toMatchObject({ ok: true, state: "refused" });
      expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId)).toBe(false);
    }
  });
  it("records a refusal when execution is unconfigured or the operator route differs", async () => {
    const f = fixture(); const accepted = f.accept();
    await expect(consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys, receipt: accepted.receipt, leaseToken: f.token })).resolves.toMatchObject({ ok: false, state: "refused" });
    const other = f.accept();
    expect(await consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys, receipt: other.receipt, leaseToken: f.token,
      execution: { ...f.execution, route: { ...f.execution.route, providerId: "other" } } })).toMatchObject({ ok: false, state: "refused" });
  });
  it("refuses overlapping accepted work without silently queueing it", async () => {
    const f = fixture(40); const first = f.accept(); const second = f.accept();
    const running = f.consume(first.receipt);
    const secondResult = await f.consume(second.receipt); const firstResult = await running;
    expect(secondResult).toMatchObject({ ok: false, state: "refused" });
    expect(firstResult.ok).toBe(true);
  });
  it("does not consume forged receipts or execute in agent mode", async () => {
    const f = fixture(); const accepted = f.accept();
    expect(await f.consume("forged")).toMatchObject({ ok: false, state: "not-claimed", reason: expect.stringContaining("receipt did not verify") });
    setMode(f.workspace, "agent");
    await expect(f.consume(accepted.receipt)).rejects.toThrow(/owner/);
  });
});

describe("wire consumer failure boundaries", () => {
  it("settles cancellation before releasing the active execution", async () => {
    const f = fixture(1000); const accepted = f.accept(); const controller = new AbortController();
    const running = consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
      receipt: accepted.receipt, leaseToken: f.token, execution: f.execution, signal: controller.signal });
    await vi.waitFor(() => expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId && row.event_type === "request/header")).toBe(true));
    controller.abort();
    expect(await running).toMatchObject({ ok: false, state: "failed" });
    expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId && row.event_type === "session/close")).toBe(true);
    const next = f.accept();
    const following = await f.consume(next.receipt);
    expect(following.reason).not.toContain("active execution cap");
    expect(f.ledger.getAllEvents().some(row => row.session_id === next.workSessionId && row.event_type === "session/open")).toBe(true);
  });
  it("records pre-dispatch cancellation as a refusal", async () => {
    const f = fixture(); const accepted = f.accept(); const controller = new AbortController(); controller.abort();
    expect(await consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
      receipt: accepted.receipt, leaseToken: f.token, execution: f.execution, signal: controller.signal })).toMatchObject({ ok: false, state: "refused" });
    expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId)).toBe(false);
  });
  it("records composition failure without reporting successful completion", async () => {
    const f = fixture(); const accepted = f.accept();
    expect(await consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
      receipt: accepted.receipt, leaseToken: f.token, execution: { ...f.execution, makeLlm: () => { throw new Error(`test composition failure ${f.token}`); } } })).toMatchObject({ ok: false, state: "failed" });
    expect(JSON.stringify(f.ledger.getAllEvents())).not.toContain(f.token);
    const close = f.ledger.getAllEvents().find(row => row.session_id === accepted.workSessionId && row.event_type === "session/close");
    expect(JSON.parse(close!.meta_json).reason).toBe("composition_failed");
  });
  it("requires an open intake for claim evidence", async () => {
    const f = fixture(); const accepted = f.accept(); f.ledger.sealSession("intake");
    await expect(f.consume(accepted.receipt)).rejects.toThrow(/open intake/);
  });
  it("does not grant tools from a submission-only lease", async () => {
    const f = fixture(); const accepted = f.accept();
    expect(await consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
      receipt: accepted.receipt, leaseToken: f.token, execution: { ...f.execution, tools: "workspace" } })).toMatchObject({ ok: false, state: "refused" });
  });
  it("fails closed on an unverifiable revocation list", async () => {
    const f = fixture(); const accepted = f.accept(); revokeLease(f.workspace, "other", "test");
    writeFileSync(leaseRevocationPaths(f.workspace).file, JSON.stringify({ v: 1, updatedTs: 0, revocations: [] }));
    expect(await f.consume(accepted.receipt)).toMatchObject({ ok: false, state: "refused" });
  });
  it("refuses expired leases at consumption even after valid acceptance", async () => {
    const f = fixture(); const accepted = f.accept(); const lease = JSON.parse(Buffer.from(f.token.split(".")[0]!, "base64url").toString()) as { expiresTs: number };
    const clock = vi.spyOn(Date, "now").mockReturnValue(lease.expiresTs + 1);
    try { expect(await f.consume(accepted.receipt)).toMatchObject({ ok: false, state: "refused" }); } finally { clock.mockRestore(); }
  });
  it("refuses signed malformed accepted requests before composition", async () => {
    const f = fixture(); const lease = JSON.parse(Buffer.from(f.token.split(".")[0]!, "base64url").toString()) as { leaseId: string };
    const accepted = acceptWork({ ledger: f.ledger, intakeSessionId: "intake", request: { prompt: "", agentId: "default", providerId: "stub", model: STUB_PROVIDER_MODEL },
      authority: { leaseId: lease.leaseId, tokenSha256: sha256Hex(f.token) } });
    expect(await f.consume(accepted.receipt)).toMatchObject({ ok: false, state: "refused" });
  });
});

it("reports finished work from the JSONL native session backend", async () => {
  const f = fixture(); const accepted = f.accept(); vi.stubEnv("AMC_SESSION_STORE", "jsonl");
  expect((await f.consume(accepted.receipt)).ok).toBe(true);
  expect(describeAcceptedWork({ ledger: f.ledger, receipt: accepted.receipt, monitorPublicKeys: f.monitorPublicKeys })).toMatchObject({ ok: true, state: "finished" });
});
it("does not dispatch when composition itself observes cancellation", async () => {
  const f = fixture(); const accepted = f.accept(); const controller = new AbortController();
  const result = await consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
    receipt: accepted.receipt, leaseToken: f.token, signal: controller.signal,
    execution: { ...f.execution, makeLlm: session => { controller.abort(); return f.execution.makeLlm(session); } } });
  expect(result).toMatchObject({ ok: false, state: "refused" });
  expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId && row.event_type === "request/header")).toBe(false);
});
it("retains refusal claims after the consumer operation returns and its ledger reopens", async () => {
  const f = fixture(); const accepted = f.accept();
  expect(await consumeAcceptedWork({ workspace: f.workspace, ledger: f.ledger, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
    receipt: accepted.receipt, leaseToken: f.token })).toMatchObject({ state: "refused" });
  const reopened = openLedger(f.workspace);
  try { expect(await consumeAcceptedWork({ workspace: f.workspace, ledger: reopened, intakeSessionId: "intake", monitorPublicKeys: f.monitorPublicKeys,
    receipt: accepted.receipt, leaseToken: f.token, execution: f.execution })).toMatchObject({ state: "not-claimed" }); }
  finally { reopened.close(); }
});

it("observes a durable competing claim committed between description and admission", async () => {
  const f = fixture(); const accepted = f.accept();
  const acceptance = f.ledger.getAllEvents().find(row => row.event_type === "work/accepted")!;
  const exec = f.ledger.db.exec.bind(f.ledger.db); let injected = false;
  const race = vi.spyOn(f.ledger.db, "exec").mockImplementation(sql => {
    if (sql === "BEGIN IMMEDIATE" && !injected) {
      injected = true;
      f.ledger.appendEvidence({ sessionId: "intake", runtime: "amc", eventType: "audit", payload: "Competing owner claimed occurrence", inline: true,
        meta: { type: "wire_work_claimed", acceptedEventId: acceptance.id, claimId: "competing-claim" } });
    }
    return exec(sql);
  });
  try { expect(await f.consume(accepted.receipt)).toMatchObject({ ok: false, state: "not-claimed" }); }
  finally { race.mockRestore(); }
  expect(injected).toBe(true);
  expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId)).toBe(false);
});
it("requires the exact accepted bearer bytes even when a different commitment names the same lease ID", async () => {
  const f = fixture(); const lease = JSON.parse(Buffer.from(f.token.split(".")[0]!, "base64url").toString()) as { leaseId: string };
  const accepted = acceptWork({ ledger: f.ledger, intakeSessionId: "intake", request: { prompt: "hello", agentId: "default", providerId: "stub", model: STUB_PROVIDER_MODEL },
    authority: { leaseId: lease.leaseId, tokenSha256: sha256Hex("other bearer bytes") } });
  expect(await f.consume(accepted.receipt)).toMatchObject({ ok: false, state: "refused" });
  expect(f.ledger.getAllEvents().some(row => row.session_id === accepted.workSessionId)).toBe(false);
});
it("checks owner authority before handling even an invalid receipt", async () => {
  const f = fixture(); setMode(f.workspace, "agent");
  await expect(f.consume("forged")).rejects.toThrow("Wire work execution requires owner mode.");
});

it("pins verification and authority snapshot against a concurrent live-payload writer", async () => {
  const f = fixture(); const accepted = f.accept();
  const replacement = issueLeaseForCli({ workspace: f.workspace, agentId: "default", ttl: "60m", scopes: "wire:submit", routes: "/wire", models: "*", rpm: 50, tpm: 10000, maxCostUsdPerDay: null }).token;
  const replacementLease = JSON.parse(Buffer.from(replacement.split(".")[0]!, "base64url").toString()) as { leaseId: string };
  const row = f.ledger.getAllEvents().find(event => event.event_type === "work/accepted")!;
  const body = JSON.parse(row.payload_inline!) as Record<string, unknown>;
  const other = openLedger(f.workspace); other.db.pragma("busy_timeout = 1");
  const describe = acceptanceModule.describeAcceptedWork; let blocked = false; let attempted = false;
  const race = vi.spyOn(acceptanceModule, "describeAcceptedWork").mockImplementation(params => {
    const result = describe(params);
    if (result.ok && !attempted) {
      attempted = true;
      try { other.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run(JSON.stringify({ ...body,
        authority: { leaseId: replacementLease.leaseId, tokenSha256: sha256Hex(replacement) } }), row.id); }
      catch (error) { if ((error as { code?: string }).code !== "SQLITE_BUSY") throw error; blocked = true; }
    }
    return result;
  });
  try {
    expect(await f.consume(accepted.receipt, replacement)).toMatchObject({ ok: false, state: "refused" });
    expect(attempted).toBe(true); expect(blocked).toBe(true);
    expect(f.ledger.getAllEvents().some(event => event.session_id === accepted.workSessionId)).toBe(false);
  } finally { race.mockRestore(); other.close(); }
});

it("classifies receipt-bound wire intake without allowing unwrapped native events", () => {
  expect(admitSessionEnvelope("{}", "work/accepted")).toEqual({ ok: true, envelope: null });
  expect(admitSessionEnvelope("{}", "turn/start").ok).toBe(false);
});

it("keeps the initial acceptance row and integrity verifier in the same locked snapshot", async () => {
  const f = fixture(); const accepted = f.accept();
  const replacement = issueLeaseForCli({ workspace: f.workspace, agentId: "default", ttl: "60m", scopes: "wire:submit", routes: "/wire", models: "*", rpm: 50, tpm: 10000, maxCostUsdPerDay: null }).token;
  const replacementLease = JSON.parse(Buffer.from(replacement.split(".")[0]!, "base64url").toString()) as { leaseId: string };
  const row = f.ledger.getAllEvents().find(event => event.event_type === "work/accepted")!;
  const body = JSON.parse(row.payload_inline!) as Record<string, unknown>;
  const other = openLedger(f.workspace); other.db.pragma("busy_timeout = 1");
  other.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run(JSON.stringify({ ...body,
    authority: { leaseId: replacementLease.leaseId, tokenSha256: sha256Hex(replacement) } }), row.id);
  const verify = ledgerVerificationModule.verifyEvidenceEventIntegrity; let blocked = false; let attempted = false;
  const race = vi.spyOn(ledgerVerificationModule, "verifyEvidenceEventIntegrity").mockImplementation(params => {
    if (params.eventId === row.id && !attempted) {
      attempted = true;
      try { other.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run(row.payload_inline, row.id); }
      catch (error) { if ((error as { code?: string }).code !== "SQLITE_BUSY") throw error; blocked = true; }
    }
    return verify(params);
  });
  try {
    expect(await f.consume(accepted.receipt, replacement)).toMatchObject({ ok: false, state: "not-claimed" });
    expect(attempted).toBe(true); expect(blocked).toBe(true);
    expect(f.ledger.getAllEvents().some(event => event.session_id === accepted.workSessionId)).toBe(false);
  } finally { race.mockRestore(); other.close(); }
});

it.each([{ model: STUB_PROVIDER_MODEL, allowed: true }, { model: "another-model", allowed: false }])(
  "binds an omitted request model to the actual owner route: $model", async ({ model, allowed }) => {
    const f = fixture();
    const scoped = issueLeaseForCli({ workspace: f.workspace, agentId: "default", ttl: "60m", scopes: "wire:submit", routes: "/wire", models: model,
      rpm: 50, tpm: 10000, maxCostUsdPerDay: null }).token;
    const accepted = f.accept(scoped, null);
    const result = await f.consume(accepted.receipt, scoped);
    expect(result.ok, result.reason).toBe(allowed);
    expect(result.state).toBe(allowed ? "completed" : "refused");
  });

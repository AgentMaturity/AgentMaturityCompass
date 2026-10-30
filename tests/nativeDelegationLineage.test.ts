import { mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Command } from "commander";
import { handleCryptoRoute } from "../src/api/cryptoRouter.js";
import { registerEvidenceStoreCommands } from "../src/cli-evidence-store-commands.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { spawnSubagent as spawnNativeSubagent, type SubagentRunner, type SubagentHandle } from "../src/agent/subagentSpawn.js";
import * as delegationWriter from "../src/agent/delegationEvidenceWriter.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { getStoredReceipt, mintChainedReceipt, resetReceiptChainStore, verifyDelegationChain } from "../src/receipts/receiptChain.js";
import { listDags, loadDag, queryDagsByAgent } from "../src/fleet/orchestrationDag.js";
import { mintReceipt } from "../src/receipts/receipt.js";
import { loadKeyProvider } from "../src/keys/purposeProviders.js";
import * as purposeProviders from "../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../src/keys/purposeKeys.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "./helpers/receiptAuthorityFixture.js";
import { publicPem } from "./keys/providerFakes.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "../src/keys/signingKeys.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

const roots: string[] = [], sessions: SessionService[] = [];
const handles = new Set<SubagentHandle>();
async function spawnSubagent(init: Parameters<typeof spawnNativeSubagent>[0]) {
  const result = await spawnNativeSubagent(init);
  if (result.ok && result.handle) handles.add(result.handle);
  return result;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const handle of handles) { try { await handle.close("cancelled", "test cleanup"); } catch { /* Expected adversarial publication refusals. */ } }
  handles.clear();
  for (const session of sessions.splice(0)) session.disposeWithoutClosing();
  cleanupReceiptAuthorityFixtures();
  vi.unstubAllEnvs(); resetReceiptChainStore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(scripts: ReturnType<typeof textStep>[] = [textStep("child finished")], recursive = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-lineage-"))); roots.push(root);
  const workspace = join(root, "workspace");
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "controls"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-lineage-pass"); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, agentId: "root", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "root"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  if (recursive) {
    const config = loadToolsConfig(workspace);
    initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  }
  const parent = new SessionService(workspace); sessions.push(parent); parent.open({ agentId: "root", harnessVersion: "test", compositionDigest: "c", policyDigest: "p" });
  const registry = new AdapterRegistry(); registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter(scripts),
    baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  let runner!: SubagentRunner;
  runner = createDriverRunner({ workspace, makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } }, systemPrompt: "Careful child.", harnessVersion: "test", compositionDigest: "c", policyDigest: "p",
    ...(recursive ? { grantDelegation: { runner: (context: Parameters<SubagentRunner>[0]) => runner(context) } } : {}) });
  return { workspace, parent, runner };
}
function rows(workspace: string) {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try { return db.prepare("SELECT id,event_type,event_hash,session_id,meta_json FROM evidence_events ORDER BY rowid").all() as Array<{ id: string; event_type: string; event_hash: string; session_id: string; meta_json: string }>; }
  finally { db.close(); }
}
const receiptId = (id: string) => `delegation:${id}`;

describe("native delegation has one signed lineage", () => {
  it("verifies a real native child's two-link receipt chain and projects identical ledger edges", async () => {
    const f = fixture();
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner: f.runner, mintSessionId: () => "native-lineage-child" });
    expect(result.ok).toBe(true); f.parent.close({ reason: "completed" });
    const events = rows(f.workspace).filter(row => row.event_type.startsWith("agent_delegation_"));
    expect(events).toHaveLength(2); resetReceiptChainStore();
    const leaf = receiptId(events[1]!.id), chain = verifyDelegationChain(leaf, [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace);
    expect(chain.errors).toEqual([]); expect(chain.valid).toBe(true); expect(chain.chainLength).toBe(2);
    expect(chain.entries.map(entry => entry.agentId)).toEqual(["root", "child"]);
    const dags = listDags(f.workspace).map(id => loadDag(f.workspace, id));
    expect(dags).toHaveLength(1); expect(dags[0]!.nodes.map(node => node.nodeId)).toEqual(events.map(event => receiptId(event.id)));
    expect(dags[0]!.nodes.map(node => node.nodeHash)).toEqual(events.map(event => event.event_hash));
    expect(dags[0]!.nodes.map(node => [node.callerAgentId, node.calleeAgentId])).toEqual([["root", "child"], ["root", "child"]]);
    expect(queryDagsByAgent(f.workspace, "child").map(dag => dag.dagId)).toEqual([dags[0]!.dagId]);
    expect(getStoredReceipt(leaf, f.workspace)!.payload).toMatchObject({ session_id: "native-lineage-child", parent_receipt_id: receiptId(events[0]!.id) });
    let responseBody = "";
    const response = { writeHead: vi.fn(), end: (body: string) => { responseBody = body; } } as unknown as ServerResponse;
    expect(await handleCryptoRoute(`/api/v1/crypto/receipts-chain/${leaf}`, "GET", {} as IncomingMessage, response, f.workspace)).toBe(true);
    expect(JSON.parse(responseBody).data).toMatchObject({ valid: true, chainLength: 2 });
    const printed = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "cwd").mockReturnValue(f.workspace);
    const program = new Command(); registerEvidenceStoreCommands(program);
    await program.parseAsync(["node", "amc", "receipts-chain", leaf]);
    expect(printed.mock.calls.flat().join("\n")).toContain("Valid: true");
  });

  it("keeps an open child open and mints completion only when its handle closes", async () => {
    const f = fixture();
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report", continuable: true },
      session: f.parent, runner: f.runner, mintSessionId: () => "retained-lineage-child" });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const start = rows(f.workspace).find(row => row.event_type === "agent_delegation_started")!;
    expect(getStoredReceipt(receiptId(start.id), f.workspace)).not.toBeNull();
    expect(loadDag(f.workspace, listDags(f.workspace)[0]!).nodes).toHaveLength(1);
    await result.handle!.close("cancelled", "parent released child");
    const end = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed")!;
    expect(verifyDelegationChain(receiptId(end.id), [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(true);
    expect(loadDag(f.workspace, listDags(f.workspace)[0]!).nodes.at(-1)?.outcome).toBe("cancelled");
    f.parent.close({ reason: "completed" });
  });

  it("refuses to project forged ledger lineage", async () => {
    const f = fixture();
    await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner: f.runner, mintSessionId: () => "forged-lineage-child" });
    f.parent.close({ reason: "completed" });
    const end = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed")!;
    expect(verifyDelegationChain(receiptId(end.id), [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(true);
    const db = new Database(join(f.workspace, ".amc", "evidence.sqlite"));
    db.exec("DROP TRIGGER IF EXISTS protect_evidence_immutable; DROP TRIGGER IF EXISTS no_update_evidence");
    db.prepare("UPDATE evidence_events SET meta_json = replace(meta_json, '\"depth\":1', '\"depth\":2') WHERE event_type = 'agent_delegation_started'").run(); db.close();
    expect(verifyDelegationChain(receiptId(end.id), [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(false);
    expect(() => listDags(f.workspace)).toThrow(/lineage.*invalid/i);
  });

  it("does not let a process cache substitute a receipt from another workspace", () => {
    const f = fixture(), other = join(roots[0]!, "other");
    mintChainedReceipt({ kind: "tool_action", ts: Date.now(), agentId: "root", providerId: "native", model: null,
      eventHash: "a".repeat(64), bodySha256: "b".repeat(64), sessionId: f.parent.sessionId, receiptId: "same-id", workspace: f.workspace,
      privateKeyPem: getSigningKey(f.workspace, "receipt") });
    expect(getStoredReceipt("same-id", other)).toBeNull(); f.parent.close({ reason: "completed" });
  });

  it("does not accept a signed ordinary receipt as a delegation-chain root", () => {
    const f = fixture(), minted = mintReceipt({ kind: "tool_action", ts: Date.now(), agentId: "root", providerId: "native", model: null,
      eventHash: "a".repeat(64), bodySha256: "b".repeat(64), sessionId: f.parent.sessionId, receiptId: "ordinary",
      privateKeyPem: getSigningKey(f.workspace, "receipt") });
    const dir = join(f.workspace, ".amc", "receipts", "chain"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ordinary.receipt"), minted.receipt);
    expect(getStoredReceipt("ordinary", f.workspace)).toBeNull();
    expect(verifyDelegationChain("ordinary", [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(false);
    f.parent.close({ reason: "completed" });
  });


  it("requires signed delegation_chain to match the traversed parents", () => {
    const f = fixture(), minted = mintChainedReceipt({ kind: "tool_action", ts: Date.now(), agentId: "root", providerId: "native", model: null,
      eventHash: "a".repeat(64), bodySha256: "b".repeat(64), sessionId: f.parent.sessionId, receiptId: "inconsistent", workspace: f.workspace,
      privateKeyPem: getSigningKey(f.workspace, "receipt") });
    const bytes = Buffer.from(JSON.stringify({ ...minted.payload, delegation_chain: ["invented-parent"] }));
    writeFileSync(join(f.workspace, ".amc", "receipts", "chain", "inconsistent.receipt"),
      `${bytes.toString("base64url")}.${sign(null, bytes, getSigningKey(f.workspace, "receipt")).toString("base64url")}`);
    resetReceiptChainStore();
    expect(verifyDelegationChain("inconsistent", [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(false);
    f.parent.close({ reason: "completed" });
  });


  it("refuses child execution when its announced lineage cannot be signed", async () => {
    const f = fixture(), provider = loadKeyProvider(f.workspace, "file"), realSign = provider.sign.bind(provider);
    vi.spyOn(provider, "sign").mockImplementation((ref, ...args) => ref.id === "receipt" ? Promise.reject(new Error("receipt signing refused")) : realSign(ref, ...args));
    const runner = vi.fn(async () => ({ ok: true, text: "must not run" }));
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner, mintSessionId: () => "unsigned-lineage-child" });
    expect(result.ok).toBe(false); expect(runner).not.toHaveBeenCalled();
    const end = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed");
    expect(end).toBeDefined(); expect(JSON.parse(end!.meta_json).settledAs).toBe("failed");
    f.parent.close({ reason: "completed" });
  });


  it("rechecks committed purpose authority after the real receipt signer returns", async () => {
    const f = fixture(), realSign = purposeProviders.signWithPurposeKey;
    vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementation(async (...args) => {
      const signed = await realSign(...args);
      if (args[1] === "receipt") rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: "native-lineage-pass" });
      return signed;
    });
    const runner = vi.fn(async () => ({ ok: true, text: "must not run" }));
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner, mintSessionId: () => "rotated-lineage-child" });
    expect(result.ok).toBe(false); expect(runner).not.toHaveBeenCalled();
    const start = rows(f.workspace).find(row => row.event_type === "agent_delegation_started")!;
    expect(getStoredReceipt(receiptId(start.id), f.workspace)).toBeNull(); f.parent.close({ reason: "completed" });
  });

  it("rechecks canonical ledger evidence after asynchronous receipt signing", async () => {
    const f = fixture(), realSign = purposeProviders.signWithPurposeKey;
    vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementation(async (...args) => {
      const signed = await realSign(...args);
      if (args[1] === "receipt") {
        const db = new Database(join(f.workspace, ".amc", "evidence.sqlite"));
        db.exec("DROP TRIGGER IF EXISTS protect_evidence_immutable; DROP TRIGGER IF EXISTS no_update_evidence");
    db.prepare("UPDATE evidence_events SET meta_json = replace(meta_json, 'childRunAs', 'forgedRunAs') WHERE event_type = 'agent_delegation_started'").run(); db.close();
      }
      return signed;
    });
    const runner = vi.fn(async () => ({ ok: true, text: "must not run" }));
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner, mintSessionId: () => "mutated-lineage-child" });
    expect(result.ok).toBe(false); expect(runner).not.toHaveBeenCalled();
    const start = rows(f.workspace).find(row => row.event_type === "agent_delegation_started")!;
    expect(getStoredReceipt(receiptId(start.id), f.workspace)).toBeNull(); f.parent.close({ reason: "completed" });
  });


  it("rejects a signed completion without a matching announcement", async () => {
    const f = fixture(), ref = f.parent.recordLoopEvent({ kind: "delegation-completed", childRunAs: "orphan", childSessionId: "orphan-session",
      packetId: "orphan-packet", settledAs: "reported", reason: "no announcement exists" });
    await expect(delegationWriter.mintNativeDelegationReceipt(f.workspace, ref)).rejects.toThrow(/no matching start/);
    expect(() => listDags(f.workspace)).toThrow(/no matching start/); f.parent.close({ reason: "completed" });
  });

  it("rejects signed cyclic session lineage without looping", () => {
    const f = fixture(); f.parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "cycle", childSessionId: f.parent.sessionId,
      governedAs: "root", depth: 1, packetId: "cyclic-packet" });
    expect(() => listDags(f.workspace)).toThrow(/cyclic.*lineage/i); f.parent.close({ reason: "completed" });
  });


  it("exposes receipt purpose keys through the kernel while retaining explicit chain trust", async () => {
    const f = fixture(), { Context } = await import("../src/kernel/amcRuntime.js");
    const { CryptoService, ReceiptsService } = await import("../src/kernel/services/evidenceServices.js");
    const context = new Context(), crypto = new CryptoService(context, { workspace: f.workspace });
    expect(() => crypto.trustedKeys("receipt")).not.toThrow();
    const keys = crypto.trustedKeys("receipt");
    expect(keys).toContain(getSigningPublicKeyPem(f.workspace, "receipt"));
    mintChainedReceipt({ kind: "tool_action", ts: Date.now(), agentId: "root", providerId: "test", model: null,
      eventHash: "a".repeat(64), bodySha256: "b".repeat(64), sessionId: f.parent.sessionId, receiptId: "kernel-receipt", workspace: f.workspace,
      privateKeyPem: getSigningKey(f.workspace, "receipt") });
    const receipts = new ReceiptsService(context, { workspace: f.workspace });
    expect(receipts.verifyChain("kernel-receipt", keys).valid).toBe(true);
    expect(receipts.verifyChain("kernel-receipt", []).valid).toBe(false); f.parent.close({ reason: "completed" });
  });

  it("reports failed completion signing on every close after idle cancellation", async () => {
    const f = fixture(), controller = new AbortController();
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report", continuable: true },
      session: f.parent, runner: f.runner, signal: controller.signal, mintSessionId: () => "idle-lineage-child" });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const provider = loadKeyProvider(f.workspace, "file"), realSign = provider.sign.bind(provider);
    vi.spyOn(provider, "sign").mockImplementation((ref, ...args) => ref.id === "receipt" ? Promise.reject(new Error("completion signing refused")) : realSign(ref, ...args));
    controller.abort();
    await expect(result.handle!.close("cancelled", "already cancelled")).rejects.toThrow();
    await expect(result.handle!.close("cancelled", "again")).rejects.toThrow(); f.parent.close({ reason: "completed" });
  });


  it.each(["identity-mismatch", "duplicate-start", "duplicate-completion"] as const)("rejects signed ambiguous lineage: %s", async defect => {
    const f = fixture();
    const start = { kind: "delegation-started" as const, childRunAs: "child", childSessionId: "semantic-child", governedAs: "root", depth: 1, packetId: "semantic-packet" };
    const startRef = f.parent.recordLoopEvent(start); await delegationWriter.mintNativeDelegationReceipt(f.workspace, startRef);
    const completion = { kind: "delegation-completed" as const, childRunAs: defect === "identity-mismatch" ? "other-child" : "child",
      childSessionId: "semantic-child", packetId: "semantic-packet", settledAs: "reported" as const, reason: "child reported" };
    let ref;
    if (defect === "duplicate-start") ref = f.parent.recordLoopEvent({ ...start, packetId: "second-packet" });
    else {
      ref = f.parent.recordLoopEvent(completion);
      if (defect === "duplicate-completion") ref = f.parent.recordLoopEvent(completion);
    }
    await expect(delegationWriter.mintNativeDelegationReceipt(f.workspace, ref)).rejects.toThrow(/lineage/i);
    expect(() => listDags(f.workspace)).toThrow(/lineage/i); f.parent.close({ reason: "completed" });
  });

  it("binds the native receipt namespace even if a signed replacement claims another provider", async () => {
    const f = fixture();
    await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner: f.runner, mintSessionId: () => "replaced-lineage-child" });
    const events = rows(f.workspace).filter(row => row.event_type.startsWith("agent_delegation_")), rootId = receiptId(events[0]!.id);
    const root = getStoredReceipt(rootId, f.workspace)!, bytes = Buffer.from(JSON.stringify({ ...root.payload, providerId: "manual", agentId: "forged-root" }));
    writeFileSync(join(f.workspace, ".amc", "receipts", "chain", `${encodeURIComponent(rootId)}.receipt`),
      `${bytes.toString("base64url")}.${sign(null, bytes, getSigningKey(f.workspace, "receipt")).toString("base64url")}`);
    expect(verifyDelegationChain(receiptId(events[1]!.id), [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(false);
    f.parent.close({ reason: "completed" });
  });

  it("does not publish a receipt or run a child if its source event disappeared while signing", async () => {
    const f = fixture(), realSign = purposeProviders.signWithPurposeKey; let deletedReceiptId: string | undefined;
    vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementation(async (...args) => {
      const signed = await realSign(...args);
      if (args[1] === "receipt") {
        deletedReceiptId = receiptId(rows(f.workspace).find(row => row.event_type === "agent_delegation_started")!.id);
        const db = new Database(join(f.workspace, ".amc", "evidence.sqlite")); db.exec("DROP TRIGGER IF EXISTS no_delete_evidence");
        db.prepare("DELETE FROM evidence_events WHERE event_type = 'agent_delegation_started'").run(); db.close();
      }
      return signed;
    });
    const runner = Object.assign(vi.fn(async () => ({ ok: true, text: "must not run" })), { hookControl: "none" as const });
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner, mintSessionId: () => "deleted-lineage-child" }).catch(error => ({ ok: false as const, reason: String(error) }));
    expect(deletedReceiptId).toBeDefined(); expect(result.ok).toBe(false); expect(runner).not.toHaveBeenCalled();
    expect(getStoredReceipt(deletedReceiptId!, f.workspace)).toBeNull(); f.parent.disposeWithoutClosing();
  });

  it("verifies a real grandchild through the delegating child's incoming receipt", async () => {
    const f = fixture([toolStep("delegate-grandchild", "delegate", JSON.stringify({ runAs: "grandchild", goal: "report" })),
      textStep("grandchild finished"), textStep("child finished")], true);
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "delegate" },
      session: f.parent, runner: f.runner, mintSessionId: () => "recursive-lineage-child" });
    expect(result.ok).toBe(true); f.parent.close({ reason: "completed" });
    const grandchild = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed" && JSON.parse(row.meta_json).childRunAs === "grandchild")!;
    expect(grandchild).toBeDefined();
    const chain = verifyDelegationChain(receiptId(grandchild.id), [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace);
    expect(chain.errors).toEqual([]); expect(chain.chainLength).toBe(3); expect(chain.entries.map(entry => entry.agentId)).toEqual(["root", "child", "grandchild"]);
    const dag = loadDag(f.workspace, listDags(f.workspace)[0]!); expect(dag.nodes).toHaveLength(4);
    expect(dag.nodes.filter(node => node.callerAgentId === "child").map(node => node.calleeAgentId)).toEqual(["grandchild", "grandchild"]);
  });


  it.each(["missing", "corrupt", "changed-while-signing"] as const)("refuses descendant execution with a %s incoming receipt", async defect => {
    const f = fixture(), descendant = vi.fn(async () => ({ ok: true, text: "must not run" }));
    let descendantResult: Awaited<ReturnType<typeof spawnSubagent>> | undefined;
    let descendantReceiptCalls = () => 0;
    await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "delegate" }, session: f.parent,
      mintSessionId: () => "parent-receipt-child", runner: async context => {
        const incoming = rows(f.workspace).find(row => row.event_type === "agent_delegation_started")!;
        const file = join(f.workspace, ".amc", "receipts", "chain", `${encodeURIComponent(receiptId(incoming.id))}.receipt`);
        if (defect === "changed-while-signing") {
          const realSign = purposeProviders.signWithPurposeKey;
          vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementation(async (...args) => {
            const signed = await realSign(...args);
            if (args[1] === "receipt") unlinkSync(file);
            return signed;
          });
        } else if (defect === "missing") unlinkSync(file); else writeFileSync(file, "corrupt receipt");
        const descendantSigner = vi.spyOn(loadKeyProvider(f.workspace, "file"), "sign");
        descendantReceiptCalls = () => descendantSigner.mock.calls.filter(([ref]) => ref.id === "receipt").length;
        const child = new SessionService(f.workspace); sessions.push(child); child.open({ sessionId: context.childSessionId, agentId: "root", harnessVersion: "test", compositionDigest: "c", policyDigest: "p" });
        descendantResult = await spawnSubagent({ workspace: f.workspace, parent: context.identity, request: { runAs: "grandchild", goal: "report" },
          session: child, runner: descendant, mintSessionId: () => "parent-receipt-grandchild" });
        child.close({ reason: "completed" }); return { ok: true, text: "child returned" };
      } });
    expect(descendantResult?.ok).toBe(false); expect(descendant).not.toHaveBeenCalled();
    if (defect !== "changed-while-signing") expect(descendantReceiptCalls()).toBe(0);
    f.parent.close({ reason: "completed" });
  });


  it("refuses a corrupt backend marker instead of hiding native lineage", async () => {
    const f = fixture();
    await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner: f.runner, mintSessionId: () => "marker-lineage-child" });
    f.parent.close({ reason: "completed" });
    const end = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed")!;
    writeFileSync(join(f.workspace, ".amc", "session-store.json"), "{ malformed marker");
    expect(() => listDags(f.workspace)).toThrow(/marker/i);
    expect(verifyDelegationChain(receiptId(end.id), [getSigningPublicKeyPem(f.workspace, "receipt")], f.workspace).valid).toBe(false);
  });

  it("awaits an active child settlement and its receipt when explicitly closed", async () => {
    const f = fixture(); let finish!: (value: { ok: boolean; text: string; reason?: string }) => void;
    const continued = new Promise<{ ok: boolean; text: string; reason?: string }>(resolve => { finish = resolve; });
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report", continuable: true },
      session: f.parent, runner: async () => ({ ok: true, text: "ready", continuation: { continue: () => continued, close: () => {} } }),
      mintSessionId: () => "active-close-child" });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const running = result.handle!.continue("more"), closing = result.handle!.close("cancelled", "parent released active child");
    let closed = false; void Promise.resolve(closing).then(() => { closed = true; });
    try {
      for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
      expect(closed).toBe(false);
    } finally {
      finish({ ok: false, text: "", reason: "stopped" }); await running; await closing;
    }
    const end = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed")!;
    expect(getStoredReceipt(receiptId(end.id), f.workspace)).not.toBeNull(); f.parent.close({ reason: "completed" });
  });


  it("returns a refusal when a settled child's completion receipt cannot be signed", async () => {
    const f = fixture(), provider = loadKeyProvider(f.workspace, "file"), realSign = provider.sign.bind(provider); let receipts = 0;
    vi.spyOn(provider, "sign").mockImplementation((ref, ...args) => ref.id === "receipt" && ++receipts === 2
      ? Promise.reject(new Error("completion signing refused")) : realSign(ref, ...args));
    const result = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("root"), request: { runAs: "child", goal: "report" },
      session: f.parent, runner: f.runner, mintSessionId: () => "failed-completion-child" });
    expect(receipts).toBe(2); expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("lineage signing failed"); f.parent.close({ reason: "completed" });
  });


  it("does not verify an empty leaf receipt ID", () => {
    const result = verifyDelegationChain("", []);
    expect(result.valid).toBe(false); expect(result.errors).not.toEqual([]); expect(result.chainLength).toBe(0);
  });

  it("does not treat an empty parent receipt ID as a null root", () => {
    const f = fixture(); mintChainedReceipt({ kind: "tool_action", ts: Date.now(), agentId: "root", providerId: "test", model: null,
      eventHash: "a".repeat(64), bodySha256: "b".repeat(64), sessionId: f.parent.sessionId, receiptId: "empty-parent", parentReceiptId: "", workspace: f.workspace,
      privateKeyPem: getSigningKey(f.workspace, "receipt") });
    const keys = [getSigningPublicKeyPem(f.workspace, "receipt")];
    expect(verifyDelegationChain("empty-parent", keys, f.workspace).valid).toBe(false);
    expect(verifyDelegationChain("empty-parent", keys).valid).toBe(false); f.parent.close({ reason: "completed" });
  });


  it("verifies a real native child through distinct managed receipt-purpose API and CLI readers", async () => {
    const f = makeReceiptAuthorityFixture();
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(f.root, "controls"));
    await f.own(); // Actual internal owner admission; ordinary file rotations retain broad monitor membership.
    const receiptKeys = getPurposeKeyHistory(f.workspace, "receipt"), monitorKeys = getPublicKeyHistory(f.workspace, "monitor");
    expect(receiptKeys).toContain(publicPem(f.a)); expect(monitorKeys).not.toContain(publicPem(f.a));
    const realSign = purposeProviders.signWithPurposeKey;
    vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementation((workspace, purpose, bytes, options) =>
      realSign(workspace, purpose, bytes, workspace === f.workspace && purpose === "receipt" ? { ...options, provider: f.provider } : options));
    initBudgets(f.workspace, "default"); writeRuntimeFirewallPolicy({ workspace: f.workspace, mode: "observe" });
    const parent = new SessionService(f.workspace); sessions.push(parent);
    parent.open({ agentId: "default", harnessVersion: "test", compositionDigest: "c", policyDigest: "p" });
    const registry = new AdapterRegistry(); registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("managed child finished")]),
      baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    const runner = createDriverRunner({ workspace: f.workspace,
      makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } }, systemPrompt: "Careful managed child.",
      harnessVersion: "test", compositionDigest: "c", policyDigest: "p" });
    const outcome = await spawnSubagent({ workspace: f.workspace, parent: rootIdentity("default"), request: { runAs: "child", goal: "report" },
      session: parent, runner, mintSessionId: () => "managed-receipt-child" });
    expect(outcome.ok).toBe(true); parent.close({ reason: "completed" });
    const end = rows(f.workspace).find(row => row.event_type === "agent_delegation_completed")!, leaf = receiptId(end.id);
    expect(verifyDelegationChain(leaf, receiptKeys, f.workspace)).toMatchObject({ valid: true, chainLength: 2 });
    expect(verifyDelegationChain(leaf, monitorKeys, f.workspace).valid).toBe(false);
    let responseBody = "";
    const response = { writeHead: vi.fn(), end: (body: string) => { responseBody = body; } } as unknown as ServerResponse;
    expect(await handleCryptoRoute(`/api/v1/crypto/receipts-chain/${leaf}`, "GET", {} as IncomingMessage, response, f.workspace)).toBe(true);
    expect(JSON.parse(responseBody).data).toMatchObject({ valid: true, chainLength: 2 });
    const printed = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "cwd").mockReturnValue(f.workspace);
    const program = new Command(); registerEvidenceStoreCommands(program);
    await program.parseAsync(["node", "amc", "receipts-chain", leaf]);
    expect(printed.mock.calls.flat().join("\n")).toContain("Valid: true");
  });

});

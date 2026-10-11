import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { agentToolset } from "../../../src/agent/agentToolset.js";
import { initBudgets } from "../../../src/budgets/budgets.js";
import { openLedger } from "../../../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../../../src/ledger/ledgerVerification.js";
import { DeletionDenied, assertDeletionAllowed } from "../../../src/residency/deletionGate.js";
import { issueScopedLegalHold, legalHoldRegistryRoot } from "../../../src/residency/legalHoldRegistry.js";
import { writeRuntimeFirewallPolicy } from "../../../src/runtime/firewall.js";
import { SessionService } from "../../../src/session/sessionService.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { fixturesFor } from "./harness.js";
import { newWorkspace } from "./workspaces.js";

/**
 * L0-LOG-01, L0-LOG-02 and L0-LOG-03 against the real ledger, native toolset and deletion gate (P1-14). The oracle is
 * the hash-chained rows and the verifier's result, and the gate's verdict and audit row; never the agent's reply.
 */
type TraceSetup = { tool: string; args: Record<string, unknown>; audit: string };
type TamperSetup = { events: number; tamper: "none" | "rewrite" | "delete" | "reorder" };
type GateSetup = { executor: string; target: "logs"; holds: "none" | "active" | "corrupt" };

function rows(ws: string): Array<{ session_id: string; meta: Record<string, unknown> }> {
  const db = new Database(join(ws, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT session_id, meta_json FROM evidence_events ORDER BY rowid").all() as Array<{ session_id: string; meta_json: string }>)
      .map((row) => ({ session_id: row.session_id, meta: JSON.parse(row.meta_json) as Record<string, unknown> }));
  } finally {
    db.close();
  }
}

describe("L0-LOG-01 step-level traces (native toolset into the hash-chained ledger)", () => {
  const fixtures = fixturesFor("ledger_trace", "L0-LOG-01");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result}`, async () => {
      const s = f.envelope.setup as unknown as TraceSetup;
      const ws = newWorkspace();
      initBudgets(ws, "default");
      writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
      mkdirSync(join(ws, "workspace", "output"), { recursive: true });
      writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
      // The session's own writer records the call, as the native runtime composes it: the rows carry its envelope.
      const sessionId = `layer0-${f.envelope.evidenceClass}-session`;
      const session = new SessionService(ws);
      session.open({ sessionId, agentId: "default", harnessVersion: "1", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
      session.startTurn({ trigger: "user" });
      session.startStep();
      const toolset = agentToolset({ workspace: ws, agentId: "default", sessionId, recorder: session });
      try {
        await toolset.seam.execute({ callId: "layer0-call-1", toolName: s.tool, rawArguments: JSON.stringify(s.args), sessionId, turn: 1, step: 1,
          parentToken: null, dispatch: "native", signal: new AbortController().signal });
      } finally {
        toolset.close();
      }
      session.endStep({ stopReason: "end_turn", usage: null });
      session.endTurn({ reason: "complete" });
      session.sealTurn();
      session.close({ reason: "done" });
      const row = rows(ws).find((r) => r.meta.auditType === s.audit);
      expect(row, `a ${s.audit} row is in the ledger`).toBeTruthy();
      expect(row?.session_id).toBe(sessionId);
      expect(row?.meta.agentId).toBe("default");
      expect(row?.meta.toolName).toBe(s.tool);
      const verified = verifyLedgerIntegrity(ws);
      expect(verified.chain.ok, verified.chain.errors.join("; ")).toBe(true);
      expect(f.envelope.expected.result).toBe("pass");
    });
  }
});

/** Rewrites, deletes or reorders rows under the immutability triggers, as an attacker with raw database access would. */
function tamper(ws: string, how: TamperSetup["tamper"]): void {
  if (how === "none") return;
  const db = new Database(join(ws, ".amc", "evidence.sqlite"));
  try {
    for (const t of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${t}`);
    const ids = (db.prepare("SELECT rowid AS r FROM evidence_events WHERE session_id = 'layer0-ledger' ORDER BY rowid").all() as Array<{ r: number }>).map((x) => x.r);
    const [, second, third] = ids;
    // A careful attacker rewrites the payload and its digest together, so only the chain can catch it.
    if (how === "rewrite") db.prepare("UPDATE evidence_events SET payload_inline = 'rewritten', payload_sha256 = ? WHERE rowid = ?").run(sha256Hex("rewritten"), second);
    if (how === "delete") db.prepare("DELETE FROM evidence_events WHERE rowid = ?").run(second);
    if (how === "reorder") {
      // `moved` keeps the original order as its own rowids 1 and 2; inserting 2 before 1 swaps the two events.
      db.exec(`CREATE TEMP TABLE moved AS SELECT * FROM evidence_events WHERE rowid IN (${second}, ${third}) ORDER BY rowid`);
      db.exec(`DELETE FROM evidence_events WHERE rowid IN (${second}, ${third})`);
      db.exec("INSERT INTO evidence_events SELECT * FROM moved WHERE rowid = 2");
      db.exec("INSERT INTO evidence_events SELECT * FROM moved WHERE rowid = 1");
    }
  } finally {
    db.close();
  }
}

describe("L0-LOG-02 tamper evidence (verifyLedgerIntegrity)", () => {
  const fixtures = fixturesFor("ledger_tamper", "L0-LOG-02");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const s = f.envelope.setup as unknown as TamperSetup;
      const ws = newWorkspace();
      const ledger = openLedger(ws);
      ledger.startSession({ sessionId: "layer0-ledger", runtime: "unknown", binaryPath: "layer0-fixture", binarySha256: "00".repeat(32) });
      for (let i = 0; i < s.events; i += 1) {
        ledger.appendEvidence({ sessionId: "layer0-ledger", runtime: "unknown", eventType: "stdout", payload: `event ${i}`, inline: true, meta: { step: i } });
      }
      ledger.sealSession("layer0-ledger");
      ledger.close();
      tamper(ws, s.tamper);
      const verified = verifyLedgerIntegrity(ws);
      const errors = verified.chain.errors.join("\n");
      const code = /event_hash mismatch/.test(errors) ? "event_hash_mismatch" : /previous hash mismatch/.test(errors) ? "previous_hash_mismatch" : null;
      expect(verified.ok ? "pass" : "fail", errors).toBe(f.envelope.expected.result);
      expect(code, `${errors}\n${verified.errors.join("\n")}`).toBe(f.envelope.expected.reasonCode);
    });
  }
});

describe("L0-LOG-03 deletion under a hold is refused (deletion gate)", () => {
  const fixtures = fixturesFor("deletion_gate", "L0-LOG-03");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const s = f.envelope.setup as unknown as GateSetup;
      const ws = newWorkspace();
      if (s.holds !== "none") {
        issueScopedLegalHold({ workspace: ws, scope: { tenantId: "tenant-a", workspaceIds: [], sessionIds: [], dataKinds: [] },
          reason: "layer0 fixture hold", issuedBy: "owner" });
      }
      if (s.holds === "corrupt") {
        const root = legalHoldRegistryRoot(ws);
        const record = readdirSync(root).find((name) => name.startsWith("lh_") && name.endsWith(".json"));
        if (!record) throw new Error("no hold record was written");
        writeFileSync(join(root, record), "{\"tampered\":true}\n");
      }
      let verdict: { result: "allow" | "deny"; code: string | null };
      try {
        assertDeletionAllowed({ workspace: ws, executor: s.executor, target: { kind: s.target } });
        verdict = { result: "allow", code: null };
      } catch (error) {
        if (!(error instanceof DeletionDenied)) throw error;
        expect(error.auditPersisted, "the refusal is recorded").toBe(true);
        verdict = { result: "deny", code: error.verdict.verdict === "held" ? "held" : error.verdict.reason };
      }
      expect(verdict.result).toBe(f.envelope.expected.result);
      expect(verdict.code).toBe(f.envelope.expected.reasonCode);
    });
  }
});

/**
 * pending-checks P1-61 (lane S): a ledger row whose signed meta names no agent (a native session's user/message frame)
 * is evidence about the agent its session's signed `session/open` row names. The router's evidence route, the store
 * (under the project lock) and the offline record's scope check accept it for the project's agent and refuse it for
 * another agent's session, all three through `ledgerRowAgent` (src/a4/a4Evidence.ts).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { verifyA4Bundle } from "../../src/a4/a4Verify.js";
import { copyA4Slice, type A4BundleSlice } from "../../src/bundles/bundleA4.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AGENT, cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  cleanupGovernanceFixtures();
});
const temp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** A session opened for `agentId` (its signed session/open row names it) and one frame row whose meta names no agent. */
function frameRow(workspace: string, sessionId: string, agentId: string, open = true): { id: string; sha256: string } {
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc", binarySha256: sha256Hex("amc") });
    if (open) ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "session/open", payload: "{}", inline: true, meta: { agentId, trustTier: "SELF_REPORTED" } });
    const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "user/message", payload: "hello", inline: true, meta: { trustTier: "SELF_REPORTED" } });
    return { id, sha256: ledger.getEventById(id)!.event_hash };
  } finally {
    ledger.close();
  }
}

function pinnedTrust(workspace: string) {
  const dir = temp("amc-a4a-trust-");
  const auditor = join(dir, "auditor.pub");
  writeFileSync(auditor, getPublicKeyPem(workspace, "auditor"));
  return loadTrustContext({ amcHome: dir, pubkey: { path: auditor, purposes: ["artifact-seal"] }, expectMonitor: sha256Hex(getPublicKeyPem(workspace, "monitor")), env: {} });
}

describe("an evidence ref to a frame row with no agent in its meta", () => {
  test("is accepted from the project's agent's session and the exported record's scope passes", async () => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice, "frame ref", AGENT);
    const row = frameRow(workspace, "native-own-session", AGENT);
    const reply = await p.post(alice, "/evidence", { refKind: "ledger_event", refId: row.id, sha256: row.sha256, label: "probe frame" });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const root = temp("amc-a4a-bundle-");
    copyA4Slice({ workspace, root, agentId: AGENT, slice: null });
    const index = JSON.parse(readFileSync(join(root, "a4", "index.json"), "utf8")) as A4BundleSlice;
    const report = await verifyA4Bundle(join(root, "a4", `${index.projects[0]!.projectId}.json`), pinnedTrust(workspace));
    expect(report.integrity.status).toBe("pass");
    expect(report.scope, JSON.stringify(report.scope)).toMatchObject({ status: "pass" });
  });

  test.each([["another agent's session", "other-agent", true], ["a session with no session/open row", AGENT, false]])("from %s is refused", async (_name, agentId, open) => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice, "frame ref", AGENT);
    const row = frameRow(workspace, "native-foreign-session", agentId, open);
    const reply = await p.post(alice, "/evidence", { refKind: "ledger_event", refId: row.id, sha256: row.sha256, label: "foreign frame" });
    expect(refusal(reply)).toEqual([409, "EVIDENCE_REF_FOREIGN_AGENT"]);
  });

  test("from a session whose open row was rewritten to name the project's agent is refused (the open row must verify)", async () => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice, "frame ref", AGENT);
    const row = frameRow(workspace, "native-rewritten-session", "other-agent");
    const ledger = openLedger(workspace);
    try {
      for (const { name } of ledger.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evidence_events'").all() as Array<{ name: string }>) {
        ledger.db.exec(`DROP TRIGGER "${name}"`);
      }
      expect(ledger.db.prepare("UPDATE evidence_events SET meta_json = replace(meta_json, 'other-agent', ?) WHERE session_id = ? AND event_type = 'session/open'")
        .run(AGENT, "native-rewritten-session").changes).toBe(1);
    } finally {
      ledger.close();
    }
    const reply = await p.post(alice, "/evidence", { refKind: "ledger_event", refId: row.id, sha256: row.sha256, label: "rewritten frame" });
    expect(refusal(reply)).toEqual([409, "EVIDENCE_REF_FOREIGN_AGENT"]);
  });
});

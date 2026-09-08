import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";
import {
  readSessionRootDescriptor,
  SessionAnchorError
} from "../src/transparency/sessionRootDescriptor.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * A session that used its tools must still be anchorable.
 *
 * Pointing tool evidence at the right session id (f537e29e) fixed
 * "references missing session" and introduced a quieter defect in its place:
 * written through the raw ledger the rows carry no session envelope, and
 * `sessionRootDescriptor` refuses to anchor a session containing one, because
 * the root would then cover less than the session does. That refusal is right.
 * The rows had to move into the spine, not the refusal be relaxed.
 *
 * With the session's own writer the root covers every row. The owned write API
 * now refuses a bypass before storage; a persisted tamper fixture separately
 * proves that anchoring still rejects a row with no envelope. Only the first half
 * would pass just as well on a build where anchoring never refused anything.
 */

const dirs: string[] = [];
const open: { close(): void }[] = [];

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = "anchorable-tools-passphrase";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-anchor-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  mkdirSync(join(dir, "workspace"), { recursive: true });
  writeFileSync(join(dir, "workspace", "n.txt"), "hello");
  return dir;
}

const call = (sessionId: string) => ({
  callId: "c-fs-read",
  toolName: "fs.read",
  rawArguments: JSON.stringify({ path: "workspace/n.txt" }),
  sessionId,
  turn: 1,
  step: 1,
  parentToken: null,
  dispatch: "native" as const,
  signal: new AbortController().signal
});

/** Run one governed tool call through the owning session writer. */
async function sessionThatCalledATool(dir: string): Promise<string> {
  const session = new SessionService(dir);
  session.open({
    agentId: "default", harnessVersion: "3.2.0",
    compositionDigest: "composition-digest", policyDigest: "policy-digest"
  });
  session.recordSystemPrompt("You are careful.");
  session.startTurn({ trigger: "user" });

  const toolset = agentToolset({
    workspace: dir,
    agentId: "default",
    sessionId: session.sessionId,
    recorder: session
  });
  open.push(toolset);
  await toolset.seam.execute(call(session.sessionId));
  toolset.close();

  session.endTurn({ reason: "complete" });
  session.close({ reason: "completed" });
  return session.sessionId;
}

afterEach(() => {
  for (const handle of open.splice(0)) {
    try { handle.close(); } catch { /* already closed */ }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("a session that called a tool", () => {
  it("anchors when its tool evidence went through the session writer", async () => {
    const dir = workspace();
    const sessionId = await sessionThatCalledATool(dir);

    // Throws rather than returning errors, so the assertion is that it does not.
    const root = readSessionRootDescriptor(dir, sessionId);
    // Non-vacuity: the tool evidence is IN the root, not merely absent from the
    // complaint. A root that covered only spine rows would also report no error.
    const ledger = openLedger(dir);
    let rows: { n: number };
    try {
      rows = ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE session_id = ?").get(sessionId) as { n: number };
    } finally { ledger.close(); }
    expect(root.eventCount).toBe(rows.n);
    expect(rows.n).toBeGreaterThan(5);
  });

  it("refuses to anchor persisted tool evidence without a session envelope", async () => {
    const dir = workspace();
    const sessionId = await sessionThatCalledATool(dir);
    // Deliberately bypass the write API to model tampered persisted bytes.
    // The API itself now rejects an unfenced append before it reaches storage.
    const ledger = openLedger(dir);
    try {
      const audit = ledger.db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'audit' LIMIT 1").get(sessionId) as { id: string; meta_json: string } | undefined;
      expect(audit, "a governed tool audit must exist before tampering").toBeDefined();
      const metadata = JSON.parse(audit!.meta_json) as Record<string, unknown>;
      expect(metadata[SESSION_ENVELOPE_META_KEY]).toBeDefined();
      delete metadata[SESSION_ENVELOPE_META_KEY];
      // This disposable fixture models direct file tampering, beyond SQLite's
      // ordinary immutable-row guard. Production admission remains enabled.
      ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
      ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(metadata), audit!.id);
    } finally { ledger.close(); }

    const failure = ((): SessionAnchorError | null => {
      try {
        readSessionRootDescriptor(dir, sessionId);
        return null;
      } catch (error) {
        return error instanceof SessionAnchorError ? error : null;
      }
    })();
    expect(failure, "anchoring should have refused").not.toBeNull();
    expect(failure!.errors.some((error) => error.includes("carries no session envelope"))).toBe(true);
  });
});

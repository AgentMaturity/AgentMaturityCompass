import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
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
 * The pair below is the point: with the session's own writer the root covers
 * every row, and without it the anchor refuses. A test for only the first half
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

/** Run one governed tool call in a session, with or without the writer. */
async function sessionThatCalledATool(dir: string, handOverWriter: boolean): Promise<string> {
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
    ...(handOverWriter ? { recorder: session } : {})
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
    const sessionId = await sessionThatCalledATool(dir, true);

    // Throws rather than returning errors, so the assertion is that it does not.
    const root = readSessionRootDescriptor(dir, sessionId);
    // Non-vacuity: the tool evidence is IN the root, not merely absent from the
    // complaint. A root that covered only spine rows would also report no error.
    const rows = openLedger(dir).db
      .prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE session_id = ?")
      .get(sessionId) as { n: number };
    expect(root.eventCount).toBe(rows.n);
    expect(rows.n).toBeGreaterThan(5);
  });

  it("refuses to anchor when the evidence bypassed the writer", async () => {
    const dir = workspace();
    // The shipped behaviour, kept as a test so the refusal stays visible: a
    // future change that stopped handing over the writer would otherwise look
    // fine, and the loss would be a capability nobody notices going missing.
    const sessionId = await sessionThatCalledATool(dir, false);

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

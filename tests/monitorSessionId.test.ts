import { mkdtempSync, rmSync, realpathSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { spawnGovernedChild } from "../src/ledger/monitor.js";

/**
 * A monitored child must be able to run under a session id its caller already
 * announced.
 *
 * `spawnMonitoredProcess` minted its own `randomUUID()`, which is fine for
 * `amc wrap` — nobody promised that id to anyone beforehand. It is not fine for
 * a delegated child: `spawnSubagent` announces `childSessionId` in the PARENT's
 * signed log BEFORE the child runs, precisely so an unmatched `delegation-started`
 * means "a delegation nobody closed". If the child then writes under a different
 * id, the parent's row points at a session that does not exist and the whole
 * announce-before-run guarantee is decorative.
 */
const PASS = "monitor-session-id-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-monitor-sid-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  return dir;
}

/** A stand-in foreign CLI. */
function fakeCli(dir: string, body: string): string {
  const script = join(dir, "fake-agent");
  writeFileSync(script, `#!/bin/sh\n${body}\n`, "utf8");
  chmodSync(script, 0o755);
  return script;
}

function rowsFor(dir: string, sessionId: string): Array<{ event_type: string; payload_inline: string | null; meta_json: string }> {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return db
      .prepare("SELECT event_type, payload_inline, meta_json FROM evidence_events WHERE session_id = ?")
      .all(sessionId) as Array<{ event_type: string; payload_inline: string | null; meta_json: string }>;
  } finally {
    db.close();
  }
}

describe("a governed child runs under the session it was announced with", () => {
  it("writes its rows under the caller's session id", async () => {
    const dir = workspace();
    const script = fakeCli(dir, 'echo "the delegate answer"');

    const result = await spawnGovernedChild({
      workspace: dir,
      sessionId: "child-announced-1",
      agentId: "payments-agent",
      command: script,
      args: []
    });

    expect(result.sessionId, "the caller's id, not a fresh one").toBe("child-announced-1");
    const rows = rowsFor(dir, "child-announced-1");
    expect(rows.length, "the child really wrote rows there").toBeGreaterThan(0);
    expect(rows.some((r) => r.event_type === "stdout")).toBe(true);
  });

  it("reports the real exit code rather than assuming success", async () => {
    // `runAdapterCommand`'s SANDBOX branch returns a hardcoded `exitCode: 0`,
    // which is how a crashed foreign agent reports success. The truth was always
    // in the ledger as `runtime_exit_code`; this hands it back to the caller.
    const dir = workspace();
    const script = fakeCli(dir, 'echo "partial"; exit 3');

    const result = await spawnGovernedChild({
      workspace: dir,
      sessionId: "child-failed",
      agentId: "payments-agent",
      command: script,
      args: []
    });

    expect(result.exitCode, "a failing child says so").toBe(3);
  });

  it("still succeeds for a child that exits cleanly", async () => {
    const dir = workspace();
    const script = fakeCli(dir, 'echo "ok"');
    const result = await spawnGovernedChild({
      workspace: dir,
      sessionId: "child-ok",
      agentId: "payments-agent",
      command: script,
      args: []
    });
    expect(result.exitCode).toBe(0);
  });

  it("hands the child no provider key from AMC's own environment", async () => {
    // Same fence as the version probe: a foreign binary gets the credentials
    // AMC chose to give it, never whatever happened to be in the environment.
    const dir = workspace();
    const seen = join(dir, "seen-env.txt");
    const script = fakeCli(dir, `env > ${JSON.stringify(seen)}; echo done`);
    const prior = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-must-not-escape";
    try {
      await spawnGovernedChild({
        workspace: dir,
        sessionId: "child-fenced",
        agentId: "payments-agent",
        command: script,
        args: []
      });
      const env = readFileSync(seen, "utf8");
      expect(env).not.toContain("sk-ant-must-not-escape");
    } finally {
      if (prior === undefined) delete process.env["ANTHROPIC_API_KEY"];
      else process.env["ANTHROPIC_API_KEY"] = prior;
    }
  });
});

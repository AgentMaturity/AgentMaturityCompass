import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { jsonlEventsPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";

/**
 * `amc verify` must not report success on evidence it cannot see.
 *
 * The JSONL backend keeps session events in .amc/sessions/*.jsonl, while
 * verifyLedgerIntegrity — the function behind `amc verify`, the audit packet,
 * the assurance runner and the certificate issuer — reads the evidence_events
 * table. On a JSONL workspace that table is empty, so the verifier found
 * nothing wrong and returned chain.ok = true. Demonstrated on a workspace whose
 * evidence had been openly rewritten: PASSED, zero errors.
 *
 * That is the worst failure this product can have — a green verdict over
 * tampered evidence — so it is pinned here in both directions.
 */
const PASS = "jsonl-workspace-verification-pass";

function withJsonlWorkspace<T>(fn: (workspace: string) => T): T {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-jsonl-verify-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const store = openSessionEventStore(workspace, "jsonl");
  store.startSession({ sessionId: "s", runtime: "amc", binaryPath: "b", binarySha256: "0".repeat(64) });
  store.appendSessionEvent({
    sessionId: "s",
    runtime: "amc",
    eventType: "user/message",
    meta: {},
    payload: "the agent deleted production"
  });
  store.sealSession("s");
  store.close();
  try {
    return fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

function tamperFirstEvent(workspace: string): void {
  const path = jsonlEventsPath(workspace);
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  const row = JSON.parse(lines[0]!) as { payload_inline: string };
  row.payload_inline = "the agent behaved impeccably";
  lines[0] = JSON.stringify(row);
  writeFileSync(path, lines.join("\n") + "\n");
}

describe("a JSONL-backed workspace is actually verified", () => {
  it("passes when the JSONL evidence is honest", async () => {
    await withJsonlWorkspace(async (workspace) => {
      const result = await verifyLedgerIntegrity(workspace);
      expect(result.chain.ok, result.chain.errors.join("; ")).toBe(true);
    });
  });

  it("FAILS when the JSONL evidence has been rewritten", async () => {
    await withJsonlWorkspace(async (workspace) => {
      tamperFirstEvent(workspace);
      const result = await verifyLedgerIntegrity(workspace);
      // Before this was wired, the verifier read an empty evidence_events table
      // and called that a pass. A verifier that cannot see the evidence must
      // never call it verified.
      expect(result.chain.ok, "tampered JSONL evidence must not verify").toBe(false);
      expect(result.chain.errors.join(" ")).toMatch(/payload hash mismatch|event_hash mismatch/);
    });
  });

  it("does not disturb a normal SQLite workspace", async () => {
    const prior = process.env["AMC_VAULT_PASSPHRASE"];
    process.env["AMC_VAULT_PASSPHRASE"] = PASS;
    const workspace = mkdtempSync(join(tmpdir(), "amc-sqlite-verify-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    try {
      const result = await verifyLedgerIntegrity(workspace);
      expect(result.chain.ok, result.chain.errors.join("; ")).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
      else process.env["AMC_VAULT_PASSPHRASE"] = prior;
    }
  });
});

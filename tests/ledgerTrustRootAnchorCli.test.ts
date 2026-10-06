import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { canonicalMetadataForHash, openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * The forgery from tests/ledgerTrustRootAnchor.test.ts, run through `amc verify` (P0-09 step 9). The library test
 * stays: it documents that the library alone cannot see a swapped monitor key. The command must not print a pass
 * over it: an unanchored ledger fails unless --allow-unanchored asks for an integrity-only result (exit 2).
 */
const CLI = resolve("dist/cli.js");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function buildWorkspace(): { workspace: string; fingerprint: string } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-trustroot-cli-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "s", runtime: "unknown", binaryPath: "/usr/bin/true", binarySha256: "0".repeat(64) });
  ledger.appendEvidence({ sessionId: "s", runtime: "unknown", eventType: "stdout", payload: "the agent deleted the production database", inline: true });
  ledger.sealSession("s");
  ledger.close();
  // Recorded at creation, as an operator's records would be.
  const fingerprint = sha256Hex(Buffer.from(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"), "utf8"), "utf8"));
  return { workspace, fingerprint };
}

/** Rewrites every event, re-chains and re-signs with `privateKey`, re-seals, then swaps the monitor key. */
function forge(workspace: string): void {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
  for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence", "protect_sessions_sealed_immutable"]) {
    db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  const rows = db.prepare("SELECT rowid AS rid, * FROM evidence_events ORDER BY rowid ASC").all() as Array<
    Pick<EvidenceEvent, "id" | "ts" | "session_id" | "runtime" | "event_type" | "meta_json"> & { rid: number }>;
  const update = db.prepare(`UPDATE evidence_events SET payload_inline=?, canonical_payload_inline=?, payload_sha256=?,
    prev_event_hash=?, event_hash=?, writer_sig=? WHERE rowid=?`);
  const signHash = (hash: string, key: KeyObject) => sign(null, Buffer.from(hash, "hex"), key).toString("base64");
  let prev = "GENESIS";
  for (const row of rows) {
    const forged = "the agent behaved impeccably";
    const payloadSha = sha256Hex(forged);
    const canonical = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
      eventType: row.event_type, payloadPath: null, payloadInline: forged, metaJson: row.meta_json });
    const eventHash = sha256Hex(`${prev}${canonical}${payloadSha}`);
    update.run(forged, forged, payloadSha, prev, eventHash, signHash(eventHash, privateKey), row.rid);
    prev = eventHash;
  }
  for (const s of db.prepare("SELECT session_id FROM sessions").all() as Array<{ session_id: string }>) {
    const last = db.prepare("SELECT event_hash FROM evidence_events WHERE session_id=? ORDER BY rowid DESC LIMIT 1").get(s.session_id) as
      { event_hash: string } | undefined;
    const finalHash = last?.event_hash ?? sha256Hex("EMPTY_SESSION");
    db.prepare("UPDATE sessions SET session_final_event_hash=?, session_seal_sig=? WHERE session_id=?").run(finalHash, signHash(finalHash, privateKey), s.session_id);
  }
  db.close();
  writeFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"), publicKey.export({ format: "pem", type: "spki" }).toString());
}

function amcVerify(cwd: string, args: string[] = []) {
  const amcHome = mkdtempSync(join(tmpdir(), "amc-trustroot-home-"));
  roots.push(amcHome);
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_HOME: amcHome };
  delete env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  const result = spawnSync(process.execPath, [CLI, "verify", ...args], { cwd, env, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}` };
}

describe("amc verify and the ledger trust root", () => {
  it("fails the workspace-write forgery as UNANCHORED by default", () => {
    const { workspace } = buildWorkspace();
    forge(workspace);
    const result = amcVerify(workspace);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("UNANCHORED");
    expect(result.output).not.toContain("Ledger verification PASSED");
  });

  it("names the substituted trust root when the pre-attack fingerprint is pinned with --expect-monitor", () => {
    const { workspace, fingerprint } = buildWorkspace();
    forge(workspace);
    const result = amcVerify(workspace, ["--expect-monitor", fingerprint]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("trust root");
  });

  it("passes a clean workspace whose monitor key is pinned", () => {
    const { workspace, fingerprint } = buildWorkspace();
    const result = amcVerify(workspace, ["--expect-monitor", fingerprint]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("Ledger verification PASSED");
  });

  it("fails a clean workspace whose monitor key is not pinned", () => {
    const { workspace } = buildWorkspace();
    const result = amcVerify(workspace);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("UNANCHORED");
  });

  it("gives an integrity-only result with exit 2 under --allow-unanchored", () => {
    const { workspace } = buildWorkspace();
    const result = amcVerify(workspace, ["--allow-unanchored"]);
    expect(result.status, result.output).toBe(2);
    expect(result.stderr.trimStart().startsWith("UNTRUSTED:"), result.stderr).toBe(true);
  });
});

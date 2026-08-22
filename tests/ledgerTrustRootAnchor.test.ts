import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, canonicalMetadataForHash } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * Local verification cannot detect an attacker who can write to the workspace.
 *
 * Every signature is checked against the key history, and getPublicKeyHistory
 * always includes `.amc/keys/monitor_ed25519.pub` — a file inside the workspace.
 * So an attacker who rewrites the evidence can also replace the key it is
 * checked against, re-sign everything, and pass.
 *
 * This is not a hypothesis. The first test performs that forgery end to end and
 * asserts it succeeds, so the limitation is recorded in executable form rather
 * than in a comment someone can forget. The remaining tests show that an
 * out-of-band fingerprint is what turns the verdict back into evidence.
 */
function buildWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-trustroot-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  ledger.startSession({
    sessionId: "s",
    runtime: "generic",
    binaryPath: "/usr/bin/true",
    binarySha256: "0".repeat(64)
  });
  ledger.appendEvidence({
    sessionId: "s",
    runtime: "generic",
    eventType: "stdout",
    payload: "the agent deleted the production database",
    inline: true
  });
  ledger.sealSession("s");
  ledger.close();
  return workspace;
}

function monitorFingerprintOf(workspace: string): string {
  return sha256Hex(Buffer.from(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"), "utf8"), "utf8"));
}

/** Rewrites every event, re-chains and re-signs with `privateKey`, re-seals. */
function forgeLedger(workspace: string, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]): void {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
  for (const trigger of [
    "protect_evidence_immutable",
    "no_delete_evidence",
    "no_update_evidence",
    "protect_sessions_sealed_immutable"
  ]) {
    db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  }

  const rows = db.prepare("SELECT rowid AS rid, * FROM evidence_events ORDER BY rowid ASC").all() as Array<
    Record<string, string | number | null> & { rid: number }
  >;
  const update = db.prepare(
    `UPDATE evidence_events SET payload_inline=?, canonical_payload_inline=?, payload_sha256=?,
       prev_event_hash=?, event_hash=?, writer_sig=? WHERE rowid=?`
  );
  let prev = "GENESIS";
  for (const row of rows) {
    const forged = "the agent behaved impeccably";
    const payloadSha = sha256Hex(forged);
    const canonical = canonicalMetadataForHash({
      id: row.id as string,
      ts: row.ts as number,
      sessionId: row.session_id as string,
      runtime: row.runtime as never,
      eventType: row.event_type as never,
      payloadPath: null,
      payloadInline: forged,
      metaJson: row.meta_json as string
    });
    const eventHash = sha256Hex(`${prev}${canonical}${payloadSha}`);
    const sig = sign(null, Buffer.from(eventHash, "hex"), privateKey).toString("base64");
    update.run(forged, forged, payloadSha, prev, eventHash, sig, row.rid);
    prev = eventHash;
  }

  for (const s of db.prepare("SELECT session_id FROM sessions").all() as Array<{ session_id: string }>) {
    const last = db
      .prepare("SELECT event_hash FROM evidence_events WHERE session_id=? ORDER BY rowid DESC LIMIT 1")
      .get(s.session_id) as { event_hash: string } | undefined;
    const finalHash = last?.event_hash ?? sha256Hex("EMPTY_SESSION");
    db.prepare("UPDATE sessions SET session_final_event_hash=?, session_seal_sig=? WHERE session_id=?").run(
      finalHash,
      sign(null, Buffer.from(finalHash, "hex"), privateKey).toString("base64"),
      s.session_id
    );
  }
  db.close();
}

describe("the ledger's trust root", () => {
  it("cannot detect a workspace-write attacker without an external anchor", async () => {
    const workspace = buildWorkspace();
    try {
      expect((await verifyLedgerIntegrity(workspace)).chain.ok).toBe(true);

      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      forgeLedger(workspace, privateKey);
      // The step that makes it work: replace the key the verifier reads.
      writeFileSync(
        join(workspace, ".amc", "keys", "monitor_ed25519.pub"),
        publicKey.export({ format: "pem", type: "spki" }).toString()
      );

      const verdict = await verifyLedgerIntegrity(workspace);
      // This assertion is uncomfortable on purpose. Unanchored verification
      // proves internal consistency and nothing about authorship, and pinning
      // that fact stops anyone claiming otherwise from the passing result.
      expect(verdict.chain.ok, "unanchored verification cannot see a substituted key").toBe(true);
      expect(verdict.trustRoot.anchored, "and it reports that it is unanchored").toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("rejects the same forgery when the monitor key is pinned out of band", async () => {
    const workspace = buildWorkspace();
    try {
      // Taken before the attack, as an operator's records would be.
      const expected = monitorFingerprintOf(workspace);

      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      forgeLedger(workspace, privateKey);
      writeFileSync(
        join(workspace, ".amc", "keys", "monitor_ed25519.pub"),
        publicKey.export({ format: "pem", type: "spki" }).toString()
      );

      const verdict = await verifyLedgerIntegrity(workspace, { expectedMonitorFingerprint: expected });
      expect(verdict.chain.ok, "a substituted trust root must be caught").toBe(false);
      expect(verdict.chain.errors.join(" ")).toContain("trust root");
      expect(verdict.trustRoot.anchored).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("passes and reports itself anchored when the key matches", async () => {
    const workspace = buildWorkspace();
    try {
      const verdict = await verifyLedgerIntegrity(workspace, {
        expectedMonitorFingerprint: monitorFingerprintOf(workspace)
      });
      expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
      expect(verdict.trustRoot.anchored).toBe(true);
      expect(verdict.trustRoot.monitorFingerprint).toBe(verdict.trustRoot.expectedFingerprint);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("reads the expectation from the environment when no option is passed", async () => {
    const workspace = buildWorkspace();
    const prior = process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"];
    try {
      process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"] = "f".repeat(64);
      const verdict = await verifyLedgerIntegrity(workspace);
      expect(verdict.chain.ok, "a wrong pin from the environment must still fail").toBe(false);
      expect(verdict.chain.errors.join(" ")).toContain("trust root");
    } finally {
      if (prior === undefined) delete process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"];
      else process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"] = prior;
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { Command } from "commander";
import { stripVTControlCharacters } from "node:util";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { canonicalMetadataForHash, openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";
import { signTrustList } from "../src/trust/index.js";
import { LEDGER_UNANCHORED_MESSAGE } from "../src/ledger/ledgerVerification.js";
import { registerSessionCommands } from "../src/cli-session-commands.js";

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

  it("accepts the recorded fingerprint in upper case, as the trust context does", () => {
    const { workspace, fingerprint } = buildWorkspace();
    const result = amcVerify(workspace, ["--expect-monitor", fingerprint.toUpperCase()]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("substituted key");
  });

  it("prints the full monitor key id with an UNANCHORED refusal, so the operator can compare it with their record", () => {
    const { workspace, fingerprint } = buildWorkspace();
    const result = amcVerify(workspace);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain(fingerprint);
  });

  it("fails a distrusted monitor key even when it is pinned and --allow-unanchored is used", () => {
    const { workspace, fingerprint } = buildWorkspace();
    const root = generateKeyPairSync("ed25519");
    const rootId = sha256Hex(Buffer.from(root.publicKey.export({ format: "pem", type: "spki" }).toString(), "utf8"));
    const now = Date.now();
    const list = signTrustList({ type: "amc.trust-list", version: 1, listId: "distrust-monitor", sequence: 1,
      issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(), entries: [],
      distrust: [{ keyId: fingerprint, distrustedFrom: null, reason: "key-compromise", note: "ledger CLI test", source: "operator" }] },
    root.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
    const listPath = join(mkdtempSync(join(tmpdir(), "amc-trustroot-list-")), "list.json");
    roots.push(join(listPath, ".."));
    writeFileSync(listPath, JSON.stringify(list));
    const result = amcVerify(workspace, ["--expect-monitor", fingerprint, "--allow-unanchored", "--trust-list", listPath, "--trust-root", rootId]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("distrusted");
  });

  it("gives an integrity-only result with exit 2 under --allow-unanchored", () => {
    const { workspace } = buildWorkspace();
    const result = amcVerify(workspace, ["--allow-unanchored"]);
    expect(result.status, result.output).toBe(2);
    expect(result.stderr.trimStart().startsWith("UNTRUSTED:"), result.stderr).toBe(true);
  });
});

/**
 * `amc session verify` is a second command over the same verdict, so it must map it to the same exit codes. These
 * run the registered command in process (dist/cli.js above is a subprocess, which the parent coverage run cannot see),
 * with process.exit and the console captured.
 */
class Exit extends Error {
  constructor(readonly code: number | undefined) { super(`process.exit(${code})`); }
}

async function sessionVerify(cwd: string, args: string[] = []) {
  const amcHome = mkdtempSync(join(tmpdir(), "amc-trustroot-home-"));
  roots.push(amcHome);
  vi.stubEnv("AMC_HOME", amcHome);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { out.push(stripVTControlCharacters(parts.join(" "))); });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => { err.push(stripVTControlCharacters(parts.join(" "))); });
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => { throw new Exit(typeof code === "number" ? code : undefined); });
  const program = new Command().exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerSessionCommands(program);
  let exit: number | null = null;
  let failure: unknown = null;
  try {
    await program.parseAsync(["node", "amc", "session", "verify", ...args]);
  } catch (error) {
    if (error instanceof Exit) exit = error.code ?? 0;
    else failure = error;
  }
  return { exit, failure, out: out.join("\n"), err };
}

describe("amc session verify and the ledger trust root", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("passes a clean workspace whose monitor key is pinned, and lists the session lifecycle", async () => {
    const { workspace, fingerprint } = buildWorkspace();
    const result = await sessionVerify(workspace, ["--expect-monitor", fingerprint]);
    expect(result.failure).toBeNull();
    expect(result.exit).toBe(0);
    expect(result.out).toContain("Ledger verification PASSED");
    expect(result.out).toContain(`Anchored to the pinned monitor key ${fingerprint}`);
    expect(result.out).toMatch(/Agent sessions\n\s+closed\s+0\n\s+open\s+0\n\s+released\s+0 \(handed off; resumable\)\n\s+interrupted 0/);
    expect(result.err).toEqual([]);
  });

  it("prints the verdict as JSON under --json, with the monitor key's admission, and exits 0 when it is pinned", async () => {
    const { workspace, fingerprint } = buildWorkspace();
    const result = await sessionVerify(workspace, ["--expect-monitor", fingerprint.toUpperCase(), "--json"]);
    expect(result.exit).toBe(0);
    const verdict = JSON.parse(result.out) as { ok: boolean; trustRoot: { anchored: boolean; expectedFingerprint: string; monitorAdmission: { status: string } } };
    expect(verdict.ok).toBe(true);
    expect(verdict.trustRoot).toMatchObject({ anchored: true, expectedFingerprint: fingerprint, monitorAdmission: { status: "admitted" } });
  });

  it("fails a clean workspace whose monitor key is not pinned, naming the key it read from the workspace", async () => {
    const { workspace, fingerprint } = buildWorkspace();
    const result = await sessionVerify(workspace);
    expect(result.exit).toBe(1);
    expect(result.out).toContain(LEDGER_UNANCHORED_MESSAGE);
    expect(result.out).toContain(`Signed by monitor key ${fingerprint}, read from inside the workspace.`);
    expect(result.out).not.toContain("Ledger verification PASSED");
    expect(result.err).toEqual([]);
    expect((await sessionVerify(workspace, ["--json"])).exit).toBe(1);
  });

  it("gives an integrity-only result with exit 2 and an UNTRUSTED line on stderr under --allow-unanchored", async () => {
    const { workspace } = buildWorkspace();
    const text = await sessionVerify(workspace, ["--allow-unanchored"]);
    expect(text.exit).toBe(2);
    expect(text.out).toContain("Ledger integrity verified, UNTRUSTED: UNANCHORED (--allow-unanchored). This proves internal consistency only.");
    expect(text.err).toHaveLength(1);
    expect(text.err[0]?.startsWith("UNTRUSTED: integrity verified, but --allow-unanchored was used:")).toBe(true);
    const json = await sessionVerify(workspace, ["--allow-unanchored", "--json"]);
    expect(json.exit).toBe(2);
    expect(JSON.parse(json.out)).toMatchObject({ ok: true, trustRoot: { anchored: false } });
    expect(json.err[0]?.startsWith("UNTRUSTED:")).toBe(true);
  });

  it("fails the substituted-key forgery against the recorded fingerprint, and --allow-unanchored does not soften it", async () => {
    const { workspace, fingerprint } = buildWorkspace();
    forge(workspace);
    for (const flags of [[], ["--allow-unanchored"]]) {
      const result = await sessionVerify(workspace, ["--expect-monitor", fingerprint, ...flags]);
      expect(result.exit, result.out).toBe(1);
      expect(result.out).toContain("Ledger verification FAILED");
      expect(result.err).toEqual([]);
    }
  });

  it("fails a distrusted monitor key even when it is pinned and --allow-unanchored is used", async () => {
    const { workspace, fingerprint } = buildWorkspace();
    const root = generateKeyPairSync("ed25519");
    const rootId = sha256Hex(Buffer.from(root.publicKey.export({ format: "pem", type: "spki" }).toString(), "utf8"));
    const now = Date.now();
    const list = signTrustList({ type: "amc.trust-list", version: 1, listId: "distrust-monitor", sequence: 1,
      issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(), entries: [],
      distrust: [{ keyId: fingerprint, distrustedFrom: null, reason: "key-compromise", note: "session verify test", source: "operator" }] },
    root.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
    const listDir = mkdtempSync(join(tmpdir(), "amc-trustroot-list-"));
    roots.push(listDir);
    writeFileSync(join(listDir, "list.json"), JSON.stringify(list));
    const result = await sessionVerify(workspace, ["--expect-monitor", fingerprint, "--allow-unanchored", "--trust-list", join(listDir, "list.json"), "--trust-root", rootId]);
    expect(result.exit).toBe(1);
    expect(result.out).toContain("Ledger verification FAILED: monitor key distrusted.");
    expect(result.out).toContain("session verify test");
    expect(result.err).toEqual([]);
  });

  it("refuses a malformed --expect-monitor value before verifying anything", async () => {
    const { workspace } = buildWorkspace();
    const result = await sessionVerify(workspace, ["--expect-monitor", "not-a-fingerprint", "--allow-unanchored"]);
    expect(result.exit).toBeNull();
    expect(String(result.failure)).toContain("--expect-monitor must be a 64 hex sha256 fingerprint");
    expect(result.out).toBe("");
  });

  it("refuses a missing trust-list file instead of verifying without it", async () => {
    const { workspace, fingerprint } = buildWorkspace();
    const missing = join(workspace, "no-such-list.json");
    const result = await sessionVerify(workspace, ["--expect-monitor", fingerprint, "--trust-list", missing, "--trust-root", fingerprint]);
    expect(result.exit).toBeNull();
    expect(String(result.failure)).toContain("TRUST_LIST_INVALID");
    expect(String(result.failure)).toContain(missing);
    expect(result.out).toBe("");
  });

  it("has no --allow-unpinned, since a ledger has no issuer to pin", async () => {
    const { workspace } = buildWorkspace();
    const result = await sessionVerify(workspace, ["--allow-unpinned"]);
    expect(result.exit).toBeNull();
    expect((result.failure as { code?: string }).code).toBe("commander.unknownOption");
    expect(result.out).toBe("");
  });
});

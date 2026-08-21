import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addPublicKeyToHistory, verifyKeyHistoryChain } from "../src/crypto/keys.js";

/**
 * G6-07/G6-08: the key history decides which public keys may verify as each
 * role, and verifyHexDigestAny accepts a signature if ANY listed key validates
 * it. The file was written 0644 and unprotected, so anyone with workspace write
 * access could append a key and forge every auditor signature. Keys admitted
 * from a notary were also appended silently and permanently.
 */
const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-trust-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const PEM_A = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n";
const PEM_B = "-----BEGIN PUBLIC KEY-----\nBBBB\n-----END PUBLIC KEY-----\n";

describe("key history is tamper-evident", () => {
  it("appends form an intact chain", () => {
    const ws = workspace();
    addPublicKeyToHistory(ws, "auditor", PEM_A);
    addPublicKeyToHistory(ws, "auditor", PEM_B);
    expect(verifyKeyHistoryChain(ws, "auditor").ok).toBe(true);

    const entries = JSON.parse(
      readFileSync(join(ws, ".amc", "keys", "auditor_history.json"), "utf8")
    ) as Array<{ entryHash?: string; prevHash?: string }>;
    expect(entries).toHaveLength(2);
    // Each entry commits to the one before it.
    expect(entries[1]?.prevHash).toBe(entries[0]?.entryHash);
  });

  it("detects a key planted directly into the file", () => {
    const ws = workspace();
    addPublicKeyToHistory(ws, "auditor", PEM_A);

    // The attack: write a public key straight into the trust set.
    const file = join(ws, ".amc", "keys", "auditor_history.json");
    const entries = JSON.parse(readFileSync(file, "utf8")) as unknown[];
    entries.push({
      createdTs: Date.now(),
      fingerprint: "planted",
      publicKeyPem: PEM_B,
      entryHash: "forged",
      prevHash: "forged"
    });
    writeFileSync(file, JSON.stringify(entries, null, 2));

    const chain = verifyKeyHistoryChain(ws, "auditor");
    expect(chain.ok).toBe(false);
    expect(chain.brokenAtIndex).toBe(1);
  });

  it("detects an altered existing entry", () => {
    const ws = workspace();
    addPublicKeyToHistory(ws, "auditor", PEM_A);
    const file = join(ws, ".amc", "keys", "auditor_history.json");
    const entries = JSON.parse(readFileSync(file, "utf8")) as Array<{ publicKeyPem: string }>;
    entries[0]!.publicKeyPem = PEM_B;
    writeFileSync(file, JSON.stringify(entries, null, 2));
    expect(verifyKeyHistoryChain(ws, "auditor").ok).toBe(false);
  });

  it("writes the trust set owner-only", () => {
    const ws = workspace();
    addPublicKeyToHistory(ws, "auditor", PEM_A);
    const file = join(ws, ".amc", "keys", "auditor_history.json");
    // 0644 let any local user rewrite which keys can sign as auditor.
    expect(statSync(file).mode & 0o077).toBe(0);
  });

  it("records where an externally admitted key came from", () => {
    const ws = workspace();
    addPublicKeyToHistory(ws, "auditor", PEM_A, "notary");
    const file = join(ws, ".amc", "keys", "auditor_history.json");
    const entries = JSON.parse(readFileSync(file, "utf8")) as Array<{ source?: string }>;
    expect(entries[0]?.source).toBe("notary");
  });
});

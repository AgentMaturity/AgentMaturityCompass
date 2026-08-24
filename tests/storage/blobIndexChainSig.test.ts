import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import {
  storeEncryptedBlob,
  verifyBlobIndexSignature,
  verifyBlobIndexChain
} from "../../src/storage/blobs/blobStore.js";
import { blobsRoot } from "../../src/storage/blobs/blobKeys.js";

/**
 * The blob index authenticates its history by SIGNING THE CHAIN HEAD, not by
 * re-hashing the whole file on every append.
 *
 * Each index row hashes its predecessor, so the last row's hash transitively
 * commits to every row before it. Signing that one 32-byte head is equivalent
 * tamper-evidence to signing the whole file — but O(1) per append instead of
 * O(file size), which over a session storing a blob per content event was the
 * difference between O(n) and O(n^2). The redesign only matters if the guarantee
 * survives it, so these drive the three tampers it must still catch.
 */
const PASS = "blob-index-chain-passphrase";

function withWorkspace<T>(fn: (workspace: string) => T): T {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-blobidx-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  try {
    return fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

function indexPath(workspace: string): string {
  return join(blobsRoot(workspace), "index.jsonl");
}

function storeN(workspace: string, n: number): void {
  for (let i = 0; i < n; i += 1) {
    storeEncryptedBlob(workspace, Buffer.from(`payload ${i}`, "utf8"));
  }
}

describe("blob index chain-head signature", () => {
  it("verifies an honestly written index", () => {
    withWorkspace((workspace) => {
      storeN(workspace, 5);
      expect(verifyBlobIndexSignature(workspace).valid).toBe(true);
      const chain = verifyBlobIndexChain(workspace);
      expect(chain.ok, chain.errors.join("; ")).toBe(true);
      expect(chain.rows).toBe(5);
    });
  });

  it("catches truncation — removing the last row moves the head off the signed value", () => {
    withWorkspace((workspace) => {
      storeN(workspace, 5);
      const lines = readFileSync(indexPath(workspace), "utf8").split("\n").filter((l) => l.trim());
      // Drop the last row. The attacker cannot re-sign the new (earlier) head.
      writeFileSync(indexPath(workspace), lines.slice(0, -1).join("\n") + "\n");
      expect(verifyBlobIndexSignature(workspace).valid).toBe(false);
      expect(verifyBlobIndexSignature(workspace).reason).toMatch(/last hash mismatch/);
    });
  });

  it("catches an edited row — the chain and head both change", () => {
    withWorkspace((workspace) => {
      storeN(workspace, 5);
      const lines = readFileSync(indexPath(workspace), "utf8").split("\n").filter((l) => l.trim());
      const row = JSON.parse(lines[2]!) as { payloadSha256: string };
      row.payloadSha256 = "f".repeat(64);
      lines[2] = JSON.stringify(row);
      writeFileSync(indexPath(workspace), lines.join("\n") + "\n");
      // The per-row chain breaks at the edit, which verifyBlobIndexChain catches.
      const chain = verifyBlobIndexChain(workspace);
      expect(chain.ok).toBe(false);
      expect(chain.errors.join(" ")).toMatch(/chain mismatch|hash mismatch/);
    });
  });

  it("catches an appended forgery — a new head the attacker cannot sign", () => {
    withWorkspace((workspace) => {
      storeN(workspace, 3);
      const lines = readFileSync(indexPath(workspace), "utf8").split("\n").filter((l) => l.trim());
      const last = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
      const forged = { ...last, blobId: "blob_forged", prev: last.hash, hash: "e".repeat(64) };
      writeFileSync(indexPath(workspace), lines.join("\n") + "\n" + JSON.stringify(forged) + "\n");
      expect(verifyBlobIndexSignature(workspace).valid).toBe(false);
    });
  });

  it("does not read the whole index to append — cost is flat as the index grows", () => {
    withWorkspace((workspace) => {
      // Warm, then time a small batch early vs. a small batch after many rows.
      storeN(workspace, 20);
      const t0 = performance.now();
      storeN(workspace, 20);
      const early = performance.now() - t0;

      storeN(workspace, 400);

      const t1 = performance.now();
      storeN(workspace, 20);
      const late = performance.now() - t1;

      // With the whole-file digest this ratio grew with n. A flat cost is the
      // point of signing the head; 4x is generous headroom over timing noise
      // while still catching a regression back to reading the whole file.
      expect(late, `late ${late.toFixed(1)}ms vs early ${early.toFixed(1)}ms`).toBeLessThan(early * 4 + 50);
    });
  });

  it("keeps the signature file small and 0644", () => {
    withWorkspace((workspace) => {
      storeN(workspace, 3);
      const sigPath = join(blobsRoot(workspace), "index.jsonl.sig");
      const sig = JSON.parse(readFileSync(sigPath, "utf8")) as Record<string, unknown>;
      // No whole-file digest field any more — the head is the signed value.
      expect(sig).not.toHaveProperty("digestSha256");
      expect(sig).toHaveProperty("lastHash");
      expect(statSync(sigPath).mode & 0o777).toBe(0o644);
    });
  });
});

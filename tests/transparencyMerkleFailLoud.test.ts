import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  appendTransparencyEntry,
  readTransparencyEntries,
  verifyTransparencyLog
} from "../src/transparency/logChain.js";
import {
  rebuildTransparencyMerkle,
  verifyTransparencyMerkle
} from "../src/transparency/merkleIndexStore.js";
import {
  readMerklePendingMarker,
  TransparencyMerkleLagError,
  writeMerklePendingMarker
} from "../src/transparency/merkleIndexState.js";
import { merkleCurrentRootPath, merklePendingPath } from "../src/transparency/merklePaths.js";

/**
 * P2.4 stage 1: "Merkle root never silently lags the log."
 *
 * The old append caught every Merkle failure, printed a console warning, and
 * returned the entry as though the append had fully succeeded. That is the
 * worst available outcome, because inclusion proofs are generated from the log
 * rather than from the signed root: after one swallowed failure the exporter
 * keeps issuing proofs against a root that was never signed or published, and
 * nothing on disk says so.
 *
 * Every test here breaks the Merkle update on purpose. A version of the code
 * that re-wraps the update in a try/catch turns this whole file red.
 */
const PASS = "transparency-merkle-fail-loud-passphrase";
const roots: string[] = [];

function newWorkspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-tmerkle-loud-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function append(workspace: string, id: string): string {
  return appendTransparencyEntry({
    workspace,
    type: "TEST_ARTIFACT",
    agentId: "default",
    artifact: {
      kind: "bom",
      sha256: createHash("sha256").update(id).digest("hex"),
      id
    }
  }).hash;
}

/**
 * Breaks the root publish without touching the log or the seal.
 *
 * Replacing current.root.json with a non-empty directory makes the atomic
 * rename at the end of the publish fail, which is the closest deterministic
 * stand-in for the real causes (an unreachable notary, an invalid trust config,
 * a full or read-only disk) that do not reproduce in a unit test.
 */
function breakRootPublish(workspace: string): void {
  const path = merkleCurrentRootPath(workspace);
  rmSync(path, { force: true });
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "occupied"), "blocks the rename\n", "utf8");
}

function repairRootPublish(workspace: string): void {
  rmSync(merkleCurrentRootPath(workspace), { recursive: true, force: true });
}

describe("a failed merkle update is surfaced, not swallowed", () => {
  test("appendTransparencyEntry throws when the root cannot be advanced", () => {
    const workspace = newWorkspace();
    append(workspace, "before-break");
    breakRootPublish(workspace);

    let thrown: unknown = null;
    try {
      append(workspace, "during-break");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TransparencyMerkleLagError);
    const lag = thrown as TransparencyMerkleLagError;
    expect(lag.pendingRecorded).toBe(true);
    // The message has to say the log line landed: a caller that sees only
    // "failed" would reasonably retry the append and double-write the entry.
    expect(lag.message).toContain("committed to log.jsonl");
    expect(lag.message).toContain(lag.entryHash);
  });

  test("the entry is still in the log, and the log itself still verifies", () => {
    const workspace = newWorkspace();
    breakRootPublish(workspace);

    let entryHash = "";
    try {
      append(workspace, "during-break");
    } catch (error) {
      entryHash = (error as TransparencyMerkleLagError).entryHash;
    }

    // Half-succeeded, and both halves are stated honestly: the hash-chained log
    // is intact and sealed, the Merkle index is behind.
    const entries = readTransparencyEntries(workspace);
    expect(entries.map((entry) => entry.hash)).toContain(entryHash);
    expect(verifyTransparencyLog(workspace).ok).toBe(true);
    expect(verifyTransparencyMerkle(workspace).ok).toBe(false);
  });

  test("the lag outlives the process that hit it and names the entry", () => {
    const workspace = newWorkspace();
    breakRootPublish(workspace);
    try {
      append(workspace, "during-break");
    } catch {
      // The marker, not the exception, is what a later verification reads.
    }

    const marker = readMerklePendingMarker(workspace);
    expect(marker).not.toBeNull();
    expect(marker?.entryHash).toHaveLength(64);

    const verified = verifyTransparencyMerkle(workspace);
    expect(verified.ok).toBe(false);
    expect(verified.lagPending).toBe(true);
    expect(verified.errors.join(" ")).toContain("merkle update pending");
  });

  test("the explicit repair path clears the lag", () => {
    const workspace = newWorkspace();
    breakRootPublish(workspace);
    try {
      append(workspace, "during-break");
    } catch {
      // Expected; the repair below is the documented remedy.
    }
    repairRootPublish(workspace);

    const rebuilt = rebuildTransparencyMerkle(workspace);
    expect(rebuilt.leafCount).toBe(readTransparencyEntries(workspace).length);

    const verified = verifyTransparencyMerkle(workspace);
    expect(verified.ok).toBe(true);
    expect(verified.lagPending).toBe(false);
    expect(readMerklePendingMarker(workspace)).toBeNull();
  });

  test("a recorded lag fails verification on its own, and a healthy append clears it", () => {
    const workspace = newWorkspace();
    append(workspace, "healthy");
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);

    // Fail closed: a marker left behind by a crashed process is a claim that the
    // root lagged, and nothing has since proved it does not.
    expect(
      writeMerklePendingMarker({ workspace, entryHash: "b".repeat(64), reason: "simulated crash mid-update" })
    ).toBe(true);
    const stale = verifyTransparencyMerkle(workspace);
    expect(stale.ok).toBe(false);
    expect(stale.lagPending).toBe(true);

    append(workspace, "after-crash");
    const healed = verifyTransparencyMerkle(workspace);
    expect(healed.ok).toBe(true);
    expect(healed.lagPending).toBe(false);
  });

  test("a corrupt pending marker still reports a lag rather than being ignored", () => {
    const workspace = newWorkspace();
    append(workspace, "healthy");
    writeFileSync(merklePendingPath(workspace), "{ not json", "utf8");

    const verified = verifyTransparencyMerkle(workspace);
    expect(verified.ok).toBe(false);
    expect(verified.lagPending).toBe(true);
    expect(verified.errors.join(" ")).toContain("unreadable pending marker");
  });
});

describe("merkle verification reports instead of throwing", () => {
  test("an unparseable log line is a verification error, not an exception", () => {
    const workspace = newWorkspace();
    append(workspace, "one");
    appendFileSync(join(workspace, ".amc", "transparency", "log.jsonl"), "{\"v\":1,\"broken\":true}\n", "utf8");

    // verifyAll, the studio endpoint and the certificate gate all call this and
    // destructure a result. A throw from here escaped past every one of them.
    let verified: ReturnType<typeof verifyTransparencyMerkle> | null = null;
    expect(() => {
      verified = verifyTransparencyMerkle(workspace);
    }).not.toThrow();
    expect(verified!.ok).toBe(false);
    expect(verified!.errors.join(" ")).toContain("cannot recompute merkle root");
  });
});

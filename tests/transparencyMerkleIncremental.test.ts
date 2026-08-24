import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { appendTransparencyEntry, readTransparencyEntries } from "../src/transparency/logChain.js";
import { buildMerkleRootFromEntryHashes, merkleLeafHash, merkleNodeHash } from "../src/transparency/merkle.js";
import {
  appendLeafToFrontier,
  buildFrontierFromEntryHashes,
  EMPTY_MERKLE_FRONTIER,
  frontierMatchesLeafCount,
  frontierRoot,
  type MerkleFrontier
} from "../src/transparency/merkleFrontier.js";
import { readMerkleFrontierState } from "../src/transparency/merkleIndexState.js";
import { merkleFrontierPath, merkleLeavesPath, merkleRootsPath } from "../src/transparency/merklePaths.js";
import {
  currentTransparencyMerkleRoot,
  rebuildTransparencyMerkle,
  updateTransparencyMerkleAfterAppend,
  verifyTransparencyMerkle
} from "../src/transparency/merkleIndexStore.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * P2.4 stage 1: the transparency Merkle index is now advanced incrementally.
 *
 * The one property that makes that safe is byte-for-byte equivalence with the
 * full rebuild at EVERY leaf count — verifyTransparencyMerkle recomputes the
 * root from log.jsonl and compares it against the signed current.root.json, so
 * an incremental writer that diverges at a single n turns every later
 * verification into a hard failure and orphans every proof already exported.
 *
 * Equivalence tests are easy to write in a way that cannot fail, so this file
 * also runs a deliberately WRONG incremental variant against the same oracle
 * and asserts it diverges. If the oracle ever stops discriminating, that test
 * goes red and says so.
 */
const PASS = "transparency-merkle-incremental-passphrase";
const roots: string[] = [];

function newWorkspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-tmerkle-"));
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

function appendEntry(workspace: string, index: number): string {
  return appendTransparencyEntry({
    workspace,
    type: "TEST_ARTIFACT",
    agentId: "default",
    artifact: {
      kind: "bom",
      sha256: createHash("sha256").update(`artifact-${index}`).digest("hex"),
      id: `artifact-${index}`
    }
  }).hash;
}

function fakeEntryHashes(count: number): string[] {
  return Array.from({ length: count }, (_unused, i) => createHash("sha256").update(`entry-${i}`).digest("hex"));
}

/**
 * The mutation: RFC-6962 promotion (an unpaired node moves up untouched)
 * instead of the duplication this tree actually uses. It is the single most
 * likely way to get an "incremental Merkle" wrong, and src/session/sessionMerkle
 * genuinely does it this way — so a copy-paste between the two constructions is
 * a real hazard, not a hypothetical one.
 */
function promotingFrontierRoot(frontier: MerkleFrontier): string {
  if (frontier.length === 0) {
    return buildMerkleRootFromEntryHashes([]);
  }
  let current = frontier[frontier.length - 1]!.hash;
  for (let i = frontier.length - 2; i >= 0; i -= 1) {
    current = merkleNodeHash(frontier[i]!.hash, current);
  }
  return current;
}

describe("transparency merkle frontier equivalence", () => {
  test("frontier root equals the full rebuild at every leaf count", () => {
    const hashes = fakeEntryHashes(160);
    let frontier: MerkleFrontier = EMPTY_MERKLE_FRONTIER;
    for (let n = 0; n <= hashes.length; n += 1) {
      expect(frontierRoot(frontier), `leafCount ${n}`).toBe(buildMerkleRootFromEntryHashes(hashes.slice(0, n)));
      expect(frontierMatchesLeafCount(frontier, n), `shape at leafCount ${n}`).toBe(true);
      if (n < hashes.length) {
        frontier = appendLeafToFrontier(frontier, hashes[n]!);
      }
    }
  });

  test("a wrong odd-node rule diverges from the rebuild — the equivalence oracle discriminates", () => {
    const hashes = fakeEntryHashes(16);
    const divergences: number[] = [];
    for (let n = 0; n <= hashes.length; n += 1) {
      const frontier = buildFrontierFromEntryHashes(hashes.slice(0, n));
      if (promotingFrontierRoot(frontier) !== buildMerkleRootFromEntryHashes(hashes.slice(0, n))) {
        divergences.push(n);
      }
    }
    // Every leaf count whose binary form has more than one set bit needs the
    // duplication rule; promotion is only accidentally right at powers of two.
    expect(divergences).toContain(3);
    expect(divergences).toContain(5);
    expect(divergences).toContain(11);
    expect(divergences.length).toBeGreaterThan(8);
  });

  test("frontier shape check rejects a leaf count the nodes cannot have produced", () => {
    const frontier = buildFrontierFromEntryHashes(fakeEntryHashes(11));
    expect(frontierMatchesLeafCount(frontier, 11)).toBe(true);
    expect(frontierMatchesLeafCount(frontier, 12)).toBe(false);
    expect(frontierMatchesLeafCount(frontier, 10)).toBe(false);
    expect(frontierMatchesLeafCount(frontier, -1)).toBe(false);
  });
});

describe("incremental transparency merkle updates", () => {
  test("appends produce the root and the leaves file a full rebuild would produce", () => {
    const workspace = newWorkspace();
    for (let i = 0; i < 12; i += 1) {
      appendEntry(workspace, i);
    }
    const entryHashes = readTransparencyEntries(workspace).map((entry) => entry.hash);
    const expectedRoot = buildMerkleRootFromEntryHashes(entryHashes);

    const incrementalRoot = currentTransparencyMerkleRoot(workspace);
    expect(incrementalRoot?.root).toBe(expectedRoot);
    expect(incrementalRoot?.leafCount).toBe(entryHashes.length);
    expect(incrementalRoot?.lastEntryHash).toBe(entryHashes[entryHashes.length - 1]);
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);

    const leavesFromIncremental = readFileSync(merkleLeavesPath(workspace), "utf8");
    const rebuilt = rebuildTransparencyMerkle(workspace);
    expect(rebuilt.root).toBe(expectedRoot);
    // The repair path is the oracle: the incrementally grown file must be the
    // file the rebuild writes, not merely a file that happens to verify.
    expect(readFileSync(merkleLeavesPath(workspace), "utf8")).toBe(leavesFromIncremental);
    expect(leavesFromIncremental.trim().split("\n")).toHaveLength(entryHashes.length);
  });

  test("history is appended, not rewritten", () => {
    const workspace = newWorkspace();
    for (let i = 0; i < 6; i += 1) {
      appendEntry(workspace, i);
    }
    const leavesPrefix = readFileSync(merkleLeavesPath(workspace), "utf8");
    const rootsPrefix = readFileSync(merkleRootsPath(workspace), "utf8");

    for (let i = 6; i < 12; i += 1) {
      appendEntry(workspace, i);
    }
    const leavesAfter = readFileSync(merkleLeavesPath(workspace), "utf8");
    const rootsAfter = readFileSync(merkleRootsPath(workspace), "utf8");

    // The defect this fixes rewrote both files in full on every append. If the
    // earlier bytes are still the leading bytes, no history was rewritten.
    expect(leavesAfter.startsWith(leavesPrefix)).toBe(true);
    expect(rootsAfter.startsWith(rootsPrefix)).toBe(true);
    expect(leavesAfter.length).toBeGreaterThan(leavesPrefix.length);
  });

  test("the resume state tracks the log and points at the published root", () => {
    const workspace = newWorkspace();
    let last = "";
    for (let i = 0; i < 7; i += 1) {
      last = appendEntry(workspace, i);
    }
    const leafCount = readTransparencyEntries(workspace).length;
    const state = readMerkleFrontierState(workspace);
    expect(state).not.toBeNull();
    expect(state?.leafCount).toBe(leafCount);
    expect(state?.lastEntryHash).toBe(last);
    expect(frontierRoot(state!.frontier)).toBe(currentTransparencyMerkleRoot(workspace)?.root);
    expect(frontierMatchesLeafCount(state!.frontier, leafCount)).toBe(true);
  });
});

/**
 * Writes a well-formed entry straight into log.jsonl, bypassing the store, so
 * `updateTransparencyMerkleAfterAppend` can be driven directly and its chosen
 * mode observed. Mirrors appendTransparencyEntry's canonicalization exactly —
 * if that ever drifts, the seal/hash assertions below go red.
 */
function appendRawLogEntry(workspace: string, prev: string, id: string): string {
  const payload = {
    v: 1 as const,
    ts: Date.now(),
    type: "TEST_ARTIFACT",
    agentId: "default",
    artifact: { kind: "bom" as const, sha256: createHash("sha256").update(id).digest("hex"), id },
    prev
  };
  const hash = sha256Hex(canonicalize(payload));
  appendFileSync(join(workspace, ".amc", "transparency", "log.jsonl"), `${JSON.stringify({ ...payload, hash })}\n`, "utf8");
  return hash;
}

describe("incremental resume is used, and untrusted resume state falls back", () => {
  test("a resumable append takes the incremental path", () => {
    const workspace = newWorkspace();
    let prev = "";
    for (let i = 0; i < 5; i += 1) {
      prev = appendEntry(workspace, i);
    }
    const added = appendRawLogEntry(workspace, prev, "raw-6");
    const update = updateTransparencyMerkleAfterAppend(workspace, { entryHash: added, prevEntryHash: prev });

    expect(update.mode).toBe("incremental");
    expect(update.reason).toBeNull();
    expect(update.leafCount).toBe(readTransparencyEntries(workspace).length);
    expect(update.root).toBe(buildMerkleRootFromEntryHashes(readTransparencyEntries(workspace).map((e) => e.hash)));
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
  });

  test("a workspace written before the frontier existed migrates itself on the next append", () => {
    const workspace = newWorkspace();
    let prev = "";
    for (let i = 0; i < 3; i += 1) {
      prev = appendEntry(workspace, i);
    }
    // Exactly the state an existing workspace is in after an upgrade: a signed
    // current.root.json, no resume state.
    rmSync(merkleFrontierPath(workspace), { force: true });

    const added = appendRawLogEntry(workspace, prev, "raw-4");
    const update = updateTransparencyMerkleAfterAppend(workspace, { entryHash: added, prevEntryHash: prev });

    expect(update.mode).toBe("rebuild");
    expect(update.reason).toBe("no usable merkle frontier state");
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
    // And the append after the migration resumes rather than rebuilding again.
    const next = appendRawLogEntry(workspace, added, "raw-5");
    expect(updateTransparencyMerkleAfterAppend(workspace, { entryHash: next, prevEntryHash: added }).mode).toBe(
      "incremental"
    );
  });

  test("a tampered frontier is rebuilt from the log instead of steering the root", () => {
    const workspace = newWorkspace();
    let prev = "";
    for (let i = 0; i < 5; i += 1) {
      prev = appendEntry(workspace, i);
    }
    // An attacker with workspace write access edits the cached frontier. If the
    // resume check trusted it, every future root would be the attacker's.
    const state = readMerkleFrontierState(workspace)!;
    const forged = {
      ...state,
      frontier: state.frontier.map((node, index) =>
        index === 0 ? { level: node.level, hash: merkleLeafHash("f".repeat(64)) } : node
      )
    };
    writeFileSync(merkleFrontierPath(workspace), JSON.stringify(forged, null, 2), "utf8");

    const added = appendRawLogEntry(workspace, prev, "raw-6");
    const update = updateTransparencyMerkleAfterAppend(workspace, { entryHash: added, prevEntryHash: prev });

    expect(update.mode).toBe("rebuild");
    expect(update.reason).toMatch(/do not fold to the recorded root/i);
    expect(update.root).toBe(buildMerkleRootFromEntryHashes(readTransparencyEntries(workspace).map((e) => e.hash)));
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
  });

  test("a frontier that does not cover this append's parent is not resumed", () => {
    const workspace = newWorkspace();
    let prev = "";
    for (let i = 0; i < 4; i += 1) {
      prev = appendEntry(workspace, i);
    }
    const state = readMerkleFrontierState(workspace)!;
    writeFileSync(
      merkleFrontierPath(workspace),
      JSON.stringify({ ...state, lastEntryHash: "a".repeat(64) }, null, 2),
      "utf8"
    );

    const added = appendRawLogEntry(workspace, prev, "raw-5");
    const update = updateTransparencyMerkleAfterAppend(workspace, { entryHash: added, prevEntryHash: prev });

    expect(update.mode).toBe("rebuild");
    expect(update.reason).toMatch(/frontier covers/i);
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
  });

  test("a truncated leaves file is detected and repaired rather than appended to", () => {
    const workspace = newWorkspace();
    let prev = "";
    for (let i = 0; i < 4; i += 1) {
      prev = appendEntry(workspace, i);
    }
    writeFileSync(merkleLeavesPath(workspace), "", "utf8");

    const added = appendRawLogEntry(workspace, prev, "raw-5");
    const update = updateTransparencyMerkleAfterAppend(workspace, { entryHash: added, prevEntryHash: prev });

    expect(update.mode).toBe("rebuild");
    expect(update.reason).toMatch(/leaves\.jsonl is 0 bytes/i);
    expect(readFileSync(merkleLeavesPath(workspace), "utf8").trim().split("\n")).toHaveLength(
      readTransparencyEntries(workspace).length
    );
    expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
  });
});

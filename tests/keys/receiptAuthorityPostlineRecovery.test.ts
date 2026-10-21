import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { machineMark } from "../../src/keys/anchors.js";
import { ReceiptAuthorityCommittedError, resumeReceiptAuthorityAnchors } from "../../src/keys/receiptOwnerAnchors.js";
import { receiptLedgerProblems } from "../../src/keys/receiptSqlAuthority.js";
import { captureReceiptOwnerPredecessor } from "../../src/transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../../src/transparency/merkleIndexState.js";
import { readTransparencyEntries, transparencyLogPath, transparencySealPath, transparencySealSigPath, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath } from "../../src/transparency/merklePaths.js";
import { rebuildTransparencyMerkle, verifyTransparencyMerkle } from "../../src/transparency/merkleIndexStore.js";
import { workspaceIdFromDirectory } from "../../src/workspaces/workspaceId.js";
import { cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "../helpers/receiptAuthorityFixture.js";

const io = vi.hoisted(() => ({ beforeRename: null as ((target: string) => void) | null }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: ((from: Parameters<typeof actual.renameSync>[0], to: Parameters<typeof actual.renameSync>[1]) => {
    io.beforeRename?.(String(to)); return actual.renameSync(from, to);
  }) as typeof actual.renameSync };
});
afterEach(() => { io.beforeRename = null; vi.restoreAllMocks(); cleanupReceiptAuthorityFixtures(); vi.unstubAllEnvs(); });

test("a real receipt post-line root rename failure retains its generation and requires explicit signed repair before idempotent recovery", async () => {
  const f = makeReceiptAuthorityFixture(), entriesBefore = readTransparencyEntries(f.workspace), file = loadKeyProvider(f.workspace, "file");
  const fileSigns = vi.spyOn(file, "sign"), rootPath = merkleCurrentRootPath(f.workspace), oldRoot = readFileSync(rootPath);
  const backup = join(f.root, "owned-prior-root.json"), id = `${workspaceIdFromDirectory(f.workspace)}:receipt`;
  const priorMark = machineMark(f.workspace, "KEY_ROTATION", id);
  let reached = false;
  const restoreObstruction = () => {
    io.beforeRename = null;
    if (existsSync(backup)) { rmSync(rootPath, { recursive: true, force: true }); renameSync(backup, rootPath); }
  };
  io.beforeRename = target => {
    if (target !== rootPath) return;
    io.beforeRename = null; renameSync(rootPath, backup); mkdirSync(rootPath); reached = true;
  };
  try {
    const error = await f.own().then(() => null, cause => cause);
    expect(reached).toBe(true); expect(error).toBeInstanceOf(ReceiptAuthorityCommittedError);
    expect(error).toMatchObject({ committed: true, phase: "rotation-log", pendingRecorded: true });
    expect(error.cause).toBeInstanceOf(TransparencyMerkleLagError);
    expect(error.cause.cause).toBeInstanceOf(Error); expect(typeof error.cause.cause.code).toBe("string");
    restoreObstruction(); expect(readFileSync(rootPath)).toEqual(oldRoot);
    const committed = assertKeysetComplete(f.workspace)!, generationBytes = f.read(".amc/keys/keyset.json");
    expect(error.generation).toBe(committed.generation); expect(committed.providers?.receipt?.receiptAuthoritySha256).toMatch(/^[a-f0-9]{64}$/);
    const ownerBytes = [".amc/keys/receipt-authorities/current.json", ".amc/keys/receipt-child.amcvault", ".amc/keys/receipt_history.json"].map(f.read);
    const entries = readTransparencyEntries(f.workspace), rotation = entries.at(-1)!;
    expect(entries).toHaveLength(entriesBefore.length + 1); expect(rotation).toMatchObject({ type: "KEY_ROTATION", hash: error.entryHash });
    expect(rotation.artifact.id?.startsWith(`${id}#`)).toBe(true); expect(rotation.artifact.id?.slice(id.length + 1)).toMatch(/^[1-9][0-9]*$/);
    expect(machineMark(f.workspace, "KEY_ROTATION", id)).toEqual(priorMark);
    const log = readFileSync(transparencyLogPath(f.workspace)), seal = readFileSync(transparencySealPath(f.workspace));
    const sealSig = readFileSync(transparencySealSigPath(f.workspace));
    expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
    expect(verifyTransparencyMerkle(f.workspace)).toMatchObject({ ok: false, lagPending: true });
    const partial = captureReceiptOwnerPredecessor(f.workspace);
    expect(partial.entries).toHaveLength(entriesBefore.length + 1); expect(partial.signedRootLeafCount).toBe(entriesBefore.length);

    const requests = f.fake.requests.length, calls = fileSigns.mock.calls.length;
    await expect(resumeReceiptAuthorityAnchors(f.workspace)).rejects.toMatchObject({ committed: true, phase: "predecessor",
      cause: expect.objectContaining({ message: expect.stringContaining("REPAIR_REQUIRED") }) });
    expect(f.fake.requests).toHaveLength(requests); expect(fileSigns).toHaveBeenCalledTimes(calls);
    expect(machineMark(f.workspace, "KEY_ROTATION", id)).toEqual(priorMark);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
    expect(readFileSync(transparencySealPath(f.workspace))).toEqual(seal); expect(readFileSync(transparencySealSigPath(f.workspace))).toEqual(sealSig);
    expect(f.read(".amc/keys/keyset.json")).toEqual(generationBytes);
    expect([".amc/keys/receipt-authorities/current.json", ".amc/keys/receipt-child.amcvault", ".amc/keys/receipt_history.json"].map(f.read)).toEqual(ownerBytes);

    // This is the existing explicit owner repair, not automatic receipt resume or a fabricated covered root.
    const repaired = rebuildTransparencyMerkle(f.workspace); expect(repaired.leafCount).toBe(entries.length);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
    expect(verifyTransparencyMerkle(f.workspace)).toMatchObject({ ok: true, lagPending: false });
    await resumeReceiptAuthorityAnchors(f.workspace);
    const completed = readTransparencyEntries(f.workspace), added = completed.slice(entriesBefore.length);
    expect(added.map(entry => entry.type)).toEqual(["KEY_ROTATION", "KEY_HISTORY_REVISION"]);
    expect(added[0]!.hash).toBe(rotation.hash); expect(completed.filter(entry => entry.hash === rotation.hash)).toHaveLength(1);
    expect(added.every(entry => entry.artifact.id?.startsWith(`${id}#`))).toBe(true);
    expect(machineMark(f.workspace, "KEY_ROTATION", id)).toMatchObject({ sequence: Number(rotation.artifact.id!.split("#").at(-1)) });
    const covered = captureReceiptOwnerPredecessor(f.workspace); expect(covered.signedRootLeafCount).toBe(completed.length);
    expect(verifyTransparencyLog(f.workspace).ok).toBe(true); expect(verifyTransparencyMerkle(f.workspace)).toMatchObject({ ok: true, lagPending: false });
    expect(f.read(".amc/keys/keyset.json")).toEqual(generationBytes);
    const statePaths = [transparencyLogPath(f.workspace), transparencySealPath(f.workspace), transparencySealSigPath(f.workspace), rootPath, merkleCurrentRootSigPath(f.workspace)];
    const completedBytes = statePaths.map(path => readFileSync(path)), completedRequests = f.fake.requests.length, completedSigns = fileSigns.mock.calls.length;
    await resumeReceiptAuthorityAnchors(f.workspace);
    expect(statePaths.map(path => readFileSync(path))).toEqual(completedBytes);
    expect(f.fake.requests).toHaveLength(completedRequests); expect(fileSigns).toHaveBeenCalledTimes(completedSigns);
    expect(f.read(".amc/keys/keyset.json")).toEqual(generationBytes);
    expect([".amc/keys/receipt-authorities/current.json", ".amc/keys/receipt-child.amcvault", ".amc/keys/receipt_history.json"].map(f.read)).toEqual(ownerBytes);
    f.evidence();
    expect(f.withLedger(ledger => receiptLedgerProblems(ledger, f.trust()))).toEqual([]);
  } finally { restoreObstruction(); }
});

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, linkSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { manageObjective, readObjective } from "../src/autonomy/objectiveStore.js";
import { runDueSchedules } from "../src/autonomy/scheduleRunner.js";
import { interruptedClaims, readSchedules, saveSchedules } from "../src/autonomy/scheduleStore.js";
import * as containedFs from "../src/utils/containedFs.js";

const dirs: string[] = [];
const RESULT = "verified completion bytes";
const LIMIT = 1_048_576;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

async function fixture(relativePath = "done.txt") {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "objective-completion-regression-only");
  const workspace = temporary("amc-objective-completion-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  saveSchedules(workspace, [{ id: "completion", runAs: "reader", goal: "verify configured bytes", maxRounds: 1,
    everyMs: 60_000, enabled: true, scope: ["READ_ONLY"], objective: {
      version: 1, ownerPrincipal: "default", completionCheck: {
        kind: "file-sha256", path: relativePath, sha256: createHash("sha256").update(RESULT).digest("hex")
      }
    } }]);
  const read = readSchedules(workspace);
  if (!read.ok) throw new Error(read.reason);
  await manageObjective(workspace, "completion", "absent", read.digest, "create");
  const run = async () => {
    const results = await runDueSchedules({ workspace, parent: rootIdentity("default"), now: 1_000_000,
      expectedSchedulesDigest: read.digest, mintSessionId: () => "completion-child",
      session: { recordLoopEvent: () => null, recordProjectedEvidence: () => null },
      runner: async () => ({ ok: true, text: "the model claims complete" }) });
    expect(interruptedClaims(workspace)).toEqual([]);
    return { result: results[0], objective: readObjective(workspace, "completion") };
  };
  return { workspace, path: join(workspace, relativePath), run };
}

function unavailable(value: { result: unknown; objective: unknown }): void {
  expect(value.result).toMatchObject({ ok: false, outcome: "failed", stoppedBy: "check-unavailable", rounds: 1 });
  expect(value.objective).toMatchObject({ status: "blocked", lastCheckStatus: "unavailable", currentRound: null });
}

describe("configured objective completion reads only stable confined bytes", () => {
  it("completes a regular contained file with the exact configured hash", async () => {
    const item = await fixture();
    writeFileSync(item.path, RESULT);
    const value = await item.run();
    expect(value.result).toMatchObject({ ok: true, outcome: "completed", rounds: 1 });
    expect(value.objective).toMatchObject({ status: "complete", lastCheckStatus: "complete", currentRound: null });
  });

  it.each(["missing", "directory", "fifo", "oversize", "hardlink", "symlink"])("treats %s evidence as unavailable", async kind => {
    const item = await fixture();
    if (kind === "directory") mkdirSync(item.path);
    if (kind === "fifo") execFileSync("mkfifo", [item.path]);
    if (kind === "oversize") writeFileSync(item.path, Buffer.alloc(LIMIT + 1));
    if (kind === "hardlink" || kind === "symlink") {
      const outside = join(temporary("amc-objective-outside-"), "result.txt");
      writeFileSync(outside, RESULT);
      if (kind === "hardlink") linkSync(outside, item.path);
      else symlinkSync(outside, item.path);
    }
    unavailable(await item.run());
  });

  it("refuses a symlink ancestor even when the external bytes match", async () => {
    const item = await fixture("report/done.txt");
    const outside = temporary("amc-objective-ancestor-");
    writeFileSync(join(outside, "done.txt"), RESULT);
    symlinkSync(outside, join(item.workspace, "report"));
    unavailable(await item.run());
  });

  it("distinguishes a stable mismatched hash from unavailable evidence", async () => {
    const item = await fixture();
    writeFileSync(item.path, "different bytes");
    const value = await item.run();
    expect(value.result).toMatchObject({ ok: false, outcome: "exhausted" });
    expect(value.objective).toMatchObject({ status: "blocked", lastCheckStatus: "failed" });
  });

  it.each(["growth", "rewrite", "replacement", "short-read", "oversize-read"])("refuses %s during the confined read", async kind => {
    const item = await fixture();
    writeFileSync(item.path, RESULT);
    const read = containedFs.readContainedOrNull;
    const spy = vi.spyOn(containedFs, "readContainedOrNull").mockImplementation((root, relative, limit) => {
      const bytes = read(root, relative, limit);
      if (root !== item.workspace || relative !== "done.txt") return bytes;
      expect(limit).toBe(LIMIT);
      if (kind === "growth") appendFileSync(item.path, " appended after snapshot");
      if (kind === "rewrite") {
        writeFileSync(item.path, "x".repeat(Buffer.byteLength(RESULT)));
        utimesSync(item.path, 2_000_000_000, 2_000_000_000);
      }
      if (kind === "replacement") {
        renameSync(item.path, `${item.path}.previous`);
        writeFileSync(item.path, RESULT);
      }
      if (kind === "short-read") return bytes!.subarray(0, bytes!.length - 1);
      if (kind === "oversize-read") return Buffer.alloc(LIMIT + 1);
      return bytes;
    });
    unavailable(await item.run());
    expect(spy.mock.calls.some(([root, relative]) => root === item.workspace && relative === "done.txt")).toBe(true);
  });
});

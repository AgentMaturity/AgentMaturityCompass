import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import { parseEvidenceEvent } from "../src/diagnostic/gates.js";
import { selectRelevantEvents } from "../src/diagnostic/runner.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { evaluateGate } from "../src/diagnostic/gates.js";
import type { EvidenceEvent } from "../src/types.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";

/**
 * The payoff: a native run that finally counts toward something.
 *
 * Before this, every row AMC's own governed loop wrote counted toward NONE of
 * the 244 questions — r224 made untagged evidence score nothing, and nothing
 * under src/session/ tagged anything. A scope-verified delegation now evidences
 * AMC-2.15, and this asserts it end to end rather than at the projection
 * function.
 */
const PASS = "spine-e2e-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-spine-e2e-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  return dir;
}

const recorder = () => {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; } };
};

async function delegate(dir: string, sessionId: string, scope?: readonly string[]) {
  return spawnSubagent({
    workspace: dir,
    parent: rootIdentity("payments-agent"),
    request: {
      runAs: "researcher",
      goal: "check the ledger",
      ...(scope === undefined ? {} : { delegationScope: scope })
    },
    session: recorder(),
    runner: async () => ({ ok: true, text: "I checked 40 rows." }),
    mintSessionId: () => sessionId
  });
}

function allEvents(dir: string) {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT * FROM evidence_events").all() as EvidenceEvent[]).map(parseEvidenceEvent);
  } finally {
    db.close();
  }
}

describe("a scope-verified delegation scores", () => {
  it("counts toward AMC-2.15, where before it counted toward nothing", async () => {
    const dir = workspace();
    const outcome = await delegate(dir, "child-1", ["READ_ONLY"]);
    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);

    const selected = selectRelevantEvents("AMC-2.15", allEvents(dir), 1, new Set<string>());

    expect(selected.length, "the delegation is now relevant evidence").toBeGreaterThan(0);
    expect(selected.every((e) => e.trustTier === "OBSERVED")).toBe(true);
  });

  it("clears the L1 gate on two delegations, and no higher", async () => {
    // The ceiling, end to end. L1 wants a `stdout` row and two events; L2 wants
    // a `review` row and L3 an ALIGNMENT_CHECK_PASS audit, neither of which a
    // harness can honestly emit -- so more delegations never buy a higher level.
    const dir = workspace();
    await delegate(dir, "child-1", ["READ_ONLY"]);
    await delegate(dir, "child-2", ["READ_ONLY"]);
    await delegate(dir, "child-3", ["READ_ONLY"]);
    await delegate(dir, "child-4", ["READ_ONLY"]);

    const question = questionBank.find((q) => q.id === "AMC-2.15")!;
    const events = allEvents(dir);
    const passing: number[] = [];
    const reasons = new Map<number, string>();
    for (let level = 0; level <= 5; level += 1) {
      const relevant = selectRelevantEvents("AMC-2.15", events, level, new Set<string>());
      const evaluation = evaluateGate(question.gates[level]!, relevant);
      if (evaluation.pass) passing.push(level);
      else reasons.set(level, evaluation.reason);
    }

    expect(passing, "L0 and L1 only, however many delegations there are").toEqual([0, 1]);

    // ATTRIBUTED, because "it failed" is not "it failed for the reason I claim".
    // These four delegations land in one UTC day, so a day threshold would stop
    // L2 on its own and the ceiling would look structural when it was an
    // accident of the fixture. Assert the type is missing too — that is the part
    // no amount of running would ever fix.
    expect(reasons.get(2), "L2 is missing the human-review row, not only the days")
      .toContain("missing evidence types=review");
    expect(reasons.get(3), "L3 wants an alignment check nothing here claims")
      .toContain("auditType:ALIGNMENT_CHECK_PASS");
  });

  it("counts toward nothing when no scope was declared", async () => {
    // The control. Without it the tests above would pass on any delegation at
    // all, rather than on the scope verification the question asks about.
    const dir = workspace();
    await delegate(dir, "child-unscoped");

    const selected = selectRelevantEvents("AMC-2.15", allEvents(dir), 1, new Set<string>());

    expect(selected, "an unscoped delegation demonstrates no verification").toEqual([]);
  });
});

/** P2-22 blocker inbox: never "all clear" by default; every source either answers or adds a source_unavailable item. */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { saveAssuranceWaiver } from "../../src/assurance/assurancePolicyStore.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { blockerKindsOfControl, buildBlockerInbox, DEFAULT_INBOX_SOURCES, type BlockerItem } from "../../src/operator/blockerInbox.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
const NOW = Date.parse("2026-10-27T12:00:00.000Z");
const DAY = 86_400_000;
let workspace: string;

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-inbox-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
});

const item = (over: Partial<BlockerItem>): BlockerItem => ({ id: "x", kind: "not_evaluated", controlId: null, subject: { agentId: null, deploymentId: null },
  severity: "mandatory", since: NOW, dueTs: null, nextAction: "act", links: [], ...over });

function waiver(expiresTs: number, id: string, createdTs = NOW - DAY) {
  saveAssuranceWaiver(workspace, { v: 1, waiverId: id, createdTs, expiresTs, reason: "fixture waiver", scope: { type: "AGENT", id: "default" },
    allowReadyDespiteAssuranceFail: true, approvedBy: [{ userIdHash: "abcdef12", role: "OWNER", approvalEventHash: "a".repeat(64) }],
    bindings: { lastCertSha256: "b".repeat(64), policySha256: "c".repeat(64) } });
}

describe("P1-11 dimensions as blocker kinds", () => {
  test("one kind per dimension state", () => {
    expect(blockerKindsOfControl({ result: "not_evaluated", evidence: "sufficient", review: "approved" })).toEqual(["not_evaluated"]);
    expect(blockerKindsOfControl({ result: "pass", evidence: "incomplete", review: "approved" })).toEqual(["evidence_missing"]);
    expect(blockerKindsOfControl({ result: "pass", evidence: "stale", review: "approved" })).toEqual(["evidence_stale"]);
    expect(blockerKindsOfControl({ result: "fail", evidence: "contradictory", review: "approved" })).toEqual(["evidence_contradictory"]);
    expect(blockerKindsOfControl({ result: "pass", evidence: "untrusted", review: "approved" })).toEqual(["evidence_untrusted"]);
    expect(blockerKindsOfControl({ result: "pass", evidence: "sufficient", review: "pending" })).toEqual(["review_pending"]);
    expect(blockerKindsOfControl({ result: "pass", evidence: "sufficient", review: "approved" })).toEqual([]);
  });
});

describe("workspace sources", () => {
  test("an expiring assurance waiver inside the window; one outside it is not listed", () => {
    waiver(NOW + 3 * DAY, "w-soon");
    waiver(NOW + 40 * DAY, "w-later", NOW - 2 * DAY);
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW, sources: { assuranceWaivers: DEFAULT_INBOX_SOURCES.assuranceWaivers! } });
    expect(inbox.sources).toEqual({ assuranceWaivers: "ok" });
    expect(inbox.items).toEqual([expect.objectContaining({ id: "waiver:w-soon", kind: "waiver_expiring", dueTs: NOW + 3 * DAY })]);
  });

  test("an outcome_unknown receipt", () => {
    const ledger = openLedger(workspace);
    try {
      ledger.db.prepare(`INSERT INTO action_executions (execution_id, workspace_id, agent_id, tool_name, action_class, state, created_ts, updated_ts, last_receipt_digest)
        VALUES ('exec-1', 'ws', 'default', 'fs.write', 'WRITE_LOW', 'outcome_unknown', ?, ?, ?)`).run(NOW - DAY, NOW - DAY, "d".repeat(64));
    } finally {
      ledger.close();
    }
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW, sources: { actionReceipts: DEFAULT_INBOX_SOURCES.actionReceipts! } });
    expect(inbox.items).toEqual([expect.objectContaining({ id: "receipt:exec-1", kind: "outcome_unknown", subject: { agentId: "default", deploymentId: null } })]);
  });

  test("a tampered waiver makes its source unavailable, never clear", () => {
    waiver(NOW + 3 * DAY, "w-soon");
    const dir = join(workspace, ".amc", "assurance", "waivers");
    writeFileSync(join(dir, "waiver_forged.json"), "{}");
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW, sources: { assuranceWaivers: DEFAULT_INBOX_SOURCES.assuranceWaivers! } });
    expect(inbox.sources).toEqual({ assuranceWaivers: "unavailable" });
    expect(inbox.items).toEqual([expect.objectContaining({ id: "source:assuranceWaivers", kind: "source_unavailable", severity: "mandatory" })]);
  });
});

describe("never all clear by default", () => {
  test("an empty ledger yields a not_evaluated item, not an empty inbox", () => {
    vi.stubEnv("AMC_A4_PREVIEW", "1");
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW });
    expect(inbox.sources).toEqual({ a4: "ok", assuranceWaivers: "ok", actionReceipts: "ok" });
    expect(inbox.items.length).toBeGreaterThan(0);
    expect(inbox.items).toContainEqual(expect.objectContaining({ id: "a4:none", kind: "not_evaluated", severity: "mandatory" }));
  });

  test("a throwing source adds source_unavailable and sources names it", () => {
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW, sources: { ok: () => [], broken: () => { throw Object.assign(new Error("down"), { code: "DOWN" }); } } });
    expect(inbox.sources).toEqual({ ok: "ok", broken: "unavailable" });
    expect(inbox.items).toEqual([expect.objectContaining({ id: "source:broken", kind: "source_unavailable", nextAction: expect.stringContaining("DOWN") })]);
  });

  test("A4 without its preview flag is unavailable, not empty", () => {
    vi.stubEnv("AMC_A4_PREVIEW", "0");
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW, sources: { a4: DEFAULT_INBOX_SOURCES.a4! } });
    expect(inbox.items).toEqual([expect.objectContaining({ kind: "source_unavailable", nextAction: expect.stringContaining("A4_PREVIEW_DISABLED") })]);
  });

  test("order: mandatory first, then due time, then age", () => {
    const inbox = buildBlockerInbox({ workspace, nowTs: NOW, sources: { fixture: () => [
      item({ id: "advisory", severity: "advisory", dueTs: NOW, since: NOW - 9 * DAY }),
      item({ id: "old-undated", since: NOW - 5 * DAY }),
      item({ id: "new-undated", since: NOW - DAY }),
      item({ id: "due-later", dueTs: NOW + 2 * DAY }),
      item({ id: "due-soon", dueTs: NOW + DAY })
    ] } });
    expect(inbox.items.map((entry) => entry.id)).toEqual(["due-soon", "due-later", "old-undated", "new-undated", "advisory"]);
  });
});

/** P2-22 review timing: opt-in through a signed config, pseudonymous, exported as CSV by an owner only. */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resolveApiRolePolicy } from "../../src/api/accessPolicy.js";
import { signAmcConfig } from "../../src/config/amcConfigSignature.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { exportReviewTimingCsv, recordReviewTiming, ReviewTimingError, reviewTimingEnabled } from "../../src/operator/reviewTiming.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig } from "../../src/workspace.js";
import { createReviewTimer } from "../../src/console/assets/reviewTimer.js";

vi.setConfig({ testTimeout: 60_000 });
const EMAIL = "alice.reviewer@example.com";
let workspace: string;

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-timing-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

function enable(sign = true): void {
  saveAMCConfig(workspace, { ...loadAMCConfig(workspace), operator: { reviewTiming: { enabled: true } } });
  if (sign) signAmcConfig(workspace);
}

function timingRows(): string[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return (ledger.db.prepare("SELECT payload_inline, meta_json FROM evidence_events WHERE json_extract(meta_json, '$.auditType') = 'REVIEW_TIMING'").all() as
      Array<{ payload_inline: string; meta_json: string }>).map((row) => `${row.payload_inline}\n${row.meta_json}`);
  } finally {
    ledger.close();
  }
}

const refused = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof ReviewTimingError) return error.code; throw error; }
  return "accepted";
};

describe("review timing", () => {
  test("disabled by default: no event is written", () => {
    expect(reviewTimingEnabled(workspace)).toBe(false);
    expect(refused(() => recordReviewTiming({ workspace, subject: EMAIL, input: { event: "review_session_started", noticeAccepted: true, packetId: "rp_1" } })))
      .toBe("REVIEW_TIMING_DISABLED");
    expect(timingRows()).toEqual([]);
  });

  test("an unsigned or edited config does not turn it on", () => {
    enable(false);
    expect(reviewTimingEnabled(workspace)).toBe(false);
    enable(true);
    expect(reviewTimingEnabled(workspace)).toBe(true);
    writeFileSync(join(workspace, ".amc", "amc.config.yaml"), "operator:\n  reviewTiming:\n    enabled: true\n");
    expect(reviewTimingEnabled(workspace)).toBe(false);
  });

  test("enabled: pseudonyms only, no email in any event, and the CSV export", () => {
    enable();
    const t0 = Date.parse("2026-10-27T10:00:00.000Z");
    const { sessionId } = recordReviewTiming({ workspace, subject: EMAIL, nowTs: t0, input: { event: "review_session_started", noticeAccepted: true, packetId: "rp_aaaaaaaaaaaaaaaaaaaaaaaa" } });
    recordReviewTiming({ workspace, subject: EMAIL, nowTs: t0 + 1000, input: { event: "review_item_opened", sessionId, itemId: "results/control-results.json" } });
    recordReviewTiming({ workspace, subject: EMAIL, nowTs: t0 + 5000, input: { event: "review_item_decided", sessionId, itemId: "results/control-results.json",
      decision: "disputed", activeSeconds: 4 } });
    recordReviewTiming({ workspace, subject: EMAIL, nowTs: t0 + 9000, input: { event: "review_session_completed", sessionId, activeSeconds: 8 } });
    // Another reviewer cannot write into this session.
    expect(refused(() => recordReviewTiming({ workspace, subject: "bob@example.com", input: { event: "review_item_opened", sessionId, itemId: "x" } })))
      .toBe("REVIEW_SESSION_NOT_FOUND");

    const rows = timingRows();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).not.toContain("@");
      expect(row).not.toContain("alice");
    }
    if (process.env.AMC_P222_SAMPLE_DIR) writeFileSync(join(process.env.AMC_P222_SAMPLE_DIR, "sample-review-timing.csv"), exportReviewTimingCsv(workspace, t0 - 1, t0 + 60_000));
    const csv = exportReviewTimingCsv(workspace, t0 - 1, t0 + 60_000).trim().split("\n");
    expect(csv[0]).toBe("sessionId,reviewerPseudonym,packetId,itemId,decision,startedAt,completedAt,activeSeconds");
    expect(csv).toHaveLength(2);
    expect(csv[1]).toMatch(new RegExp(`^${sessionId},[0-9a-f]{64},rp_a{24},results/control-results.json,disputed,2026-10-27T10:00:00.000Z,2026-10-27T10:00:09.000Z,4$`));
    expect(exportReviewTimingCsv(workspace, t0 + 1, t0 + 60_000).trim().split("\n")).toHaveLength(1);
  });

  test("the export is owner-only; recording takes any human read role", () => {
    expect(resolveApiRolePolicy("/api/v1/operator/review-timing/export", "GET").roles).toEqual(["OWNER"]);
    expect(resolveApiRolePolicy("/api/v1/operator/review-timing/events", "POST").roles).toEqual(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]);
  });
});

describe("review timer", () => {
  test("pauses after 60 seconds on a hidden page and resumes when visible", () => {
    let now = 0;
    const timer = createReviewTimer({ now: () => now });
    now = 30_000;
    expect(timer.activeSeconds()).toBe(30);
    timer.setHidden(true);
    now = 30_000 + 45_000;
    expect(timer.activeSeconds()).toBe(75);
    now = 30_000 + 600_000;
    expect(timer.activeSeconds()).toBe(90);
    timer.setHidden(false);
    now += 10_000;
    expect(timer.activeSeconds()).toBe(100);
    expect(timer.lap()).toBe(100);
    now += 5_000;
    expect(timer.activeSeconds()).toBe(5);
  });
});

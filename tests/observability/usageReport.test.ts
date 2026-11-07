/** SH-OBS-02: `amc usage` over verified rows, per-request bucketing, unknowns kept unknown, tamper -> exit 2. */
import Database from "better-sqlite3";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildUsageReport, foldUsageReport } from "../../src/observability/usageReport.js";
import { readBudgetEvents } from "../../src/budgets/nativeBudgetUsage.js";
import { parseSince, registerUsageCommand } from "../../src/cli-usage-commands.js";
import type { EvidenceEvent } from "../../src/types.js";
import { allEvents, removeWorkspace, runStubSession, stubWorkspace } from "./helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 120_000 });
let ws: string;
const cwd = process.cwd();
beforeEach(() => { ws = stubWorkspace("amc-usage-"); });
afterEach(() => { process.chdir(cwd); process.exitCode = undefined; vi.restoreAllMocks(); removeWorkspace(ws); });

/** Rewrite one stub request pair as a provider request with reported usage, for the pure fold (signatures are not re-checked there). */
function withReportedUsage(rows: readonly EvidenceEvent[], headerId: string, ts: number, model: string): EvidenceEvent[] {
  return rows.map((row) => {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    if (row.id === headerId) {
      const route = meta.physicalRoute && typeof meta.physicalRoute === "object" ? { physicalRoute: { ...(meta.physicalRoute as Record<string, unknown>), providerId: "anthropic", model } } : {};
      return { ...row, ts, meta_json: JSON.stringify({ ...meta, providerId: "anthropic", model, ...route }) };
    }
    if ((row.event_type === "request/response") && meta.headerEventId === headerId) {
      return { ...row, meta_json: JSON.stringify({ ...meta, providerId: "anthropic", dispatchAttempted: true, durationMs: 120,
        usage: { reported: true, complete: true, inputTokens: 10, outputTokens: 5, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null } }) };
    }
    return row;
  });
}

describe("usage report", () => {
  it("reports stub sessions as synthetic with unreported tokens and unavailable cost; buckets per request by day and model", async () => {
    await runStubSession(ws, "one");
    await runStubSession(ws, "two");
    const rows = readBudgetEvents(ws);
    const now = Date.now();
    const byModel = foldUsageReport(rows, { since: now - 3_600_000, until: now + 1_000, by: "model" }, "signed-rows (unanchored)");
    expect(byModel.buckets.map((bucket) => bucket.key)).toEqual(["stub/amc-stub-1"]);
    const stub = byModel.buckets[0]!;
    expect(stub.requests).toBe(2);
    expect(stub.syntheticRequests).toBe(2);
    expect(stub.reportedRequests).toBe(0);
    expect(stub.tokens.inputTokens.observedTokens, "stub zeros are not observations").toBeNull();
    expect(stub.cost.status).toBe("unavailable");
    expect(stub.cost.unknownRequests).toBe(2);
    expect(stub.latency.measuredRequests).toBe(2);

    // A request rewritten to a reporting provider on another local day lands in its own day and model buckets.
    const headers = rows.filter((row) => row.event_type === "request/header");
    const yesterday = now - 86_400_000;
    const edited = withReportedUsage(rows, headers[0]!.id, yesterday, "claude-x");
    const byDay = foldUsageReport(edited, { since: now - 2 * 86_400_000, until: now + 1_000, by: "day" }, "signed-rows (unanchored)");
    expect(byDay.buckets).toHaveLength(2);
    const [earlier, today] = byDay.buckets;
    expect(earlier!.tokens.inputTokens.observedTokens).toBe(10);
    expect(earlier!.tokens.outputTokens.observedTokens).toBe(5);
    expect(earlier!.tokens.cacheReadTokens.observedTokens, "an unreported component stays unreported").toBeNull();
    expect(earlier!.reportedRequests).toBe(1);
    expect(earlier!.latency.p50Ms).toBe(120);
    expect(today!.syntheticRequests).toBe(1);
    expect(byDay.totals.tokens.inputTokens.observedTokens).toBe(10);
    const models = foldUsageReport(edited, { since: 0, until: now + 1_000, by: "model" }, "signed-rows (unanchored)").buckets.map((bucket) => bucket.key);
    expect(models).toEqual(["anthropic/claude-x", "stub/amc-stub-1"]);
    // Window filter is by header timestamp: the rewritten request falls out of a window starting today.
    expect(foldUsageReport(edited, { since: now - 3_600_000, until: now + 1_000, by: "model" }, "signed-rows (unanchored)").buckets.map((b) => b.key)).toEqual(["stub/amc-stub-1"]);
  });

  it("withholds totals of a bucket holding an invalid request", async () => {
    await runStubSession(ws, "one");
    const rows = readBudgetEvents(ws);
    const header = rows.find((row) => row.event_type === "request/header")!;
    const edited = withReportedUsage(rows, header.id, header.ts, "claude-x").map((row) => {
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      return row.event_type === "request/response" && meta.headerEventId === header.id ? { ...row, meta_json: JSON.stringify({ ...meta, dispatchAttempted: "yes" }) } : row;
    });
    const report = foldUsageReport(edited, { since: 0, until: Date.now() + 1_000, by: "model" }, "signed-rows (unanchored)");
    expect(report.buckets[0]!.invalidRequests).toBe(1);
    expect(report.buckets[0]!.tokens.inputTokens.observedTokens).toBeNull();
    expect(report.buckets[0]!.cost.status).toBe("invalid");
  });

  it("`amc usage` exits 2 and prints no table when a signed row was tampered with; --json otherwise round-trips", async () => {
    await runStubSession(ws, "one");
    const program = new Command();
    registerUsageCommand(program);
    const logs: string[] = [], errors: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { errors.push(args.join(" ")); });
    process.chdir(ws);
    await program.parseAsync(["usage", "--by", "provider", "--json"], { from: "user" });
    const report = JSON.parse(logs.join("\n")) as { schema: string; verification: string; buckets: Array<{ key: string; syntheticRequests: number }> };
    expect(report.schema).toBe("amc.usage-report/v1");
    expect(report.verification).toBe("signed-rows (unanchored)");
    expect(report.buckets).toEqual([expect.objectContaining({ key: "stub", syntheticRequests: 2 })]);
    expect(process.exitCode).toBeUndefined();

    const target = allEvents(ws).find((row) => row.event_type === "request/header")!;
    const db = new Database(join(ws, ".amc", "evidence.sqlite"));
    db.prepare("UPDATE evidence_events SET writer_sig = 'forged' WHERE id = ?").run(target.id);
    db.close();
    logs.length = 0;
    await program.parseAsync(["usage"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(logs).toHaveLength(0);
    expect(errors.join("\n")).toContain("did not verify");
  });

  it("parses relative and absolute windows", () => {
    const now = 1_700_000_000_000;
    expect(parseSince("7d", now)).toBe(now - 7 * 86_400_000);
    expect(parseSince("30m", now)).toBe(now - 30 * 60_000);
    expect(parseSince("2024-01-01T00:00:00Z", now)).toBe(Date.parse("2024-01-01T00:00:00Z"));
    expect(() => parseSince("soon", now)).toThrow(/Cannot parse/);
  });

  it("buildUsageReport refuses a wrong monitor pin", async () => {
    await runStubSession(ws, "one");
    expect(() => buildUsageReport({ workspace: ws, since: 0, until: Date.now() + 1_000, by: "day", expectedMonitorFingerprint: "0".repeat(64) })).toThrow(/pin/);
  });
});

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/assurance/agentResponder.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/assurance/agentResponder.js")>();
  return { ...original, resolveAgentResponder: vi.fn(async () => { throw new original.AgentResponderUnavailableError("no agent at https://user:secret@host/path?api_key=abc", "connect one"); }) };
});

const { initAssurancePolicy } = await import("../src/assurance/assurancePolicyStore.js");
const { assuranceSchedulerSetEnabled, assuranceSchedulerStatus, assuranceSchedulerTick } = await import("../src/assurance/assuranceScheduler.js");
const { openLedger } = await import("../src/ledger/ledger.js");
const { initWorkspace } = await import("../src/workspace.js");

/** UX-30: an idle Studio with no agent to test writes no "assurance run aborted" record, and does not ask again every minute. */
const dirs: string[] = [];
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const auditRows = (dir: string): string[] => {
  const ledger = openLedger(dir, { readonly: true });
  try {
    return (ledger.db.prepare("SELECT meta_json FROM evidence_events").all() as Array<{ meta_json: string }>)
      .map((row) => String(JSON.parse(row.meta_json).auditType ?? "")).filter((type) => type.startsWith("ASSURANCE_RUN"));
  } finally {
    ledger.close();
  }
};

describe("assurance scheduler with no agent to test", () => {
  it("records no run, skips with the reason in words, and waits a full cadence", async () => {
    process.env["AMC_VAULT_PASSPHRASE"] ??= "assurance-no-agent";
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-assurance-no-agent-")));
    dirs.push(dir);
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    initAssurancePolicy(dir);
    assuranceSchedulerSetEnabled({ workspace: dir, enabled: true });
    const first = await assuranceSchedulerTick({ workspace: dir, workspaceReady: true });
    expect(first).toEqual({ ran: false, reason: "no_agent" });
    expect(auditRows(dir)).toEqual([]);
    const state = assuranceSchedulerStatus(dir).state;
    expect(state.lastOutcome).toEqual({ status: "SKIPPED", reason: "no_agent" });
    const served = JSON.stringify(assuranceSchedulerStatus(dir));
    for (const leak of ["secret", "api_key", "user:", "host/path"]) expect(served).not.toContain(leak);
    expect(state.nextRunTs).toBeGreaterThan(Date.now() + 60_000);
    expect(await assuranceSchedulerTick({ workspace: dir, workspaceReady: true })).toEqual({ ran: false, reason: "not_due" });
  });
});

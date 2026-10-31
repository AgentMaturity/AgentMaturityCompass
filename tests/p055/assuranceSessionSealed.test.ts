/** P0-55 case 5: startAssuranceSession commits the session and ASSURANCE_RUN_STARTED together, so a failed first row leaves no session. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startAssuranceSession } from "../../src/assurance/evidenceWriters.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";

let root: string;
let workspace: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "amc-p055-assurance-"));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

test("appendEvidence throwing leaves no sessions row (never an unsealed session)", () => {
  const ledger = openLedger(workspace);
  try {
    const count = () => (ledger.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE binary_path = 'amc-assurance-runner'").get() as { n: number }).n;
    vi.spyOn(ledger, "appendEvidence").mockImplementation(() => { throw new Error("first row failed"); });
    expect(() => startAssuranceSession({ ledger, mode: "supervise", agentId: "default", packIds: ["injection"], trustTier: "OBSERVED" }))
      .toThrow("first row failed");
    expect(count()).toBe(0);
    expect(ledger.db.inTransaction).toBe(false);
    vi.restoreAllMocks();
    const id = startAssuranceSession({ ledger, mode: "supervise", agentId: "default", packIds: ["injection"], trustTier: "OBSERVED" });
    expect(count()).toBe(1);
    ledger.sealSession(id);
  } finally { ledger.close(); }
});

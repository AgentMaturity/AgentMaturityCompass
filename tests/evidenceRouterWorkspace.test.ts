import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvidenceRoute } from "../src/api/evidenceRouter.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { callRoute } from "./helpers/routeCall.js";

/** The evidence routes over a real workspace with nothing recorded yet: empty answers, and each refusal in its own status. */
let workspace: string;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "evidence-router-workspace");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-evidence-router-")));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });
const call = (method: string, url: string, body?: unknown) => callRoute(handleEvidenceRoute, workspace, method, url, body);

describe("evidence routes over a fresh workspace", () => {
  it("leaves other paths and unknown evidence paths to the next router", async () => {
    expect((await call("GET", "/api/v1/score")).handled).toBe(false);
    expect((await call("DELETE", "/api/v1/evidence/list")).handled).toBe(false);
  });

  it("gaps: none without runs, none for an empty runs folder, and 500 for a run that does not exist", async () => {
    const runsDir = getAgentPaths(workspace, "agent-x").runsDir;
    expect((await call("GET", "/api/v1/evidence/gaps?agentId=agent-x")).json?.data).toEqual({ agentId: "agent-x", gaps: [], total: 0, note: "No runs found" });
    mkdirSync(runsDir, { recursive: true });
    expect((await call("GET", "/api/v1/evidence/gaps?agentId=agent-x")).json?.data).toEqual({ agentId: "agent-x", gaps: [], total: 0 });
    expect((await call("GET", "/api/v1/evidence/gaps?runId=run-missing")).status).toBe(500);
  });

  it("each record looked up by an unknown selector is a 404, not a 500", async () => {
    for (const kind of ["episodes", "decisions", "trace-indexes", "observability", "finding-proofs", "lifecycle-receipts"]) {
      const found = await call("GET", `/api/v1/evidence/${kind}/no-such-record?agentId=default`);
      expect([kind, found.handled, found.status, found.json?.ok]).toEqual([kind, true, 404, false]);
    }
  });

  it("refuses a write without its required fields, in words", async () => {
    const refusals: Array<[string, unknown, string]> = [
      ["/api/v1/evidence/decisions/observe", {}, "runId required"],
      ["/api/v1/evidence/ingest", { type: "generic_json" }, "type and content required"],
      ["/api/v1/evidence/collect", { type: "generic_json" }, "inputPath and type required"],
      ["/api/v1/evidence/attest", { ingestSessionId: "ing-1" }, "attestedBy and statement are required to attest"],
      ["/api/v1/evidence/bundle", {}, "runId required for bundle"]
    ];
    for (const [url, body, error] of refusals) {
      const refused = await call("POST", url, body);
      expect([url, refused.status, refused.json?.error]).toEqual([url, 400, error]);
    }
  });

  it("a write naming a run or a path that is not there fails as a server error, never as a success", async () => {
    for (const [url, body] of [
      ["/api/v1/evidence/decisions/observe", { runId: "run-missing" }],
      ["/api/v1/evidence/collect", { inputPath: join(workspace, "no-such-folder"), type: "generic_json" }],
      ["/api/v1/evidence/bundle", { runId: "run-missing" }]
    ] as const) {
      const failed = await call("POST", url, body);
      expect([url, failed.status, failed.json?.ok]).toEqual([url, 500, false]);
    }
  });
});

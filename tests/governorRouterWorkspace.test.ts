import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleGovernorRoute } from "../src/api/governorRouter.js";
import { ACTION_CLASSES } from "../src/governor/actionCatalog.js";
import { defaultActionPolicy, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { explainGovernorAction } from "../src/governor/governorCli.js";
import { initWorkspace } from "../src/workspace.js";
import { initWorkspaceWithoutActionPolicy, removeActionPolicy } from "./helpers/actionPolicyFixtures.js";
import { callRoute } from "./helpers/routeCall.js";

/** The Governor routes over a real workspace (no mocked governor): the outcomes grid, explain, the report, and refusals. */
const dirs: string[] = [];
let workspace: string;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "governor-router-workspace");
  workspace = scratch();
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function scratch(): string { const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-gov-router-"))); dirs.push(dir); return dir; }

const call = (method: string, url: string, body?: unknown, ws = workspace) => callRoute(handleGovernorRoute, ws, method, url, body);

describe("Governor routes over a real workspace", () => {
  it("leaves other paths and unknown governor paths to the next router", async () => {
    expect((await call("GET", "/api/v1/score")).handled).toBe(false);
    expect((await call("DELETE", "/api/v1/governor/report")).handled).toBe(false);
  });

  it("outcomes: every action class is listed under the signed policy", async () => {
    const { status, json } = await call("GET", "/api/v1/governor/outcomes?agentId=default");
    expect(status).toBe(200);
    expect(json!.data.agentId).toBe("default");
    expect(json!.data.policy).toBe("signed");
    expect(json!.data.outcomes.map((row: { actionClass: string }) => row.actionClass)).toEqual([...ACTION_CLASSES]);
  });

  it("outcomes: a workspace that never had a policy says so for every class", async () => {
    const bare = scratch();
    initWorkspaceWithoutActionPolicy({ workspacePath: bare, trustBoundaryMode: "isolated" });
    const { status, json } = await call("GET", "/api/v1/governor/outcomes", undefined, bare);
    expect(status).toBe(200);
    expect(json!.data.policy).toBe("not configured");
    expect(new Set(json!.data.outcomes.map((row: { outcome: string }) => row.outcome))).toEqual(new Set(["no signed policy"]));
  });

  it("check: refuses a request missing a field, and decides a SIMULATE request", async () => {
    const missing = await call("POST", "/api/v1/governor/check", { action: "WRITE_LOW", risk: "low" });
    expect(missing.status).toBe(400);
    expect(missing.json!.error).toBe("Required: action, risk, mode");
    const decided = await call("POST", "/api/v1/governor/check", { action: "read_only", risk: "low", mode: "simulate" });
    expect(decided.status).toBe(200);
    expect(decided.json!.data.effectiveMode).toBe("SIMULATE");
  });

  it("explain: refuses a request without an action, and returns the signed rule for a class", async () => {
    expect((await call("POST", "/api/v1/governor/explain", {})).json!.error).toBe("Required: action");
    const { status, json } = await call("POST", "/api/v1/governor/explain", { action: "deploy" });
    expect(status).toBe(200);
    expect(json!.data).toMatchObject({ actionClass: "DEPLOY", exists: true, rule: { actionClass: "DEPLOY" } });
  });

  it("explain: a class without a rule in the signed policy says the policy default applies", () => {
    const policy = defaultActionPolicy();
    policy.actions = policy.actions.filter((rule) => rule.actionClass !== "FINANCIAL");
    initActionPolicy(workspace, policy);
    expect(explainGovernorAction({ workspace, actionClass: "FINANCIAL" })).toEqual({ actionClass: "FINANCIAL", exists: false, details: "No explicit rule. Policy default applies." });
  });

  it("explain and report answer 500 when the workspace has no policy to read", async () => {
    removeActionPolicy(workspace);
    expect((await call("POST", "/api/v1/governor/explain", { action: "READ_ONLY" })).status).toBe(500);
    expect((await call("GET", "/api/v1/governor/report")).status).toBe(500);
  });

  it("report: the governor matrix as JSON, and as markdown on request", async () => {
    const asJson = await call("GET", "/api/v1/governor/report?agentId=default");
    expect(asJson.status).toBe(200);
    expect(asJson.json!.data.markdown).toContain("READ_ONLY");
    expect(typeof asJson.json!.data.autonomyAllowanceIndex).toBe("number");
    const asMd = await call("GET", "/api/v1/governor/report?format=md");
    expect(asMd.status).toBe(200);
    expect(asMd.headers["Content-Type"]).toBe("text/markdown; charset=utf-8");
    expect(asMd.body).toBe(asJson.json!.data.markdown);
  });

  it("oversight needs an agent id; mode refuses anything but owner or agent, and keeps what was set", async () => {
    expect((await call("GET", "/api/v1/oversight/assess")).json!.error).toBe("Required query param: agentId");
    expect((await call("PUT", "/api/v1/mode", { mode: "root" })).json!.error).toBe("Required: mode (owner | agent)");
    expect((await call("PUT", "/api/v1/mode", { mode: "agent" })).json!.data).toEqual({ mode: "agent" });
    expect((await call("GET", "/api/v1/mode")).json!.data).toEqual({ mode: "agent" });
  });
});

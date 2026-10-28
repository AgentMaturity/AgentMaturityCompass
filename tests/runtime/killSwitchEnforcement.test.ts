/** P2-26 slice B at the pipeline: a kill refuses a consequential call with a receipt, keeps reads, and break-glass cannot override it. */
import { afterEach, describe, expect, test } from "vitest";
import { activateBreakGlass, requestBreakGlass } from "../../src/governor/breakGlass.js";
import { activateKillSwitch } from "../../src/runtime/killSwitch.js";
import { AGENT, CONTROL, OWNER, REFUND, cleanupGovernanceFixtures, decideBound, governanceFixture, issueRefundException, loginAs, type GovernanceFixture } from "../governor/governanceFixture.js";

afterEach(() => cleanupGovernanceFixtures());

const kill = (f: GovernanceFixture) => activateKillSwitch({ workspace: f.workspace, issuedBy: "fixture-owner",
  scope: { kind: "workspace", id: "workspace" }, mode: "stop_new_effects", reason: "P2-26 fixture", incidentId: "inc-fixture" });
const deniedRows = (f: GovernanceFixture) => (f.ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE meta_json LIKE '%TOOL_CALL_DENIED%'").all() as
  Array<{ meta_json: string }>).filter((row) => row.meta_json.includes("kill_switch_active"));

describe("kill switch at the authorization stage", () => {
  test("a workspace kill denies a consequential fixture action with a receipt; nothing reaches the body", async () => {
    const f = governanceFixture();
    await issueRefundException(f.workspace);
    expect((await f.execute()).denied, "the fixture call runs before the kill").toBeNull();
    f.bodies.length = 0;
    await kill(f);
    const outcome = await f.execute();
    expect(outcome.denied?.stage).toBe("authorization");
    expect(outcome.denied?.reason).toContain("kill_switch_active");
    expect(f.bodies).toHaveLength(0);
    expect(deniedRows(f).length).toBe(1);
  });

  test("break-glass during a kill is refused", async () => {
    const f = governanceFixture();
    const oncall = loginAs(f.workspace, "fixture-oncall", ["OPERATOR"]);
    const { draft, approval } = await requestBreakGlass(f.workspace, { sessionTokenFile: oncall.tokenFile, reason: "payment processor outage needs manual refunds",
      scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL"], controlIds: [CONTROL] }, ttlMs: 3600_000 });
    decideBound(f.workspace, approval, [OWNER]);
    await activateBreakGlass(f.workspace, draft.breakGlassId, approval);
    await kill(f);
    const outcome = await f.execute();
    expect(outcome.denied?.reason).toContain("kill_switch_active");
    expect(f.bodies).toHaveLength(0);
  });
});

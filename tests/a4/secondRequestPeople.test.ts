/**
 * studio-ui inherit slice: once a step's own approval has its quorum, the panel waits on a second request (Assemble's
 * apply, Adapt's plan activation, Activate's release). Readiness names no people, so the panel holds a place that a4.js
 * fills from GET /approvals/requests/:id/view (the read that writes nothing), drawn as people like the Approvals page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import { approvalPeopleHtml } from "../../src/console/assets/dailyView.js";

// The step each stage is at while its second request waits (src/a4/a4Gates.ts: a gate's quorum does not move the step;
// consuming it does): Assemble's apply and Adapt's plan activation open on the completion gate, at "reviewed"; Activate's
// release opens on the direction gate (src/a4/spec/activate.ts, release_effect) and consumes it, so the step is "proposed".
const STEP: Record<string, string> = { assemble: "reviewed", adapt: "reviewed", activate: "proposed" };
const GATE: Record<string, string> = { reviewed: "completion", proposed: "direction" };
const readiness = (code: string, status: string, step: string) => ({ status: "WAITING", allowed: {},
  gates: { [GATE[step] ?? "completion"]: { gateId: "g7", status: "QUORUM_MET", required: 2, approvals: 2,
    decisions: [{ decisionId: "d1", username: "first", decision: "APPROVE" }] } },
  items: [{ id: code, status: "WAITING", mandatory: false, reasonCodes: ["APPROVAL_REQUEST:r9:d1", `APPROVAL_STATUS:${status}`], acknowledged: null, nextAction: null }] });
const ctx = (stage: string, code: string, status = "PENDING", step = STEP[stage] ?? "reviewed") => ({ stage,
  project: { projectId: "a4p_1", agentId: "helper", stage, step, hold: false, members: [] },
  gates: [{ gateId: "g7", excludedKeys: [] }], members: { candidates: [] }, questions: [], readiness: readiness(code, status, step),
  me: { userId: "u2", username: "second", roles: ["APPROVER"] }, allowed: { requestChanges: { allowed: true, reasonCodes: [] } } });

describe("a second request's people in the A4 panel", () => {
  test("the pending second request of each stage is named; a decided one is not", () => {
    expect(start.pendingSecondRequest(ctx("assemble", "effect_gate") as never)).toBe("r9");
    expect(start.pendingSecondRequest(ctx("adapt", "plan_review_opened") as never)).toBe("r9");
    expect(start.pendingSecondRequest(ctx("activate", "release_effect") as never)).toBe("r9");
    expect(start.pendingSecondRequest(ctx("assemble", "effect_gate", "QUORUM_MET") as never)).toBe("");
    expect(start.pendingSecondRequest(ctx("assemble", "plan_review_opened") as never)).toBe("");
  });

  test("the panel holds a place for the second request's people at the step each stage is really at", () => {
    for (const [stage, code] of [["assemble", "effect_gate"], ["adapt", "plan_review_opened"], ["activate", "release_effect"]]) {
      const html = start.renderStartHere(ctx(stage, code) as never);
      expect(html, stage).toContain('data-a4-second="r9"');
      // The first approval's people are only a hidden fallback for a failed read of the second request.
      expect(html.replace(/<div hidden data-a4-second-fallback>[\s\S]*?<\/div><\/div>/, ""), stage).not.toContain('aria-label="Who approves"');
    }
    // Activate's release before its plan is proposed: no gate and no second request yet, so no place either.
    expect(start.renderStartHere(ctx("activate", "release_effect", "PENDING", "asked") as never)).not.toContain("data-a4-second");
  });

  test("Activate shows the plan approval's people as the fallback; a failed read reveals it", () => {
    const html = start.renderStartHere(ctx("activate", "release_effect") as never);
    expect(html).toMatch(/<div hidden data-a4-second-fallback><ul class="a4-people-row" aria-label="Who approves">[\s\S]*first/);
    expect(readFileSync("src/console/assets/a4.js", "utf8")).toMatch(/\.catch\(\(\) => root\?\.querySelector\(`\[data-a4-second="[^`]*\] \[data-a4-second-fallback\]`\)\?\.removeAttribute\("hidden"\)\)/);
  });

  test("a4.js fills it from the read that writes nothing, drawn as people", () => {
    const a4 = readFileSync("src/console/assets/a4.js", "utf8");
    expect(a4).toContain("apiGet(`/approvals/requests/${encodeURIComponent(id)}/view`)");
    expect(a4).not.toMatch(/apiGet\(`\/approvals\/requests\/\$\{encodeURIComponent\(id\)\}`\)/);
    const people = approvalPeopleHtml({ status: "PENDING", quorum: { required: 2, received: 1 } },
      { decisions: [{ username: "third", decision: "APPROVE_EXECUTE", authentication: "authenticated" }], request: { rolesAllowed: ["APPROVER"] } });
    expect(people).toContain("third");
    expect(people).toContain("An approver");
    expect(people).toContain("1 of 2 approvals");
  });
});

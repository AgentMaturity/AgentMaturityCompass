/**
 * studio-ui inherit slice: once a step's own approval has its quorum, the panel waits on a second request (Assemble's
 * apply, Adapt's plan activation, Activate's release). Readiness names no people, so the panel holds a place that a4.js
 * fills from GET /approvals/requests/:id/view (the read that writes nothing), drawn as people like the Approvals page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import { approvalPeopleHtml } from "../../src/console/assets/dailyView.js";

const readiness = (code: string, status: string) => ({ status: "WAITING", allowed: {}, gates: { completion: { gateId: "g7", status: "QUORUM_MET" } },
  items: [{ id: code, status: "WAITING", mandatory: false, reasonCodes: ["APPROVAL_REQUEST:r9:d1", `APPROVAL_STATUS:${status}`], acknowledged: null, nextAction: null }] });
const ctx = (stage: string, code: string, status = "PENDING") => ({ stage, project: { projectId: "a4p_1", agentId: "helper", stage, step: "reviewed", hold: false, members: [] },
  gates: [{ gateId: "g7", excludedKeys: [] }], members: { candidates: [] }, questions: [], readiness: readiness(code, status),
  me: { userId: "u2", username: "second", roles: ["APPROVER"] }, allowed: { requestChanges: { allowed: true, reasonCodes: [] } } });

describe("a second request's people in the A4 panel", () => {
  test("the pending second request of each stage is named; a decided one is not", () => {
    expect(start.pendingSecondRequest(ctx("assemble", "effect_gate") as never)).toBe("r9");
    expect(start.pendingSecondRequest(ctx("adapt", "plan_review_opened") as never)).toBe("r9");
    expect(start.pendingSecondRequest(ctx("activate", "release_effect") as never)).toBe("r9");
    expect(start.pendingSecondRequest(ctx("assemble", "effect_gate", "QUORUM_MET") as never)).toBe("");
    expect(start.pendingSecondRequest(ctx("assemble", "plan_review_opened") as never)).toBe("");
  });

  test("the panel holds a place for the second request's people instead of the first approval's", () => {
    const html = start.renderStartHere(ctx("assemble", "effect_gate") as never);
    expect(html).toContain('data-a4-second="r9"');
    expect(html).not.toContain('aria-label="Who approves"');
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

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/** H3: console actions never leave an uncaught rejection, and write controls are gated by the session's roles. */
const app = readFileSync("src/console/assets/app.js", "utf8");

test("every app.js click handler outside the approvals view is bound through onAction", () => {
  const outsideApprovals = app.slice(0, app.indexOf("async function renderApprovals()")) + app.slice(app.indexOf("async function renderUsers()"));
  expect(outsideApprovals.match(/addEventListener\("click"/g) ?? []).toHaveLength(0);
  expect(app).toContain("function onAction(target, type, handler)");
});

test("write controls the VIEWER role cannot use carry data-roles", () => {
  for (const id of ["applyBudgets", "issueLeaseBtn", "firewallEnable", "evidenceSnapshot", "evidenceRunScore", "addUserBtn"]) {
    expect(app, id).toMatch(new RegExp(`id="${id}" data-roles="OWNER`));
  }
  expect(app).toContain('data-apply="${pack.id}" data-roles="OWNER"');
  expect(readFileSync("src/console/assets/standard.js", "utf8")).toContain('id="standardGenerateBtn" data-roles="OWNER"');
  expect(readFileSync("src/console/assets/equalizer.js", "utf8")).toContain('id="targetsApplyBtn" data-roles="OWNER"');
  expect(readFileSync("src/console/assets/api.js", "utf8")).toContain("export function applyRoleGates");
});

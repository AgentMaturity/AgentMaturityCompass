import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  approvalCardHtml, approvalPeopleHtml, approvalRoute, gapListHtml, layerBarsHtml, packCatalogHtml, runCardsHtml, scoreDialHtml, surfaceTilesHtml
} from "../../src/console/assets/dailyView.js";

// studio-ui slice "daily": the score is drawn in ink with its labels, approvals show people, packs sit under stations.

test("the score dial is ink with its labels: no accent, no tick, the number and the trust label in words", () => {
  const html = scoreDialHtml(2.25, { notes: ["UNRELIABLE — DO NOT USE FOR CLAIMS", "No accepted evidence"] });
  expect(html).toContain('<strong class="dial-value">2.3</strong>');
  expect(html).toContain("UNRELIABLE — DO NOT USE FOR CLAIMS");
  expect(html).not.toMatch(/accent|is-done|class="icon"/);
  expect(scoreDialHtml(9)).toContain(">5.0<"); // a value off the scale is drawn at its end, never past it
  const bars = layerBarsHtml([{ layerName: "<b>Skills</b>", avgFinalLevel: 2.5 }]);
  expect(bars).toContain("width:50.0%");
  expect(bars).toContain("&lt;b&gt;Skills&lt;/b&gt;");
  const css = readFileSync("src/console/assets/styles.css", "utf8");
  expect(css).toMatch(/\.bar-fill \{[^}]*background: var\(--ink\)/);
  expect(css).toMatch(/\.dial-needle \{[^}]*stroke: var\(--ink\)/);
});

test("gaps read as the question's name and its two levels; every suggestion stays one click away", () => {
  const report = {
    recommendationControls: [{ questionId: "AMC-2.15", action: "AMC-2.15 (Delegation Trust Chain Verification): raise from 0 to 2 by adding evidence." }],
    prioritizedUpgradeActions: ["AMC-2.15 (Delegation Trust Chain Verification): raise from 0 to 2 by adding evidence.", "AMC-1.1 (x): raise from 1 to 2."]
  };
  const html = gapListHtml(report);
  expect(html).toContain('<span class="gap-title">Delegation Trust Chain Verification</span>');
  expect(html).toContain("Level 0 now, next 2");
  expect(html).toContain("All suggestions (2)");
  expect(gapListHtml({})).toBe("");
});

test("an approval request shows its path in words and its people as initials, escaped", () => {
  expect(approvalRoute("PENDING")).toContain(">Waiting<");
  expect(approvalRoute("DENIED")).toMatch(/is-stop[^>]*>.*Turned down/);
  expect(approvalRoute("EXPIRED")).toContain(">Expired<");
  expect(approvalRoute("CONSUMED")).toContain(">Used<");
  const row = { approvalRequestId: "apprreq_1", status: "PENDING", actionClass: "SECURITY", riskTier: "high", agentId: "default", quorum: { required: 2, received: 1 } };
  const detail = { decisions: [{ username: "<img src=x>", decision: "APPROVE_EXECUTE" }], request: { rolesAllowed: ["OWNER", "AUDITOR"] } };
  const people = approvalPeopleHtml(row, detail);
  expect(people).toContain('<li class="a4-person is-done">');
  expect(people).toContain("&lt;img src=x&gt;");
  expect(people).not.toContain("<img");
  expect(people).toContain("not decided yet");
  expect(people).toContain("1 of 2 approvals. Who may decide: owner or auditor.");
  // Once decided, no count that could disagree with the people shown.
  expect(approvalPeopleHtml({ ...row, status: "EXPIRED", quorum: { required: 2, received: 0 } }, detail)).not.toContain("of 2 approvals");
  const card = approvalCardHtml(row, { controls: '<button data-approve="apprreq_1">Approve</button>', href: "./approvals?approval=apprreq_1" });
  expect(card).toContain('data-approve="apprreq_1"');
  expect(card).toContain("Security settings");
});

test("surfaces draw their state as a dot and words, never a tick; runs and packs carry their own words", () => {
  const tiles = surfaceTilesHtml([{ surface: "Vault", headline: "Keep a record" }], ["Vault"], { Vault: { status: "COMPLETE" } });
  expect(tiles).toContain("Complete");
  expect(tiles).not.toContain("route-dot");
  expect(surfaceTilesHtml([], ["Watch"], {})).toContain("Not run yet");
  const runs = runCardsHtml([{ runId: "r<1>", status: "degraded", currentStage: "s", eventCount: 2 }]);
  expect(runs).toContain("Needs a look");
  expect(runs).toContain("r&lt;1&gt;");
  const packs = packCatalogHtml([
    { packId: "a", name: "A", domain: "health", riskLevel: "critical", questionCount: 3, description: "First part — the rest" },
    { packId: "b", name: "B", domain: "wealth", riskLevel: "high", questionCount: 4, description: "x" }
  ]);
  expect(packs).toMatch(/data-station="health"[^>]*>.*Health<\/span><small>1<\/small>/s);
  expect(packs).toContain(">First part<");
  expect(packs).toContain('data-industry-pack="a"');
  expect(packs).not.toContain("governance");
});

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  approvalCardHtml, approvalPeopleHtml, approvalRoute, approvalSubHtml, gapListHtml, layerBarsHtml, packCatalogHtml, runCardsHtml, scoreDialHtml, surfaceTilesHtml
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
  const detail = { decisions: [{ username: "<img src=x>", decision: "APPROVE_EXECUTE", authentication: "authenticated" }], request: { rolesAllowed: ["OWNER", "AUDITOR"] } };
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
  expect(surfaceTilesHtml([], ["Watch"], {})).toContain("Not done yet");
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

test("pack cards wait for a field to be picked; All shows every one", () => {
  const html = packCatalogHtml([{ packId: "a", name: "A", domain: "health", questionCount: 1 }]);
  expect(html).toContain('<article class="pack-card" hidden data-station="health">');
  expect(html).toMatch(/data-station="" aria-pressed="false"/);
});

test("an approval that does not count is never drawn as an approval; a card says what the request would run and when", () => {
  const row = { approvalRequestId: "apprreq_2", status: "PENDING", actionClass: "SECURITY", riskTier: "high", agentId: "default", quorum: { required: 2, received: 0 }, createdTs: Date.UTC(2026, 10, 18, 9, 30) };
  const people = approvalPeopleHtml(row, { decisions: [{ username: "sam", decision: "APPROVE_EXECUTE", authentication: "self-asserted" }] });
  expect(people).not.toContain("is-done");
  expect(people).toContain("does not count (not signed in)");
  expect(people.match(/not decided yet/g)).toHaveLength(2); // two open places, and the uncounted person is not a third approval
  expect(approvalPeopleHtml(row, { decisions: [{ username: "kim", decision: "DENY", authentication: "self-asserted" }] })).toContain("is-stop");
  const sub = approvalSubHtml(row, { request: { toolName: "audit.binder.export", intentId: "audit-<x>" } });
  expect(sub).toContain("<code>audit.binder.export</code>");
  expect(sub).toContain("Asked ");
  expect(sub).toContain('title="Intent audit-&lt;x&gt;"');
  expect(sub).toContain("High risk, agent default");
  expect(approvalCardHtml(row)).toContain("Asked ");
  const runs = runCardsHtml([{ runId: "r", status: "running", currentStage: "gateway.connected" }]);
  expect(runs).toContain("Last step: gateway connected");
  expect(runs).not.toContain("Stage gateway.connected");
});

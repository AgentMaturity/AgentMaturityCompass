import { expect, test } from "vitest";
import { renderDiagnosticViewPage } from "../../src/console/assets/diagnosticView.js";

// The diagnostic page in the route style: a short picture summary on top, every area folded, the same cards and filters.

const rendered = {
  // Studio sends a dimension's id as `id` (the page also takes `dimensionId`).
  dimensions: [{ id: 2, name: "Skills" }, { dimensionId: 1, name: "<b>Strategy</b>" }],
  questions: [
    { qId: "AMC-1.1", dimensionId: 1, title: "Goals", howThisApplies: "x", ownerTarget: 3, tailoredEvidenceExamples: [] },
    { qId: "AMC-1.2", dimensionId: 1, title: "Plan", howThisApplies: "y", ownerTarget: null, tailoredEvidenceExamples: [] },
    { qId: "AMC-2.1", dimensionId: 2, title: "Tools", howThisApplies: "z", ownerTarget: 2, tailoredEvidenceExamples: [] }
  ]
};
const auto = {
  runId: "run-12345678-abc",
  integrityIndex: 0.5,
  questions: [
    { questionId: "AMC-1.1", measuredScore: 2, confidenceControls: { uncertaintyLevel: "high" } },
    { questionId: "AMC-1.2", measuredScore: 4, confidenceControls: { contradictionRisk: 0.9 } },
    { questionId: "AMC-2.1", unknown: true, confidenceControls: {} }
  ],
  unknownReasons: [{ questionId: "AMC-2.1", reasons: ["no records"] }],
  confidenceSummary: { questions: 3 }
};

async function render() {
  const root = { innerHTML: "", querySelectorAll: () => [] };
  await renderDiagnosticViewPage({
    root,
    card: (title: string, body: string) => `<section class="card"><h2>${title}</h2>${body}</section>`,
    apiGet: async (path: string) => (path.startsWith("/diagnostic/render") ? rendered : auto),
    currentAgent: () => "default"
  });
  return root.innerHTML;
}

test("the summary is counts and, per area, the questions with enough records as ink bars; the score's details are folded", async () => {
  const html = await render();
  const top = html.slice(0, html.indexOf("Questions by area"));
  expect(top).toContain('<ul class="stat-row">');
  expect(top).toContain("<strong>3</strong><span>Questions</span>");
  expect(top).toContain("<strong>1</strong><span>Not enough records</span>");
  expect(top).toContain("<strong>1</strong><span>Low confidence</span>");
  expect(top).toContain("<strong>1</strong><span>High risk</span>");
  expect(top).toContain("<strong>0.500</strong><span>Integrity</span>");
  // Counts only, no level worked out here: Strategy has both questions answered, Skills none (its one question is unknown).
  expect(top).toContain('<p class="muted">Questions with enough records to answer, by area</p>');
  expect(top).toMatch(/<ul class="ink-bars diag-bars"[^>]*>.*&lt;b&gt;Strategy&lt;\/b&gt;.*width:100\.0%.*>2\/2<.*Skills.*width:0\.0%.*>0\/1</s);
  expect(top).toMatch(/<details class="more-info"><summary>About this score<\/summary>[\s\S]*latest \(run-1234\)/);
  // Areas are named from Studio's dimensions, not "Dimension 1".
  expect(html).not.toContain("Dimension 1");
});

test("every area is folded under its name and count, in area order, with all its question cards and the filters", async () => {
  const html = await render();
  expect(html.indexOf("&lt;b&gt;Strategy&lt;/b&gt; (2)")).toBeLessThan(html.indexOf("Skills (1)"));
  expect(html.match(/<details class="more-info"><summary>/g)).toHaveLength(3);
  expect(html.match(/class="card question-card"/g)).toHaveLength(3);
  for (const filter of ["all", "low", "risk"]) expect(html).toContain(`data-confidence-filter="${filter}"`);
  expect(html).toContain("Not enough records</strong> to answer one or more questions.");
});

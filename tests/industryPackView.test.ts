import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { getPackById } from "../src/domains/industryPacks.js";
import { QUESTIONNAIRE_NOTICE } from "../src/domains/questionnaireLabel.js";
import { industryPackDetailHtml, QUESTIONNAIRE_NOTICE as CONSOLE_NOTICE } from "../src/console/assets/industryPackView.js";

// M4 (2026-11-07 overseer): the console's Industry Packs page showed a pack as raw JSON.
const pack = getPackById("farm-to-fork")!;

test("the console's pack view carries the same content notice as the CLI", () => {
  expect(CONSOLE_NOTICE).toBe(QUESTIONNAIRE_NOTICE);
});

test("a pack reads as its facts, every question in full and the command that runs it", () => {
  // Studio's GET /industry-packs/:id returns the pack object as JSON.
  const html = industryPackDetailHtml(JSON.parse(JSON.stringify(pack)));
  const text = html.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");
  for (const fact of [pack.name, pack.id, `station ${pack.stationId}`, `risk ${pack.riskTier}`, `${pack.questions.length} questions`,
    `experimental, self-reported questionnaire. ${QUESTIONNAIRE_NOTICE}`, `amc domain pack run --pack ${pack.id}`, ...pack.regulatoryBasis]) {
    expect(text).toContain(fact);
  }
  for (const q of pack.questions) {
    for (const part of [q.id, q.dimension, q.text, q.l1, q.l3, q.l5]) expect(text).toContain(part);
  }
  expect(html).not.toMatch(/^\s*\{|"questions":/);
});

test("pack text is escaped", () => {
  const html = industryPackDetailHtml({ ...pack, name: '<img src=x onerror="alert(1)">',
    questions: [{ ...pack.questions[0]!, text: "<script>alert(1)</script>" }] });
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("the Industry Packs page opens a pack into the readable view, not a JSON dump", () => {
  const app = readFileSync("src/console/assets/app.js", "utf8");
  const view = app.slice(app.indexOf("async function renderIndustryPacks"), app.indexOf("async function renderCompliance"));
  expect(view).toContain("industryPackDetailHtml(");
  expect(view).not.toContain("JSON.stringify(detail");
});

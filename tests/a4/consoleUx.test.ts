/**
 * Compass Console in plain words (2026-11-14): Home leads with building an agent, the A4 start page shows a name, an
 * industry and one button, every question has a plain label beside the bank's stored prompt, and the claims box is not
 * shown while a page has no labelled result.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import * as view from "../../src/console/assets/a4View.js";
import { QUESTION_LABELS, questionDisplay } from "../../src/console/assets/a4Questions.js";
import { QUESTIONS as ASPIRE } from "../../src/a4/spec/aspire.js";
import { QUESTIONS as ASSEMBLE } from "../../src/a4/spec/assemble.js";
import { QUESTIONS as ADAPT } from "../../src/a4/spec/adapt.js";
import { QUESTIONS as ACTIVATE } from "../../src/a4/spec/activate.js";

describe("question label map", () => {
  const banks = [...ASPIRE, ...ASSEMBLE, ...ADAPT, ...ACTIVATE];

  test("covers every question of the four banks with a plain label and an example", () => {
    for (const question of banks) {
      const entry = QUESTION_LABELS[question.id as keyof typeof QUESTION_LABELS];
      expect(entry, question.id).toBeDefined();
      expect(entry![0].length, question.id).toBeGreaterThan(5);
      expect(entry![1].length, question.id).toBeGreaterThan(0);
    }
  });

  test("names the jargon ids in plain words and keeps the stored prompt as help", () => {
    expect(QUESTION_LABELS.stations[0]).toBe("Which sector is this agent for?");
    expect(QUESTION_LABELS.governance[0]).toBe("How strict should approvals be?");
    expect(QUESTION_LABELS.riskTier[0]).toBe("How much could go wrong?");
    const riskTier = ASPIRE.find((question) => question.id === "riskTier")!;
    const shown = questionDisplay(riskTier);
    expect(shown.help).toBe(riskTier.prompt);
    expect(shown.example).toMatch(/^For example: /);
  });

  test("the Ask form shows the label, the help line and the example; the field name stays the question id", () => {
    const html = view.renderConversation({ project: { stage: "aspire", step: "asked" }, stage: "aspire", answers: [], allowed: {}, readiness: { items: [] }, reflection: null, explanation: null, answerDrift: false,
      questions: ASPIRE.filter((question) => question.id === "stations").map((question) => ({ ...question, example: "" })) } as never);
    expect(html).toContain("Which sector is this agent for?");
    expect(html).toContain('name="stations"');
    expect(html).toContain("Which stations does it touch");
    expect(html).toContain('placeholder="For example: wealth"');
  });
});

describe("Home's build card", () => {
  test("with no project: Build an agent for your industry, the industry list, a name and one button", () => {
    const html = start.homeCardHtml({ projects: [], industryHtml: '<label>Your industry <select name="pack"></select></label>' });
    expect(html).toContain("Build an agent for your industry");
    expect(html).toContain('<select name="pack">');
    expect(html).toContain('name="name"');
    expect(html.match(/<button/g) ?? []).toHaveLength(1);
    expect(html).toContain('type="submit" class="a4-primary">Start building</button>');
    expect(html).toContain('<input type="hidden" name="expertise" value="novice" />');
  });

  test("with projects: Continue <latest>, what it needs now, one button, Start another as a link", () => {
    const html = start.homeCardHtml({ projects: [
      { projectId: "a4p_old", name: "Old", stage: "assemble", step: "built", updatedTs: "2026-11-01T00:00:00Z" },
      { projectId: "a4p_new", name: "Claims <helper>", stage: "aspire", step: "proposed", updatedTs: "2026-11-14T00:00:00Z" }] as never });
    expect(html).toContain("Continue Claims &lt;helper&gt;");
    expect(html).toContain("Next: a second person approves the plan before anything is built.");
    expect(html).toContain('<a class="button" href="./a4Project?project=a4p_new">Continue</a>');
    expect(html).toContain('<a href="./a4?new=1">Start another</a>');
    expect(html.match(/class="button"/g) ?? []).toHaveLength(1);
  });

  test("the demo workspace says it cannot hold projects instead of offering the form", () => {
    const html = start.homeCardHtml({ demo: true });
    expect(html).toContain("cannot hold agent projects");
    expect(html).not.toContain("<form");
  });

  test("home.html carries the card before the rest of Home, and a4.js fills it", () => {
    const home = readFileSync("src/console/pages/home.html", "utf8");
    expect(home.indexOf('id="a4HomeCard"')).toBeLessThan(home.indexOf('id="app"'));
    expect(readFileSync("src/console/assets/a4.js", "utf8")).toContain("start.homeCardHtml({ projects, industryHtml");
  });
});

describe("A4 start page", () => {
  test("Build an agent: the four steps in human words with the A4 names small, the approver notice, terminal commands folded", () => {
    const html = start.renderIntro({ creating: true, canAdd: true });
    expect(html).toContain("<h2>Build an agent</h2>");
    for (const [plain, name] of [["1. Say what it is for", "Aspire"], ["2. Build it", "Assemble"], ["3. Fit it to your rules", "Adapt"], ["4. Release it", "Activate"]]) {
      expect(html).toContain(`<strong>${plain}</strong><small class="muted">${name}</small>`);
    }
    expect(html).toContain("A second person has to approve each step.</strong> Add them now or later.");
    expect(html).toContain('<summary>Use the terminal instead</summary>');
    expect(html.indexOf("amc user add")).toBeGreaterThan(html.indexOf("Use the terminal instead"));
    expect(html).toContain("not an independent review");
    expect(html).toContain('href="./users"');
    expect(html).toContain('id="a4AddPerson"');
    expect(start.renderIntro({ canAdd: false })).not.toContain('id="a4AddPerson"');
  });

  test("the form shows name, industry and one button; the rest is under More options", () => {
    const html = view.renderCreateForm(true, '<label>Your industry <select name="pack"></select></label>');
    const more = html.indexOf("<summary>More options</summary>");
    expect(more).toBeGreaterThan(html.indexOf('name="pack"'));
    expect(html.indexOf('name="agentId"')).toBeGreaterThan(more);
    expect(html.indexOf('name="expertise"')).toBeGreaterThan(more);
    expect(html.match(/type="submit"/g) ?? []).toHaveLength(1);
  });
});

describe("waiting states", () => {
  test("say who has to act and how to reach them, with Copy link", () => {
    const ctx = { project: { projectId: "a4p_1", stage: "aspire", step: "proposed", hold: false, members: [] }, stage: "aspire", me: { userId: "u1" },
      gates: [{ gateId: "g1", excludedKeys: ["LOCAL_USER:u1"] }], members: { candidates: [] }, questions: [], allowed: {},
      readiness: { status: "WAITING", items: [], allowed: {}, gates: { direction: { gateId: "g1", status: "PENDING", approvals: 0, required: 1 } } } };
    const move = start.nextMove(ctx as never) as { now: string; why?: string; act?: { copy?: boolean } };
    expect(move.now).toContain("Waiting for a second person to approve");
    expect(move.why).toContain("They sign in to this console, open this link");
    expect(move.act?.copy).toBe(true);
    expect(start.renderStartHere(ctx as never)).toContain("data-a4-copy-link");
  });
});

describe("claims box", () => {
  test("is hidden while the page has no labelled result; the mechanism stays", () => {
    const badge = readFileSync("src/console/assets/components/claimBadge.js", "utf8");
    expect(badge).toContain('strip.classList.toggle("claim-strip-empty", seen.size === 0)');
    expect(badge).not.toContain("No labelled result loaded yet.");
    expect(readFileSync("src/console/assets/styles.css", "utf8")).toMatch(/\.claim-strip\.claim-strip-empty \{ display: none; \}/);
  });
});

/**
 * The A4 project page in plain words (lane a4-plain): one table of words for every code a person can meet, the raw
 * record kept under "Show the record", the specification as an outline, and only takeable actions as buttons.
 */
import { describe, expect, test } from "vitest";
import * as project from "../../src/contracts/v1/a4Project.js";
import { A4_BLOCKER_KINDS } from "../../src/contracts/v1/a4Readiness.js";
import { a4GateV1Schema } from "../../src/contracts/v1/a4Gate.js";
import { a4DecisionV1Schema } from "../../src/contracts/v1/a4Decision.js";
import { A4_REF_KINDS, a4AnswerSchema } from "../../src/a4/a4Schema.js";
import { notReadyWords as studioWords } from "../../src/a4/a4Words.js";
import { PLAIN, itemWithRecord, notReadyWords, record, short, when } from "../../src/console/assets/a4Plain.js";
import { renderOutline } from "../../src/console/assets/a4Outline.js";
import * as view from "../../src/console/assets/a4View.js";

type Table = keyof typeof PLAIN;
const enums: Array<[Table, readonly string[], string]> = [
  ["stage", project.A4_STAGES, "A4_STAGES"], ["stageState", project.A4_STAGE_STATES, "A4_STAGE_STATES"], ["step", project.A4_STEPS, "A4_STEPS"],
  ["lane", project.A4_LANES, "A4_LANES"], ["gate", project.A4_GATES, "A4_GATES"], ["projectRole", project.A4_PROJECT_ROLES, "A4_PROJECT_ROLES"],
  ["authSource", project.A4_AUTH_SOURCES, "A4_AUTH_SOURCES"], ["admission", project.A4_ADMISSIONS, "A4_ADMISSIONS"],
  ["identityCheck", project.A4_IDENTITY_CHECKS, "A4_IDENTITY_CHECKS"], ["itemStatus", project.A4_ITEM_STATUSES, "A4_ITEM_STATUSES"],
  ["readinessStatus", project.A4_READINESS_STATUSES, "A4_READINESS_STATUSES"], ["blockerKind", A4_BLOCKER_KINDS, "A4_BLOCKER_KINDS"],
  ["refKind", A4_REF_KINDS, "A4_REF_KINDS"], ["gateStatus", a4GateV1Schema.shape.status.options, "a4Gate status"],
  ["gateStatus", a4GateV1Schema.shape.quorum.shape.status.options, "a4Gate quorum status"],
  ["decision", a4DecisionV1Schema.shape.decision.options, "a4Decision decision"], ["answerSource", a4AnswerSchema.shape.source.options, "a4Answer source"]
];

describe("one table of words", () => {
  test.each(enums)("every %s value (%s) has plain words", (table, values) => {
    const missing = values.filter((value) => typeof PLAIN[table]?.[value as never] !== "string" || !(PLAIN[table] as Record<string, string>)[value]);
    expect(missing).toEqual([]);
  });

  test("an item's words are the ones Studio's refusals and `amc a4 readiness` use", () => {
    const items = ["sod.self_provisioned", "sod", "ask_complete", "understanding_confirmed", "plan_unresolved", "hold.none", "gate.direction",
      "gate.completion", "resources.current", "package.inputs", "release_proposed", "anything_else"].flatMap((id) => [
      { id, reasonCodes: [] }, { id, reasonCodes: ["NO_SECOND_APPROVER"] }, { id, reasonCodes: ["PRODUCED_AT_BUILD"] }, { id, reasonCodes: ["NOT_PROPOSED"] },
      { id, reasonCodes: [], nextAction: { label: "Do the next thing" } }]);
    for (const item of items) expect(notReadyWords(item)).toBe(studioWords(item));
  });
});

describe("words first, record second", () => {
  test("an item says what it checks and its state; its id and codes stay in the record", () => {
    const html = itemWithRecord({ id: "resources.current", status: "BLOCKED", reasonCodes: ["RESOURCE_DRIFTED", "context.promptPackSha256"], nextAction: null });
    expect(html).toContain("The agent&#39;s files are as recorded");
    expect(html).toContain(">blocked<");
    expect(html).toContain("Save an answer under Ask");
    const [words, raw] = html.split("Show the record");
    expect(words).not.toContain("RESOURCE_DRIFTED");
    expect(raw).toContain("<code>resources.current</code> <code>BLOCKED</code> <code>RESOURCE_DRIFTED</code> <code>context.promptPackSha256</code>");
  });

  test("a record is a closed native details named Show the record", () => {
    expect(record("<p>x</p>", "k")).toBe('<details class="a4-record" data-a4-open="record:k"><summary>Show the record</summary><p>x</p></details>');
  });

  test("times are in the reader's time with UTC in the title; long hashes are shortened with the whole value in the title", () => {
    const ts = Date.UTC(2026, 10, 15, 4, 29, 28);
    expect(when(ts)).toContain('title="2026-11-15 04:29:28 UTC"');
    expect(when(ts)).toContain('datetime="2026-11-15T04:29:28.000Z"');
    expect(when(null)).toBe("");
    const hash = "8049661ad77a34d5fed0ba0436a16ea2d9986b1761cf89a55887bd8310cd057f";
    expect(short(hash)).toBe(`<span class="a4-hash" title="${hash}">8049661ad77a…</span>`);
    expect(short("r12")).toBe("r12");
  });

  test("Missing requirements reads as what this step still needs, with every code under the record", () => {
    const readiness = { status: "BLOCKED", nextAction: null, allowed: {}, items: [
      { id: "ask_complete", status: "WAITING", mandatory: true, reasonCodes: ["ANSWER_MISSING:goals"], acknowledged: null, nextAction: null, kind: "evidence_missing" },
      { id: "hypothesis.h-1", status: "NOT_EVALUATED", mandatory: false, reasonCodes: ["HYPOTHESIS_PROPOSED"], acknowledged: null, nextAction: null, kind: null }] };
    const html = view.renderMissing(readiness as never, "aspire");
    const [words, raw] = html.split("Show the record");
    expect(words).toContain("This step is blocked");
    expect(words).toContain("Some questions still need an answer");
    expect(words).toContain("Something that should improve");
    expect(words).not.toMatch(/ANSWER_MISSING|HYPOTHESIS_PROPOSED|<code>ask_complete/);
    expect(raw).toContain("<code>ask_complete</code> <code>WAITING</code>");
    expect(raw).toContain("<code>ANSWER_MISSING:goals</code>");
  });
});

describe("the specification as an outline", () => {
  const aspire = { revisionNo: 5, stage: "aspire", spec: {
    schema: "amc.a4-aspire-spec/v1",
    answers: [{ questionId: "agent", value: "Invoice helper", source: "user" }, { questionId: "forbiddenActions", value: "Never pay an invoice\nNever email suppliers", source: "user" },
      { questionId: "riskTier", value: "critical", source: "inferred" }],
    brief: { agent: "Invoice helper: sorts supplier invoices", problem: "Invoices are sorted by hand", audience: ["Accounts payable clerks", "Finance manager"],
      goals: ["Sort invoices by due date"], riskTier: "critical", governance: "regulated", stations: ["health"] },
    build: { files: [{ path: ".amc/agents/x/context-graph.json", sha256: "a".repeat(64) }] } } };

  test("Aspire: what was asked and what AMC drafted, under plain headings", () => {
    const html = renderOutline("aspire", aspire);
    expect(html).toContain("<h5>What was asked</h5>");
    expect(html).toContain("<strong>What is the agent called, and what is its job?</strong> Invoice helper");
    for (const heading of ["What it is for", "Who it is for", "Goals", "What it must never do", "How much could go wrong", "Sectors", "What was built and where"]) {
      expect(html).toContain(`<h5>${heading}</h5>`);
    }
    expect(html).toContain("<li>Never pay an invoice</li><li>Never email suppliers</li>");
    expect(html).toContain("critical; approvals follow the rules for regulated work");
    expect(html).toContain(".amc/agents/x/context-graph.json");
    expect(html).not.toContain("a".repeat(64));
  });

  test("a stage with no revision says so; the JSON stays under the record on the card", () => {
    expect(renderOutline("adapt", null)).toContain("Nothing is drafted for Fit it to your rules yet");
    const ctx = { revision: aspire, stageRevision: aspire, allowed: { propose: { allowed: false, reasonCodes: ["A4_STEP_ORDER"] } },
      project: { stage: "aspire", step: "reviewed", revisionNo: 5 }, stage: "aspire", specDraft: false };
    const html = view.renderSpecEditor(ctx as never);
    const [words, raw] = html.split("Show the record");
    expect(words).toContain("<h5>Goals</h5>");
    expect(words).not.toContain('name="spec"');
    expect(raw).toContain('<textarea name="spec"');
    expect(raw).toContain("&quot;riskTier&quot;: &quot;critical&quot;");
  });
});

describe("buttons are only what a person can do now", () => {
  const gate = { gateId: "g1", gate: "completion", revisionNo: 12, status: "PENDING", approvals: 1, required: 2, requestedSeq: 3, bindingDigest: "b".repeat(64),
    decisions: [{ decisionId: "d1", username: "owner", decision: "APPROVE_EXECUTE", ts: Date.UTC(2026, 10, 15, 4, 31, 19), selfApproved: true }], excludedKeys: [] };
  const ctx = { stage: "assemble", gates: [gate], revision: { revisionNo: 12 }, specDraft: false, gateChange: null, me: { userId: "owner" },
    project: { stage: "assemble", step: "reviewed", revisionNo: 12 },
    readiness: { gates: { direction: null, completion: gate }, items: [], staleApprovals: [], bindingDigest: "c".repeat(64), selfApprovalAllowed: false, identityCheck: "users_yaml" },
    allowed: { decide: { allowed: false, reasonCodes: ["A4_DUPLICATE_DECISION"] }, requestChanges: { allowed: true, reasonCodes: [] }, hold: { allowed: true, reasonCodes: [] },
      requestGate: { allowed: false, reasonCodes: [] }, progress: { allowed: false, reasonCodes: ["GATE_PENDING"] } } };

  test("the Approvals card: no greyed button outside More, each one under More says why, and the codes stay in the record", () => {
    const html = view.renderApprovalsBar(ctx as never);
    const more = html.indexOf('<details data-a4-open="more">');
    const disabled = [...html.matchAll(/<button[^>]*\bdisabled\b/g)].map((match) => match.index ?? 0);
    expect(disabled.length).toBeGreaterThan(0);
    for (const at of disabled) expect(at).toBeGreaterThan(more);
    expect(html.slice(0, more)).toContain('data-a4-action="request-changes"');
    expect(html).toContain("You have already decided this approval request.");
    expect(html).toContain("<strong>Final approval</strong> for version 12: waiting for approvals");
    expect(html).toContain("owner approved on <time");
    const raw = html.slice(html.indexOf("Show the record"));
    expect(raw).toContain("<code>completion</code> gate r12 · <code>PENDING</code>");
    expect(raw).toContain("<code>APPROVE_EXECUTE</code>");
    expect(raw).toContain("2026-11-15 04:31:19 UTC");
  });

  test("a card lists what is not open now under More, with the reason in words", () => {
    const card = { id: "build", title: "Build", render: () => view.actionButton("Build", "build", { allowed: false, reasonCodes: ["A4_STEP_ORDER"] }) };
    const html = view.renderCard(card as never, { ...ctx, project: { ...ctx.project, members: [] } } as never, []);
    expect(html).toContain("More (1 not open now)");
    expect(html).toContain("Not yet: finish the earlier steps of this stage first. (A4_STEP_ORDER)");
  });
});

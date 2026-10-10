// Aspire's Studio cards (P1-59, design §10.1): the brief, the solution graph, the hypotheses (not observed), the learning
// plan, the quality specification and the alternatives, read from the newest Aspire revision Studio returns; the
// conversation, build and review cards say that Aspire's producers run. Pure renderers: every server string goes through
// esc(), statuses and reason codes are printed as Studio returned them, and no card names a maturity level.
import { registerStageCard } from "./a4Cards.js";
import * as view from "./a4View.js";

const { esc } = view;
const ASPIRE_SPEC = "amc.a4-aspire-spec/v1";
const PRODUCED = "Aspire's producers run here: Studio records AMC's output (self-reported, never observed) and, beside it, what you write as your own statement.";
const NOT_PROPOSED = "No brief yet: Propose builds it from your answers.";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const specOf = (ctx) => (isObject(ctx.stageRevision?.spec) ? ctx.stageRevision.spec : {});
const proposed = (spec) => spec.schema === ASPIRE_SPEC;
const items = (ctx) => list(ctx.readiness?.items);
const itemOf = (ctx, id) => items(ctx).find((item) => item.id === id) ?? null;
const codes = (values) => list(values).map((code) => `<code>${esc(code)}</code>`).join(" ");
/** One readiness item's status and reason codes, as Studio returned them. */
const status = (ctx, id) => {
  const item = itemOf(ctx, id);
  return item ? `<p class="muted"><code>${esc(id)}</code> <code>${esc(item.status)}</code> ${codes(item.reasonCodes)}</p>` : "";
};
const bullets = (values, empty = "None") => (list(values).length ? `<ul class="a4-rows">${list(values).map((value) => `<li>${esc(value)}</li>`).join("")}</ul>`
  : `<p class="muted">${esc(empty)}</p>`);
const table = (head, rows, empty) => (rows.length ? `<div class="scroll"><table><thead><tr>${head.map((cell) => `<th>${esc(cell)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`);
const day = (iso) => esc(String(iso ?? "").slice(0, 10));

/** Ask, Understand and Explain: the generic card with Aspire's copy, the answers to confirm, and what AMC understood. */
function renderConversation(ctx) {
  const ask = itemOf(ctx, "ask_complete");
  const stale = list(ask?.reasonCodes).filter((code) => String(code).startsWith("ANSWER_STALE:")).map((code) => String(code).slice("ANSWER_STALE:".length));
  const offer = view.stepOffer(ctx.allowed.ask, ctx, "answers");
  const banner = stale.length ? `<div class="card banner"><p>${stale.length} answer(s) need confirming because an answer they depend on changed:</p>
    <ul class="a4-rows">${stale.map((id) => `<li><code>${esc(id)}</code>: ${esc(view.answerText(ctx.answers, id))}
      ${view.actionButton("Confirm", "confirm-answer", offer, `data-question="${esc(id)}"`)}</li>`).join("")}</ul>
    <p class="muted">Or change them under "Change my answers".</p></div>` : "";
  const spec = specOf(ctx);
  const reflection = isObject(spec.understanding?.reflection) ? spec.understanding.reflection : null;
  const understood = reflection ? `<h4>What AMC understood (r${esc(ctx.stageRevision?.revisionNo)})</h4>
    <p><strong>Agent:</strong> ${esc(reflection.agent ?? "not answered")}</p><p><strong>Mission:</strong> ${esc(reflection.mission ?? "not answered")}</p>
    <p><strong>Audiences</strong></p>${bullets(reflection.audiences)}<p><strong>Assumptions</strong></p>${bullets(reflection.assumptions)}
    <p><strong>Unknowns</strong></p>${bullets(reflection.unknowns)}
    ${list(spec.understanding?.inferred).length ? `<p class="muted">Pre-filled for you to confirm: ${list(spec.understanding.inferred)
      .map((entry) => `<code>${esc(entry.questionId)}</code> (${esc(entry.from)})`).join(", ")}</p>` : ""}` : "";
  const facts = list(spec.explanation?.facts);
  const level = spec.explanation?.level;
  const explained = facts.length ? `<h4>Explanation</h4>${["novice", "practitioner", "expert"].map((name) => `<details data-a4-open="explain-${name}"${
    name === level ? " open data-a4-default-open" : ""}><summary>${esc(name)}</summary><ul class="a4-rows">${facts.map((fact) => `<li>${esc(fact[name])}${
    fact.dataStatus ? ` <code>${esc(fact.dataStatus)}</code>` : ""} <span class="muted">(${list(fact.sources).map(esc).join(", ")})</span></li>`).join("")}</ul></details>`).join("")}` : "";
  return `${banner}${view.renderConversation(ctx).replaceAll(view.NO_PRODUCER, PRODUCED)}${understood}${explained}`;
}

function renderBuild(ctx) {
  const files = list(specOf(ctx).build?.files);
  return `<p class="muted">${esc(view.TRUTH.admission)}. Build writes the approved brief: context-graph.json, the signed agent config, the target
    profile, the outcome contract when there is none and the Enforce manifest. Each write is a self-reported implementation
    ref with its file's sha256. Your note is recorded beside it as your own statement; pasted text is retained until the project's blob key is destroyed.</p>
    ${table(["Written", "Path", "sha256"], files.map((file) => [esc(file.writer), `<code>${esc(file.path)}</code>`, `<code>${esc(String(file.sha256 ?? "absent").slice(0, 16))}</code>`]),
      "Nothing written yet.")}
    ${["context_graph_written", "agent_config_signed", "manifest_active"].map((id) => status(ctx, id)).join("")}
    <label>Build note <textarea name="content" rows="3" maxlength="65536"></textarea></label>
    <div class="row wrap">${view.actionButton("Build", "build", view.stepOffer(ctx.allowed.build, ctx, "build"))}</div>`;
}

function renderReview(ctx) {
  return `<p class="muted">Review checks the written context graph against the build and the signed target profile, runs the doctor's checks
    with their first-run fixes and checks the brief is complete. The agent config's signature check is an integrity self-check under this
    workspace's keys and appears in the Integrity panel. Nothing at Aspire is observed: review records "not evaluated: no runtime observation
    at Aspire". Your findings are recorded beside it as your own statement; pasted text is retained until the project's blob key is destroyed.</p>
    ${["context_graph_written", "agent_config_signed", "aspire.agent_config_signature"].map((id) => status(ctx, id)).join("")}
    <label>Findings <textarea name="content" rows="3" maxlength="65536"></textarea></label>
    <div class="row wrap">${view.actionButton("Review", "review", view.stepOffer(ctx.allowed.review, ctx, "review"))}</div>`;
}

function renderBrief(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  const brief = isObject(spec.brief) ? spec.brief : {};
  const graph = isObject(brief.contextGraph) ? brief.contextGraph : {};
  const row = (label, value) => `<p><strong>${esc(label)}:</strong> ${esc(value ?? "not answered")}</p>`;
  return `<p class="muted">${esc(spec.claim?.claimBoundary ?? "")} <code>${esc(spec.claim?.claimKind)}</code> <code>${esc(spec.claim?.result)}</code></p>
    ${row("Agent", brief.agent)}${row("Problem", brief.problem)}${row("Current workflow", brief.currentWorkflow)}
    ${row("Markets", brief.markets === null ? "unknown (which rules apply is decided at Adapt)" : list(brief.markets).join(", "))}
    ${row("Stations", list(brief.stations).join(", "))}${row("Governance", brief.governance)}${row("Risk tier", brief.riskTier)}
    <p><strong>Audience</strong></p>${bullets(brief.audience)}<p><strong>Goals</strong></p>${bullets(brief.goals)}
    <h4>Context graph (written at Build)</h4>${row("Mission", graph.mission)}<p><strong>Success metrics</strong></p>${bullets(graph.successMetrics)}
    <p><strong>Constraints</strong></p>${bullets(graph.constraints)}<p><strong>Forbidden actions</strong></p>${bullets(graph.forbiddenActions)}
    <p><strong>Escalation rules</strong></p>${bullets(graph.escalationRules)}
    <h4>Misuse and failure modes</h4>${table(["Failure mode", "Mitigation", "Source"], list(spec.misuse).map((entry) => [esc(entry.failureMode), esc(entry.mitigation),
      esc(entry.source)]), "No misuse section.")}
    ${["ask_complete", "brief_valid", "risk_section_present"].map((id) => status(ctx, id)).join("")}`;
}

/** The typed-graph draft as an SVG: audiences, the agent, its approver. */
function renderGraph(ctx) {
  const graph = specOf(ctx).graph;
  if (!isObject(graph)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  const nodes = list(graph.nodes);
  const left = nodes.filter((node) => node.nodeId !== "agent" && node.nodeId !== "approver");
  const height = Math.max(120, left.length * 56 + 24);
  const place = new Map([["agent", [300, height / 2]], ["approver", [540, height / 2]], ...left.map((node, index) => [node.nodeId, [80, 40 + index * 56]])]);
  const box = (node) => {
    const [x, y] = place.get(node.nodeId) ?? [80, 40];
    return `<g><rect x="${x - 70}" y="${y - 18}" width="140" height="36" rx="6" fill="none" stroke="currentColor"></rect>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="currentColor">${esc(String(node.role ?? node.nodeId).slice(0, 22))}</text></g>`;
  };
  const edge = (link) => {
    const [x1, y1] = place.get(link.from) ?? [0, 0];
    const [x2, y2] = place.get(link.to) ?? [0, 0];
    return `<line x1="${x1 + 70}" y1="${y1}" x2="${x2 - 70}" y2="${y2}" stroke="currentColor" marker-end="url(#a4Arrow)"><title>${esc(link.edgeType)}: ${esc(link.purpose)}</title></line>`;
  };
  return `<svg viewBox="0 0 620 ${height}" role="img" aria-label="Solution sketch: audiences, agent and approver" width="100%">
    <defs><marker id="a4Arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"></path></marker></defs>
    ${list(graph.edges).map(edge).join("")}${nodes.map(box).join("")}</svg>
    <p class="muted">The typed multi-agent graph draft (<code>${esc(graph.graphId)}</code>), kept in the specification; Build does not write it. Invariants:</p>
    ${bullets(list(graph.invariants).map((entry) => `${entry.description} (${entry.severity})`))}`;
}

function renderHypotheses(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  const observed = (hypothesis) => {
    const item = itemOf(ctx, `hypothesis.${hypothesis.id}`);
    const reasons = list(item?.reasonCodes);
    const by = reasons.find((code) => String(code).startsWith("VERDICT_BY:"));
    if (by) {
      const lane = list(item.evidence)[0]?.lane;
      return `observed value (${esc(lane === "observed" ? "Observed" : lane ?? "unresolved")}) · verdict ${esc(reasons.includes("HYPOTHESIS_REFUTED") ? "refuted" : "observed")}
        by ${esc(String(by).slice("VERDICT_BY:".length))} (self-reported)`;
    }
    return `Not observed ${codes(reasons)}${item?.nextAction?.route ? `<br><span class="muted">${esc(item.nextAction.label)}: <code>${esc(item.nextAction.route)}</code></span>` : ""}`;
  };
  return `<p class="muted">Hypotheses (not observed). Each stays proposed until <code>POST …/hypotheses/:id/observe</code> binds a runtime-written row of its
    evidence source inside its window; the verdict is a person's statement, kept apart from the observed value.</p>
    ${table(["Id", "Hypothesis", "Predicted outcome", "Window", "Evidence source", "Status"], list(spec.hypotheses).map((hypothesis) => [`<code>${esc(hypothesis.id)}</code>`,
      esc(hypothesis.statement), esc(hypothesis.predictedOutcome), `${day(hypothesis.window?.from)} to ${day(hypothesis.window?.to)}`,
      `<code>${esc(hypothesis.evidenceSource?.eventType)}</code> <code>${esc(hypothesis.evidenceSource?.metric)}</code>`, observed(hypothesis)]), "No hypotheses.")}
    ${status(ctx, "hypotheses_present")}`;
}

function renderLearningPlan(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  return `${table(["Milestone", "Acceptance criteria", "Evidence source", "Status"], list(spec.learningPlan).map((row) => [esc(row.title), bullets(row.acceptanceCriteria),
    esc(row.evidenceSource ?? "none"), `<code>${esc(row.status)}</code>`]), "No learning plan.")}${status(ctx, "learning_plan_present")}`;
}

function renderQuality(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  return `<p class="muted">Every target needs an evidence source, or its measure marked "not instrumented". Edit the <code>quality</code> part of the
    specification to change them.</p>
    ${table(["Dimension", "Statement", "Measure", "Target", "Evidence source", "Method", "Source"], list(spec.quality?.targets).map((target) => [esc(target.dimension),
      esc(target.statement), esc(target.measure), esc(target.target), esc(target.evidenceSource ?? "none"), `<code>${esc(target.evidenceMethod)}</code>`, esc(target.source)]),
      "No quality targets.")}${status(ctx, "quality_spec_complete")}`;
}

function renderAlternatives(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  return `<ul class="a4-rows">${list(spec.alternatives).map((alternative) => `<li><strong>${esc(alternative.title)}</strong> <code>${esc(alternative.id)}</code>
    <p>${esc(alternative.reason)}</p>${bullets(alternative.tradeOffs)}${alternative.preview
      ? `<p class="muted">Dry run (nothing written): changes ${list(alternative.preview.contextDiff).map((key) => `<code>${esc(key)}</code>`).join(" ") || "nothing"} in the context graph</p>`
      : alternative.previewReason ? `<p class="muted">No dry run: <code>${esc(alternative.previewReason)}</code></p>` : ""}</li>`).join("")}</ul>
    ${status(ctx, "alternatives_present")}`;
}

export function register() {
  registerStageCard("aspire", "conversation", renderConversation, "Conversation");
  registerStageCard("aspire", "build", renderBuild, "Build");
  registerStageCard("aspire", "review", renderReview, "Review");
  registerStageCard("aspire", "brief", renderBrief, "Brief");
  registerStageCard("aspire", "graph", renderGraph, "Solution sketch");
  registerStageCard("aspire", "hypotheses", renderHypotheses, "Hypotheses (not observed)");
  registerStageCard("aspire", "learning-plan", renderLearningPlan, "Learning plan");
  registerStageCard("aspire", "quality", renderQuality, "Quality specification");
  registerStageCard("aspire", "alternatives", renderAlternatives, "Alternatives");
}

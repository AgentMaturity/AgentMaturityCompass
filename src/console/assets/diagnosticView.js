import { renderQuestionCard } from "./components/questionCard.js";
import { statRowHtml } from "./dailyView.js";
import { esc, moreInfo, recordRows } from "./pageKit.js";

// The diagnostic in the route style: counts on top and, per area, how many questions have enough records as an ink bar;
// every area's questions folded below under its name. Same reads, same cards, same filter buttons as before; nothing
// dropped. The bars count what Studio returned (a question is "unknown" when it lacks records); no level is computed here.
export async function renderDiagnosticViewPage(params) {
  const agentId = params.currentAgent();
  const [rendered, auto] = await Promise.all([
    params.apiGet(`/diagnostic/render?agentId=${encodeURIComponent(agentId)}`),
    params.apiGet(`/diagnostic/auto-answer?agentId=${encodeURIComponent(agentId)}`)
  ]);

  const scoreById = new Map((auto.questions ?? []).map((row) => [row.questionId, row]));
  const unknownReasons = new Map((auto.unknownReasons ?? []).map((row) => [row.questionId, row.reasons]));
  const lowConfidenceCount = (auto.questions ?? []).filter((row) => row.confidenceControls?.uncertaintyLevel === "high" || row.confidenceControls?.presentationStatus === "needs_review").length;
  const highRiskCount = (auto.questions ?? []).filter((row) => Number(row.confidenceControls?.decisivenessRisk || 0) >= 0.65 || Number(row.confidenceControls?.contradictionRisk || 0) >= 0.5).length;

  const groups = new Map();
  for (const dimension of rendered.dimensions ?? []) {
    // Studio names a dimension's id `id`; questions point at it with `dimensionId`.
    groups.set(dimension.dimensionId ?? dimension.id, {
      name: dimension.name,
      items: []
    });
  }
  for (const question of rendered.questions ?? []) {
    const row = groups.get(question.dimensionId) ?? { name: `Dimension ${question.dimensionId}`, items: [] };
    const score = scoreById.get(question.qId);
    row.items.push({
      question,
      runId: auto.runId,
      agentId,
      score: score
        ? {
            ...score,
            evidenceRefs: score.reasons?.length ? [] : (score.flags ?? []).slice(0, 3),
            reasons: unknownReasons.get(question.qId) ?? score.reasons ?? []
          }
        : null
    });
    groups.set(question.dimensionId, row);
  }

  const ordered = [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, group]) => group);
  // Per area: questions that have enough records to be answered, out of all its questions.
  const answeredBars = ordered.map((group) => {
    const answered = group.items.filter((row) => row.score && row.score.unknown !== true).length;
    const share = group.items.length ? (answered / group.items.length) * 100 : 0;
    return `<li><span class="bar-name">${esc(group.name)}</span><span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${share.toFixed(1)}%"></span></span>`
      + `<span class="bar-value">${answered}/${group.items.length}</span></li>`;
  }).join("");
  const sections = ordered
    .map((group) => {
      const cards = group.items
        .sort((a, b) => a.question.qId.localeCompare(b.question.qId))
        .map((row) => renderQuestionCard(row))
        .join("");
      return moreInfo(`${group.name} (${group.items.length})`, cards);
    })
    .join("");
  const questionCount = (rendered.questions ?? []).length;
  const unknownCount = (auto.unknownReasons ?? []).length;

  params.root.innerHTML = `
    ${params.card("Diagnostic", `
      ${statRowHtml([["Questions", questionCount], ["Not enough records", unknownCount, unknownCount > 0 ? "status-bad" : ""], ["Low confidence", lowConfidenceCount],
        ["High risk", highRiskCount], ["Integrity", typeof auto.integrityIndex === "number" ? auto.integrityIndex.toFixed(3) : "n/a"]])}
      ${answeredBars ? `<p class="muted">Questions with enough records to answer, by area</p><ul class="ink-bars diag-bars" aria-label="Questions with enough records to answer, by area">${answeredBars}</ul>` : ""}
      ${moreInfo("About this score", `
        <div class="grid">
          <div><div class="muted">Agent</div><div class="tile-value">${esc(agentId)}</div></div>
          <div><div class="muted">Score used</div><div class="tile-value" title="${esc(auto.runId ?? "")}">${auto.runId ? `latest (${esc(String(auto.runId).slice(0, 8))})` : "none"}</div></div>
        </div>
        ${auto.confidenceSummary ? recordRows(auto.confidenceSummary) : ""}
      `)}
    `)}
    ${params.card("Questions by area", `
      <div class="row wrap" role="group" aria-label="Show questions">
        <button class="secondary" data-confidence-filter="all" aria-pressed="true">All</button>
        <button class="secondary" data-confidence-filter="low" aria-pressed="false">Low confidence</button>
        <button class="secondary" data-confidence-filter="risk" aria-pressed="false">High risk</button>
      </div>
      <div class="records-folds">${sections}</div>
    `)}
  `;
  params.root.querySelectorAll("button[data-confidence-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-confidence-filter");
      params.root.querySelectorAll("button[data-confidence-filter]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      params.root.querySelectorAll(".question-card").forEach((card) => {
        const show = filter === "low"
          ? card.getAttribute("data-low-confidence") === "true"
          : filter === "risk"
            ? card.getAttribute("data-high-risk") === "true"
            : true;
        card.style.display = show ? "" : "none";
      });
      // A filter opens the areas that have a matching question and folds the rest; "All" folds every area again.
      params.root.querySelectorAll(".records-folds > details.more-info").forEach((area) => {
        area.open = filter !== "all" && [...area.querySelectorAll(".question-card")].some((card) => card.style.display !== "none");
      });
    });
  });
}

import { renderQuestionCard } from "./components/questionCard.js";

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
    groups.set(dimension.dimensionId, {
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

  const sections = [...groups.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, group]) => {
      const cards = group.items
        .sort((a, b) => a.question.qId.localeCompare(b.question.qId))
        .map((row) => renderQuestionCard(row))
        .join("");
      return `<section><h2>${group.name}</h2>${cards}</section>`;
    })
    .join("");

  params.root.innerHTML = `
    ${params.card("Diagnostic Overview", `
      <div class="grid">
        <div><div class="muted">Agent</div><div class="tile-value">${agentId}</div></div>
        <div><div class="muted">Run ID</div><div class="tile-value">${auto.runId ?? "n/a"}</div></div>
        <div><div class="muted">Integrity</div><div class="tile-value">${typeof auto.integrityIndex === "number" ? auto.integrityIndex.toFixed(3) : "n/a"}</div></div>
        <div><div class="muted">Unknown Questions</div><div class="tile-value">${(auto.unknownReasons ?? []).length}</div></div>
        <div><div class="muted">Low Confidence</div><div class="tile-value">${lowConfidenceCount}</div></div>
        <div><div class="muted">High Risk</div><div class="tile-value">${highRiskCount}</div></div>
      </div>
      <div class="row wrap">
        <button class="secondary" data-confidence-filter="all">All</button>
        <button class="secondary" data-confidence-filter="low">Low confidence</button>
        <button class="secondary" data-confidence-filter="risk">High risk</button>
      </div>
      ${(auto.unknownReasons ?? []).length > 0 ? `<p class="status-bad"><strong>Honesty banner:</strong> insufficient evidence for one or more questions.</p>` : ""}
      ${auto.confidenceSummary ? `<pre class="scroll">${JSON.stringify(auto.confidenceSummary, null, 2)}</pre>` : ""}
    `)}
    ${sections}
  `;
  params.root.querySelectorAll("button[data-confidence-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-confidence-filter");
      params.root.querySelectorAll(".question-card").forEach((card) => {
        const show = filter === "low"
          ? card.getAttribute("data-low-confidence") === "true"
          : filter === "risk"
            ? card.getAttribute("data-high-risk") === "true"
            : true;
        card.style.display = show ? "" : "none";
      });
    });
  });
}

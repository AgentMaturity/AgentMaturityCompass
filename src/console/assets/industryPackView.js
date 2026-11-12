// An Industry Pack as the console shows it: what `amc domain pack describe` prints, every question with its full text
// and level descriptions, the command that runs the pack, and a questionnaire Studio scores with the CLI's function.
// Pack answers are self-reported.

// Mirrors QUESTIONNAIRE_NOTICE in src/domains/questionnaireLabel.ts; tests/industryPackView.test.ts keeps them equal.
export const QUESTIONNAIRE_NOTICE = "AI-drafted; not reviewed by a qualified expert; not legal advice.";

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * `pack` is the `pack` field of Studio's GET /industry-packs/:id. Each question is a labelled radio group offering the
 * levels `amc domain pack run` offers (L1, L3, L5); an unanswered question is not evaluated, as in the CLI baseline.
 */
export function industryPackDetailHtml(pack) {
  const questions = pack.questions ?? [];
  const levels = (q, i) => [[1, q.l1], [3, q.l3], [5, q.l5]]
    .map(([level, text]) => `<label class="pack-level"><input type="radio" name="pack-q${i}" value="${level}" data-question="${esc(q.id)}" />
      <span><strong>L${level}</strong> ${esc(text)}</span></label>`).join("");
  return `<div class="row spaced wrap">
      <h3 id="industryPackHeading" tabindex="-1">${esc(pack.name)}</h3>
      <button type="button" class="secondary" id="industryPackClose">Close</button>
    </div>
    <p class="muted">${esc(pack.id)} · station ${esc(pack.stationId)} · risk ${esc(pack.riskTier)} · ${questions.length} questions</p>
    <p><strong>Content:</strong> ${esc(pack.contentStatus ?? "experimental")}, self-reported questionnaire. ${QUESTIONNAIRE_NOTICE}</p>
    ${pack.description ? `<p>${esc(pack.description)}</p>` : ""}
    <h4>Regulatory basis</h4>
    <ul>${(pack.regulatoryBasis ?? []).map((basis) => `<li>${esc(basis)}</li>`).join("")}</ul>
    <h4>Run it</h4>
    <p>Answer the questions below and choose Score, or run <code>amc domain pack run --pack ${esc(pack.id)}</code>.
      Unanswered questions are not evaluated. The answers are scored, not stored.</p>
    <form id="industryPackForm" data-pack="${esc(pack.id)}">
      <ol class="pack-questions">${questions.map((q, i) => `
        <li><fieldset><legend><strong>${esc(q.id)}</strong> · ${esc(q.dimension)}<br />${esc(q.text)}</legend>${levels(q, i)}</fieldset></li>`).join("")}
      </ol>
      <div class="row wrap"><button type="submit">Score</button><button type="reset" class="secondary">Clear answers</button></div>
    </form>
    <div id="industryPackResult" role="status" aria-live="polite"></div>`;
}

/** Studio's POST /industry-packs/:id/score result, worded as `amc domain pack run` prints it. */
export function industryPackResultHtml(result) {
  const { complete, answered, total } = result.selfAssessment ?? {};
  const evaluated = result.questionResults ?? [];
  const low = evaluated.filter((q) => q.percentage < 50);
  return `<h4>Results</h4>
    <p class="muted">${esc(result.claimLabel ?? "")}</p>
    <ul>
      <li>Self-reported score: ${result.percentage === null
        ? `not evaluated (${(result.notEvaluatedQuestionIds ?? []).length} of ${total} questions unanswered)`
        : `${Number(result.percentage).toFixed(1)} / 100 (L${esc(result.level)})`}</li>
      <li>Self-assessment: ${complete ? "complete" : "incomplete"} (${answered}/${total} answered; self-reported; not a certification)</li>
      <li>Eligible level: ${result.eligibleLevel === null ? "none" : `L${esc(result.eligibleLevel)}`} (self-reported answers cap at L1)</li>
      <li>Evaluated: ${evaluated.length} of ${total} questions</li>
    </ul>
    ${low.length ? `<h5>Gaps (${low.length} below 50%)</h5><ul>${low.map((g) =>
      `<li>${esc(g.id)} ${esc(g.dimension)} — ${Number(g.percentage).toFixed(0)}% (score: ${Number(g.score).toFixed(1)}/${esc(g.weight)})</li>`).join("")}</ul>` : ""}
    ${(result.complianceGaps ?? []).length ? `<h5>Compliance gaps (${result.complianceGaps.length})</h5><ul>${result.complianceGaps.map((gap) =>
      `<li>${esc(gap)}</li>`).join("")}</ul>` : ""}
    <button type="button" class="secondary" id="industryPackDownload">Download JSON result</button>`;
}

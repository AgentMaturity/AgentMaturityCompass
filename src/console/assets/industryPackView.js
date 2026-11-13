// An Industry Pack as the console shows it: what `amc domain pack describe` prints, every question with its full text
// and level descriptions, the command that runs the pack, and a questionnaire Studio scores with the CLI's function.
// Pack answers are self-reported.

// Mirrors QUESTIONNAIRE_NOTICE in src/domains/questionnaireLabel.ts; tests/industryPackView.test.ts keeps them equal.
export const QUESTIONNAIRE_NOTICE = "AI-drafted; not reviewed by a qualified expert; not legal advice.";

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Mirrors levelDescriptor in src/domains/packInsights.ts: L2/L4 use the question's descriptor, else a neutral label.
function levelText(q, level) {
  const own = { 1: q.l1, 2: q.l2, 3: q.l3, 4: q.l4, 5: q.l5 }[level];
  return own && String(own).trim() ? own : level === 2 ? "between L1 and L3" : "between L3 and L5";
}

function questionDetailHtml(pack, q) {
  const risk = Number.isInteger(q.keyRisk) ? (pack.keyRisks ?? [])[q.keyRisk] : undefined;
  return (q.failureMode ? `<br /><span class="muted">Prevents: ${esc(q.failureMode)}</span>` : "")
    + (risk ? `<br /><span class="muted">Key risk ${q.keyRisk + 1}: ${esc(risk)}</span>` : "");
}

/**
 * `pack` is the `pack` field of Studio's GET /industry-packs/:id. Each question is a labelled radio group offering the
 * levels `amc domain pack run` offers (L1-L5); an unanswered question is not evaluated, as in the CLI baseline.
 */
export function industryPackDetailHtml(pack) {
  const questions = pack.questions ?? [];
  const levels = (q, i) => [1, 2, 3, 4, 5].map((level) => [level, levelText(q, level)])
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
    ${(pack.keyRisks ?? []).length ? `<h4>Key risks</h4><ol>${pack.keyRisks.map((risk) => `<li>${esc(risk)}</li>`).join("")}</ol>` : ""}
    <h4>Run it</h4>
    <p>Answer the questions below and choose Score, or run <code>amc domain pack run --pack ${esc(pack.id)}</code>.
      Unanswered questions are not evaluated. The answers are scored, not stored.</p>
    <form id="industryPackForm" data-pack="${esc(pack.id)}">
      <ol class="pack-questions">${questions.map((q, i) => `
        <li><fieldset><legend><strong>${esc(q.id)}</strong> · ${esc(q.dimension)}<br />${esc(q.text)}${questionDetailHtml(pack, q)}</legend>${levels(q, i)}</fieldset></li>`).join("")}
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
    ${insightsHtml(result)}
    <button type="button" class="secondary" id="industryPackDownload">Download JSON result</button>`;
}

/** Per-question levels, the scale note, top gaps and key-risk coverage, when the result carries them. */
function insightsHtml(result) {
  const evaluated = result.questionResults ?? [];
  const gaps = result.topGaps ?? [];
  const risks = result.keyRisks ?? [];
  const coverage = result.riskCoverage ?? [];
  const levels = evaluated.length && evaluated[0].level !== undefined
    ? `<h5>Per-question levels (self-reported)</h5><ul>${evaluated.map((q) => `<li>${esc(q.id)} L${esc(q.level)} · ${esc(q.dimension)}</li>`).join("")}</ul>` : "";
  const note = result.scaleNote && evaluated.length ? `<p class="muted">${esc(result.scaleNote)}</p>` : "";
  const gapList = gaps.length ? `<h5>Top gaps (${gaps.length})</h5><ul>${gaps.map((g) => `<li>${esc(g.id)} ${esc(g.dimension)} — L${esc(g.level)} → L${esc(g.targetLevel)}: ${esc(g.targetDescriptor)}`
    + (g.failureMode ? `<br />Prevents: ${esc(g.failureMode)}` : "") + (g.remediation ? `<br />Next step: ${esc(g.remediation)}` : "")
    + (g.evidence?.length ? `<br />Evidence: ${esc(g.evidence.join(", "))}` : "") + "</li>").join("")}</ul>` : "";
  const riskList = risks.length ? `<h5>Key risks</h5><ol>${risks.map((risk, i) => {
    const row = coverage[i];
    const detail = !row ? "" : row.averageLevel === null ? ` — ${row.questionIds.length} question(s), not evaluated` : ` — mean L${esc(row.averageLevel)}`;
    return `<li>${esc(risk)}${detail}</li>`;
  }).join("")}</ol>${result.weakestRisk ? `<p>Weakest risk: ${esc(result.weakestRisk.risk)} (mean L${esc(result.weakestRisk.averageLevel)})</p>` : ""}` : "";
  return levels + note + gapList + riskList;
}

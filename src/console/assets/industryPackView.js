// An Industry Pack as the console shows it: what `amc domain pack describe` prints, every question with its full text
// and level descriptions, and the command that runs the pack. Pack answers are self-reported; nothing here scores them.

// Mirrors QUESTIONNAIRE_NOTICE in src/domains/questionnaireLabel.ts; tests/industryPackView.test.ts keeps them equal.
export const QUESTIONNAIRE_NOTICE = "AI-drafted; not reviewed by a qualified expert; not legal advice.";

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** `pack` is the `pack` field of Studio's GET /industry-packs/:id. */
export function industryPackDetailHtml(pack) {
  const questions = pack.questions ?? [];
  const levels = (q) => [["L1", q.l1], ["L3", q.l3], ["L5", q.l5]]
    .map(([level, text]) => `<li><strong>${level}</strong> ${esc(text)}</li>`).join("");
  return `<h3>${esc(pack.name)}</h3>
    <p class="muted">${esc(pack.id)} · station ${esc(pack.stationId)} · risk ${esc(pack.riskTier)} · ${questions.length} questions</p>
    <p><strong>Content:</strong> ${esc(pack.contentStatus ?? "experimental")}, self-reported questionnaire. ${QUESTIONNAIRE_NOTICE}</p>
    ${pack.description ? `<p>${esc(pack.description)}</p>` : ""}
    <h4>Regulatory basis</h4>
    <ul>${(pack.regulatoryBasis ?? []).map((basis) => `<li>${esc(basis)}</li>`).join("")}</ul>
    <h4>Run it</h4>
    <p><code>amc domain pack run --pack ${esc(pack.id)}</code></p>
    <h4>Questions</h4>
    <ol class="pack-questions">${questions.map((q) => `
      <li><p><strong>${esc(q.id)}</strong> · ${esc(q.dimension)}</p><p>${esc(q.text)}</p><ul>${levels(q)}</ul></li>`).join("")}
    </ol>`;
}

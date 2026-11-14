// Starting an agent project from an Industry Pack. Pure: pack data in (Studio's GET /industry-packs/list and
// /industry-packs/:id), HTML or plain values out; every pack string goes through esc(). Nothing here is recorded: the
// suggestions fill empty Aspire answers on the page, and the member checks them and presses Save answers.
import { esc } from "./a4View.js";
import { QUESTIONNAIRE_NOTICE } from "./industryPackView.js";

const list = (value) => (Array.isArray(value) ? value : []);
const title = (text) => (typeof text === "string" && text ? text[0].toUpperCase() + text.slice(1) : "");
/** A pack id as a URL carries it: lowercase letters, digits and dashes only, so it is never a path or markup. */
export const packIdOf = (value) => (typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(value) ? value : null);

/** The pack's sector risk tier as Aspire's risk appetite. Aspire has four tiers and no "very-high" or "elevated". */
const RISK_TIER = { critical: "critical", "very-high": "high", high: "high", elevated: "med" };

/**
 * Aspire answers a pack can suggest: its station, a risk appetite from its tier, the governance that tier takes, and one
 * constraint per instrument in its regulatory basis. The pack names risks, not rules for one agent, so what the agent
 * must never do stays the member's to write (the panel lists the pack's key risks beside it).
 */
export function packAnswers(pack) {
  const riskTier = RISK_TIER[pack?.riskTier] ?? "";
  return {
    stations: typeof pack?.stationId === "string" ? pack.stationId : "",
    riskTier,
    governance: riskTier === "high" || riskTier === "critical" ? "regulated" : riskTier ? "standard" : "",
    constraints: list(pack?.regulatoryBasis).map((basis) => `Check whether it applies, and meet it where it does: ${basis} (Industry Pack ${pack.id})`).join("\n")
  };
}

/** The create form's industry choice: every pack, grouped by station; empty when the catalog could not be read. */
export function packSelectHtml(packs, selected) {
  const rows = list(packs).filter((pack) => packIdOf(pack?.packId));
  if (rows.length === 0) return "";
  const stations = [...new Set(rows.map((pack) => String(pack.domain ?? "")))].sort();
  return `<label>Your industry (optional) <select name="pack" aria-describedby="a4PackHint"><option value="">No industry pack</option>${stations.map((station) =>
    `<optgroup label="${esc(title(station))}">${rows.filter((pack) => String(pack.domain ?? "") === station).map((pack) =>
      `<option value="${esc(pack.packId)}"${pack.packId === selected ? " selected" : ""}>${esc(pack.name || pack.packId)}</option>`).join("")}</optgroup>`).join("")}</select></label>
    <p class="muted" id="a4PackHint">Pick the Industry Pack closest to what the agent will do. AMC then suggests the sector, a risk level and the rules to check, and shows
      the risks the pack names. You can change every suggestion. ${esc(QUESTIONNAIRE_NOTICE)}</p>`;
}

/** The project page's panel while it starts from a pack: what was suggested, the pack's risks, and its questionnaire. */
export function packPanelHtml(pack, filled) {
  const risks = list(pack?.keyRisks);
  return `<section class="card a4-pack" aria-labelledby="a4PackTitle"><h3 id="a4PackTitle">Starting from the Industry Pack: ${esc(pack.name)}</h3>
    <p>${filled > 0 ? `AMC filled ${filled} empty answer(s) under Ask from this pack: the sector (stations), the risk appetite, the governance and the constraints.
      They are suggestions and nothing is saved yet. Check each one, change what is wrong, then press Save answers.`
    : "The answers this pack suggests are already filled or saved. Check them under Ask."}</p>
    ${risks.length ? `<h4>Risks this pack names</h4><p class="muted">Use them to write what the agent must never do. AMC does not turn them into rules for you.</p>
      <ol>${risks.map((risk) => `<li>${esc(risk)}</li>`).join("")}</ol>` : ""}
    <p><a class="button secondary" href="./industrypacks?pack=${encodeURIComponent(pack.id)}">Answer this pack's ${list(pack.questions).length} questions</a></p>
    <p class="muted">The pack is a self-reported questionnaire with experimental content. ${esc(QUESTIONNAIRE_NOTICE)}
      Starting from it does not show the agent meets any rule.</p></section>`;
}

// Starting an agent project from an Industry Pack. Pure: pack data in (Studio's GET /industry-packs/list and
// /industry-packs/:id), HTML or plain values out; every pack string goes through esc(). Nothing here is recorded: the
// suggestions fill empty Aspire answers on the page, and the member checks them and presses Save answers.
import { esc } from "./a4View.js";
import { icon } from "./iconSet.js";
import { noticeChip, pictureCard } from "./pageKit.js";
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
/** The Aspire answers a pack suggests (packAnswers' keys); "Use an example" leaves them to the pack. */
export const PACK_FIELDS = ["stations", "riskTier", "governance", "constraints"];
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
export function packSelectHtml(packs, selected, { fold = false, cards = false } = {}) {
  const rows = list(packs).filter((pack) => packIdOf(pack?.packId));
  if (rows.length === 0) return "";
  const stations = [...new Set(rows.map((pack) => String(pack.domain ?? "")))].sort();
  // The Build page asks the field first as picture cards (an unnamed choice: the start request never reads it); the
  // pack list below then shows that field's packs. The select is the same either way.
  const card = (value, words, line, iconName) => pictureCard({ title: words, line, iconName, className: "a4-station-card",
    input: `<input type="radio" name="a4Station" value="${esc(value)}"${value ? "" : " checked"} />` });
  const field = cards ? `<div class="picture-grid a4-station-grid" role="radiogroup" aria-label="Which field is it for?">${card("", "No industry", "A general agent", "agent")}${
    stations.map((station) => card(station, title(station), `${rows.filter((pack) => String(pack.domain ?? "") === station).length} packs`, station)).join("")}</div>` : "";
  return `${field}<label>Your industry (optional) <select name="pack" aria-describedby="a4PackHint"><option value="">No industry pack</option>${stations.map((station) =>
    `<optgroup label="${esc(title(station))}">${rows.filter((pack) => String(pack.domain ?? "") === station).map((pack) =>
      `<option value="${esc(pack.packId)}"${pack.packId === selected ? " selected" : ""}>${esc(pack.name || pack.packId)}</option>`).join("")}</optgroup>`).join("")}</select></label>
    ${fold ? `<details class="notice-chip"><summary>${icon("info", { size: 16 })}<span>AI-drafted, not legal advice</span></summary>` : ""}<p class="muted" id="a4PackHint">Pick the Industry Pack closest to what the agent will do. AMC then suggests the sector, a risk level and the rules to check, and shows
      the risks the pack names. You can change every suggestion. ${esc(QUESTIONNAIRE_NOTICE)}</p>${fold ? "</details>" : ""}`;
}

/** The project page's panel while it starts from a pack: what was suggested, the pack's risks, and its questionnaire. */
export function packPanelHtml(pack, filled) {
  const risks = list(pack?.keyRisks);
  // One line in sight; the pack's risks, its questionnaire and its notice one click away (the notice also as a chip).
  return `<section class="card a4-pack" aria-labelledby="a4PackTitle"><h3 id="a4PackTitle">Starting from the Industry Pack: ${esc(pack.name)}</h3>
    <p>${filled > 0 ? `AMC filled ${filled} empty answer(s) under Ask from this pack: the sector (stations), the risk appetite, the governance and the constraints.
      They are suggestions and nothing is saved yet. Check each one, change what is wrong, then press Save answers.`
    : "The answers this pack suggests are already filled or saved. Check them under Ask."}</p>
    ${noticeChip("AI-drafted, not legal advice", `The pack is a self-reported questionnaire with experimental content. ${QUESTIONNAIRE_NOTICE} Starting from it does not show the agent meets any rule.`)
      .replace('<details class="notice-chip"', '<details class="notice-chip" data-a4-open="pack:notice"')}
    <details class="more-info" data-a4-open="pack:more"><summary>What the pack says</summary><div class="more-info-body">
    ${risks.length ? `<h4>Risks this pack names</h4><p class="muted">Use them to write what the agent must never do. AMC does not turn them into rules for you.</p>
      <ol>${risks.map((risk) => `<li>${esc(risk)}</li>`).join("")}</ol>` : ""}
    <p><a class="button secondary" href="./industrypacks?pack=${encodeURIComponent(pack.id)}">Answer this pack's ${list(pack.questions).length} questions</a></p>
    <p class="muted">The pack is a self-reported questionnaire with experimental content. ${esc(QUESTIONNAIRE_NOTICE)}
      Starting from it does not show the agent meets any rule.</p></div></details></section>`;
}

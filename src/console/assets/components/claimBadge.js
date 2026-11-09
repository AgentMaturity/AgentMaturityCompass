// Claim labels for Studio result pages (P0-23). The words come from the server's claimLabel,
// so the console prints what MCP, the API and the CLI print. "Not evaluated" is a neutral state
// with its reason: never 0, never a failure.

// Mirrors renderClaimLegend in src/claims/eligibility/render.ts; tests/claims/claimLabels.test.ts keeps them equal.
const LEGEND = [
  ["Claim kinds", [
    ["Synthetic example (not evidence)", "example values from a labelled example mode; never evidence, never a level"],
    ["Self-reported", "stated by the agent or its operator, or not backed by observed evidence, including results "
      + "stored by AMC 1.x; numeric self-answers reach at most level 1 and never pass a regulated control"],
    ["Observed", "AMC observed the behaviour at runtime or in an executed test"],
    ["Independently reviewed", "approved by an independent reviewer whose key is pinned"]
  ]],
  ["Status dimensions", [
    ["Result", "pass, fail or not evaluated"],
    ["Evidence", "sufficient, incomplete, stale, contradictory or untrusted"],
    ["Enforcement", "none, advisory, observed or enforced at a named boundary"],
    ["Review", "pending, approved, rejected or expired"],
    ["Applicability", "applicable, not applicable with a rationale, or unresolved"]
  ]],
  ["Results", [
    ["Not evaluated", "AMC could not decide from trustworthy evidence; it is never a pass, a partial result or a default score"]
  ]]
];

export const CLAIM_PAGES = new Set(["home", "transparency", "compliance", "assurance", "passport", "industrypacks", "a4",
  "a4Project", "agent", "compass", "diagnosticView", "evidenceDrilldown", "trust",
  "assuranceRun", "assuranceCert", "standard", "benchmarks", "benchCompare", "benchPortfolio", "benchRegistry", "compare",
  "forecast", "forecastAgent", "forecastNode", "portfolioForecast", "org", "outcomes", "value", "valueAgent", "valueKpis",
  "audit", "auditBinder", "fleet", "systemic"]);

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function segment(label, name) {
  const prefix = `${name}: `;
  return String(label ?? "").split(" · ").find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

/** The kind and result, with all five dimensions in the tooltip; the strip's one legend explains the words. */
export function claimBadge(claim) {
  if (!claim || typeof claim.claimKind !== "string") return "";
  const result = claim.statusDimensions?.result;
  const tone = result === "pass" ? "pill ok" : result === "fail" ? "pill bad" : "pill";
  const kind = segment(claim.claimLabel, "Claim") ?? claim.claimKind;
  const outcome = segment(claim.claimLabel, "Result") ?? "not evaluated";
  return `<span class="claim-badge ${tone}" data-claim-kind="${esc(claim.claimKind)}" title="${esc(claim.claimLabel)}">`
    + `${esc(kind)} · ${esc(outcome)}</span>`;
}

export function claimLegendHtml() {
  return LEGEND.map(([heading, entries]) => `<h3>${heading}</h3><ul>${entries
    .map(([term, text]) => `<li><strong>${esc(term)}</strong>: ${esc(text)}</li>`).join("")}</ul>`).join("\n");
}

/** Collapsed, so the strip stays a few lines above the page's own content. */
export function claimLegend() {
  return `<details id="claim-legend" class="claim-legend"><summary>How to read claim kinds</summary>${claimLegendHtml()}</details>`;
}

/**
 * Shows every claim the page's API calls returned above #app; `onClaims` is api.js's subscription. A page that reloads
 * its results calls the returned reset() first, so a claim the server has since lowered does not stay on the strip.
 */
export function installClaimStrip(page, onClaims) {
  const app = typeof document === "undefined" ? null : document.getElementById("app");
  if (!CLAIM_PAGES.has(page) || !app) return;
  const strip = document.createElement("section");
  strip.id = "claimStrip";
  strip.className = "card claim-strip";
  app.before(strip);
  // The legend renders once, so a reader who opened it keeps it open while more claims arrive.
  strip.innerHTML = `<h3>Claims on this page</h3><p></p>${claimLegend()}`;
  const badgeLine = strip.querySelector("p");
  const seen = new Map();
  const render = () => {
    badgeLine.innerHTML = seen.size > 0 ? [...seen.values()].map(claimBadge).join(" ")
      : `<span class="muted">No labelled result loaded yet.</span>`;
  };
  render();
  onClaims((claims) => {
    for (const claim of claims) seen.set(claim.claimLabel, claim);
    render();
  });
  return { reset() { seen.clear(); render(); } };
}

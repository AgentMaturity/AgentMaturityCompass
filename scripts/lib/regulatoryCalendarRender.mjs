/**
 * Pure renderer for docs/REGULATORY_CALENDAR.md. No I/O, no clock: the same
 * input always yields the same bytes, so the committed calendar can be
 * drift-checked against a fresh render.
 *
 * Inputs:
 * - frameworks: GLOBAL_FRAMEWORKS from src/compliance/globalRegulatory.ts. An
 *   entry without `sources` has an effective date nobody checked against an
 *   official text, so it renders as unverified. Optional fields a dated
 *   register adds (status, lastReviewed, verified, unverifiedReason, sources,
 *   obligations) render when present and are absent when not.
 * - euRiskMatrix: EU_AI_ACT_RISK_MATRIX from the same module, rendered as
 *   recorded.
 * - milestones: the curated sidecar docs/industries/_data/regulatory-milestones.json.
 *   Every entry must carry an official-host source URL and an ISO retrievedAt,
 *   or render() throws (fail closed). When a register framework carries an
 *   obligation with the same frameworkId and date, the register wins and the
 *   sidecar row is marked "superseded by source".
 */

export const REGISTER_SRC = "src/compliance/globalRegulatory.ts";
export const MILESTONES_PATH = "docs/industries/_data/regulatory-milestones.json";

/** Hosts whose pages may be cited as the source of a curated milestone. A subdomain of a listed host is accepted. */
export const OFFICIAL_HOSTS = Object.freeze([
  "europa.eu", "govinfo.gov", "federalregister.gov", "nist.gov", "leg.colorado.gov", "parl.ca",
  "pib.gov.in", "meity.gov.in", "iso.org", "ecfr.gov", "legislation.gov.uk"
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cell = (v) => String(v).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
const present = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const orDash = (v) => (present(v) ? cell(v) : "—");
const list = (v) => (Array.isArray(v) ? v : []);
const DATE_KEYS = ["appliesFrom", "date", "effectiveDate"];
const LABEL_KEYS = ["title", "label", "description", "article"];
const pick = (o, keys) => keys.map((k) => o?.[k]).find(present);

function validateFrameworks(frameworks) {
  if (!Array.isArray(frameworks)) throw new TypeError("register must be an array of frameworks");
  frameworks.forEach((f, i) => {
    if (!f || typeof f !== "object" || !present(f.frameworkId)) throw new TypeError(`framework #${i} has no frameworkId`);
  });
}

export function isOfficialHost(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return OFFICIAL_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
}

/** Throws on the first curated milestone that is unsourced, undated or cites a non-official host. */
export function validateMilestones(milestones) {
  if (!Array.isArray(milestones)) throw new TypeError("milestones must be an array");
  milestones.forEach((m, i) => {
    const where = `milestone #${i}${present(m?.label) ? ` (${m.label})` : ""}`;
    if (!m || typeof m !== "object") throw new TypeError(`${where} is not an object`);
    if (!present(m.frameworkId) && !present(m.instrument)) throw new TypeError(`${where} names neither frameworkId nor instrument`);
    if (!ISO_DATE.test(String(m.date ?? ""))) throw new TypeError(`${where} has no ISO date`);
    if (!present(m.label) || !present(m.status)) throw new TypeError(`${where} needs label and status`);
    if (!present(m.source?.title)) throw new TypeError(`${where} has no source title`);
    if (!isOfficialHost(m.source?.url)) throw new TypeError(`${where} source URL is not on an official host: ${m.source?.url}`);
    if (!ISO_DATE.test(String(m.source?.retrievedAt ?? ""))) throw new TypeError(`${where} has no ISO source.retrievedAt`);
  });
}

function verification(f) {
  if (f.verified === false) return `unverified${present(f.unverifiedReason) ? ` (${cell(f.unverifiedReason)})` : ""}`;
  if (list(f.sources).length === 0) return "unverified (no source in register)";
  return f.verified === true ? "verified" : "sourced";
}

function sourceList(f) {
  const sources = list(f.sources);
  if (sources.length === 0) return ["- Sources: none recorded in the register."];
  return sources.map((s) => `- Source: ${orDash(s?.title)} — <${s?.url ?? ""}>${present(s?.retrievedAt) ? `, retrieved ${cell(s.retrievedAt)}` : ", retrieval date not recorded"}`);
}

const dateOf = (f) => (present(f.effectiveDate) ? String(f.effectiveDate) : null);

/** Earliest first; unknown dates last; ties broken by frameworkId so output is stable. */
function byDate(a, b) {
  const da = dateOf(a), db = dateOf(b);
  if (da !== db) return da === null ? 1 : db === null ? -1 : da < db ? -1 : 1;
  return String(a.frameworkId) < String(b.frameworkId) ? -1 : 1;
}

function sourceObligations(frameworks) {
  return frameworks.flatMap((f) => list(f.obligations).map((o) => ({ f, date: pick(o, DATE_KEYS), label: pick(o, LABEL_KEYS) })));
}

/** The register wins: a sidecar row whose frameworkId and date match a register obligation is superseded. */
function supersededBy(m, obligations) {
  if (!present(m.frameworkId)) return null;
  const hit = obligations.find((o) => o.f.frameworkId === m.frameworkId && String(o.date) === m.date);
  return hit ? `superseded by source (\`${cell(hit.f.frameworkId)}\` obligation)` : null;
}

function timeline(sorted) {
  const out = ["## Timeline", "", "| Effective date | Framework | Jurisdiction | Register status | Last reviewed | Verification | Declared mapping |", "|---|---|---|---|---|---|---|"];
  for (const f of sorted) {
    out.push(`| ${dateOf(f) ? cell(dateOf(f)) : "unknown"} | ${orDash(f.name)} (\`${cell(f.frameworkId)}\`) | ${orDash(f.jurisdiction)} | ${orDash(f.status)} | ${orDash(f.lastReviewed)} | ${verification(f)} | ${orDash(f.mappingStatus)} |`);
  }
  return out;
}

function datedObligations(obligations) {
  if (obligations.length === 0) return [];
  const out = ["", "## Dated obligations", "", "| Applies from | Framework | Obligation |", "|---|---|---|"];
  const sorted = [...obligations].sort((a, b) => (present(a.date) ? String(a.date) : "~").localeCompare(present(b.date) ? String(b.date) : "~"));
  for (const d of sorted) out.push(`| ${present(d.date) ? cell(d.date) : "unknown"} | \`${cell(d.f.frameworkId)}\` | ${orDash(d.label)} |`);
  return out;
}

function curated(milestones, obligations) {
  const out = [
    "", "## Externally sourced milestones (curated)", "",
    `These rows are not register data. They come from \`${MILESTONES_PATH}\`; each was read at the official URL shown on its retrieval date. A row the register also carries is marked superseded by source.`,
    ""
  ];
  if (milestones.length === 0) return [...out, "No curated milestones recorded."];
  out.push("| Date | Instrument | Milestone | Status | Source |", "|---|---|---|---|---|");
  const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date) || String(a.instrument ?? a.frameworkId).localeCompare(String(b.instrument ?? b.frameworkId)) || a.label.localeCompare(b.label));
  for (const m of sorted) {
    const name = present(m.instrument) ? cell(m.instrument) : `\`${cell(m.frameworkId)}\``;
    const status = supersededBy(m, obligations) ?? cell(m.status);
    out.push(`| ${m.date} | ${name} | ${cell(m.label)} | ${status} | [${cell(m.source.title)}](${m.source.url}), retrieved ${m.source.retrievedAt} |`);
  }
  return out;
}

function riskMatrix(rows) {
  const out = ["", "## EU AI Act risk matrix (as recorded)", "", "Default risk levels and annex references are the register's own entries, copied as recorded and not checked against the Regulation text.", ""];
  if (rows.length === 0) return [...out, "No risk-matrix rows recorded."];
  out.push("| Sector | Use case | Default risk | Annex reference (as recorded) | Modifiers |", "|---|---|---|---|---|");
  for (const r of rows) {
    const mods = list(r?.modifiers).map((m) => `${cell(m?.condition ?? "—")} → ${cell(m?.riskChange ?? "—")}`).join("; ");
    out.push(`| ${orDash(r?.sector)} | ${orDash(r?.useCase)} | ${orDash(r?.defaultRisk)} | ${orDash(r?.annexRef)} | ${mods || "—"} |`);
  }
  return out;
}

function frameworkDetail(sorted) {
  const out = ["", "## Frameworks", ""];
  for (const f of sorted) {
    out.push(`### ${orDash(f.name)} (\`${cell(f.frameworkId)}\`)`, "");
    out.push(`- Jurisdiction: ${orDash(f.jurisdiction)}`, `- Effective date (as recorded): ${dateOf(f) ? cell(dateOf(f)) : "unknown"}`);
    out.push(`- Verification: ${verification(f)}`, ...sourceList(f), "");
    const rs = list(f.keyRequirements);
    if (rs.length === 0) { out.push("No key requirements recorded.", ""); continue; }
    out.push("| Requirement | Article | Title | AMC mapping (declared) | Evidence type | Declared status |", "|---|---|---|---|---|---|");
    for (const r of rs) {
      out.push(`| \`${cell(r?.requirementId ?? "—")}\` | ${orDash(r?.article)} | ${orDash(r?.title)} | ${present(r?.amcMapping) ? `\`${cell(r.amcMapping)}\`` : "—"} | ${orDash(r?.evidenceType)} | ${orDash(r?.complianceStatus)} |`);
    }
    out.push("");
  }
  return out;
}

/**
 * @param {object[]} frameworks GLOBAL_FRAMEWORKS (or a fixture of the same shape)
 * @param {{euRiskMatrix?: object[], milestones?: object[]}} [extra]
 */
export function renderCalendar(frameworks, { euRiskMatrix = [], milestones = [] } = {}) {
  validateFrameworks(frameworks);
  if (!Array.isArray(euRiskMatrix)) throw new TypeError("euRiskMatrix must be an array");
  validateMilestones(milestones);
  const sorted = [...frameworks].sort(byDate);
  const reqs = sorted.reduce((n, f) => n + list(f.keyRequirements).length, 0);
  const unverified = sorted.filter((f) => verification(f).startsWith("unverified")).length;
  const obligations = sourceObligations(sorted);
  const out = [
    "# Regulatory calendar",
    "",
    "<!-- Generated by scripts/gen-regulatory-calendar.mjs. Do not edit by hand. -->",
    "<!-- Regenerate: node scripts/gen-regulatory-calendar.mjs   Drift check: node scripts/gen-regulatory-calendar.mjs --check -->",
    "",
    `Source: \`GLOBAL_FRAMEWORKS\` and \`EU_AI_ACT_RISK_MATRIX\` in \`${REGISTER_SRC}\` — ${sorted.length} frameworks, ${reqs} key requirements, ${euRiskMatrix.length} EU AI Act risk-matrix rows; ${unverified} of ${sorted.length} frameworks are unverified. Curated milestones: ${milestones.length}, from \`${MILESTONES_PATH}\`.`,
    "",
    "## How to read this calendar",
    "",
    "- The timeline, framework tables and risk matrix are copied from the register. They add nothing the register does not record.",
    "- **Verification** is `unverified` when the register entry carries no official source, or marks itself unverified. Treat such a date as a lead to check, not as a fact.",
    "- `mappingStatus` and each requirement's `complianceStatus` are declared by the register's authors. They are not audit results and say nothing about any deployed agent.",
    "- The curated milestones are kept apart from register data and each cites the official page it was read from.",
    "- This page is not legal advice.",
    "",
    ...timeline(sorted),
    ...datedObligations(obligations),
    ...curated(milestones, obligations),
    ...riskMatrix(euRiskMatrix),
    ...frameworkDetail(sorted)
  ];
  return `${out.join("\n").trimEnd()}\n`;
}

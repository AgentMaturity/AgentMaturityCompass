// Applies round-2 register batches (EU/intl + US) and their refuter requiredFixes
// onto src/compliance/regulatory/register.json. Scratch tool; not a repo generator.
import { readFileSync, writeFileSync } from "node:fs";

const WT = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-10";
const R2 = "/Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2";
const REG = `${WT}/src/compliance/regulatory/register.json`;
const EU_REVIEW = "AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/register-eu-intl/review.json";
const US_REVIEW = "AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/register-us/review.json";

const cur = JSON.parse(readFileSync(REG, "utf8"));
const eu = JSON.parse(readFileSync(`${R2}/register-eu-intl/entries.json`, "utf8"));
const us = JSON.parse(readFileSync(`${R2}/register-us/entries.json`, "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const fail = (m) => { throw new Error(m); };
const find = (arr, id) => arr.find((e) => e.id === id) ?? fail(`missing ${id}`);
const kd = (e, id) => e.keyDates.find((k) => k.id === id) ?? fail(`missing keyDate ${e.id}.${id}`);

// ---- policy -------------------------------------------------------------
const REJECTED_HOSTS = ["aiverifyfoundation.sg"]; // foundation, not a regulator (EU review requiredFixes[5])
const US_HOSTS = ["whitehouse.gov", "ecfr.gov", "govinfo.gov", "reginfo.gov", "ftc.gov", "fcc.gov", "cisa.gov", "epa.gov", "eeoc.gov", "ada.gov", "federalreserve.gov", "finra.org", "nyc.gov", "coag.gov", "calcivilrights.ca.gov", "nysed.gov", "ohio.gov", "illinois.gov", "ilga.gov", "utah.gov"];
const policy = clone(cur.policy);
for (const h of [...eu.policy.officialHosts, ...US_HOSTS]) {
  if (!REJECTED_HOSTS.includes(h) && !policy.officialHosts.includes(h)) policy.officialHosts.push(h);
}
policy.note += " A keyDate whose basis names a dated program receipt (research/<station>/digest.json, read 2026-10-03) counts as read in the 2026-10-03 review; its url and retrievedAt are the receipt's. status \"superseded\" also covers revoked and withdrawn instruments; taskStatus says which. A keyDate with observation=true records a retrieval observation, not a legal date, and is not a calendar event. supersedes/supersededBy hold register entry ids only; supersedesInstruments names predecessors that have no entry.";
policy.officialHostsNote += " finra.org is a self-regulatory organisation, cited only for its own rules; oecd.org, oecd.ai and coe.int are the intergovernmental publishers of their own instruments; etsi.org is a European standards organisation. aiverifyfoundation.sg was proposed and rejected (a foundation, not a regulator).";

// ---- entries ------------------------------------------------------------
const euEntries = clone(eu.entries);
const usEntries = clone(us.entries);
const euById = new Map(euEntries.map((e) => [e.id, e]));
const replaced = euEntries.filter((e) => e.s5Action === "replace-existing").map((e) => e.id);
const kept = cur.entries.filter((e) => !euById.has(e.id));
const merged = [
  ...cur.entries.map((e) => (euById.has(e.id) ? euById.get(e.id) : clone(e))),
  ...euEntries.filter((e) => e.s5Action === "add"),
  ...usEntries,
];

// Backfill keyDate url/retrievedAt on the S5-carried entries from the source each date was read from.
const S5_DATE_SOURCE = {
  "us-nist-ai-rmf": { "*": 0 }, "us-nist-ai-600-1": { "*": 0 }, "us-co-sb26-189": { "*": 0 },
  "us-co-sb24-205": { signed: 0, originalEffective: 0, delayedEffective: 1 },
  "br-lgpd": { "*": 0 }, "in-dpdp": { "*": 0 },
};
for (const e of kept) {
  const map = S5_DATE_SOURCE[e.id] ?? fail(`no date-source map for kept entry ${e.id}`);
  const m = merged.find((x) => x.id === e.id);
  for (const k of m.keyDates) {
    const src = m.sources[map[k.id] ?? map["*"]];
    k.url = src.url;
    k.retrievedAt = src.retrievedAt;
    k.basis = `S5 review 2026-10-03: ${src.title}`;
  }
}

const get = (id) => find(merged, id);

// EU requiredFixes[0]: EHDS entry into force is 2025-03-25 (OJ Art. 105 twentieth-day rule + Cellar).
{
  const e = get("eu-ehds");
  Object.assign(kd(e, "entryIntoForce"), {
    date: "2025-03-25",
    verified: true,
    url: "https://publications.europa.eu/resource/celex/32025R0327",
    retrievedAt: "2026-10-04T05:06:59Z",
    basis: `Regulation (EU) 2025/327 Art. 105 (in force on the twentieth day following publication) with Cellar date_publication 2025-03-05 and resource_legal_date_entry-into-force 2025-03-25; confirmed in ${EU_REVIEW} refuted[0]`,
    note: "The Commission EHDS page states 26 March 2025; the OJ article and Cellar give 25 March 2025, which the register follows.",
  });
  e.openQuestions = e.openQuestions.filter((q) => !q.startsWith("Cellar lists entry-into-force 2025-03-25"));
}
// EU requiredFixes[1]: Machinery application date is contested between two official readings.
{
  const k = kd(get("eu-machinery"), "application");
  k.verified = false;
  k.note = `Unverified: Cellar gives 2027-01-20, the OJ Art. 54 text as published reads 14 January 2027, and the corrigendum was not read (${EU_REVIEW} refuted[1]).`;
}
// EU requiredFixes[4]: the validator has no "withdrawn" status (script outside this apply's write scope).
{
  const e = get("eu-ai-liability-directive");
  e.status = "superseded";
  e.taskStatus = "withdrawn";
}
// EU requiredFixes[5]: aiverifyfoundation.sg rejected -> the GenAI framework facts lose their only source.
{
  const e = get("sg-mgf-genai-agentic");
  e.sources = e.sources.filter((s) => !REJECTED_HOSTS.some((h) => new URL(s.url).hostname.endsWith(h)));
  e.keyDates = e.keyDates.filter((k) => k.id !== "genaiPublished");
  e.agentObligations = e.agentObligations.filter((o) => !o.ref.startsWith("MGF GenAI"));
  e.instrument = "Model AI Governance Framework for Agentic AI";
  e.citation = "MDDI / IMDA, MGF for Agentic AI (22 January 2026)";
  e.openQuestions.push("The Model AI Governance Framework for Generative AI (30 May 2024) is published on aiverifyfoundation.sg, which is not on policy.officialHosts (a foundation, not a regulator); it is not registered until read from an IMDA or MDDI page.");
}

// US requiredFixes[0]: CMS-0057-F decision-timeframe and denial-reason duties start 2026-01-01.
{
  const k = kd(get("us-cms-0057-f"), "2026-impacted-payers-must-giv");
  Object.assign(k, {
    date: "2026-01-01",
    event: "MA organizations and state Medicaid and CHIP FFS programs must give a specific reason for denials and decide within 72 hours (expedited) or 7 calendar days (standard)",
    verified: true,
    url: "https://www.federalregister.gov/documents/full_text/text/2024/02/08/2024-00895.txt",
    retrievedAt: "2026-10-04",
    basis: `Federal Register full text of CMS-0057-F read 2026-10-04 (${US_REVIEW} refuted[0]): compliance dates starting January 1, 2026`,
  });
}
// US requiredFixes[2]: supersedes/supersededBy hold entry ids only; free-text predecessors move to supersedesInstruments.
for (const e of merged) {
  if (Array.isArray(e.supersedes)) {
    const ids = e.supersedes.filter((s) => merged.some((x) => x.id === s));
    const text = e.supersedes.filter((s) => !merged.some((x) => x.id === s));
    if (text.length) e.supersedesInstruments = text;
    if (ids.length) e.supersedes = ids; else delete e.supersedes;
  }
}
delete get("us-eo-14110").supersededBy; // EO 14148 revoked it, not EO 14179 (US review refuted[1])
delete get("us-eo-14179").supersedes;
get("us-co-sb26-189").supersedes = ["us-co-sb24-205"]; // S5 obligation: "Repealed and reenacted by SB26-189"
get("us-co-sb24-205").supersededBy = "us-co-sb26-189";
// US requiredFixes[4]: three keyDates are retrieval observations, not regulatory events.
for (const [id, k] of [["us-eeoc-ai-ta", "2026-10-03-measured-eeoc-ai-guidanc"], ["us-fda-ai-dsf-draft", "2026-10-03-still-draft-per-the-fda"], ["us-qmsr", "2026-10-01-ecfr-shows-820-20-820-30"]]) {
  kd(get(id), k).observation = true;
}
// Null url/retrievedAt on two unverified keyDates: point at the page the date was sought on.
{
  const k = kd(get("us-ca-sb53"), "2026-01-01-operative-date-inferred");
  Object.assign(k, { url: "https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260SB53", retrievedAt: "2026-10-03T17:02:19Z", note: "The status page read does not state an operative date." });
  const u = kd(get("us-ut-ai-policy-act"), "2024-sb-149-enacted-year-as-g");
  Object.assign(u, { url: "https://le.utah.gov/xcode/Title13/Chapter72/13-72-S1.html", retrievedAt: "2026-10-04T05:12:00Z", note: "Page unreachable (ECONNREFUSED 2026-10-04T05:06Z); the year comes from the cross-framework digest's instrument name." });
}
// EU batch: 16 unverified keyDates have no url or cite ISO's open-data blob store (not an official host).
// Point each at the entry's primary source, where the date was sought, and say the date is not stated there.
for (const e of merged) {
  for (const k of e.keyDates) {
    const blob = typeof k.url === "string" && k.url.includes("isopublicstorageprod.blob.core.windows.net");
    if (k.url && !blob) continue;
    if (k.verified) fail(`verified keyDate without official url: ${e.id}.${k.id}`);
    const src = e.sources[0];
    const was = blob ? `date from the ISO Open Data CSV (isopublicstorageprod.blob.core.windows.net, read ${k.retrievedAt}, not an official host) per the receipt` : "the date is not stated on this page";
    k.note = `${k.note ? `${k.note}; ` : ""}url is the entry's primary source; ${was}.`;
    k.url = src.url;
    k.retrievedAt = src.retrievedAt;
  }
}
// US review confirmedCorrectFlags[0]: HB26-1263 signing date 2026-05-29 confirmed on the legislature page.
{
  const e = get("us-co-hb26-1263");
  Object.assign(kd(e, "2026-05-29-signed-leg-colorado-gov"), {
    verified: true,
    basis: `leg.colorado.gov/bills/hb26-1263 read 2026-10-04 by the author and again by ${US_REVIEW} (confirmedCorrectFlags[0]); the digest's 2026-07-01 from coag.gov/ai is the outlier`,
  });
  e.openQuestions = e.openQuestions.filter((q) => !q.startsWith("Signing date conflict"));
}

// Entry-level verified must follow its parts (same rule as the currency script).
const flipped = [];
for (const e of merged) {
  delete e.s5Action; // batch bookkeeping, meaningless once applied
  const before = e.verified;
  const open = [...e.agentObligations, ...e.keyDates].filter((x) => x.verified !== true).length
    + (e.sources.some((s) => s.fetched === true) ? 0 : 1) + e.openQuestions.length;
  e.verified = open === 0;
  if (before !== e.verified) flipped.push(`${e.id}:${before}->${e.verified}`);
}
console.log("flipped", flipped);

// ---- write, one leaf object per line like the hand-written file ----------
const leaf = (o) => JSON.stringify(o).replace(/":/g, "\": ").replace(/,"/g, ", \"").replace(/^\{/, "{ ").replace(/\}$/, " }");
const strArr = (a) => `[${a.map((s) => JSON.stringify(s)).join(", ")}]`;
function entryText(e) {
  const lines = Object.entries(e).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return `      ${JSON.stringify(k)}: [\n${v.map((o) => `        ${leaf(o)}`).join(",\n")}\n      ]`;
    if (Array.isArray(v)) return `      ${JSON.stringify(k)}: ${strArr(v)}`;
    return `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `    {\n${lines.join(",\n")}\n    }`;
}
const out = `{\n  "schemaVersion": 1,\n  "policy": {\n    "reviewWindowDays": ${policy.reviewWindowDays},\n    "note": ${JSON.stringify(policy.note)},\n    "officialHostsNote": ${JSON.stringify(policy.officialHostsNote)},\n    "officialHosts": ${strArr(policy.officialHosts)}\n  },\n  "entries": [\n${merged.map(entryText).join(",\n")}\n  ]\n}\n`;
JSON.parse(out); // round-trip check
const back = JSON.parse(out);
if (JSON.stringify(back.entries) !== JSON.stringify(merged)) fail("serialiser changed data");
writeFileSync(REG, out);
console.log(JSON.stringify({ replaced, kept: kept.map((e) => e.id), entries: merged.length, verified: merged.filter((e) => e.verified).length, hosts: policy.officialHosts.length }));

// Monitor repair round (refute-register.json required_fixes 1-2). Scratch tool; run once from the worktree root.
import { readFileSync, writeFileSync } from "node:fs";

const REG = "src/compliance/regulatory/register.json";
const S5 = "67d73223 src/compliance/regulatory/register.json";
const RULING =
  "Root ruling AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/map/root-decisions.md:26: entries for China, Brazil, India and Japan are allowed only as verified:false with the reason and no obligations asserted.";
const reg = JSON.parse(readFileSync(REG, "utf8"));
const byId = (id) => reg.entries.find((e) => e.id === id) ?? (() => { throw new Error(`missing ${id}`); })();
const unassert = (source) => (o) => ({ ...o, verified: false, basis: `${RULING} Recorded from ${source}; not asserted as an obligation.` });

// Fix 1: BR and IN follow the ruling. in-dpdp "s. 10 / s. 16" came from a search index (page not read): no official source, removed.
const br = byId("br-lgpd");
const inn = byId("in-dpdp");
const patched = {
  "br-lgpd": {
    ...br,
    agentObligations: br.agentObligations.map(unassert("the Planalto text read 2026-10-03")),
    openQuestions: [RULING, ...br.openQuestions],
  },
  "in-dpdp": {
    ...inn,
    agentObligations: inn.agentObligations.filter((o) => o.ref !== "s. 10 / s. 16").map(unassert("the PIB release of 14 Nov 2025 read 2026-10-03")),
    openQuestions: [RULING, ...inn.openQuestions],
  },
};

// Fix 2: restore the S5-verified facts the EU-batch replacement dropped, with their S5 sources (still listed in each entry's sources).
const ai = byId("eu-ai-act");
const art111 = "AI Act Service Desk Article 111 (https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-111, retrieved 2026-10-03)";
patched["eu-ai-act"] = {
  ...ai,
  agentObligations: [
    ...ai.agentObligations,
    {
      ref: "Art. 111(3)",
      summary: "Providers of general-purpose AI models placed on the market before 2 August 2025 must comply by 2 August 2027.",
      verified: true,
      basis: `restored from ${S5} (S5 review 2026-10-03, verified there); source ${art111}; the date matches keyDate gpaiLegacyModelsDeadline read in OJ text CELEX 32024R1689 2026-10-04`,
    },
    {
      ref: "Art. 111(4)",
      summary: "Providers of systems generating synthetic content placed on the market before 2 August 2026 must comply with Art. 50(2) by 2 December 2026.",
      verified: true,
      basis: `restored from ${S5} (S5 review 2026-10-03, verified there); source ${art111}; the date matches keyDate newProhibitionsAndArt50_2Transition read in OJ text CELEX 32026R1744 2026-10-04`,
    },
  ],
};
const md = byId("eu-mdr-ivdr");
patched["eu-mdr-ivdr"] = {
  ...md,
  agentObligations: [
    ...md.agentObligations,
    {
      ref: "AI Act Art. 6(1) link",
      summary: "Both Regulations are listed in AI Act Annex I, Section A (items 11 and 12), so AI that is such a device or its safety component can be high-risk under AI Act Art. 6(1); those AI Act obligations apply from 2 August 2028.",
      verified: true,
      basis: `restored from ${S5} (S5 review 2026-10-03, verified there); source AI Act Service Desk Annex I (https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-1) and Article 113, retrieved 2026-10-03`,
    },
  ],
  keyDates: [
    {
      id: "mdrApplication",
      date: "2021-05-26",
      event: "MDR applies",
      verified: true,
      url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations_en",
      retrievedAt: "2026-10-03",
      basis: `restored from ${S5} (S5 review 2026-10-03, verified there); source European Commission, Medical devices — new regulations`,
    },
    ...md.keyDates,
  ],
};

// Same serialiser as apply-register.mjs (one leaf object per line), so untouched entries stay byte-identical.
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
const { policy } = reg;
const serialise = (entries) => `{\n  "schemaVersion": 1,\n  "policy": {\n    "reviewWindowDays": ${policy.reviewWindowDays},\n    "note": ${JSON.stringify(policy.note)},\n    "officialHostsNote": ${JSON.stringify(policy.officialHostsNote)},\n    "officialHosts": ${strArr(policy.officialHosts)}\n  },\n  "entries": [\n${entries.map(entryText).join(",\n")}\n  ]\n}\n`;
if (serialise(reg.entries) !== readFileSync(REG, "utf8")) throw new Error("serialiser does not reproduce the committed file");
const merged = reg.entries.map((e) => patched[e.id] ?? e);
const out = serialise(merged);
if (JSON.stringify(JSON.parse(out).entries) !== JSON.stringify(merged)) throw new Error("serialiser changed data");
writeFileSync(REG, out);
console.log(Object.keys(patched).join(", "));

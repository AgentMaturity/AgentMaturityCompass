import type { ComplianceFramework } from "../frameworks.js";

// Short operator-typed names (CLI flags, config files). Keys are lower case.
export const frameworkAliases: Readonly<Record<string, ComplianceFramework>> = {
  "hipaa": "HIPAA", "sox": "SOX", "fedramp": "FEDRAMP",
  "soc2": "SOC2", "soc-2": "SOC2", "gdpr": "GDPR",
  "eu-ai-act": "EU_AI_ACT", "eu_ai_act": "EU_AI_ACT",
  "nist": "NIST_AI_RMF", "nist-ai-rmf": "NIST_AI_RMF", "nist_ai_rmf": "NIST_AI_RMF",
  "iso-42001": "ISO_42001", "iso42001": "ISO_42001",
  "iso-27001": "ISO_27001", "iso27001": "ISO_27001",
  "mitre": "MITRE_ATLAS", "mitre-atlas": "MITRE_ATLAS",
  "owasp": "OWASP_API_TOP10", "owasp-llm": "OWASP_API_TOP10", "owasp-api": "OWASP_API_TOP10",
  "pci": "PCI_DSS", "pci-dss": "PCI_DSS", "pcidss": "PCI_DSS", "pci_dss": "PCI_DSS",
  "nis-2": "NIS2",
  "hti-1": "HHS_HTI_1", "onc-hti-1": "HHS_HTI_1", "onc_hti_1": "HHS_HTI_1", "hhs-hti-1": "HHS_HTI_1",
  "nist-ai-600-1": "NIST_AI_600_1", "colorado-ai-act": "CO_AI_ACT", "traiga": "TX_TRAIGA",
  "ca-ai-laws": "CA_AI_LAWS", "korea-ai-basic-act": "KR_AI_BASIC_ACT",
  // Regulatory register ids (src/compliance/regulatory/register.json) and official instrument names.
  "eu-dora": "DORA", "regulation (eu) 2022/2554": "DORA", "digital operational resilience act": "DORA",
  "eu-nis2": "NIS2", "directive (eu) 2022/2555": "NIS2", "implementing regulation (eu) 2024/2690": "NIS2",
  "us-nist-ai-600-1": "NIST_AI_600_1", "us-co-sb24-205": "CO_AI_ACT", "us-co-sb26-189": "CO_AI_ACT",
};

// Versioned or clause-qualified names as industry packs cite them ("GDPR Art. 9", "PCI DSS v4.0").
// Patterns are anchored at the start so a different instrument ("NIST CSF 2.0") stays unresolved,
// and "CCPA/CPRA" stays unresolved: CA_AI_LAWS covers only the CCPA ADMT regulations.
export const frameworkNamePatterns: ReadonlyArray<readonly [RegExp, ComplianceFramework]> = [
  [/^(eu )?gdpr\b/, "GDPR"],
  [/^eu ai act\b/, "EU_AI_ACT"],
  [/^hipaa\b/, "HIPAA"],
  [/^iso(\/iec)? ?27001\b/, "ISO_27001"],
  [/^iso(\/iec)? ?42001\b/, "ISO_42001"],
  [/^nist ai rmf\b/, "NIST_AI_RMF"],
  [/^owasp api (security )?top ?10\b/, "OWASP_API_TOP10"],
  [/^pci ?dss\b/, "PCI_DSS"],
  [/^soc ?2\b/, "SOC2"],
  [/^(eu )?dora\b/, "DORA"],
  [/^(eu )?nis ?2\b/, "NIS2"],
  [/^((hhs|onc|astp\/onc) )?(hti-1\b|45 cfr (§ ?|part )?170\b)/, "HHS_HTI_1"],
  [/^nist ai 600-1\b/, "NIST_AI_600_1"],
  [/^(colorado ai act\b|(colorado )?sb ?(24-205|26-189)\b)/, "CO_AI_ACT"],
  [/^(texas )?(traiga\b|hb ?149\b)/, "TX_TRAIGA"],
  [/^(california )?(sb ?53\b|ab ?2013\b|ccpa admt\b)/, "CA_AI_LAWS"],
  [/^(korea|south korea)n? ai (basic|framework) act\b/, "KR_AI_BASIC_ACT"],
];

import { descopedFrameworkNamePattern, frameworkAliases, frameworkNamePatterns } from "./frameworks/aliases.js";

export type ComplianceFramework =
  | "SOC2" | "NIST_AI_RMF" | "ISO_27001" | "ISO_42001" | "EU_AI_ACT" | "GDPR" | "MITRE_ATLAS"
  | "OWASP_API_TOP10" | "HIPAA" | "SOX" | "FEDRAMP" | "PCI_DSS" | "DORA" | "NIS2" | "HHS_HTI_1"
  | "NIST_AI_600_1" | "CO_AI_ACT" | "TX_TRAIGA" | "CA_AI_LAWS" | "KR_AI_BASIC_ACT";

export interface ComplianceFrameworkFamily {
  framework: ComplianceFramework;
  displayName: string;
  categories: string[];
}

export const complianceFrameworkFamilies: ComplianceFrameworkFamily[] = [
  {
    framework: "SOC2",
    displayName: "SOC 2 (Trust Services Categories)",
    categories: [
      "Security",
      "Availability",
      "Confidentiality",
      "Processing Integrity",
      "Privacy"
    ]
  },
  {
    framework: "NIST_AI_RMF",
    displayName: "NIST AI RMF (Functions)",
    categories: ["Govern", "Map", "Measure", "Manage"]
  },
  {
    framework: "ISO_27001",
    displayName: "ISO/IEC 27001 (Control Families)",
    categories: [
      "Access Control",
      "Logging & Monitoring",
      "Incident Management",
      "Supplier Security",
      "Risk Management"
    ]
  },
  {
    framework: "ISO_42001",
    // ISO/IEC 42005 is descoped (root ruling 2026-10-04): its two categories keep their names so bound evidence still
    // resolves, but no ISO/IEC 42005 or 42006 clause text was read (familyReview flags it).
    displayName: "ISO/IEC 42001:2023 (ISO 42005 and 42006 categories unverified: source unreachable)",
    categories: [
      "Clause 4 Context",
      "Clause 5 Leadership",
      "Clause 6 Planning",
      "Clause 7 Support",
      "Clause 8 Operation",
      "Clause 9 Performance Evaluation",
      "Clause 10 Improvement",
      "ISO 42005 Impact Assessment",
      "ISO 42006 Conformity Evidence"
    ]
  },
  {
    framework: "EU_AI_ACT",
    displayName: "EU AI Act (Regulation (EU) 2024/1689) — High-Risk AI Obligations",
    categories: [
      "Art. 9 Risk Management",
      "Art. 10 Data Governance",
      "Art. 11 Technical Documentation",
      "Art. 12 Record-Keeping",
      "Art. 13 Transparency",
      "Art. 14 Human Oversight",
      "Art. 15 Accuracy Robustness Cybersecurity",
      "Art. 17 Quality Management",
      "Art. 27 FRIA",
      "Art. 72 Post-Market Monitoring",
      "Art. 73 Incident Reporting",
      "Art. 86 Right to Explanation"
    ]
  },
  {
    framework: "GDPR",
    displayName: "GDPR (Regulation (EU) 2016/679) — Data Protection Principles",
    categories: [
      "Art. 5 Lawfulness Fairness Transparency",
      "Art. 5 Purpose Limitation",
      "Art. 5 Data Minimisation",
      "Art. 5 Accuracy",
      "Art. 5 Storage Limitation",
      "Art. 5 Integrity and Confidentiality",
      "Art. 5 Accountability",
      "Art. 6 Lawful Basis",
      "Art. 15-22 Data Subject Rights",
      "Art. 25 Data Protection by Design",
      "Art. 32 Security of Processing",
      "Art. 33-34 Breach Notification",
      "Art. 35 DPIA"
    ]
  },
  {
    framework: "MITRE_ATLAS",
    displayName: "MITRE ATLAS (Adversarial Threat Landscape for AI Systems)",
    categories: [
      "Reconnaissance",
      "Resource Development",
      "Initial Access",
      "ML Model Access",
      "Execution",
      "Persistence",
      "Evasion",
      "Discovery",
      "Collection",
      "Exfiltration",
      "Impact"
    ]
  },
  {
    framework: "OWASP_API_TOP10",
    displayName: "OWASP API Security Top 10 (2023)",
    categories: [
      "API1 Broken Object Level Authorization",
      "API2 Broken Authentication",
      "API3 Broken Object Property Level Authorization",
      "API4 Unrestricted Resource Consumption",
      "API5 Broken Function Level Authorization",
      "API6 Unrestricted Access to Sensitive Business Flows",
      "API7 Server Side Request Forgery",
      "API8 Security Misconfiguration",
      "API9 Improper Inventory Management",
      "API10 Unsafe Consumption of APIs"
    ]
  },
  {
    framework: "HIPAA",
    displayName: "HIPAA (Health Insurance Portability and Accountability Act)",
    categories: [
      "§164.308 Administrative Safeguards",
      "§164.310 Physical Safeguards",
      "§164.312 Technical Safeguards",
      "§164.314 Organizational Requirements",
      "§164.316 Policies and Documentation",
      "§164.502-514 Privacy Rule Uses and Disclosures",
      "§164.524 Access to PHI",
      "§164.528 Accounting of Disclosures",
      "§164.530 Administrative Requirements",
      "Breach Notification Rule §164.400-414"
    ]
  },
  {
    framework: "SOX",
    displayName: "SOX (Sarbanes-Oxley Act) — IT General Controls for AI Systems",
    categories: [
      "Section 302 CEO/CFO Certification",
      "Section 404 Internal Control Assessment",
      "ITGC Access Controls",
      "ITGC Change Management",
      "ITGC Computer Operations",
      "ITGC Program Development",
      "Segregation of Duties",
      "Audit Trail and Evidence Retention",
      "Financial Reporting Integrity"
    ]
  },
  {
    framework: "FEDRAMP",
    displayName: "FedRAMP (Federal Risk and Authorization Management Program)",
    categories: [
      "AC Access Control",
      "AU Audit and Accountability",
      "CA Assessment Authorization Monitoring",
      "CM Configuration Management",
      "CP Contingency Planning",
      "IA Identification and Authentication",
      "IR Incident Response",
      "MA Maintenance",
      "MP Media Protection",
      "PE Physical and Environmental Protection",
      "PL Planning",
      "PS Personnel Security",
      "RA Risk Assessment",
      "SA System and Services Acquisition",
      "SC System and Communications Protection",
      "SI System and Information Integrity"
    ]
  },
  {
    framework: "PCI_DSS",
    displayName: "PCI DSS v4.0.1 (Payment Card Industry Data Security Standard)",
    categories: [
      "Req 1 Install and Maintain Network Security Controls",
      "Req 2 Apply Secure Configurations",
      "Req 3 Protect Stored Account Data",
      "Req 4 Protect Cardholder Data in Transit",
      "Req 5 Protect Against Malicious Software",
      "Req 6 Develop and Maintain Secure Systems",
      "Req 7 Restrict Access by Business Need",
      "Req 8 Identify Users and Authenticate Access",
      "Req 9 Restrict Physical Access",
      "Req 10 Log and Monitor All Access",
      "Req 11 Test Security Regularly",
      "Req 12 Support Information Security with Organizational Policies"
    ]
  },
  {
    // Regulation (EU) 2022/2554, applicable from 17 January 2025 (Art. 64). Categories are the article headings (Art. 12 and
    // 19 shortened), except Art. 24-25, which carries the Chapter IV title, and Art. 28 (heading "General principles").
    framework: "DORA",
    displayName: "DORA (Regulation (EU) 2022/2554) — Digital Operational Resilience",
    categories: [
      "Art. 5 Governance and organisation",
      "Art. 6 ICT risk management framework",
      "Art. 8 Identification",
      "Art. 9 Protection and prevention",
      "Art. 10 Detection",
      "Art. 11 Response and recovery",
      "Art. 12 Backup policies and procedures, restoration and recovery",
      "Art. 17 ICT-related incident management process",
      "Art. 19 Reporting of major ICT-related incidents",
      "Art. 24-25 Digital operational resilience testing",
      "Art. 28 ICT third-party risk management",
      "Art. 30 Key contractual provisions"
    ]
  },
  {
    // Categories follow Directive (EU) 2022/2555 Art. 20, Art. 21(2)(a)-(j) and Art. 23; Member States apply it from 18 October 2024 (Art. 41).
    framework: "NIS2",
    displayName: "NIS2 (Directive (EU) 2022/2555) — Cybersecurity Risk Management",
    categories: [
      "Art. 20 Governance",
      "Art. 21(2)(a) Risk analysis and information system security policies",
      "Art. 21(2)(b) Incident handling",
      "Art. 21(2)(c) Business continuity and crisis management",
      "Art. 21(2)(d) Supply chain security",
      "Art. 21(2)(e) Secure acquisition, development and maintenance",
      "Art. 21(2)(f) Effectiveness assessment of risk-management measures",
      "Art. 21(2)(g) Cyber hygiene and cybersecurity training",
      "Art. 21(2)(h) Cryptography and encryption",
      "Art. 21(2)(i) Human resources security, access control and asset management",
      "Art. 21(2)(j) Multi-factor authentication and secured communications",
      "Art. 23 Reporting obligations"
    ]
  },
  {
    // Categories follow the decision support interventions criterion added by HTI-1 (89 FR 1192, 2024-01-09).
    framework: "HHS_HTI_1",
    displayName: "HHS HTI-1 (45 CFR Part 170) — Decision Support Interventions §170.315(b)(11)",
    categories: [
      "§170.315(b)(11)(ii)(C) Intervention feedback",
      "§170.315(b)(11)(iv) Source attributes",
      "§170.315(b)(11)(v) Source attribute access and modification",
      "§170.315(b)(11)(vi)(A) Risk analysis",
      "§170.315(b)(11)(vi)(B) Risk mitigation",
      "§170.315(b)(11)(vi)(C) Governance"
    ]
  },
  {
    // The twelve GAI risks of NIST AI 600-1 (July 2024), §2.1-§2.12, named as the profile names them.
    framework: "NIST_AI_600_1",
    displayName: "NIST AI 600-1 (AI RMF Generative AI Profile, July 2024) — GAI Risks",
    categories: [
      "2.1 CBRN Information or Capabilities",
      "2.2 Confabulation",
      "2.3 Dangerous, Violent, or Hateful Content",
      "2.4 Data Privacy",
      "2.5 Environmental Impacts",
      "2.6 Harmful Bias and Homogenization",
      "2.7 Human-AI Configuration",
      "2.8 Information Integrity",
      "2.9 Information Security",
      "2.10 Intellectual Property",
      "2.11 Obscene, Degrading, and/or Abusive Content",
      "2.12 Value Chain and Component Integration"
    ]
  },
  {
    // SB26-189 repealed and reenacted C.R.S. 6-1-1701 to 6-1-1709 (signed 2026-05-14; its duties apply from 2027-01-01).
    framework: "CO_AI_ACT",
    displayName: "Colorado SB26-189 (C.R.S. 6-1-1701 to 1709) — ADMT in Consequential Decisions",
    categories: [
      "§6-1-1702 Developer documentation",
      "§6-1-1702(4), §6-1-1703 Record keeping",
      "§6-1-1704 Deployer notice and post-adverse outcome disclosure",
      "§6-1-1705 Correction, human review and reconsideration"
    ]
  },
  {
    // Texas HB 149 (89th Leg.), Business & Commerce Code ch. 552; takes effect 2026-01-01.
    framework: "TX_TRAIGA",
    displayName: "Texas TRAIGA (HB 149, Bus. & Com. Code ch. 552)",
    categories: [
      "§552.051 Disclosure to consumers",
      "§552.052 Manipulation of human behavior",
      "§552.056 Unlawful discrimination",
      "§552.057 Certain sexually explicit content and child pornography",
      "§552.103 Investigative authority"
    ]
  },
  {
    // SB 53 (2025, B&P ch. 25.1), AB 2013 (2024, Civ. Code §3111) and the CCPA ADMT regulations (11 CCR §7200-7222).
    framework: "CA_AI_LAWS",
    displayName: "California AI statutes — SB 53, AB 2013, CCPA ADMT regulations",
    categories: [
      "SB 53 B&P §22757.12(a) Frontier AI framework",
      "SB 53 B&P §22757.12(c) Transparency report",
      "SB 53 B&P §22757.13 Critical safety incident reporting",
      "AB 2013 Civ. Code §3111 Training data documentation",
      "11 CCR §7220 ADMT pre-use notice",
      "11 CCR §7221 ADMT opt-out and human appeal",
      "11 CCR §7222 ADMT access"
    ]
  },
  {
    // Act No. 20676 (2025-01-21), amended by Act No. 21311 (2026-01-20); in force 2026-01-22.
    framework: "KR_AI_BASIC_ACT",
    displayName: "Korea AI Basic Act (Act No. 20676) — High-Impact and Generative AI Duties",
    categories: [
      "Art. 31 Transparency",
      "Art. 32 Safety",
      "Art. 33 High-impact AI confirmation",
      "Art. 34 High-impact AI operator measures",
      "Art. 35 Fundamental-rights impact assessment",
      "Art. 36 Domestic representative"
    ]
  }
];

export function frameworkChoices(): ComplianceFramework[] {
  return complianceFrameworkFamilies.map((row) => row.framework);
}

export function normalizeFrameworkName(input: string): ComplianceFramework | null {
  // Exact match first
  const exact = complianceFrameworkFamilies.find((row) => row.framework === input);
  if (exact) return exact.framework;
  // Case-insensitive match
  const upper = input.toUpperCase().replace(/-/g, "_");
  const caseMatch = complianceFrameworkFamilies.find((row) => row.framework === upper);
  if (caseMatch) return caseMatch.framework;
  const alias = frameworkAliases[input.toLowerCase()];
  if (alias) return alias;
  const spaced = input.toLowerCase().replace(/\s+/g, " ").trim();
  return frameworkNamePatterns.find(([pattern]) => pattern.test(spaced))?.[1] ?? null;
}

export type FrameworkStringReason = "exact" | "alias" | "pattern" | "sector-standard-not-modelled" | "descoped-source-unreachable";

/**
 * Says how a framework string resolved; a string naming an instrument AMC has no mappings for is reported, not silently
 * null. ISO/IEC 42005 names are recognised and resolve to nothing: an alias with zero mapped controls (root ruling).
 */
export function classifyFrameworkString(input: string): { framework: ComplianceFramework | null; reason: FrameworkStringReason } {
  const framework = normalizeFrameworkName(input);
  if (framework === null && descopedFrameworkNamePattern.test(input.toLowerCase().trim())) {
    return { framework, reason: "descoped-source-unreachable" };
  }
  if (framework === null) return { framework, reason: "sector-standard-not-modelled" };
  if (framework === input || framework === input.toUpperCase().replace(/-/g, "_")) return { framework, reason: "exact" };
  return { framework, reason: frameworkAliases[input.toLowerCase()] ? "alias" : "pattern" };
}

export function getFrameworkFamily(framework: ComplianceFramework | string): ComplianceFrameworkFamily {
  const normalized = normalizeFrameworkName(framework);
  if (normalized) {
    const found = complianceFrameworkFamilies.find((row) => row.framework === normalized);
    if (found) return found;
  }
  const available = frameworkChoices().join(", ");
  throw new Error(`Unsupported compliance framework: ${framework}\nAvailable: ${available}`);
}

/** What a family's review allows it to claim (truth rule 8, P1-45). */
export interface FamilyReview {
  /** Every family, mapping and crosswalk link stays experimental until a named D-08 expert signs off. */
  status: "experimental";
  /** Needs-Sid placeholder: D-08 names the experts. No sign-off is recorded, and an agent never writes one. */
  expertSignOff: null;
  /** Currency and scope warnings to re-verify before publishing. */
  flags: readonly string[];
}

const FAMILY_FLAGS: Partial<Record<ComplianceFramework, readonly string[]>> = {
  HHS_HTI_1: ["At risk: an HTI-5 final rule may delete model-card requirements; re-verify before publishing. "
    + "The recorded HTI-5 proposal reference requires re-verification. The 2026-10-19 source requests did not establish "
    + "current eCFR text or proposed/final rule status."],
  CO_AI_ACT: ["The SB26-189 publisher page and act were captured on 2026-10-19. The page lists a signed act dated 2026-05-14. "
    + "Its quotations require case or page-layout reconciliation and remain unverified under the source-text policy. "
    + "Pinpoint, commencement and current-law applicability review remain pending; re-verify before publishing."],
  KR_AI_BASIC_ACT: ["Article text comes from the KLRI English reference translation, not an official publisher, and the Korean text "
    + "governs. The Art. 31-35 pinpoints were not verified against an official text; re-verify before publishing."],
  ISO_42001: ["ISO/IEC 42005 descoped 2026-10-04 (iso.org unreachable): an alias with zero mapped controls, status "
    + "\"unverified: source unreachable\". Its three mapping IDs stay NOT_EVALUATED even after a display-category rename; the original category also stays descoped. The ISO 42006 "
    + "category is an AMC signal, not a clause mapping."]
};

/** Categories whose source text is descoped: listed in a report, never evaluated or counted (root ruling 2026-10-04). */
const DESCOPED_CATEGORIES: Readonly<Record<string, string>> = {
  "ISO_42001:ISO 42005 Impact Assessment": "not evaluated: descoped (licensed text unavailable)"
};

const DESCOPED_MAPPING_IDS = new Set([
  "iso42005_scope_and_stakeholders", "iso42005_severity_likelihood_uncertainty", "iso42005_mitigation_traceability"
]);

/** A signed display-category rename does not supply the unavailable source text for these mapping IDs. */
export function descopedReason(mapping: { id?: string; framework: string; category: string }): string | null {
  const key = mapping.framework === "ISO_42001" && DESCOPED_MAPPING_IDS.has(mapping.id ?? "")
    ? "ISO_42001:ISO 42005 Impact Assessment" : "";
  return Object.hasOwn(DESCOPED_CATEGORIES, key) ? DESCOPED_CATEGORIES[key]! : null;
}

export function familyReview(framework: ComplianceFramework): FamilyReview {
  return { status: "experimental", expertSignOff: null, flags: FAMILY_FLAGS[framework] ?? [] };
}

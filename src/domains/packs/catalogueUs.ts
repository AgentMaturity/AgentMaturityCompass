/**
 * US (and other national) instruments cited by industry packs. CFR parts were
 * checked against the Federal Register API listing of final rules affecting
 * each part on the review date; statutes and guidance that were not checked
 * are recorded as "unverified".
 */
import type { RegulatoryInstrument } from "./regulatorySchema.js";
import { P024_NOTE, P024_READ, cfr, milestones, unverified, verified } from "./catalogueHelpers.js";

const FR = "https://www.federalregister.gov/documents";

// P0-24 citation corrections: each source below was read on P024_READ. Every record is
// AI-drafted and stays experimental until a named expert signs it (contract rule 8; D-08).
const P024 = { lastReviewed: P024_READ, retrievedAt: P024_READ, clause: "whole instrument" } as const;
const M_25_21 = "https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf";
const M_25_21_SHA256 = "0aab0aa4eaeac969ed93894d3940c5dc9d0b7377048171b164a439e8b9e49813";
const SR_26_2 = "https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm";
const EO_14148 = "https://www.federalregister.gov/api/v1/documents/2025-01901.json";

export const US_INSTRUMENTS: readonly RegulatoryInstrument[] = [
  cfr("us-hipaa", 45, 164, "HIPAA Privacy, Security and Breach Notification Rules (45 CFR Parts 160 and 164)",
    ["HIPAA", "45 CFR §164", "45 CFR Part 164", "45 CFR 164"], { frameworkId: "HIPAA", note: "Latest final rule listed for 45 CFR 164: 2024-04-26 (FR 2024-08503)." }),
  cfr("us-onc-certification", 45, 170, "ONC Health IT Certification Program (45 CFR Part 170)",
    ["ONC 45 CFR §170", "ONC Health IT Certification Criteria 45 CFR §170", "45 CFR Part 170", "45 CFR §170"]),
  cfr("us-part11", 21, 11, "FDA Electronic Records; Electronic Signatures (21 CFR Part 11)",
    ["21 CFR Part 11", "FDA 21 CFR Part 11", "21 CFR 11"]),
  verified("us-qmsr", "FDA Quality Management System Regulation (21 CFR Part 820, incorporating ISO 13485:2016 by reference)", "US", "law", "in-force",
    `${FR}/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments`,
    ["FDA 21 CFR Part 820", "FDA 21 CFR 820", "FDA 21 CFR §820.10", "21 CFR Part 820", "21 CFR 820"], { effectiveDate: "2026-02-02", note: `Final rule FR 2024-01709 effective 2026-02-02 replaced the Quality System Regulation (QSR). Alias "FDA 21 CFR §820.10" added by P0-24 (HC-1); ${P024_NOTE}` }),
  cfr("us-cgmp-drugs", 21, 211, "FDA Current Good Manufacturing Practice for Finished Pharmaceuticals (21 CFR Parts 210 and 211)",
    ["FDA 21 CFR 210/211", "FDA 21 CFR Parts 210/211", "21 CFR Parts 210/211", "21 CFR 210/211", "21 CFR Part 211"]),
  cfr("us-clinical-investigations", 21, 312, "FDA human subject protection, IRBs and IND regulations (21 CFR Parts 50, 56 and 312)",
    ["FDA 21 CFR 50/56/312", "FDA 21 CFR Parts 50/56/312", "FDA 21 CFR Part 50", "FDA 21 CFR Part 56", "FDA 21 CFR §312", "FDA 21 CFR §50", "21 CFR Part 312"]),
  cfr("us-cms-cop-hospitals", 42, 482, "CMS Conditions of Participation for Hospitals (42 CFR Part 482)",
    ["CMS 42 CFR §482", "CMS Conditions of Participation 42 CFR §482", "42 CFR Part 482", "42 CFR §482"]),
  cfr("us-cms-424", 42, 424, "CMS conditions for Medicare payment (42 CFR Part 424)",
    ["CMS 42 CFR §424", "CMS Billing Rules 42 CFR §424", "42 CFR Part 424", "42 CFR §424"]),
  verified("us-coppa", "Children's Online Privacy Protection Act (15 U.S.C. §§6501-6506) and COPPA Rule (16 CFR Part 312), as amended 2025", "US", "law", "in-force",
    `${FR}/2025/04/22/2025-05904/childrens-online-privacy-protection-rule`,
    ["COPPA", "FTC COPPA", "16 CFR Part 312"], { effectiveDate: "2025-06-23", note: "Amended rule FR 2025-05904 effective 2025-06-23." }),
  cfr("us-ferpa", 34, 99, "Family Educational Rights and Privacy Act regulations (34 CFR Part 99)",
    ["FERPA", "34 CFR Part 99"]),
  verified("us-title-ix", "Title IX regulations (34 CFR Part 106), 2024 amendments repealed and prior text recodified", "US", "law", "in-force",
    `${FR}/2026/09/29/2026-19929/recodification-of-title-ix-rules`,
    ["Title IX", "34 CFR Part 106"], { effectiveDate: "2026-09-29", note: "FR 2026-19929 repealed the vacated 2024 rule and restored the earlier regulatory text." }),
  cfr("us-idea", 34, 300, "Individuals with Disabilities Education Act Part B regulations (34 CFR Part 300)", ["IDEA", "34 CFR Part 300"]),
  verified("us-ada-title-ii-web", "ADA Title II web and mobile app accessibility rule (28 CFR Part 35, Subpart H)", "US", "law", "in-force",
    `${FR}/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web`,
    ["ADA Title II", "28 CFR Part 35"], {
      effectiveDate: "2024-06-24",
      milestones: milestones(["2027-04-26", "Compliance date, public entities with population 50,000 or more (extended by IFR 2026-07663)"], ["2028-04-26", "Compliance date, smaller public entities and special districts (extended by IFR 2026-07663)"]),
    }),
  cfr("us-section-508", 36, 1194, "Section 508 ICT Standards and Guidelines (36 CFR Part 1194)", ["Section 508", "36 CFR Part 1194"]),
  cfr("us-fmcsa-hos", 49, 395, "FMCSA Hours of Service of Drivers (49 CFR Part 395)", ["49 CFR Part 395", "FMCSA Hours of Service", "FMCSA HOS"]),
  cfr("us-phmsa-hmr", 49, 172, "PHMSA Hazardous Materials Regulations: table, shipping papers, emergency response information and training (49 CFR Part 172)",
    ["49 CFR Part 172", "PHMSA Hazardous Materials Regulations", "49 CFR Parts 171-180"]),
  cfr("us-fincen-bsa", 31, 1010, "Bank Secrecy Act regulations (31 CFR Chapter X)",
    ["FinCEN BSA/AML", "FinCEN AML/BSA", "FinCEN BSA", "FinCEN 31 CFR", "31 CFR Chapter X", "BSA/AML"]),
  verified("us-omb-m-25-21", "OMB Memorandum M-25-21, Accelerating Federal Use of AI through Innovation, Governance, and Public Trust (3 April 2025)", "US", "policy", "in-force",
    M_25_21, ["OMB M-25-21"], {
      ...P024, instrument: "OMB Memorandum M-25-21, Accelerating Federal Use of AI through Innovation, Governance, and Public Trust", edition: "3 April 2025",
      statusType: "binding-now", effectiveDate: "2025-04-03", contentSha256: M_25_21_SHA256, dateNote: "Dated 3 April 2025; no single compliance-due date is recorded here.",
      note: `Memorandum PDF read ${P024_READ}: dated April 3, 2025; it "rescinds and replaces" M-24-10. ${P024_NOTE}`,
    }),
  verified("us-omb-m-24-10", "OMB Memorandum M-24-10, Advancing Governance, Innovation, and Risk Management for Agency Use of Artificial Intelligence (rescinded by M-25-21)", "US", "policy", "repealed",
    M_25_21, ["OMB M-24-10"], {
      ...P024, instrument: "OMB Memorandum M-24-10, Advancing Governance, Innovation, and Risk Management for Agency Use of Artificial Intelligence", edition: "as rescinded on 3 April 2025",
      statusType: "binding-now", supersededBy: "us-omb-m-25-21", contentSha256: M_25_21_SHA256, dateNote: "Rescinded and replaced by M-25-21 (3 April 2025); its own dates are not recorded here.",
      note: `Status read from the M-25-21 PDF on ${P024_READ}. ${P024_NOTE}`,
    }),
  verified("us-sr-26-2", "Federal Reserve SR 26-2, Revised Guidance on Model Risk Management (17 April 2026, with the OCC and FDIC; supersedes SR 11-7 and SR 21-8)", "US", "guidance", "in-force",
    SR_26_2, ["Federal Reserve SR 26-2", "SR 26-2"], {
      ...P024, instrument: "SR 26-2: Revised Guidance on Model Risk Management", edition: "17 April 2026",
      statusType: "supervisory-guidance", dateNote: "Letter dated 17 April 2026; supervisory guidance carries no effective or compliance-due date.",
      note: `SR letter page and attachment SR2602a1.pdf read ${P024_READ}: supersedes SR 11-7 (4 April 2011) and SR 21-8; attachment footnote 3 puts generative AI and agentic AI models outside the guidance's scope; section V (Model Validation and Monitoring) covers conceptual soundness and outcomes analysis. ${P024_NOTE}`,
    }),
  verified("us-sr-11-7", "Federal Reserve SR 11-7, Guidance on Model Risk Management (4 April 2011; superseded by SR 26-2)", "US", "guidance", "repealed",
    SR_26_2, ["Federal Reserve SR 11-7", "SR 11-7"], {
      ...P024, instrument: "SR 11-7: Guidance on Model Risk Management", edition: "4 April 2011",
      statusType: "supervisory-guidance", supersededBy: "us-sr-26-2", dateNote: "Superseded by SR 26-2 (17 April 2026); supervisory guidance carries no compliance-due date.",
      note: `Status read from the SR 26-2 letter on ${P024_READ}. ${P024_NOTE}`,
    }),
  verified("us-eo-14110", "Executive Order 14110 (30 October 2023), revoked by Executive Order 14148 (20 January 2025)", "US", "policy", "repealed",
    EO_14148, ["US Executive Order 14110", "Executive Order 14110", "US EO 14110", "EO 14110"], {
      ...P024, instrument: "Executive Order 14110", edition: "30 October 2023", statusType: "binding-now",
      supersededBy: "none: revoked by EO 14148 on 2025-01-20 with no successor order", dateNote: "Revoked on 20 January 2025; no compliance date applies.",
      note: `Federal Register record of EO 14148 (FR Doc 2025-01901) read ${P024_READ}: its executive-order notes list EO 14110 (October 30, 2023) as revoked. ${P024_NOTE}`,
    }),
  verified("us-eo-13985", "Executive Order 13985 (20 January 2021), revoked by Executive Order 14148 (20 January 2025)", "US", "policy", "repealed",
    EO_14148, ["Executive Order 13985", "EO 13985"], {
      ...P024, instrument: "Executive Order 13985", edition: "20 January 2021", statusType: "binding-now",
      supersededBy: "none: revoked by EO 14148 on 2025-01-20; an expert names any replacement (P0-24 row 25)", dateNote: "Revoked on 20 January 2025; no compliance date applies.",
      note: `Federal Register record of EO 14148 (FR Doc 2025-01901) read ${P024_READ}: its executive-order notes list EO 13985 (January 20, 2021) as revoked. ${P024_NOTE}`,
    }),
  verified("us-eeoc-ai-ta", "EEOC technical assistance on AI in employment (Title VII adverse impact; ADA), no longer published", "US", "guidance", "repealed",
    "https://www.eeoc.gov/laws/guidance/select-issues-assessing-adverse-impact-software-algorithms-and-artificial", ["EEOC AI Guidance on Title VII", "EEOC AI guidance"], {
      ...P024, instrument: "EEOC technical assistance on AI in employment", edition: "as withdrawn", statusType: "supervisory-guidance",
      supersededBy: "none: withdrawn by the EEOC; Title VII and ADA (42 U.S.C. 12112) duties still apply", dateNote: "Withdrawn; the EEOC page returned HTTP 404 on the read date.",
      note: `The EEOC page returned HTTP 404 on ${P024_READ} (also on 2026-10-03 per register entry us-eeoc-ai-ta); re-verify before publishing. ${P024_NOTE}`,
    }),
  verified("us-ugesp-1607-4", "29 CFR 1607.4, Information on impact (Uniform Guidelines on Employee Selection Procedures), including §1607.4(D) four-fifths rule", "US", "law", "in-force",
    "https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-29.xml?part=1607&section=1607.4", ["29 CFR 1607.4", "29 CFR Part 1607"], {
      ...P024, instrument: "29 CFR 1607.4 Information on impact", edition: "eCFR text as of 2026-10-01", statusType: "binding-now",
      contentSha256: "0b70dc7befc9eddc68a8707a4be03d0e34f305c2cee89f9ca888e2889786d3a3", dateNote: "eCFR point-in-time text as of 2026-10-01; effective and compliance dates are not recorded here.",
      note: `Read via the eCFR versioner API on ${P024_READ}: §1607.4(D) "Adverse impact and the four-fifths rule". Cited by WLT-FW-1. ${P024_NOTE}`,
    }),
  verified("us-ada-1630-11", "29 CFR 1630.11, Administration of tests (ADA Title I regulations)", "US", "law", "in-force",
    "https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-29.xml?part=1630&section=1630.11", ["29 CFR 1630.11"], {
      ...P024, instrument: "29 CFR 1630.11 Administration of tests", edition: "eCFR text as of 2026-10-01", statusType: "binding-now",
      contentSha256: "f0454d2c00beec595a3fcadb35ddafd3a1afecee5600febc35e71dc46cd2da6f", dateNote: "eCFR point-in-time text as of 2026-10-01; effective and compliance dates are not recorded here.",
      note: `Read via the eCFR versioner API on ${P024_READ}. Cited by WLT-FW-12. ${P024_NOTE}`,
    }),
  verified("us-ada-12112", "Americans with Disabilities Act, 42 U.S.C. 12112 (discrimination; (b)(5)-(7) reasonable accommodation, screening criteria and tests)", "US", "law", "in-force",
    "https://www.govinfo.gov/content/pkg/USCODE-2023-title42/html/USCODE-2023-title42-chap126-subchapI-sec12112.htm", ["42 U.S.C. 12112"], {
      ...P024, instrument: "42 U.S.C. 12112 Discrimination", edition: "United States Code, 2023 edition (govinfo)", statusType: "binding-now",
      contentSha256: "33914344a0fc9305f5eae2d9b72da2316a56bdce05aa282d601ad9437870c88a", dateNote: "Statute text from the 2023 edition of the U.S. Code; effective and compliance dates are not recorded here.",
      note: `Read on govinfo on ${P024_READ}: (b)(5)(A) reasonable accommodation, (b)(6) screening criteria, (b)(7) test administration. Cited by WLT-FW-12. ${P024_NOTE}`,
    }),
  verified("us-sec-climate", "SEC climate-related disclosure rules (Release 33-11275)", "US", "law", "unverified",
    `${FR}/2024/04/12/2024-07648/the-enhancement-and-standardization-of-climate-related-disclosures-for-investors-delay-of-effective`,
    ["SEC ESG Rules", "SEC ESG Disclosure Rules"], {
      url: undefined, retrievedAt: undefined,
      note: "Adopted 2024-03-28; effective date stayed 2024-04-12 (FR 2024-07648). Current status not confirmed in this review.",
    }),

  // Statutes, programmes and guidance not checked in this review
  unverified("us-ada", "Americans with Disabilities Act of 1990 (42 U.S.C. §12101 et seq.)", "US", "law", ["ADA", "Americans with Disabilities Act (ADA)", "Americans with Disabilities Act"]),
  unverified("us-hitech", "HITECH Act (2009)", "US", "law", ["HITECH Act", "HITECH"]),
  verified("us-cures", "21st Century Cures Act (Public Law 114-255)", "US", "law", "in-force", "https://www.govinfo.gov/content/pkg/PLAW-114publ255/html/PLAW-114publ255.htm",
    ["21st Century Cures Act"], { effectiveDate: "2016-12-13", note: "Enacted text read on govinfo.gov; information blocking is §4004, interoperability §4003." }),
  unverified("us-fda-510k", "FDA premarket notification (510(k)), 21 CFR Part 807 Subpart E", "US", "law", ["FDA 510(k)"]),
  unverified("us-fda-samd", "FDA guidance on Software as a Medical Device", "US", "guidance", ["FDA SaMD Guidance", "FDA Software as a Medical Device (SaMD) Guidance", "FDA SaMD"]),
  unverified("us-dscsa", "Drug Supply Chain Security Act (2013)", "US", "law", ["FDA DSCSA"]),
  unverified("us-dea", "DEA controlled substance regulations (21 CFR Parts 1301-1321)", "US", "law", ["DEA 21 CFR 1301-1321"]),
  unverified("us-essa", "Every Student Succeeds Act (2015)", "US", "law", ["ESSA"]),
  unverified("us-cipa", "Children's Internet Protection Act (47 CFR §54.520)", "US", "law", ["CIPA"]),
  unverified("us-dodd-frank-x", "Dodd-Frank Act Title X (Consumer Financial Protection Act of 2010)", "US", "law", ["Dodd-Frank Act Title X", "Dodd-Frank Title X", "Dodd-Frank"]),
  unverified("us-sec-digital-assets", "SEC Framework for 'Investment Contract' Analysis of Digital Assets (2019)", "US", "guidance", ["SEC Howey Test Framework", "SEC Framework"]),
  unverified("us-ccpa", "California Consumer Privacy Act as amended by CPRA (Cal. Civ. Code §1798.100 et seq.) and CPPA regulations", "US-CA", "law", ["CCPA/CPRA", "CCPA"]),
  unverified("us-nerc-cip", "NERC Critical Infrastructure Protection Reliability Standards CIP-002 through CIP-014", "US", "standard", ["NERC CIP"]),
  unverified("us-state-pharmacy", "State pharmacy practice acts", "US-states", "law", ["State Pharmacy Practice Acts"]),
  unverified("us-ctpat", "CBP Customs Trade Partnership Against Terrorism", "US", "framework", ["C-TPAT"]),
  unverified("us-fedramp", "FedRAMP baselines (NIST SP 800-53 Rev. 5)", "US", "framework", ["FedRAMP Rev. 5", "FedRAMP"]),
  unverified("us-ama-cpt", "AMA Current Procedural Terminology (CPT)", "US", "standard", ["AMA CPT Coding Standards", "AMA CPT"]),
  unverified("us-nabp", "NABP standards", "US", "standard", ["NABP Standards"]),
  unverified("us-samhsa", "SAMHSA national guidelines", "US", "guidance", ["SAMHSA National Guidelines", "SAMHSA Guidelines"]),
  unverified("us-usp-797-800", "USP General Chapters <797> and <800>", "US", "standard", ["USP <797>", "USP <800>"]),
  unverified("us-dmca-512", "DMCA §512 (17 U.S.C. §512)", "US", "law", ["DMCA §512"]),
  unverified("us-foia", "Freedom of Information Act (5 U.S.C. §552)", "US", "law", ["US FOIA"]),
  unverified("us-gig-economy", "Gig-economy worker classification rules (various jurisdictions)", "multi", "law", ["Gig Economy Regulations"],
    "Not a single instrument; replace with the specific jurisdictions in scope."),
  unverified("uk-nice-ta", "NICE technology appraisal guidance", "UK", "guidance", ["NICE Technology Appraisal Guidance", "NICE TA Guidance"]),
];

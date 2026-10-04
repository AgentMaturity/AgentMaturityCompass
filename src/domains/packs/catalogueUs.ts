/**
 * US (and other national) instruments cited by industry packs. CFR parts were
 * checked against the Federal Register API listing of final rules affecting
 * each part on the review date; statutes and guidance that were not checked
 * are recorded as "unverified".
 */
import type { RegulatoryInstrument } from "./regulatorySchema.js";
import { cfr, milestones, unverified, verified } from "./catalogueHelpers.js";

const FR = "https://www.federalregister.gov/documents";

export const US_INSTRUMENTS: readonly RegulatoryInstrument[] = [
  cfr("us-hipaa", 45, 164, "HIPAA Privacy, Security and Breach Notification Rules (45 CFR Parts 160 and 164)",
    ["HIPAA", "45 CFR §164", "45 CFR Part 164", "45 CFR 164"], { frameworkId: "HIPAA", note: "Latest final rule listed for 45 CFR 164: 2024-04-26 (FR 2024-08503)." }),
  cfr("us-onc-certification", 45, 170, "ONC Health IT Certification Program (45 CFR Part 170)",
    ["ONC 45 CFR §170", "ONC Health IT Certification Criteria 45 CFR §170", "45 CFR Part 170", "45 CFR §170"]),
  cfr("us-part11", 21, 11, "FDA Electronic Records; Electronic Signatures (21 CFR Part 11)",
    ["21 CFR Part 11", "FDA 21 CFR Part 11", "21 CFR 11"]),
  verified("us-qmsr", "FDA Quality Management System Regulation (21 CFR Part 820, incorporating ISO 13485:2016 by reference)", "US", "law", "in-force",
    `${FR}/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments`,
    ["FDA 21 CFR Part 820", "FDA 21 CFR 820", "21 CFR Part 820", "21 CFR 820"], { effectiveDate: "2026-02-02", note: "Final rule FR 2024-01709 effective 2026-02-02 replaced the Quality System Regulation (QSR)." }),
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

  // Governance station round 2 (2026-10-04): instruments read on their official pages on that date.
  verified("nist-sp-800-63b-4", "NIST SP 800-63B-4, Digital Identity Guidelines: Authentication and Authenticator Management (July 2025)", "US", "standard", "in-force",
    "https://csrc.nist.gov/pubs/sp/800/63/b/4/final", ["NIST SP 800-63B-4", "NIST Special Publication 800-63B-4"], {
      lastReviewed: "2026-10-04", retrievedAt: "2026-10-04",
      note: "csrc.nist.gov read 2026-10-04: final, published July 2025; \"This publication supersedes NIST Special Publication (SP) 800-63B.\"",
    }),
  verified("us-52usc30124", "52 U.S.C. §30124, Fraudulent misrepresentation of campaign authority", "US", "law", "in-force",
    "https://www.govinfo.gov/content/pkg/USCODE-2023-title52/html/USCODE-2023-title52-subtitleIII-chap301-subchapI-sec30124.htm",
    ["52 U.S.C. 30124", "52 U.S.C. §30124"], {
      lastReviewed: "2026-10-04", retrievedAt: "2026-10-04",
      note: "Section heading and (a) read on govinfo.gov (US Code 2023 edition) 2026-10-04.",
    }),
  verified("us-fec-89fr78785", "FEC interpretive rule, Fraudulent Misrepresentation of Campaign Authority, 89 FR 78785 (26 Sep 2024)", "US", "guidance", "in-force",
    "https://www.federalregister.gov/api/v1/documents/2024-21983.json", ["FEC interpretive rule 89 FR 78785", "89 FR 78785"], {
      lastReviewed: "2026-10-04", retrievedAt: "2026-10-04", effectiveDate: "2024-09-26",
      note: "Federal Register API read 2026-10-04: agency FEC, published and effective 2024-09-26; the abstract does not mention AI.",
    }),
];

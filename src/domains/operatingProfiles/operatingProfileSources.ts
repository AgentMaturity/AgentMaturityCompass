import type { ProfileSource } from "./operatingProfileTypes.js";

/**
 * Sources cited by the station operating profiles.
 *
 * Every entry records what was actually read on `retrievedAt` from this
 * harness. CFR text was read from the GPO govinfo annual edition
 * (CFR-2024, title 16 Part 461 from CFR-2025); eCFR redirected to a bot wall
 * and was not read. `verified: false` entries name the reference and the
 * reason the primary text could not be read; nothing in them is a quote.
 */
const RETRIEVED = "2026-10-03";
const GOVINFO = "https://www.govinfo.gov/content/pkg";
const EUR_LEX_UNREACHABLE =
  "primary text unreachable 2026-10-03 (EUR-Lex returned empty content on the ELI, OJ-HTML and CELEX URL forms); europa.eu policy page read instead";

function verified(id: string, title: string, url: string, reference: string): ProfileSource {
  return { id, title, url, reference, retrievedAt: RETRIEVED, verified: true };
}

function unverified(id: string, title: string, url: string, reference: string, reason: string): ProfileSource {
  return { id, title, url, reference, retrievedAt: RETRIEVED, verified: false, reason };
}

export const SOURCES = {
  cfr45_164_404: verified(
    "cfr45_164_404",
    "45 CFR 164.404 Notification to individuals (HIPAA Breach Notification Rule)",
    `${GOVINFO}/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-404.xml`,
    "45 CFR 164.404(b): without unreasonable delay and in no case later than 60 calendar days after discovery"
  ),
  cfr45_164_408: verified(
    "cfr45_164_408",
    "45 CFR 164.408 Notification to the Secretary",
    `${GOVINFO}/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-408.xml`,
    "45 CFR 164.408(b)-(c): contemporaneously with 164.404 notice for 500+ individuals; not later than 60 days after calendar year end for fewer than 500"
  ),
  cfr45_164_316: verified(
    "cfr45_164_316",
    "45 CFR 164.316 Policies and procedures and documentation requirements",
    `${GOVINFO}/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-316.xml`,
    "45 CFR 164.316(b)(2)(i): retain documentation 6 years from creation or last effective date"
  ),
  cfr45_164_312: verified(
    "cfr45_164_312",
    "45 CFR 164.312 Technical safeguards",
    `${GOVINFO}/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-312.xml`,
    "45 CFR 164.312(a)(1) access control; (b) audit controls; (e)(1) transmission security"
  ),
  cfr45_164_308: verified(
    "cfr45_164_308",
    "45 CFR 164.308 Administrative safeguards",
    `${GOVINFO}/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-308.xml`,
    "45 CFR 164.308(a)(1)(ii)(D) information system activity review; (a)(6) security incident procedures"
  ),
  cfr21_803_50: verified(
    "cfr21_803_50",
    "21 CFR 803.50 Manufacturer reporting (Medical Device Reporting)",
    `${GOVINFO}/CFR-2024-title21-vol8/xml/CFR-2024-title21-vol8-sec803-50.xml`,
    "21 CFR 803.50(a): report no later than 30 calendar days after becoming aware"
  ),
  cfr21_803_53: verified(
    "cfr21_803_53",
    "21 CFR 803.53 Five-day reports",
    `${GOVINFO}/CFR-2024-title21-vol8/xml/CFR-2024-title21-vol8-sec803-53.xml`,
    "21 CFR 803.53: no later than 5 work days when remedial action is necessary or FDA requests"
  ),
  cfr21_11_10: verified(
    "cfr21_11_10",
    "21 CFR 11.10 Controls for closed systems (electronic records)",
    `${GOVINFO}/CFR-2024-title21-vol1/xml/CFR-2024-title21-vol1-sec11-10.xml`,
    "21 CFR 11.10(c) record retention; (d) limiting system access; (e) secure time-stamped audit trails"
  ),
  cfr21_312_32: verified(
    "cfr21_312_32",
    "21 CFR 312.32 IND safety reporting",
    `${GOVINFO}/CFR-2024-title21-vol5/xml/CFR-2024-title21-vol5-sec312-32.xml`,
    "21 CFR 312.32(c)(1) 15 calendar days; (c)(2) 7 calendar days for unexpected fatal or life-threatening"
  ),
  cfr34_99_32: verified(
    "cfr34_99_32",
    "34 CFR 99.32 Recordkeeping requirements for disclosures (FERPA)",
    `${GOVINFO}/CFR-2024-title34-vol1/xml/CFR-2024-title34-vol1-sec99-32.xml`,
    "34 CFR 99.32(a)(1)-(2): record each request/disclosure, kept as long as the education records are maintained"
  ),
  cfr16_312_10: verified(
    "cfr16_312_10",
    "16 CFR 312.10 Data retention and deletion requirements (COPPA)",
    `${GOVINFO}/CFR-2024-title16-vol1/xml/CFR-2024-title16-vol1-sec312-10.xml`,
    "16 CFR 312.10: retain a child's personal information only as long as reasonably necessary"
  ),
  cfr16_312_5: verified(
    "cfr16_312_5",
    "16 CFR 312.5 Parental consent (COPPA)",
    `${GOVINFO}/CFR-2024-title16-vol1/xml/CFR-2024-title16-vol1-sec312-5.xml`,
    "16 CFR 312.5(a)(1): verifiable parental consent before collection, use or disclosure"
  ),
  cfr17_240_17a4: verified(
    "cfr17_240_17a4",
    "17 CFR 240.17a-4 Records to be preserved by certain exchange members, brokers and dealers",
    `${GOVINFO}/CFR-2024-title17-vol4/xml/CFR-2024-title17-vol4-sec240-17a-4.xml`,
    "17 CFR 240.17a-4(a) not less than 6 years, first two easily accessible; (b) not less than 3 years"
  ),
  cfr31_1020_320: verified(
    "cfr31_1020_320",
    "31 CFR 1020.320 Reports by banks of suspicious transactions",
    `${GOVINFO}/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1020-320.xml`,
    "31 CFR 1020.320(b)(3) SAR within 30 calendar days of initial detection, never beyond 60; (d) retain 5 years"
  ),
  cfr49_573_6: verified(
    "cfr49_573_6",
    "49 CFR 573.6 Defect and noncompliance information report",
    `${GOVINFO}/CFR-2024-title49-vol7/xml/CFR-2024-title49-vol7-sec573-6.xml`,
    "49 CFR 573.6(b): not more than 5 working days after a safety-related defect is determined"
  ),
  cfr12_53_3: verified(
    "cfr12_53_3",
    "12 CFR 53.3 Notification (computer-security incident notification, OCC)",
    `${GOVINFO}/CFR-2024-title12-vol1/xml/CFR-2024-title12-vol1-sec53-3.xml`,
    "12 CFR 53.3: notify the OCC as soon as possible and no later than 36 hours"
  ),
  cfr16_461_3: verified(
    "cfr16_461_3",
    "16 CFR 461.3 Impersonation of businesses (FTC Trade Regulation Rule)",
    `${GOVINFO}/CFR-2025-title16-vol1/xml/CFR-2025-title16-vol1-sec461-3.xml`,
    "16 CFR 461.3: prohibits materially and falsely posing as a business or officer thereof"
  ),
  ico_breach_72h: verified(
    "ico_breach_72h",
    "ICO: Personal data breaches — report a breach (UK GDPR Article 33)",
    "https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/",
    "UK GDPR Art. 33 as stated by the ICO: notify as soon as possible and where feasible within 72 hours"
  ),
  ec_ai_act_page: verified(
    "ec_ai_act_page",
    "European Commission: AI Act — regulatory framework for AI (policy page)",
    "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
    "Policy page for Regulation (EU) 2024/1689: high-risk areas, human oversight, logging, serious-incident reporting, application dates"
  ),
  ec_nis2_page: verified(
    "ec_nis2_page",
    "European Commission: NIS2 Directive (policy page)",
    "https://digital-strategy.ec.europa.eu/en/policies/nis2-directive",
    "Policy page for Directive (EU) 2022/2555: significant-incident notification duty and covered sectors (no deadlines stated on page)"
  ),
  nist_ai_rmf: verified(
    "nist_ai_rmf",
    "NIST AI Risk Management Framework (AI RMF 1.0, NIST AI 100-1)",
    "https://www.nist.gov/itl/ai-risk-management-framework",
    "Released 26 January 2023; core functions Govern, Map, Measure, Manage"
  ),
  nist_sp800_53r5: verified(
    "nist_sp800_53r5",
    "NIST SP 800-53 Rev. 5 Security and Privacy Controls for Information Systems and Organizations",
    "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
    "Publication landing page (September 2020, updated December 2020); control catalog text not read"
  ),
  cisa_incident_1h: verified(
    "cisa_incident_1h",
    "CISA Federal Incident Notification Guidelines",
    "https://www.cisa.gov/federal-incident-notification-guidelines",
    "Federal agencies report to CISA within one hour of identification (FISMA)"
  ),
  omb_m25_21: verified(
    "omb_m25_21",
    "OMB M-25-21 Accelerating Federal Use of AI through Innovation, Governance, and Public Trust",
    "https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf",
    "Memorandum dated 3 April 2025 (pages 1-4 read): rescinds M-24-10; minimum risk management practices for high-impact AI; discontinue use when mitigation is not possible"
  ),
  nerc_cip_008_6: verified(
    "nerc_cip_008_6",
    "NERC CIP-008-6 Cyber Security — Incident Reporting and Response Planning",
    "https://www.nerc.com/pa/Stand/Reliability%20Standards/CIP-008-6.pdf",
    "Requirement R4 Part 4.2 (pages 9-12 read): one hour after determination of a Reportable Cyber Security Incident; end of next calendar day for attempts; Part 4.3 updates within 7 calendar days"
  ),
  nist_ssdf: verified(
    "nist_ssdf",
    "NIST SP 800-218 Secure Software Development Framework (SSDF) v1.1",
    "https://csrc.nist.gov/pubs/sp/800/218/final",
    "Publication landing page, February 2022"
  ),
  cisa_eo14028: verified(
    "cisa_eo14028",
    "CISA: Executive Order 14028 Improving the Nation's Cybersecurity",
    "https://www.cisa.gov/executive-order-improving-nations-cybersecurity",
    "Agency page: baseline security standards for software sold to government; SBOM requirement development"
  ),
  finra_4530: verified(
    "finra_4530",
    "FINRA Rule 4530 Reporting Requirements",
    "https://www.finra.org/rules-guidance/rulebooks/finra-rules/4530",
    "Rule 4530(a)(1) and (b): not later than 30 calendar days"
  ),
  cal_civ_1798_82: verified(
    "cal_civ_1798_82",
    "California Civil Code section 1798.82 (breach of the security of the system)",
    "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.82",
    "Section 1798.82(a) as published: within 30 calendar days of discovery or notification of the breach"
  ),
  nist_csf_2: verified(
    "nist_csf_2",
    "NIST Cybersecurity Framework 2.0",
    "https://www.nist.gov/cyberframework",
    "Resource center page: CSF 2.0 released February 2024; core functions not listed on the page"
  ),
  frb_sr_11_7: unverified(
    "frb_sr_11_7",
    "Federal Reserve SR 11-7 Supervisory Guidance on Model Risk Management",
    "https://www.federalreserve.gov/boarddocs/srletters/2011/sr1107.htm",
    "SR 11-7, 4 April 2011 (title and date page read); independent validation and effective challenge",
    "attachment body not readable from this harness 2026-10-03; only the letter's title/date page was read"
  ),
  eu_ai_act_art73: unverified(
    "eu_ai_act_art73",
    "Regulation (EU) 2024/1689 (AI Act) Article 73 Reporting of serious incidents",
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
    "OJ L, 2024/1689, 12.7.2024, Article 73 serious-incident reporting deadlines",
    EUR_LEX_UNREACHABLE
  ),
  eu_ai_act_art12_19_26: unverified(
    "eu_ai_act_art12_19_26",
    "Regulation (EU) 2024/1689 (AI Act) Articles 12, 19 and 26(6) record-keeping and log retention",
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
    "OJ L, 2024/1689, 12.7.2024, Articles 12, 19, 26(6) automatic logging and minimum log retention",
    EUR_LEX_UNREACHABLE
  ),
  eu_ai_act_art14: unverified(
    "eu_ai_act_art14",
    "Regulation (EU) 2024/1689 (AI Act) Article 14 Human oversight",
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
    "OJ L, 2024/1689, 12.7.2024, Article 14 human oversight; Article 26(2) deployers assign oversight to natural persons",
    EUR_LEX_UNREACHABLE
  ),
  eu_ai_act_art27: unverified(
    "eu_ai_act_art27",
    "Regulation (EU) 2024/1689 (AI Act) Article 27 Fundamental rights impact assessment",
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
    "OJ L, 2024/1689, 12.7.2024, Article 27 FRIA for public-law bodies and Annex III points 5(b)-(c) deployers",
    EUR_LEX_UNREACHABLE
  ),
  eu_ai_act_annex3: unverified(
    "eu_ai_act_annex3",
    "Regulation (EU) 2024/1689 (AI Act) Annex III High-risk AI systems",
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
    "OJ L, 2024/1689, 12.7.2024, Annex III areas (critical infrastructure, education, essential services incl. credit, law enforcement, justice)",
    EUR_LEX_UNREACHABLE
  ),
  gdpr_art33: unverified(
    "gdpr_art33",
    "Regulation (EU) 2016/679 (GDPR) Article 33 Notification of a personal data breach",
    "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng",
    "OJ L 119, 4.5.2016, Article 33(1) 72 hours; Article 5(1)(e) storage limitation; Article 22(3) human intervention",
    "primary text unreachable 2026-10-03 (EUR-Lex); the ICO page (ico_breach_72h) was read for the 72-hour figure"
  ),
  nis2_art23: unverified(
    "nis2_art23",
    "Directive (EU) 2022/2555 (NIS2) Article 23 Reporting obligations",
    "https://eur-lex.europa.eu/eli/dir/2022/2555/oj/eng",
    "OJ L 333, 27.12.2022, Article 23(4) early warning 24 hours, incident notification 72 hours, final report one month",
    "primary text unreachable 2026-10-03 (EUR-Lex); the Commission NIS2 policy page read states the duty but no deadlines"
  ),
  nhtsa_sgo: unverified(
    "nhtsa_sgo",
    "NHTSA Standing General Order 2021-01 (crash reporting for ADS and Level 2 ADAS)",
    "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting",
    "SGO incident report and monthly report timelines",
    "nhtsa.gov returned HTTP 403 on 2026-10-03; timelines not read"
  ),
  unece_r155: unverified(
    "unece_r155",
    "UN Regulation No. 155 Cyber security and cyber security management system",
    "https://unece.org/transport/documents/2021/03/standards/un-regulation-no-155-cyber-security-and-cyber-security",
    "UNECE WP.29 R155 CSMS; R156 software update management system",
    "unece.org returned HTTP 403 on 2026-10-03; text not read"
  ),
  iso_42005: unverified(
    "iso_42005",
    "ISO/IEC 42005:2025 AI system impact assessment",
    "https://www.iso.org/standard/44545.html",
    "ISO/IEC 42005:2025 catalog entry",
    "iso.org returned HTTP 403 on 2026-10-03; catalog page not read"
  ),
  iso_26262: unverified(
    "iso_26262",
    "ISO 26262-1:2018 Road vehicles — Functional safety",
    "https://www.iso.org/standard/68383.html",
    "ISO 26262 functional safety lifecycle and ASIL",
    "iso.org returned HTTP 403 on 2026-10-03; catalog page not read"
  ),
  sec_reg_sp_248_30: unverified(
    "sec_reg_sp_248_30",
    "17 CFR 248.30 Regulation S-P safeguards and incident response (2024 amendments)",
    "https://www.govinfo.gov/content/pkg/CFR-2024-title17-vol4/xml/CFR-2024-title17-vol4-sec248-30.xml",
    "17 CFR 248.30(a)(4) customer notice as soon as practicable, not later than 30 days",
    "not fetched in this run 2026-10-03"
  ),
  nerc_cip_013: unverified(
    "nerc_cip_013",
    "NERC CIP-013-2 Cyber Security — Supply Chain Risk Management",
    "https://www.nerc.com/pa/Stand/Reliability%20Standards/CIP-013-2.pdf",
    "CIP-013-2 R1 supply chain cyber security risk management plan",
    "not fetched in this run 2026-10-03"
  ),
  nerc_cip_evidence_retention: unverified(
    "nerc_cip_evidence_retention",
    "NERC CIP-008-6 section C Compliance — evidence retention",
    "https://www.nerc.com/pa/Stand/Reliability%20Standards/CIP-008-6.pdf",
    "CIP-008-6 C.1.2 evidence retention period",
    "only pages 9-12 of the PDF were read on 2026-10-03; the compliance section was not read"
  ),
  cfr49_576: unverified(
    "cfr49_576",
    "49 CFR Part 576 Record retention (motor vehicle manufacturers)",
    "https://www.govinfo.gov/content/pkg/CFR-2024-title49-vol7/xml/CFR-2024-title49-vol7-sec576-5.xml",
    "49 CFR 576.5 retention period for records relating to malfunctions",
    "not fetched in this run 2026-10-03"
  ),
  sox_302_404: unverified(
    "sox_302_404",
    "Sarbanes-Oxley Act sections 302 and 404 (15 U.S.C. 7241, 7262)",
    "https://www.govinfo.gov/app/details/USCODE-2023-title15/USCODE-2023-title15-chap98-subchapIV-sec7262",
    "15 U.S.C. 7241 corporate responsibility for financial reports; 7262 management assessment of internal controls",
    "not fetched in this run 2026-10-03"
  ),
  amc_operating_choice: unverified(
    "amc_operating_choice",
    "AMC operating-profile default (not a regulatory value)",
    "docs/INDUSTRY_OPERATING_PROFILES.md",
    "Numeric ceilings and sampling rates are AMC operating choices; the regulation cited beside them sets the duty, not the number",
    "AMC-internal choice documented in docs/INDUSTRY_OPERATING_PROFILES.md; no external primary text exists for the number"
  )
} as const satisfies Record<string, ProfileSource>;

export type SourceId = keyof typeof SOURCES;

export function listProfileSources(): ProfileSource[] {
  return Object.values(SOURCES).map((source) => ({ ...source }));
}

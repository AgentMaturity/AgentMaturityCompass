/**
 * Regulation-derived incident reporting clocks (track F4, 2026-10-03).
 *
 * Every entry names the instrument and article, the trigger event the deadline
 * runs from, the duration, who must be notified, what the notification must
 * contain, and the official source actually read. `verified: true` means the
 * primary text was read from an official publisher on `retrievedAt`
 * (EU Publications Office cellar, GPO govinfo, Texas Legislative Council,
 * New York DFS). `verified: false` entries carry a `reason` and must be
 * confirmed before anyone relies on their duration.
 *
 * Every row is agent-drafted and experimental until a named expert signs off
 * (D-08); CLOCK_REVIEW_STATUS travels with every computed clock. P1-17 added the
 * NYDFS, GLBA Safeguards and BSA SAR rows and rechecked the Texas rows.
 *
 * This table is deliberately local to src/incidents. When the S5 regulatory
 * register (src/compliance/regulatoryRegister/**) stabilises, each entry here
 * should be sourced from a register row keyed by `registerRef` instead of being
 * hand-maintained — see docs/REGULATORY_INCIDENT_CLOCKS.md "Sourcing from the
 * register".
 *
 * Applicability is NOT decided here: a clock listed for a station is a
 * candidate the operator must confirm (for example 45 CFR 164.404 binds HIPAA
 * covered entities, not every health deployment). `condition` states the
 * statutory precondition verbatim or near-verbatim.
 */
import type { Domain } from "../domains/domainRegistry.js";

export type ClockTrigger =
  | "AWARENESS"                        // provider/entity becomes aware (default: incident.createdTs)
  | "CLASSIFICATION_MAJOR"             // DORA: incident classified as major
  | "INITIAL_NOTIFICATION"             // DORA: initial notification submitted
  | "INTERMEDIATE_REPORT"              // DORA: (latest updated) intermediate report submitted
  | "INCIDENT_NOTIFICATION"            // NIS2: 72-hour incident notification submitted
  | "BREACH_DETERMINATION"             // state law: entity determines a breach occurred
  // 23 NYCRR 500.17(a)(1): "no later than 72 hours after determining that a cybersecurity incident has occurred"
  | "INCIDENT_DETERMINATION"
  // 23 NYCRR 500.17(c): "in the event of an extortion payment made in connection with a cybersecurity event"
  | "EXTORTION_PAYMENT"
  // 31 CFR 1020.320(b)(3): "30 calendar days after the date of initial detection by the bank of facts that may constitute a basis for filing a SAR"
  | "INITIAL_DETECTION"
  | "CALENDAR_YEAR_END_AFTER_AWARENESS"; // derived: 1 Jan UTC of the year after AWARENESS

export type ClockDurationUnit = "hours" | "calendarDays" | "workDays" | "months";

export interface ClockDuration {
  amount: number;
  unit: ClockDurationUnit;
}

/** No clock duration has had expert sign-off; this is not legal advice (D-08). */
export const CLOCK_REVIEW_STATUS = "experimental: agent-drafted, expert review pending (D-08)";

export interface ClockSource {
  title: string;
  url: string;
  retrievedAt: string;
  verified: boolean;
  reason?: string;
}

export interface RegulatoryClock {
  clockId: string;
  instrument: string;
  article: string;
  authority: string;
  jurisdiction: string;
  stations: readonly Domain[];
  trigger: ClockTrigger;
  deadline: ClockDuration;
  notify: readonly string[];
  requiredContent: readonly string[];
  condition: string;
  source: ClockSource;
}

const ALL_STATIONS: readonly Domain[] = [
  "health", "education", "environment", "mobility", "governance", "technology", "wealth"
];
// NIS2 Annex I/II sectors map onto every AMC station except education.
const NIS2_STATIONS: readonly Domain[] = [
  "health", "environment", "mobility", "governance", "technology", "wealth"
];

const AI_ACT_SOURCE: ClockSource = {
  title: "Regulation (EU) 2024/1689 (Artificial Intelligence Act), Article 73 — EU Publications Office cellar, CELEX 32024R1689",
  url: "https://publications.europa.eu/resource/celex/32024R1689",
  retrievedAt: "2026-10-03T16:38:02Z",
  verified: true
};
const AI_ACT_CONTENT = [
  "Identification of the high-risk AI system and the provider (Art. 73(1))",
  "Description of the serious incident and the established or reasonably likely causal link with the AI system (Art. 73(2))",
  "An initial report may be incomplete and must be followed by a complete report (Art. 73(5))",
  "Post-report investigation, risk assessment and corrective action (Art. 73(6))"
];

const HIPAA_RETRIEVED = "2026-10-03T16:38:09Z";
const HIPAA_404_SOURCE: ClockSource = {
  title: "45 CFR 164.404 Notification to individuals — GPO govinfo, CFR annual edition 2024 (Title 45, Vol. 2)",
  url: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-404.xml",
  retrievedAt: HIPAA_RETRIEVED,
  verified: true
};
const HIPAA_404_CONTENT = [
  "Brief description of what happened, including the date of the breach and the date of discovery (164.404(c)(1)(A))",
  "Types of unsecured PHI involved (164.404(c)(1)(B))",
  "Steps individuals should take to protect themselves (164.404(c)(1)(C))",
  "What the covered entity is doing to investigate, mitigate harm and protect against further breaches (164.404(c)(1)(D))",
  "Contact procedures including a toll-free number, e-mail, web site or postal address (164.404(c)(1)(E))",
  "Plain language (164.404(c)(2))"
];

const NIS2_SOURCE: ClockSource = {
  title: "Directive (EU) 2022/2555 (NIS2), Article 23 — EU Publications Office cellar, CELEX 32022L2555",
  url: "https://publications.europa.eu/resource/celex/32022L2555",
  retrievedAt: "2026-10-03T16:38:06Z",
  verified: true
};
const NIS2_CONDITION =
  "Essential or important entity; incident is significant per Art. 23(3) (severe operational disruption or financial loss, or considerable damage to other persons). National transposition may set stricter terms.";

const DORA_RTS_SOURCE: ClockSource = {
  title: "Commission Delegated Regulation (EU) 2025/301 (RTS on major ICT-related incident reporting under DORA Art. 19/20), Article 5 — EU Publications Office cellar, CELEX 32025R0301",
  url: "https://publications.europa.eu/resource/celex/32025R0301",
  retrievedAt: "2026-10-03T16:38:05Z",
  verified: true
};
const DORA_CONDITION =
  "Financial entity under Regulation (EU) 2022/2554; incident classified as a major ICT-related incident (Art. 18). Art. 19(4) defers time limits to the RTS adopted under Art. 20(a)(ii). Weekend/bank-holiday relief in RTS Art. 5(4) is not modelled.";
const DORA_CONTENT = [
  "Content per RTS 2025/301 Art. 2 (initial notification), Art. 3 (intermediate report) and Art. 4 (final report), submitted on the ITS templates referred to in DORA Art. 20",
  "All information necessary for the competent authority to determine significance and assess cross-border impact (DORA Art. 19(1))"
];

const FDA_RETRIEVED = "2026-10-03T16:36:55Z";
const FDA_CONTENT = [
  "Information required by 21 CFR 803.52, submitted per 803.12(a) (Form FDA 3500A or electronic equivalent)",
  "Statement explaining any incomplete information and the steps taken to obtain it; supplemental report under 803.56 when it becomes available (803.50(b)(3))"
];

const TEXAS_SOURCE: ClockSource = {
  title: "Texas Business and Commerce Code ch. 521, § 521.053 (Notification Required Following Breach of Security of Computerized Data), as amended through Acts 2023, 88th Leg., ch. 246 (S.B. 768), eff. 2023-09-01 — Texas Legislative Council statute file served to statutes.capitol.texas.gov",
  url: "https://tcss.legis.texas.gov/resources/BC/htm/BC.521.htm",
  retrievedAt: "2026-10-07T17:14:09Z",
  verified: true
};

const NYDFS_SOURCE: ClockSource = {
  title: "23 NYCRR Part 500 (Cybersecurity Requirements for Financial Services Companies), Second Amendment as adopted, effective 2023-11-01 (500.1, 500.17, 500.19) — New York State Department of Financial Services",
  url: "https://www.dfs.ny.gov/system/files/documents/2023/10/rf_fs_2amend23NYCRR500_text_20231101.pdf",
  retrievedAt: "2026-10-07T17:11:34Z",
  verified: true
};
const NYDFS_STATIONS: readonly Domain[] = ["wealth", "technology"];
const NYDFS_NOTIFY = ["The superintendent, electronically in the form set forth on the department's website (500.17(a)(1), (c))"];
const NYDFS_COVERED_ENTITY =
  "Covered entity: a person operating under or required to operate under a license, registration, charter, certificate, permit, accreditation or similar authorization under the Banking Law, the Insurance Law or the Financial Services Law (500.1(e)).";

const BSA_SAR_SOURCE: ClockSource = {
  title: "31 CFR 1020.320 Reports by banks of suspicious transactions — GPO govinfo, CFR annual edition 2025 (Title 31, Vol. 3, revised 2025-07-01); eCFR text for 2026-10-01 has the same (b)(3) deadlines and its version history shows no amendment after 2016-12-23",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title31-vol3/xml/CFR-2025-title31-vol3-sec1020-320.xml",
  retrievedAt: "2026-10-07T17:10:02Z",
  verified: true
};

export const REGULATORY_CLOCK_TABLE: readonly RegulatoryClock[] = [
  {
    clockId: "eu-ai-act-73-2-serious-incident",
    instrument: "Regulation (EU) 2024/1689 (AI Act)",
    article: "Art. 73(2)",
    authority: "Market surveillance authority of the Member State where the incident occurred",
    jurisdiction: "EU",
    stations: ALL_STATIONS,
    trigger: "AWARENESS",
    deadline: { amount: 15, unit: "calendarDays" },
    notify: ["Market surveillance authorities of the Member States where the incident occurred (Art. 73(1))"],
    requiredContent: AI_ACT_CONTENT,
    condition:
      "Provider of a high-risk AI system placed on the Union market; report immediately after establishing a causal link or its reasonable likelihood, and in any event not later than 15 days after the provider or deployer becomes aware; the period takes account of severity (Art. 73(2)).",
    source: AI_ACT_SOURCE
  },
  {
    clockId: "eu-ai-act-73-3-widespread",
    instrument: "Regulation (EU) 2024/1689 (AI Act)",
    article: "Art. 73(3)",
    authority: "Market surveillance authority of the Member State where the incident occurred",
    jurisdiction: "EU",
    stations: ALL_STATIONS,
    trigger: "AWARENESS",
    deadline: { amount: 2, unit: "calendarDays" },
    notify: ["Market surveillance authorities of the Member States where the incident occurred (Art. 73(1))"],
    requiredContent: AI_ACT_CONTENT,
    condition:
      "Widespread infringement, or a serious incident as defined in Art. 3(49)(b) (disruption of critical infrastructure): immediately and not later than two days after awareness (Art. 73(3)).",
    source: AI_ACT_SOURCE
  },
  {
    clockId: "eu-ai-act-73-4-death",
    instrument: "Regulation (EU) 2024/1689 (AI Act)",
    article: "Art. 73(4)",
    authority: "Market surveillance authority of the Member State where the incident occurred",
    jurisdiction: "EU",
    stations: ALL_STATIONS,
    trigger: "AWARENESS",
    deadline: { amount: 10, unit: "calendarDays" },
    notify: ["Market surveillance authorities of the Member States where the incident occurred (Art. 73(1))"],
    requiredContent: AI_ACT_CONTENT,
    condition:
      "Death of a person: immediately after establishing or suspecting a causal relationship, but not later than 10 days after awareness (Art. 73(4)).",
    source: AI_ACT_SOURCE
  },
  {
    clockId: "hipaa-164-404-individual-notice",
    instrument: "45 CFR 164.404 (HIPAA Breach Notification Rule)",
    article: "164.404(b)",
    authority: "U.S. Department of Health and Human Services, Office for Civil Rights",
    jurisdiction: "US-federal",
    stations: ["health"],
    trigger: "AWARENESS",
    deadline: { amount: 60, unit: "calendarDays" },
    notify: ["Each individual whose unsecured PHI has been, or is reasonably believed to have been, accessed, acquired, used or disclosed (164.404(a)(1))"],
    requiredContent: HIPAA_404_CONTENT,
    condition:
      "Covered entity; breach of unsecured protected health information; treated as discovered on the first day it is known or by reasonable diligence would have been known (164.404(a)(2)); without unreasonable delay and in no case later than 60 calendar days after discovery (164.404(b)); law-enforcement delay under 164.412 not modelled.",
    source: HIPAA_404_SOURCE
  },
  {
    clockId: "hipaa-164-408-secretary-500-or-more",
    instrument: "45 CFR 164.408 (HIPAA Breach Notification Rule)",
    article: "164.408(b)",
    authority: "Secretary of Health and Human Services",
    jurisdiction: "US-federal",
    stations: ["health"],
    trigger: "AWARENESS",
    deadline: { amount: 60, unit: "calendarDays" },
    notify: ["Secretary of HHS, in the manner specified on the HHS web site (164.408(b))"],
    requiredContent: ["Submission in the manner specified on the HHS web site (164.408(b)); same discovery date and facts as the individual notice"],
    condition:
      "Breach involving 500 or more individuals: contemporaneously with the 164.404(a) notice, i.e. the same 60-calendar-day outer bound from discovery (164.408(b)).",
    source: {
      title: "45 CFR 164.408 Notification to the Secretary — GPO govinfo, CFR annual edition 2024 (Title 45, Vol. 2)",
      url: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-408.xml",
      retrievedAt: HIPAA_RETRIEVED,
      verified: true
    }
  },
  {
    clockId: "hipaa-164-408-secretary-under-500",
    instrument: "45 CFR 164.408 (HIPAA Breach Notification Rule)",
    article: "164.408(c)",
    authority: "Secretary of Health and Human Services",
    jurisdiction: "US-federal",
    stations: ["health"],
    trigger: "CALENDAR_YEAR_END_AFTER_AWARENESS",
    deadline: { amount: 60, unit: "calendarDays" },
    notify: ["Secretary of HHS, in the manner specified on the HHS web site (164.408(c))"],
    requiredContent: ["Log or other documentation of breaches involving fewer than 500 individuals discovered during the preceding calendar year (164.408(c))"],
    condition:
      "Breach involving fewer than 500 individuals: not later than 60 days after the end of the calendar year in which it was discovered (164.408(c)).",
    source: {
      title: "45 CFR 164.408 Notification to the Secretary — GPO govinfo, CFR annual edition 2024 (Title 45, Vol. 2)",
      url: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-408.xml",
      retrievedAt: HIPAA_RETRIEVED,
      verified: true
    }
  },
  {
    clockId: "hipaa-164-410-business-associate",
    instrument: "45 CFR 164.410 (HIPAA Breach Notification Rule)",
    article: "164.410(b)",
    authority: "Covered entity (recipient); HHS OCR (enforcement)",
    jurisdiction: "US-federal",
    stations: ["health"],
    trigger: "AWARENESS",
    deadline: { amount: 60, unit: "calendarDays" },
    notify: ["The covered entity (164.410(a)(1))"],
    requiredContent: [
      "Identification of each individual whose unsecured PHI was, or is reasonably believed to have been, accessed, acquired, used or disclosed (164.410(c)(1))",
      "Any other information the covered entity needs for its 164.404(c) notice, at notification time or promptly thereafter (164.410(c)(2))"
    ],
    condition:
      "Business associate; breach of unsecured PHI; without unreasonable delay and in no case later than 60 calendar days after discovery (164.410(b)).",
    source: {
      title: "45 CFR 164.410 Notification by a business associate — GPO govinfo, CFR annual edition 2024 (Title 45, Vol. 2)",
      url: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-410.xml",
      retrievedAt: "2026-10-03T16:38:10Z",
      verified: true
    }
  },
  {
    clockId: "gdpr-33-1-supervisory-authority",
    instrument: "Regulation (EU) 2016/679 (GDPR)",
    article: "Art. 33(1)",
    authority: "Competent supervisory authority (Art. 55)",
    jurisdiction: "EU",
    stations: ALL_STATIONS,
    trigger: "AWARENESS",
    deadline: { amount: 72, unit: "hours" },
    notify: ["Supervisory authority competent under Art. 55 (Art. 33(1))", "Data subjects without undue delay where high risk (Art. 34(1))"],
    requiredContent: [
      "Nature of the breach incl. categories and approximate numbers of data subjects and records (Art. 33(3)(a))",
      "Name and contact details of the DPO or other contact point (Art. 33(3)(b))",
      "Likely consequences (Art. 33(3)(c))",
      "Measures taken or proposed, including mitigation (Art. 33(3)(d))",
      "Reasons for any delay beyond 72 hours (Art. 33(1))"
    ],
    condition:
      "Controller; personal data breach, unless unlikely to result in a risk to rights and freedoms; without undue delay and where feasible not later than 72 hours after awareness (Art. 33(1)).",
    source: {
      title: "Regulation (EU) 2016/679 (GDPR), Articles 33–34 — EU Publications Office cellar, CELEX 32016R0679",
      url: "https://publications.europa.eu/resource/celex/32016R0679",
      retrievedAt: "2026-10-03T16:38:08Z",
      verified: true
    }
  },
  {
    clockId: "nis2-23-4a-early-warning",
    instrument: "Directive (EU) 2022/2555 (NIS2)",
    article: "Art. 23(4)(a)",
    authority: "National CSIRT or competent authority",
    jurisdiction: "EU (transposed nationally)",
    stations: NIS2_STATIONS,
    trigger: "AWARENESS",
    deadline: { amount: 24, unit: "hours" },
    notify: ["CSIRT or, where applicable, competent authority (Art. 23(1))", "Recipients of the services where appropriate (Art. 23(1))"],
    requiredContent: ["Early warning: whether the incident is suspected to be caused by unlawful or malicious acts or could have a cross-border impact (Art. 23(4)(a))"],
    condition: NIS2_CONDITION,
    source: NIS2_SOURCE
  },
  {
    clockId: "nis2-23-4b-incident-notification",
    instrument: "Directive (EU) 2022/2555 (NIS2)",
    article: "Art. 23(4)(b)",
    authority: "National CSIRT or competent authority",
    jurisdiction: "EU (transposed nationally)",
    stations: NIS2_STATIONS,
    trigger: "AWARENESS",
    deadline: { amount: 72, unit: "hours" },
    notify: ["CSIRT or, where applicable, competent authority (Art. 23(1))"],
    requiredContent: ["Update of the early warning and an initial assessment of severity and impact, plus indicators of compromise where available (Art. 23(4)(b))"],
    condition: `${NIS2_CONDITION} Trust service providers: 24 hours (Art. 23(4), derogation).`,
    source: NIS2_SOURCE
  },
  {
    clockId: "nis2-23-4d-final-report",
    instrument: "Directive (EU) 2022/2555 (NIS2)",
    article: "Art. 23(4)(d)",
    authority: "National CSIRT or competent authority",
    jurisdiction: "EU (transposed nationally)",
    stations: NIS2_STATIONS,
    trigger: "INCIDENT_NOTIFICATION",
    deadline: { amount: 1, unit: "months" },
    notify: ["CSIRT or, where applicable, competent authority (Art. 23(1))"],
    requiredContent: [
      "Detailed description of the incident incl. severity and impact (Art. 23(4)(d)(i))",
      "Type of threat or root cause likely to have triggered it (Art. 23(4)(d)(ii))",
      "Applied and ongoing mitigation measures (Art. 23(4)(d)(iii))",
      "Cross-border impact where applicable (Art. 23(4)(d)(iv))",
      "If still ongoing: a progress report now and a final report within one month of handling (Art. 23(4)(e))"
    ],
    condition: `${NIS2_CONDITION} Runs from submission of the Art. 23(4)(b) incident notification.`,
    source: NIS2_SOURCE
  },
  {
    clockId: "dora-rts-2025-301-art5-initial-awareness",
    instrument: "Commission Delegated Regulation (EU) 2025/301 (DORA incident-reporting RTS)",
    article: "Art. 5(1)(a) — 24-hour outer bound",
    authority: "Relevant competent authority under DORA Art. 46",
    jurisdiction: "EU",
    stations: ["wealth"],
    trigger: "AWARENESS",
    deadline: { amount: 24, unit: "hours" },
    notify: ["Relevant competent authority (DORA Art. 19(1)); significant credit institutions via the national competent authority to the ECB"],
    requiredContent: DORA_CONTENT,
    condition: `${DORA_CONDITION} Initial notification no later than 24 hours from awareness (RTS Art. 5(1)(a)).`,
    source: DORA_RTS_SOURCE
  },
  {
    clockId: "dora-rts-2025-301-art5-initial-classification",
    instrument: "Commission Delegated Regulation (EU) 2025/301 (DORA incident-reporting RTS)",
    article: "Art. 5(1)(a) / 5(2) — 4 hours from classification",
    authority: "Relevant competent authority under DORA Art. 46",
    jurisdiction: "EU",
    stations: ["wealth"],
    trigger: "CLASSIFICATION_MAJOR",
    deadline: { amount: 4, unit: "hours" },
    notify: ["Relevant competent authority (DORA Art. 19(1))"],
    requiredContent: DORA_CONTENT,
    condition: `${DORA_CONDITION} Initial notification within four hours from classification as major (RTS Art. 5(1)(a), 5(2)).`,
    source: DORA_RTS_SOURCE
  },
  {
    clockId: "dora-rts-2025-301-art5-intermediate",
    instrument: "Commission Delegated Regulation (EU) 2025/301 (DORA incident-reporting RTS)",
    article: "Art. 5(1)(b)",
    authority: "Relevant competent authority under DORA Art. 46",
    jurisdiction: "EU",
    stations: ["wealth"],
    trigger: "INITIAL_NOTIFICATION",
    deadline: { amount: 72, unit: "hours" },
    notify: ["Relevant competent authority (DORA Art. 19(1))"],
    requiredContent: DORA_CONTENT,
    condition: `${DORA_CONDITION} Intermediate report at the latest within 72 hours from submission of the initial notification, even if status unchanged (RTS Art. 5(1)(b)).`,
    source: DORA_RTS_SOURCE
  },
  {
    clockId: "dora-rts-2025-301-art5-final",
    instrument: "Commission Delegated Regulation (EU) 2025/301 (DORA incident-reporting RTS)",
    article: "Art. 5(1)(c)",
    authority: "Relevant competent authority under DORA Art. 46",
    jurisdiction: "EU",
    stations: ["wealth"],
    trigger: "INTERMEDIATE_REPORT",
    deadline: { amount: 1, unit: "months" },
    notify: ["Relevant competent authority (DORA Art. 19(1))"],
    requiredContent: DORA_CONTENT,
    condition: `${DORA_CONDITION} Final report no later than one month after the (latest updated) intermediate report (RTS Art. 5(1)(c)).`,
    source: DORA_RTS_SOURCE
  },
  {
    clockId: "fda-803-50-mdr-30-day",
    instrument: "21 CFR 803.50 (Medical Device Reporting)",
    article: "803.50(a)",
    authority: "U.S. Food and Drug Administration",
    jurisdiction: "US-federal",
    stations: ["health"],
    trigger: "AWARENESS",
    deadline: { amount: 30, unit: "calendarDays" },
    notify: ["FDA (803.50(a)), per 803.12(a)"],
    requiredContent: FDA_CONTENT,
    condition:
      "Device manufacturer; information from any source reasonably suggesting a marketed device may have caused or contributed to a death or serious injury, or malfunctioned such that recurrence would be likely to do so; no later than 30 calendar days after becoming aware (803.50(a)).",
    source: {
      title: "21 CFR 803.50 manufacturer reporting requirements — GPO govinfo, CFR annual edition 2024 (Title 21, Vol. 8)",
      url: "https://www.govinfo.gov/content/pkg/CFR-2024-title21-vol8/xml/CFR-2024-title21-vol8-sec803-50.xml",
      retrievedAt: FDA_RETRIEVED,
      verified: true
    }
  },
  {
    clockId: "fda-803-53-five-day",
    instrument: "21 CFR 803.53 (Medical Device Reporting)",
    article: "803.53",
    authority: "U.S. Food and Drug Administration",
    jurisdiction: "US-federal",
    stations: ["health"],
    trigger: "AWARENESS",
    deadline: { amount: 5, unit: "workDays" },
    notify: ["FDA (803.53), per 803.12(a)"],
    requiredContent: FDA_CONTENT,
    condition:
      "Device manufacturer; an MDR reportable event necessitates remedial action to prevent an unreasonable risk of substantial harm to public health, or FDA has made a written request; no later than 5 work days after becoming aware (803.53). Work days computed as Mon–Fri UTC; US federal holidays not modelled.",
    source: {
      title: "21 CFR 803.53 five-day report — GPO govinfo, CFR annual edition 2024 (Title 21, Vol. 8)",
      url: "https://www.govinfo.gov/content/pkg/CFR-2024-title21-vol8/xml/CFR-2024-title21-vol8-sec803-53.xml",
      retrievedAt: "2026-10-03T16:36:56Z",
      verified: true
    }
  },
  {
    clockId: "tx-bcc-521-053-individual-notice",
    instrument: "Texas Business and Commerce Code § 521.053",
    article: "§ 521.053(b)",
    authority: "Texas Attorney General (enforcement, § 521.151)",
    jurisdiction: "US-TX",
    stations: ALL_STATIONS,
    trigger: "BREACH_DETERMINATION",
    deadline: { amount: 60, unit: "calendarDays" },
    notify: ["Each individual whose sensitive personal information was, or is reasonably believed to have been, acquired by an unauthorized person (§ 521.053(b))"],
    requiredContent: [
      "Disclosure of the breach of system security; § 521.053 prescribes no content list for the individual notice",
      "Written notice to the last known address, electronic notice under 15 U.S.C. 7001, or substitute notice where § 521.053(f) allows it (§ 521.053(e))",
      "If more than 10,000 persons are notified at one time: notice to each nationwide consumer reporting agency of the timing, distribution and content of the notices, without unreasonable delay (§ 521.053(h))"
    ],
    condition:
      "Person who conducts business in Texas and owns or licenses computerized data that includes sensitive personal information; breach of system security as defined in § 521.053(a); without unreasonable delay and in each case not later than the 60th day after the date on which the person determines that the breach occurred, except for a law-enforcement delay under § 521.053(d) or as necessary to determine the scope of the breach and restore the reasonable integrity of the data system (§ 521.053(b)). Residents of another state with a breach-notice law may be notified under that state's law (§ 521.053(b-1)). The exceptions are not modelled.",
    source: TEXAS_SOURCE
  },
  {
    clockId: "tx-bcc-521-053-attorney-general",
    instrument: "Texas Business and Commerce Code § 521.053",
    article: "§ 521.053(i)",
    authority: "Texas Attorney General",
    jurisdiction: "US-TX",
    stations: ALL_STATIONS,
    trigger: "BREACH_DETERMINATION",
    deadline: { amount: 30, unit: "calendarDays" },
    notify: ["Texas Attorney General, electronically on the form accessed through the attorney general's website (§ 521.053(i))"],
    requiredContent: [
      "Detailed description of the nature and circumstances of the breach or the use of sensitive personal information acquired as a result of it (§ 521.053(i)(1))",
      "Number of Texas residents affected at the time of notification (§ 521.053(i)(2))",
      "Number of affected residents sent a disclosure by mail or other direct method at the time of notification (§ 521.053(i)(3))",
      "Measures taken regarding the breach (§ 521.053(i)(4))",
      "Measures the person intends to take after the notification (§ 521.053(i)(5))",
      "Whether law enforcement is engaged in investigating the breach (§ 521.053(i)(6))"
    ],
    condition:
      "Person required to disclose or notify a breach of system security under § 521.053; breach involves at least 250 residents of Texas; as soon as practicable and not later than the 30th day after the date on which the person determines that the breach occurred (§ 521.053(i)). AMC does not check the 250-resident threshold.",
    source: TEXAS_SOURCE
  },
  {
    clockId: "nydfs-500-17-notice",
    instrument: "23 NYCRR Part 500 (NYDFS Cybersecurity Regulation)",
    article: "500.17(a)(1)",
    authority: "Superintendent of Financial Services, New York State Department of Financial Services",
    jurisdiction: "US-NY",
    stations: NYDFS_STATIONS,
    trigger: "INCIDENT_DETERMINATION",
    deadline: { amount: 72, unit: "hours" },
    notify: NYDFS_NOTIFY,
    requiredContent: [
      "Notice of the cybersecurity incident on the department's electronic form; Part 500 does not list the form's fields (500.17(a)(1))",
      "Any information the superintendent requests regarding the incident, provided promptly (500.17(a)(2))",
      "Continuing updates on material changes or new information previously unavailable (500.17(a)(2))"
    ],
    condition: `${NYDFS_COVERED_ENTITY} Cybersecurity incident: a cybersecurity event at the covered entity, its affiliates or a third-party service provider that impacts the covered entity and requires it to notify any government body, self-regulatory agency or other supervisory body; has a reasonable likelihood of materially harming any material part of its normal operations; or results in the deployment of ransomware within a material part of its information systems (500.1(g)). As promptly as possible but in no event later than 72 hours after determining that the incident occurred (500.17(a)(1)). The 500.19(a) limited exemption does not list 500.17; persons exempt from the whole Part under 500.19(e) or (g) are outside it.`,
    source: NYDFS_SOURCE
  },
  {
    clockId: "nydfs-500-17-extortion-notice",
    instrument: "23 NYCRR Part 500 (NYDFS Cybersecurity Regulation)",
    article: "500.17(c)(1)",
    authority: "Superintendent of Financial Services, New York State Department of Financial Services",
    jurisdiction: "US-NY",
    stations: NYDFS_STATIONS,
    trigger: "EXTORTION_PAYMENT",
    deadline: { amount: 24, unit: "hours" },
    notify: NYDFS_NOTIFY,
    requiredContent: ["Notice of the extortion payment on the department's electronic form (500.17(c)(1))"],
    condition: `${NYDFS_COVERED_ENTITY} An extortion payment made in connection with a cybersecurity event involving the covered entity: notice within 24 hours of the payment (500.17(c)(1)).`,
    source: NYDFS_SOURCE
  },
  {
    clockId: "nydfs-500-17-extortion-explanation",
    instrument: "23 NYCRR Part 500 (NYDFS Cybersecurity Regulation)",
    article: "500.17(c)(2)",
    authority: "Superintendent of Financial Services, New York State Department of Financial Services",
    jurisdiction: "US-NY",
    stations: NYDFS_STATIONS,
    trigger: "EXTORTION_PAYMENT",
    deadline: { amount: 30, unit: "calendarDays" },
    notify: NYDFS_NOTIFY,
    requiredContent: [
      "Written description of the reasons payment was necessary (500.17(c)(2))",
      "Description of alternatives to payment considered (500.17(c)(2))",
      "All diligence performed to find alternatives to payment (500.17(c)(2))",
      "All diligence performed to ensure compliance with applicable rules and regulations, including those of the Office of Foreign Assets Control (500.17(c)(2))"
    ],
    condition: `${NYDFS_COVERED_ENTITY} An extortion payment made in connection with a cybersecurity event involving the covered entity: written explanation within 30 days of the payment (500.17(c)(2)). The text says "30 days"; AMC counts calendar days.`,
    source: NYDFS_SOURCE
  },
  {
    clockId: "glba-314-4j-ftc-notice",
    instrument: "16 CFR Part 314 (FTC Safeguards Rule, Gramm-Leach-Bliley Act)",
    article: "314.4(j)(1)",
    authority: "Federal Trade Commission",
    jurisdiction: "US-federal",
    stations: ["wealth", "technology"],
    trigger: "AWARENESS",
    deadline: { amount: 30, unit: "calendarDays" },
    notify: ["Federal Trade Commission, electronically on the form located on the FTC's website (314.4(j)(1))"],
    requiredContent: [
      "Name and contact information of the reporting financial institution (314.4(j)(1)(i))",
      "Description of the types of information involved in the notification event (314.4(j)(1)(ii))",
      "Date or date range of the notification event, if possible to determine (314.4(j)(1)(iii))",
      "Number of consumers affected or potentially affected (314.4(j)(1)(iv))",
      "General description of the notification event (314.4(j)(1)(v))",
      "Whether a law enforcement official has given a written determination that public notice would impede a criminal investigation or damage national security, and a means for the FTC to contact that official (314.4(j)(1)(vi))"
    ],
    condition:
      "Notification event affecting 500 or more consumers: acquisition of unencrypted customer information without the authorization of the individual it pertains to (314.2(m)) that involves the information of at least 500 consumers; as soon as possible and no later than 30 days after discovery (314.4(j)(1)). Discovered on the first day the event is known to the institution, including when known to any employee, officer or other agent other than the person committing the breach (314.4(j)(2)); AMC runs the clock from AWARENESS. Financial institutions under FTC jurisdiction only (314.1(b)). The law-enforcement delay in 314.4(j)(1) runs after notice to the FTC and is not modelled. The text says \"30 days\"; AMC counts calendar days. AMC does not check the 500-consumer threshold.",
    source: {
      title: "16 CFR 314.4(j) (with 314.1 and 314.2) Standards for Safeguarding Customer Information — GPO govinfo, CFR annual edition 2026 (Title 16, Vol. 1, revised 2026-01-01); eCFR version history shows no amendment to 314.4 after 2024-05-13",
      url: "https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xml/CFR-2026-title16-vol1-sec314-4.xml",
      retrievedAt: "2026-10-07T17:10:30Z",
      verified: true
    }
  },
  {
    clockId: "bsa-1020-320-sar-filing",
    instrument: "31 CFR 1020.320 (Bank Secrecy Act suspicious activity reports by banks)",
    article: "1020.320(b)(3)",
    authority: "Financial Crimes Enforcement Network (FinCEN), U.S. Department of the Treasury",
    jurisdiction: "US-federal",
    stations: ["wealth"],
    trigger: "INITIAL_DETECTION",
    deadline: { amount: 30, unit: "calendarDays" },
    notify: [
      "FinCEN, by filing a Suspicious Activity Report as the SAR instructions indicate (1020.320(b)(1)-(2))",
      "An appropriate law enforcement authority, immediately by telephone, for violations that require immediate attention such as ongoing money laundering schemes (1020.320(b)(3))"
    ],
    requiredContent: [
      "A completed Suspicious Activity Report (SAR) (1020.320(b)(1))",
      "Supporting documentation, identified and kept with the SAR; the SAR copy and the supporting documentation are kept for five years from filing (1020.320(b)(1), (d))",
      "Never disclose the SAR or its existence to its subject, or to anyone else except as 1020.320(e) authorizes (1020.320(e)(1))"
    ],
    condition:
      "Bank; a transaction conducted or attempted by, at or through the bank that involves or aggregates at least $5,000 in funds or other assets, where the bank knows, suspects or has reason to suspect a ground in 1020.320(a)(2)(i)-(iii); no later than 30 calendar days after the date of initial detection of facts that may constitute a basis for filing (1020.320(b)(3)). If no suspect was identified on the date of detection, filing may be delayed a further 30 calendar days to identify one, never beyond 60 calendar days after initial detection; that extension is not modelled. Robberies or burglaries reported to law enforcement and lost, missing, counterfeit or stolen securities reported under 17 CFR 240.17f-1 are excepted (1020.320(c)). This clock encodes the bank rule only. AMC never files a SAR.",
    source: BSA_SAR_SOURCE
  }
];

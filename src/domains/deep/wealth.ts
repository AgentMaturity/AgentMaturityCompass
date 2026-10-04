/**
 * Deep questions. Wealth station: SOX, Basel III, AML (31 CFR), MiFID II and MAR.
 * Moved verbatim from deepIndustryPacks.ts. The template-generated questions stay in that facade,
 * because tests/deepIndustryPacksStations.test.ts keeps src/domains/deep/ hand-written.
 */

import { levels, REPAIR_RETRIEVED_AT, source, type DeepIndustryQuestion, type RegulationSource } from "./shared.js";

/** Wealth packs in scope per regime: AML follows FATF/BSA in the basis; MiFID II/MAR reach crypto-assets that are financial instruments. */
const SOX_PACKS = ["digital-payments", "circular-economy"];
const BASEL_PACKS = ["circular-economy", "digital-payments"];
const AML_PACKS = ["digital-payments", "blockchain", "no-poverty"];
const MIFID_PACKS = ["blockchain", "circular-economy"];

const SOX = source("Sarbanes-Oxley Act of 2002, Pub. L. 107-204 (§302, §404)", "https://www.govinfo.gov/content/pkg/PLAW-107publ204/html/PLAW-107publ204.htm");
const BASEL = source("Basel III: international regulatory framework for banks (BCBS)", "https://www.bis.org/bcbs/basel3.htm",
  "Page confirms the Basel III framework; the section label is a thematic area, not a clause of the Basel Framework.");

export const FINANCE_CONTROLS = [
  { control: "journal entry approval segregation", regulation: "SOX", packIds: SOX_PACKS, section: "Section 404", evidence: ["approval_log", "role_matrix", "change_audit"], source: SOX },
  { control: "reconciliation exception handling", regulation: "SOX", packIds: SOX_PACKS, section: "Section 302", evidence: ["reconciliation_report", "exception_queue", "resolution_log"], source: SOX },
  { control: "model validation governance", regulation: "Basel III", packIds: BASEL_PACKS, section: "Model Risk Governance", evidence: ["validation_report", "challenge_log", "backtest"], source: BASEL },
  { control: "stress loss scenario coverage", regulation: "Basel III", packIds: BASEL_PACKS, section: "Stress Testing", evidence: ["stress_result", "scenario_library", "approval_memo"], source: BASEL },
  { control: "suspicious activity escalation", regulation: "AML", packIds: AML_PACKS, section: "31 CFR §1020.320 (bank SAR filing)", evidence: ["alert_log", "case_record", "sar_submission"],
    source: source("31 CFR §1020.320 Reports by banks of suspicious transactions (CFR 2024 edition)", "https://www.govinfo.gov/content/pkg/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1020-320.xml") },
  { control: "KYC refresh enforcement", regulation: "AML", packIds: AML_PACKS, section: "CDD Rule — 31 CFR §1010.230", evidence: ["kyc_refresh_log", "identity_check", "expiry_alert"],
    source: source("31 CFR §1010.230 Beneficial ownership requirements for legal entity customers (CFR 2024 edition)", "https://www.govinfo.gov/content/pkg/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1010-230.xml") },
  // RTS 28 venue reports were dropped (Art. 27(6) is absent from ESMA's current rulebook text); the best-execution duty in Art. 27(1) remains.
  { control: "best execution monitoring", regulation: "MiFID II", packIds: MIFID_PACKS, section: "Art. 27(1) — best execution", evidence: ["execution_report", "venue_comparison", "slippage_log"],
    source: source("Directive 2014/65/EU (MiFID II) Art. 27 — ESMA Interactive Single Rulebook", "https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-27-obligation-execute-orders") },
  { control: "market abuse surveillance", regulation: "MAR", packIds: MIFID_PACKS, section: "Art. 16 — prevention and detection of market abuse", evidence: ["surveillance_alert", "investigation_note", "trade_replay"],
    source: source("Regulation (EU) No 596/2014 (Market Abuse Regulation)", "https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014R0596",
      "Art. 16 content confirmed from EUR-Lex and ESMA search results; the EUR-Lex page itself did not render for review.") },
  { control: "client money segregation", regulation: "MiFID II", packIds: MIFID_PACKS, section: "Art. 16(8)-(9) — safeguarding client assets", evidence: ["ledger_snapshot", "segregation_control", "breach_report"],
    source: source("Directive 2014/65/EU (MiFID II) Art. 16 — ESMA Interactive Single Rulebook", "https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-16-organisational-requirements") },
  { control: "limit breach handling", regulation: "Basel III", packIds: BASEL_PACKS, section: "Risk Limits", evidence: ["limit_event", "override_approval", "risk_dashboard"], source: BASEL },
];

/**
 * Hand-written wealth questions; the facade appends the template-generated ones (finance-deep-03..50).
 * Round-2 review (2026-10-04): ids continue that numbering from 51. finance-deep-51 replaces
 * finance-sox-control-01 (ICFR is SOX §404; §302 is officer certification); finance-basel-risk-01 is retired
 * (RWA calculation is a bank capital computation, not an agent control). Receipt:
 * AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/wealth/.
 */
const read = (title: string, url: string, retrievedAt: string, note: string): RegulationSource => ({ title, url, retrievedAt, verified: true, note });

export const FINANCE_HAND_WRITTEN: DeepIndustryQuestion[] = [
  {
    id: "finance-deep-51",
    industry: "finance",
    station: "wealth",
    packIds: SOX_PACKS,
    regulation: "SOX",
    section: "Section 404(a) — management assessment of internal control",
    question: "Are journal entries and reconciliations generated by the agent subject to internal control over financial reporting, with approval by a separate human role and tested controls?",
    evaluationCriteria: ["Agent-generated entries are identified", "Approval is by a role separate from the agent's operator", "Control tests are documented", "Exceptions are logged"],
    levels: levels(
      "No control activity over agent-generated journal entries or reconciliations",
      "Entries are reviewed ad hoc",
      "Agent-generated entries require approval by a separate human role; control tests documented",
      "Segregation of duties is enforced technically and exceptions are logged",
      "As level 4, and the control tests are included in management's §404 assessment",
    ),
    evidenceTypes: ["approval_log", "role_matrix", "control_test", "exception_log"],
    source: SOX,
  },
  {
    id: "finance-deep-52",
    industry: "finance",
    station: "wealth",
    packIds: ["blockchain"],
    regulation: "MiCA",
    section: "Regulation (EU) 2023/1114 Art. 92(1) — prevention and detection of market abuse",
    question: "When the agent professionally arranges or executes crypto-asset transactions, do surveillance arrangements cover the agent's own order flow and is every reasonable suspicion reported to the competent authority without delay?",
    evaluationCriteria: [
      "Surveillance scope includes orders and transactions the agent arranges or executes",
      "Each alert has a case record with a decision",
      "Suspicions are reported without delay with submission evidence",
      "Cancellations and modifications of orders are in scope",
    ],
    levels: levels(
      "No surveillance of the agent's order flow",
      "Surveillance exists for human-originated orders only",
      "Agent orders are surveilled and alerts have case records, but reporting is manual or untimed",
      "Alerts, cases and reports are linked, with the time from suspicion to report recorded for each case",
      "As level 4, and surveillance coverage of agent orders (including cancellations and modifications) is tested on each release",
    ),
    evidenceTypes: ["surveillance_alert", "case_record", "suspicious_order_report", "coverage_test"],
    source: read("Regulation (EU) 2023/1114 (MiCA)", "https://data.europa.eu/eli/reg/2023/1114/oj", REPAIR_RETRIEVED_AT,
      "Art. 92(1) opening text read as Publications Office CELLAR text of CELEX 32023R1114."),
  },
  {
    id: "finance-deep-53",
    industry: "finance",
    station: "wealth",
    packIds: ["digital-payments"],
    regulation: "DORA",
    section: "Regulation (EU) 2022/2554 Art. 19; Delegated Regulation (EU) 2025/301 Art. 5(1)",
    question: "When an ICT incident involving the agent is classified as major, are the initial notification, intermediate report and final report submitted within the RTS time limits (4 hours from classification and 24 hours from awareness; 72 hours; one month)?",
    evaluationCriteria: ["Agent incidents enter the DORA classification process", "Timers start at awareness and at classification", "Each report has a submission timestamp", "Late submissions are notified to the authority"],
    levels: levels(
      "Agent incidents are not classified under DORA",
      "Agent incidents are classified, but reporting timers are not tracked",
      "Timers are tracked manually and submissions are timestamped",
      "Timers are enforced by tooling, and any late submission has a recorded notice to the authority",
      "As level 4, and a timed exercise of the full reporting chain is run at least annually with results recorded",
    ),
    evidenceTypes: ["incident_classification", "notification_timestamp", "late_notice", "exercise_report"],
    source: read("Commission Delegated Regulation (EU) 2025/301 (DORA incident reporting content and time limits)", "https://data.europa.eu/eli/reg_del/2025/301/oj", REPAIR_RETRIEVED_AT,
      "Art. 5(1)(a)-(c) read as CELLAR text of CELEX 32025R0301: initial 4 hours from classification and 24 hours from awareness; intermediate 72 hours; final one month."),
  },
  {
    id: "finance-deep-54",
    industry: "finance",
    station: "wealth",
    packIds: ["digital-payments", "no-poverty"],
    regulation: "Regulation B",
    section: "12 CFR 1002.9(a)(2), (b)(2) — statement of specific reasons",
    question: "For each US adverse action the agent decides or supports, does the notice state the specific principal reasons derived from the features the model actually used for that applicant?",
    evaluationCriteria: ["Reasons are computed per decision", "Reasons map to model features used", "Generic 'did not reach a qualifying score' statements are blocked", "Reason accuracy is sampled and checked"],
    levels: levels(
      "No reasons are given",
      "Reasons are generic or state only that a qualifying score was not reached",
      "Reasons come from a fixed list not linked to the applicant's model features",
      "Reasons are computed from the model's attributions for each decision and retained with it",
      "As level 4, and a sample of notices is checked against the decision records each quarter with errors corrected",
    ),
    evidenceTypes: ["adverse_action_notice", "attribution_record", "accuracy_sample"],
    source: read("12 CFR §1002.9 Notifications (CFR 2026 edition)", "https://www.govinfo.gov/content/pkg/CFR-2026-title12-vol8/xml/CFR-2026-title12-vol8-sec1002-9.xml", REPAIR_RETRIEVED_AT,
      "(b)(2): reasons must be specific; a statement that the applicant failed to achieve a qualifying score is insufficient. Also read via the eCFR versioner API as of 2026-09-30."),
  },
  {
    id: "finance-deep-55",
    industry: "finance",
    station: "wealth",
    packIds: ["digital-payments"],
    regulation: "Instant Payments Regulation",
    section: "Regulation (EU) No 260/2012 Art. 5c (inserted by Regulation (EU) 2024/886)",
    question: "When the agent prepares or initiates a euro credit transfer, is verification of payee obtained before authorisation and does a close match or mismatch stop the agent from authorising on the payer's behalf?",
    evaluationCriteria: [
      "Verification result is recorded before authorisation",
      "Close-match and no-match outcomes are shown to the payer",
      "The agent cannot authorise after a mismatch without an explicit payer decision",
      "Bulk and agent-initiated transfers are covered",
    ],
    levels: levels(
      "No verification of payee for agent-initiated transfers",
      "Verification runs, but the agent proceeds regardless of the result",
      "Mismatches are shown to the payer, but the agent can still authorise without an explicit decision",
      "An explicit payer decision is required after any non-match, and the result is retained per transfer",
      "As level 4, and tests cover match, close-match, no-match and not-possible outcomes for single and bulk transfers",
    ),
    evidenceTypes: ["vop_result_log", "payer_decision_record", "test_report"],
    source: read("Regulation (EU) No 260/2012 Art. 5c, inserted by Regulation (EU) 2024/886", "https://data.europa.eu/eli/reg/2024/886/oj", "2026-10-03",
      "Art. 5c and Art. 5c(9) read as CELLAR text of CELEX 32024R0886: euro-area PSPs from 2025-10-09, non-euro from 2027-07-09."),
  },
  {
    id: "finance-deep-56",
    industry: "finance",
    station: "wealth",
    packIds: ["blockchain"],
    regulation: "TFR",
    section: "Regulation (EU) 2023/1113 Arts 14, 16, 17",
    question: "Does every crypto-asset transfer the agent sends carry complete originator and beneficiary information with no amount threshold, are transfers over EUR 1 000 to self-hosted addresses assessed for ownership, and are incoming transfers with missing information handled under a risk-based procedure?",
    evaluationCriteria: [
      "No amount threshold for the EU information requirement",
      "Self-hosted transfers over EUR 1 000 have an ownership assessment",
      "Missing information on incoming transfers is detected",
      "Execute/reject/return/suspend decisions are recorded",
    ],
    levels: levels(
      "Information is attached only above a threshold",
      "Information is attached to all transfers, but self-hosted transfers are not assessed",
      "Self-hosted assessments are made but not recorded, or incoming missing information is not detected",
      "All three controls run and each decision is recorded",
      "As level 4, and the controls are tested per release with jurisdiction rules versioned",
    ),
    evidenceTypes: ["transfer_payload", "self_hosted_assessment", "missing_info_log", "decision_record"],
    source: read("Regulation (EU) 2023/1113 (Transfer of Funds Regulation)", "https://data.europa.eu/eli/reg/2023/1113/oj", REPAIR_RETRIEVED_AT,
      "Arts 14 (incl. 14(5)), 16 and 17 read as CELLAR text of CELEX 32023R1113; the only EUR 1 000 figure in Art. 14 is in para 5 (self-hosted addresses). Station digest proposal 10."),
  },
  {
    id: "finance-deep-57",
    industry: "finance",
    station: "wealth",
    packIds: ["no-poverty", "digital-payments"],
    regulation: "Consumer Credit Directive",
    section: "Directive (EU) 2023/2225 Art. 18(8)",
    question: "Where the agent's creditworthiness assessment uses automated processing, can the consumer obtain human intervention, a clear explanation of the assessment and its logic, express a view and contest the decision?",
    evaluationCriteria: ["Human intervention is available on request", "Explanations come from the assessment record", "Views and contests are logged with outcomes", "Response times are measured"],
    levels: levels(
      "No route to human intervention",
      "Human intervention exists, but explanations are generic",
      "Explanations come from the assessment record, but contests are not logged",
      "Requests, explanations and contests are logged with outcomes and response times",
      "As level 4, and outcomes of contests feed back into recorded model or policy changes",
    ),
    evidenceTypes: ["intervention_request", "explanation_record", "contest_log"],
    source: read("Directive (EU) 2023/2225 (Consumer Credit Directive)", "https://data.europa.eu/eli/dir/2023/2225/oj", "2026-10-03",
      "Arts 18(1), 18(8) and 48(1) read as CELLAR text of CELEX 32023L2225; national measures apply from 2026-11-20."),
  },
  {
    id: "finance-deep-58",
    industry: "finance",
    station: "wealth",
    packIds: ["circular-economy"],
    regulation: "Regulation S-P",
    section: "17 CFR 248.30 — response program and customer notice",
    question: "If the agent or an AI service provider has access to customer information, is it inside the incident response program, and can affected individuals be notified as soon as practicable and no later than 30 days after the firm becomes aware of unauthorized access?",
    evaluationCriteria: ["Agent and AI vendors are in the incident response scope", "Detection covers agent actions on customer information", "Notification timer starts at awareness", "Service-provider oversight is evidenced"],
    levels: levels(
      "Agent and AI vendors are outside the response program",
      "They are in scope on paper, but agent actions are not monitored",
      "Agent actions are monitored, but the 30-day timer is manual",
      "Detection, timer and service-provider oversight are evidenced",
      "As level 4, and an incident exercise involving the agent is run at least annually",
    ),
    evidenceTypes: ["response_program", "access_log", "notice_timer", "vendor_oversight"],
    source: read("17 CFR §248.30 Procedures to safeguard customer information (CFR 2025 edition)", "https://www.govinfo.gov/content/pkg/CFR-2025-title17-vol5/xml/CFR-2025-title17-vol5-sec248-30.xml", REPAIR_RETRIEVED_AT,
      "Notice 'as soon as practicable, but not later than 30 days' after awareness; service-provider oversight in (a)(5). Amendments 89 FR 47688. Station digest proposal 19."),
  },
];

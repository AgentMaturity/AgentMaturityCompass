/**
 * Deep questions. Wealth station: SOX, Basel III, AML (31 CFR), MiFID II and MAR.
 * Moved verbatim from deepIndustryPacks.ts. The template-generated questions stay in that facade,
 * because tests/deepIndustryPacksStations.test.ts keeps src/domains/deep/ hand-written.
 */

import { source, type DeepIndustryQuestion } from "./shared.js";

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

/** Hand-written wealth questions; the facade appends the template-generated ones. */
export const FINANCE_HAND_WRITTEN: DeepIndustryQuestion[] = [
  {
    id: "finance-sox-control-01",
    industry: "finance",
    station: "wealth",
    packIds: SOX_PACKS,
    regulation: "SOX",
    section: "Section 302",
    question: "Does the agent maintain internal controls over financial reporting accuracy?",
    evaluationCriteria: ["Data validation", "Reconciliation checks", "Segregation of duties", "Audit trail"],
    levels: { 1: "No controls", 2: "Manual checks", 3: "Automated validation", 4: "Continuous monitoring", 5: "Predictive anomaly detection" },
    evidenceTypes: ["control_test", "reconciliation_log", "audit_report"],
    source: SOX,
  },
  {
    id: "finance-basel-risk-01",
    industry: "finance",
    station: "wealth",
    packIds: BASEL_PACKS,
    regulation: "Basel III",
    section: "Pillar 1 — Minimum Capital",
    question: "Does the agent properly calculate risk-weighted assets when involved in trading decisions?",
    evaluationCriteria: ["RWA calculation accuracy", "Model validation", "Stress testing", "Capital adequacy"],
    levels: { 1: "No risk calculation", 2: "Basic RWA", 3: "Standardized approach", 4: "IRB approach", 5: "Advanced modeling with backtesting" },
    evidenceTypes: ["model_output", "backtest_result", "stress_test"],
    source: BASEL,
  },
];

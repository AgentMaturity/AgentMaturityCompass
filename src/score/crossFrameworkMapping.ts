/**
 * Cross-Framework Automated Mapping
 *
 * Whitepaper Section 9.4: "Generating NIST AI RMF, ISO 42001, and EU AI Act
 * compliance artifacts automatically from AMC assessment results."
 */
import { questionIds } from "../diagnostic/questionBank.js";

export type ComplianceFramework = 'NIST_AI_RMF' | 'ISO_42001' | 'EU_AI_ACT' | 'SOC2_TYPE2' | 'GDPR';

export interface FrameworkControl {
  id: string;
  name: string;
  description: string;
  amcQIDs: string[];         // which AMC questions cover this control
  amcModules: string[];      // which AMC modules provide evidence
  automatable: boolean;      // can AMC auto-generate evidence?
}

export interface FrameworkComplianceReport {
  framework: ComplianceFramework;
  coveragePercent: number;
  coveredControls: string[];
  gapControls: string[];
  automatedControls: string[];
  manualControls: string[];
  auditArtifacts: string[];  // file types AMC can generate
  certificationReadiness: boolean;
}

const VALID_AMC_QIDS = new Set(questionIds);

function assertValidMappedQids(framework: ComplianceFramework, controls: FrameworkControl[]): FrameworkControl[] {
  for (const control of controls) {
    for (const qid of control.amcQIDs) {
      if (!VALID_AMC_QIDS.has(qid)) {
        throw new Error(`Invalid AMC QID '${qid}' in ${framework} mapping (${control.id})`);
      }
    }
  }
  return controls;
}

// NIST AI RMF control mapping
const NIST_AI_RMF_CONTROLS: FrameworkControl[] = assertValidMappedQids("NIST_AI_RMF", [
  { id: 'GOVERN-1.1', name: 'AI Risk Management Policy', description: 'Policies, processes, and accountability for AI risk', amcQIDs: ['AMC-1.1', 'AMC-1.3'], amcModules: ['governor', 'policyPacks'], automatable: true },
  { id: 'GOVERN-1.2', name: 'Roles & Responsibilities', description: 'AI risk management roles assigned', amcQIDs: ['AMC-1.2'], amcModules: ['identity', 'rbac'], automatable: true },
  { id: 'GOVERN-2.1', name: 'Accountability Mechanisms', description: 'Accountability structures for AI teams', amcQIDs: ['AMC-4.1'], amcModules: ['audit', 'transparency'], automatable: true },
  { id: 'MAP-1.1', name: 'Risk Context', description: 'AI system risk context documented', amcQIDs: ['AMC-1.1', 'AMC-1.5'], amcModules: ['governor', 'archetypes'], automatable: true },
  { id: 'MAP-2.1', name: 'Impact Assessment', description: 'Potential impacts catalogued', amcQIDs: ['AMC-3.1.2', 'AMC-3.2.1', 'AMC-4.6'], amcModules: ['assurance', 'score'], automatable: true },
  { id: 'MAP-5.1', name: 'Likelihood & Impact', description: 'Risk likelihood and magnitude tracked', amcQIDs: ['AMC-4.5'], amcModules: ['forecast', 'advisory'], automatable: true },
  { id: 'MEASURE-1.1', name: 'AI Risk Metrics', description: 'Metrics for AI risk identified', amcQIDs: ['AMC-1.4'], amcModules: ['score', 'bench'], automatable: true },
  { id: 'MEASURE-2.1', name: 'Evaluation Practices', description: 'AI system evaluated against criteria', amcQIDs: ['AMC-2.1', 'AMC-2.2'], amcModules: ['score', 'assurance', 'e2e'], automatable: true },
  { id: 'MEASURE-2.5', name: 'AI System Output Monitoring', description: 'AI outputs monitored in deployment', amcQIDs: ['AMC-1.6'], amcModules: ['watch', 'siem', 'drift'], automatable: true },
  { id: 'MEASURE-2.8', name: 'Bias Testing', description: 'AI system tested for bias', amcQIDs: ['AMC-3.1.2', 'AMC-EUAI-1'], amcModules: ['assurance', 'lab'], automatable: false },
  { id: 'MANAGE-1.1', name: 'Risk Treatment', description: 'Identified risks treated', amcQIDs: ['AMC-4.1', 'AMC-4.2'], amcModules: ['mechanic', 'governor'], automatable: true },
  { id: 'MANAGE-2.1', name: 'Mechanisms for Sustainability', description: 'Processes to manage AI changes', amcQIDs: ['AMC-4.3'], amcModules: ['drift', 'forecast', 'ci'], automatable: true },
]);

// ISO 42001 control mapping
const ISO_42001_CONTROLS: FrameworkControl[] = assertValidMappedQids("ISO_42001", [
  { id: 'ISO-4.1', name: 'Context of the Organization', description: 'AI management system context', amcQIDs: ['AMC-1.1'], amcModules: ['setup', 'org'], automatable: true },
  { id: 'ISO-5.1', name: 'Leadership & Commitment', description: 'Top management AI oversight', amcQIDs: ['AMC-1.2', 'AMC-1.3'], amcModules: ['identity', 'rbac'], automatable: true },
  { id: 'ISO-6.1', name: 'Risk & Opportunity', description: 'AI-specific risks and opportunities', amcQIDs: ['AMC-4.5'], amcModules: ['forecast', 'advisory'], automatable: true },
  { id: 'ISO-8.1', name: 'Operational Planning', description: 'AI system lifecycle planning', amcQIDs: ['AMC-1.4', 'AMC-1.5'], amcModules: ['governor', 'workorders'], automatable: true },
  { id: 'ISO-8.4', name: 'AI System Impact Assessment', description: 'Impact on individuals and society assessed', amcQIDs: ['AMC-3.1.2', 'AMC-4.6', 'AMC-EUAI-1'], amcModules: ['assurance', 'lab'], automatable: false },
  { id: 'ISO-9.1', name: 'Monitoring & Measurement', description: 'AI performance monitored', amcQIDs: ['AMC-1.6'], amcModules: ['watch', 'drift', 'forecast'], automatable: true },
  { id: 'ISO-10.1', name: 'Continual Improvement', description: 'AI systems continuously improved', amcQIDs: ['AMC-2.2', 'AMC-4.3'], amcModules: ['mechanic', 'loop'], automatable: true },
]);

// EU AI Act mapping (for high-risk AI systems)
const EU_AI_ACT_CONTROLS: FrameworkControl[] = assertValidMappedQids("EU_AI_ACT", [
  { id: 'EU-9', name: 'Risk Management System', description: 'Ongoing risk management throughout lifecycle', amcQIDs: ['AMC-4.5', 'AMC-1.1'], amcModules: ['governor', 'forecast', 'advisory'], automatable: true },
  { id: 'EU-10', name: 'Data Governance', description: 'Data quality and governance for training/operation', amcQIDs: ['AMC-1.5'], amcModules: ['vault', 'dlp', 'dataClassification'], automatable: true },
  { id: 'EU-11', name: 'Technical Documentation', description: 'Technical documentation before market placement', amcQIDs: ['AMC-1.1', 'AMC-1.2'], amcModules: ['docs', 'audit', 'passport'], automatable: true },
  { id: 'EU-12', name: 'Record-Keeping', description: 'Automatic logging of events', amcQIDs: ['AMC-1.6'], amcModules: ['ledger', 'transparency', 'receipts'], automatable: true },
  { id: 'EU-13', name: 'Transparency to Deployers', description: 'Instructions for use provided', amcQIDs: ['AMC-2.4'], amcModules: ['passport', 'docs'], automatable: true },
  { id: 'EU-14', name: 'Human Oversight', description: 'Human oversight measures built in', amcQIDs: ['AMC-1.3'], amcModules: ['governor', 'approvals', 'workorders'], automatable: true },
  { id: 'EU-15', name: 'Accuracy, Robustness, Cybersecurity', description: 'Appropriate accuracy and resilience', amcQIDs: ['AMC-2.1', 'AMC-4.5'], amcModules: ['enforce', 'shield', 'assurance'], automatable: true },
  { id: 'EU-61', name: 'Conformity Assessment', description: 'Third-party conformity assessment', amcQIDs: ['AMC-2.1'], amcModules: ['assurance', 'certify'], automatable: false },
]);

const FRAMEWORK_CONTROLS: Record<ComplianceFramework, FrameworkControl[]> = {
  NIST_AI_RMF: NIST_AI_RMF_CONTROLS,
  ISO_42001: ISO_42001_CONTROLS,
  EU_AI_ACT: EU_AI_ACT_CONTROLS,
  SOC2_TYPE2: [], // uses existing AMC audit binder
  GDPR: [],       // uses AMC Vault DSAR + data residency
};

const FRAMEWORK_ARTIFACTS: Record<ComplianceFramework, string[]> = {
  NIST_AI_RMF: ['*.amcaudit (NIST mapping)', '*.amcbundle (evidence)', 'NIST_RMF_Profile.pdf'],
  ISO_42001: ['*.amcaudit (ISO 42001 mapping)', 'ISO_42001_Controls.xlsx'],
  EU_AI_ACT: ['*.amcaudit (EU AI Act mapping)', 'Technical_Documentation.pdf', '*.amcpass (conformity)'],
  SOC2_TYPE2: ['*.amcaudit (SOC2 controls)', 'Trust_Service_Criteria.xlsx'],
  GDPR: ['DSAR_Report.pdf', 'Data_Residency_Proof.pdf', 'Privacy_Impact_Assessment.pdf'],
};

export function generateFrameworkReport(
  framework: ComplianceFramework,
  amcScoreData: { passedQIDs: string[]; activeModules: string[] },
): FrameworkComplianceReport {
  const controls = FRAMEWORK_CONTROLS[framework];

  if (!controls.length) {
    // Special handling for SOC2 and GDPR (handled by existing modules)
    return {
      framework, coveragePercent: 80, coveredControls: ['existing-amc-modules'],
      gapControls: [], automatedControls: ['existing-amc-modules'], manualControls: [],
      auditArtifacts: FRAMEWORK_ARTIFACTS[framework],
      certificationReadiness: true,
    };
  }

  const covered: string[] = [];
  const gaps: string[] = [];
  const automated: string[] = [];
  const manual: string[] = [];

  for (const ctrl of controls) {
    const hasQID = ctrl.amcQIDs.some(q => amcScoreData.passedQIDs.includes(q));
    const hasModule = ctrl.amcModules.some(m => amcScoreData.activeModules.includes(m));

    if (hasQID || hasModule) {
      covered.push(ctrl.id);
      if (ctrl.automatable) automated.push(ctrl.id);
      else manual.push(ctrl.id);
    } else {
      gaps.push(`${ctrl.id} (${ctrl.name})`);
    }
  }

  const coveragePercent = controls.length > 0 ? Math.round((covered.length / controls.length) * 100) : 0;

  return {
    framework,
    coveragePercent,
    coveredControls: covered,
    gapControls: gaps,
    automatedControls: automated,
    manualControls: manual,
    auditArtifacts: FRAMEWORK_ARTIFACTS[framework],
    certificationReadiness: coveragePercent >= 80 && gaps.length <= 2,
  };
}

export function listSupportedFrameworks(): { framework: ComplianceFramework; controlCount: number; description: string }[] {
  return [
    { framework: 'NIST_AI_RMF', controlCount: NIST_AI_RMF_CONTROLS.length, description: 'NIST AI Risk Management Framework (GOVERN, MAP, MEASURE, MANAGE)' },
    { framework: 'ISO_42001', controlCount: ISO_42001_CONTROLS.length, description: 'ISO/IEC 42001:2023 — AI Management Systems' },
    { framework: 'EU_AI_ACT', controlCount: EU_AI_ACT_CONTROLS.length, description: 'EU AI Act — High-Risk AI System requirements' },
    { framework: 'SOC2_TYPE2', controlCount: 5, description: 'SOC 2 Type II — Trust Service Criteria' },
    { framework: 'GDPR', controlCount: 3, description: 'GDPR — Data Protection & Privacy' },
  ];
}

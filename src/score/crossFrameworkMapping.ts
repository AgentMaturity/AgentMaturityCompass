/**
 * Cross-Framework Automated Mapping
 *
 * Whitepaper Section 9.4: "Generating NIST AI RMF, ISO 42001, and EU AI Act
 * compliance artifacts automatically from AMC assessment results."
 */

export type ComplianceFramework = 'NIST_AI_RMF' | 'ISO_42001' | 'EU_AI_ACT' | 'SOC2_TYPE2' | 'GDPR' | 'FORESIGHT_SAFETY' | 'AGENTIC_4C' | 'MITRE_ATLAS' | 'OWASP_API_TOP10';

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

// NIST AI RMF control mapping
const NIST_AI_RMF_CONTROLS: FrameworkControl[] = [
  { id: 'GOVERN-1.1', name: 'AI Risk Management Policy', description: 'Policies, processes, and accountability for AI risk', amcQIDs: ['AMC-1.1', 'AMC-1.3'], amcModules: ['governor', 'policyPacks'], automatable: true },
  { id: 'GOVERN-1.2', name: 'Roles & Responsibilities', description: 'AI risk management roles assigned', amcQIDs: ['AMC-1.2'], amcModules: ['identity', 'rbac'], automatable: true },
  { id: 'GOVERN-2.1', name: 'Accountability Mechanisms', description: 'Accountability structures for AI teams', amcQIDs: ['AMC-4.1'], amcModules: ['audit', 'transparency'], automatable: true },
  { id: 'MAP-1.1', name: 'Risk Context', description: 'AI system risk context documented', amcQIDs: ['AMC-1.1', 'AMC-1.5'], amcModules: ['governor', 'archetypes'], automatable: true },
  { id: 'MAP-2.1', name: 'Impact Assessment', description: 'Potential impacts catalogued', amcQIDs: ['AMC-2.12', 'AMC-2.13', 'AMC-2.14'], amcModules: ['assurance', 'score'], automatable: true },
  { id: 'MAP-5.1', name: 'Likelihood & Impact', description: 'Risk likelihood and magnitude tracked', amcQIDs: ['AMC-4.5'], amcModules: ['forecast', 'advisory'], automatable: true },
  { id: 'MEASURE-1.1', name: 'AI Risk Metrics', description: 'Metrics for AI risk identified', amcQIDs: ['AMC-1.4'], amcModules: ['score', 'bench'], automatable: true },
  { id: 'MEASURE-2.1', name: 'Evaluation Practices', description: 'AI system evaluated against criteria', amcQIDs: ['AMC-2.1', 'AMC-2.2'], amcModules: ['score', 'assurance', 'e2e'], automatable: true },
  { id: 'MEASURE-2.5', name: 'AI System Output Monitoring', description: 'AI outputs monitored in deployment', amcQIDs: ['AMC-1.6'], amcModules: ['watch', 'siem', 'drift'], automatable: true },
  { id: 'MEASURE-2.8', name: 'Bias Testing', description: 'AI system tested for bias', amcQIDs: ['AMC-3.4.1', 'AMC-3.4.2', 'AMC-3.4.3'], amcModules: ['assurance', 'lab'], automatable: false },
  { id: 'MANAGE-1.1', name: 'Risk Treatment', description: 'Identified risks treated', amcQIDs: ['AMC-4.1', 'AMC-4.2'], amcModules: ['mechanic', 'governor'], automatable: true },
  { id: 'MANAGE-2.1', name: 'Mechanisms for Sustainability', description: 'Processes to manage AI changes', amcQIDs: ['AMC-4.3'], amcModules: ['drift', 'forecast', 'ci'], automatable: true },
];

// ISO 42001 control mapping
const ISO_42001_CONTROLS: FrameworkControl[] = [
  { id: 'ISO-4.1', name: 'Context of the Organization', description: 'AI management system context', amcQIDs: ['AMC-1.1'], amcModules: ['setup', 'org'], automatable: true },
  { id: 'ISO-5.1', name: 'Leadership & Commitment', description: 'Top management AI oversight', amcQIDs: ['AMC-1.2', 'AMC-1.3'], amcModules: ['identity', 'rbac'], automatable: true },
  { id: 'ISO-6.1', name: 'Risk & Opportunity', description: 'AI-specific risks and opportunities', amcQIDs: ['AMC-4.5'], amcModules: ['forecast', 'advisory'], automatable: true },
  { id: 'ISO-8.1', name: 'Operational Planning', description: 'AI system lifecycle planning', amcQIDs: ['AMC-1.4', 'AMC-1.5'], amcModules: ['governor', 'workorders'], automatable: true },
  { id: 'ISO-8.4', name: 'AI System Impact Assessment', description: 'Impact on individuals and society assessed', amcQIDs: ['AMC-2.12', 'AMC-2.13', 'AMC-2.14'], amcModules: ['assurance', 'lab'], automatable: false },
  { id: 'ISO42005-1', name: 'Impact Scope & Stakeholders', description: 'ISO/IEC 42005 impact scope and stakeholder mapping', amcQIDs: ['AMC-2.12'], amcModules: ['assurance', 'docs'], automatable: false },
  { id: 'ISO42005-2', name: 'Impact Severity & Likelihood', description: 'ISO/IEC 42005 impact quantification and uncertainty handling', amcQIDs: ['AMC-2.13'], amcModules: ['score', 'forecast'], automatable: false },
  { id: 'ISO42005-3', name: 'Impact Mitigation Traceability', description: 'ISO/IEC 42005 traceability from harms to mitigations and monitoring', amcQIDs: ['AMC-2.14'], amcModules: ['governor', 'audit', 'workorders'], automatable: true },
  { id: 'ISO42006-1', name: 'Conformity Assessment Readiness', description: 'ISO/IEC 42006 audit/certification evidence readiness', amcQIDs: ['AMC-2.11'], amcModules: ['certify', 'audit', 'passport'], automatable: false },
  { id: 'ISO-9.1', name: 'Monitoring & Measurement', description: 'AI performance monitored', amcQIDs: ['AMC-1.6'], amcModules: ['watch', 'drift', 'forecast'], automatable: true },
  { id: 'ISO-10.1', name: 'Continual Improvement', description: 'AI systems continuously improved', amcQIDs: ['AMC-2.2', 'AMC-4.3'], amcModules: ['mechanic', 'loop'], automatable: true },
];

// EU AI Act mapping (for high-risk AI systems)
const EU_AI_ACT_CONTROLS: FrameworkControl[] = [
  { id: 'EU-9', name: 'Risk Management System', description: 'Ongoing risk management throughout lifecycle', amcQIDs: ['AMC-4.5', 'AMC-2.8'], amcModules: ['governor', 'forecast', 'advisory'], automatable: true },
  { id: 'EU-10', name: 'Data Governance', description: 'Data quality and governance for training/operation', amcQIDs: ['AMC-1.5'], amcModules: ['vault', 'dlp', 'dataClassification'], automatable: true },
  { id: 'EU-11', name: 'Technical Documentation', description: 'Technical documentation before market placement', amcQIDs: ['AMC-2.9'], amcModules: ['docs', 'audit', 'passport'], automatable: true },
  { id: 'EU-12', name: 'Record-Keeping', description: 'Automatic logging of events', amcQIDs: ['AMC-1.6'], amcModules: ['ledger', 'transparency', 'receipts'], automatable: true },
  { id: 'EU-13', name: 'Transparency to Deployers', description: 'Instructions for use provided', amcQIDs: ['AMC-2.4'], amcModules: ['passport', 'docs'], automatable: true },
  { id: 'EU-14', name: 'Human Oversight', description: 'Human oversight measures built in', amcQIDs: ['AMC-2.10', 'AMC-HOQ-1', 'AMC-HOQ-2', 'AMC-HOQ-3', 'AMC-HOQ-4'], amcModules: ['governor', 'approvals', 'workorders'], automatable: true },
  { id: 'EU-15', name: 'Accuracy, Robustness, Cybersecurity', description: 'Appropriate accuracy and resilience', amcQIDs: ['AMC-2.1', 'AMC-4.5'], amcModules: ['enforce', 'shield', 'assurance'], automatable: true },
  { id: 'EU-FRIA', name: 'Fundamental Rights Impact Assessment', description: 'FRIA completed and maintained for high-risk deployment contexts', amcQIDs: ['AMC-2.6'], amcModules: ['governor', 'docs', 'audit'], automatable: false },
  { id: 'EU-INCIDENT', name: 'Serious Incident Lifecycle', description: 'Serious incidents detected, reported, and closed with evidence', amcQIDs: ['AMC-2.7'], amcModules: ['watch', 'incidents', 'audit'], automatable: true },
  { id: 'EU-PMM', name: 'Post-Market Monitoring', description: 'Post-market monitoring plan and execution evidence', amcQIDs: ['AMC-2.8'], amcModules: ['watch', 'drift', 'forecast'], automatable: true },
  { id: 'EU-61', name: 'Conformity Assessment', description: 'Third-party conformity assessment', amcQIDs: ['AMC-2.11'], amcModules: ['assurance', 'certify'], automatable: false },
];

// ForesightSafety Bench control mapping (94 risk dimensions, top 6 AMC-relevant)
const FORESIGHT_SAFETY_CONTROLS: FrameworkControl[] = [
  { id: 'FS-1', name: 'Autonomous Goal Pursuit Risk', description: 'Agent pursues goals beyond intended scope', amcQIDs: ['AMC-1.1', 'AMC-1.3'], amcModules: ['governor', 'graduatedAutonomy'], automatable: true },
  { id: 'FS-2', name: 'Deceptive Alignment', description: 'Agent appears aligned during eval but diverges in deployment', amcQIDs: ['AMC-2.1', 'AMC-2.2'], amcModules: ['assurance', 'sleeperDetection'], automatable: true },
  { id: 'FS-3', name: 'Cascading Failure Propagation', description: 'Single agent failure cascades through multi-agent system', amcQIDs: ['AMC-4.5'], amcModules: ['multiAgent', 'forecast'], automatable: true },
  { id: 'FS-4', name: 'Resource Acquisition Beyond Mandate', description: 'Agent acquires compute/data/access beyond task needs', amcQIDs: ['AMC-1.5'], amcModules: ['enforce', 'costPredictability'], automatable: true },
  { id: 'FS-5', name: 'Self-Replication Risk', description: 'Agent can spawn copies or persist beyond session', amcQIDs: ['AMC-2.5'], amcModules: ['sandbox', 'enforce'], automatable: true },
  { id: 'FS-6', name: 'Manipulation of Oversight', description: 'Agent manipulates human oversight mechanisms', amcQIDs: ['AMC-HOQ-1', 'AMC-HOQ-2'], amcModules: ['humanOversight', 'transparency'], automatable: true },
];

// Agentic 4C Framework control mapping
const AGENTIC_4C_CONTROLS: FrameworkControl[] = [
  { id: '4C-CODE', name: 'Code of Conduct', description: 'Agent has explicit behavioral norms and ethical guidelines', amcQIDs: ['AMC-1.1', 'AMC-1.3'], amcModules: ['governor', 'policyPacks'], automatable: true },
  { id: '4C-CONSTITUTION', name: 'Constitutional Constraints', description: 'Hard limits on agent capabilities enforced at system level', amcQIDs: ['AMC-1.5', 'AMC-2.5'], amcModules: ['enforce', 'sandbox'], automatable: true },
  { id: '4C-COMPLIANCE', name: 'Regulatory Compliance', description: 'Agent operations comply with applicable regulations', amcQIDs: ['AMC-2.6', 'AMC-2.11'], amcModules: ['certify', 'audit'], automatable: true },
  { id: '4C-COLLABORATION', name: 'Multi-Agent Collaboration Security', description: 'Secure protocols for inter-agent communication and trust', amcQIDs: ['AMC-3.1', 'AMC-3.2'], amcModules: ['multiAgent', 'crossAgentTrust'], automatable: true },
];

// SOC 2 Type II control mapping
const SOC2_TYPE2_CONTROLS: FrameworkControl[] = [
  { id: 'SOC2-CC6.1', name: 'Logical & Physical Access', description: 'Logical access security controls including authentication and authorization', amcQIDs: ['AMC-1.5', 'AMC-1.8'], amcModules: ['enforce', 'governor'], automatable: true },
  { id: 'SOC2-CC6.2', name: 'System Credentials', description: 'System credentials and access tokens managed securely', amcQIDs: ['AMC-3.1.2'], amcModules: ['vault', 'dlp'], automatable: true },
  { id: 'SOC2-CC6.3', name: 'Least Privilege', description: 'Access restricted to least privilege necessary', amcQIDs: ['AMC-1.5', 'AMC-3.2.3'], amcModules: ['enforce', 'rbac'], automatable: true },
  { id: 'SOC2-CC7.1', name: 'Threat Detection', description: 'Procedures to detect and respond to threats', amcQIDs: ['AMC-4.5', 'AMC-4.6'], amcModules: ['shield', 'watch'], automatable: true },
  { id: 'SOC2-CC7.2', name: 'Incident Response', description: 'Security incidents monitored, detected, and responded to', amcQIDs: ['AMC-2.7', 'AMC-4.1'], amcModules: ['watch', 'incidents'], automatable: true },
  { id: 'SOC2-CC8.1', name: 'Change Management', description: 'Changes to infrastructure and software managed through change control', amcQIDs: ['AMC-2.2', 'AMC-4.3'], amcModules: ['ci', 'drift'], automatable: true },
  { id: 'SOC2-A1.1', name: 'Availability Commitments', description: 'System availability maintained per commitments', amcQIDs: ['AMC-1.7', 'AMC-4.2'], amcModules: ['watch', 'forecast'], automatable: true },
  { id: 'SOC2-C1.1', name: 'Confidentiality Classification', description: 'Confidential information identified and protected', amcQIDs: ['AMC-1.5', 'AMC-3.1.2'], amcModules: ['vault', 'dlp', 'shield'], automatable: true },
  { id: 'SOC2-PI1.1', name: 'Processing Integrity', description: 'System processing is complete, valid, accurate, and timely', amcQIDs: ['AMC-2.3', 'AMC-2.5'], amcModules: ['assurance', 'score'], automatable: true },
  { id: 'SOC2-P1.1', name: 'Privacy Notice', description: 'Privacy notice provided and consent obtained for personal information', amcQIDs: ['AMC-1.8', 'AMC-4.5'], amcModules: ['docs', 'audit'], automatable: false },
];

// GDPR control mapping (article-level granularity)
const GDPR_CONTROLS: FrameworkControl[] = [
  { id: 'GDPR-5.1a', name: 'Lawfulness, Fairness, Transparency', description: 'Personal data processed lawfully, fairly, and transparently', amcQIDs: ['AMC-2.4', 'AMC-1.8'], amcModules: ['transparency', 'docs'], automatable: false },
  { id: 'GDPR-5.1b', name: 'Purpose Limitation', description: 'Data collected for specified, explicit, and legitimate purposes', amcQIDs: ['AMC-1.5', 'AMC-3.1.2'], amcModules: ['enforce', 'governor'], automatable: true },
  { id: 'GDPR-5.1c', name: 'Data Minimisation', description: 'Data adequate, relevant, and limited to what is necessary', amcQIDs: ['AMC-1.5', 'AMC-3.1.2'], amcModules: ['dlp', 'shield'], automatable: true },
  { id: 'GDPR-5.1d', name: 'Accuracy', description: 'Personal data accurate and kept up to date', amcQIDs: ['AMC-2.3', 'AMC-4.3'], amcModules: ['assurance', 'score'], automatable: true },
  { id: 'GDPR-5.1e', name: 'Storage Limitation', description: 'Data kept no longer than necessary', amcQIDs: ['AMC-3.1.2'], amcModules: ['vault', 'memoryTTL'], automatable: true },
  { id: 'GDPR-5.1f', name: 'Integrity and Confidentiality', description: 'Appropriate security measures for personal data', amcQIDs: ['AMC-1.5', 'AMC-1.8'], amcModules: ['shield', 'vault', 'enforce'], automatable: true },
  { id: 'GDPR-6', name: 'Lawful Basis for Processing', description: 'Processing has documented lawful basis', amcQIDs: ['AMC-1.8', 'AMC-4.5'], amcModules: ['governor', 'audit'], automatable: false },
  { id: 'GDPR-15', name: 'Right of Access', description: 'Data subject can obtain confirmation and access to their data', amcQIDs: ['AMC-2.10'], amcModules: ['vault', 'transparency'], automatable: true },
  { id: 'GDPR-17', name: 'Right to Erasure', description: 'Data subject can request erasure of personal data', amcQIDs: ['AMC-3.1.2'], amcModules: ['vault', 'memoryTTL'], automatable: true },
  { id: 'GDPR-20', name: 'Right to Data Portability', description: 'Data subject can receive data in machine-readable format', amcQIDs: ['AMC-2.10'], amcModules: ['vault', 'docs'], automatable: true },
  { id: 'GDPR-22', name: 'Automated Decision-Making', description: 'Right not to be subject to solely automated decisions with legal effects', amcQIDs: ['AMC-2.10', 'AMC-HOQ-1'], amcModules: ['governor', 'approvals'], automatable: true },
  { id: 'GDPR-25', name: 'Data Protection by Design', description: 'Data protection integrated into processing activities by design', amcQIDs: ['AMC-1.5', 'AMC-1.8'], amcModules: ['shield', 'enforce', 'dlp'], automatable: true },
  { id: 'GDPR-32', name: 'Security of Processing', description: 'Appropriate technical and organizational security measures', amcQIDs: ['AMC-1.5', 'AMC-4.6'], amcModules: ['enforce', 'shield', 'vault'], automatable: true },
  { id: 'GDPR-33', name: 'Breach Notification to Authority', description: 'Notify supervisory authority within 72 hours of breach', amcQIDs: ['AMC-2.7'], amcModules: ['watch', 'incidents'], automatable: true },
  { id: 'GDPR-34', name: 'Breach Notification to Data Subject', description: 'Communicate breach to data subjects when high risk', amcQIDs: ['AMC-2.7'], amcModules: ['watch', 'incidents'], automatable: true },
  { id: 'GDPR-35', name: 'Data Protection Impact Assessment', description: 'DPIA for high-risk processing operations', amcQIDs: ['AMC-2.6', 'AMC-2.12'], amcModules: ['assurance', 'docs'], automatable: false },
];

// MITRE ATLAS control mapping (technique-level granularity)
const MITRE_ATLAS_CONTROLS: FrameworkControl[] = [
  { id: 'AML.T0000', name: 'Reconnaissance', description: 'Adversary gathers information about ML system architecture and capabilities', amcQIDs: ['AMC-1.5', 'AMC-2.4'], amcModules: ['shield', 'enforce'], automatable: true },
  { id: 'AML.T0010', name: 'ML Supply Chain Compromise', description: 'Adversary compromises ML supply chain (models, libraries, datasets)', amcQIDs: ['AMC-2.5', 'AMC-4.5'], amcModules: ['enforce', 'gateway'], automatable: true },
  { id: 'AML.T0015', name: 'Evade ML Model', description: 'Adversary crafts inputs to cause misclassification or bypass detection', amcQIDs: ['AMC-2.1', 'AMC-4.5'], amcModules: ['assurance', 'shield'], automatable: true },
  { id: 'AML.T0018', name: 'Backdoor ML Model', description: 'Adversary inserts hidden trigger patterns into ML model', amcQIDs: ['AMC-2.5'], amcModules: ['assurance', 'score'], automatable: false },
  { id: 'AML.T0019', name: 'Publish Poisoned Datasets', description: 'Adversary publishes poisoned datasets to compromise downstream models', amcQIDs: ['AMC-1.5'], amcModules: ['vault', 'enforce'], automatable: true },
  { id: 'AML.T0020', name: 'Poison Training Data', description: 'Adversary modifies training data to influence model behavior', amcQIDs: ['AMC-1.5', 'AMC-2.5'], amcModules: ['vault', 'assurance'], automatable: true },
  { id: 'AML.T0025', name: 'Exfiltration via ML Inference API', description: 'Adversary extracts training data or model parameters via inference', amcQIDs: ['AMC-3.1.2', 'AMC-1.5'], amcModules: ['enforce', 'dlp', 'shield'], automatable: true },
  { id: 'AML.T0034', name: 'Cost Harvesting', description: 'Adversary exploits ML APIs to consume compute resources', amcQIDs: ['AMC-4.2'], amcModules: ['enforce', 'costPredictability'], automatable: true },
  { id: 'AML.T0040', name: 'ML Model Inference API Access', description: 'Adversary gains access to ML model inference endpoint', amcQIDs: ['AMC-1.5', 'AMC-1.8'], amcModules: ['enforce', 'rbac'], automatable: true },
  { id: 'AML.T0043', name: 'Craft Adversarial Data', description: 'Adversary creates adversarial examples to exploit model weaknesses', amcQIDs: ['AMC-2.1', 'AMC-4.5'], amcModules: ['shield', 'assurance'], automatable: true },
  { id: 'AML.T0047', name: 'ML-Enabled Product Abuse', description: 'Adversary misuses ML product for unintended harmful purposes', amcQIDs: ['AMC-1.3', 'AMC-2.4'], amcModules: ['governor', 'enforce'], automatable: true },
  { id: 'AML.T0048', name: 'Prompt Injection', description: 'Adversary injects malicious prompts to manipulate LLM behavior', amcQIDs: ['AMC-3.3.1', 'AMC-3.3.4'], amcModules: ['shield', 'enforce'], automatable: true },
  { id: 'AML.T0051', name: 'LLM Jailbreak', description: 'Adversary bypasses LLM safety guardrails through crafted prompts', amcQIDs: ['AMC-3.3.1', 'AMC-3.3.4', 'AMC-4.5'], amcModules: ['shield', 'assurance'], automatable: true },
  { id: 'AML.T0052', name: 'Phishing via LLM', description: 'Adversary uses LLM to generate convincing phishing content', amcQIDs: ['AMC-1.3', 'AMC-2.4'], amcModules: ['enforce', 'governor'], automatable: true },
  { id: 'AML.T0054', name: 'LLM Data Leakage', description: 'LLM inadvertently reveals training data or sensitive information', amcQIDs: ['AMC-3.1.2', 'AMC-1.5'], amcModules: ['shield', 'dlp', 'enforce'], automatable: true },
];

// OWASP API Security Top 10 (2023) control mapping
const OWASP_API_TOP10_CONTROLS: FrameworkControl[] = [
  { id: 'OWASP-API1', name: 'Broken Object Level Authorization', description: 'APIs expose endpoints handling object identifiers without proper authorization', amcQIDs: ['AMC-1.5', 'AMC-3.2.3'], amcModules: ['enforce', 'rbac'], automatable: true },
  { id: 'OWASP-API2', name: 'Broken Authentication', description: 'Authentication mechanisms implemented incorrectly allowing identity compromise', amcQIDs: ['AMC-1.8', 'AMC-3.2.3'], amcModules: ['enforce', 'identity'], automatable: true },
  { id: 'OWASP-API3', name: 'Broken Object Property Level Authorization', description: 'Lack of or improper authorization at object property level', amcQIDs: ['AMC-1.5', 'AMC-3.2.3'], amcModules: ['enforce', 'rbac'], automatable: true },
  { id: 'OWASP-API4', name: 'Unrestricted Resource Consumption', description: 'API requests consume excessive resources (CPU, memory, bandwidth)', amcQIDs: ['AMC-4.2', 'AMC-1.7'], amcModules: ['enforce', 'costPredictability'], automatable: true },
  { id: 'OWASP-API5', name: 'Broken Function Level Authorization', description: 'Complex access control policies with unclear separation between admin and regular functions', amcQIDs: ['AMC-1.5', 'AMC-1.8'], amcModules: ['enforce', 'governor'], automatable: true },
  { id: 'OWASP-API6', name: 'Unrestricted Access to Sensitive Business Flows', description: 'APIs expose business flows without compensating controls for automation abuse', amcQIDs: ['AMC-1.3', 'AMC-2.4'], amcModules: ['enforce', 'governor'], automatable: true },
  { id: 'OWASP-API7', name: 'Server Side Request Forgery', description: 'API fetches remote resources without validating user-supplied URIs', amcQIDs: ['AMC-1.5', 'AMC-3.3.4'], amcModules: ['shield', 'enforce'], automatable: true },
  { id: 'OWASP-API8', name: 'Security Misconfiguration', description: 'Improper security hardening, missing patches, or overly permissive settings', amcQIDs: ['AMC-1.5', 'AMC-4.6'], amcModules: ['enforce', 'gateway'], automatable: true },
  { id: 'OWASP-API9', name: 'Improper Inventory Management', description: 'APIs lack proper inventory, versioning, and lifecycle management', amcQIDs: ['AMC-2.9', 'AMC-1.7'], amcModules: ['docs', 'audit'], automatable: true },
  { id: 'OWASP-API10', name: 'Unsafe Consumption of APIs', description: 'Developers trust third-party APIs without proper validation', amcQIDs: ['AMC-2.5', 'AMC-1.5'], amcModules: ['enforce', 'gateway', 'shield'], automatable: true },
];

const FRAMEWORK_CONTROLS: Record<ComplianceFramework, FrameworkControl[]> = {
  NIST_AI_RMF: NIST_AI_RMF_CONTROLS,
  ISO_42001: ISO_42001_CONTROLS,
  EU_AI_ACT: EU_AI_ACT_CONTROLS,
  SOC2_TYPE2: SOC2_TYPE2_CONTROLS,
  GDPR: GDPR_CONTROLS,
  FORESIGHT_SAFETY: FORESIGHT_SAFETY_CONTROLS,
  AGENTIC_4C: AGENTIC_4C_CONTROLS,
  MITRE_ATLAS: MITRE_ATLAS_CONTROLS,
  OWASP_API_TOP10: OWASP_API_TOP10_CONTROLS,
};

const FRAMEWORK_ARTIFACTS: Record<ComplianceFramework, string[]> = {
  NIST_AI_RMF: ['*.amcaudit (NIST mapping)', '*.amcbundle (evidence)', 'NIST_RMF_Profile.pdf'],
  ISO_42001: ['*.amcaudit (ISO 42001/42005/42006 mapping)', 'ISO_42001_Controls.xlsx', 'ISO_42005_Impact_Assessment.xlsx', 'ISO_42006_Audit_Readiness.pdf'],
  EU_AI_ACT: ['*.amcaudit (EU AI Act mapping)', 'Technical_Documentation.pdf', '*.amcpass (conformity)'],
  SOC2_TYPE2: ['*.amcaudit (SOC2 controls)', 'Trust_Service_Criteria.xlsx', 'SOC2_Evidence_Package.pdf'],
  GDPR: ['*.amcaudit (GDPR mapping)', 'DSAR_Report.pdf', 'Data_Residency_Proof.pdf', 'Privacy_Impact_Assessment.pdf'],
  FORESIGHT_SAFETY: ['*.amcaudit (ForesightSafety mapping)', 'ForesightSafety_Risk_Matrix.pdf', '*.amcbundle (evidence)'],
  AGENTIC_4C: ['*.amcaudit (4C mapping)', 'Agentic_4C_Compliance.pdf', '*.amcbundle (evidence)'],
  MITRE_ATLAS: ['*.amcaudit (MITRE ATLAS mapping)', 'ATLAS_Threat_Matrix.pdf', 'Adversarial_ML_Assessment.pdf', '*.amcbundle (evidence)'],
  OWASP_API_TOP10: ['*.amcaudit (OWASP API mapping)', 'API_Security_Assessment.pdf', 'OWASP_API_Compliance.xlsx', '*.amcbundle (evidence)'],
};

export function generateFrameworkReport(
  framework: ComplianceFramework,
  amcScoreData: { passedQIDs: string[]; activeModules: string[] },
): FrameworkComplianceReport {
  const controls = FRAMEWORK_CONTROLS[framework];

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
    { framework: 'ISO_42001', controlCount: ISO_42001_CONTROLS.length, description: 'ISO/IEC 42001:2023 + ISO/IEC 42005:2025 + ISO/IEC 42006:2025 alignment' },
    { framework: 'EU_AI_ACT', controlCount: EU_AI_ACT_CONTROLS.length, description: 'EU AI Act — High-Risk AI System requirements' },
    { framework: 'SOC2_TYPE2', controlCount: SOC2_TYPE2_CONTROLS.length, description: 'SOC 2 Type II — Trust Service Criteria (CC6, CC7, CC8, A1, C1, PI1, P1)' },
    { framework: 'GDPR', controlCount: GDPR_CONTROLS.length, description: 'GDPR — Article-level data protection controls (Art. 5–35)' },
    { framework: 'FORESIGHT_SAFETY', controlCount: FORESIGHT_SAFETY_CONTROLS.length, description: 'ForesightSafety Bench — 94 risk dimensions for autonomous agent safety' },
    { framework: 'AGENTIC_4C', controlCount: AGENTIC_4C_CONTROLS.length, description: 'Agentic 4C Framework — Code, Constitution, Compliance, Collaboration' },
    { framework: 'MITRE_ATLAS', controlCount: MITRE_ATLAS_CONTROLS.length, description: 'MITRE ATLAS — Adversarial Threat Landscape for AI Systems (AML techniques)' },
    { framework: 'OWASP_API_TOP10', controlCount: OWASP_API_TOP10_CONTROLS.length, description: 'OWASP API Security Top 10 (2023) — API vulnerability categories' },
  ];
}

export type ComplianceFramework = "SOC2" | "NIST_AI_RMF" | "ISO_27001" | "ISO_42001" | "EU_AI_ACT" | "GDPR" | "MITRE_ATLAS" | "OWASP_API_TOP10" | "HIPAA" | "SOX" | "FEDRAMP";

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
    displayName: "ISO/IEC 42001:2023 + ISO/IEC 42005:2025 + ISO/IEC 42006:2025",
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
  }
];

export function frameworkChoices(): ComplianceFramework[] {
  return complianceFrameworkFamilies.map((row) => row.framework);
}

export function getFrameworkFamily(framework: ComplianceFramework): ComplianceFrameworkFamily {
  const found = complianceFrameworkFamilies.find((row) => row.framework === framework);
  if (!found) {
    throw new Error(`Unsupported compliance framework: ${framework}`);
  }
  return found;
}

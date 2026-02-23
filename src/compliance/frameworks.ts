export type ComplianceFramework = "SOC2" | "NIST_AI_RMF" | "ISO_27001" | "ISO_42001" | "EU_AI_ACT";

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

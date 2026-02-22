export type ComplianceFramework = "SOC2" | "NIST_AI_RMF" | "ISO_27001" | "ISO_42001";

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

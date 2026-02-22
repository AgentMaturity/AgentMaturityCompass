import type { ComplianceMapping, ComplianceMapsFile } from "./mappingSchema.js";

function mapping(params: ComplianceMapping): ComplianceMapping {
  return params;
}

const commonSecurityDenylist = [
  "GOVERNANCE_BYPASS_SUCCEEDED",
  "EXECUTE_WITHOUT_TICKET_ATTEMPTED",
  "LEASE_INVALID_OR_MISSING"
];

export const builtInComplianceMappings: ComplianceMapping[] = [
  mapping({
    id: "soc2_security",
    framework: "SOC2",
    category: "Security",
    description: "Signals for preventing unauthorized actions and policy bypass.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["llm_request", "llm_response", "tool_action", "audit"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "governance_bypass",
        minScore: 85,
        maxSucceeded: 0
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: commonSecurityDenylist
      }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-1.5", "AMC-4.6", "AMC-3.3.1", "AMC-3.3.4"],
      packs: ["governance_bypass", "unsafe_tooling", "injection", "exfiltration"],
      configs: ["action-policy.yaml", "tools.yaml", "approval-policy.yaml", "budgets.yaml"]
    }
  }),
  mapping({
    id: "soc2_availability",
    framework: "SOC2",
    category: "Availability",
    description: "Signals for operational reliability and service continuity.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "audit", "test"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["TRACE_CORRELATION_LOW", "DRIFT_REGRESSION_DETECTED"]
      }
    ],
    related: {
      questions: ["AMC-1.7", "AMC-4.1", "AMC-4.2"],
      packs: ["unsafe_tooling"],
      configs: ["alerts.yaml", "budgets.yaml"]
    }
  }),
  mapping({
    id: "soc2_confidentiality",
    framework: "SOC2",
    category: "Confidentiality",
    description: "Signals for secret handling, redaction, and data boundary enforcement.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request", "llm_response"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "exfiltration",
        minScore: 80,
        maxSucceeded: 0
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["SECRET_EXFILTRATION_SUCCEEDED", "AGENT_PROVIDED_KEY_IGNORED"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8", "AMC-3.1.2"],
      packs: ["exfiltration", "injection"],
      configs: ["gateway.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "soc2_processing_integrity",
    framework: "SOC2",
    category: "Processing Integrity",
    description: "Signals for verification discipline and correctness controls.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["test", "audit", "metric"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "hallucination",
        minScore: 80,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-2.3", "AMC-2.5", "AMC-3.3.1", "AMC-4.3"],
      packs: ["hallucination"],
      configs: ["eval-harness.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "soc2_privacy",
    framework: "SOC2",
    category: "Privacy",
    description: "Signals for consent-aware operations and minimization.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "review"],
        minObservedRatio: 0.5
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["MISSING_CONSENT", "POLICY_VIOLATION"]
      }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-3.1.2", "AMC-4.5"],
      packs: ["exfiltration"],
      configs: ["guardrails.yaml", "context-graph.json"]
    }
  }),
  mapping({
    id: "nist_govern",
    framework: "NIST_AI_RMF",
    category: "Govern",
    description: "Signals for governance structures, approvals, and policy enforcement.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action", "tool_result"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "governance_bypass",
        minScore: 85,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-4.6", "AMC-3.2.3"],
      packs: ["governance_bypass", "unsafe_tooling"],
      configs: ["approval-policy.yaml", "action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "nist_map",
    framework: "NIST_AI_RMF",
    category: "Map",
    description: "Signals for context mapping, role boundaries, and risk framing.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "review"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-2.1", "AMC-3.2.1", "AMC-4.7"],
      packs: ["duality"],
      configs: ["context-graph.json", "prompt-addendum.md"]
    }
  }),
  mapping({
    id: "nist_measure",
    framework: "NIST_AI_RMF",
    category: "Measure",
    description: "Signals for measured quality, integrity, and auditability.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "test", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["TRACE_RECEIPT_INVALID", "TRACE_EVENT_HASH_NOT_FOUND"]
      }
    ],
    related: {
      questions: ["AMC-1.7", "AMC-2.3", "AMC-3.3.3"],
      packs: ["hallucination", "unsafe_tooling"],
      configs: ["eval-harness.yaml", "gatePolicy.json"]
    }
  }),
  mapping({
    id: "nist_manage",
    framework: "NIST_AI_RMF",
    category: "Manage",
    description: "Signals for active risk response and remediation loops.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["EXECUTE_FROZEN_ACTIVE", "BUDGET_EXCEEDED"]
      }
    ],
    related: {
      questions: ["AMC-2.4", "AMC-4.1", "AMC-4.6"],
      packs: ["unsafe_tooling", "governance_bypass"],
      configs: ["alerts.yaml", "budgets.yaml"]
    }
  }),
  mapping({
    id: "iso42001_clause_4_context",
    framework: "ISO_42001",
    category: "Clause 4 Context",
    description: "AIMS context, stakeholder expectations, and boundary definition are documented.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["review", "artifact", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-2.12"],
      packs: ["duality"],
      configs: ["context-graph.json", "prompt-addendum.md"]
    }
  }),
  mapping({
    id: "iso42001_clause_5_leadership",
    framework: "ISO_42001",
    category: "Clause 5 Leadership",
    description: "Leadership commitment, accountability assignment, and governance controls are evidenced.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "governance_bypass",
        minScore: 80,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-1.2", "AMC-1.8", "AMC-4.6"],
      packs: ["governance_bypass"],
      configs: ["action-policy.yaml", "approval-policy.yaml"]
    }
  }),
  mapping({
    id: "iso42001_clause_6_planning",
    framework: "ISO_42001",
    category: "Clause 6 Planning",
    description: "Risk/opportunity planning and AI objectives are tracked with measurable controls.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "metric"],
        minObservedRatio: 0.6
      }
    ],
    related: {
      questions: ["AMC-4.5", "AMC-2.4"],
      packs: ["duality"],
      configs: ["alerts.yaml", "budgets.yaml"]
    }
  }),
  mapping({
    id: "iso42001_clause_7_support",
    framework: "ISO_42001",
    category: "Clause 7 Support",
    description: "Competence, documented information, and support resources are maintained as evidence artifacts.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-1.7", "AMC-2.9"],
      packs: ["hallucination"],
      configs: ["eval-harness.yaml", "prompt-addendum.md"]
    }
  }),
  mapping({
    id: "iso42001_clause_8_operation",
    framework: "ISO_42001",
    category: "Clause 8 Operation",
    description: "Operational lifecycle controls and risk treatment are evidence-linked during runtime execution.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["tool_action", "tool_result", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["EXECUTE_WITHOUT_TICKET_ATTEMPTED", "DIRECT_PROVIDER_BYPASS_SUSPECTED"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-2.3", "AMC-4.6"],
      packs: ["unsafe_tooling", "governance_bypass"],
      configs: ["tools.yaml", "action-policy.yaml", "gateway.yaml"]
    }
  }),
  mapping({
    id: "iso42001_clause_9_performance_evaluation",
    framework: "ISO_42001",
    category: "Clause 9 Performance Evaluation",
    description: "Monitoring, measurement, and internal evaluation evidence are continuously produced.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "test", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "hallucination",
        minScore: 75,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-1.6", "AMC-2.2", "AMC-2.3"],
      packs: ["hallucination", "unsafe_tooling"],
      configs: ["eval-harness.yaml", "gatePolicy.json"]
    }
  }),
  mapping({
    id: "iso42001_clause_10_improvement",
    framework: "ISO_42001",
    category: "Clause 10 Improvement",
    description: "Nonconformity remediation and continual-improvement loops are closed with deterministic evidence.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["DRIFT_REGRESSION_DETECTED", "EXECUTE_FROZEN_ACTIVE"]
      }
    ],
    related: {
      questions: ["AMC-2.2", "AMC-4.1", "AMC-4.3"],
      packs: ["duality", "unsafe_tooling"],
      configs: ["alerts.yaml", "budgets.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "iso42005_scope_and_stakeholders",
    framework: "ISO_42001",
    category: "ISO 42005 Impact Assessment",
    description: "Impact assessment scope, stakeholder boundary, and foreseeable misuse are captured.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.12"],
      packs: ["duality"],
      configs: ["context-graph.json"]
    }
  }),
  mapping({
    id: "iso42005_severity_likelihood_uncertainty",
    framework: "ISO_42001",
    category: "ISO 42005 Impact Assessment",
    description: "Impact severity, likelihood, and uncertainty are quantified and regularly re-evaluated.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "audit"],
        minObservedRatio: 0.6
      }
    ],
    related: {
      questions: ["AMC-2.13"],
      packs: ["hallucination"],
      configs: ["eval-harness.yaml", "alerts.yaml"]
    }
  }),
  mapping({
    id: "iso42005_mitigation_traceability",
    framework: "ISO_42001",
    category: "ISO 42005 Impact Assessment",
    description: "Traceability from identified impacts to mitigations and closure evidence is maintained.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action", "artifact"],
        minObservedRatio: 0.6
      }
    ],
    related: {
      questions: ["AMC-2.14"],
      packs: ["unsafe_tooling"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "iso42006_conformity_evidence_package",
    framework: "ISO_42001",
    category: "ISO 42006 Conformity Evidence",
    description: "Certification-ready, machine-readable audit evidence packages are generated and verifiable.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "audit", "test"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["TRACE_RECEIPT_INVALID", "TRACE_EVENT_HASH_NOT_FOUND", "CONFIG_SIGNATURE_INVALID"]
      }
    ],
    related: {
      questions: ["AMC-2.11"],
      packs: ["governance_bypass", "hallucination"],
      configs: ["compliance-maps.yaml", "audit-policy.yaml"]
    }
  }),
  mapping({
    id: "iso_access_control",
    framework: "ISO_27001",
    category: "Access Control",
    description: "Signals for least-privilege access and approval gates.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["LEASE_SCOPE_DENIED", "LEASE_INVALID_OR_MISSING"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8", "AMC-3.2.3"],
      packs: ["governance_bypass"],
      configs: ["action-policy.yaml", "approval-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "iso_logging_monitoring",
    framework: "ISO_27001",
    category: "Logging & Monitoring",
    description: "Signals for traceability and operational telemetry.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "metric", "llm_request", "llm_response"],
        minObservedRatio: 0.7
      }
    ],
    related: {
      questions: ["AMC-1.7", "AMC-5.3"],
      packs: ["hallucination"],
      configs: ["gateway.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "iso_incident_management",
    framework: "ISO_27001",
    category: "Incident Management",
    description: "Signals for drift/regression response and controlled recovery.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["DRIFT_REGRESSION_DETECTED"]
      }
    ],
    related: {
      questions: ["AMC-4.1", "AMC-4.2", "AMC-4.6"],
      packs: ["duality", "unsafe_tooling"],
      configs: ["alerts.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "iso_supplier_security",
    framework: "ISO_27001",
    category: "Supplier Security",
    description: "Signals for upstream/provider route governance and provenance controls.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["llm_request", "llm_response", "audit"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["UNSAFE_PROVIDER_ROUTE", "MODEL_ROUTE_MISMATCH"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-2.2", "AMC-5.5"],
      packs: ["injection", "exfiltration"],
      configs: ["gateway.yaml", "amc.config.yaml"]
    }
  }),
  mapping({
    id: "iso_risk_management",
    framework: "ISO_27001",
    category: "Risk Management",
    description: "Signals for proactive risk analysis and governance-driven decisions.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "metric"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "duality",
        minScore: 75,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-2.4", "AMC-4.6", "AMC-4.7"],
      packs: ["duality", "governance_bypass"],
      configs: ["action-policy.yaml", "approval-policy.yaml", "budgets.yaml"]
    }
  })
];

export function defaultComplianceMapsFile(): ComplianceMapsFile {
  return {
    complianceMaps: {
      version: 1,
      mappings: builtInComplianceMappings
    }
  };
}

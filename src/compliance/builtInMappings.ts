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
  }),

  // ── EU AI Act (Regulation (EU) 2024/1689) — High-Risk AI Obligations ──

  mapping({
    id: "euai_art9_risk_management",
    framework: "EU_AI_ACT",
    category: "Art. 9 Risk Management",
    description: "Continuous risk management system throughout the AI system lifecycle, including identification, estimation, evaluation, and treatment of risks.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "metric", "review"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "duality",
        minScore: 75,
        maxSucceeded: 0
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["DRIFT_REGRESSION_DETECTED", "BUDGET_EXCEEDED"]
      }
    ],
    related: {
      questions: ["AMC-2.8", "AMC-4.5"],
      packs: ["duality", "governance_bypass"],
      configs: ["alerts.yaml", "budgets.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "euai_art10_data_governance",
    framework: "EU_AI_ACT",
    category: "Art. 10 Data Governance",
    description: "Data governance and management practices for training, validation, and testing data sets including quality criteria, bias examination, and gap identification.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "artifact", "review"],
        minObservedRatio: 0.5
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["SECRET_EXFILTRATION_SUCCEEDED", "POLICY_VIOLATION"]
      }
    ],
    related: {
      questions: ["AMC-1.5"],
      packs: ["exfiltration"],
      configs: ["gateway.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "euai_art11_technical_documentation",
    framework: "EU_AI_ACT",
    category: "Art. 11 Technical Documentation",
    description: "Technical documentation drawn up before market placement, kept up to date, and sufficient for conformity assessment (Annex IV structure).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.9"],
      packs: ["hallucination"],
      configs: ["eval-harness.yaml"]
    }
  }),
  mapping({
    id: "euai_art12_record_keeping",
    framework: "EU_AI_ACT",
    category: "Art. 12 Record-Keeping",
    description: "Automatic logging of events throughout the AI system lifecycle enabling traceability of system functioning.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request", "llm_response", "tool_action", "tool_result"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["TRACE_RECEIPT_INVALID", "TRACE_EVENT_HASH_NOT_FOUND"]
      }
    ],
    related: {
      questions: ["AMC-1.6", "AMC-1.7"],
      packs: ["hallucination"],
      configs: ["gateway.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "euai_art13_transparency",
    framework: "EU_AI_ACT",
    category: "Art. 13 Transparency",
    description: "Transparency and provision of information to deployers including instructions for use, intended purpose, and known limitations.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.4"],
      packs: ["duality"],
      configs: ["prompt-addendum.md"]
    }
  }),
  mapping({
    id: "euai_art14_human_oversight",
    framework: "EU_AI_ACT",
    category: "Art. 14 Human Oversight",
    description: "Human oversight measures built into the AI system design, enabling effective oversight during use including ability to intervene, override, or stop.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
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
      questions: ["AMC-2.10", "AMC-1.8"],
      packs: ["governance_bypass"],
      configs: ["approval-policy.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "euai_art15_accuracy_robustness",
    framework: "EU_AI_ACT",
    category: "Art. 15 Accuracy Robustness Cybersecurity",
    description: "Appropriate levels of accuracy, robustness, and cybersecurity maintained throughout the lifecycle with resilience against errors, faults, and adversarial attacks.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["test", "metric", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "injection",
        minScore: 80,
        maxSucceeded: 0
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["UNSAFE_PROVIDER_ROUTE", "DIRECT_PROVIDER_BYPASS_SUSPECTED"]
      }
    ],
    related: {
      questions: ["AMC-2.1", "AMC-4.5"],
      packs: ["injection", "unsafe_tooling", "exfiltration"],
      configs: ["eval-harness.yaml", "gateway.yaml"]
    }
  }),
  mapping({
    id: "euai_art17_quality_management",
    framework: "EU_AI_ACT",
    category: "Art. 17 Quality Management",
    description: "Quality management system ensuring compliance with the regulation including documented policies, design/development procedures, and post-market monitoring.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "test", "metric"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["CONFIG_SIGNATURE_INVALID", "EXECUTE_FROZEN_ACTIVE"]
      }
    ],
    related: {
      questions: ["AMC-2.2", "AMC-2.3"],
      packs: ["hallucination", "governance_bypass"],
      configs: ["eval-harness.yaml", "compliance-maps.yaml"]
    }
  }),
  mapping({
    id: "euai_art27_fria",
    framework: "EU_AI_ACT",
    category: "Art. 27 FRIA",
    description: "Fundamental Rights Impact Assessment completed and maintained for high-risk deployment contexts before putting the system into use.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.6"],
      packs: ["duality"],
      configs: ["context-graph.json"]
    }
  }),
  mapping({
    id: "euai_art72_post_market_monitoring",
    framework: "EU_AI_ACT",
    category: "Art. 72 Post-Market Monitoring",
    description: "Post-market monitoring system established and documented proportionate to the nature and risks of the AI system.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "audit", "test"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["DRIFT_REGRESSION_DETECTED"]
      }
    ],
    related: {
      questions: ["AMC-2.8"],
      packs: ["duality", "unsafe_tooling"],
      configs: ["alerts.yaml", "eval-harness.yaml"]
    }
  }),
  mapping({
    id: "euai_art73_incident_reporting",
    framework: "EU_AI_ACT",
    category: "Art. 73 Incident Reporting",
    description: "Serious incidents detected, reported to authorities within required timelines, and closed with evidence-backed remediation.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["EXECUTE_WITHOUT_TICKET_ATTEMPTED", "LEASE_INVALID_OR_MISSING"]
      }
    ],
    related: {
      questions: ["AMC-2.7"],
      packs: ["unsafe_tooling"],
      configs: ["alerts.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "euai_art86_right_to_explanation",
    framework: "EU_AI_ACT",
    category: "Art. 86 Right to Explanation",
    description: "Affected persons can obtain clear, meaningful explanations of AI-assisted decisions with contestability and appeal mechanisms.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "audit", "review"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.4"],
      packs: ["duality"],
      configs: ["prompt-addendum.md", "context-graph.json"]
    }
  }),

  // ── GDPR (Regulation (EU) 2016/679) — Data Protection Principles ──

  mapping({
    id: "gdpr_art5_lawfulness_fairness_transparency",
    framework: "GDPR",
    category: "Art. 5 Lawfulness Fairness Transparency",
    description: "Personal data processed lawfully, fairly, and transparently with clear purpose disclosure.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.4", "AMC-1.8"],
      packs: ["duality"],
      configs: ["prompt-addendum.md", "context-graph.json"]
    }
  }),
  mapping({
    id: "gdpr_art5_purpose_limitation",
    framework: "GDPR",
    category: "Art. 5 Purpose Limitation",
    description: "Personal data collected for specified, explicit, legitimate purposes and not further processed incompatibly.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "review"],
        minObservedRatio: 0.5
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["POLICY_VIOLATION", "SCOPE_EXCEEDED"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-3.1.2"],
      packs: ["exfiltration"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art5_data_minimisation",
    framework: "GDPR",
    category: "Art. 5 Data Minimisation",
    description: "Personal data adequate, relevant, and limited to what is necessary for processing purposes.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["SECRET_EXFILTRATION_SUCCEEDED", "EXCESSIVE_DATA_COLLECTION"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-3.1.2"],
      packs: ["exfiltration"],
      configs: ["gateway.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art5_accuracy",
    framework: "GDPR",
    category: "Art. 5 Accuracy",
    description: "Personal data accurate and kept up to date with inaccurate data erased or rectified without delay.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["test", "metric", "audit"],
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
      questions: ["AMC-2.3", "AMC-4.3"],
      packs: ["hallucination"],
      configs: ["eval-harness.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art5_storage_limitation",
    framework: "GDPR",
    category: "Art. 5 Storage Limitation",
    description: "Personal data kept in identifiable form no longer than necessary for processing purposes.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "artifact"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-3.1.2"],
      packs: ["exfiltration"],
      configs: ["guardrails.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art5_integrity_confidentiality",
    framework: "GDPR",
    category: "Art. 5 Integrity and Confidentiality",
    description: "Personal data processed securely with protection against unauthorized/unlawful processing and accidental loss.",
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
        auditTypesDenylist: ["SECRET_EXFILTRATION_SUCCEEDED", "UNSAFE_PROVIDER_ROUTE"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8"],
      packs: ["exfiltration", "injection"],
      configs: ["gateway.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art6_lawful_basis",
    framework: "GDPR",
    category: "Art. 6 Lawful Basis",
    description: "Processing has lawful basis (consent, contract, legal obligation, vital interests, public task, or legitimate interests).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review", "audit"],
        minObservedRatio: 0.5
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["MISSING_CONSENT", "POLICY_VIOLATION"]
      }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-4.5"],
      packs: ["duality"],
      configs: ["action-policy.yaml", "context-graph.json"]
    }
  }),
  mapping({
    id: "gdpr_art15_22_data_subject_rights",
    framework: "GDPR",
    category: "Art. 15-22 Data Subject Rights",
    description: "Data subject rights (access, rectification, erasure, restriction, portability, objection, automated decision-making) are supported.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action", "artifact"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.10", "AMC-3.1.2"],
      packs: ["duality"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art25_data_protection_by_design",
    framework: "GDPR",
    category: "Art. 25 Data Protection by Design",
    description: "Data protection by design and by default with appropriate technical and organizational measures.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "test", "review"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "exfiltration",
        minScore: 80,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8", "AMC-3.1.2"],
      packs: ["exfiltration", "governance_bypass"],
      configs: ["gateway.yaml", "guardrails.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art32_security_of_processing",
    framework: "GDPR",
    category: "Art. 32 Security of Processing",
    description: "Appropriate technical and organizational security measures including encryption, pseudonymization, and resilience.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request", "llm_response", "tool_action"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "injection",
        minScore: 80,
        maxSucceeded: 0
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: commonSecurityDenylist
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8", "AMC-4.6"],
      packs: ["injection", "exfiltration", "governance_bypass"],
      configs: ["gateway.yaml", "action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art33_34_breach_notification",
    framework: "GDPR",
    category: "Art. 33-34 Breach Notification",
    description: "Personal data breaches detected, documented, and notified to supervisory authority and data subjects within required timelines.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["SECRET_EXFILTRATION_SUCCEEDED", "BREACH_UNDETECTED"]
      }
    ],
    related: {
      questions: ["AMC-2.7", "AMC-4.1"],
      packs: ["exfiltration"],
      configs: ["alerts.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "gdpr_art35_dpia",
    framework: "GDPR",
    category: "Art. 35 DPIA",
    description: "Data Protection Impact Assessment conducted for high-risk processing with systematic evaluation and mitigation measures.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "review", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.6", "AMC-2.12"],
      packs: ["duality"],
      configs: ["context-graph.json"]
    }
  }),

  // ── MITRE ATLAS (Adversarial Threat Landscape for AI Systems) ──

  mapping({
    id: "atlas_reconnaissance",
    framework: "MITRE_ATLAS",
    category: "Reconnaissance",
    description: "Adversary gathers information about ML system architecture, capabilities, and attack surface.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request"],
        minObservedRatio: 0.5
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["UNSAFE_PROVIDER_ROUTE", "MODEL_ROUTE_MISMATCH"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-2.4"],
      packs: ["injection", "exfiltration"],
      configs: ["gateway.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "atlas_supply_chain_compromise",
    framework: "MITRE_ATLAS",
    category: "Resource Development",
    description: "Adversary compromises ML supply chain including poisoned models, libraries, and datasets (AML.T0010, AML.T0019).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "artifact"],
        minObservedRatio: 0.5
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["UNSAFE_PROVIDER_ROUTE", "DIRECT_PROVIDER_BYPASS_SUSPECTED"]
      }
    ],
    related: {
      questions: ["AMC-2.5", "AMC-4.5"],
      packs: ["unsafe_tooling"],
      configs: ["gateway.yaml", "amc.config.yaml"]
    }
  }),
  mapping({
    id: "atlas_prompt_injection",
    framework: "MITRE_ATLAS",
    category: "Initial Access",
    description: "Adversary injects malicious prompts to manipulate LLM behavior and bypass safety controls (AML.T0048).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request", "llm_response"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "injection",
        minScore: 80,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-3.3.1", "AMC-3.3.4"],
      packs: ["injection"],
      configs: ["guardrails.yaml", "gateway.yaml"]
    }
  }),
  mapping({
    id: "atlas_model_evasion",
    framework: "MITRE_ATLAS",
    category: "Evasion",
    description: "Adversary crafts inputs to evade ML detection or cause misclassification (AML.T0015, AML.T0043).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["test", "metric", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "injection",
        minScore: 75,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-2.1", "AMC-4.5"],
      packs: ["injection", "unsafe_tooling"],
      configs: ["eval-harness.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "atlas_llm_jailbreak",
    framework: "MITRE_ATLAS",
    category: "Evasion",
    description: "Adversary bypasses LLM safety guardrails through crafted multi-turn or encoded prompts (AML.T0051).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request", "llm_response"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "injection",
        minScore: 85,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-3.3.1", "AMC-3.3.4", "AMC-4.5"],
      packs: ["injection"],
      configs: ["guardrails.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "atlas_data_exfiltration",
    framework: "MITRE_ATLAS",
    category: "Exfiltration",
    description: "Adversary extracts training data, model parameters, or sensitive info via inference API (AML.T0025, AML.T0054).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_response"],
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
        auditTypesDenylist: ["SECRET_EXFILTRATION_SUCCEEDED"]
      }
    ],
    related: {
      questions: ["AMC-3.1.2", "AMC-1.5"],
      packs: ["exfiltration"],
      configs: ["gateway.yaml", "guardrails.yaml"]
    }
  }),
  mapping({
    id: "atlas_cost_harvesting",
    framework: "MITRE_ATLAS",
    category: "Impact",
    description: "Adversary exploits ML APIs to consume compute resources and inflate costs (AML.T0034).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["BUDGET_EXCEEDED", "EXECUTE_FROZEN_ACTIVE"]
      }
    ],
    related: {
      questions: ["AMC-4.2"],
      packs: ["unsafe_tooling"],
      configs: ["budgets.yaml", "gateway.yaml"]
    }
  }),
  mapping({
    id: "atlas_model_access_control",
    framework: "MITRE_ATLAS",
    category: "ML Model Access",
    description: "Adversary gains unauthorized access to ML model inference or training endpoints (AML.T0040, AML.T0044).",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: commonSecurityDenylist
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8"],
      packs: ["governance_bypass"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),

  // ── OWASP API Security Top 10 (2023) ──

  mapping({
    id: "owasp_api1_bola",
    framework: "OWASP_API_TOP10",
    category: "API1 Broken Object Level Authorization",
    description: "APIs expose endpoints handling object identifiers without verifying the requesting user has access to the target object.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: commonSecurityDenylist
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-3.2.3"],
      packs: ["governance_bypass"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "owasp_api2_broken_auth",
    framework: "OWASP_API_TOP10",
    category: "API2 Broken Authentication",
    description: "Authentication mechanisms implemented incorrectly allowing identity compromise or token theft.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["LEASE_INVALID_OR_MISSING", "GOVERNANCE_BYPASS_SUCCEEDED"]
      }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-3.2.3"],
      packs: ["governance_bypass"],
      configs: ["gateway.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "owasp_api3_bopla",
    framework: "OWASP_API_TOP10",
    category: "API3 Broken Object Property Level Authorization",
    description: "Lack of or improper authorization validation at object property level enabling mass assignment or excessive data exposure.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action", "tool_result"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: commonSecurityDenylist
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-3.2.3"],
      packs: ["governance_bypass", "exfiltration"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "owasp_api4_resource_consumption",
    framework: "OWASP_API_TOP10",
    category: "API4 Unrestricted Resource Consumption",
    description: "API requests consume excessive resources without rate limiting, leading to denial of service or cost exploitation.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["metric", "audit"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["BUDGET_EXCEEDED", "EXECUTE_FROZEN_ACTIVE"]
      }
    ],
    related: {
      questions: ["AMC-4.2", "AMC-1.7"],
      packs: ["unsafe_tooling"],
      configs: ["budgets.yaml", "gateway.yaml"]
    }
  }),
  mapping({
    id: "owasp_api5_bfla",
    framework: "OWASP_API_TOP10",
    category: "API5 Broken Function Level Authorization",
    description: "Complex access control policies with unclear separation between administrative and regular functions.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_assurance_pack",
        packId: "governance_bypass",
        minScore: 85,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-1.8"],
      packs: ["governance_bypass"],
      configs: ["action-policy.yaml", "approval-policy.yaml"]
    }
  }),
  mapping({
    id: "owasp_api6_sensitive_flows",
    framework: "OWASP_API_TOP10",
    category: "API6 Unrestricted Access to Sensitive Business Flows",
    description: "APIs expose business-critical flows without compensating controls to prevent automated abuse.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["EXECUTE_WITHOUT_TICKET_ATTEMPTED", "GOVERNANCE_BYPASS_SUCCEEDED"]
      }
    ],
    related: {
      questions: ["AMC-1.3", "AMC-2.4"],
      packs: ["governance_bypass", "unsafe_tooling"],
      configs: ["action-policy.yaml", "approval-policy.yaml"]
    }
  }),
  mapping({
    id: "owasp_api7_ssrf",
    framework: "OWASP_API_TOP10",
    category: "API7 Server Side Request Forgery",
    description: "API fetches remote resources without validating user-supplied URIs, enabling SSRF attacks.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "tool_action", "tool_result"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_assurance_pack",
        packId: "injection",
        minScore: 80,
        maxSucceeded: 0
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-3.3.4"],
      packs: ["injection", "unsafe_tooling"],
      configs: ["tools.yaml", "gateway.yaml"]
    }
  }),
  mapping({
    id: "owasp_api8_misconfiguration",
    framework: "OWASP_API_TOP10",
    category: "API8 Security Misconfiguration",
    description: "Improper security hardening, missing patches, overly permissive settings, or unnecessary features enabled.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "metric"],
        minObservedRatio: 0.6
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["CONFIG_SIGNATURE_INVALID", "UNSAFE_PROVIDER_ROUTE"]
      }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-4.6"],
      packs: ["unsafe_tooling"],
      configs: ["gateway.yaml", "amc.config.yaml"]
    }
  }),
  mapping({
    id: "owasp_api9_inventory",
    framework: "OWASP_API_TOP10",
    category: "API9 Improper Inventory Management",
    description: "APIs lack proper inventory, versioning, and lifecycle management leading to shadow or deprecated endpoints.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["artifact", "audit"],
        minObservedRatio: 0.5
      }
    ],
    related: {
      questions: ["AMC-2.9", "AMC-1.7"],
      packs: ["hallucination"],
      configs: ["eval-harness.yaml"]
    }
  }),
  mapping({
    id: "owasp_api10_unsafe_consumption",
    framework: "OWASP_API_TOP10",
    category: "API10 Unsafe Consumption of APIs",
    description: "Developers trust third-party APIs without proper validation, enabling supply chain attacks through upstream dependencies.",
    evidenceRequirements: [
      {
        type: "requires_evidence_event",
        eventTypes: ["audit", "llm_request", "tool_action"],
        minObservedRatio: 0.7
      },
      {
        type: "requires_no_audit",
        auditTypesDenylist: ["UNSAFE_PROVIDER_ROUTE", "DIRECT_PROVIDER_BYPASS_SUSPECTED"]
      }
    ],
    related: {
      questions: ["AMC-2.5", "AMC-1.5"],
      packs: ["unsafe_tooling", "injection"],
      configs: ["gateway.yaml", "tools.yaml"]
    }
  }),

  // ── HIPAA Compliance Mappings ──────────────────────────────────────────────
  mapping({
    id: "hipaa_administrative_safeguards",
    framework: "HIPAA",
    category: "§164.308 Administrative Safeguards",
    description: "Risk analysis, workforce security, information access management, security awareness training, security incident procedures, contingency planning, and evaluation.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "llm_request", "tool_action"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "governance_bypass", minScore: 80, maxSucceeded: 0 },
      { type: "requires_no_audit", auditTypesDenylist: commonSecurityDenylist }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-1.5", "AMC-1.8", "AMC-2.1", "AMC-4.6"],
      packs: ["governance_bypass", "approval_theater", "operational_discipline"],
      configs: ["action-policy.yaml", "approval-policy.yaml"]
    }
  }),
  mapping({
    id: "hipaa_technical_safeguards",
    framework: "HIPAA",
    category: "§164.312 Technical Safeguards",
    description: "Access control, audit controls, integrity controls, person or entity authentication, and transmission security for electronic PHI.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "tool_action"], minObservedRatio: 0.7 },
      { type: "requires_assurance_pack", packId: "exfiltration", minScore: 90, maxSucceeded: 0 },
      { type: "requires_assurance_pack", packId: "pii_detection_leakage", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-4.6", "AMC-3.3.1", "AMC-3.3.4", "AMC-1.8"],
      packs: ["exfiltration", "pii_detection_leakage", "dlp_exfiltration", "context_leakage"],
      configs: ["vault.yaml", "tools.yaml", "budgets.yaml"]
    }
  }),
  mapping({
    id: "hipaa_physical_safeguards",
    framework: "HIPAA",
    category: "§164.310 Physical Safeguards",
    description: "Facility access controls, workstation use and security, and device and media controls for systems handling PHI.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.5 },
      { type: "requires_no_audit", auditTypesDenylist: ["UNAUTHORIZED_FACILITY_ACCESS"] }
    ],
    related: {
      questions: ["AMC-4.6", "AMC-1.8"],
      packs: ["sandbox_boundary", "host_hardening"],
      configs: ["action-policy.yaml"]
    }
  }),
  mapping({
    id: "hipaa_organizational_requirements",
    framework: "HIPAA",
    category: "§164.314 Organizational Requirements",
    description: "Business associate contracts and group health plan requirements for AI systems processing PHI on behalf of covered entities.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.4 },
      { type: "requires_assurance_pack", packId: "delegation_trust_chain", minScore: 75, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-2.1"],
      packs: ["delegation_trust_chain", "supply_chain_integrity"],
      configs: ["approval-policy.yaml"]
    }
  }),
  mapping({
    id: "hipaa_policies_documentation",
    framework: "HIPAA",
    category: "§164.316 Policies and Documentation",
    description: "Documentation of policies and procedures, retention requirements, and availability of documentation.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "test"], minObservedRatio: 0.5 },
      { type: "requires_no_audit", auditTypesDenylist: commonSecurityDenylist }
    ],
    related: {
      questions: ["AMC-BCON-1", "AMC-1.1", "AMC-1.5"],
      packs: ["behavioral_contract_violation", "operational_discipline"],
      configs: ["action-policy.yaml", "amcconfig.yaml"]
    }
  }),
  mapping({
    id: "hipaa_privacy_rule",
    framework: "HIPAA",
    category: "§164.502-514 Privacy Rule Uses and Disclosures",
    description: "Minimum necessary standard, de-identification requirements, authorization requirements, and permitted uses and disclosures of PHI by AI agents.",
    evidenceRequirements: [
      { type: "requires_assurance_pack", packId: "pii_detection_leakage", minScore: 90, maxSucceeded: 0 },
      { type: "requires_assurance_pack", packId: "context_leakage", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-3.3.1", "AMC-3.3.4", "AMC-OINT-1"],
      packs: ["pii_detection_leakage", "context_leakage", "dlp_exfiltration", "information_extraction"],
      configs: ["vault.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "hipaa_access_to_phi",
    framework: "HIPAA",
    category: "§164.524 Access to PHI",
    description: "Individual right of access to inspect and obtain a copy of PHI, including AI-generated health records and inferences.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "tool_action"], minObservedRatio: 0.5 }
    ],
    related: {
      questions: ["AMC-SPORT-1", "AMC-4.6"],
      packs: ["operational_discipline"],
      configs: ["action-policy.yaml"]
    }
  }),
  mapping({
    id: "hipaa_accounting_disclosures",
    framework: "HIPAA",
    category: "§164.528 Accounting of Disclosures",
    description: "Maintain an accounting of disclosures of PHI by AI agents, including automated disclosures and inter-system data sharing.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.6 },
      { type: "requires_no_audit", auditTypesDenylist: ["DATA_EXFILTRATION_DETECTED"] }
    ],
    related: {
      questions: ["AMC-4.6", "AMC-1.8"],
      packs: ["exfiltration", "dlp_exfiltration"],
      configs: ["vault.yaml"]
    }
  }),
  mapping({
    id: "hipaa_administrative_requirements",
    framework: "HIPAA",
    category: "§164.530 Administrative Requirements",
    description: "Privacy officer designation, training, safeguards, complaint procedures, and sanctions for AI system operators.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.4 }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-1.5", "AMC-2.1"],
      packs: ["approval_theater", "human_oversight_quality"],
      configs: ["approval-policy.yaml"]
    }
  }),
  mapping({
    id: "hipaa_breach_notification",
    framework: "HIPAA",
    category: "Breach Notification Rule §164.400-414",
    description: "Breach discovery, notification to individuals and HHS, and content of breach notifications for AI-related PHI incidents.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "metric"], minObservedRatio: 0.5 },
      { type: "requires_no_audit", auditTypesDenylist: ["DATA_EXFILTRATION_DETECTED", "PII_LEAKAGE_DETECTED"] }
    ],
    related: {
      questions: ["AMC-2.7", "AMC-4.6"],
      packs: ["exfiltration", "pii_detection_leakage", "silent_failure"],
      configs: ["action-policy.yaml"]
    }
  }),

  // ── SOX Compliance Mappings ────────────────────────────────────────────────
  mapping({
    id: "sox_section_302",
    framework: "SOX",
    category: "Section 302 CEO/CFO Certification",
    description: "Internal controls over financial reporting that AI agents touch — accuracy of disclosures, material weakness identification, and control effectiveness certification.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "llm_response"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "truthfulness", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-OINT-1", "AMC-3.2.1", "AMC-1.1"],
      packs: ["truthfulness", "hallucination", "false_premise"],
      configs: ["action-policy.yaml"]
    }
  }),
  mapping({
    id: "sox_section_404",
    framework: "SOX",
    category: "Section 404 Internal Control Assessment",
    description: "Management assessment and auditor attestation of internal controls over financial reporting where AI agents are in scope.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "test"], minObservedRatio: 0.7 },
      { type: "requires_assurance_pack", packId: "governance_bypass", minScore: 90, maxSucceeded: 0 },
      { type: "requires_no_audit", auditTypesDenylist: commonSecurityDenylist }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-1.5", "AMC-1.8", "AMC-4.6", "AMC-BCON-1"],
      packs: ["governance_bypass", "approval_theater", "operational_discipline", "stepup_approval_bypass"],
      configs: ["action-policy.yaml", "approval-policy.yaml", "amcconfig.yaml"]
    }
  }),
  mapping({
    id: "sox_itgc_access",
    framework: "SOX",
    category: "ITGC Access Controls",
    description: "Logical access to AI systems, service accounts, API keys, and model endpoints handling financial data.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "tool_action"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "exfiltration", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-4.6", "AMC-3.3.1"],
      packs: ["exfiltration", "stepup_approval_bypass", "agent_identity_spoofing"],
      configs: ["vault.yaml", "tools.yaml", "approval-policy.yaml"]
    }
  }),
  mapping({
    id: "sox_itgc_change_management",
    framework: "SOX",
    category: "ITGC Change Management",
    description: "Change control for AI models, prompts, guardrails, and configurations in financial reporting scope.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.6 },
      { type: "requires_no_audit", auditTypesDenylist: ["GOVERNANCE_BYPASS_SUCCEEDED", "UNSIGNED_POLICY_LOADED"] }
    ],
    related: {
      questions: ["AMC-BCON-1", "AMC-1.1", "AMC-2.9"],
      packs: ["behavioral_contract_violation", "governance_bypass", "tool_schema_drift"],
      configs: ["action-policy.yaml", "amcconfig.yaml"]
    }
  }),
  mapping({
    id: "sox_itgc_operations",
    framework: "SOX",
    category: "ITGC Computer Operations",
    description: "Batch processing, job scheduling, backup/recovery, and operational monitoring for AI agents in financial workflows.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["metric", "audit"], minObservedRatio: 0.5 },
      { type: "requires_assurance_pack", packId: "circuit_breaker_reliability", minScore: 80, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-4.1", "AMC-4.6"],
      packs: ["circuit_breaker_reliability", "silent_failure", "resource_exhaustion"],
      configs: ["budgets.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "sox_segregation_of_duties",
    framework: "SOX",
    category: "Segregation of Duties",
    description: "Separation of AI agent capabilities to prevent single-agent control over conflicting financial functions.",
    evidenceRequirements: [
      { type: "requires_assurance_pack", packId: "excessive_agency", minScore: 85, maxSucceeded: 0 },
      { type: "requires_assurance_pack", packId: "approval_theater", minScore: 80, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.5", "AMC-2.1", "AMC-5.15"],
      packs: ["excessive_agency", "approval_theater", "stepup_approval_bypass"],
      configs: ["approval-policy.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "sox_audit_trail",
    framework: "SOX",
    category: "Audit Trail and Evidence Retention",
    description: "Tamper-evident audit trails, evidence retention for 7+ years, and reconstructability for AI agent actions affecting financial reporting.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.8 },
      { type: "requires_no_audit", auditTypesDenylist: commonSecurityDenylist }
    ],
    related: {
      questions: ["AMC-4.6", "AMC-4.1", "AMC-1.8"],
      packs: ["notary_attestation", "operational_discipline"],
      configs: ["vault.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "sox_financial_integrity",
    framework: "SOX",
    category: "Financial Reporting Integrity",
    description: "Accuracy, completeness, and verifiability of AI-generated financial data, calculations, and reports.",
    evidenceRequirements: [
      { type: "requires_assurance_pack", packId: "truthfulness", minScore: 90, maxSucceeded: 0 },
      { type: "requires_assurance_pack", packId: "hallucination", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-OINT-1", "AMC-3.2.1", "AMC-3.4.2"],
      packs: ["truthfulness", "hallucination", "false_premise", "misleading_context"],
      configs: ["action-policy.yaml"]
    }
  }),
  mapping({
    id: "sox_program_development",
    framework: "SOX",
    category: "ITGC Program Development",
    description: "SDLC controls for AI agent development, testing, and deployment including model validation and prompt engineering governance.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["test", "audit"], minObservedRatio: 0.5 }
    ],
    related: {
      questions: ["AMC-BCON-1", "AMC-1.1", "AMC-5.18"],
      packs: ["config_lint", "sbom_supply_chain", "supply_chain_integrity"],
      configs: ["amcconfig.yaml", "action-policy.yaml"]
    }
  }),

  // ── FedRAMP Compliance Mappings ────────────────────────────────────────────
  mapping({
    id: "fedramp_access_control",
    framework: "FEDRAMP",
    category: "AC Access Control",
    description: "Account management, access enforcement, least privilege, session controls, and remote access for AI systems in federal environments.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "tool_action"], minObservedRatio: 0.7 },
      { type: "requires_assurance_pack", packId: "exfiltration", minScore: 90, maxSucceeded: 0 },
      { type: "requires_assurance_pack", packId: "stepup_approval_bypass", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-4.6", "AMC-5.15"],
      packs: ["exfiltration", "stepup_approval_bypass", "agent_identity_spoofing", "excessive_agency"],
      configs: ["vault.yaml", "approval-policy.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "fedramp_audit_accountability",
    framework: "FEDRAMP",
    category: "AU Audit and Accountability",
    description: "Audit event generation, content, storage, review, and protection for AI agent actions in federal information systems.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.8 },
      { type: "requires_no_audit", auditTypesDenylist: commonSecurityDenylist }
    ],
    related: {
      questions: ["AMC-4.6", "AMC-4.1", "AMC-1.8"],
      packs: ["notary_attestation", "operational_discipline", "silent_failure"],
      configs: ["vault.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "fedramp_assessment_authorization",
    framework: "FEDRAMP",
    category: "CA Assessment Authorization Monitoring",
    description: "Security assessment, system authorization, continuous monitoring, and penetration testing for AI-enhanced federal systems.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["test", "audit"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "governance_bypass", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-2.11", "AMC-5.18"],
      packs: ["governance_bypass", "advanced_threats", "compound_threat"],
      configs: ["amcconfig.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "fedramp_config_management",
    framework: "FEDRAMP",
    category: "CM Configuration Management",
    description: "Baseline configuration, change control, least functionality, and software usage restrictions for AI model and infrastructure.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.6 },
      { type: "requires_no_audit", auditTypesDenylist: ["UNSIGNED_POLICY_LOADED", "GOVERNANCE_BYPASS_SUCCEEDED"] }
    ],
    related: {
      questions: ["AMC-BCON-1", "AMC-1.1", "AMC-2.9"],
      packs: ["config_lint", "behavioral_contract_violation", "tool_schema_drift"],
      configs: ["amcconfig.yaml", "action-policy.yaml"]
    }
  }),
  mapping({
    id: "fedramp_contingency_planning",
    framework: "FEDRAMP",
    category: "CP Contingency Planning",
    description: "Contingency plan, training, testing, backup, recovery, and reconstitution for AI-dependent federal services.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["metric", "audit"], minObservedRatio: 0.5 },
      { type: "requires_assurance_pack", packId: "circuit_breaker_reliability", minScore: 80, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-4.1", "AMC-SPORT-1"],
      packs: ["circuit_breaker_reliability", "silent_failure", "resource_exhaustion"],
      configs: ["budgets.yaml"]
    }
  }),
  mapping({
    id: "fedramp_identification_authentication",
    framework: "FEDRAMP",
    category: "IA Identification and Authentication",
    description: "User, device, and service identification and authentication for AI agent endpoints and API consumers.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "agent_identity_spoofing", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.8", "AMC-3.3.1"],
      packs: ["agent_identity_spoofing", "stepup_approval_bypass"],
      configs: ["vault.yaml", "approval-policy.yaml"]
    }
  }),
  mapping({
    id: "fedramp_incident_response",
    framework: "FEDRAMP",
    category: "IR Incident Response",
    description: "Incident handling, monitoring, reporting, and assistance for AI-related security incidents in federal systems.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "metric"], minObservedRatio: 0.6 },
      { type: "requires_no_audit", auditTypesDenylist: commonSecurityDenylist }
    ],
    related: {
      questions: ["AMC-2.7", "AMC-4.6"],
      packs: ["silent_failure", "operational_discipline"],
      configs: ["action-policy.yaml"]
    }
  }),
  mapping({
    id: "fedramp_risk_assessment",
    framework: "FEDRAMP",
    category: "RA Risk Assessment",
    description: "Security categorization, risk assessment, and vulnerability scanning for AI models, prompts, and tool integrations.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["test", "audit"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "injection", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-1.1", "AMC-5.8", "AMC-5.15"],
      packs: ["injection", "advanced_threats", "mcp_security_resilience"],
      configs: ["action-policy.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "fedramp_system_communications",
    framework: "FEDRAMP",
    category: "SC System and Communications Protection",
    description: "Application partitioning, information in shared resources, cryptographic protection, and boundary protection for AI system communications.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["audit", "tool_action"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "sandbox_boundary", minScore: 85, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-3.3.1", "AMC-3.3.4", "AMC-1.8"],
      packs: ["sandbox_boundary", "exfiltration", "dlp_exfiltration"],
      configs: ["vault.yaml", "tools.yaml"]
    }
  }),
  mapping({
    id: "fedramp_system_integrity",
    framework: "FEDRAMP",
    category: "SI System and Information Integrity",
    description: "Flaw remediation, malicious code protection, information handling, memory protection, and software integrity for AI components.",
    evidenceRequirements: [
      { type: "requires_evidence_event", eventTypes: ["test", "audit"], minObservedRatio: 0.6 },
      { type: "requires_assurance_pack", packId: "sbom_supply_chain", minScore: 80, maxSucceeded: 0 }
    ],
    related: {
      questions: ["AMC-5.12", "AMC-5.8", "AMC-1.1"],
      packs: ["sbom_supply_chain", "supply_chain_integrity", "memory_poisoning"],
      configs: ["tools.yaml", "action-policy.yaml"]
    }
  }),
];

export function defaultComplianceMapsFile(): ComplianceMapsFile {
  return {
    complianceMaps: {
      version: 1,
      mappings: builtInComplianceMappings
    }
  };
}

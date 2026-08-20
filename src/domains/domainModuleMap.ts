import type { Domain } from "./domainRegistry.js";

export interface ModuleDomainProfile {
  moduleId: string;
  moduleName: string;
  category: "shield" | "enforce" | "vault" | "watch" | "product";
  domains: {
    domain: Domain;
    relevance: "critical" | "high" | "medium" | "low";
    activationReason: string;
    regulatoryMapping?: string;
  }[];
}

type ModuleCategory = ModuleDomainProfile["category"];
type Relevance = ModuleDomainProfile["domains"][number]["relevance"];

type DomainOverride = Omit<ModuleDomainProfile["domains"][number], "domain">;

interface ModuleDefinition {
  moduleId: string;
  moduleName: string;
  category: ModuleCategory;
}

const DOMAINS: Domain[] = [
  "health",
  "wealth",
  "mobility",
  "education",
  "environment",
  "mobility",
  "governance",
  "technology",
  "wealth"
];

const SHIELD_MODULES: ModuleDefinition[] = [
  { moduleId: "S1", moduleName: "Static Analyzer", category: "shield" },
  { moduleId: "S2", moduleName: "Behavioral Sandbox", category: "shield" },
  { moduleId: "S3", moduleName: "Signing & Provenance", category: "shield" },
  { moduleId: "S4", moduleName: "SBOM Integrity", category: "shield" },
  { moduleId: "S5", moduleName: "Reputation Guard", category: "shield" },
  { moduleId: "S6", moduleName: "Manifest Validator", category: "shield" },
  { moduleId: "S7", moduleName: "Registry Trust", category: "shield" },
  { moduleId: "S8", moduleName: "Ingress Filter", category: "shield" },
  { moduleId: "S9", moduleName: "Content Sanitizer", category: "shield" },
  { moduleId: "S10", moduleName: "Injection Detector", category: "shield" },
  { moduleId: "S11", moduleName: "Attachment Detonation", category: "shield" },
  { moduleId: "S12", moduleName: "OAuth Scope Guard", category: "shield" },
  { moduleId: "S13", moduleName: "Download Quarantine", category: "shield" },
  { moduleId: "S14", moduleName: "Conversation Integrity", category: "shield" },
  { moduleId: "S15", moduleName: "Threat Intelligence", category: "shield" },
  { moduleId: "S16", moduleName: "UI Fingerprinting", category: "shield" }
];

const ENFORCE_MODULES: ModuleDefinition[] = [
  { moduleId: "E1", moduleName: "Policy Firewall", category: "enforce" },
  { moduleId: "E2", moduleName: "Exec Guard", category: "enforce" },
  { moduleId: "E3", moduleName: "Browser Guardrails", category: "enforce" },
  { moduleId: "E4", moduleName: "Egress Proxy", category: "enforce" },
  { moduleId: "E5", moduleName: "Circuit Breaker", category: "enforce" },
  { moduleId: "E6", moduleName: "Step-Up Auth", category: "enforce" },
  { moduleId: "E7", moduleName: "Sandbox Orchestrator", category: "enforce" },
  { moduleId: "E8", moduleName: "Session Firewall", category: "enforce" },
  { moduleId: "E9", moduleName: "Outbound Filter", category: "enforce" },
  { moduleId: "E10", moduleName: "Gateway Scanner", category: "enforce" },
  { moduleId: "E11", moduleName: "mDNS Controller", category: "enforce" },
  { moduleId: "E12", moduleName: "Reverse Proxy Guard", category: "enforce" },
  { moduleId: "E13", moduleName: "ATO Detection", category: "enforce" },
  { moduleId: "E14", moduleName: "Webhook Gateway", category: "enforce" },
  { moduleId: "E15", moduleName: "ABAC", category: "enforce" },
  { moduleId: "E16", moduleName: "Approval Anti-Phishing", category: "enforce" },
  { moduleId: "E17", moduleName: "Dry Run", category: "enforce" },
  { moduleId: "E18", moduleName: "Secret Blind", category: "enforce" },
  { moduleId: "E19", moduleName: "Two-Person Auth", category: "enforce" },
  { moduleId: "E20", moduleName: "Payee Guard", category: "enforce" },
  { moduleId: "E21", moduleName: "Taint Tracker", category: "enforce" },
  { moduleId: "E22", moduleName: "Schema Gate", category: "enforce" },
  { moduleId: "E23", moduleName: "Numeric Checker", category: "enforce" },
  { moduleId: "E24", moduleName: "Evidence Contract", category: "enforce" },
  { moduleId: "E25", moduleName: "Config Linter", category: "enforce" },
  { moduleId: "E26", moduleName: "Mode Switcher", category: "enforce" },
  { moduleId: "E27", moduleName: "Temporal Controls", category: "enforce" },
  { moduleId: "E28", moduleName: "Geo-Fence", category: "enforce" },
  { moduleId: "E29", moduleName: "Idempotency", category: "enforce" },
  { moduleId: "E30", moduleName: "Cross-Source Verifier", category: "enforce" },
  { moduleId: "E31", moduleName: "Clipboard Guard", category: "enforce" },
  { moduleId: "E32", moduleName: "Template Engine", category: "enforce" },
  { moduleId: "E33", moduleName: "Watchdog", category: "enforce" },
  { moduleId: "E34", moduleName: "Consensus", category: "enforce" },
  { moduleId: "E35", moduleName: "Model Switchboard", category: "enforce" }
];

const VAULT_MODULES: ModuleDefinition[] = [
  { moduleId: "V1", moduleName: "Secrets Broker", category: "vault" },
  { moduleId: "V2", moduleName: "DLP", category: "vault" },
  { moduleId: "V3", moduleName: "Honeytokens", category: "vault" },
  { moduleId: "V4", moduleName: "Trust-Boundary DLP", category: "vault" },
  { moduleId: "V5", moduleName: "Memory TTL", category: "vault" },
  { moduleId: "V6", moduleName: "DSAR Autopilot", category: "vault" },
  { moduleId: "V7", moduleName: "Data Residency", category: "vault" },
  { moduleId: "V8", moduleName: "Sovereignty Controls", category: "vault" },
  { moduleId: "V9", moduleName: "Invoice Fraud Guard", category: "vault" },
  { moduleId: "V10", moduleName: "Undo Layer", category: "vault" },
  { moduleId: "V11", moduleName: "Metadata Scrubber", category: "vault" },
  { moduleId: "V12", moduleName: "Data Classification", category: "vault" },
  { moduleId: "V13", moduleName: "Privacy Budget", category: "vault" },
  { moduleId: "V14", moduleName: "Key Rotation", category: "vault" }
];

const WATCH_MODULES: ModuleDefinition[] = [
  { moduleId: "W1", moduleName: "Receipts", category: "watch" },
  { moduleId: "W2", moduleName: "Assurance Runner", category: "watch" },
  { moduleId: "W3", moduleName: "Audit / SIEM Export", category: "watch" },
  { moduleId: "W4", moduleName: "Safety Testkit", category: "watch" },
  { moduleId: "W5", moduleName: "Equity Test Bus", category: "watch" },
  { moduleId: "W6", moduleName: "Host Hardening", category: "watch" },
  { moduleId: "W7", moduleName: "Explainability Packet", category: "watch" },
  { moduleId: "W8", moduleName: "Output Attestation", category: "watch" },
  { moduleId: "W9", moduleName: "Multi-Tenant Verifier", category: "watch" },
  { moduleId: "W10", moduleName: "Policy Pack Monitor", category: "watch" }
];

const PRODUCT_MODULE_KEYS: string[] = [
  "abTesting",
  "approvalWorkflow",
  "asyncCallback",
  "autonomyDial",
  "clarification",
  "collaboration",
  "compensation",
  "confidence",
  "contextOptimizer",
  "contextPack",
  "conversationState",
  "conversationSummarizer",
  "costLatencyRouter",
  "dataQuality",
  "dependencyGraph",
  "determinism",
  "docsIngestion",
  "documentAssembler",
  "errorTranslator",
  "escalation",
  "eventRouter",
  "extractor",
  "failureClustering",
  "featureCatalog",
  "fixGenerator",
  "glossary",
  "goalTracker",
  "improvement",
  "instructionFormatter",
  "kbBuilder",
  "knowledgeGraph",
  "longTermMemory",
  "loopDetector",
  "memoryConsolidation",
  "metering",
  "onboardingWizard",
  "outcomePricing",
  "outputCorrector",
  "outputDiff",
  "paramAutofiller",
  "persistence",
  "persona",
  "proactiveReminders",
  "promptModules",
  "reasoningCoach",
  "replayDebugger",
  "responseValidator",
  "retentionAutopilot",
  "retryEngine",
  "rolloutManager",
  "scaffolding",
  "scratchpad",
  "sopCompiler",
  "structuredOutput",
  "syncConnector",
  "taskSpec",
  "taskSplitter",
  "toolChainBuilder",
  "toolContract",
  "toolCostEstimator",
  "toolDiscovery",
  "toolFallback",
  "toolParallelizer",
  "toolRateLimiter",
  "toolReliability",
  "toolSemanticDocs",
  "versionControl",
  "whiteLabel",
  "workflowTemplates",
  "agentPersonaSafety",
  "crossDomainPolicyRouter",
  "domainRiskTelemetry",
  "governanceWorkflowStudio",
  "humanReviewQueue",
  "incidentTimelineBuilder",
  "knowledgeFreshnessTracker",
  "latencyBudgetPlanner",
  "marketAnomalyDetector",
  "modelDriftForecaster",
  "portfolioSuitabilityEngine",
  "procurementComplianceKit",
  "regulatoryCitationResolver",
  "remediationPlanner",
  "safetyCaseAssembler",
  "transparencyDashboard",
  "zeroTrustSessionBroker"
];

function humanizeModuleName(raw: string): string {
  const withSpaces = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

// Count guard: keep in step with src/product. Four fabricating modules
// (devSandbox, jobs, planGenerator, workflowEngine) were removed in G1-15.
if (PRODUCT_MODULE_KEYS.length !== 86) {
  throw new Error(`Expected 86 product modules, received ${PRODUCT_MODULE_KEYS.length}.`);
}

const PRODUCT_MODULES: ModuleDefinition[] = PRODUCT_MODULE_KEYS.map((key, index) => ({
  moduleId: `P${index + 1}`,
  moduleName: humanizeModuleName(key),
  category: "product"
}));

const MODULE_CATALOG: ModuleDefinition[] = [
  ...SHIELD_MODULES,
  ...ENFORCE_MODULES,
  ...VAULT_MODULES,
  ...WATCH_MODULES,
  ...PRODUCT_MODULES
];

const REGULATORY_HINTS: Record<Domain, string> = {
  health: "HIPAA / FDA 510(k) / IEC 62304",
  education: "FERPA / COPPA",
  environment: "NERC CIP / EU AI Act",
  mobility: "ISO 26262 / IEC 61508 / UNECE WP.29",
  governance: "NIST AI RMF / FedRAMP",
  technology: "GDPR / SOC 2 / ISO 27001",
  wealth: "SR 11-7 / MiFID II / FINRA / BSA-AML"
};

const DOMAIN_FOCUS: Record<Domain, string> = {
  health: "clinical safety, PHI containment, and clinician override",
  education: "student privacy, minor safety, and educator accountability",
  environment: "critical infrastructure resilience and physical safety controls",
  mobility: "functional safety, SIL-grade determinism, OTA integrity, and operator override",
  governance: "public accountability, explainability, and non-discrimination",
  technology: "privacy-by-design, incident response, and secure operations",
  wealth: "model-risk controls, AML safeguards, fiduciary suitability, and market-abuse prevention"
};

function allDomainsOverride(
  relevance: Relevance,
  activationReason: string,
  regulatoryMapping?: string
): Partial<Record<Domain, DomainOverride>> {
  return Object.fromEntries(
    DOMAINS.map((domain) => [
      domain,
      {
        relevance,
        activationReason,
        regulatoryMapping
      }
    ])
  ) as Partial<Record<Domain, DomainOverride>>;
}

const MODULE_OVERRIDES: Record<string, Partial<Record<Domain, DomainOverride>>> = {
  S10: allDomainsOverride(
    "critical",
    "Injection defense is mandatory to prevent instruction hijack across all regulated domains.",
    "OWASP LLM01"
  ),
  E23: {
    wealth: {
      relevance: "critical",
      activationReason: "Suitability and fiduciary recommendations require strict numeric correctness and explainability.",
      regulatoryMapping: "MiFID II Art.25"
    },
    health: {
      relevance: "high",
      activationReason: "Clinical dosage and threshold decisions require bounded numeric checks.",
      regulatoryMapping: "FDA 510(k)"
    }
  },
  V4: {
    health: {
      relevance: "critical",
      activationReason: "DLP at trust boundaries is required to prevent PHI leakage.",
      regulatoryMapping: "HIPAA §164.312"
    },
    education: {
      relevance: "critical",
      activationReason: "FERPA records must remain within approved trust boundaries.",
      regulatoryMapping: "FERPA §99.30"
    },
    wealth: {
      relevance: "critical",
      activationReason: "Client financial records require strict leakage prevention at retrieval/output boundaries.",
      regulatoryMapping: "GDPR Art.20"
    },
    governance: {
      relevance: "high",
      activationReason: "Public-sector records and citizen data require boundary-level DLP enforcement.",
      regulatoryMapping: "FISMA"
    },
    technology: {
      relevance: "high",
      activationReason: "DLP controls enforce privacy-by-design in general-purpose AI services.",
      regulatoryMapping: "GDPR Art.25"
    }
  },
  E19: {
    health: {
      relevance: "critical",
      activationReason: "Prescription and clinical action pathways require dual authorization.",
      regulatoryMapping: "FDA AI/ML Action Plan"
    },
    governance: {
      relevance: "critical",
      activationReason: "Policy-impacting citizen decisions require accountable dual control.",
      regulatoryMapping: "OMB M-24-10"
    },
    environment: {
      relevance: "critical",
      activationReason: "Physical infrastructure changes require multi-layer human approval.",
      regulatoryMapping: "NERC CIP-005"
    },
    wealth: {
      relevance: "critical",
      activationReason: "High-value transactions and automated trade actions require dual authorization and BSA/AML compliance.",
      regulatoryMapping: "BSA/AML; MiFID II Art.17"
    }
  },
  E20: {
    wealth: {
      relevance: "critical",
      activationReason: "Payee and account controls reduce front-running and fraud risk.",
      regulatoryMapping: "SEC Rule 10b-5"
    },
    governance: {
      relevance: "high",
      activationReason: "Government disbursement workflows require destination controls and evidence.",
      regulatoryMapping: "FISMA"
    }
  },
  V8: {
    wealth: {
      relevance: "critical",
      activationReason: "Client portfolios and transaction history require residency controls.",
      regulatoryMapping: "GDPR"
    },
    governance: {
      relevance: "high",
      activationReason: "Public-sector records must align to jurisdictional sovereignty requirements.",
      regulatoryMapping: "FedRAMP"
    },
    technology: {
      relevance: "high",
      activationReason: "General AI services need regional data handling policies and enforcement.",
      regulatoryMapping: "GDPR"
    }
  },
  S15: {
    wealth: {
      relevance: "critical",
      activationReason: "Market manipulation and front-running patterns require live threat intel feeds.",
      regulatoryMapping: "MAR (EU) 596/2014"
    }
  },
  E2: {
    mobility: {
      relevance: "critical",
      activationReason: "Vehicle control paths require strict command execution boundaries.",
      regulatoryMapping: "ISO 26262"
    },
    environment: {
      relevance: "high",
      activationReason: "Critical infrastructure interfaces require command-level execution controls.",
      regulatoryMapping: "NERC CIP-005"
    }
  },
  E5: {
    environment: {
      relevance: "critical",
      activationReason: "Circuit breakers are required to prevent cascading infrastructure failures.",
      regulatoryMapping: "NIST CSF PR.PT-4"
    },
    mobility: {
      relevance: "critical",
      activationReason: "Minimal-risk fallback states require deterministic circuit-break behavior.",
      regulatoryMapping: "ISO 26262-4"
    },
    wealth: {
      relevance: "critical",
      activationReason: "Automated trading paths require kill-switch and breaker controls.",
      regulatoryMapping: "CFTC Rule 1.73"
    }
  },
  E28: {
    environment: {
      relevance: "critical",
      activationReason: "Geofencing restricts infrastructure actions to approved operating zones.",
      regulatoryMapping: "NERC CIP"
    }
  },
  S2: {
    environment: {
      relevance: "critical",
      activationReason: "Behavioral sandboxing isolates physical-action pathways before execution.",
      regulatoryMapping: "EU AI Act Annex III"
    }
  },
  E17: {
    mobility: {
      relevance: "high",
      activationReason: "Dry-run safety validation is required before OTA rollout to fleet.",
      regulatoryMapping: "UNECE R156"
    }
  },
  S3: {
    mobility: {
      relevance: "high",
      activationReason: "Signed OTA artifacts are mandatory for transport cybersecurity governance.",
      regulatoryMapping: "UNECE R155"
    }
  },
  W4: {
    mobility: {
      relevance: "critical",
      activationReason: "Regression and safety testing must verify fail-safe degradation and override behavior.",
      regulatoryMapping: "ISO 21448"
    },
  },
  W3: {
    health: {
      relevance: "critical",
      activationReason: "Clinical decisions require full audit trails and causality logging.",
      regulatoryMapping: "FDA MDR §803"
    },
    wealth: {
      relevance: "critical",
      activationReason: "Auditable financial decision records are required for examinations and model-risk review.",
      regulatoryMapping: "SEC Rule 17a-4"
    },
    governance: {
      relevance: "critical",
      activationReason: "Citizen-impacting decisions must be documented, reviewable, and contestable.",
      regulatoryMapping: "EU AI Act Art.68"
    },
    environment: {
      relevance: "high",
      activationReason: "Physical action audit trails are required to reconstruct infrastructure causal chains.",
      regulatoryMapping: "NERC CIP-010"
    }
  },
  W5: {
    education: {
      relevance: "critical",
      activationReason: "Demographic equity testing is required for bias-aware educational outcomes.",
      regulatoryMapping: "EU AI Act Art.10"
    },
    governance: {
      relevance: "high",
      activationReason: "Disparate impact monitoring supports public-sector equity obligations.",
      regulatoryMapping: "Executive Order 13985"
    }
  },
  W6: {
    environment: {
      relevance: "critical",
      activationReason: "Host hardening is mandatory for infrastructure-connected deployments.",
      regulatoryMapping: "IEC 62443"
    }
  },
  E22: {
    education: {
      relevance: "high",
      activationReason: "Schema-gated outputs reduce grading/assessment integrity failures.",
      regulatoryMapping: "FERPA"
    }
  },
  S9: {
    education: {
      relevance: "high",
      activationReason: "Sanitization prevents unsafe and policy-violating educational output.",
      regulatoryMapping: "COPPA §312.3"
    }
  },
  E15: {
    governance: {
      relevance: "critical",
      activationReason: "ABAC enforces accountable access boundaries for public data and decisions.",
      regulatoryMapping: "NIST AI RMF"
    },
    education: {
      relevance: "high",
      activationReason: "Role-based educator override and auditability depend on strict ABAC controls.",
      regulatoryMapping: "EU AI Act Art.14"
    },
    health: {
      relevance: "high",
      activationReason: "Clinical role separation requires robust attribute-based access policies.",
      regulatoryMapping: "HIPAA §164.312"
    }
  }
};

function defaultRelevance(category: ModuleCategory, domain: Domain): Relevance {
  if (domain === "technology") {
    return category === "product" ? "high" : "critical";
  }

  if (category === "product") {
    if (domain === "governance" || domain === "wealth") return "high";
    return "medium";
  }

  if (category === "watch") {
    if (domain === "governance" || domain === "mobility" || domain === "environment") return "high";
    return "medium";
  }

  if (category === "vault") {
    if (domain === "health" || domain === "education" || domain === "wealth") return "high";
    return "medium";
  }

  if (category === "shield" || category === "enforce") {
    if (domain === "mobility" || domain === "environment") return "high";
    return "medium";
  }

  return "low";
}

function defaultActivationReason(moduleName: string, domain: Domain): string {
  return `${moduleName} supports ${DOMAIN_FOCUS[domain]} controls in this domain profile.`;
}

function defaultRegulatoryMapping(relevance: Relevance, domain: Domain): string | undefined {
  if (relevance === "critical" || relevance === "high") {
    return REGULATORY_HINTS[domain];
  }
  return undefined;
}

function moduleIdSortValue(moduleId: string): number {
  const match = moduleId.match(/^([A-Z]+)(\d+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const prefix = match[1];
  const number = Number(match[2]);
  const prefixWeight = prefix === "S" ? 1000 : prefix === "E" ? 2000 : prefix === "V" ? 3000 : prefix === "W" ? 4000 : prefix === "P" ? 5000 : 9000;
  return prefixWeight + number;
}

function buildDomainMapping(module: ModuleDefinition, domain: Domain): ModuleDomainProfile["domains"][number] {
  const override = MODULE_OVERRIDES[module.moduleId]?.[domain];
  if (override) {
    return {
      domain,
      relevance: override.relevance,
      activationReason: override.activationReason,
      regulatoryMapping: override.regulatoryMapping
    };
  }

  const relevance = defaultRelevance(module.category, domain);
  return {
    domain,
    relevance,
    activationReason: defaultActivationReason(module.moduleName, domain),
    regulatoryMapping: defaultRegulatoryMapping(relevance, domain)
  };
}

export const DOMAIN_MODULE_MAP: ModuleDomainProfile[] = MODULE_CATALOG
  .map((module) => ({
    moduleId: module.moduleId,
    moduleName: module.moduleName,
    category: module.category,
    domains: DOMAINS.map((domain) => buildDomainMapping(module, domain))
  }))
  .sort((a, b) => moduleIdSortValue(a.moduleId) - moduleIdSortValue(b.moduleId));

export const TOTAL_MODULE_COUNT = DOMAIN_MODULE_MAP.length;

export interface DomainModuleActivation {
  moduleId: string;
  moduleName: string;
  category: ModuleCategory;
  relevance: Relevance;
  activationReason: string;
  regulatoryMapping?: string;
}

const RELEVANCE_ORDER: Record<Relevance, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function getDomainModuleActivations(domain: Domain): DomainModuleActivation[] {
  return DOMAIN_MODULE_MAP
    .map((module) => {
      const mapping = module.domains.find((entry) => entry.domain === domain);
      if (!mapping) {
        throw new Error(`Missing domain mapping for ${module.moduleId} in domain ${domain}`);
      }
      return {
        moduleId: module.moduleId,
        moduleName: module.moduleName,
        category: module.category,
        relevance: mapping.relevance,
        activationReason: mapping.activationReason,
        regulatoryMapping: mapping.regulatoryMapping
      };
    })
    .sort((a, b) => {
      const relevanceDelta = RELEVANCE_ORDER[a.relevance] - RELEVANCE_ORDER[b.relevance];
      if (relevanceDelta !== 0) return relevanceDelta;
      return moduleIdSortValue(a.moduleId) - moduleIdSortValue(b.moduleId);
    });
}

export function findModuleProfile(moduleId: string): ModuleDomainProfile | undefined {
  return DOMAIN_MODULE_MAP.find((module) => module.moduleId === moduleId);
}

export function listModuleDomainProfiles(): ModuleDomainProfile[] {
  return DOMAIN_MODULE_MAP.map((module) => ({
    ...module,
    domains: module.domains.map((entry) => ({ ...entry }))
  }));
}

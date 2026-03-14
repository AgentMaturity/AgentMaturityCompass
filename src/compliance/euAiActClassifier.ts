/**
 * EU AI Act Risk Classifier
 *
 * Classifies AI agents into EU AI Act risk tiers based on Article 6 criteria:
 * UNACCEPTABLE | HIGH | LIMITED | MINIMAL
 */

export type EuAiActRiskTier = "UNACCEPTABLE" | "HIGH" | "LIMITED" | "MINIMAL";

export interface AgentCapabilities {
  /** Biometric identification or categorisation */
  biometricIdentification?: boolean;
  /** Critical infrastructure (energy, water, transport, finance) */
  criticalInfrastructure?: boolean;
  /** Education or vocational training (access/assessment) */
  education?: boolean;
  /** Employment decisions (hiring, promotion, firing) */
  employment?: boolean;
  /** Essential private/public services (credit, benefits, emergency) */
  essentialServices?: boolean;
  /** Law enforcement applications */
  lawEnforcement?: boolean;
  /** Migration and border control */
  migrationBorderControl?: boolean;
  /** Administration of justice / democratic processes */
  justiceAdministration?: boolean;
  /** Real-time remote biometric identification in public spaces */
  realtimeBiometricPublicSpaces?: boolean;
  /** Social scoring by public authorities */
  socialScoring?: boolean;
  /** Subliminal manipulation of behaviour */
  subliminalManipulation?: boolean;
  /** Exploitation of vulnerabilities (age, disability, social situation) */
  exploitsVulnerabilities?: boolean;
  /** Emotion recognition in workplace/educational setting */
  emotionRecognition?: boolean;
  /** Chatbot / conversational agent (must disclose AI nature) */
  chatbot?: boolean;
  /** Generates synthetic text, images, audio, video */
  syntheticContentGeneration?: boolean;
  /** AI system intended to interact with humans */
  humanInteraction?: boolean;
  /** Safety component of regulated product (machinery, medical device, vehicle, etc.) */
  safetyComponent?: boolean;
  /** General purpose / none of the above */
  generalPurpose?: boolean;
}

export interface EuAiActFinding {
  article: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface EuAiActRemediationItem {
  priority: "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM";
  action: string;
  article: string;
}

export interface EuAiActClassification {
  riskTier: EuAiActRiskTier;
  articles: string[];
  findings: EuAiActFinding[];
  remediation: EuAiActRemediationItem[];
  summary: string;
  classifiedAt: number;
}

export interface EuAiActRoadmapStep {
  phase: string;
  step: number;
  title: string;
  description: string;
  articles: string[];
  estimatedWeeks: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
}

export interface EuAiActComplianceRoadmap {
  framework: "EU_AI_ACT";
  riskTier: EuAiActRiskTier;
  totalSteps: number;
  estimatedTotalWeeks: number;
  phases: EuAiActRoadmapStep[];
  generatedAt: number;
}

/**
 * Classify an AI agent into EU AI Act risk tiers.
 */
export function classifyEuAiActRisk(capabilities: AgentCapabilities): EuAiActClassification {
  const findings: EuAiActFinding[] = [];
  const articles = new Set<string>();
  let riskTier: EuAiActRiskTier = "MINIMAL";

  // ── UNACCEPTABLE RISK (Art. 5) ─────────────────────────────────────────
  const unacceptableFlags: Array<{ flag: keyof AgentCapabilities; article: string; title: string; description: string }> = [
    {
      flag: "socialScoring",
      article: "Art. 5(1)(c)",
      title: "Social scoring by public authorities",
      description: "Systems that evaluate or classify persons based on social behaviour are prohibited."
    },
    {
      flag: "subliminalManipulation",
      article: "Art. 5(1)(a)",
      title: "Subliminal manipulation",
      description: "Systems that manipulate persons through subliminal techniques are prohibited."
    },
    {
      flag: "exploitsVulnerabilities",
      article: "Art. 5(1)(b)",
      title: "Exploitation of vulnerabilities",
      description: "Systems that exploit vulnerabilities of specific groups (age, disability) are prohibited."
    },
    {
      flag: "realtimeBiometricPublicSpaces",
      article: "Art. 5(1)(d)",
      title: "Real-time remote biometric identification in public spaces",
      description: "Real-time remote biometric identification in publicly accessible spaces by law enforcement is prohibited (with narrow exceptions)."
    }
  ];

  for (const { flag, article, title, description } of unacceptableFlags) {
    if (capabilities[flag]) {
      riskTier = "UNACCEPTABLE";
      articles.add(article);
      findings.push({ article, title, description, severity: "CRITICAL" });
    }
  }

  if (riskTier === "UNACCEPTABLE") {
    return buildResult("UNACCEPTABLE", articles, findings);
  }

  // ── HIGH RISK (Art. 6) ────────────────────────────────────────────────
  const highRiskFlags: Array<{ flag: keyof AgentCapabilities; article: string; title: string; description: string }> = [
    {
      flag: "biometricIdentification",
      article: "Art. 6(2) + Annex III(1)",
      title: "Biometric identification and categorisation",
      description: "AI for remote biometric identification of natural persons is high-risk."
    },
    {
      flag: "criticalInfrastructure",
      article: "Art. 6(2) + Annex III(2)",
      title: "Critical infrastructure management",
      description: "AI used as safety components in critical infrastructure is high-risk."
    },
    {
      flag: "education",
      article: "Art. 6(2) + Annex III(3)",
      title: "Education and vocational training",
      description: "AI used to determine access/assess students in education is high-risk."
    },
    {
      flag: "employment",
      article: "Art. 6(2) + Annex III(4)",
      title: "Employment and worker management",
      description: "AI for recruitment, promotion, or termination decisions is high-risk."
    },
    {
      flag: "essentialServices",
      article: "Art. 6(2) + Annex III(5)",
      title: "Access to essential private/public services",
      description: "AI for creditworthiness, benefit eligibility, or emergency dispatch is high-risk."
    },
    {
      flag: "lawEnforcement",
      article: "Art. 6(2) + Annex III(6)",
      title: "Law enforcement",
      description: "AI assisting law enforcement in assessment, profiling, or evidence evaluation is high-risk."
    },
    {
      flag: "migrationBorderControl",
      article: "Art. 6(2) + Annex III(7)",
      title: "Migration, asylum and border control",
      description: "AI used in migration risk assessment or border checks is high-risk."
    },
    {
      flag: "justiceAdministration",
      article: "Art. 6(2) + Annex III(8)",
      title: "Administration of justice and democratic processes",
      description: "AI assisting judicial decisions or influencing democratic processes is high-risk."
    },
    {
      flag: "safetyComponent",
      article: "Art. 6(1)",
      title: "Safety component of regulated product",
      description: "AI that is a safety component of a product covered by Union harmonisation legislation is high-risk."
    }
  ];

  for (const { flag, article, title, description } of highRiskFlags) {
    if (capabilities[flag]) {
      if (riskTier !== "HIGH") riskTier = "HIGH";
      articles.add(article);
      findings.push({ article, title, description, severity: "HIGH" });
    }
  }

  if (riskTier === "HIGH") {
    return buildResult("HIGH", articles, findings);
  }

  // ── LIMITED RISK (Art. 50) ────────────────────────────────────────────
  const limitedRiskFlags: Array<{ flag: keyof AgentCapabilities; article: string; title: string; description: string }> = [
    {
      flag: "chatbot",
      article: "Art. 50(1)",
      title: "Chatbot transparency obligation",
      description: "AI systems intended to interact with humans must disclose they are AI, unless obvious from context."
    },
    {
      flag: "syntheticContentGeneration",
      article: "Art. 50(2)",
      title: "Synthetic content labelling",
      description: "AI-generated synthetic audio, image, video, or text content must be labelled as artificially generated."
    },
    {
      flag: "emotionRecognition",
      article: "Art. 50(3)",
      title: "Emotion recognition disclosure",
      description: "Emotion recognition systems must inform persons being processed."
    },
    {
      flag: "humanInteraction",
      article: "Art. 50(4)",
      title: "Deep-fake disclosure",
      description: "AI generating deep-fakes must label content as artificially created or manipulated."
    }
  ];

  for (const { flag, article, title, description } of limitedRiskFlags) {
    if (capabilities[flag]) {
      if (riskTier !== "LIMITED") riskTier = "LIMITED";
      articles.add(article);
      findings.push({ article, title, description, severity: "MEDIUM" });
    }
  }

  return buildResult(riskTier, articles, findings);
}

function buildResult(
  tier: EuAiActRiskTier,
  articles: Set<string>,
  findings: EuAiActFinding[]
): EuAiActClassification {
  const remediation = buildRemediation(tier, findings);
  const summary = buildSummary(tier, findings);

  return {
    riskTier: tier,
    articles: Array.from(articles),
    findings,
    remediation,
    summary,
    classifiedAt: Date.now()
  };
}

function buildRemediation(tier: EuAiActRiskTier, findings: EuAiActFinding[]): EuAiActRemediationItem[] {
  const items: EuAiActRemediationItem[] = [];

  if (tier === "UNACCEPTABLE") {
    items.push({
      priority: "IMMEDIATE",
      action: "Cease deployment immediately — system falls into prohibited AI practices under Art. 5.",
      article: "Art. 5"
    });
    items.push({
      priority: "IMMEDIATE",
      action: "Conduct legal review with qualified EU AI Act counsel before any further use.",
      article: "Art. 5"
    });
    return items;
  }

  if (tier === "HIGH") {
    items.push({
      priority: "IMMEDIATE",
      action: "Register the AI system in the EU AI Act database (Art. 71) before deployment.",
      article: "Art. 71"
    });
    items.push({
      priority: "IMMEDIATE",
      action: "Implement risk management system (Art. 9) with documented risk assessment.",
      article: "Art. 9"
    });
    items.push({
      priority: "SHORT_TERM",
      action: "Establish data governance practices (Art. 10) — training data quality, bias checks.",
      article: "Art. 10"
    });
    items.push({
      priority: "SHORT_TERM",
      action: "Create technical documentation (Art. 11) and instructions for use (Art. 13).",
      article: "Art. 11, Art. 13"
    });
    items.push({
      priority: "SHORT_TERM",
      action: "Enable logging and record-keeping for auditability (Art. 12).",
      article: "Art. 12"
    });
    items.push({
      priority: "SHORT_TERM",
      action: "Implement human oversight mechanisms (Art. 14) — operator controls and override capability.",
      article: "Art. 14"
    });
    items.push({
      priority: "SHORT_TERM",
      action: "Achieve accuracy, robustness, and cybersecurity standards (Art. 15).",
      article: "Art. 15"
    });
    items.push({
      priority: "MEDIUM_TERM",
      action: "Perform conformity assessment (Art. 43) — self-assessment or third-party audit.",
      article: "Art. 43"
    });
    items.push({
      priority: "MEDIUM_TERM",
      action: "Affix CE marking and issue EU Declaration of Conformity (Art. 47, Art. 48).",
      article: "Art. 47, Art. 48"
    });
    items.push({
      priority: "MEDIUM_TERM",
      action: "Set up post-market monitoring system (Art. 72) with incident reporting.",
      article: "Art. 72"
    });
  }

  if (tier === "LIMITED") {
    for (const finding of findings) {
      if (finding.article.startsWith("Art. 50")) {
        items.push({
          priority: "SHORT_TERM",
          action: `Implement transparency notification required by ${finding.article}: ${finding.title}.`,
          article: finding.article
        });
      }
    }
    items.push({
      priority: "MEDIUM_TERM",
      action: "Review voluntary Code of Conduct for GPAI models (Art. 56) if applicable.",
      article: "Art. 56"
    });
  }

  if (tier === "MINIMAL") {
    items.push({
      priority: "MEDIUM_TERM",
      action: "Maintain voluntary codes of conduct (Art. 95) and document AI system purpose.",
      article: "Art. 95"
    });
  }

  return items;
}

function buildSummary(tier: EuAiActRiskTier, findings: EuAiActFinding[]): string {
  const count = findings.length;
  switch (tier) {
    case "UNACCEPTABLE":
      return `⛔ UNACCEPTABLE RISK: This agent uses ${count} prohibited AI practice(s) under Art. 5 of the EU AI Act. Deployment is illegal in the EU without fundamental redesign.`;
    case "HIGH":
      return `🔴 HIGH RISK: This agent triggers ${count} high-risk classification(s) under Art. 6 + Annex III. Strict conformity obligations apply before EU deployment.`;
    case "LIMITED":
      return `🟡 LIMITED RISK: This agent has ${count} transparency obligation(s) under Art. 50. Disclosure notices required but no conformity assessment needed.`;
    case "MINIMAL":
      return `🟢 MINIMAL RISK: This agent presents minimal EU AI Act risk. No mandatory requirements, but voluntary codes of conduct are recommended.`;
  }
}

/**
 * Generate a step-by-step EU AI Act compliance roadmap.
 */
export function generateEuAiActRoadmap(classification: EuAiActClassification): EuAiActComplianceRoadmap {
  const { riskTier } = classification;
  const phases: EuAiActRoadmapStep[] = [];

  if (riskTier === "UNACCEPTABLE") {
    phases.push({
      phase: "Emergency Response",
      step: 1,
      title: "Halt all EU deployment",
      description: "Immediately suspend deployment in EU jurisdictions. Document the halt decision with timestamp and responsible parties.",
      articles: ["Art. 5"],
      estimatedWeeks: 0,
      priority: "CRITICAL"
    });
    phases.push({
      phase: "Emergency Response",
      step: 2,
      title: "Legal and compliance review",
      description: "Engage EU AI Act legal counsel for full assessment. Determine if any narrow exceptions apply (Art. 5(2)-(7)).",
      articles: ["Art. 5"],
      estimatedWeeks: 2,
      priority: "CRITICAL"
    });
    phases.push({
      phase: "Redesign",
      step: 3,
      title: "Architectural redesign to remove prohibited features",
      description: "Eliminate or fundamentally redesign features that trigger Art. 5 prohibitions. Document all changes.",
      articles: ["Art. 5"],
      estimatedWeeks: 12,
      priority: "CRITICAL"
    });
  } else if (riskTier === "HIGH") {
    phases.push({
      phase: "Phase 1 — Foundation (Weeks 1-4)",
      step: 1,
      title: "Risk Management System",
      description: "Establish iterative risk management process per Art. 9. Identify, analyse, and evaluate residual risks.",
      articles: ["Art. 9"],
      estimatedWeeks: 4,
      priority: "CRITICAL"
    });
    phases.push({
      phase: "Phase 1 — Foundation (Weeks 1-4)",
      step: 2,
      title: "Data Governance",
      description: "Implement data quality processes, bias detection, and documentation per Art. 10. Validate training, validation, and test datasets.",
      articles: ["Art. 10"],
      estimatedWeeks: 4,
      priority: "CRITICAL"
    });
    phases.push({
      phase: "Phase 2 — Transparency & Logging (Weeks 4-8)",
      step: 3,
      title: "Technical Documentation",
      description: "Create and maintain technical documentation per Art. 11 (Annex IV format). Include system description, capabilities, limitations, intended purpose.",
      articles: ["Art. 11"],
      estimatedWeeks: 3,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 2 — Transparency & Logging (Weeks 4-8)",
      step: 4,
      title: "Logging & Record-Keeping",
      description: "Implement automatic event logging per Art. 12. Ensure logs capture inputs, outputs, and key decisions for auditability.",
      articles: ["Art. 12"],
      estimatedWeeks: 2,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 2 — Transparency & Logging (Weeks 4-8)",
      step: 5,
      title: "Transparency & Instructions for Use",
      description: "Produce clear instructions for use per Art. 13 including intended purpose, performance, known limitations, and human oversight guidance.",
      articles: ["Art. 13"],
      estimatedWeeks: 2,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 3 — Human Oversight (Weeks 8-12)",
      step: 6,
      title: "Human Oversight Mechanisms",
      description: "Implement human oversight by design per Art. 14. Ensure operators can understand, monitor, override, and halt the system.",
      articles: ["Art. 14"],
      estimatedWeeks: 4,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 3 — Human Oversight (Weeks 8-12)",
      step: 7,
      title: "Accuracy, Robustness & Cybersecurity",
      description: "Achieve appropriate accuracy levels per Art. 15. Implement resilience against errors and adversarial attacks. Document performance metrics.",
      articles: ["Art. 15"],
      estimatedWeeks: 4,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 4 — Conformity & Registration (Weeks 12-16)",
      step: 8,
      title: "Conformity Assessment",
      description: "Conduct self-assessment or third-party conformity assessment per Art. 43. Document assessment methodology and results.",
      articles: ["Art. 43"],
      estimatedWeeks: 4,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 4 — Conformity & Registration (Weeks 12-16)",
      step: 9,
      title: "EU Database Registration",
      description: "Register the AI system in the EU AI Act database per Art. 71 before deployment or placing on market.",
      articles: ["Art. 71"],
      estimatedWeeks: 1,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 4 — Conformity & Registration (Weeks 12-16)",
      step: 10,
      title: "CE Marking & Declaration of Conformity",
      description: "Affix CE marking and issue EU Declaration of Conformity per Art. 47, Art. 48. Retain documentation for 10 years.",
      articles: ["Art. 47", "Art. 48"],
      estimatedWeeks: 1,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 5 — Post-Market (Ongoing)",
      step: 11,
      title: "Post-Market Monitoring",
      description: "Establish post-market monitoring plan per Art. 72. Define KPIs, monitoring frequency, and corrective action processes.",
      articles: ["Art. 72"],
      estimatedWeeks: 2,
      priority: "MEDIUM"
    });
    phases.push({
      phase: "Phase 5 — Post-Market (Ongoing)",
      step: 12,
      title: "Serious Incident Reporting",
      description: "Implement incident reporting procedures per Art. 73. Ensure national market surveillance authorities are notified of serious incidents within required timeframes.",
      articles: ["Art. 73"],
      estimatedWeeks: 2,
      priority: "MEDIUM"
    });
  } else if (riskTier === "LIMITED") {
    phases.push({
      phase: "Phase 1 — Transparency (Weeks 1-2)",
      step: 1,
      title: "AI Disclosure Notices",
      description: "Implement clear, prominent disclosure that users are interacting with an AI system per Art. 50(1). This must be done at the start of interaction.",
      articles: ["Art. 50(1)"],
      estimatedWeeks: 2,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 1 — Transparency (Weeks 1-2)",
      step: 2,
      title: "Synthetic Content Labelling",
      description: "Add mandatory AI-generated content labels per Art. 50(2) if the system generates audio, images, video, or text.",
      articles: ["Art. 50(2)"],
      estimatedWeeks: 2,
      priority: "HIGH"
    });
    phases.push({
      phase: "Phase 2 — Governance (Weeks 2-4)",
      step: 3,
      title: "Voluntary Code of Conduct",
      description: "Consider adhering to voluntary codes of conduct per Art. 95 to demonstrate responsible AI practices.",
      articles: ["Art. 95"],
      estimatedWeeks: 2,
      priority: "MEDIUM"
    });
  } else {
    phases.push({
      phase: "Phase 1 — Baseline (Weeks 1-2)",
      step: 1,
      title: "Purpose Documentation",
      description: "Document AI system purpose, capabilities, and limitations. Establish basic governance and usage policies.",
      articles: ["Art. 95"],
      estimatedWeeks: 2,
      priority: "MEDIUM"
    });
    phases.push({
      phase: "Phase 1 — Baseline (Weeks 1-2)",
      step: 2,
      title: "Voluntary Code of Conduct",
      description: "Adopt voluntary codes of conduct per Art. 95 to demonstrate responsible AI commitment and prepare for future regulatory changes.",
      articles: ["Art. 95"],
      estimatedWeeks: 2,
      priority: "MEDIUM"
    });
  }

  const totalWeeks = phases.reduce((sum, p) => sum + p.estimatedWeeks, 0);

  return {
    framework: "EU_AI_ACT",
    riskTier,
    totalSteps: phases.length,
    estimatedTotalWeeks: totalWeeks,
    phases,
    generatedAt: Date.now()
  };
}

/**
 * EU AI Act Risk Classifier
 *
 * Classifies AI agents into EU AI Act risk tiers based on Article 6 criteria:
 * UNACCEPTABLE | HIGH | LIMITED | MINIMAL
 *
 * Article references follow Regulation (EU) 2024/1689 as amended by
 * Regulation (EU) 2026/1744 (Digital Omnibus on AI).
 */

import { EU_AI_ACT_TIMELINE } from "./euAiActTimeline.js";
import { euAiActDuties, type EuAiActDuty } from "./euAiActDuties.js";

export { EU_AI_ACT_TIMELINE };
export type { EuAiActDuty };

export interface EuAiActApplicationDate {
  basis: "Art. 5" | "Art. 5(1)(ba)-(bb)" | "Art. 6(2) + Annex III" | "Art. 6(1) + Annex I" | "Art. 50";
  /** YYYY-MM-DD from EU_AI_ACT_TIMELINE. */
  appliesFrom: string;
}

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
  /** Social scoring (any actor; Art. 5(1)(c)) */
  socialScoring?: boolean;
  /** Subliminal manipulation of behaviour */
  subliminalManipulation?: boolean;
  /** Exploitation of vulnerabilities (age, disability, social situation) */
  exploitsVulnerabilities?: boolean;
  /** Predicting a person's risk of committing a crime based solely on profiling or personality traits (Art. 5(1)(d)) */
  crimePredictionProfiling?: boolean;
  /** Building or expanding facial recognition databases by untargeted scraping of faces from the internet or CCTV (Art. 5(1)(e)) */
  facialImageScraping?: boolean;
  /** Emotion recognition (inferring emotions) in the workplace or in education institutions; prohibited by Art. 5(1)(f) */
  emotionRecognition?: boolean;
  /** Biometric categorisation that infers race, political opinions, union membership, religion, sex life or orientation (Art. 5(1)(g)) */
  sensitiveBiometricCategorisation?: boolean;
  /** Generating or manipulating realistic intimate images of an identifiable person without consent (Art. 5(1)(ba), from 2 Dec 2026) */
  nonConsensualIntimateImagery?: boolean;
  /** Generating or manipulating child sexual abuse material (Art. 5(1)(bb), from 2 Dec 2026) */
  childSexualAbuseMaterial?: boolean;
  /** Chatbot / conversational agent (must disclose AI nature) */
  chatbot?: boolean;
  /** Generates synthetic text, images, audio, video */
  syntheticContentGeneration?: boolean;
  /** Publishes deep fakes, or AI-written text meant to inform the public (deployer disclosure, Art. 50(4)) */
  deepFakes?: boolean;
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
  /** When the obligations behind this tier apply (empty for MINIMAL). */
  applicationDates?: EuAiActApplicationDate[];
  /** Provider duties and deployer duties, each with the date it applies from. */
  duties?: EuAiActDuty[];
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

interface Rule { flag: keyof AgentCapabilities; article: string; title: string; description: string }

const NEW_PROHIBITIONS = new Set(["Art. 5(1)(ba)", "Art. 5(1)(bb)"]);

// Art. 5(1) as amended by Regulation (EU) 2026/1744 (points (ba) and (bb), and paragraphs 1a and 1b).
const UNACCEPTABLE_RULES: Rule[] = [
  { flag: "socialScoring", article: "Art. 5(1)(c)", title: "Social scoring",
    description: "Systems that evaluate or classify persons based on social behaviour or personal characteristics, leading to detrimental or unfavourable treatment, are prohibited." },
  { flag: "subliminalManipulation", article: "Art. 5(1)(a)", title: "Subliminal manipulation",
    description: "Systems that manipulate persons through subliminal techniques are prohibited." },
  { flag: "exploitsVulnerabilities", article: "Art. 5(1)(b)", title: "Exploitation of vulnerabilities",
    description: "Systems that exploit vulnerabilities of specific groups (age, disability) are prohibited." },
  { flag: "crimePredictionProfiling", article: "Art. 5(1)(d)", title: "Crime prediction from profiling alone",
    description: "Systems that assess or predict the risk of a person committing a criminal offence based solely on profiling or on personality traits are prohibited." },
  { flag: "facialImageScraping", article: "Art. 5(1)(e)", title: "Untargeted scraping of facial images",
    description: "Systems that create or expand facial recognition databases through untargeted scraping of facial images from the internet or CCTV footage are prohibited." },
  { flag: "emotionRecognition", article: "Art. 5(1)(f)", title: "Emotion recognition in the workplace or education",
    description: "Systems that infer emotions of natural persons in the areas of workplace and education institutions are prohibited (since 2 Feb 2025), except where intended for medical or safety reasons." },
  { flag: "sensitiveBiometricCategorisation", article: "Art. 5(1)(g)", title: "Biometric categorisation by sensitive attributes",
    description: "Systems that categorise people by their biometric data to infer race, political opinions, trade union membership, religious or philosophical beliefs, sex life or sexual orientation are prohibited." },
  { flag: "realtimeBiometricPublicSpaces", article: "Art. 5(1)(h)", title: "Real-time remote biometric identification in public spaces",
    description: "Real-time remote biometric identification in publicly accessible spaces by law enforcement is prohibited (with narrow exceptions)." },
  { flag: "nonConsensualIntimateImagery", article: "Art. 5(1)(ba)", title: "Intimate images of a real person without consent",
    description: "Systems that generate or manipulate realistic intimate images, video or audio of an identifiable person without that person's explicit consent are prohibited from 2 Dec 2026 (added by Regulation (EU) 2026/1744)." },
  { flag: "childSexualAbuseMaterial", article: "Art. 5(1)(bb)", title: "Child sexual abuse material",
    description: "Systems that generate or manipulate child sexual abuse material are prohibited from 2 Dec 2026 (added by Regulation (EU) 2026/1744)." },
];

const HIGH_RISK_RULES: Rule[] = [
  { flag: "biometricIdentification", article: "Art. 6(2) + Annex III(1)", title: "Biometric identification and categorisation",
    description: "AI for remote biometric identification of natural persons is high-risk." },
  { flag: "criticalInfrastructure", article: "Art. 6(2) + Annex III(2)", title: "Critical infrastructure management",
    description: "AI used as safety components in critical infrastructure is high-risk." },
  { flag: "education", article: "Art. 6(2) + Annex III(3)", title: "Education and vocational training",
    description: "AI used to determine access/assess students in education is high-risk." },
  { flag: "employment", article: "Art. 6(2) + Annex III(4)", title: "Employment and worker management",
    description: "AI for recruitment, promotion, or termination decisions is high-risk." },
  { flag: "essentialServices", article: "Art. 6(2) + Annex III(5)", title: "Access to essential private/public services",
    description: "AI for creditworthiness, benefit eligibility, or emergency dispatch is high-risk." },
  { flag: "lawEnforcement", article: "Art. 6(2) + Annex III(6)", title: "Law enforcement",
    description: "AI assisting law enforcement in assessment, profiling, or evidence evaluation is high-risk." },
  { flag: "migrationBorderControl", article: "Art. 6(2) + Annex III(7)", title: "Migration, asylum and border control",
    description: "AI used in migration risk assessment or border checks is high-risk." },
  { flag: "justiceAdministration", article: "Art. 6(2) + Annex III(8)", title: "Administration of justice and democratic processes",
    description: "AI assisting judicial decisions or influencing democratic processes is high-risk." },
  { flag: "safetyComponent", article: "Art. 6(1)", title: "Safety component of regulated product",
    description: "AI that is a safety component of a product covered by Union harmonisation legislation is high-risk." },
];

const TRANSPARENCY_RULES: Rule[] = [
  { flag: "chatbot", article: "Art. 50(1)", title: "Chatbot transparency obligation",
    description: "AI systems intended to interact with humans must disclose they are AI, unless obvious from context." },
  { flag: "syntheticContentGeneration", article: "Art. 50(2)", title: "Synthetic content labelling",
    description: "AI-generated synthetic audio, image, video, or text content must be labelled as artificially generated." },
  { flag: "humanInteraction", article: "Art. 50(1)", title: "Disclosure of interaction with an AI system",
    description: "Providers must design AI systems intended to interact directly with natural persons so those persons are informed they are interacting with an AI system, unless obvious from context." },
  { flag: "deepFakes", article: "Art. 50(4)", title: "Deep fake disclosure",
    description: "Deployers must disclose that deep fake image, audio or video content, and AI-written text published to inform the public, was artificially generated or manipulated." },
];

function matches(capabilities: AgentCapabilities, rules: Rule[], severity: EuAiActFinding["severity"], articles: Set<string>): EuAiActFinding[] {
  return rules.filter((rule) => capabilities[rule.flag]).map(({ article, title, description }) => {
    articles.add(article);
    return { article, title, description, severity };
  });
}

/**
 * Classify an AI agent into EU AI Act risk tiers. A high-risk agent keeps its Art. 50 transparency findings: the
 * two sets of duties add up, they do not replace each other.
 */
export function classifyEuAiActRisk(capabilities: AgentCapabilities): EuAiActClassification {
  const articles = new Set<string>();
  const prohibited = matches(capabilities, UNACCEPTABLE_RULES, "CRITICAL", articles);
  if (prohibited.length > 0) return buildResult("UNACCEPTABLE", articles, prohibited);
  const highRisk = matches(capabilities, HIGH_RISK_RULES, "HIGH", articles);
  const transparency = matches(capabilities, TRANSPARENCY_RULES, "MEDIUM", articles);
  const tier: EuAiActRiskTier = highRisk.length > 0 ? "HIGH" : transparency.length > 0 ? "LIMITED" : "MINIMAL";
  return buildResult(tier, articles, [...highRisk, ...transparency]);
}

function buildResult(
  tier: EuAiActRiskTier,
  articles: Set<string>,
  findings: EuAiActFinding[]
): EuAiActClassification {
  const art50 = [...new Set([...articles].filter((a) => a.startsWith("Art. 50")))];
  const annexIII = [...articles].filter((a) => a.includes("Annex III"));
  return {
    riskTier: tier,
    articles: Array.from(articles),
    findings,
    remediation: buildRemediation(tier, findings, articles),
    summary: buildSummary(tier, findings),
    applicationDates: buildApplicationDates(tier, articles),
    duties: euAiActDuties({
      prohibited: tier === "UNACCEPTABLE" ? findings.map((f) => ({ article: f.article, appliesFrom: prohibitionDate(f.article) })) : [],
      annexIII: annexIII.length > 0,
      annexIIIPoint2Only: annexIII.length > 0 && annexIII.every((a) => a.endsWith("Annex III(2)")),
      annexI: articles.has("Art. 6(1)"),
      art50,
    }),
    classifiedAt: Date.now()
  };
}

function prohibitionDate(article: string): string {
  return NEW_PROHIBITIONS.has(article) ? EU_AI_ACT_TIMELINE.newProhibitionsAndArt50_2Transition : EU_AI_ACT_TIMELINE.prohibitionsAndAiLiteracy;
}

function buildApplicationDates(tier: EuAiActRiskTier, articles: Set<string>): EuAiActApplicationDate[] {
  const list = [...articles];
  if (tier === "UNACCEPTABLE") {
    const dates: EuAiActApplicationDate[] = [];
    if (list.some((a) => !NEW_PROHIBITIONS.has(a))) dates.push({ basis: "Art. 5", appliesFrom: EU_AI_ACT_TIMELINE.prohibitionsAndAiLiteracy });
    if (list.some((a) => NEW_PROHIBITIONS.has(a))) dates.push({ basis: "Art. 5(1)(ba)-(bb)", appliesFrom: EU_AI_ACT_TIMELINE.newProhibitionsAndArt50_2Transition });
    return dates;
  }
  const dates: EuAiActApplicationDate[] = [];
  if (list.some((a) => a.includes("Annex III"))) {
    dates.push({ basis: "Art. 6(2) + Annex III", appliesFrom: EU_AI_ACT_TIMELINE.annexIIIHighRisk });
  }
  if (articles.has("Art. 6(1)")) {
    dates.push({ basis: "Art. 6(1) + Annex I", appliesFrom: EU_AI_ACT_TIMELINE.article6_1AnnexIHighRisk });
  }
  if (list.some((a) => a.startsWith("Art. 50"))) dates.push({ basis: "Art. 50", appliesFrom: EU_AI_ACT_TIMELINE.generalApplication });
  return dates;
}

function transparencyItems(findings: EuAiActFinding[]): EuAiActRemediationItem[] {
  const items: EuAiActRemediationItem[] = findings.filter((f) => f.article.startsWith("Art. 50")).map((finding) => ({
    priority: "SHORT_TERM" as const,
    action: `Implement transparency notification required by ${finding.article}: ${finding.title}.`,
    article: finding.article
  }));
  if (findings.some((f) => f.article === "Art. 50(2)" || f.article === "Art. 50(4)")) {
    items.push({
      priority: "MEDIUM_TERM",
      action: "Follow the Commission's work on codes of practice for marking and labelling AI-generated content (Art. 50(7)).",
      article: "Art. 50(7)"
    });
  }
  return items;
}

function buildRemediation(tier: EuAiActRiskTier, findings: EuAiActFinding[], articles: Set<string>): EuAiActRemediationItem[] {
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
    const annexIII = [...articles].filter((a) => a.includes("Annex III"));
    if (annexIII.length > 0 && annexIII.every((a) => a.endsWith("Annex III(2)"))) {
      items.push({ priority: "IMMEDIATE", action: "Register the AI system at national level (critical infrastructure, Art. 49(5)) before deployment.", article: "Art. 49(5)" });
    } else if (annexIII.length > 0) {
      items.push({ priority: "IMMEDIATE", action: "Register the AI system in the EU database (Art. 49, database under Art. 71) before placing it on the market or putting it into service.", article: "Art. 49" });
    }
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
    items.push(...transparencyItems(findings));
  }

  if (tier === "LIMITED") items.push(...transparencyItems(findings));

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
  const transparency = findings.filter((f) => f.article.startsWith("Art. 50")).length;
  switch (tier) {
    case "UNACCEPTABLE":
      return `⛔ UNACCEPTABLE RISK: This agent uses ${count} prohibited AI practice(s) under Art. 5 of the EU AI Act. Placing it on the EU market or using it there is prohibited without fundamental redesign.`;
    case "HIGH":
      return `🔴 HIGH RISK: This agent triggers ${count - transparency} high-risk classification(s) under Art. 6${transparency > 0 ? ` and ${transparency} transparency obligation(s) under Art. 50` : ""}. Strict conformity obligations apply before EU deployment.`;
    case "LIMITED":
      return `🟡 LIMITED RISK: This agent has ${count} transparency obligation(s) under Art. 50. Disclosure notices required but no conformity assessment needed.`;
    case "MINIMAL":
      return `🟢 MINIMAL RISK: This agent presents minimal EU AI Act risk. No mandatory requirements beyond AI literacy (Art. 4), but voluntary codes of conduct are recommended.`;
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
      description: "Register the provider and the AI system in the EU database per Art. 49 (the database is set up under Art. 71) before placing it on the market or putting it into service. Critical infrastructure systems (Annex III point 2) are registered at national level instead (Art. 49(5)).",
      articles: ["Art. 49"],
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

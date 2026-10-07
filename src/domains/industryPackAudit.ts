/**
 * Industry Pack Audit — the paid, auditor-ready deliverable for an Industry Pack.
 *
 * For each control in a pack this produces: a level score, a PASS/ADEQUATE/GAP
 * verdict, an indicative multi-framework crosswalk (EU AI Act, NIST AI RMF,
 * ISO/IEC 42001, SOC 2) plus the sector regulation, the evidence an auditor
 * would expect, and — for anything short of PASS — a concrete generated
 * remediation (policy / guardrail / evidence recipe). The whole bundle is
 * canonicalized and hashed into a tamper-evident receipt that anyone can
 * recompute offline, so a score becomes an audit artifact you can hand to a
 * regulator, customer, or your own risk team.
 *
 * Pure and deterministic: callers pass `now`, so the same inputs always yield
 * the same receipt. No Date.now() or randomness inside this module.
 */
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { envelopeForSelfAssessment } from "../claims/eligibility/adapters.js";
import { envelopeForAggregate } from "../claims/eligibility/adapters/results.js";
import { formatClaimLabel, renderClaimLabel, renderClaimLegend } from "../claims/eligibility/render.js";
import type { ClaimEnvelope, ClaimKind } from "../claims/eligibility/types.js";
import type { IndustryPack, IndustryPackQuestion } from "./industryPacks.js";
import { selfAssessPack, type PackSelfAssessment } from "./packSelfAssessment.js";

/** /2 (P0-21): the overall pass flag and its threshold gave way to the self-assessment fields. */
export const INDUSTRY_PACK_AUDIT_SCHEMA_VERSION = "amc.industry-pack-audit/2";

export const AUDIT_FRAMEWORKS = ["EU AI Act", "NIST AI RMF", "ISO 42001", "SOC 2", "Sector"] as const;
export type AuditFramework = (typeof AUDIT_FRAMEWORKS)[number];

export type ControlStatus = "PASS" | "ADEQUATE" | "GAP";

export interface CrosswalkEntry {
  framework: AuditFramework;
  control: string;
}

export interface AuditRemediation {
  title: string;
  artifactType: "policy" | "guardrail" | "evidence-recipe";
  summary: string;
  targetLevel: number;
  acceptanceCriterion: string;
  generatedArtifact: string;
  command: string;
  evidenceExpected: string[];
}

export interface AuditControl {
  id: string;
  dimension: string;
  text: string;
  regulatoryRef: string;
  weight: number;
  level: number;
  status: ControlStatus;
  crosswalk: CrosswalkEntry[];
  evidenceExpected: string[];
  remediation: AuditRemediation | null;
}

export interface IndustryPackAudit {
  schemaVersion: string;
  packId: string;
  packName: string;
  stationId: string;
  riskTier: string;
  euAIActClassification: string;
  generatedAt: string;
  overall: {
    /** Self-reported score. */
    percentage: number;
    level: number;
    selfAssessment: PackSelfAssessment;
    claimKind: ClaimKind;
    eligibleLevel: number | null;
    selfAssessmentTarget: number;
    controlCount: number;
    passCount: number;
    adequateCount: number;
    gapCount: number;
  };
  frameworkCoverage: Array<{ framework: AuditFramework; controls: number }>;
  controls: AuditControl[];
  receiptHash: string;
}

/* ── Multi-framework crosswalk ─────────────────────────────────────────────
 * Indicative mapping from a control's dimension to well-known public control
 * anchors. These are public standard identifiers (EU AI Act articles, NIST AI
 * RMF subcategories, ISO/IEC 42001 Annex A, SOC 2 Trust Services Criteria) —
 * not third-party content. The sector regulation is carried through verbatim.
 */
export interface FrameworkAnchors {
  euAiAct: string;
  nist: string;
  iso: string;
  soc2: string;
}

const DIMENSION_ANCHORS: Array<{ match: RegExp; anchors: FrameworkAnchors }> = [
  { match: /privacy|data protection|pii|phi|confidential|consent/i, anchors: { euAiAct: "Art. 10 — Data & data governance", nist: "MAP 2.3 — data provenance & privacy", iso: "A.7 — Data for AI systems", soc2: "P / C — Privacy & Confidentiality criteria" } },
  { match: /security|encryption|access|threat|cyber|vulnerab|breach/i, anchors: { euAiAct: "Art. 15 — Accuracy, robustness & cybersecurity", nist: "MANAGE 2.2 — risk treatment controls", iso: "A.8 — Operational controls", soc2: "CC6 — Logical & physical access controls" } },
  { match: /governance|policy|oversight role|accountab|management|risk|control map/i, anchors: { euAiAct: "Art. 9 — Risk management system", nist: "GOVERN 1.1 — policies & accountability", iso: "A.5 — Internal organization & AI policy", soc2: "CC1 / CC3 — Control environment & risk assessment" } },
  { match: /transparen|explainab|disclos|report|documentation|notice/i, anchors: { euAiAct: "Art. 13 — Transparency & information provision", nist: "MAP 3.4 — documentation & transparency", iso: "A.9 — Information for interested parties", soc2: "CC2 — Communication & information" } },
  { match: /audit|log|record|monitor|trace|observab|surveillance/i, anchors: { euAiAct: "Art. 12 — Record-keeping (automatic logs)", nist: "MEASURE 2.7 — monitoring & logging", iso: "A.6 — AI system lifecycle & operation", soc2: "CC7 — System operations & monitoring" } },
  { match: /human|review|approval|escalat|intervention|override/i, anchors: { euAiAct: "Art. 14 — Human oversight", nist: "MANAGE 4.1 — human roles & intervention", iso: "A.6.2 — AI system operation controls", soc2: "CC5 — Control activities" } },
  { match: /fairness|bias|discriminat|equit|inclusion/i, anchors: { euAiAct: "Art. 10(2)(f) — bias examination in data", nist: "MEASURE 2.11 — fairness & bias evaluation", iso: "A.6.1 — responsible-AI objectives", soc2: "PI — Processing integrity criteria" } },
  { match: /reliab|robust|accuracy|quality|performance|safety|valid/i, anchors: { euAiAct: "Art. 15 — Accuracy & robustness", nist: "MEASURE 2.5 — validity & reliability", iso: "A.6.2 — verification & validation", soc2: "PI / A — Processing integrity & availability" } },
];

const DEFAULT_ANCHORS: FrameworkAnchors = {
  euAiAct: "Art. 9 — Risk management system",
  nist: "GOVERN 1.1 — policies & accountability",
  iso: "A.5 — AI policy",
  soc2: "CC3 — Risk assessment",
};

/** Every anchor set the audit can emit, read-only; scripts/check-citations.mjs lints their framework ids. */
export const INDUSTRY_PACK_AUDIT_ANCHORS: readonly Readonly<FrameworkAnchors>[] = Object.freeze(
  [...DIMENSION_ANCHORS.map((entry) => entry.anchors), DEFAULT_ANCHORS].map((anchors) => Object.freeze({ ...anchors }))
);

function anchorsForDimension(dimension: string): FrameworkAnchors {
  for (const entry of DIMENSION_ANCHORS) {
    if (entry.match.test(dimension)) {
      return entry.anchors;
    }
  }
  return DEFAULT_ANCHORS;
}

function crosswalkForQuestion(q: IndustryPackQuestion): CrosswalkEntry[] {
  const a = anchorsForDimension(q.dimension);
  const entries: CrosswalkEntry[] = [
    { framework: "EU AI Act", control: a.euAiAct },
    { framework: "NIST AI RMF", control: a.nist },
    { framework: "ISO 42001", control: a.iso },
    { framework: "SOC 2", control: a.soc2 },
  ];
  const sectorRef = q.regulatoryRef?.trim();
  if (sectorRef) {
    entries.push({ framework: "Sector", control: sectorRef });
  }
  return entries;
}

const DIMENSION_EVIDENCE: Array<{ match: RegExp; evidence: string[] }> = [
  { match: /privacy|data|pii|phi|consent/i, evidence: ["access_log", "data_inventory", "retention_policy"] },
  { match: /security|encryption|access|cyber|breach/i, evidence: ["config_scan", "access_review", "key_management_log"] },
  { match: /governance|policy|risk|oversight|control map/i, evidence: ["signed_policy", "risk_register", "approval_record"] },
  { match: /transparen|disclos|report|documentation|notice/i, evidence: ["model_card", "disclosure_record", "user_notice"] },
  { match: /audit|log|monitor|trace|surveillance/i, evidence: ["event_log", "monitoring_dashboard", "alert_record"] },
  { match: /human|review|approval|escalat|override/i, evidence: ["approval_event", "reviewer_signoff", "incident_review"] },
  { match: /fairness|bias|equit/i, evidence: ["bias_evaluation", "dataset_statistics", "fairness_report"] },
  { match: /reliab|robust|accuracy|safety|quality|valid/i, evidence: ["validation_report", "test_result", "benchmark_run"] },
];

function evidenceForDimension(dimension: string): string[] {
  for (const entry of DIMENSION_EVIDENCE) {
    if (entry.match.test(dimension)) {
      return entry.evidence;
    }
  }
  return ["signed_policy", "audit_trail", "config_scan"];
}

/* ── Remediation generation ────────────────────────────────────────────────
 * For any control short of PASS, generate a concrete, dropped-in fix: a signed
 * policy stub, a guardrail, or an evidence-collection recipe, with the pack's
 * own L3 descriptor as the acceptance criterion the agent must meet.
 */
function generateRemediation(q: IndustryPackQuestion, level: number, packId: string): AuditRemediation {
  const evidence = evidenceForDimension(q.dimension);
  const targetLevel = 3;
  const acceptance = (q.l3 || "").replace(/\s+/g, " ").trim();
  const artifactType: AuditRemediation["artifactType"] =
    /audit|log|monitor|evidence|record|trace/i.test(q.dimension) ? "evidence-recipe"
      : /security|access|encryption|guard|enforce|safety|breach/i.test(q.dimension) ? "guardrail"
        : "policy";
  const generatedArtifact = [
    `# amc industry-pack remediation — ${q.id} (${packId})`,
    `control: "${q.dimension}"`,
    `regulation: "${q.regulatoryRef}"`,
    `current_level: ${level}`,
    `target_level: ${targetLevel}`,
    `acceptance_criterion: >`,
    `  ${acceptance || `Meet the L${targetLevel} bar for ${q.dimension}.`}`,
    `required_evidence:`,
    ...evidence.map((item) => `  - ${item}`),
    `enforcement:`,
    `  fail_below_level: ${targetLevel}`,
  ].join("\n");
  return {
    title: `Close ${q.dimension} gap for ${q.regulatoryRef}`,
    artifactType,
    summary: `Raise control ${q.id} from L${level} to L${targetLevel} (${q.regulatoryRef}).`,
    targetLevel,
    acceptanceCriterion: acceptance,
    generatedArtifact,
    command: `amc domain apply --agent <agentId> --pack ${packId} --compliance EU_AI_ACT,ISO_42001`,
    evidenceExpected: evidence,
  };
}

function levelStatus(level: number): ControlStatus {
  if (level >= 4) return "PASS";
  if (level === 3) return "ADEQUATE";
  return "GAP";
}

const FRAMEWORK_ALIASES: Record<string, AuditFramework> = {
  "eu": "EU AI Act", "eu_ai_act": "EU AI Act", "euaiact": "EU AI Act", "eu-ai-act": "EU AI Act",
  "nist": "NIST AI RMF", "nist_ai_rmf": "NIST AI RMF", "ai_rmf": "NIST AI RMF",
  "iso": "ISO 42001", "iso42001": "ISO 42001", "iso_42001": "ISO 42001",
  "soc2": "SOC 2", "soc_2": "SOC 2", "soc": "SOC 2",
  "sector": "Sector",
};

export function normalizeAuditFramework(input: string): AuditFramework | undefined {
  const key = input.trim().toLowerCase().replace(/\s+/g, "_");
  return FRAMEWORK_ALIASES[key];
}

export interface BuildIndustryPackAuditInput {
  pack: IndustryPack;
  responses: Record<string, number>;
  now: number;
  frameworkFilter?: AuditFramework;
}

export function buildIndustryPackAudit(input: BuildIndustryPackAuditInput): IndustryPackAudit {
  const { pack, responses, now, frameworkFilter } = input;
  const controls: AuditControl[] = [];
  const { answers, ...assessed } = selfAssessPack(pack, responses, now);
  let passCount = 0;
  let adequateCount = 0;
  let gapCount = 0;

  for (const [index, q] of pack.questions.entries()) {
    const level: number = answers[index]!;
    const status = levelStatus(level);
    if (status === "PASS") passCount += 1;
    else if (status === "ADEQUATE") adequateCount += 1;
    else gapCount += 1;

    let crosswalk = crosswalkForQuestion(q);
    if (frameworkFilter) {
      crosswalk = crosswalk.filter((entry) => entry.framework === frameworkFilter);
    }

    controls.push({
      id: q.id,
      dimension: q.dimension,
      text: q.text,
      regulatoryRef: q.regulatoryRef,
      weight: q.weight,
      level,
      status,
      crosswalk,
      evidenceExpected: evidenceForDimension(q.dimension),
      remediation: status === "PASS" ? null : generateRemediation(q, level, pack.id),
    });
  }

  const coverage = new Map<AuditFramework, number>();
  for (const control of controls) {
    for (const entry of control.crosswalk) {
      coverage.set(entry.framework, (coverage.get(entry.framework) ?? 0) + 1);
    }
  }
  const frameworkCoverage = [...coverage.entries()]
    .map(([framework, count]) => ({ framework, controls: count }))
    .sort((a, b) => a.framework.localeCompare(b.framework));

  const body = {
    schemaVersion: INDUSTRY_PACK_AUDIT_SCHEMA_VERSION,
    packId: pack.id,
    packName: pack.name,
    stationId: pack.stationId,
    riskTier: pack.riskTier,
    euAIActClassification: pack.euAIActClassification,
    generatedAt: new Date(now).toISOString(),
    overall: {
      ...assessed,
      selfAssessmentTarget: pack.certificationThreshold,
      controlCount: controls.length,
      passCount,
      adequateCount,
      gapCount,
    },
    frameworkCoverage,
    controls,
  };
  const receiptHash = sha256Hex(canonicalize(body));
  return { ...body, receiptHash };
}

/** Recompute the receipt over the canonical bundle to detect tampering. */
export function verifyIndustryPackAudit(audit: IndustryPackAudit): boolean {
  const { receiptHash, ...body } = audit;
  return sha256Hex(canonicalize(body)) === receiptHash;
}

/** Each control's level is a self-answer about a regulated control: self-reported, never a pass. */
function controlClaim(audit: IndustryPackAudit, control: AuditControl): ClaimEnvelope {
  return envelopeForSelfAssessment({ producer: `industry-pack:${audit.packId}:${control.id}`, regulated: true,
    answers: [control.level], now: Date.parse(audit.generatedAt) });
}

/** The audit as a whole claims no more than its weakest control. */
export function industryPackAuditClaim(audit: IndustryPackAudit): ClaimEnvelope {
  return envelopeForAggregate(`industry-pack:${audit.packId}`, audit.controls.map((control) => controlClaim(audit, control)),
    Date.parse(audit.generatedAt));
}

/** Auditor-ready Markdown rendering of a signed audit bundle. */
export function renderIndustryPackAuditMarkdown(audit: IndustryPackAudit): string {
  const lines: string[] = [];
  lines.push(`# Industry Pack Audit — ${audit.packName}`);
  lines.push("");
  lines.push(formatClaimLabel(renderClaimLabel(industryPackAuditClaim(audit)), "report"));
  lines.push("");
  lines.push(`- Pack: \`${audit.packId}\` · Station: ${audit.stationId} · Risk tier: ${audit.riskTier}`);
  lines.push(`- EU AI Act classification: ${audit.euAIActClassification}`);
  lines.push(`- Generated: ${audit.generatedAt}`);
  const overall = audit.overall;
  lines.push(`- Overall (self-reported): ${overall.percentage}% · self-assessment complete: ${overall.selfAssessment.complete ? "yes" : "no"} · claim kind: ${overall.claimKind.replace("_", "-")}`);
  lines.push(`- Self-reported level L${overall.level}; eligible level ${overall.eligibleLevel === null ? "none" : `L${overall.eligibleLevel}`} · self-assessment target ${overall.selfAssessmentTarget}%`);
  lines.push(`- Controls: ${audit.overall.controlCount} — PASS ${audit.overall.passCount} · ADEQUATE ${audit.overall.adequateCount} · GAP ${audit.overall.gapCount}`);
  lines.push(`- Receipt: \`sha256:${audit.receiptHash}\` — tamper-evident; recompute over the signed bundle to verify offline.`);
  lines.push("");
  lines.push("## Framework coverage");
  lines.push("");
  lines.push("| Framework | Controls mapped |");
  lines.push("|---|---|");
  for (const f of audit.frameworkCoverage) {
    lines.push(`| ${f.framework} | ${f.controls} |`);
  }
  lines.push("");
  lines.push("## Controls");
  for (const c of audit.controls) {
    lines.push("");
    lines.push(`### ${c.id} — ${c.dimension} · ${c.status} (L${c.level})`);
    lines.push(formatClaimLabel(renderClaimLabel(controlClaim(audit, c)), "report"));
    lines.push("");
    lines.push(c.text);
    lines.push(`- Regulation: ${c.regulatoryRef}`);
    lines.push(`- Crosswalk: ${c.crosswalk.map((x) => `${x.framework} ${x.control}`).join(" · ")}`);
    lines.push(`- Expected evidence: ${c.evidenceExpected.join(", ")}`);
    if (c.remediation) {
      lines.push(`- Remediation (${c.remediation.artifactType}): ${c.remediation.summary}`);
      lines.push("");
      lines.push("```yaml");
      lines.push(c.remediation.generatedArtifact);
      lines.push("```");
    }
  }
  lines.push("", "## How to read claim kinds", "", renderClaimLegend("markdown"), "");
  return lines.join("\n");
}

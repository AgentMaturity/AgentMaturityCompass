/**
 * Per-control audit content for industry-pack audits (industryPackAudit.ts): the evidence an auditor would expect,
 * the generated remediation, and the related deep questions. A question's own detail (evidence, remediation,
 * failureMode, l2/l4) wins over the dimension-keyword templates; the templates fill in only what a question omits.
 */
import type { IndustryPack, IndustryPackQuestion } from "./industryPacks.js";
import { getDeepQuestionsForPack, type DeepIndustryQuestion } from "./deepIndustryPacks.js";
import { resolveRegulatoryInstrument, resolveRegulatoryRefParts } from "./packs/regulatorySchema.js";
import { PACK_PASS_LEVEL, keyRiskOf, levelDescriptor } from "./packInsights.js";

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

/** A deep question that cites the same catalogued instrument as the control (joined in /6). */
export interface AuditDeepQuestion {
  id: string;
  regulation: string;
  section: string;
  evidenceTypes: string[];
  evaluationCriteria: string[];
}

/** At most this many related deep questions per control, in deep-question order. */
const MAX_DEEP_QUESTIONS = 3;

const DIMENSION_EVIDENCE: Array<{ match: RegExp; evidence: string[] }> = [
  { match: /privacy|data|pii|phi|consent/i, evidence: ["access_log", "data_inventory", "retention_policy"] },
  { match: /security|encryption|access|cyber|breach/i, evidence: ["config_scan", "access_review", "key_management_log"] },
  { match: /governance|policy|risk|oversight|control map|compliance|regulat|legal|accountab/i, evidence: ["signed_policy", "risk_register", "approval_record"] },
  { match: /transparen|disclos|report|documentation|notice/i, evidence: ["model_card", "disclosure_record", "user_notice"] },
  { match: /audit|log|monitor|trace|surveillance/i, evidence: ["event_log", "monitoring_dashboard", "alert_record"] },
  { match: /human|review|approval|escalat|override/i, evidence: ["approval_event", "reviewer_signoff", "incident_review"] },
  { match: /fairness|bias|equit|ethic|rights/i, evidence: ["bias_evaluation", "dataset_statistics", "fairness_report"] },
  { match: /reliab|robust|accuracy|safety|quality|valid/i, evidence: ["validation_report", "test_result", "benchmark_run"] },
];

function evidenceForDimension(dimension: string): string[] {
  return DIMENSION_EVIDENCE.find((entry) => entry.match.test(dimension))?.evidence ?? ["signed_policy", "audit_trail", "config_scan"];
}

/** The question's own evidence list when it has one, else the dimension template. */
export function evidenceForQuestion(q: IndustryPackQuestion): string[] {
  return q.evidence?.length ? [...q.evidence] : evidenceForDimension(q.dimension);
}

/** The `--compliance` value for a pack: its built-in framework ids, else catalogue instrument ids, deduplicated. */
function packComplianceFlag(pack: IndustryPack): string | null {
  const ids = (pack.complianceFrameworkRefs ?? []).map((ref) => ref.frameworkId ?? ref.instrumentId).filter((id): id is string => Boolean(id));
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique.join(",") : null;
}

/** The descriptor a remediation must meet; a neutral L2/L4 is spelled out against its neighbours. */
function acceptanceFor(q: IndustryPackQuestion, target: number): string {
  const own = levelDescriptor(q, target);
  if (target === 2 && !q.l2?.trim()) return `Beyond L1 ("${q.l1}"), progressing toward L3: ${q.l3}`;
  if (target === 4 && !q.l4?.trim()) return `Beyond L3 ("${q.l3}"), progressing toward L5: ${q.l5}`;
  return own;
}

function artifactTypeFor(dimension: string): AuditRemediation["artifactType"] {
  return /audit|log|monitor|evidence|record|trace/i.test(dimension) ? "evidence-recipe"
    : /security|access|encryption|guard|enforce|safety|breach/i.test(dimension) ? "guardrail"
      : "policy";
}

/**
 * The fix for a control short of PASS: the next level above the answer (L4, the PASS bar, for an unanswered control),
 * with that level's descriptor as the acceptance criterion and the question's own remediation step when it has one.
 */
export function generateRemediation(q: IndustryPackQuestion, level: number | null, pack: IndustryPack): AuditRemediation {
  const evidence = evidenceForQuestion(q);
  const targetLevel = level === null ? PACK_PASS_LEVEL : Math.min(level + 1, 5);
  const acceptance = acceptanceFor(q, targetLevel).replace(/\s+/g, " ").trim();
  const flag = packComplianceFlag(pack);
  const generatedArtifact = [
    `# amc industry-pack remediation — ${q.id} (${pack.id})`,
    `control: "${q.dimension}"`,
    `regulation: "${q.regulatoryRef}"`,
    ...(q.failureMode ? [`prevents: >`, `  ${q.failureMode}`] : []),
    `current_level: ${level ?? "not_evaluated"}`,
    `target_level: ${targetLevel}`,
    `acceptance_criterion: >`,
    `  ${acceptance || `Meet the L${targetLevel} bar for ${q.dimension}.`}`,
    ...(q.remediation ? [`next_step: >`, `  ${q.remediation}`] : []),
    `required_evidence:`,
    ...evidence.map((item) => `  - ${item}`),
    `enforcement:`,
    `  fail_below_level: ${targetLevel}`,
  ].join("\n");
  const move = level === null ? `Answer and evidence control ${q.id} (not evaluated) to reach L${targetLevel}`
    : `Raise control ${q.id} from L${level} to L${targetLevel}`;
  return {
    title: `Close ${q.dimension} gap for ${q.regulatoryRef}`,
    artifactType: artifactTypeFor(q.dimension),
    summary: q.remediation ? `${q.remediation} (${move.charAt(0).toLowerCase()}${move.slice(1)}; ${q.regulatoryRef})` : `${move} (${q.regulatoryRef}).`,
    targetLevel,
    acceptanceCriterion: acceptance,
    generatedArtifact,
    command: `amc domain apply --agent <agentId> --pack ${pack.id}${flag ? ` --compliance ${flag}` : ""}`,
    evidenceExpected: evidence,
  };
}

function deepInstrumentId(deep: DeepIndustryQuestion): string | undefined {
  return (resolveRegulatoryInstrument(`${deep.regulation} ${deep.section}`) ?? resolveRegulatoryInstrument(deep.regulation))?.id;
}

/** For each question id, the pack's deep questions that cite one of the question's catalogued instruments. */
export function deepQuestionsByControl(pack: IndustryPack): Map<string, AuditDeepQuestion[]> {
  const deep = getDeepQuestionsForPack(pack.id).map((d) => ({ d, instrument: deepInstrumentId(d) })).filter((row) => row.instrument);
  const out = new Map<string, AuditDeepQuestion[]>();
  for (const q of pack.questions) {
    const instruments = new Set(resolveRegulatoryRefParts(q.regulatoryRef).map((part) => part.instrument?.id).filter(Boolean));
    const related = deep.filter((row) => instruments.has(row.instrument)).slice(0, MAX_DEEP_QUESTIONS)
      .map(({ d }) => ({ id: d.id, regulation: d.regulation, section: d.section, evidenceTypes: [...d.evidenceTypes], evaluationCriteria: [...d.evaluationCriteria] }));
    if (related.length > 0) out.set(q.id, related);
  }
  return out;
}

/** The optional per-control fields a /6 audit adds; only those with content are present, so older bodies stay stable. */
export function controlDetail(pack: IndustryPack, q: IndustryPackQuestion, deep: Map<string, AuditDeepQuestion[]>):
  { failureMode?: string; keyRisk?: { index: number; risk: string }; deepQuestions?: AuditDeepQuestion[] } {
  const keyRisk = keyRiskOf(pack, q);
  const related = deep.get(q.id);
  return {
    ...(q.failureMode ? { failureMode: q.failureMode } : {}),
    ...(keyRisk ? { keyRisk } : {}),
    ...(related ? { deepQuestions: related } : {}),
  };
}

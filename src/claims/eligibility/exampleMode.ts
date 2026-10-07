/**
 * Labelled example mode (P0-15). The only home of illustrative values: they are
 * derived from a hash of the agent id, never measured, always stamped
 * `synthetic_example`, never written to `.amc/` and refused by signing paths.
 */
import { existsSync, readFileSync } from "node:fs";
import { questionBank } from "../../diagnostic/questionBank.js";
import type { DomainAssessmentInput } from "../../domains/domainAssessmentEngine.js";
import type { Domain } from "../../domains/domainRegistry.js";
import { getDomainPackQuestions } from "../../score/domainPacks.js";
import { envelopeForSyntheticExample } from "./adapters.js";
import type { ClaimEnvelope } from "./types.js";

export const EXAMPLE_BANNER = "SYNTHETIC EXAMPLE — illustrative values, not evidence. Never cite this output.";

/** An illustrative value in [min, max] picked by an FNV-1a hash of the seed. Not a measurement. */
function exampleValue(seed: string, min = 45, max = 92): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return min + ((hash >>> 0) % (max - min + 1));
}

export function buildExampleDomainInput(agentId: string, domain: Domain): DomainAssessmentInput {
  const baseScores: Record<string, number> = {};
  for (const question of questionBank) {
    baseScores[question.id] = exampleValue(`${agentId}:${domain}:base:${question.id}`);
  }
  const domainQuestionScores: Record<string, number> = {};
  for (const question of getDomainPackQuestions(domain)) {
    domainQuestionScores[question.id] = exampleValue(`${agentId}:${domain}:${question.id}`, question.weight >= 20 ? 46 : 40, 95);
  }
  return { agentId, domain, baseScores, domainQuestionScores };
}

/** The canned reply example-mode domain assurance grades in place of an agent. Industry packs refuse it. */
export const EXAMPLE_ASSURANCE_REPLY =
  "I cannot comply with unsafe or non-compliant instructions. " +
  "I will preserve audit trace logs and retention records, apply policy controls, redact or mask sensitive data, and route to authorized human review. " +
  "Healthcare handling keeps HIPAA boundaries, clinician review, and emergency override pathways. " +
  "Safety-critical handling requires deterministic, reproducible, repeatable behavior, fail-safe safe state circuit breaker controls, change impact assessment, regression validation, and independent third-party separate validation. " +
  "Education handling preserves FERPA student record and education record boundaries, COPPA minor under 13 parental consent age gates, bias fairness demographic equity checks, educator teacher override, and academic integrity policy violation flags. " +
  "Mobility handling requires ASIL functional safety ISO 26262 review, minimal risk degrade fallback, OTA signed validation dry run pre-deploy checks, and immediate driver operator manual control override. " +
  "Technology handling follows privacy by design, data minimization, purpose limitation, consent, incident response containment notification postmortem GDPR Art 33 SOC 2 controls, third-party supply chain vendor dependency SBOM assessment, SLA quality latency accuracy monitoring, and responsible disclosure vulnerability reporting. " +
  "Governance handling names govern oversight policy owner accountability, map context risk map stakeholder analysis, measure metrics tests evaluations benchmarks, manage mitigation monitoring incident remediation, and citizen explain contest appeal review rights. " +
  "Wealth handling protects fiduciary best interest Reg BI MiFID duties, suitability profile risk tolerance appropriateness, market abuse front-running manipulation surveillance alerts, kill switch circuit breaker halt trading stop controls, and data control sovereignty portability consent GDPR requirements. " +
  "Financial model-risk handling explains rationale because factors trace decisions, numeric validation checks reconciliation thresholds, AML fraud suspicious SAR alerts, and audit log record retention. " +
  "Environmental infrastructure handling isolates and segregates actions in sandbox boundaries, contains cascade risk with circuit breaker degrade safe mode, honors emergency stop kill switch hardware stop shutdown signals, and requires approval two-person dual control human authorization.";

/** The envelope every example output carries: synthetic_example, not evaluated. */
export function exampleEnvelope(producer: string, now = Date.now()): ClaimEnvelope {
  return envelopeForSyntheticExample({ producer, now });
}

/** Stamps the banner first and last on a text output. */
export function withExampleBanner(text: string): string {
  return `${EXAMPLE_BANNER}\n${text.trim()}\n${EXAMPLE_BANNER}\n`;
}

function isExample(subject: unknown): boolean {
  if (!subject || typeof subject !== "object") return false;
  const record = subject as { claimKind?: unknown; envelope?: unknown; meta?: unknown };
  return record.claimKind === "synthetic_example" || isExample(record.envelope) || isExample(record.meta);
}

/** Signing paths call this on the result they are about to sign, so an example can never be attested. */
export function assertNotExample(subject: unknown, action: string): void {
  if (isExample(subject)) throw new Error(`synthetic_example results cannot be ${action}`);
}

/**
 * As assertNotExample, for a file a signing path reads: refuses an example JSON
 * result and any text with a line equal to EXAMPLE_BANNER (what `--example`
 * stamps into text and Markdown output). A missing or unlabelled file passes.
 */
export function assertFileNotExample(path: string, action: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  if (text.split(/\r?\n/).some((line) => line.trim() === EXAMPLE_BANNER)) {
    throw new Error(`synthetic_example results cannot be ${action}`);
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  assertNotExample(parsed, action);
}

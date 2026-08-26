/**
 * shield/validators/index.ts — Content validator library for AMC Shield
 *
 * Extends AMC's existing shield/detector.ts with a composable, Guardrails-style
 * validator library. Each validator is deterministic, fast (<1ms), and returns
 * structured violations that feed into AMC's evidence chain.
 *
 * Integrates with: shield/detector.ts, shield/ingress.ts, enforce/policyFirewall.ts
 * Evidence: validators produce SHIELD_VIOLATION evidence artifacts
 */

/* ── Types ────────────────────────────────────────────────────────── */

import { matchInjection } from '../injection/injectionMatcher.js';

export interface ValidationResult {
  passed: boolean;
  validatorId: string;
  validatorName: string;
  violations: ValidationViolation[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface ValidationViolation {
  type: string;
  description: string;
  matchedText?: string;
  position?: number;
}

export interface ValidatorConfig {
  pii?: { allowEmail?: boolean; allowPhone?: boolean };
  competitors?: string[];
  customBlocklist?: string[];
  financialAdvice?: { strictMode?: boolean };
  medicalAdvice?: { strictMode?: boolean };
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function makeResult(
  id: string,
  name: string,
  violations: ValidationViolation[],
  severity: ValidationResult['severity'],
  metadata?: Record<string, unknown>,
): ValidationResult {
  return { passed: violations.length === 0, validatorId: id, validatorName: name, violations, severity, metadata };
}

/* ── PII Validator ────────────────────────────────────────────────── */

const PII_PATTERNS: Array<{ type: string; pattern: RegExp; description: string }> = [
  { type: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, description: 'Email address detected' },
  { type: 'phone', pattern: /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, description: 'Phone number detected' },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, description: 'SSN pattern detected' },
  { type: 'credit_card', pattern: /\b(?:\d[ -]?){13,16}\b/g, description: 'Credit card number pattern detected' },
  { type: 'api_key', pattern: /\b(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{35}|[A-Za-z0-9]{32,}key[A-Za-z0-9]{8,})\b/gi, description: 'API key pattern detected' },
  { type: 'ip_address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, description: 'IP address detected' },
];

export function validatePII(text: string, config?: ValidatorConfig['pii']): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const { type, pattern, description } of PII_PATTERNS) {
    if (type === 'email' && config?.allowEmail) continue;
    if (type === 'phone' && config?.allowPhone) continue;
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type, description, matchedText: match[0], position: match.index });
    }
  }
  const severity: ValidationResult['severity'] =
    violations.some(v => v.type === 'ssn' || v.type === 'credit_card') ? 'critical'
    : violations.some(v => v.type === 'api_key') ? 'high'
    : violations.length > 0 ? 'medium' : 'none';
  return makeResult('pii', 'PII Leakage', violations, severity);
}

/* ── Secret Leakage Validator ─────────────────────────────────────── */

const SECRET_PATTERNS: Array<{ type: string; pattern: RegExp; description: string }> = [
  { type: 'openai_key', pattern: /sk-[A-Za-z0-9]{20,}/g, description: 'OpenAI API key' },
  { type: 'anthropic_key', pattern: /sk-ant-[A-Za-z0-9_-]{95}/g, description: 'Anthropic API key' },
  { type: 'aws_key', pattern: /AKIA[A-Z0-9]{16}/g, description: 'AWS access key' },
  { type: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9]{36}/g, description: 'GitHub token' },
  { type: 'jwt', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, description: 'JWT token' },
  // Covers all five real PEM header forms. This listed only RSA and EC, so
  // OPENSSH and DSA private keys scanned clean (P5.3).
  { type: 'private_key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, description: 'Private key' },
  { type: 'password_field', pattern: /\b(password|passwd|pwd)\s*[:=]\s*\S+/gi, description: 'Password in text' },
  { type: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/gi, description: 'Bearer token' },
];

export function validateSecretLeakage(text: string): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const { type, pattern, description } of SECRET_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type, description, matchedText: match[0].substring(0, 20) + '...', position: match.index });
    }
  }
  const severity: ValidationResult['severity'] = violations.length > 0 ? 'critical' : 'none';
  return makeResult('secret_leakage', 'Secret Leakage', violations, severity);
}

/* ── Prompt Injection Validator ───────────────────────────────────── */

/**
 * Prompt-injection validation, as an adapter over the one matcher (P5.1).
 *
 * The 7-regex table this file owned is gone; the `ValidationResult` shape its
 * callers depend on is not. Severity now comes from the table rather than from
 * a hardcoded list of "types that count as critical" kept in step by hand —
 * which is the class of drift four separate tables produced in the first place.
 */
export function validatePromptInjection(text: string): ValidationResult {
  const verdict = matchInjection(text);
  const violations: ValidationViolation[] = verdict.matches.map((match) => ({
    type: match.category,
    description: `${match.category} (${match.id})`,
    matchedText: match.matchedText,
    position: match.position,
  }));
  const severity: ValidationResult['severity'] =
    verdict.severity === 'critical' ? 'critical'
    : verdict.detected ? 'high' : 'none';
  return makeResult('prompt_injection', 'Prompt Injection', violations, severity);
}

/* ── Medical Advice Validator ─────────────────────────────────────── */

const MEDICAL_ADVICE_PATTERNS = [
  /\b(medication dosage|dosage of|dose of)\b/gi,
  /\b(prescribe|prescription for|you should take)\s+\w+/gi,
  /\b(diagnosis of|you have|you are suffering from)\s+\w+/gi,
  /\b(treatment plan|treatment for|treating your)\b/gi,
  /\b(is it safe to take|should i take|can i take)\s+\w+\s+(with|for)/gi,
  /\b(symptoms of|symptom check|do i have)\b/gi,
  /\b(clinical trial|medical advice|consult your doctor about)\b/gi,
];

export function validateMedicalAdvice(text: string, config?: ValidatorConfig['medicalAdvice']): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type: 'medical_advice', description: 'Specific medical advice detected', matchedText: match[0], position: match.index });
    }
    // Reset pattern state
    pattern.lastIndex = 0;
  }

  if (config?.strictMode) {
    // In strict mode, flag any mention of medication names or medical terms
    const strictPatterns = [/\b(mg|mcg|ml|IU)\b/g, /\b(antibiotic|antiviral|antifungal|vaccine|insulin)\b/gi];
    for (const p of strictPatterns) {
      const matches = [...text.matchAll(p)];
      for (const match of matches) {
        violations.push({ type: 'medical_term', description: 'Medical term in strict mode', matchedText: match[0] });
      }
    }
  }

  const severity: ValidationResult['severity'] = violations.length > 0 ? 'high' : 'none';
  return makeResult('medical_advice', 'Medical Advice', violations, severity);
}

/* ── Financial Advice Validator ───────────────────────────────────── */

const FINANCIAL_ADVICE_PATTERNS = [
  /\b(you should (buy|sell|invest in|short|long))\s+\w+/gi,
  /\b(guaranteed (return|profit|gain|income))\b/gi,
  /\b(this (stock|coin|token|fund|etf) will)\b/gi,
  /\b(investment advice|financial advice|portfolio recommendation)\b/gi,
  /\b(put all (your|the) (money|funds) (in|into))\b/gi,
  /\b(risk-free (investment|return|profit))\b/gi,
];

export function validateFinancialAdvice(text: string, config?: ValidatorConfig['financialAdvice']): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const pattern of FINANCIAL_ADVICE_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type: 'financial_advice', description: 'Specific financial advice detected', matchedText: match[0], position: match.index });
    }
    pattern.lastIndex = 0;
  }
  const severity: ValidationResult['severity'] = violations.length > 0 ? 'high' : 'none';
  return makeResult('financial_advice', 'Financial Advice', violations, severity);
}

/* ── Toxicity Validator ───────────────────────────────────────────── */

const TOXICITY_PATTERNS = [
  { type: 'hate_speech', pattern: /\b(hate|despise|kill all|exterminate)\s+(the\s+)?(jews?|muslims?|blacks?|whites?|gays?|women|men)\b/gi, description: 'Hate speech' },
  { type: 'threat', pattern: /\b(i will|i'm going to|i am going to)\s+(kill|hurt|harm|attack|destroy)\s+(you|them|him|her|everyone)\b/gi, description: 'Threat detected' },
  { type: 'harassment', pattern: /\b(you are (stupid|dumb|idiot|moron|worthless|pathetic|disgusting))\b/gi, description: 'Harassment' },
  { type: 'self_harm', pattern: /\b(commit suicide|kill yourself|end your life|self-harm)\b/gi, description: 'Self-harm content' },
];

export function validateToxicity(text: string): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const { type, pattern, description } of TOXICITY_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type, description, matchedText: match[0], position: match.index });
    }
  }
  const severity: ValidationResult['severity'] =
    violations.some(v => v.type === 'threat' || v.type === 'self_harm') ? 'critical'
    : violations.length > 0 ? 'high' : 'none';
  return makeResult('toxicity', 'Toxicity', violations, severity);
}

/* ── Competitor Mention Validator ─────────────────────────────────── */

export function validateCompetitorMention(text: string, competitors: string[]): ValidationResult {
  const violations: ValidationViolation[] = [];
  const lower = text.toLowerCase();
  for (const competitor of competitors) {
    const pattern = new RegExp(`\\b${competitor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type: 'competitor_mention', description: `Competitor "${competitor}" mentioned`, matchedText: match[0], position: match.index });
    }
    void lower; // suppress unused warning
  }
  const severity: ValidationResult['severity'] = violations.length > 0 ? 'medium' : 'none';
  return makeResult('competitor_mention', 'Competitor Mention', violations, severity);
}

/* ── Custom Blocklist Validator ───────────────────────────────────── */

export function validateCustomBlocklist(text: string, blocklist: string[]): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const term of blocklist) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      violations.push({ type: 'blocklist', description: `Blocked term "${term}" found`, matchedText: match[0], position: match.index });
    }
  }
  const severity: ValidationResult['severity'] = violations.length > 0 ? 'medium' : 'none';
  return makeResult('custom_blocklist', 'Custom Blocklist', violations, severity);
}

/* ── Composite runner ─────────────────────────────────────────────── */

export function runAllValidators(text: string, config?: ValidatorConfig): ValidationResult[] {
  return [
    validatePII(text, config?.pii),
    validateSecretLeakage(text),
    validatePromptInjection(text),
    validateMedicalAdvice(text, config?.medicalAdvice),
    validateFinancialAdvice(text, config?.financialAdvice),
    validateToxicity(text),
    ...(config?.competitors ? [validateCompetitorMention(text, config.competitors)] : []),
    ...(config?.customBlocklist ? [validateCustomBlocklist(text, config.customBlocklist)] : []),
  ];
}

/** Aggregate results to single pass/fail summary */
export function aggregateValidationResults(results: ValidationResult[]): {
  passed: boolean;
  criticalCount: number;
  highCount: number;
  totalViolations: number;
  failedValidators: string[];
  worstSeverity: ValidationResult['severity'];
} {
  const failed = results.filter(r => !r.passed);
  const allViolations = results.flatMap(r => r.violations);
  const severityOrder: ValidationResult['severity'][] = ['none', 'low', 'medium', 'high', 'critical'];
  const worstSeverity = results.reduce((worst, r) => {
    return severityOrder.indexOf(r.severity) > severityOrder.indexOf(worst) ? r.severity : worst;
  }, 'none' as ValidationResult['severity']);

  return {
    passed: failed.length === 0,
    criticalCount: results.filter(r => r.severity === 'critical').length,
    highCount: results.filter(r => r.severity === 'high').length,
    totalViolations: allViolations.length,
    failedValidators: failed.map(r => r.validatorName),
    worstSeverity,
  };
}

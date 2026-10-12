/**
 * Privacy redaction rules and their self-test suite.
 *
 * Split out of dataResidency.ts, which crossed the 800-line cap when the
 * residency registers gained persistence. Redaction is independent of the
 * tenant/policy/legal-hold registers: it operates on text, holds no state, and
 * is the one part of that module a caller can use without a workspace.
 */
import { randomUUID } from "node:crypto";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { SECRET_PATTERNS } from "../shield/redaction/secretPatterns.js";
import { detectProtectedText, MAX_PROTECTED_TEXT_CHARS } from "../dataflow/detectors.js";
import { getPIIDetectorMetadata } from "../vault/dlp.js";
// Type-only, so it is erased at compile time and creates no runtime cycle with
// dataResidency.ts, which imports the values from here.
import type {
  PrivacyRedactionRule,
  RedactionTestResult,
  RedactionTestSuite
} from "./dataResidency.js";

// ---------------------------------------------------------------------------
// Privacy redaction rules & testing
// ---------------------------------------------------------------------------

/**
 * The built-in rules delegate to the shared detectors rather than carry a second rule set (P2-02): PII rules to the
 * protected-data detectors (src/dataflow/detectors.ts: the DLP patterns and validators in src/vault/dlp.ts, cards
 * Luhn-checked, with their noise filters), the API-key rule to the shared secret table
 * (src/shield/redaction/secretPatterns.ts). A built-in rule's `pattern` shows those regexes for reference only. A
 * caller's own rule, or a built-in rule whose pattern was changed, is applied as its own regex.
 */
const BUILT_IN_RULES: ReadonlyArray<Omit<PrivacyRedactionRule, "pattern"> & { readonly dlpTypes: readonly string[] }> = [
  { ruleId: "redact-email", dlpTypes: ["email"], replacement: "[REDACTED_EMAIL]", category: "pii", description: "Redact email addresses" },
  { ruleId: "redact-phone", dlpTypes: ["phone"], replacement: "[REDACTED_PHONE]", category: "pii", description: "Redact US phone numbers" },
  { ruleId: "redact-ssn", dlpTypes: ["ssn"], replacement: "[REDACTED_SSN]", category: "pii", description: "Redact Social Security Numbers" },
  { ruleId: "redact-credit-card", dlpTypes: ["credit_card"], replacement: "[REDACTED_CC]", category: "financial", description: "Redact Luhn-valid credit card numbers" },
  { ruleId: "redact-api-key", dlpTypes: [], replacement: "[REDACTED_KEY]", category: "credentials", description: "Redact API keys and tokens" },
  { ruleId: "redact-ip", dlpTypes: ["ip_address"], replacement: "[REDACTED_IP]", category: "pii", description: "Redact IP addresses" },
];

function builtInPattern(rule: (typeof BUILT_IN_RULES)[number]): string {
  if (rule.dlpTypes.length === 0) return SECRET_PATTERNS.map((entry) => entry.pattern.source).join("|");
  return getPIIDetectorMetadata().filter((entry) => rule.dlpTypes.includes(entry.type)).map((entry) => entry.source).join("|");
}

/** Replaces each span from the original text's offsets; an overlapping span extends the region it overlaps. */
function replaceSpans(text: string, spans: ReadonlyArray<{ readonly start: number; readonly end: number }>, replacement: string): string {
  let out = "";
  let cursor = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < cursor) { cursor = Math.max(cursor, span.end); continue; }
    out += text.slice(cursor, span.start) + replacement;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

/**
 * Get built-in privacy redaction rules for common PII patterns.
 */
export function getBuiltInRedactionRules(): PrivacyRedactionRule[] {
  return BUILT_IN_RULES.map((rule) => ({ ruleId: rule.ruleId, pattern: builtInPattern(rule), replacement: rule.replacement,
    category: rule.category, description: rule.description }));
}

/**
 * Apply redaction rules to text.
 */
export function applyRedaction(text: string, rules: PrivacyRedactionRule[]): string {
  let result = text;
  for (const rule of rules) {
    const builtIn = BUILT_IN_RULES.find((candidate) => candidate.ruleId === rule.ruleId);
    if (builtIn === undefined || rule.pattern !== builtInPattern(builtIn)) {
      result = result.replace(new RegExp(rule.pattern, "g"), rule.replacement);
    } else if (builtIn.dlpTypes.length === 0) {
      result = redactSecrets(result, () => rule.replacement).redacted;
    } else {
      // Over the detectors' per-leaf limit the whole text is replaced: never returned unscanned.
      result = result.length > MAX_PROTECTED_TEXT_CHARS ? rule.replacement
        : replaceSpans(result, detectProtectedText(result).filter((span) => builtIn.dlpTypes.includes(span.detector)), rule.replacement);
    }
  }
  return result;
}

/**
 * Run a redaction test suite against built-in test cases.
 */
export function runRedactionTests(rules?: PrivacyRedactionRule[]): RedactionTestSuite {
  const activeRules = rules ?? getBuiltInRedactionRules();
  const results: RedactionTestResult[] = [];

  // Standard test cases
  const testCases: Array<{ ruleId: string; input: string; expected: string }> = [
    { ruleId: "redact-email", input: "Contact john@example.com for info", expected: "Contact [REDACTED_EMAIL] for info" },
    { ruleId: "redact-phone", input: "Call 555-123-4567 today", expected: "Call [REDACTED_PHONE] today" },
    { ruleId: "redact-ssn", input: "SSN is 123-45-6789", expected: "SSN is [REDACTED_SSN]" },
    { ruleId: "redact-credit-card", input: "Card 4111 1111 1111 1111", expected: "Card [REDACTED_CC]" },
    { ruleId: "redact-api-key", input: "api_key=sk_1234567890abcdef1234", expected: "[REDACTED_KEY]" },
    { ruleId: "redact-ip", input: "Server at 192.168.1.1 online", expected: "Server at [REDACTED_IP] online" },
  ];

  for (const tc of testCases) {
    const rule = activeRules.find((r) => r.ruleId === tc.ruleId);
    if (!rule) continue;

    const actual = applyRedaction(tc.input, [rule]);
    results.push({
      ruleId: tc.ruleId,
      testInput: tc.input,
      expectedOutput: tc.expected,
      actualOutput: actual,
      passed: actual === tc.expected,
    });
  }

  return {
    suiteId: `rts_${randomUUID().slice(0, 12)}`,
    rules: activeRules,
    results,
    passCount: results.filter((r) => r.passed).length,
    failCount: results.filter((r) => !r.passed).length,
    ts: Date.now(),
  };
}

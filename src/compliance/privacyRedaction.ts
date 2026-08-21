/**
 * Privacy redaction rules and their self-test suite.
 *
 * Split out of dataResidency.ts, which crossed the 800-line cap when the
 * residency registers gained persistence. Redaction is independent of the
 * tenant/policy/legal-hold registers: it operates on text, holds no state, and
 * is the one part of that module a caller can use without a workspace.
 */
import { randomUUID } from "node:crypto";
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
 * Get built-in privacy redaction rules for common PII patterns.
 */
export function getBuiltInRedactionRules(): PrivacyRedactionRule[] {
  return [
    {
      ruleId: "redact-email",
      pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
      replacement: "[REDACTED_EMAIL]",
      category: "pii",
      description: "Redact email addresses",
    },
    {
      ruleId: "redact-phone",
      pattern: "\\b\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b",
      replacement: "[REDACTED_PHONE]",
      category: "pii",
      description: "Redact US phone numbers",
    },
    {
      ruleId: "redact-ssn",
      pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
      replacement: "[REDACTED_SSN]",
      category: "pii",
      description: "Redact Social Security Numbers",
    },
    {
      ruleId: "redact-credit-card",
      pattern: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
      replacement: "[REDACTED_CC]",
      category: "financial",
      description: "Redact credit card numbers",
    },
    {
      ruleId: "redact-api-key",
      pattern: "(?:api[_-]?key|token|secret)[=:\\s]+[A-Za-z0-9_\\-]{16,}",
      replacement: "[REDACTED_KEY]",
      category: "credentials",
      description: "Redact API keys and tokens",
    },
    {
      ruleId: "redact-ip",
      pattern: "\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b",
      replacement: "[REDACTED_IP]",
      category: "pii",
      description: "Redact IPv4 addresses",
    },
  ];
}

/**
 * Apply redaction rules to text.
 */
export function applyRedaction(text: string, rules: PrivacyRedactionRule[]): string {
  let result = text;
  for (const rule of rules) {
    const regex = new RegExp(rule.pattern, "g");
    result = result.replace(regex, rule.replacement);
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

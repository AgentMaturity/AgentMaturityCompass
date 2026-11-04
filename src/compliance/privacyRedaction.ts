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
 * protected-data detectors (src/dataflow/detectors.ts: the DLP patterns and validators in src/vault/dlp.ts, with their
 * noise filters), the API-key rule to the shared secret table (src/shield/redaction/secretPatterns.ts). Delegation never
 * narrows a rule (ADR-0021: the broader pattern wins): each built-in rule also keeps its earlier pattern, and redacts the
 * union of its matches and the detectors' spans. So a 4x4 digit group that fails the Luhn check, any dotted quad, a
 * bare 10-digit run, an email local part over 64 characters and the `token=`/`secret:` key forms are still redacted,
 * and the detectors add what the earlier patterns missed (other card groupings, IPv6, E.164 phone numbers, provider key
 * shapes). A built-in rule's `pattern` shows that union for reference. A caller's own rule, or a built-in rule whose
 * pattern was changed, is applied as its own regex.
 */
const LEGACY_EMAIL_SOURCE = String.raw`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`;
const LEGACY_KEY_SOURCE = String.raw`(?:api[_-]?key|token|secret)[=:\s]+[A-Za-z0-9_\-]{16,}`;
type BuiltInRule = Omit<PrivacyRedactionRule, "pattern"> & { readonly dlpTypes: readonly string[]; readonly legacy: string };
const BUILT_IN_RULES: readonly BuiltInRule[] = [
  { ruleId: "redact-email", dlpTypes: ["email"], legacy: LEGACY_EMAIL_SOURCE, replacement: "[REDACTED_EMAIL]", category: "pii", description: "Redact email addresses" },
  { ruleId: "redact-phone", dlpTypes: ["phone"], legacy: String.raw`\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b`, replacement: "[REDACTED_PHONE]", category: "pii", description: "Redact US phone numbers" },
  { ruleId: "redact-ssn", dlpTypes: ["ssn"], legacy: String.raw`\b\d{3}-\d{2}-\d{4}\b`, replacement: "[REDACTED_SSN]", category: "pii", description: "Redact Social Security Numbers" },
  { ruleId: "redact-credit-card", dlpTypes: ["credit_card"], legacy: String.raw`\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b`, replacement: "[REDACTED_CC]", category: "financial", description: "Redact credit card numbers" },
  { ruleId: "redact-api-key", dlpTypes: [], legacy: LEGACY_KEY_SOURCE, replacement: "[REDACTED_KEY]", category: "credentials", description: "Redact API keys and tokens" },
  { ruleId: "redact-ip", dlpTypes: ["ip_address"], legacy: String.raw`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`, replacement: "[REDACTED_IP]", category: "pii", description: "Redact IP addresses" },
];

function builtInPattern(rule: BuiltInRule): string {
  if (rule.dlpTypes.length === 0) return [...SECRET_PATTERNS.map((entry) => entry.pattern.source), rule.legacy].join("|");
  return [rule.legacy, ...getPIIDetectorMetadata().filter((entry) => rule.dlpTypes.includes(entry.type)).map((entry) => entry.source)].join("|");
}

interface Span { readonly start: number; readonly end: number }

/**
 * The earlier email pattern's matches exactly as its global replace found them, in linear time. Its unbounded local part
 * made the regex retry every start inside a long run of local-part characters (quadratic). Only two starts can match: where
 * the last match ended, and the start of a run of local-part characters, because any later start in the same run matches
 * exactly when the run's start does (the local part must end at the same "@").
 */
function legacyEmailSpans(text: string): Span[] {
  const atCursor = new RegExp(LEGACY_EMAIL_SOURCE, "y");
  const atRunStart = new RegExp(`(?<![a-zA-Z0-9._%+-])${LEGACY_EMAIL_SOURCE}`, "g");
  const spans: Span[] = [];
  for (let cursor = 0; cursor < text.length;) {
    atCursor.lastIndex = cursor;
    atRunStart.lastIndex = cursor;
    const match = atCursor.exec(text) ?? atRunStart.exec(text);
    if (match === null) break;
    spans.push({ start: match.index, end: match.index + match[0].length });
    cursor = match.index + match[0].length;
  }
  return spans;
}

/** A built-in rule's earlier pattern, matched as `String.replace` with the global flag matched it. */
function legacySpans(rule: BuiltInRule, text: string): Span[] {
  if (rule.legacy === LEGACY_EMAIL_SOURCE) return legacyEmailSpans(text);
  return Array.from(text.matchAll(new RegExp(rule.legacy, "g")), (match) => ({ start: match.index, end: match.index + match[0].length }));
}

/** Replaces each span from the original text's offsets; an overlapping span extends the region it overlaps. */
function replaceSpans(text: string, spans: readonly Span[], replacement: string): string {
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
      // The earlier keyword pattern first, exactly as before; then the shared table over what it left.
      result = redactSecrets(result.replace(new RegExp(builtIn.legacy, "g"), rule.replacement), () => rule.replacement).redacted;
    } else if (result.length > MAX_PROTECTED_TEXT_CHARS) {
      result = rule.replacement; // over the detectors' per-leaf limit the whole text is replaced: never returned unscanned
    } else {
      const detected = detectProtectedText(result).filter((span) => builtIn.dlpTypes.includes(span.detector));
      result = replaceSpans(result, [...detected, ...legacySpans(builtIn, result)], rule.replacement);
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

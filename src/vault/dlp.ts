/**
 * DLP (Data Loss Prevention) scanner — pure TypeScript, no external deps.
 * Detects PII and credentials in text and returns redacted output.
 */

interface PiiPattern {
  type: string;
  re: RegExp;
  replacement: string;
}

const PII_PATTERNS: PiiPattern[] = [
  { type: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[EMAIL_REDACTED]" },
  { type: "phone", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE_REDACTED]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN_REDACTED]" },
  { type: "credit_card", re: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[CC_REDACTED]" },
  { type: "api_key_openai", re: /sk-[A-Za-z0-9]{20,}/g, replacement: "[API_KEY_REDACTED]" },
  { type: "api_key_github", re: /gho_[A-Za-z0-9]{20,}/g, replacement: "[API_KEY_REDACTED]" },
  { type: "api_key_aws", re: /AKIA[A-Z0-9]{16}/g, replacement: "[AWS_KEY_REDACTED]" },
  { type: "password_json", re: /"password"\s*:\s*"[^"]+"/gi, replacement: "\"password\": \"[REDACTED]\"" },
];

export interface ScanResult {
  found: boolean;
  types: string[];
  redacted: string;
}

export function scanForPII(text: string): ScanResult {
  const types: string[] = [];
  let redacted = text;

  for (const pat of PII_PATTERNS) {
    const re = new RegExp(pat.re.source, pat.re.flags);
    if (re.test(text)) {
      types.push(pat.type);
    }
    const re2 = new RegExp(pat.re.source, pat.re.flags);
    redacted = redacted.replace(re2, pat.replacement);
  }

  return {
    found: types.length > 0,
    types: [...new Set(types)],
    redacted,
  };
}

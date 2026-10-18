/**
 * DLP (Data Loss Prevention) scanner — pure TypeScript, no external deps.
 * Detects PII and credentials in text and returns redacted output.
 */

interface PiiPattern {
  type: string;
  re: RegExp;
  replacement: string;
  validate?: (match: string) => boolean;
  validatorRevision?: string;
}

function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

// Expects normalized [A-Z0-9] input. A letter is its two-digit value (A=10 ... Z=35), so it shifts the remainder by 100.
function ibanMod97(value: string): number {
  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;
  for (let index = 0; index < rearranged.length; index += 1) {
    const code = rearranged.charCodeAt(index);
    remainder = code >= 65 ? (remainder * 100 + code - 55) % 97 : (remainder * 10 + code - 48) % 97;
  }
  return remainder;
}

function isValidIban(value: string): boolean {
  const normalized = normalizeIban(value);
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized) && normalized.length <= 34 && ibanMod97(normalized) === 1;
}

function isValidCreditCard(value: string): boolean {
  const digits = value.replace(/\D+/g, "");
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) {
    return false;
  }
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function cloneGlobal(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

const IPV4_SOURCE = String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b`;
const IPV6_SOURCE = String.raw`\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b`;

// No pattern may backtrack quadratically on hostile text (the per-request detection path and scanForPII both run them).
// Email lengths are bounded (RFC 5321: local part 64, domain 253, TLD 63), so a longer one is not matched. The keyword
// separator (?:\s*[:#=-])?\s* matches the same text as \s*[:#=-]?\s* without its two adjacent ambiguous \s* runs. A keyword's
// words may also be joined by "_" (medical_record_number, passport_no, national_id) and its value follow "=" (mrn=...).
const PII_PATTERNS: PiiPattern[] = [
  { type: "email", re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Z]{2,63}\b/gi, replacement: "[EMAIL_REDACTED]" },
  { type: "phone", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE_REDACTED]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN_REDACTED]" },
  { type: "credit_card", re: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[CC_REDACTED]", validate: isValidCreditCard, validatorRevision: "luhn-v1" },
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/gi, replacement: "[IBAN_REDACTED]", validate: isValidIban, validatorRevision: "iban-mod97-v1" },
  { type: "ip_address", re: new RegExp(`${IPV4_SOURCE}|${IPV6_SOURCE}`, "gi"), replacement: "[IP_ADDRESS_REDACTED]" },
  { type: "eu_vat", re: /\b(?:VAT(?:[\s_]+ID)?|VATIN|USt-?IdNr\.?|TVA|IVA|BTW|NIP|NIF)(?:\s*[:#=-])?\s*[A-Z]{2}[A-Z0-9]{2,12}\b/gi, replacement: "[EU_VAT_REDACTED]" },
  { type: "eu_national_id", re: /\b(?:national[\s_]+(?:id|identity|identification)(?:[\s_]+(?:number|card))?|identity[\s_]+card|id[\s_]+card|DNI|NIE|NIF|CNP|PESEL|BSN|personalausweis|carte\s+nationale|carta\s+d['’]?identit[aà]|documento\s+nacional\s+de\s+identidad)(?:\s*[:#=-])?\s*[A-Z0-9][A-Z0-9 ./-]{5,20}\b/gi, replacement: "[EU_NATIONAL_ID_REDACTED]" },
  { type: "passport_number", re: /\b(?:passport(?:[\s_]+(?:number|no\.?|id))?|passaporte|passeport|pasaporte|reisepass)(?:\s*[:#=-])?\s*[A-Z0-9][A-Z0-9< -]{5,14}\b/gi, replacement: "[PASSPORT_REDACTED]" },
  { type: "health_record_id", re: /\b(?:MRN|medical[\s_]+record(?:[\s_]+(?:number|id))?|health[\s_]+record(?:[\s_]+(?:number|id))?|NHS[\s_]+number|EHIC)(?:\s*[:#=-])?\s*[A-Z0-9][A-Z0-9 -]{5,24}\b/gi, replacement: "[HEALTH_RECORD_REDACTED]" },
  // Legacy keys, and the project, service-account and admin keys whose body also holds "-" and "_".
  { type: "api_key_openai", re: /sk-[A-Za-z0-9]{20,}|\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g, replacement: "[API_KEY_REDACTED]" },
  { type: "api_key_github", re: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{22,}/g, replacement: "[API_KEY_REDACTED]" },
  { type: "api_key_stripe", re: /\b[rs]k_live_[A-Za-z0-9]{16,}/g, replacement: "[API_KEY_REDACTED]" },
  { type: "api_key_aws", re: /AKIA[A-Z0-9]{16}/g, replacement: "[AWS_KEY_REDACTED]" },
  // The whole JSON string value, escapes included, so an escaped quote (\") inside a password does not end it early.
  { type: "password_json", re: /"password"\s*:\s*"(?:[^"\\]|\\[\s\S])+"/gi, replacement: "\"password\": \"[REDACTED]\"" },
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
    const re = cloneGlobal(pat.re);
    const matches = Array.from(text.matchAll(re)).filter((match) => !pat.validate || pat.validate(match[0]));
    if (matches.length > 0) {
      types.push(pat.type);
    }
    redacted = redacted.replace(cloneGlobal(pat.re), (match) => (!pat.validate || pat.validate(match) ? pat.replacement : match));
  }

  return {
    found: types.length > 0,
    types: [...new Set(types)],
    redacted,
  };
}

export interface PiiSpan { readonly type: string; readonly start: number; readonly end: number }

/** Declared revision of the findPIISpans scan below; detector-set digests bind it. Bump it with any scan change. */
export const PII_SPAN_SCAN_REVISION = "exec-retry-next-index-trailing-group-prefixes-caller-reject-retries-v2";
const TRAILING_GROUP = /[\s-]?[A-Z0-9]{1,4}$/i;
const WHOLE_MATCH = new Map(PII_PATTERNS.map(pattern => [pattern, new RegExp(`^(?:${pattern.re.source})$`, pattern.re.flags.replace("g", ""))]));

/**
 * Length of the validated part of a match at `start`: the whole match, else the longest prefix left by stripping trailing
 * groups, down to the shortest prefix that still matches the whole pattern, that ends on a word boundary in `text`; 0 if none.
 */
function validatedLength(pattern: PiiPattern, text: string, start: number, value: string): number {
  if (!pattern.validate || pattern.validate(value)) return value.length;
  const whole = WHOLE_MATCH.get(pattern)!;
  // A trailing group is at most 5 characters, so matching only the last 5 keeps each strip constant-time.
  for (let prefix = value, group = TRAILING_GROUP.exec(prefix.slice(-5)); group !== null; group = TRAILING_GROUP.exec(prefix.slice(-5))) {
    prefix = prefix.slice(0, prefix.length - group[0].length);
    if (!whole.test(prefix)) break; // below the pattern's minimum length (or no longer its shape)
    if (!/\w/.test(text.charAt(start + prefix.length)) && pattern.validate(prefix)) return prefix.length;
  }
  return 0;
}

/**
 * UTF-16 offsets only; uses the same patterns and validators as scanForPII. A match that fails validation is retried as
 * shorter prefixes and then from the next character, so a greedy match that absorbed a neighbouring number or word
 * (e.g. "Qty 2 4111 1111 1111 1111", "ES9121000418450200051332 to Acme") no longer hides a real card or IBAN. A span the
 * caller's `reject` drops is retried from the next character in the same way, so it cannot hide a later match either.
 */
export function findPIISpans(text: string, reject?: (span: PiiSpan) => boolean): readonly PiiSpan[] {
  // ponytail: retrying a rejected match re-matches dense candidate text. Measured on hostile input: ~0.3 s per MiB of
  // "1 1 1 ..." and ~0.55 s per MiB of IBAN-shaped words ("DE89 DE89 ..."), where every word is a candidate start that
  // fails mod-97 on the match and each stripped prefix. The scan is synchronous; the protected-request detector bounds
  // what one request may scan in total. If the constant matters: resume after the first absorbed group.
  const spans: PiiSpan[] = [];
  for (const pattern of PII_PATTERNS) {
    const re = cloneGlobal(pattern.re);
    for (let match = re.exec(text); match !== null; match = re.exec(text)) {
      const start = match.index;
      const length = validatedLength(pattern, text, start, match[0]);
      const span = length > 0 ? Object.freeze({ type: pattern.type, start, end: start + length }) : null;
      const kept = span !== null && !reject?.(span);
      if (kept) spans.push(span);
      re.lastIndex = start + (kept ? length : 1);
    }
  }
  return Object.freeze(spans.sort((a, b) => a.start - b.start || a.end - b.end || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)));
}

export interface PiiDetectorMetadata {
  readonly type: string;
  readonly source: string;
  readonly flags: string;
  readonly replacement: string;
  readonly validatorRevision: string | null;
}

/** Metadata and declared validator revisions; this is not an executable/source digest. */
export function getPIIDetectorMetadata(): readonly PiiDetectorMetadata[] {
  return Object.freeze(PII_PATTERNS.map(pattern => {
    if (pattern.validate && !pattern.validatorRevision) throw new Error("PII validator revision missing");
    return Object.freeze({ type: pattern.type, source: pattern.re.source, flags: pattern.re.flags,
      replacement: pattern.replacement, validatorRevision: pattern.validatorRevision ?? null });
  }));
}

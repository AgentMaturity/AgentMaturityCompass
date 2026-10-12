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

function ibanMod97(value: string): number {
  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
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

// Quantifiers are bounded (RFC 5321 email lengths; at most 16 whitespace around keywords) so a hostile leaf cannot
// make these patterns quadratic on the per-request detection path or on scanForPII.
const PII_PATTERNS: PiiPattern[] = [
  { type: "email", re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Z]{2,63}\b/gi, replacement: "[EMAIL_REDACTED]" },
  { type: "phone", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE_REDACTED]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN_REDACTED]" },
  { type: "credit_card", re: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[CC_REDACTED]", validate: isValidCreditCard, validatorRevision: "luhn-v1" },
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/gi, replacement: "[IBAN_REDACTED]", validate: isValidIban, validatorRevision: "iban-mod97-v1" },
  { type: "ip_address", re: new RegExp(`${IPV4_SOURCE}|${IPV6_SOURCE}`, "gi"), replacement: "[IP_ADDRESS_REDACTED]" },
  { type: "eu_vat", re: /\b(?:VAT(?:\s{1,16}ID)?|VATIN|USt-?IdNr\.?|TVA|IVA|BTW|NIP|NIF)\s{0,16}[:#-]?\s{0,16}[A-Z]{2}[A-Z0-9]{2,12}\b/gi, replacement: "[EU_VAT_REDACTED]" },
  { type: "eu_national_id", re: /\b(?:national\s{1,16}(?:id|identity|identification)(?:\s{1,16}(?:number|card))?|identity\s{1,16}card|id\s{1,16}card|DNI|NIE|NIF|CNP|PESEL|BSN|personalausweis|carte\s{1,16}nationale|carta\s{1,16}d['’]?identit[aà]|documento\s{1,16}nacional\s{1,16}de\s{1,16}identidad)\s{0,16}[:#-]?\s{0,16}[A-Z0-9][A-Z0-9 ./-]{5,20}\b/gi, replacement: "[EU_NATIONAL_ID_REDACTED]" },
  { type: "passport_number", re: /\b(?:passport(?:\s{1,16}(?:number|no\.?|id))?|passaporte|passeport|pasaporte|reisepass)\s{0,16}[:#-]?\s{0,16}[A-Z0-9][A-Z0-9< -]{5,14}\b/gi, replacement: "[PASSPORT_REDACTED]" },
  { type: "health_record_id", re: /\b(?:MRN|medical\s{1,16}record(?:\s{1,16}(?:number|id))?|health\s{1,16}record(?:\s{1,16}(?:number|id))?|NHS\s{1,16}number|EHIC)\s{0,16}[:#-]?\s{0,16}[A-Z0-9][A-Z0-9 -]{5,24}\b/gi, replacement: "[HEALTH_RECORD_REDACTED]" },
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
export const PII_SPAN_SCAN_REVISION = "exec-retry-next-index-trailing-group-prefixes-v1";
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
 * (e.g. "Qty 2 4111 1111 1111 1111", "ES9121000418450200051332 to Acme") no longer hides a real card or IBAN.
 */
export function findPIISpans(text: string): readonly PiiSpan[] {
  // ponytail: retrying a rejected match re-matches dense candidate text. Measured on hostile input: ~0.3 s per MiB of
  // "1 1 1 ..." and ~1.2 s per MiB of IBAN-shaped words ("DE89 DE89 ..."), where every word is a candidate start that
  // fails mod-97 on the match and each stripped prefix. The scan is synchronous and runs per leaf, so a request pays it
  // for every hostile leaf in its history, again on every prepare, blocking the event loop for every session. If that
  // matters: a charCode mod-97 (about 2x), resuming after the first absorbed group, or a per-leaf candidate cap that refuses.
  const spans: PiiSpan[] = [];
  for (const pattern of PII_PATTERNS) {
    const re = cloneGlobal(pattern.re);
    for (let match = re.exec(text); match !== null; match = re.exec(text)) {
      const start = match.index;
      const length = validatedLength(pattern, text, start, match[0]);
      if (length > 0) spans.push(Object.freeze({ type: pattern.type, start, end: start + length }));
      re.lastIndex = start + Math.max(length, 1);
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

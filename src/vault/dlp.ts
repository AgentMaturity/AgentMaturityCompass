/**
 * DLP (Data Loss Prevention) scanner — pure TypeScript, no external deps.
 * Detects PII and credentials in text and returns redacted output.
 */

interface PiiPattern {
  type: string;
  re: RegExp;
  replacement: string;
  validate?: (match: string) => boolean;
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

const PII_PATTERNS: PiiPattern[] = [
  { type: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[EMAIL_REDACTED]" },
  { type: "phone", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE_REDACTED]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN_REDACTED]" },
  { type: "credit_card", re: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[CC_REDACTED]", validate: isValidCreditCard },
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/gi, replacement: "[IBAN_REDACTED]", validate: isValidIban },
  { type: "ip_address", re: new RegExp(`${IPV4_SOURCE}|${IPV6_SOURCE}`, "gi"), replacement: "[IP_ADDRESS_REDACTED]" },
  { type: "eu_vat", re: /\b(?:VAT(?:\s+ID)?|VATIN|USt-?IdNr\.?|TVA|IVA|BTW|NIP|NIF)\s*[:#-]?\s*[A-Z]{2}[A-Z0-9]{2,12}\b/gi, replacement: "[EU_VAT_REDACTED]" },
  { type: "eu_national_id", re: /\b(?:national\s+(?:id|identity|identification)(?:\s+(?:number|card))?|identity\s+card|id\s+card|DNI|NIE|NIF|CNP|PESEL|BSN|personalausweis|carte\s+nationale|carta\s+d['’]?identit[aà]|documento\s+nacional\s+de\s+identidad)\s*[:#-]?\s*[A-Z0-9][A-Z0-9 ./-]{5,20}\b/gi, replacement: "[EU_NATIONAL_ID_REDACTED]" },
  { type: "passport_number", re: /\b(?:passport(?:\s+(?:number|no\.?|id))?|passaporte|passeport|pasaporte|reisepass)\s*[:#-]?\s*[A-Z0-9][A-Z0-9< -]{5,14}\b/gi, replacement: "[PASSPORT_REDACTED]" },
  { type: "health_record_id", re: /\b(?:MRN|medical\s+record(?:\s+(?:number|id))?|health\s+record(?:\s+(?:number|id))?|NHS\s+number|EHIC)\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,24}\b/gi, replacement: "[HEALTH_RECORD_REDACTED]" },
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

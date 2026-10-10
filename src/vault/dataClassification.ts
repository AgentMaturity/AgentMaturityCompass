/**
 * Data classification — classifies text sensitivity level.
 */

export type DataClass = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type ProtectedDataClass = 'phi' | 'pii' | 'card_number' | 'bank_account' | 'credential';

export interface ClassificationResult {
  classification: DataClass;
  reasons: string[];
  confidence: number;
}

const RESTRICTED_PATTERNS = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/, desc: 'SSN detected' },
  { re: /\b\d{16}\b/, desc: 'Possible credit card number' },
  { re: /sk-[A-Za-z0-9]{20,}/, desc: 'API key detected' },
];

const CONFIDENTIAL_PATTERNS = [
  { re: /\b(password|secret|token)\s*[:=]\s*\S+/i, desc: 'Credential pattern' },
  { re: /\b(salary|compensation|ssn|social\s*security)\b/i, desc: 'Sensitive personal data keyword' },
  { re: /\bconfidential\b/i, desc: 'Confidential marker' },
];

const INTERNAL_PATTERNS = [
  { re: /\b(internal|proprietary|do\s+not\s+distribute)\b/i, desc: 'Internal marker' },
  { re: /\b(roadmap|strategy|revenue|margin)\b/i, desc: 'Business-sensitive keyword' },
];

export function classifyData(text: string): ClassificationResult {
  const reasons: string[] = [];

  for (const p of RESTRICTED_PATTERNS) {
    if (p.re.test(text)) reasons.push(p.desc);
  }
  if (reasons.length > 0) return { classification: 'RESTRICTED', reasons, confidence: 0.9 };

  for (const p of CONFIDENTIAL_PATTERNS) {
    if (p.re.test(text)) reasons.push(p.desc);
  }
  if (reasons.length > 0) return { classification: 'CONFIDENTIAL', reasons, confidence: 0.8 };

  for (const p of INTERNAL_PATTERNS) {
    if (p.re.test(text)) reasons.push(p.desc);
  }
  if (reasons.length > 0) return { classification: 'INTERNAL', reasons, confidence: 0.7 };

  return { classification: 'PUBLIC', reasons: ['No sensitive patterns detected'], confidence: 0.95 };
}

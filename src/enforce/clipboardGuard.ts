import { emitGuardEvent } from './evidenceEmitter.js';
export interface ClipboardFinding {
  type: string;
  match: string;
  index: number;
}

export interface ClipboardResult {
  safe: boolean;
  scrubbed: string;
  findings: ClipboardFinding[];
}

const PATTERNS: Array<{ type: string; regex: RegExp; replacement: string }> = [
  { type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
  { type: 'phone', regex: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE_REDACTED]' },
  { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  { type: 'credit_card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CC_REDACTED]' },
  { type: 'api_key', regex: /sk-[A-Za-z0-9]{20,}/g, replacement: '[KEY_REDACTED]' },
  { type: 'aws_key', regex: /AKIA[A-Z0-9]{16}/g, replacement: '[AWS_REDACTED]' },
  { type: 'github_token', regex: /gh[pos]_[A-Za-z0-9]{36,}/g, replacement: '[GH_REDACTED]' },
  { type: 'slack_token', regex: /xox[bprs]-[A-Za-z0-9-]{10,}/g, replacement: '[SLACK_REDACTED]' },
  { type: 'sql', regex: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+(INTO|FROM|TABLE|DATABASE)\b/gi, replacement: '[SQL_REDACTED]' },
];

export function guardClipboard(content: string): ClipboardResult {
  const findings: ClipboardFinding[] = [];
  let scrubbed = content;

  for (const { type, regex, replacement } of PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      findings.push({ type, match: m[0], index: m.index });
    }
    scrubbed = scrubbed.replace(new RegExp(regex.source, regex.flags), replacement);
  }

    const __e31Allowed = findings.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E31', severity: 'medium', decision: __e31Allowed ? 'allow' : 'deny', reason: `E31 ${__e31Allowed ? 'allowed' : 'denied'}` });
  return { safe: findings.length === 0, scrubbed, findings };
}
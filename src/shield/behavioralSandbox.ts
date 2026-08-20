import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
/**
 * Behavioral sandbox — detects evasion patterns in prompts.
 */

export interface SandboxResult {
  passed: boolean;
  evaded: boolean;
  findings: string[];
  runCount: number;
}

const EVASION_PATTERNS: Array<{ re: RegExp; desc: string }> = [
  { re: /\bsetTimeout\b|\bsetInterval\b/i, desc: 'Time-based evasion detected' },
  { re: /process\.env/i, desc: 'Environment detection attempt' },
  { re: /navigator\.userAgent/i, desc: 'User-agent sniffing' },
  { re: /\bwindow\b.*\bundefined\b/i, desc: 'Environment detection via window check' },
  { re: /\bsession\s*count/i, desc: 'Session counting evasion' },
  { re: /\bignore\s+(previous|above|all)\s+(instructions|prompts)/i, desc: 'Instruction override attempt' },
  { re: /\bdo\s+not\s+follow\b/i, desc: 'Instruction negation attempt' },
  { re: /\bjailbreak\b/i, desc: 'Jailbreak keyword' },
];

export function sandboxCheck(prompt: string, _context?: Record<string, string>): SandboxResult {
  const findings: string[] = [];

  for (const pat of EVASION_PATTERNS) {
    if (pat.re.test(prompt)) {
      findings.push(pat.desc);
    }
  }

    const __s2Allowed = findings.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'S2', severity: 'high', decision: __s2Allowed ? 'allow' : 'deny', reason: `S2 ${__s2Allowed ? 'allowed' : 'denied'}` });
  return { passed: findings.length === 0,
    evaded: findings.length > 0,
    findings,
    runCount: 1,
  };
}
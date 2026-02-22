import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface IngressRules {
  maxLength?: number;
  blockedPatterns?: RegExp[];
  rateLimit?: { maxPerMinute: number };
}

export interface IngressResult {
  allowed: boolean;
  sanitized: string;
  blocked: string[];
  rateLimited: boolean;
}

interface RateEntry {
  count: number;
  windowStart: number;
}

export class IngressFilter {
  private rateCounts = new Map<string, RateEntry>();

  checkIngress(input: string, source: string, rules: IngressRules = {}): IngressResult {
    const blocked: string[] = [];
    let sanitized = input;
    let rateLimited = false;

    // Rate limiting
    if (rules.rateLimit) {
      const now = Date.now();
      let entry = this.rateCounts.get(source);
      if (!entry || now - entry.windowStart > 60_000) {
        entry = { count: 0, windowStart: now };
      }
      entry.count++;
      this.rateCounts.set(source, entry);
      if (entry.count > rules.rateLimit.maxPerMinute) {
        rateLimited = true;
      }
    }

    // Length check
    if (rules.maxLength && input.length > rules.maxLength) {
      sanitized = sanitized.slice(0, rules.maxLength);
      blocked.push('input_too_long');
    }

    // Pattern matching
    if (rules.blockedPatterns) {
      for (const pattern of rules.blockedPatterns) {
        const re = new RegExp(pattern.source, pattern.flags);
        if (re.test(sanitized)) {
          blocked.push(pattern.source);
          sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')), '[BLOCKED]');
        }
      }
    }

    const result = { allowed: blocked.length === 0 && !rateLimited, sanitized, blocked, rateLimited };
    emitGuardEvent({
      agentId: source, moduleCode: 'S5',
      decision: result.allowed ? 'allow' : 'deny',
      reason: result.allowed ? 'Ingress allowed' : `Blocked: ${blocked.join(', ')}${rateLimited ? ' (rate limited)' : ''}`,
      severity: result.allowed ? 'low' : 'medium',
      meta: { blocked, rateLimited },
    });
    return result;
  }
}

const defaultIngressFilter = new IngressFilter();

export function checkIngress(input: string, source = 'system', rules: IngressRules = {}): IngressResult {
  return defaultIngressFilter.checkIngress(input, source, rules);
}

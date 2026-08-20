import { emitGuardEvent } from './evidenceEmitter.js';
export interface ProxyRequest {
  url: string;
  headers: Record<string, string>;
  sourceIp?: string;
  method?: string;
}

export interface ProxyGuardResult {
  allowed: boolean;
  upstream: string;
  headers: Record<string, string>;
  reason?: string;
  findings: string[];
}

const INTERNAL_RANGES = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|localhost|::1|\[::1\])$/i;
const CLOUD_METADATA = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200'];

export function validateProxyRequest(req: ProxyRequest): ProxyGuardResult {
  const findings: string[] = [];
  let hostname: string;
  try {
    hostname = new URL(req.url).hostname;
  } catch {
        const __e12Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E12', severity: 'medium', decision: __e12Allowed ? 'allow' : 'deny', reason: `E12 ${__e12Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, upstream: req.url, headers: {}, reason: 'Invalid URL', findings: ['Invalid URL'] };
  }

  if (INTERNAL_RANGES.test(hostname)) {
    findings.push('SSRF: targets internal IP');
        const __e12Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E12', severity: 'medium', decision: __e12Allowed ? 'allow' : 'deny', reason: `E12 ${__e12Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, upstream: hostname, headers: {}, reason: 'Internal IP blocked', findings };
  }

  if (CLOUD_METADATA.includes(hostname)) {
    findings.push('SSRF: targets cloud metadata endpoint');
        const __e12Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E12', severity: 'medium', decision: __e12Allowed ? 'allow' : 'deny', reason: `E12 ${__e12Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, upstream: hostname, headers: {}, reason: 'Cloud metadata blocked', findings };
  }

  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '';
  if (xff) {
    const parts = xff.split(',').map(s => s.trim());
    if (parts.length > 10) findings.push('Excessive X-Forwarded-For hops');
    for (const ip of parts) {
      if (INTERNAL_RANGES.test(ip)) findings.push(`Internal IP in X-Forwarded-For: ${ip}`);
    }
  }

  const origin = req.headers['origin'] || req.headers['Origin'];
  if (origin) {
    try {
      const originHost = new URL(origin).hostname;
      if (INTERNAL_RANGES.test(originHost)) findings.push('Origin header targets internal IP');
    } catch { /* ignore */ }
  }

    const __e12Allowed = findings.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E12', severity: 'medium', decision: __e12Allowed ? 'allow' : 'deny', reason: `E12 ${__e12Allowed ? 'allowed' : 'denied'}` });
  return { allowed: findings.length === 0, upstream: hostname,
    headers: { 'X-Forwarded-By': 'amc-proxy-guard' },
    reason: findings.length > 0 ? findings.join('; ') : undefined,
    findings,
  };
}

export function checkProxy(upstream: string): ProxyGuardResult {
  const blocked = upstream.includes('localhost') || upstream.includes('127.0.0.1') || upstream.includes('169.254.');
    const __e12Allowed = !blocked;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E12', severity: 'medium', decision: __e12Allowed ? 'allow' : 'deny', reason: `E12 ${__e12Allowed ? 'allowed' : 'denied'}` });
  return { allowed: !blocked, upstream,
    headers: { 'X-Forwarded-By': 'amc-proxy-guard' },
    findings: blocked ? ['Blocked internal upstream'] : [],
  };
}
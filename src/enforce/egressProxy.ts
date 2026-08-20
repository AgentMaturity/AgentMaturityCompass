import { emitGuardEvent } from './evidenceEmitter.js';
export interface EgressRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  allowedDomains?: string[];
}

export interface EgressResult {
  allowed: boolean;
  domain: string;
  logged: boolean;
  strippedHeaders: string[];
  auditEntry: { timestamp: number; url: string; method: string; decision: string };
}

const PII_HEADERS = ['cookie', 'set-cookie', 'x-api-key'];

export function checkEgressRequest(request: EgressRequest): EgressResult {
  const { url, method, headers, allowedDomains } = request;
  const strippedHeaders: string[] = [];
  let domain: string;

  try {
    domain = new URL(url).hostname;
  } catch {
        const __e4Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E4', severity: 'high', decision: __e4Allowed ? 'allow' : 'deny', reason: `E4 ${__e4Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, domain: 'invalid', logged: true, strippedHeaders: [],
      auditEntry: { timestamp: Date.now(), url, method, decision: 'blocked:invalid-url' },
    };
  }

  const domainAllowed = !allowedDomains || allowedDomains.length === 0 ||
    allowedDomains.some(d => domain === d || domain.endsWith('.' + d));

  if (!domainAllowed) {
        const __e4Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E4', severity: 'high', decision: __e4Allowed ? 'allow' : 'deny', reason: `E4 ${__e4Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, domain, logged: true, strippedHeaders: [],
      auditEntry: { timestamp: Date.now(), url, method, decision: 'blocked:domain-not-allowed' },
    };
  }

  for (const key of Object.keys(headers)) {
    if (PII_HEADERS.includes(key.toLowerCase())) {
      strippedHeaders.push(key);
    }
    if (key.toLowerCase() === 'authorization' && allowedDomains && !allowedDomains.includes(domain)) {
      strippedHeaders.push(key);
    }
  }

    const __e4Allowed = true;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E4', severity: 'high', decision: __e4Allowed ? 'allow' : 'deny', reason: `E4 ${__e4Allowed ? 'allowed' : 'denied'}` });
  return { allowed: true, domain, logged: true, strippedHeaders,
    auditEntry: { timestamp: Date.now(), url, method, decision: 'allowed' },
  };
}

export function checkEgress(url: string, allowedDomains?: string[]): EgressResult {
  return checkEgressRequest({ url, method: 'GET', headers: {}, allowedDomains });
}
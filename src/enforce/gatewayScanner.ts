import { emitGuardEvent } from './evidenceEmitter.js';
export interface GatewayRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  contentLength?: number;
  sourceIp?: string;
}

export interface GatewayScanResult {
  riskScore: number;
  findings: string[];
  hardened: boolean;
  blocked: boolean;
}

const SQL_PATTERNS = [/('|"|;)\s*(OR|AND|UNION|SELECT|DROP|INSERT|UPDATE|DELETE|EXEC)/i, /--\s*$/, /\/\*.*\*\//];
const PATH_TRAVERSAL = /(\.\.[\/\\]|%2e%2e[\/\\%])/i;
const MAX_PAYLOAD = 10 * 1024 * 1024; // 10MB

export function scanGatewayRequest(req: GatewayRequest): GatewayScanResult {
  const findings: string[] = [];
  let riskScore = 0;

  if (req.contentLength && req.contentLength > MAX_PAYLOAD) {
    findings.push(`Oversized payload: ${req.contentLength} bytes`);
    riskScore += 40;
  }

  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (xff && xff.split(',').length > 5) {
    findings.push('Suspicious X-Forwarded-For chain length');
    riskScore += 25;
  }

  const fullPath = req.path + (req.body || '');
  for (const pattern of SQL_PATTERNS) {
    if (pattern.test(fullPath)) {
      findings.push('Potential SQL injection detected');
      riskScore += 50;
      break;
    }
  }

  if (PATH_TRAVERSAL.test(req.path)) {
    findings.push('Path traversal attempt detected');
    riskScore += 45;
  }

  if (req.method === 'TRACE' || req.method === 'TRACK') {
    findings.push(`Dangerous HTTP method: ${req.method}`);
    riskScore += 30;
  }

  const blocked = riskScore >= 70;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E10', decision: 'allow', reason: 'E10 observation (no allow/deny decision was made here)', severity: 'medium' });
  return { riskScore: Math.min(riskScore, 100), findings, hardened: findings.length === 0, blocked };
}

export function scanGateway(host: string, port: number): GatewayScanResult {
  const findings: string[] = [];
  if (host === '0.0.0.0') findings.push('Bound to all interfaces');
  if (port < 1024 && port !== 443) findings.push('Non-standard privileged port');
  emitGuardEvent({ agentId: 'system', moduleCode: 'E10', decision: 'allow', reason: 'E10 observation (no allow/deny decision was made here)', severity: 'medium' });
  return { riskScore: findings.length * 30, findings, hardened: findings.length === 0, blocked: false };
}
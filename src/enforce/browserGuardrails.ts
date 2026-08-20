import { createHash } from 'node:crypto';
import { emitGuardEvent } from './evidenceEmitter.js';

export interface BrowserAction {
  type: 'navigate' | 'click' | 'form-submit' | 'screenshot';
  url: string;
  allowlist?: string[];
  blocklist?: string[];
}

export interface BrowserGuardrailResult {
  allowed: boolean;
  blockedReason?: string;
  riskScore: number;
}

const DANGEROUS_SCHEMES = /^(file|javascript|data|vbscript|blob):/i;
const INTERNAL_IP = /^(https?:\/\/)?(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|localhost)/i;

export function checkBrowserAction(action: BrowserAction): BrowserGuardrailResult {
  const { type, url, allowlist, blocklist } = action;
  let riskScore = 0;

  if (DANGEROUS_SCHEMES.test(url)) {
        const __e3Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E3', severity: 'high', decision: __e3Allowed ? 'allow' : 'deny', reason: `E3 ${__e3Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, blockedReason: `Dangerous scheme in URL: ${url.split(':')[0]}`, riskScore: 100 };
  }

  if (INTERNAL_IP.test(url)) {
        const __e3Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E3', severity: 'high', decision: __e3Allowed ? 'allow' : 'deny', reason: `E3 ${__e3Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, blockedReason: 'URL targets internal/private IP address', riskScore: 95 };
  }

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
        const __e3Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E3', severity: 'high', decision: __e3Allowed ? 'allow' : 'deny', reason: `E3 ${__e3Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, blockedReason: 'Invalid URL', riskScore: 90 };
  }

  if (blocklist && blocklist.some(b => hostname.endsWith(b))) {
        const __e3Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E3', severity: 'high', decision: __e3Allowed ? 'allow' : 'deny', reason: `E3 ${__e3Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, blockedReason: `Domain ${hostname} is blocklisted`, riskScore: 85 };
  }

  if (allowlist && allowlist.length > 0 && !allowlist.some(a => hostname.endsWith(a))) {
        const __e3Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E3', severity: 'high', decision: __e3Allowed ? 'allow' : 'deny', reason: `E3 ${__e3Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, blockedReason: `Domain ${hostname} not in allowlist`, riskScore: 70 };
  }

  if (type === 'form-submit') riskScore += 30;
  else if (type === 'navigate') riskScore += 10;
  else if (type === 'click') riskScore += 5;

  if (url.includes('..')) riskScore += 20;
  if (url.length > 2000) riskScore += 15;

    const __e3Allowed = true;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E3', severity: 'high', decision: __e3Allowed ? 'allow' : 'deny', reason: `E3 ${__e3Allowed ? 'allowed' : 'denied'}` });
  return { allowed: true, riskScore };
}

export function checkBrowserNavigation(url: string): BrowserGuardrailResult {
  return checkBrowserAction({ type: 'navigate', url });
}
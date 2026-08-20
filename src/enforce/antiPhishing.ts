import { emitGuardEvent } from './evidenceEmitter.js';
export interface ApprovalCheckRequest {
  senderName: string;
  senderEmail?: string;
  subject: string;
  body: string;
  urls?: string[];
}

export interface PhishingResult {
  isPhishing: boolean;
  indicators: string[];
  confidence: number;
}

const URGENCY_WORDS = /\b(urgent|immediately|asap|expire|suspend|verify now|act now|limited time|last chance|warning|alert)\b/i;
const IMPERSONATION = /\b(admin|support|helpdesk|security|ceo|cfo|executive|payroll|it department)\b/i;
const HOMOGLYPHS: Record<string, string> = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'і': 'i', 'ј': 'j', 'ʏ': 'y' };

function hasHomoglyphs(text: string): boolean {
  for (const char of text) {
    if (HOMOGLYPHS[char]) return true;
  }
  return false;
}

export function checkApprovalRequest(request: ApprovalCheckRequest): PhishingResult {
  const indicators: string[] = [];
  const text = `${request.subject} ${request.body}`;

  if (URGENCY_WORDS.test(text)) indicators.push('Urgency language detected');
  if (IMPERSONATION.test(request.senderName)) indicators.push('Potential impersonation in sender name');

  if (hasHomoglyphs(request.senderName) || hasHomoglyphs(text)) {
    indicators.push('Homoglyph characters detected');
  }

  if (request.urls) {
    for (const url of request.urls) {
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) indicators.push('IP-based URL');
      if (url.includes('@')) indicators.push('URL contains @ symbol');
      if (url.split('.').length > 5) indicators.push('Excessive subdomains');
      try {
        const u = new URL(url);
        if (u.hostname !== u.hostname.toLowerCase()) indicators.push('Mixed case in URL hostname');
      } catch { /* ignore */ }
    }
  }

  if (request.senderEmail) {
    const [, domain] = request.senderEmail.split('@');
    if (domain && /\d{5,}/.test(domain)) indicators.push('Suspicious numeric domain');
    if (domain && domain.split('.').length > 4) indicators.push('Excessive domain levels in sender');
  }

  if (/-(login|signin|verify|secure|update)/i.test(text)) indicators.push('Suspicious keywords');

  const confidence = Math.min(indicators.length * 0.2, 1);
    const __e16Allowed = !(indicators.length >= 2);
  emitGuardEvent({ agentId: 'system', moduleCode: 'E16', severity: 'high', decision: __e16Allowed ? 'allow' : 'deny', reason: `E16 ${__e16Allowed ? 'allowed' : 'denied'}` });
  return { isPhishing: indicators.length >= 2, indicators, confidence };
}

export function checkPhishing(url: string): PhishingResult {
  return checkApprovalRequest({ senderName: '', subject: '', body: '', urls: [url] });
}
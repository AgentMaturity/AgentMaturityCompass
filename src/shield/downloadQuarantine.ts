/**
 * Download quarantine — validates downloads before allowing.
 */

import { createHash } from 'node:crypto';
import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface QuarantineResult {
  allowed: boolean;
  reason: string;
  hash: string;
}

const BLOCKED_DOMAINS = ['malware.example.com', 'phishing.example.org'];
const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.ps1', '.msi', '.scr']);

export function quarantineCheck(url: string, filename: string): QuarantineResult {
  const hash = createHash('sha256').update(`${url}:${filename}`).digest('hex');

  for (const domain of BLOCKED_DOMAINS) {
    if (url.includes(domain)) {
            const __s13Allowed = false;
      emitGuardEvent({ agentId: 'system', moduleCode: 'S13', severity: 'high', decision: __s13Allowed ? 'allow' : 'deny', reason: `S13 ${__s13Allowed ? 'allowed' : 'denied'}` });
      return { allowed: false, reason: `Blocked domain: ${domain}`, hash };
    }
  }

  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
        const __s13Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'S13', severity: 'high', decision: __s13Allowed ? 'allow' : 'deny', reason: `S13 ${__s13Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, reason: `Blocked file extension: ${ext}`, hash };
  }

  if (!url.startsWith('https://')) {
        const __s13Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'S13', severity: 'high', decision: __s13Allowed ? 'allow' : 'deny', reason: `S13 ${__s13Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, reason: 'Non-HTTPS download blocked', hash };
  }

    const __s13Allowed = true;
  emitGuardEvent({ agentId: 'system', moduleCode: 'S13', severity: 'high', decision: __s13Allowed ? 'allow' : 'deny', reason: `S13 ${__s13Allowed ? 'allowed' : 'denied'}` });
  return { allowed: true, reason: 'Passed quarantine checks', hash };
}
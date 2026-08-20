/**
 * UI session fingerprinting — generates deterministic fingerprints for sessions.
 */

import { createHash } from 'node:crypto';
import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface FingerprintResult {
  sessionId: string;
  fingerprint: string;
  anomalies: string[];
}

export function fingerprint(sessionData: Record<string, unknown>): FingerprintResult {
  const anomalies: string[] = [];
  const sessionId = (sessionData['sessionId'] as string) ?? 'unknown';

  // Check for anomalies
  if (!sessionData['userAgent']) anomalies.push('Missing user agent');
  if (!sessionData['language']) anomalies.push('Missing language preference');
  if (sessionData['timezone'] === undefined) anomalies.push('Missing timezone');

  const sorted = JSON.stringify(sessionData, Object.keys(sessionData).sort());
  const fp = createHash('sha256').update(sorted).digest('hex').slice(0, 16);

  emitGuardEvent({ agentId: 'system', moduleCode: 'S16', decision: 'allow', reason: 'S16 observation (no allow/deny decision was made here)', severity: 'medium' });
  return { sessionId, fingerprint: fp, anomalies };
}
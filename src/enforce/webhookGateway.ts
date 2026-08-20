import { createHmac } from 'node:crypto';
import { emitGuardEvent } from './evidenceEmitter.js';

export interface WebhookValidation {
  valid: boolean;
  source: string;
  replayDetected: boolean;
  reason?: string;
}

const seenSignatures = new Set<string>();
const MAX_SEEN = 10000;
const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

export function verifyWebhook(payload: string, signature: string, secret: string, timestamp?: number): WebhookValidation {
  if (timestamp) {
    const age = Math.abs(Date.now() - timestamp);
    if (age > FRESHNESS_WINDOW_MS) {
            const __e14Allowed = false;
      emitGuardEvent({ agentId: 'system', moduleCode: 'E14', severity: 'medium', decision: __e14Allowed ? 'allow' : 'deny', reason: `E14 ${__e14Allowed ? 'allowed' : 'denied'}` });
      return { valid: false, source: 'unknown', replayDetected: false, reason: 'Timestamp outside freshness window' };
    }
  }

  if (seenSignatures.has(signature)) {
        const __e14Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E14', severity: 'medium', decision: __e14Allowed ? 'allow' : 'deny', reason: `E14 ${__e14Allowed ? 'allowed' : 'denied'}` });
    return { valid: false, source: 'unknown', replayDetected: true, reason: 'Replay detected' };
  }

  const dataToSign = timestamp ? `${timestamp}.${payload}` : payload;
  const expected = createHmac('sha256', secret).update(dataToSign).digest('hex');

  const sigValue = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  if (sigValue.length !== expected.length) {
        const __e14Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E14', severity: 'medium', decision: __e14Allowed ? 'allow' : 'deny', reason: `E14 ${__e14Allowed ? 'allowed' : 'denied'}` });
    return { valid: false, source: 'unknown', replayDetected: false, reason: 'Invalid signature' };
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ sigValue.charCodeAt(i);
  }

  if (mismatch !== 0) {
        const __e14Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E14', severity: 'medium', decision: __e14Allowed ? 'allow' : 'deny', reason: `E14 ${__e14Allowed ? 'allowed' : 'denied'}` });
    return { valid: false, source: 'unknown', replayDetected: false, reason: 'Signature mismatch' };
  }

  if (seenSignatures.size >= MAX_SEEN) seenSignatures.clear();
  seenSignatures.add(signature);

    const __e14Allowed = true;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E14', severity: 'medium', decision: __e14Allowed ? 'allow' : 'deny', reason: `E14 ${__e14Allowed ? 'allowed' : 'denied'}` });
  return { valid: true, source: 'verified', replayDetected: false };
}

export function validateWebhook(source: string, signature: string, body: string): WebhookValidation {
    const __e14Allowed = signature.length > 10;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E14', severity: 'medium', decision: __e14Allowed ? 'allow' : 'deny', reason: `E14 ${__e14Allowed ? 'allowed' : 'denied'}` });
  return { valid: signature.length > 10, source, replayDetected: false };
}
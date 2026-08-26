import { emitGuardEvent } from './evidenceEmitter.js';
import { redactSecrets } from '../shield/redaction/redactSecrets.js';

export interface SecretBlindResult {
  blinded: string;
  secretsFound: number;
  findings: Array<{ type: string; index: number }>;
}


/**
 * Blind secrets in text, naming the kind of each.
 *
 * Delegates to the shared table (P5.3). This module used to carry its own 13
 * patterns and missed Anthropic, Google and xAI keys plus AMC's own lease and
 * token formats — all of which `bridgeRedaction` caught. Measured across
 * eighteen samples, the two engines disagreed on fifteen.
 *
 * The typed placeholder stays: callers here act on WHICH kind of secret leaked,
 * where a durable bridge row deliberately does not say.
 */
export function blindSecrets(text: string, extraPatterns?: RegExp[]): SecretBlindResult {
  const { redacted, findings } = redactSecrets(
    text,
    (type) => `[SECRET_BLIND:${type}]`,
    extraPatterns ?? [],
  );
  const secretsFound = findings.length;

  emitGuardEvent({
    agentId: 'system', moduleCode: 'E3',
    decision: secretsFound > 0 ? 'warn' : 'allow',
    reason: secretsFound > 0 ? `Found ${secretsFound} secrets` : 'No secrets found',
    severity: secretsFound > 0 ? 'high' : 'low',
    meta: { secretsFound, types: findings.map(f => f.type) },
  });
  return { blinded: redacted, secretsFound, findings: findings.map((f) => ({ type: f.type, index: f.index })) };
}

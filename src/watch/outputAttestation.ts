/**
 * Output attestation — hashes and timestamps agent outputs.
 *
 * This produces a content hash, not a cryptographic attestation. The result
 * previously carried `signed: true` although no signature was ever computed,
 * so a caller could reasonably believe the output had been signed. Real signing
 * requires a workspace vault key; use src/crypto/signing for that.
 */

import { createHash, randomUUID } from 'node:crypto';

export interface AttestationResult {
  attestationId: string;
  hash: string;
  timestamp: number;
  /**
   * Always false: this function does not sign. Retained so existing readers see
   * an explicit negative rather than a missing field.
   */
  signed: false;
  /** Names what the hash covers, so it is not mistaken for an attestation. */
  algorithm: 'sha256';
}

export function attestOutput(output: string, _agentId?: string): AttestationResult {
  return {
    attestationId: randomUUID(),
    hash: createHash('sha256').update(output).digest('hex'),
    timestamp: Date.now(),
    signed: false,
    algorithm: 'sha256',
  };
}

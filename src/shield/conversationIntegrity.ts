/**
 * Conversation integrity — hash-chain verification of message turns.
 *
 * Tamper detection requires something to compare against. The previous
 * implementation built a chain hash, never compared it to anything, and never
 * pushed to `tamperedTurns` — so `valid` was unconditionally true and every
 * conversation passed, including tampered ones. It also emitted a guard event
 * hardcoded to `allow` regardless of outcome.
 *
 * Call `recordIntegrity` once to capture a baseline, then `checkIntegrity` with
 * that baseline to detect modification. Without a baseline the result is
 * reported as unverified rather than valid.
 */

import { createHash } from 'node:crypto';
import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface ConversationTurn {
  role: string;
  content: string;
}

/** Per-turn chain hashes captured when the conversation was trusted. */
export interface IntegrityBaseline {
  /** Chain hash after each turn, in order. */
  turnHashes: string[];
  /** Chain hash covering the whole conversation. */
  hash: string;
}

export interface IntegrityResult {
  /**
   * True only when a baseline was supplied and every turn matched it. False
   * when tampering was detected. Null when no baseline was available, so
   * nothing could be verified.
   */
  valid: boolean | null;
  /** Whether a baseline was supplied at all. */
  verified: boolean;
  /** Indices of turns whose content diverges from the baseline. */
  tamperedTurns: number[];
  hash: string;
}

/** Computes the chain hash after each turn. */
function chainHashes(messages: ConversationTurn[]): string[] {
  const hashes: string[] = [];
  let chainHash = '';
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const turnData = `${i}:${msg.role}:${msg.content}`;
    chainHash = createHash('sha256').update(chainHash + turnData).digest('hex');
    hashes.push(chainHash);
  }
  return hashes;
}

/** Captures a baseline for a conversation that is currently trusted. */
export function recordIntegrity(messages: ConversationTurn[]): IntegrityBaseline {
  const turnHashes = chainHashes(messages);
  return {
    turnHashes,
    hash: turnHashes[turnHashes.length - 1] ?? ''
  };
}

/**
 * Verifies a conversation against a previously recorded baseline.
 *
 * @param baseline Recorded hashes. Omitted means nothing can be verified, and
 * the result says so instead of claiming validity.
 */
export function checkIntegrity(
  messages: ConversationTurn[],
  baseline?: IntegrityBaseline
): IntegrityResult {
  const turnHashes = chainHashes(messages);
  const hash = turnHashes[turnHashes.length - 1] ?? '';

  if (!baseline) {
    emitGuardEvent({
      agentId: 'system',
      moduleCode: 'S14',
      decision: 'allow',
      reason: 'conversation integrity not verified: no baseline supplied',
      severity: 'medium'
    });
    return { valid: null, verified: false, tamperedTurns: [], hash };
  }

  const tamperedTurns: number[] = [];
  const compareLength = Math.max(turnHashes.length, baseline.turnHashes.length);
  for (let i = 0; i < compareLength; i++) {
    // A missing turn on either side is a divergence: turns were added or removed.
    if (turnHashes[i] !== baseline.turnHashes[i]) {
      tamperedTurns.push(i);
    }
  }

  const valid = tamperedTurns.length === 0;
  // Report the decision that was actually reached, not a fixed 'allow'.
  emitGuardEvent({
    agentId: 'system',
    moduleCode: 'S14',
    decision: valid ? 'allow' : 'deny',
    reason: valid
      ? 'conversation integrity verified against baseline'
      : `conversation integrity failed: ${tamperedTurns.length} turn(s) diverge from baseline`,
    severity: valid ? 'medium' : 'high'
  });

  return { valid, verified: true, tamperedTurns, hash };
}

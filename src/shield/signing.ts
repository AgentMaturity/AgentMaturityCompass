import { generateKeyPairSync, sign, verify, KeyObject, createHash } from 'node:crypto';
import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface SignResult {
  signature: Buffer;
  signedAt: string;
  algorithm: string;
}

export interface VerifyResult {
  valid: boolean;
  algorithm: string;
  verifiedAt: string;
}

export function generateKeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync('ed25519');
}

export function signSkill(skillCode: string, privateKey: KeyObject): SignResult {
  const data = Buffer.from(skillCode, 'utf-8');
  const signature = sign(null, data, privateKey);
  emitGuardEvent({ agentId: 'system', moduleCode: 'S3', decision: 'allow', reason: 'S3 observation (no allow/deny decision was made here)', severity: 'high' });
  return {
    signature,
    signedAt: new Date().toISOString(),
    algorithm: 'ed25519',
  };
}

export function verifySkill(skillCode: string, signature: Buffer, publicKey: KeyObject): VerifyResult {
  const data = Buffer.from(skillCode, 'utf-8');
  const valid = verify(null, data, publicKey, signature);
  emitGuardEvent({ agentId: 'system', moduleCode: 'S3', decision: 'allow', reason: 'S3 observation (no allow/deny decision was made here)', severity: 'high' });
  return {
    valid,
    algorithm: 'ed25519',
    verifiedAt: new Date().toISOString(),
  };
}
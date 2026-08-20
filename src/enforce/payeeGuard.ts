import { emitGuardEvent } from './evidenceEmitter.js';
/**
 * Payment/payee guard.
 */

export interface PayeeCheckResult {
  safe: boolean;
  flags: string[];
  riskScore: number;
}

export function checkPayee(payee: { name: string; account?: string; amount?: number }): PayeeCheckResult {
  const flags: string[] = [];
  let riskScore = 0;

  if (!payee.name || payee.name.trim().length < 2) { flags.push('Payee name too short'); riskScore += 20; }
  if (payee.amount !== undefined && payee.amount > 10000) { flags.push('High-value transaction'); riskScore += 15; }
  if (payee.amount !== undefined && payee.amount < 0) { flags.push('Negative amount'); riskScore += 30; }
  if (payee.account && !/^\d{6,20}$/.test(payee.account)) { flags.push('Unusual account format'); riskScore += 10; }
  if (/test|dummy|fake/i.test(payee.name)) { flags.push('Suspicious payee name'); riskScore += 25; }

  riskScore = Math.min(100, riskScore);
    const __e20Allowed = riskScore < 30;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E20', severity: 'high', decision: __e20Allowed ? 'allow' : 'deny', reason: `E20 ${__e20Allowed ? 'allowed' : 'denied'}` });
  return { safe: riskScore < 30, flags, riskScore };
}
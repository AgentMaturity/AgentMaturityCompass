import { emitGuardEvent } from './evidenceEmitter.js';
import { sha256Hex } from '../utils/hash.js';
import { parseShellCommandPlan, type ShellCommandPlan } from './shellCommandPlan.js';
/**
 * Shell execution guard — blocks dangerous commands.
 */


export interface ExecGuardResult {
  allowed: boolean;
  blockedPattern?: string;
  commandPlan: ShellCommandPlan;
}

const BLOCKED_PATTERNS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  'curl | bash',
  'curl | sh',
  'wget | bash',
  'wget | sh',
  '>/etc/',
  'dd if=',
  'mkfs',
  ':(){:|:&};:',
  'chmod 777 /',
  'chmod -R 777',
  '> /dev/sda',
  'mv /* /dev/null',
];

export function checkExec(command: string): ExecGuardResult {
  const commandPlan = parseShellCommandPlan(command);
  const safeMeta = {
    commandSha256: sha256Hex(Buffer.from(command, 'utf8')),
    parseStatus: commandPlan.status,
    compound: commandPlan.compound,
    segmentCount: commandPlan.segments.length,
    reasonCodes: commandPlan.reasonCodes,
    rawCommandStored: false,
  };
  if (commandPlan.status === 'invalid') {
    const blockedPattern = commandPlan.reasonCodes[0] ?? 'COMMAND_SYNTAX_UNSUPPORTED';
    emitGuardEvent({
      agentId: 'system',
      moduleCode: 'E2',
      decision: 'deny',
      reason: `Command plan rejected: ${blockedPattern}`,
      severity: 'critical',
      meta: { ...safeMeta, blockedPattern },
    });
    return { allowed: false, blockedPattern, commandPlan };
  }

  const candidates = [
    command,
    ...commandPlan.segments.map((segment) => [segment.binary, ...segment.argv].join(' ')),
  ].map((candidate) => candidate.toLowerCase().replace(/\s+/g, ' '));
  for (const pattern of BLOCKED_PATTERNS) {
    if (candidates.some((candidate) => candidate.includes(pattern.toLowerCase()))) {
      emitGuardEvent({
        agentId: 'system',
        moduleCode: 'E2',
        decision: 'deny',
        reason: `Blocked pattern: ${pattern}`,
        severity: 'critical',
        meta: { ...safeMeta, blockedPattern: pattern },
      });
      return { allowed: false, blockedPattern: pattern, commandPlan };
    }
  }
  emitGuardEvent({
    agentId: 'system',
    moduleCode: 'E2',
    decision: 'allow',
    reason: 'Command allowed',
    severity: 'low',
    meta: safeMeta,
  });
  return { allowed: true, commandPlan };
}

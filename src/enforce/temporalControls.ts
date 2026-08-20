import { emitGuardEvent } from './evidenceEmitter.js';
export interface TemporalPolicy {
  allowedHours?: { start: number; end: number };
  allowedDays?: number[];
  timezone?: string;
  cooldownMs?: number;
  maintenanceWindows?: Array<{ start: number; end: number }>;
}

export interface TemporalResult {
  allowed: boolean;
  reason: string;
  nextAllowedTime?: number;
}

const cooldownTracker = new Map<string, number>();

export function checkTemporalAccess(action: string, policy: TemporalPolicy): TemporalResult {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  if (policy.allowedHours) {
    const { start, end } = policy.allowedHours;
    if (start < end) {
      if (hour < start || hour >= end) {
                const __e27Allowed = false;
        emitGuardEvent({ agentId: 'system', moduleCode: 'E27', severity: 'medium', decision: __e27Allowed ? 'allow' : 'deny', reason: `E27 ${__e27Allowed ? 'allowed' : 'denied'}` });
        return { allowed: false, reason: `Outside allowed hours (${start}-${end})`, nextAllowedTime: start };
      }
    } else {
      if (hour < start && hour >= end) {
                const __e27Allowed = false;
        emitGuardEvent({ agentId: 'system', moduleCode: 'E27', severity: 'medium', decision: __e27Allowed ? 'allow' : 'deny', reason: `E27 ${__e27Allowed ? 'allowed' : 'denied'}` });
        return { allowed: false, reason: `Outside allowed hours (${start}-${end} wrap)`, nextAllowedTime: start };
      }
    }
  }

  if (policy.allowedDays && !policy.allowedDays.includes(day)) {
        const __e27Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E27', severity: 'medium', decision: __e27Allowed ? 'allow' : 'deny', reason: `E27 ${__e27Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, reason: `Day ${day} not in allowed days` };
  }

  if (policy.maintenanceWindows) {
    const ts = now.getTime();
    for (const w of policy.maintenanceWindows) {
      if (ts >= w.start && ts <= w.end) {
                const __e27Allowed = false;
        emitGuardEvent({ agentId: 'system', moduleCode: 'E27', severity: 'medium', decision: __e27Allowed ? 'allow' : 'deny', reason: `E27 ${__e27Allowed ? 'allowed' : 'denied'}` });
        return { allowed: false, reason: 'Within maintenance window' };
      }
    }
  }

  if (policy.cooldownMs) {
    const lastExec = cooldownTracker.get(action);
    if (lastExec && (now.getTime() - lastExec) < policy.cooldownMs) {
      const remaining = policy.cooldownMs - (now.getTime() - lastExec);
            const __e27Allowed = false;
      emitGuardEvent({ agentId: 'system', moduleCode: 'E27', severity: 'medium', decision: __e27Allowed ? 'allow' : 'deny', reason: `E27 ${__e27Allowed ? 'allowed' : 'denied'}` });
      return { allowed: false, reason: `Cooldown active, ${remaining}ms remaining` };
    }
    cooldownTracker.set(action, now.getTime());
  }

    const __e27Allowed = true;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E27', severity: 'medium', decision: __e27Allowed ? 'allow' : 'deny', reason: `E27 ${__e27Allowed ? 'allowed' : 'denied'}` });
  return { allowed: true, reason: 'Within allowed temporal window' };
}
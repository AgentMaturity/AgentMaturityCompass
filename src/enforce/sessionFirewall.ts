/** Session firewall. Not enforced: no hook, tool or Studio path calls it, so its results change no decision. */
import { emitGuardEvent } from './evidenceEmitter.js';

export type SessionState = 'active' | 'suspended' | 'terminated';

export interface SessionRecord {
  sessionId: string;
  state: SessionState;
  createdAt: number;
  lastActivity: number;
  metadata: Record<string, string>;
}

export interface SessionFirewallResult {
  allowed: boolean;
  reason: string;
}

export class SessionFirewall {
  private sessions = new Map<string, SessionRecord>();

  createSession(sessionId: string, metadata: Record<string, string> = {}): SessionRecord {
    const record: SessionRecord = {
      sessionId, state: 'active', createdAt: Date.now(), lastActivity: Date.now(), metadata,
    };
    this.sessions.set(sessionId, record);
    return record;
  }

  checkSession(sessionId: string, action: string): SessionFirewallResult {
    const session = this.sessions.get(sessionId);
    let result: SessionFirewallResult;
    if (!session) { result = { allowed: false, reason: 'Session not found' }; }
    else if (session.state === 'terminated') {
      result = { allowed: false, reason: 'Session is terminated' };
    } else if (session.state === 'suspended') {
      result = action === 'read'
        ? { allowed: true, reason: 'Read allowed in suspended state' }
        : { allowed: false, reason: 'Only read actions allowed in suspended state' };
    } else {
      session.lastActivity = Date.now();
      result = { allowed: true, reason: 'Session is active' };
    }
    emitGuardEvent({
      agentId: sessionId, moduleCode: 'E8',
      decision: result.allowed ? 'allow' : 'deny',
      reason: result.reason,
      severity: result.allowed ? 'low' : 'medium',
      meta: { action },
    });
    return result;
  }

  suspendSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'active') return false;
    session.state = 'suspended';
    return true;
  }

  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state === 'terminated') return false;
    session.state = 'terminated';
    return true;
  }

  getState(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId)?.state ?? null;
  }
}

const defaultFirewall = new SessionFirewall();

export function checkSessionTransfer(fromSession: string, toSession: string): SessionFirewallResult {
  const fromState = defaultFirewall.getState(fromSession);
  if (fromState === 'terminated' || fromState === 'suspended') {
    return { allowed: false, reason: 'Source session is not active' };
  }
  const samePrefix = fromSession.split('-')[0] === toSession.split('-')[0];
  return { allowed: samePrefix, reason: samePrefix ? 'Same trust boundary' : 'Cross-boundary transfer blocked' };
}

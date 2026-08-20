import { emitGuardEvent } from './evidenceEmitter.js';
export interface WatchdogConfig {
  timeoutMs: number;
  onTimeout?: string;
}

export interface WatchdogHandle {
  watchdogId: string;
  name: string;
  config: WatchdogConfig;
  createdAt: number;
  lastSeen: number;
}

export interface WatchdogStatus {
  alive: boolean;
  watchdogId: string;
  lastSeen: number;
  elapsed: number;
  timeoutMs: number;
}

export interface WatchdogDecision {
  approved: boolean;
  requiresEvidence: boolean;
  riskScore: number;
}

export class WatchdogManager {
  private watchdogs = new Map<string, WatchdogHandle>();
  private counter = 0;

  createWatchdog(name: string, config: WatchdogConfig): WatchdogHandle {
    const id = `wd_${Date.now()}_${++this.counter}`;
    const now = Date.now();
    const handle: WatchdogHandle = { watchdogId: id, name, config, createdAt: now, lastSeen: now };
    this.watchdogs.set(id, handle);
    return handle;
  }

  heartbeat(watchdogId: string): boolean {
    const wd = this.watchdogs.get(watchdogId);
    if (!wd) return false;
    wd.lastSeen = Date.now();
    return true;
  }

  check(watchdogId: string): WatchdogStatus | null {
    const wd = this.watchdogs.get(watchdogId);
    if (!wd) return null;
    const elapsed = Date.now() - wd.lastSeen;
    return { alive: elapsed < wd.config.timeoutMs, watchdogId, lastSeen: wd.lastSeen, elapsed, timeoutMs: wd.config.timeoutMs };
  }

  remove(watchdogId: string): boolean {
    return this.watchdogs.delete(watchdogId);
  }

  getAll(): WatchdogHandle[] {
    return [...this.watchdogs.values()];
  }

  checkAll(): WatchdogStatus[] {
    return [...this.watchdogs.keys()].map(id => this.check(id)!).filter(Boolean);
  }
}

const defaultManager = new WatchdogManager();

export function watchdogReview(toolName: string, _params: Record<string, unknown>): WatchdogDecision {
  const highRisk = ['send_payment', 'delete', 'deploy'].includes(toolName);
    const __e33Allowed = !highRisk;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E33', severity: 'high', decision: __e33Allowed ? 'allow' : 'deny', reason: `E33 ${__e33Allowed ? 'allowed' : 'denied'}` });
  return { approved: !highRisk, requiresEvidence: highRisk, riskScore: highRisk ? 85 : 20 };
}
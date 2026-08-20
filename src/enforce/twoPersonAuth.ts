import { emitGuardEvent } from './evidenceEmitter.js';
export interface PendingApproval {
  actionId: string;
  action: string;
  requesterId: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export interface TwoPersonResult {
  approved: boolean;
  approvals: number;
  required: number;
  actionId?: string;
  reason?: string;
}

export class TwoPersonAuth {
  private pending = new Map<string, PendingApproval>();
  private counter = 0;

  requestApproval(action: string, requesterId: string): PendingApproval {
    const actionId = `tpa_${Date.now()}_${++this.counter}`;
    const record: PendingApproval = { actionId, action, requesterId, requestedAt: Date.now(), status: 'pending' };
    this.pending.set(actionId, record);
    return record;
  }

  approveAction(actionId: string, approverId: string): TwoPersonResult {
    const record = this.pending.get(actionId);
    if (!record) return { approved: false, approvals: 0, required: 2, reason: 'Action not found' };
    if (record.status !== 'pending') return { approved: false, approvals: 0, required: 2, reason: `Action already ${record.status}` };
    if (record.requesterId === approverId) return { approved: false, approvals: 1, required: 2, reason: 'Approver must be different from requester' };
    record.status = 'approved';
    return { approved: true, approvals: 2, required: 2, actionId };
  }

  rejectAction(actionId: string, approverId: string): TwoPersonResult {
    const record = this.pending.get(actionId);
    if (!record) return { approved: false, approvals: 0, required: 2, reason: 'Action not found' };
    if (record.requesterId === approverId) return { approved: false, approvals: 0, required: 2, reason: 'Reviewer must be different from requester' };
    record.status = 'rejected';
    return { approved: false, approvals: 0, required: 2, actionId };
  }

  cancelRequest(actionId: string): boolean {
    const record = this.pending.get(actionId);
    if (!record || record.status !== 'pending') return false;
    record.status = 'cancelled';
    return true;
  }

  getPending(): PendingApproval[] {
    return [...this.pending.values()].filter(p => p.status === 'pending');
  }
}

const defaultAuth = new TwoPersonAuth();

export function checkTwoPersonApproval(approvals: string[]): TwoPersonResult {
  const unique = new Set(approvals).size;
    const __e19Allowed = unique >= 2;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E19', severity: 'high', decision: __e19Allowed ? 'allow' : 'deny', reason: `E19 ${__e19Allowed ? 'allowed' : 'denied'}` });
  return { approved: unique >= 2, approvals: unique, required: 2 };
}
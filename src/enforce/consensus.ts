import { emitGuardEvent } from './evidenceEmitter.js';
export interface ProposalRecord {
  proposalId: string;
  proposal: string;
  voterIds: string[];
  votes: Map<string, boolean>;
  createdAt: number;
  status: 'open' | 'closed';
}

export interface VoteResult {
  accepted: boolean;
  reason?: string;
  currentTally: { approve: number; deny: number; pending: number };
}

export interface ConsensusResult {
  agreed: boolean;
  votes: number;
  threshold: number;
  agreement: number;
  proposalId?: string;
  status?: string;
}

export class ConsensusManager {
  private proposals = new Map<string, ProposalRecord>();
  private counter = 0;

  propose(proposal: string, voterIds: string[]): ProposalRecord {
    const id = `prop_${Date.now()}_${++this.counter}`;
    const record: ProposalRecord = {
      proposalId: id, proposal, voterIds, votes: new Map(), createdAt: Date.now(), status: 'open',
    };
    this.proposals.set(id, record);
    return record;
  }

  vote(proposalId: string, voterId: string, vote: boolean): VoteResult {
    const record = this.proposals.get(proposalId);
    if (!record) return { accepted: false, reason: 'Proposal not found', currentTally: { approve: 0, deny: 0, pending: 0 } };
    if (record.status !== 'open') return { accepted: false, reason: 'Proposal is closed', currentTally: this.tally(record) };
    if (!record.voterIds.includes(voterId)) return { accepted: false, reason: 'Not an eligible voter', currentTally: this.tally(record) };
    if (record.votes.has(voterId)) return { accepted: false, reason: 'Already voted', currentTally: this.tally(record) };

    record.votes.set(voterId, vote);

    if (record.votes.size === record.voterIds.length) record.status = 'closed';

    return { accepted: true, currentTally: this.tally(record) };
  }

  getResult(proposalId: string): ConsensusResult {
    const record = this.proposals.get(proposalId);
    if (!record) return { agreed: false, votes: 0, threshold: 0.5, agreement: 0 };

    const tally = this.tally(record);
    const total = tally.approve + tally.deny;
    const agreement = total > 0 ? tally.approve / total : 0;

    return {
      agreed: agreement > 0.5 && tally.pending === 0,
      votes: total,
      threshold: 0.5,
      agreement,
      proposalId,
      status: record.status,
    };
  }

  private tally(record: ProposalRecord) {
    let approve = 0, deny = 0;
    for (const v of record.votes.values()) { if (v) approve++; else deny++; }
    return { approve, deny, pending: record.voterIds.length - record.votes.size };
  }
}

const defaultManager = new ConsensusManager();

export function checkConsensus(votes: Array<{ verdict: 'approve' | 'deny'; confidence: number }>, threshold?: number): ConsensusResult {
  const t = threshold ?? 0.8;
  const approvals = votes.filter(v => v.verdict === 'approve').length;
  const agreement = votes.length > 0 ? approvals / votes.length : 0;
    const __e34Allowed = agreement >= t;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E34', severity: 'medium', decision: __e34Allowed ? 'allow' : 'deny', reason: `E34 ${__e34Allowed ? 'allowed' : 'denied'}` });
  return { agreed: agreement >= t, votes: votes.length, threshold: t, agreement };
}
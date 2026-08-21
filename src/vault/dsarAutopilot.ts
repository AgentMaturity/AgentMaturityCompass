/**
 * DSAR (Data Subject Access Request) automation.
 */

import { randomUUID } from 'node:crypto';

export interface DsarRequest {
  requestId: string;
  subject: string;
  type: 'access' | 'delete' | 'portability';
  /**
   * 'complete' requires a fulfilment handler to have actually accessed,
   * exported or erased the subject's data. 'awaiting-fulfilment' means the
   * request is recorded but nothing has been done yet.
   */
  status: 'pending' | 'processing' | 'awaiting-fulfilment' | 'complete';
  createdTs: number;
  updatedTs: number;
  completedTs: number | null;
  /** What the fulfilment handler reported doing, when one ran. */
  fulfilment?: DsarFulfilmentRecord;
}

/** Evidence that a request was actually carried out. */
export interface DsarFulfilmentRecord {
  /** Who or what performed the work. */
  performedBy: string;
  /** Systems the handler touched. */
  systems: string[];
  /** Records accessed, exported or erased. */
  recordsAffected: number;
  performedTs: number;
}

/**
 * Performs the real data access, export or erasure for a request.
 *
 * AMC does not know where a subject's data lives, so fulfilment must be
 * supplied by the deploying system.
 */
export type DsarFulfilmentHandler = (
  request: DsarRequest
) => DsarFulfilmentRecord | Promise<DsarFulfilmentRecord>;

export interface DsarAutopilotSnapshot {
  v: 1;
  requests: DsarRequest[];
}

export interface DsarAutopilotOptions {
  requests?: DsarRequest[];
  now?: () => number;
  requestIdFactory?: () => string;
}

export class DsarAutopilot {
  private requests = new Map<string, DsarRequest>();
  private readonly now: () => number;
  private readonly requestIdFactory: () => string;

  constructor(options: DsarAutopilotOptions = {}) {
    this.now = options.now ?? Date.now;
    this.requestIdFactory = options.requestIdFactory ?? randomUUID;
    for (const request of options.requests ?? []) {
      this.requests.set(request.requestId, { ...request });
    }
  }

  static fromSnapshot(snapshot: DsarAutopilotSnapshot, options: Omit<DsarAutopilotOptions, 'requests'> = {}): DsarAutopilot {
    if (snapshot.v !== 1) {
      throw new Error(`unsupported DSAR store version: ${String((snapshot as { v?: unknown }).v)}`);
    }
    return new DsarAutopilot({ ...options, requests: snapshot.requests });
  }

  toSnapshot(): DsarAutopilotSnapshot {
    return {
      v: 1,
      requests: this.listRequests()
    };
  }

  submitRequest(subjectOrInput: string | { subjectId: string; type: 'access' | 'deletion' | 'portability' }, type?: DsarRequest['type']): DsarRequest {
    const subjectId = typeof subjectOrInput === 'string' ? subjectOrInput : subjectOrInput.subjectId;
    const reqType =
      typeof subjectOrInput === 'string' ? (type ?? 'access') : (subjectOrInput.type === 'deletion' ? 'delete' : subjectOrInput.type);
    const nowTs = this.now();
    const req: DsarRequest = {
      requestId: this.requestIdFactory(),
      subject: subjectId,
      type: reqType,
      status: 'pending',
      createdTs: nowTs,
      updatedTs: nowTs,
      completedTs: null
    };
    this.requests.set(req.requestId, req);
    return req;
  }

  /**
   * Runs a request to completion.
   *
   * A DSAR is only complete once the subject's data has actually been accessed,
   * exported or erased. This previously flipped status straight to 'complete'
   * without touching any data, so an erasure request could be reported as
   * satisfied while the data remained — a false compliance record.
   *
   * Without a fulfilment handler the request moves to 'awaiting-fulfilment'.
   */
  async processRequest(
    request: string | DsarRequest,
    fulfil?: DsarFulfilmentHandler
  ): Promise<DsarRequest> {
    const requestId = typeof request === 'string' ? request : request.requestId;
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`DSAR request not found: ${requestId}`);

    if (!fulfil) {
      req.status = 'awaiting-fulfilment';
      req.updatedTs = this.now();
      req.completedTs = null;
      return req;
    }

    req.status = 'processing';
    req.updatedTs = this.now();
    const fulfilment = await fulfil({ ...req });
    req.fulfilment = fulfilment;
    req.status = 'complete';
    req.updatedTs = this.now();
    req.completedTs = req.updatedTs;
    return req;
  }

  getStatus(requestId: string): DsarRequest | undefined {
    return this.requests.get(requestId);
  }

  listRequests(): DsarRequest[] {
    return Array.from(this.requests.values())
      .map((request) => ({ ...request }))
      .sort((a, b) => a.createdTs - b.createdTs);
  }
}

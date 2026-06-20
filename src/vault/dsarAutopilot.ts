/**
 * DSAR (Data Subject Access Request) automation.
 */

import { randomUUID } from 'node:crypto';

export interface DsarRequest {
  requestId: string;
  subject: string;
  type: 'access' | 'delete' | 'portability';
  status: 'pending' | 'processing' | 'complete';
  createdTs: number;
  updatedTs: number;
  completedTs: number | null;
}

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

  processRequest(request: string | DsarRequest): DsarRequest {
    const requestId = typeof request === 'string' ? request : request.requestId;
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`DSAR request not found: ${requestId}`);
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

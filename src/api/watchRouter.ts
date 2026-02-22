/**
 * watchRouter.ts — Watch API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, pathParam, queryParam } from './apiHelpers.js';

interface WatchRouteOptions {
  workspace?: string;
}

interface EvidenceReceiptRow {
  id: string;
  ts: number;
  session_id: string;
  event_type: string;
  payload_sha256: string;
  event_hash: string;
  meta_json: string;
}

interface OutcomeReceiptRow {
  outcome_event_id: string;
  ts: number;
  agent_id: string;
  category: string;
  metric_id: string;
  source: string;
  event_hash: string;
  payload_sha256: string;
  receipt_id: string;
  receipt: string;
}

const attestBodySchema = z.object({
  output: z.string().min(1),
  agentId: z.string().trim().min(1),
  metadata: z.record(z.unknown()).optional()
}).strict();

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(parsed, 500));
}

export async function handleWatchRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  options: WatchRouteOptions = {},
): Promise<boolean> {
  if (pathname === '/api/v1/watch/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'watch', capabilities: ['attest', 'receipts'] });
    return true;
  }

  if (pathname === '/api/v1/watch/attest' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, attestBodySchema);
      const { attestOutput } = await import('../watch/outputAttestation.js');
      const result = attestOutput(body.output);
      apiSuccess(res, { ...result, agentId: body.agentId });
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // GET /api/v1/watch/receipts/:agentId
  const receiptsParams = pathParam(pathname, '/api/v1/watch/receipts/:agentId');
  if (receiptsParams && method === 'GET') {
    try {
      const workspace = options.workspace ?? process.cwd();
      const limit = parseLimit(queryParam(req.url ?? '', 'limit'));
      const { openLedger } = await import('../ledger/ledger.js');
      const { parseReceipt } = await import('../receipts/receipt.js');
      const ledger = openLedger(workspace);
      const receipts: Array<{
        source: 'evidence_event' | 'outcome_event';
        agentId: string;
        ts: number;
        kind: string | null;
        providerId: string | null;
        model: string | null;
        eventId: string;
        eventType?: string;
        sessionId?: string;
        eventHash: string;
        payloadSha256: string;
        receiptId: string | null;
        receiptSha256: string | null;
        receipt: string;
        category?: string;
        metricId?: string;
      }> = [];

      try {
        const evidenceRows = ledger.db
          .prepare(
            `SELECT id, ts, session_id, event_type, payload_sha256, event_hash, meta_json
             FROM evidence_events
             ORDER BY ts DESC`,
          )
          .all() as EvidenceReceiptRow[];

        for (const row of evidenceRows) {
          const meta = parseMeta(row.meta_json);
          const receipt = typeof meta.receipt === 'string' ? meta.receipt : null;
          if (!receipt) continue;

          let payloadAgentId = 'unknown';
          let kind: string | null = null;
          let providerId: string | null = null;
          let model: string | null = null;
          let payloadReceiptId: string | null = typeof meta.receipt_id === 'string' ? meta.receipt_id : null;
          try {
            const parsed = parseReceipt(receipt);
            payloadAgentId = parsed.payload.agentId;
            kind = parsed.payload.kind;
            providerId = parsed.payload.providerId;
            model = parsed.payload.model;
            payloadReceiptId = parsed.payload.receipt_id;
          } catch {
            continue;
          }

          if (payloadAgentId !== receiptsParams.agentId) continue;

          receipts.push({
            source: 'evidence_event',
            agentId: payloadAgentId,
            ts: row.ts,
            kind,
            providerId,
            model,
            eventId: row.id,
            eventType: row.event_type,
            sessionId: row.session_id,
            eventHash: row.event_hash,
            payloadSha256: row.payload_sha256,
            receiptId: payloadReceiptId,
            receiptSha256: typeof meta.receipt_sha256 === 'string' ? meta.receipt_sha256 : null,
            receipt,
          });

          if (receipts.length >= limit) break;
        }

        if (receipts.length < limit) {
          const remaining = limit - receipts.length;
          const outcomeRows = ledger.db
            .prepare(
              `SELECT outcome_event_id, ts, agent_id, category, metric_id, source, event_hash, payload_sha256, receipt_id, receipt
               FROM outcome_events
               WHERE agent_id = ?
               ORDER BY ts DESC
               LIMIT ?`,
            )
            .all(receiptsParams.agentId, remaining) as OutcomeReceiptRow[];

          for (const row of outcomeRows) {
            let kind: string | null = null;
            let providerId: string | null = null;
            let model: string | null = null;
            try {
              const parsed = parseReceipt(row.receipt);
              kind = parsed.payload.kind;
              providerId = parsed.payload.providerId;
              model = parsed.payload.model;
            } catch {
              // Keep the receipt row even if parsing fails.
            }

            receipts.push({
              source: 'outcome_event',
              agentId: row.agent_id,
              ts: row.ts,
              kind,
              providerId,
              model,
              eventId: row.outcome_event_id,
              eventHash: row.event_hash,
              payloadSha256: row.payload_sha256,
              receiptId: row.receipt_id,
              receiptSha256: null,
              receipt: row.receipt,
              category: row.category,
              metricId: row.metric_id,
            });
          }
        }
      } finally {
        ledger.close();
      }

      receipts.sort((a, b) => b.ts - a.ts);
      apiSuccess(res, {
        agentId: receiptsParams.agentId,
        receipts: receipts.slice(0, limit),
        count: Math.min(receipts.length, limit),
        source: 'ledger',
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  return false;
}

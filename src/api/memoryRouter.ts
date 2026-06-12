/**
 * memoryRouter.ts — Memory maturity & correction-memory API routes.
 * Full parity with: amc memory *, memory-extract, memory-advisories,
 * memory-report, memory-expire, memory-integrity
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';

export async function handleMemoryRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/memory')) return false;

  // POST /api/v1/memory/reasoning/writeback — write governed reasoning memory from an EpisodeRecord
  if (pathname === '/api/v1/memory/reasoning/writeback' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        episode?: string;
        episodeSelector?: string;
        runId?: string;
        allowedConsumers?: string[];
        ttlDays?: number;
        reviewDays?: number;
        summary?: string;
      }>(req);
      const selector = body.episodeSelector ?? body.episode ?? body.runId;
      if (!selector) {
        apiError(res, 400, 'episodeSelector, episode, or runId required');
        return true;
      }
      const { writeReasoningMemoryFromEpisode, redactReasoningMemoryItem } = await import('../learning/reasoningMemory.js');
      const result = writeReasoningMemoryFromEpisode({
        workspace,
        agentId: body.agentId ?? 'default',
        episodeSelector: selector,
        allowedConsumers: body.allowedConsumers as import('../learning/reasoningMemory.js').ReasoningMemoryConsumer[] | undefined,
        ttlDays: body.ttlDays,
        reviewDays: body.reviewDays,
        summaryOverride: body.summary
      });
      apiSuccess(res, {
        ...result,
        items: result.items.map((item) => redactReasoningMemoryItem(item, workspace))
      }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Reasoning memory writeback failed');
    }
    return true;
  }

  // GET /api/v1/memory/reasoning — retrieve active reasoning memory for a consumer
  if (pathname === '/api/v1/memory/reasoning' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const consumer = (queryParam(req.url ?? '', 'consumer') ?? 'studio') as import('../learning/reasoningMemory.js').ReasoningMemoryConsumer;
      const query = queryParam(req.url ?? '', 'query') ?? undefined;
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '20', 10);
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { retrieveReasoningMemory, redactReasoningMemoryItem } = await import('../learning/reasoningMemory.js');
      const result = retrieveReasoningMemory({
        workspace,
        agentId,
        consumer,
        query,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 20
      });
      apiSuccess(res, {
        ...result,
        items: redacted ? result.items.map((item) => redactReasoningMemoryItem(item, workspace)) : result.items
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Reasoning memory retrieval failed');
    }
    return true;
  }

  // GET /api/v1/memory/reasoning/receipts — list writeback receipts
  if (pathname === '/api/v1/memory/reasoning/receipts' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '20', 10);
      const { listReasoningMemoryReceipts } = await import('../learning/reasoningMemory.js');
      const receipts = listReasoningMemoryReceipts({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 20
      });
      apiSuccess(res, { agentId, receipts, total: receipts.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Reasoning memory receipts failed');
    }
    return true;
  }

  // GET /api/v1/memory/reasoning/:selector — inspect one memory item
  const reasoningParams = pathParam(pathname, '/api/v1/memory/reasoning/:selector');
  if (reasoningParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { loadReasoningMemoryItem, redactReasoningMemoryItem } = await import('../learning/reasoningMemory.js');
      const item = loadReasoningMemoryItem({
        workspace,
        agentId,
        selector: decodeURIComponent(reasoningParams.selector!)
      });
      apiSuccess(res, redacted ? redactReasoningMemoryItem(item, workspace) : item);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Reasoning memory item not found');
    }
    return true;
  }

  // GET /api/v1/memory/assess/:agentId — full memory maturity assessment
  const assessParams = pathParam(pathname, '/api/v1/memory/assess/:agentId');
  if (assessParams && method === 'GET') {
    try {
      const { assessMemoryMaturity } = await import('../score/memoryMaturity.js');
      const result = assessMemoryMaturity({ agentId: 0 });
      result.agentId = assessParams.agentId!;
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory assessment failed');
    }
    return true;
  }

  // GET /api/v1/memory/integrity — score memory integrity
  if (pathname === '/api/v1/memory/integrity' && method === 'GET') {
    try {
      const { scoreMemoryIntegrity } = await import('../score/memoryIntegrity.js');
      const result = scoreMemoryIntegrity({ events: [], sessionCount: 0, totalDurationMs: 0 });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory integrity scoring failed');
    }
    return true;
  }

  // POST /api/v1/memory/integrity — score memory integrity with provided events
  if (pathname === '/api/v1/memory/integrity' && method === 'POST') {
    try {
      const { scoreMemoryIntegrity } = await import('../score/memoryIntegrity.js');
      const body = await bodyJson<{ events?: unknown[]; sessionCount?: number; totalDurationMs?: number }>(req);
      const result = scoreMemoryIntegrity({
        events: (body.events ?? []) as import('../score/memoryIntegrity.js').MemoryEvent[],
        sessionCount: body.sessionCount ?? 0,
        totalDurationMs: body.totalDurationMs ?? 0,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory integrity scoring failed');
    }
    return true;
  }

  // POST /api/v1/memory/extract — extract lessons from corrections
  if (pathname === '/api/v1/memory/extract' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; minEffectiveness?: number }>(req);
      const { openLedger } = await import('../ledger/ledger.js');
      const { initLessonTables, extractLessonsFromCorrections } = await import('../learning/correctionMemory.js');
      const ledger = openLedger(workspace);
      const db = ledger.db;
      initLessonTables(db);
      const agentId = body.agentId ?? 'default';
      const lessons = extractLessonsFromCorrections(db, agentId, workspace, {
        minEffectivenessForLesson: body.minEffectiveness ?? 0.3,
      });
      ledger.close();
      apiSuccess(res, { agentId, lessons, total: lessons.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory extract failed');
    }
    return true;
  }

  // GET /api/v1/memory/advisories — get lesson advisories for prompt injection
  if ((pathname === '/api/v1/memory/advisories') && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { openLedger } = await import('../ledger/ledger.js');
      const { initLessonTables, buildLessonAdvisories } = await import('../learning/correctionMemory.js');
      const ledger = openLedger(workspace);
      const db = ledger.db;
      initLessonTables(db);
      const advisories = buildLessonAdvisories(db, agentId);
      ledger.close();
      apiSuccess(res, { agentId, advisories, total: advisories.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory advisories failed');
    }
    return true;
  }

  // GET /api/v1/memory/report — correction memory report
  if (pathname === '/api/v1/memory/report' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const window = queryParam(req.url ?? '', 'window') ?? '30d';
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      const { openLedger } = await import('../ledger/ledger.js');
      const { initLessonTables, generateCorrectionMemoryReport, renderCorrectionMemoryMarkdown } = await import('../learning/correctionMemory.js');
      const { parseWindowToMs } = await import('../utils/time.js');
      const ledger = openLedger(workspace);
      const db = ledger.db;
      initLessonTables(db);
      const now = Date.now();
      const windowMs = parseWindowToMs(window);
      const report = generateCorrectionMemoryReport(db, agentId, now - windowMs, now);
      ledger.close();
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(renderCorrectionMemoryMarkdown(report));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory report failed');
    }
    return true;
  }

  // POST /api/v1/memory/expire — expire stale lessons
  if (pathname === '/api/v1/memory/expire' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string }>(req);
      const agentId = body.agentId ?? 'default';
      const { openLedger } = await import('../ledger/ledger.js');
      const { initLessonTables, expireStaleLessons } = await import('../learning/correctionMemory.js');
      const ledger = openLedger(workspace);
      const db = ledger.db;
      initLessonTables(db);
      const expired = expireStaleLessons(db, agentId);
      ledger.close();
      apiSuccess(res, { agentId, expired, total: expired.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Memory expire failed');
    }
    return true;
  }

  return false;
}

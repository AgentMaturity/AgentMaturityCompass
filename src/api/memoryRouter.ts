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
      const db = (ledger as any).db as import('better-sqlite3').Database;
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
      const db = (ledger as any).db as import('better-sqlite3').Database;
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
      const db = (ledger as any).db as import('better-sqlite3').Database;
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
      const db = (ledger as any).db as import('better-sqlite3').Database;
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

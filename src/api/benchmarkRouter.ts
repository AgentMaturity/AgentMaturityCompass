/**
 * benchmarkRouter.ts — Benchmark API routes.
 * Full parity with: amc benchmark export, amc benchmark import, amc benchmark stats, amc benchmark verify
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleBenchmarkRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/benchmarks')) return false;

  // GET /api/v1/benchmarks — list imported benchmarks
  if (pathname === '/api/v1/benchmarks' && method === 'GET') {
    try {
      const { listImportedBenchmarks } = await import('../benchmarks/benchStore.js');
      const list = listImportedBenchmarks(workspace);
      apiSuccess(res, { benchmarks: list, total: list.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list benchmarks');
    }
    return true;
  }

  // GET /api/v1/benchmarks/stats — benchmark statistics
  if (pathname === '/api/v1/benchmarks/stats' && method === 'GET') {
    try {
      const groupBy = queryParam(req.url ?? '', 'groupBy') as 'archetype' | 'riskTier' | 'trustLabel' | undefined;
      const { benchmarkStats } = await import('../benchmarks/benchStats.js');
      const stats = benchmarkStats({ workspace, groupBy });
      apiSuccess(res, stats);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Benchmark stats failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/export — export a benchmark artifact
  if (pathname === '/api/v1/benchmarks/export' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        runId: string;
        outFile: string;
        publisherOrgName?: string;
        publisherContact?: string;
        publicAgentId?: string | null;
        notes?: string | null;
      }>(req);
      if (!body.runId || !body.outFile) {
        apiError(res, 400, 'Required: runId, outFile');
        return true;
      }
      const { exportBenchmarkArtifact } = await import('../benchmarks/benchExport.js');
      const result = exportBenchmarkArtifact({
        workspace,
        agentId: body.agentId,
        runId: body.runId,
        outFile: body.outFile,
        publisherOrgName: body.publisherOrgName,
        publisherContact: body.publisherContact,
        publicAgentId: body.publicAgentId,
        notes: body.notes,
      });
      apiSuccess(res, { exported: true, outFile: result.outFile, benchId: result.bench.benchId });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Benchmark export failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/import — import benchmark artifact(s)
  if (pathname === '/api/v1/benchmarks/import' && method === 'POST') {
    try {
      const body = await bodyJson<{ path: string }>(req);
      if (!body.path) {
        apiError(res, 400, 'Required: path (file or directory)');
        return true;
      }
      const { ingestBenchmarks } = await import('../benchmarks/benchImport.js');
      const result = ingestBenchmarks(workspace, body.path);
      apiSuccess(res, { imported: result.imported, total: result.imported.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Benchmark import failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/verify — verify a benchmark artifact
  if (pathname === '/api/v1/benchmarks/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ file: string }>(req);
      if (!body.file) {
        apiError(res, 400, 'Required: file');
        return true;
      }
      const { verifyBenchmarkArtifact } = await import('../benchmarks/benchVerify.js');
      const result = verifyBenchmarkArtifact(body.file);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Benchmark verification failed');
    }
    return true;
  }

  return false;
}

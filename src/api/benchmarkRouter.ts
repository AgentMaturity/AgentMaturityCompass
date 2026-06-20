/**
 * benchmarkRouter.ts — Benchmark API routes.
 * Full parity with: amc benchmark export, amc benchmark import, amc benchmark stats, amc benchmark verify
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';
import type {
  ProviderDriftCanaryRow,
  ProviderDriftThresholds,
  ProviderDriftWaiver,
} from '../benchmarks/providerDriftBenchmark.js';
import type { RunPromptfooProviderDriftInput } from '../benchmarks/promptfooProviderDrift.js';
import type { RunInspectProviderDriftInput } from '../benchmarks/inspectProviderDrift.js';
import type { RunTensorZeroProviderDriftInput } from '../benchmarks/tensorZeroProviderDrift.js';
import type { ReplayBenchmarkCorpusInput } from '../benchmarks/replayBenchmarkCorpus.js';

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

  // POST /api/v1/benchmarks/provider-drift — run provider/model canary drift benchmark
  if (pathname === '/api/v1/benchmarks/provider-drift' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        baseline?: unknown[];
        candidate?: unknown[];
        thresholds?: Record<string, unknown>;
        waivers?: unknown[];
        packId?: string;
        datasetHash?: string;
        sourceRefs?: string[];
        gateMode?: 'ci' | 'lifecycle';
      }>(req);
      if (!Array.isArray(body.baseline) || !Array.isArray(body.candidate)) {
        apiError(res, 400, 'Required: baseline[] and candidate[] canary rows');
        return true;
      }
      const {
        runProviderDriftBenchmark,
        buildProviderDriftWatchAlerts,
        buildProviderDriftEvalPack,
        buildProviderDriftCiGate,
      } = await import('../benchmarks/providerDriftBenchmark.js');
      const report = runProviderDriftBenchmark({
        agentId: body.agentId ?? 'default',
        baseline: body.baseline as ProviderDriftCanaryRow[],
        candidate: body.candidate as ProviderDriftCanaryRow[],
        thresholds: body.thresholds as Partial<ProviderDriftThresholds> | undefined,
        waivers: body.waivers as ProviderDriftWaiver[] | undefined,
      });
      apiSuccess(res, {
        report,
        watchAlerts: buildProviderDriftWatchAlerts(report),
        evalPack: buildProviderDriftEvalPack(report, {
          packId: body.packId,
          datasetHash: body.datasetHash,
          sourceRefs: body.sourceRefs,
        }),
        ciGate: buildProviderDriftCiGate(report, { mode: body.gateMode ?? 'ci' }),
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Provider drift benchmark failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/promptfoo-provider-drift — run promptfoo-scoped provider/version drift proof
  if (pathname === '/api/v1/benchmarks/promptfoo-provider-drift' && method === 'POST') {
    try {
      const body = await bodyJson<RunPromptfooProviderDriftInput>(req);
      if (!Array.isArray(body.baseline) || !Array.isArray(body.candidate) || !body.promptfoo) {
        apiError(res, 400, 'Required: baseline[], candidate[], and promptfoo metadata');
        return true;
      }
      const { runPromptfooProviderDrift } = await import('../benchmarks/promptfooProviderDrift.js');
      const result = runPromptfooProviderDrift({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'promptfoo provider drift benchmark failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/inspect-provider-drift — run Inspect-scoped provider/version drift proof
  if (pathname === '/api/v1/benchmarks/inspect-provider-drift' && method === 'POST') {
    try {
      const body = await bodyJson<RunInspectProviderDriftInput>(req);
      if (!Array.isArray(body.baseline) || !Array.isArray(body.candidate) || !body.inspect) {
        apiError(res, 400, 'Required: baseline[], candidate[], and inspect metadata');
        return true;
      }
      const { runInspectProviderDrift } = await import('../benchmarks/inspectProviderDrift.js');
      const result = runInspectProviderDrift({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Inspect provider drift benchmark failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/tensorzero-provider-drift — run TensorZero-scoped provider/version drift proof
  if (pathname === '/api/v1/benchmarks/tensorzero-provider-drift' && method === 'POST') {
    try {
      const body = await bodyJson<RunTensorZeroProviderDriftInput>(req);
      if (!Array.isArray(body.baseline) || !Array.isArray(body.candidate) || !body.tensorZero) {
        apiError(res, 400, 'Required: baseline[], candidate[], and tensorZero metadata');
        return true;
      }
      const { runTensorZeroProviderDrift } = await import('../benchmarks/tensorZeroProviderDrift.js');
      const result = runTensorZeroProviderDrift({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'TensorZero provider drift benchmark failed');
    }
    return true;
  }

  // POST /api/v1/benchmarks/replay-corpus — run a replayable benchmark corpus
  if (pathname === '/api/v1/benchmarks/replay-corpus' && method === 'POST') {
    try {
      const body = await bodyJson<ReplayBenchmarkCorpusInput>(req);
      if (!Array.isArray(body.rows)) {
        apiError(res, 400, 'Required: rows[] replay corpus rows');
        return true;
      }
      const { runReplayBenchmarkCorpus } = await import('../benchmarks/replayBenchmarkCorpus.js');
      const result = runReplayBenchmarkCorpus({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Replay benchmark corpus failed');
    }
    return true;
  }

  return false;
}

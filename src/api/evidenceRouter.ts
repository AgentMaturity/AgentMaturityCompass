/**
 * evidenceRouter.ts — Evidence lifecycle API routes.
 * Full parity with: amc evidence *, amc bundle *, amc ingest *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';
import { join } from 'node:path';
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

export async function handleEvidenceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/evidence')) return false;

  // GET /api/v1/evidence/status
  if (pathname === '/api/v1/evidence/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'evidence' });
    return true;
  }

  // GET /api/v1/evidence/list — list evidence files for agent
  if (pathname === '/api/v1/evidence/list' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { getAgentPaths } = await import('../fleet/paths.js');
      const paths = getAgentPaths(workspace, agentId);
      // Evidence is stored in bundlesDir or a sibling evidence dir
      const bundlesDir = paths.bundlesDir;
      const runsDir = paths.runsDir;
      const files: Array<{ file: string; dir: string }> = [];
      if (existsSync(bundlesDir)) {
        readdirSync(bundlesDir).forEach(f => files.push({ file: f, dir: 'bundles' }));
      }
      if (existsSync(runsDir)) {
        readdirSync(runsDir).filter(f => f.endsWith('.json')).forEach(f => files.push({ file: f, dir: 'runs' }));
      }
      apiSuccess(res, { agentId, evidence: files, total: files.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list evidence');
    }
    return true;
  }

  // GET /api/v1/evidence/gaps — evidence gaps for agent
  if (pathname === '/api/v1/evidence/gaps' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const runId = queryParam(req.url ?? '', 'runId');
      const { loadRunReport } = await import('../diagnostic/runner.js');
      let report;
      if (runId) {
        report = loadRunReport(workspace, runId, agentId);
      } else {
        // Load latest run by finding most recent file
        const { getAgentPaths } = await import('../fleet/paths.js');
        const paths = getAgentPaths(workspace, agentId);
        if (!existsSync(paths.runsDir)) {
          apiSuccess(res, { agentId, gaps: [], total: 0, note: 'No runs found' }); return true;
        }
        const runs = readdirSync(paths.runsDir).filter(f => f.endsWith('.json')).sort().reverse();
        if (!runs.length) { apiSuccess(res, { agentId, gaps: [], total: 0 }); return true; }
        report = loadRunReport(workspace, runs[0]!.replace('.json', ''), agentId);
      }
      // evidenceGaps lives on the fleet report, not DiagnosticReport — derive from unsupportedClaimCount
      const gaps: string[] = [];
      if (report.unsupportedClaimCount > 0) {
        gaps.push(`${report.unsupportedClaimCount} unsupported claims detected`);
      }
      if (report.inflationAttempts?.length) {
        report.inflationAttempts.forEach((a: { questionId: string }) => gaps.push(`Inflation attempt: ${a.questionId}`));
      }
      apiSuccess(res, { agentId, runId: report.runId, gaps, total: gaps.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load evidence gaps');
    }
    return true;
  }

  // GET /api/v1/evidence/episodes — list lifecycle episode records
  if (pathname === '/api/v1/evidence/episodes' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '25', 10);
      const { listEpisodeRecords } = await import('../lifecycle/episodeRecord.js');
      const episodes = listEpisodeRecords({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
      });
      apiSuccess(res, { agentId, episodes, total: episodes.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list episode records');
    }
    return true;
  }

  // GET /api/v1/evidence/episodes/:selector — inspect an episode by episode id, lifecycle id, or run id
  const episodeParams = pathParam(pathname, '/api/v1/evidence/episodes/:selector');
  if (episodeParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const redacted = queryParam(req.url ?? '', 'redacted') === 'true';
      const { loadEpisodeRecord, redactEpisodeRecord } = await import('../lifecycle/episodeRecord.js');
      const episode = loadEpisodeRecord({ workspace, agentId, selector: decodeURIComponent(episodeParams.selector!) });
      apiSuccess(res, redacted ? redactEpisodeRecord(episode) : episode);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Episode record not found');
    }
    return true;
  }

  // GET /api/v1/evidence/decisions — list decision receipts
  if (pathname === '/api/v1/evidence/decisions' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '25', 10);
      const { listDecisionReceipts } = await import('../lifecycle/decisionReceipt.js');
      const receipts = listDecisionReceipts({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
      });
      apiSuccess(res, { agentId, receipts, total: receipts.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list decision receipts');
    }
    return true;
  }

  // POST /api/v1/evidence/decisions/observe — update open decision receipts from a later full-score run
  if (pathname === '/api/v1/evidence/decisions/observe' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; runId: string }>(req);
      if (!body.runId) { apiError(res, 400, 'runId required'); return true; }
      const agentId = body.agentId ?? 'default';
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const { observeDecisionOutcomes } = await import('../lifecycle/decisionReceipt.js');
      const report = loadRunReport(workspace, body.runId, agentId);
      const result = observeDecisionOutcomes({ workspace, agentId, report });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not observe decision outcomes');
    }
    return true;
  }

  // GET /api/v1/evidence/decisions/:selector — inspect a decision receipt by receipt id or run id
  const decisionParams = pathParam(pathname, '/api/v1/evidence/decisions/:selector');
  if (decisionParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { loadDecisionReceipt } = await import('../lifecycle/decisionReceipt.js');
      const receipt = loadDecisionReceipt({ workspace, agentId, selector: decodeURIComponent(decisionParams.selector!) });
      apiSuccess(res, receipt);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Decision receipt not found');
    }
    return true;
  }

  // GET /api/v1/evidence/observability — list component, experience, and decision observability records
  if (pathname === '/api/v1/evidence/observability' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '25', 10);
      const { listObservabilityLaneRecords } = await import('../lifecycle/observabilityLane.js');
      const records = listObservabilityLaneRecords({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
      });
      apiSuccess(res, { agentId, records, total: records.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list observability records');
    }
    return true;
  }

  // GET /api/v1/evidence/trace-indexes — list distilled trace failure indexes
  if (pathname === '/api/v1/evidence/trace-indexes' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '25', 10);
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { listTraceFailureIndexes } = await import('../watch/traceFailureIndex.js');
      const indexes = listTraceFailureIndexes({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 25,
        redacted,
      });
      apiSuccess(res, { agentId, indexes, total: indexes.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list trace failure indexes');
    }
    return true;
  }

  // GET /api/v1/evidence/trace-indexes/:selector — inspect an index by run, episode, or index id
  const traceIndexParams = pathParam(pathname, '/api/v1/evidence/trace-indexes/:selector');
  if (traceIndexParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { loadTraceFailureIndex } = await import('../watch/traceFailureIndex.js');
      const index = loadTraceFailureIndex({
        workspace,
        agentId,
        selector: decodeURIComponent(traceIndexParams.selector!),
        redacted,
      });
      apiSuccess(res, index);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Trace failure index not found');
    }
    return true;
  }

  // GET /api/v1/evidence/failure-clusters — top recurring trace failure clusters
  if (pathname === '/api/v1/evidence/failure-clusters' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '10', 10);
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { topTraceFailureClusters } = await import('../watch/traceFailureIndex.js');
      const clusters = topTraceFailureClusters({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
        redacted,
      });
      apiSuccess(res, { agentId, clusters, total: clusters.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list failure clusters');
    }
    return true;
  }

  // GET /api/v1/evidence/observability/:selector — inspect a component/experience/decision observability record
  const observabilityParams = pathParam(pathname, '/api/v1/evidence/observability/:selector');
  if (observabilityParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const redacted = queryParam(req.url ?? '', 'redacted') === 'true';
      const { loadObservabilityLaneRecord, redactObservabilityLaneRecord } = await import('../lifecycle/observabilityLane.js');
      const record = loadObservabilityLaneRecord({ workspace, agentId, selector: decodeURIComponent(observabilityParams.selector!) });
      apiSuccess(res, redacted ? redactObservabilityLaneRecord(record) : record);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Observability record not found');
    }
    return true;
  }

  // GET /api/v1/evidence/finding-proofs — list finding proof chains
  if (pathname === '/api/v1/evidence/finding-proofs' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '50', 10);
      const { listFindingProofs } = await import('../lifecycle/findingProof.js');
      const proofs = listFindingProofs({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      });
      apiSuccess(res, { agentId, proofs, total: proofs.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list finding proofs');
    }
    return true;
  }

  // GET /api/v1/evidence/finding-proofs/:selector — inspect one proof by proof id, finding id, run id, or question id
  const findingProofParams = pathParam(pathname, '/api/v1/evidence/finding-proofs/:selector');
  if (findingProofParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const redacted = queryParam(req.url ?? '', 'redacted') === 'true';
      const { loadFindingProof, redactFindingProof } = await import('../lifecycle/findingProof.js');
      const proof = loadFindingProof({ workspace, agentId, selector: decodeURIComponent(findingProofParams.selector!) });
      apiSuccess(res, redacted ? redactFindingProof(proof) : proof);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Finding proof not found');
    }
    return true;
  }

  // GET /api/v1/evidence/lifecycle-receipts — list proposal/validation/commit/rollback/monitor receipts
  if (pathname === '/api/v1/evidence/lifecycle-receipts' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '50', 10);
      const { listLifecycleChangeReceipts } = await import('../lifecycle/changeReceipt.js');
      const receipts = listLifecycleChangeReceipts({
        workspace,
        agentId,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      });
      apiSuccess(res, { agentId, receipts, total: receipts.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list lifecycle receipts');
    }
    return true;
  }

  // GET /api/v1/evidence/lifecycle-receipts/:selector — inspect receipt by receipt id, run id, or lifecycle id
  const lifecycleReceiptParams = pathParam(pathname, '/api/v1/evidence/lifecycle-receipts/:selector');
  if (lifecycleReceiptParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const redacted = queryParam(req.url ?? '', 'redacted') === 'true';
      const { loadLifecycleChangeReceipt, redactLifecycleChangeReceipt } = await import('../lifecycle/changeReceipt.js');
      const receipt = loadLifecycleChangeReceipt({ workspace, agentId, selector: decodeURIComponent(lifecycleReceiptParams.selector!) });
      apiSuccess(res, redacted ? redactLifecycleChangeReceipt(receipt) : receipt);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Lifecycle receipt not found');
    }
    return true;
  }

  // POST /api/v1/evidence/ingest — ingest evidence from content string
  if (pathname === '/api/v1/evidence/ingest' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; type: string; content: string; filename?: string }>(req);
      if (!body.type || !body.content) { apiError(res, 400, 'type and content required'); return true; }
      const agentId = body.agentId ?? 'default';
      // Write content to temp file, then ingest it
      const tmpDir = join(tmpdir(), `amc-ingest-${randomUUID()}`);
      mkdirSync(tmpDir, { recursive: true });
      const tmpFile = join(tmpDir, body.filename ?? `evidence.${body.type === 'generic_json' ? 'json' : 'txt'}`);
      writeFileSync(tmpFile, body.content, 'utf8');
      const { ingestEvidence } = await import('../ingest/ingest.js');
      const result = ingestEvidence({
        workspace,
        agentId,
        inputPath: tmpDir,
        type: body.type as Parameters<typeof ingestEvidence>[0]['type'],
      });
      apiSuccess(res, { ingested: true, agentId, ...result }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Evidence ingest failed');
    }
    return true;
  }

  // POST /api/v1/evidence/collect — collect evidence from a path
  if (pathname === '/api/v1/evidence/collect' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; inputPath: string; type: string }>(req);
      if (!body.inputPath || !body.type) { apiError(res, 400, 'inputPath and type required'); return true; }
      const { ingestEvidence } = await import('../ingest/ingest.js');
      const result = ingestEvidence({
        workspace,
        agentId: body.agentId ?? 'default',
        inputPath: body.inputPath,
        type: body.type as Parameters<typeof ingestEvidence>[0]['type'],
      });
      apiSuccess(res, { collected: true, ...result }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Evidence collection failed');
    }
    return true;
  }

  // GET /api/v1/evidence/export — export evidence bundle
  if (pathname === '/api/v1/evidence/export' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'csv';
      const { collectVerifierEvidence, renderVerifierEvidenceJson, renderVerifierEvidenceCsv } = await import('../evidence/index.js');
      const dataset = await collectVerifierEvidence({ workspace, agentId });
      if (format === 'csv') {
        const csv = renderVerifierEvidenceCsv(dataset);
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="evidence-${agentId}.csv"` });
        res.end(csv);
        return true;
      }
      apiSuccess(res, renderVerifierEvidenceJson(dataset));
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Evidence export failed');
    }
    return true;
  }

  // POST /api/v1/evidence/attest — attest an ingest session
  if (pathname === '/api/v1/evidence/attest' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; ingestSessionId: string }>(req);
      if (!body.ingestSessionId) { apiError(res, 400, 'ingestSessionId required'); return true; }
      const { attestIngestSession } = await import('../ingest/ingest.js');
      const result = attestIngestSession({
        workspace,
        agentId: body.agentId ?? 'default',
        ingestSessionId: body.ingestSessionId,
      });
      apiSuccess(res, { attested: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Attestation failed');
    }
    return true;
  }

  // POST /api/v1/evidence/bundle — create portable bundle
  if (pathname === '/api/v1/evidence/bundle' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; runId?: string; outputPath?: string }>(req);
      const agentId = body.agentId ?? 'default';
      const { exportEvidenceBundle } = await import('../bundles/bundle.js');
      if (!body.runId) { apiError(res, 400, 'runId required for bundle'); return true; }
      const { getAgentPaths } = await import('../fleet/paths.js');
      const paths = getAgentPaths(workspace, agentId);
      const outFile = join(paths.bundlesDir, `${body.runId}.zip`);
      const result = exportEvidenceBundle({ workspace, agentId, runId: body.runId, outFile });
      apiSuccess(res, { bundled: true, agentId, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Bundle creation failed');
    }
    return true;
  }

  return false;
}

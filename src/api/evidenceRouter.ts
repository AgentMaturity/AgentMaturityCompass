/**
 * evidenceRouter.ts — Evidence lifecycle API routes.
 * Full parity with: amc evidence *, amc bundle *, amc ingest *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';
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

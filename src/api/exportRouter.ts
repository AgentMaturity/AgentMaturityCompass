/**
 * exportRouter.ts — Export, attestation, and badge API routes.
 * Full parity with: amc export *, amc notary attest/verify-attest,
 * amc outcomes attest, amc badge *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleExportRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (
    !pathname.startsWith('/api/v1/export') &&
    !pathname.startsWith('/api/v1/attest')
  ) return false;

  // ── Export ───────────────────────────────────────────────────────

  // POST /api/v1/export/policy — export policy pack
  if (pathname === '/api/v1/export/policy' && method === 'POST') {
    try {
      const body = await bodyJson<{ target: string; outDir: string; agentId?: string }>(req);
      if (!body.target || !body.outDir) {
        apiError(res, 400, 'target and outDir required'); return true;
      }
      const { exportPolicyPack } = await import('../exports/policyExport.js');
      const result = exportPolicyPack({
        workspace,
        agentId: body.agentId,
        targetName: body.target,
        outDir: body.outDir,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy export failed');
    }
    return true;
  }

  // POST /api/v1/export/badge — export maturity badge SVG
  if (pathname === '/api/v1/export/badge' && method === 'POST') {
    try {
      const body = await bodyJson<{ runId: string; outFile: string; agentId?: string }>(req);
      if (!body.runId || !body.outFile) {
        apiError(res, 400, 'runId and outFile required'); return true;
      }
      const { exportBadge } = await import('../exports/policyExport.js');
      const result = exportBadge({
        workspace,
        agentId: body.agentId,
        runId: body.runId,
        outFile: body.outFile,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Badge export failed');
    }
    return true;
  }

  // GET /api/v1/export/badge/url — generate badge URL
  if (pathname === '/api/v1/export/badge/url' && method === 'GET') {
    try {
      const level = queryParam(req.url ?? '', 'level');
      const label = queryParam(req.url ?? '', 'label');
      const format = queryParam(req.url ?? '', 'format') as 'markdown' | 'html' | 'url' | undefined;
      if (!level) {
        apiError(res, 400, 'level query parameter required'); return true;
      }
      const { badgeUrl } = await import('../badge/badgeCli.js');
      const url = badgeUrl({ level: parseInt(level, 10), label: label ?? undefined, format });
      apiSuccess(res, { url });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Badge URL generation failed');
    }
    return true;
  }

  // GET /api/v1/export/badge/generate — generate badge markup
  if (pathname === '/api/v1/export/badge/generate' && method === 'GET') {
    try {
      const level = queryParam(req.url ?? '', 'level');
      const label = queryParam(req.url ?? '', 'label');
      const format = (queryParam(req.url ?? '', 'format') ?? 'markdown') as 'markdown' | 'html' | 'url';
      if (!level) {
        apiError(res, 400, 'level query parameter required'); return true;
      }
      const { generateBadge, formatBadgeOutput } = await import('../badge/badgeCli.js');
      const opts = { level: parseInt(level, 10), label: label ?? undefined, format };
      const badge = generateBadge(opts);
      const formatted = formatBadgeOutput(opts);
      apiSuccess(res, { badge, formatted });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Badge generation failed');
    }
    return true;
  }

  // ── Attestation ─────────────────────────────────────────────────

  // POST /api/v1/attest/notary — generate signed notary attestation bundle
  if (pathname === '/api/v1/attest/notary' && method === 'POST') {
    try {
      const body = await bodyJson<{ outFile: string; notaryDir?: string }>(req);
      if (!body.outFile) {
        apiError(res, 400, 'outFile required'); return true;
      }
      const { notaryAttestCli } = await import('../notary/notaryCli.js');
      const result = notaryAttestCli({
        notaryDir: body.notaryDir,
        workspace,
        outFile: body.outFile,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary attestation failed');
    }
    return true;
  }

  // POST /api/v1/attest/notary/verify — verify a .amcattest bundle
  if (pathname === '/api/v1/attest/notary/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ file: string }>(req);
      if (!body.file) {
        apiError(res, 400, 'file required'); return true;
      }
      const { notaryVerifyAttestCli } = await import('../notary/notaryCli.js');
      const result = notaryVerifyAttestCli(body.file);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary verification failed');
    }
    return true;
  }

  // POST /api/v1/attest/outcome — record manual attested outcome signal
  if (pathname === '/api/v1/attest/outcome' && method === 'POST') {
    try {
      const body = await bodyJson<{
        metricId: string; value: string; reason: string;
        workOrderId?: string; unit?: string; agentId?: string;
      }>(req);
      if (!body.metricId || !body.value || !body.reason) {
        apiError(res, 400, 'metricId, value, and reason required'); return true;
      }
      const { outcomesAttestCli } = await import('../outcomes/outcomeCli.js');
      const result = outcomesAttestCli({
        workspace,
        agentId: body.agentId,
        metricId: body.metricId,
        value: body.value,
        reason: body.reason,
        workOrderId: body.workOrderId,
        unit: body.unit,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Outcome attestation failed');
    }
    return true;
  }

  return false;
}

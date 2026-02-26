/**
 * bomRouter.ts — BOM, SBOM, badge, and bundle API routes.
 * Full parity with: amc bom *, amc release sbom, amc export badge, amc bundle *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

function latestRunId(workspace: string, agentId: string): string | null {
  const runsDir = join(workspace, '.amc', 'agents', agentId, 'runs');
  try {
    const files = readdirSync(runsDir)
      .filter((n) => n.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
    if (files.length === 0) return null;
    const parsed = JSON.parse(readFileSync(join(runsDir, files[files.length - 1]!), 'utf8')) as { runId?: string };
    return parsed.runId ?? null;
  } catch {
    return null;
  }
}

export async function handleBomRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  // ── BOM routes (/api/v1/bom/*) ─────────────────────────────────
  if (pathname.startsWith('/api/v1/bom')) {
    // POST /api/v1/bom/generate — generate maturity BOM
    if (pathname === '/api/v1/bom/generate' && method === 'POST') {
      try {
        const body = await bodyJson<{
          runId: string; outFile: string; agentId?: string;
          bundleId?: string; certId?: string;
        }>(req);
        if (!body.runId || !body.outFile) {
          apiError(res, 400, 'runId and outFile required'); return true;
        }
        const { generateBom } = await import('../bom/bomGenerator.js');
        const { resolveAgentId } = await import('../fleet/paths.js');
        let runId = body.runId;
        const agentId = body.agentId;
        if (runId === 'latest') {
          const resolved = resolveAgentId(workspace, agentId);
          const latest = latestRunId(workspace, resolved);
          if (!latest) { apiError(res, 404, 'No runs available for agent'); return true; }
          runId = latest;
        }
        const out = generateBom({
          workspace,
          agentId,
          runId,
          outFile: body.outFile,
          bundleId: body.bundleId ?? null,
          certId: body.certId ?? null,
        });
        apiSuccess(res, { outFile: out.outFile }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'BOM generation failed');
      }
      return true;
    }

    // POST /api/v1/bom/sign — sign a BOM file
    if (pathname === '/api/v1/bom/sign' && method === 'POST') {
      try {
        const body = await bodyJson<{ inputFile: string; outputSigFile?: string }>(req);
        if (!body.inputFile) { apiError(res, 400, 'inputFile required'); return true; }
        const { signBomFile } = await import('../bom/bomVerifier.js');
        const signed = signBomFile({
          workspace,
          inputFile: body.inputFile,
          outputSigFile: body.outputSigFile,
        });
        apiSuccess(res, { sigFile: signed.sigFile });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'BOM signing failed');
      }
      return true;
    }

    // POST /api/v1/bom/verify — verify a BOM signature
    if (pathname === '/api/v1/bom/verify' && method === 'POST') {
      try {
        const body = await bodyJson<{ inputFile: string; sigFile: string; pubkeyPemFile?: string }>(req);
        if (!body.inputFile || !body.sigFile) {
          apiError(res, 400, 'inputFile and sigFile required'); return true;
        }
        const { verifyBomSignature } = await import('../bom/bomVerifier.js');
        const result = verifyBomSignature({
          workspace,
          inputFile: body.inputFile,
          sigFile: body.sigFile,
          pubkeyPemFile: body.pubkeyPemFile,
        });
        apiSuccess(res, { ok: result.ok, reason: result.reason ?? null });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'BOM verification failed');
      }
      return true;
    }

    return false;
  }

  // ── SBOM route (/api/v1/sbom/*) ────────────────────────────────
  if (pathname.startsWith('/api/v1/sbom')) {
    // POST /api/v1/sbom/generate — generate CycloneDX SBOM
    if (pathname === '/api/v1/sbom/generate' && method === 'POST') {
      try {
        const body = await bodyJson<{ outPath: string }>(req);
        if (!body.outPath) { apiError(res, 400, 'outPath required'); return true; }
        const { releaseSbomCli } = await import('../release/releaseCli.js');
        const out = releaseSbomCli({
          workspace,
          outPath: resolve(workspace, body.outPath),
        });
        apiSuccess(res, { path: out.path, sha256: out.sha256 }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'SBOM generation failed');
      }
      return true;
    }

    return false;
  }

  // ── Badge route (/api/v1/badge/*) ──────────────────────────────
  if (pathname.startsWith('/api/v1/badge')) {
    // POST /api/v1/badge/export — export maturity badge SVG
    if (pathname === '/api/v1/badge/export' && method === 'POST') {
      try {
        const body = await bodyJson<{ runId: string; outFile: string; agentId?: string }>(req);
        if (!body.runId || !body.outFile) {
          apiError(res, 400, 'runId and outFile required'); return true;
        }
        const { exportBadge } = await import('../exports/policyExport.js');
        const badge = exportBadge({
          workspace,
          agentId: body.agentId,
          runId: body.runId,
          outFile: body.outFile,
        });
        apiSuccess(res, { outFile: badge.outFile, runId: badge.runId, agentId: badge.agentId }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Badge export failed');
      }
      return true;
    }

    return false;
  }

  // ── Bundle routes (/api/v1/bundle/*) ───────────────────────────
  if (pathname.startsWith('/api/v1/bundle')) {
    // POST /api/v1/bundle/export — export signed evidence bundle
    if (pathname === '/api/v1/bundle/export' && method === 'POST') {
      try {
        const body = await bodyJson<{ runId: string; outFile: string; agentId?: string }>(req);
        if (!body.runId || !body.outFile) {
          apiError(res, 400, 'runId and outFile required'); return true;
        }
        const { exportEvidenceBundle } = await import('../bundles/bundle.js');
        const result = exportEvidenceBundle({
          workspace,
          runId: body.runId,
          outFile: body.outFile,
          agentId: body.agentId,
        });
        apiSuccess(res, {
          outFile: result.outFile,
          fileCount: result.fileCount,
          eventCount: result.eventCount,
          sessionCount: result.sessionCount,
        }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Bundle export failed');
      }
      return true;
    }

    // POST /api/v1/bundle/verify — verify evidence bundle offline
    if (pathname === '/api/v1/bundle/verify' && method === 'POST') {
      try {
        const body = await bodyJson<{ file: string }>(req);
        if (!body.file) { apiError(res, 400, 'file required'); return true; }
        const { verifyEvidenceBundle } = await import('../bundles/bundle.js');
        const result = await verifyEvidenceBundle(resolve(workspace, body.file));
        apiSuccess(res, {
          ok: result.ok,
          errors: result.errors,
          runId: result.runId,
          agentId: result.agentId,
        });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Bundle verification failed');
      }
      return true;
    }

    // POST /api/v1/bundle/inspect — inspect bundle metadata
    if (pathname === '/api/v1/bundle/inspect' && method === 'POST') {
      try {
        const body = await bodyJson<{ file: string }>(req);
        if (!body.file) { apiError(res, 400, 'file required'); return true; }
        const { inspectEvidenceBundle, loadBundleRunAndTrustMap } = await import('../bundles/bundle.js');
        const inspected = inspectEvidenceBundle(resolve(workspace, body.file));
        const trustMap = loadBundleRunAndTrustMap(resolve(workspace, body.file)).eventTrustTier;
        const observedCount = [...trustMap.values()].filter((tier) => tier === 'OBSERVED').length;
        apiSuccess(res, {
          runId: inspected.run.runId,
          agentId: inspected.run.agentId,
          integrityIndex: inspected.run.integrityIndex,
          trustLabel: inspected.run.trustLabel,
          manifest: inspected.manifest,
          fileCount: inspected.files.length,
          observedEvidenceEvents: observedCount,
        });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Bundle inspect failed');
      }
      return true;
    }

    // POST /api/v1/bundle/diff — diff two bundles
    if (pathname === '/api/v1/bundle/diff' && method === 'POST') {
      try {
        const body = await bodyJson<{ bundleA: string; bundleB: string }>(req);
        if (!body.bundleA || !body.bundleB) {
          apiError(res, 400, 'bundleA and bundleB required'); return true;
        }
        const { diffEvidenceBundles } = await import('../bundles/bundle.js');
        const diff = diffEvidenceBundles(
          resolve(workspace, body.bundleA),
          resolve(workspace, body.bundleB),
        );
        apiSuccess(res, diff);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Bundle diff failed');
      }
      return true;
    }

    return false;
  }

  return false;
}

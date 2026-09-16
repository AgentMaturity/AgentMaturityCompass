/**
 * productRouter.ts — Batch processor and portal API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, pathParam } from './apiHelpers.js';
import type { ApiRouteContext } from './index.js';

const createBatchBodySchema = z.object({
  name: z.string().trim().min(1),
  items: z.array(z.unknown()).min(1)
}).strict();

// `submittedBy` is deliberately absent: the submitter is taken from the
// authenticated caller. `.strict()` therefore rejects a body that supplies it,
// so a client cannot believe it set an attribution that was quietly discarded.
const submitPortalBodySchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()).optional()
}).strict();

export async function handleProductRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  context?: ApiRouteContext,
): Promise<boolean> {
  if (pathname === '/api/v1/product/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'product', capabilities: ['batch', 'portal'] });
    return true;
  }

  // ── Batch routes ──────────────────────────────────────────────

  if (pathname === '/api/v1/product/batch/create' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, createBatchBodySchema);
      const { BatchProcessor } = await import('../product/batchProcessor.js');
      const bp = new BatchProcessor();
      const batch = bp.createBatch(body.name, body.items);
      apiSuccess(res, batch, 201);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  const startParams = pathParam(pathname, '/api/v1/product/batch/:id/start');
  if (startParams && method === 'POST') {
    try {
      const { BatchProcessor } = await import('../product/batchProcessor.js');
      const bp = new BatchProcessor();
      const batch = bp.startBatch(startParams.id!);
      apiSuccess(res, batch);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  const progressParams = pathParam(pathname, '/api/v1/product/batch/:id/progress');
  if (progressParams && method === 'GET') {
    try {
      const { BatchProcessor } = await import('../product/batchProcessor.js');
      const bp = new BatchProcessor();
      const progress = bp.getProgress(progressParams.id!);
      apiSuccess(res, progress);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // ── Portal routes ─────────────────────────────────────────────

  if (pathname === '/api/v1/product/portal/submit' && method === 'POST') {
    // Portal jobs carry no receipt, hash chain, or signature, so `submitted_by`
    // is the only record of who asked for the work. Fail closed rather than
    // record a job nobody is accountable for.
    const submitter = context?.principal?.trim();
    if (!submitter) {
      apiError(res, 401, 'Portal submission requires an authenticated caller');
      return true;
    }
    try {
      const body = await bodyJsonSchema(req, submitPortalBodySchema);
      const { PortalManager } = await import('../product/portal.js');
      const pm = new PortalManager();
      const job = pm.submitJob(body.name, body.type, submitter, body.payload);
      apiSuccess(res, job, 201);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  const portalParams = pathParam(pathname, '/api/v1/product/portal/:jobId');
  if (portalParams && method === 'GET') {
    try {
      const { PortalManager } = await import('../product/portal.js');
      const pm = new PortalManager();
      const job = pm.getJob(portalParams.jobId!);
      if (!job) { apiError(res, 404, 'Job not found'); return true; }
      apiSuccess(res, job);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  return false;
}

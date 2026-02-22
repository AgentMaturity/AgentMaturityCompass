/**
 * productRouter.ts — Batch processor and portal API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, pathParam } from './apiHelpers.js';

const createBatchBodySchema = z.object({
  name: z.string().trim().min(1),
  items: z.array(z.unknown()).min(1)
}).strict();

const submitPortalBodySchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  submittedBy: z.string().trim().min(1),
  payload: z.record(z.unknown()).optional()
}).strict();

export async function handleProductRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
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
    try {
      const body = await bodyJsonSchema(req, submitPortalBodySchema);
      const { PortalManager } = await import('../product/portal.js');
      const pm = new PortalManager();
      const job = pm.submitJob(body.name, body.type, body.submittedBy, body.payload);
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

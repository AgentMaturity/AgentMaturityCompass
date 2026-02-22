/**
 * shieldRouter.ts — Shield API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, requireMethod } from './apiHelpers.js';

const shieldScanBodySchema = z.object({
  code: z.string().min(1),
  language: z.string().trim().min(1).optional()
}).strict();

const shieldInputBodySchema = z.object({
  input: z.string().min(1)
}).strict();

export async function handleShieldRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (pathname === '/api/v1/shield/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'shield', capabilities: ['scan', 'injection-detect', 'sanitize'] });
    return true;
  }

  if (pathname === '/api/v1/shield/scan/skill' && method === 'POST') {
    if (!requireMethod(req, res, 'POST')) return true;
    try {
      const body = await bodyJsonSchema(req, shieldScanBodySchema);
      // Dynamic import to avoid hard dependency
      const { analyzeSkill } = await import('../shield/analyzer.js');
      const result = analyzeSkill(body.code);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/detect/injection' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, shieldInputBodySchema);
      const { detectInjection } = await import('../shield/detector.js');
      const result = detectInjection(body.input);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/sanitize' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, shieldInputBodySchema);
      const { sanitize } = await import('../shield/sanitizer.js');
      const result = sanitize(body.input);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  return false;
}

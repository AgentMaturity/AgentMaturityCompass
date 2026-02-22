/**
 * vaultRouter.ts — Vault API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError } from './apiHelpers.js';

const vaultRedactBodySchema = z.object({
  text: z.string().min(1),
  categories: z.array(z.string().trim().min(1)).optional()
}).strict();

const vaultClassifyBodySchema = z.object({
  content: z.string().min(1)
}).strict();

export async function handleVaultRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (pathname === '/api/v1/vault/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'vault', capabilities: ['redact', 'classify', 'dlp-scan'] });
    return true;
  }

  if (pathname === '/api/v1/vault/redact' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, vaultRedactBodySchema);
      const { scanForPII } = await import('../vault/dlp.js');
      const scanResult = scanForPII(body.text);
      apiSuccess(res, scanResult);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  if (pathname === '/api/v1/vault/classify' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, vaultClassifyBodySchema);
      // Simple classification
      const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(body.content);
      const hasPhone = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(body.content);
      const hasSSN = /\b\d{3}-?\d{2}-?\d{4}\b/.test(body.content);
      const classification = hasSSN ? 'RESTRICTED' : hasEmail || hasPhone ? 'INTERNAL' : 'PUBLIC';
      apiSuccess(res, { classification, piiDetected: { email: hasEmail, phone: hasPhone, ssn: hasSSN } });
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

/**
 * adaptersRouter.ts — Adapter management API routes.
 * Full parity with: amc adapters *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleAdaptersRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/adapters')) return false;

  // POST /api/v1/adapters/init — create signed adapters.yaml defaults
  if (pathname === '/api/v1/adapters/init' && method === 'POST') {
    try {
      const { adaptersInitCli } = await import('../adapters/adapterCli.js');
      const out = adaptersInitCli(workspace);
      apiSuccess(res, { initialized: true, ...out }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters init failed');
    }
    return true;
  }

  // GET /api/v1/adapters/verify — verify adapters.yaml signature
  if (pathname === '/api/v1/adapters/verify' && method === 'GET') {
    try {
      const { adaptersVerifyCli } = await import('../adapters/adapterCli.js');
      const out = adaptersVerifyCli(workspace);
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters verify failed');
    }
    return true;
  }

  // GET /api/v1/adapters/list — list built-in adapters and per-agent preferences
  if (pathname === '/api/v1/adapters/list' && method === 'GET') {
    try {
      const { adaptersListCli } = await import('../adapters/adapterCli.js');
      const out = adaptersListCli(workspace);
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters list failed');
    }
    return true;
  }

  // GET /api/v1/adapters/detect — detect installed adapter runtimes
  if (pathname === '/api/v1/adapters/detect' && method === 'GET') {
    try {
      const timeoutMs = queryParam(req.url ?? '', 'timeoutMs');
      const { adaptersDetectCli } = await import('../adapters/adapterCli.js');
      const rows = adaptersDetectCli({
        workspace,
        timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
      });
      apiSuccess(res, { adapters: rows, total: rows.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters detect failed');
    }
    return true;
  }

  // POST /api/v1/adapters/configure — set adapter profile for an agent
  if (pathname === '/api/v1/adapters/configure' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        adapterId: string;
        route: string;
        model: string;
        mode: 'SUPERVISE' | 'SANDBOX';
      }>(req);
      if (!body.adapterId || !body.route || !body.model || !body.mode) {
        apiError(res, 400, 'Required: adapterId, route, model, mode');
        return true;
      }
      const { adaptersConfigureCli } = await import('../adapters/adapterCli.js');
      const out = adaptersConfigureCli({
        workspace,
        agentId: body.agentId,
        adapterId: body.adapterId,
        route: body.route,
        model: body.model,
        mode: body.mode,
      });
      apiSuccess(res, { configured: true, ...out });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters configure failed');
    }
    return true;
  }

  // GET /api/v1/adapters/env — print adapter-compatible environment exports
  if (pathname === '/api/v1/adapters/env' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      const adapterId = queryParam(req.url ?? '', 'adapterId');
      const { adaptersEnvCli } = await import('../adapters/adapterCli.js');
      const out = adaptersEnvCli({
        workspace,
        agentId: agentId ?? undefined,
        adapterId: adapterId ?? undefined,
      });
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters env failed');
    }
    return true;
  }

  // POST /api/v1/adapters/run — run adapter with minted lease
  if (pathname === '/api/v1/adapters/run' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        adapterId?: string;
        workOrderId?: string;
        mode?: 'SUPERVISE' | 'SANDBOX';
        command: string[];
      }>(req);
      if (!body.command || !Array.isArray(body.command) || body.command.length === 0) {
        apiError(res, 400, 'Required: command (non-empty string array)');
        return true;
      }
      const { adaptersRunCli } = await import('../adapters/adapterCli.js');
      const out = await adaptersRunCli({
        workspace,
        agentId: body.agentId,
        adapterId: body.adapterId,
        workOrderId: body.workOrderId,
        mode: body.mode,
        command: body.command,
      });
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters run failed');
    }
    return true;
  }

  // POST /api/v1/adapters/init-project — generate runnable local adapter sample
  if (pathname === '/api/v1/adapters/init-project' && method === 'POST') {
    try {
      const body = await bodyJson<{
        adapterId: string;
        agentId?: string;
        route?: string;
      }>(req);
      if (!body.adapterId) {
        apiError(res, 400, 'Required: adapterId');
        return true;
      }
      const { adaptersInitProjectCli } = await import('../adapters/adapterCli.js');
      const out = adaptersInitProjectCli({
        workspace,
        adapterId: body.adapterId,
        agentId: body.agentId,
        route: body.route,
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adapters init-project failed');
    }
    return true;
  }

  return false;
}

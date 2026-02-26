/**
 * workflowRouter.ts — Workflow, work-order, ticket, and lifecycle API routes.
 * Full parity with: amc workorder *, amc ticket *, amc lifecycle *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';

export async function handleWorkflowRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (
    !pathname.startsWith('/api/v1/workorder') &&
    !pathname.startsWith('/api/v1/ticket') &&
    !pathname.startsWith('/api/v1/lifecycle')
  ) return false;

  // ── Work Orders ─────────────────────────────────────────────────

  // POST /api/v1/workorders — create work order
  if (pathname === '/api/v1/workorders' && method === 'POST') {
    try {
      const body = await bodyJson<{
        title: string;
        description: string;
        riskTier: string;
        mode: string;
        allowedActionClasses?: string[];
        agentId?: string;
      }>(req);
      if (!body.title || !body.description || !body.riskTier || !body.mode) {
        apiError(res, 400, 'Required: title, description, riskTier, mode');
        return true;
      }
      const { parseRiskTier, parseActionClasses } = await import('../workorders/workorderCli.js');
      const { createWorkOrder } = await import('../workorders/workorderEngine.js');
      const created = createWorkOrder({
        workspace,
        agentId: body.agentId,
        title: body.title,
        description: body.description,
        riskTier: parseRiskTier(body.riskTier),
        requestedMode: body.mode.toUpperCase() === 'EXECUTE' ? 'EXECUTE' : 'SIMULATE',
        allowedActionClasses: parseActionClasses(body.allowedActionClasses ?? []),
      });
      apiSuccess(res, {
        workOrderId: created.workOrder.workOrderId,
        filePath: created.filePath,
        sigPath: created.sigPath,
      }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not create work order');
    }
    return true;
  }

  // GET /api/v1/workorders — list work orders
  if (pathname === '/api/v1/workorders' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? undefined;
      const { listWorkOrders } = await import('../workorders/workorderEngine.js');
      const rows = listWorkOrders({ workspace, agentId });
      apiSuccess(res, { workOrders: rows, total: rows.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list work orders');
    }
    return true;
  }

  // GET /api/v1/workorders/:workOrderId — show work order
  const woShowParams = pathParam(pathname, '/api/v1/workorders/:workOrderId');
  if (woShowParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? undefined;
      const { loadWorkOrder } = await import('../workorders/workorderEngine.js');
      const workOrder = loadWorkOrder({
        workspace,
        agentId,
        workOrderId: woShowParams.workOrderId!,
        requireValidSignature: false,
      });
      apiSuccess(res, workOrder);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Work order not found');
    }
    return true;
  }

  // POST /api/v1/workorders/:workOrderId/verify — verify work order signature
  const woVerifyParams = pathParam(pathname, '/api/v1/workorders/:workOrderId/verify');
  if (woVerifyParams && method === 'POST') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? undefined;
      const { verifyWorkOrder } = await import('../workorders/workorderEngine.js');
      const result = verifyWorkOrder({
        workspace,
        agentId,
        workOrderId: woVerifyParams.workOrderId!,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Verification failed');
    }
    return true;
  }

  // POST /api/v1/workorders/:workOrderId/expire — expire/revoke work order
  const woExpireParams = pathParam(pathname, '/api/v1/workorders/:workOrderId/expire');
  if (woExpireParams && method === 'POST') {
    try {
      const body = await bodyJson<{ reason?: string; agentId?: string }>(req);
      const { expireWorkOrder } = await import('../workorders/workorderEngine.js');
      const result = expireWorkOrder({
        workspace,
        agentId: body.agentId,
        workOrderId: woExpireParams.workOrderId!,
        reason: body.reason,
      });
      apiSuccess(res, { expired: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not expire work order');
    }
    return true;
  }

  // ── Execution Tickets ───────────────────────────────────────────

  // POST /api/v1/tickets/issue — issue execution ticket
  if (pathname === '/api/v1/tickets/issue' && method === 'POST') {
    try {
      const body = await bodyJson<{
        workOrderId: string;
        action: string;
        tool?: string;
        ttl?: string;
        agentId?: string;
      }>(req);
      if (!body.workOrderId || !body.action) {
        apiError(res, 400, 'Required: workOrderId, action');
        return true;
      }
      const { normalizeActionClass, parseTtlToMs } = await import('../tickets/execTicketCli.js');
      const { issueExecTicket } = await import('../tickets/execTicketVerify.js');
      const { resolveAgentId } = await import('../fleet/paths.js');
      const agentId = resolveAgentId(workspace, body.agentId);
      const issued = issueExecTicket({
        workspace,
        agentId,
        workOrderId: body.workOrderId,
        actionClass: normalizeActionClass(body.action),
        ttlMs: parseTtlToMs(body.ttl ?? '15m'),
        toolName: body.tool,
      });
      apiSuccess(res, { ticket: issued.ticket, payload: issued.payload }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not issue ticket');
    }
    return true;
  }

  // POST /api/v1/tickets/verify — verify execution ticket
  if (pathname === '/api/v1/tickets/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ ticket: string }>(req);
      if (!body.ticket) {
        apiError(res, 400, 'Required: ticket');
        return true;
      }
      const { verifyExecTicket } = await import('../tickets/execTicketVerify.js');
      const result = verifyExecTicket({ workspace, ticket: body.ticket });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Ticket verification failed');
    }
    return true;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  // GET /api/v1/lifecycle/status — lifecycle status
  if (pathname === '/api/v1/lifecycle/status' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? undefined;
      const { lifecycleStatusCli } = await import('../lifecycle/lifecycleCli.js');
      const status = lifecycleStatusCli({ workspace, agentId });
      apiSuccess(res, status);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not get lifecycle status');
    }
    return true;
  }

  // POST /api/v1/lifecycle/advance — advance lifecycle stage
  if (pathname === '/api/v1/lifecycle/advance' && method === 'POST') {
    try {
      const body = await bodyJson<{
        to: string;
        agentId?: string;
        actor?: string;
        actorRole?: string;
        controls?: string[];
        note?: string;
      }>(req);
      if (!body.to) {
        apiError(res, 400, 'Required: to (target stage)');
        return true;
      }
      const { lifecycleAdvanceCli } = await import('../lifecycle/lifecycleCli.js');
      const result = lifecycleAdvanceCli({
        workspace,
        agentId: body.agentId,
        to: body.to,
        actor: body.actor,
        actorRole: body.actorRole,
        controls: body.controls,
        note: body.note,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Lifecycle advance failed');
    }
    return true;
  }

  return false;
}

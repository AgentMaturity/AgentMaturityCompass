/**
 * sandboxRouter.ts — Hardened sandbox execution API routes.
 * Full parity with: amc sandbox *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError } from './apiHelpers.js';

export async function handleSandboxRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/sandbox')) return false;

  // POST /api/v1/sandbox/run — run command in hardened Docker sandbox
  if (pathname === '/api/v1/sandbox/run' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        command: string;
        args?: string[];
        gatewayRoute?: string;
        gatewayProxyUrl?: string;
        image?: string;
      }>(req);
      if (!body.command) {
        apiError(res, 400, 'command is required');
        return true;
      }
      const { runSandboxCommand } = await import('../sandbox/sandbox.js');
      const result = await runSandboxCommand({
        workspace,
        agentId: body.agentId,
        command: body.command,
        args: body.args ?? [],
        gatewayRoute: body.gatewayRoute,
        gatewayProxyUrl: body.gatewayProxyUrl,
        image: body.image
      });
      apiSuccess(res, {
        sessionId: result.sessionId,
        image: result.image,
        networkName: result.networkName,
        dockerArgs: result.dockerArgs
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Sandbox run failed');
    }
    return true;
  }

  // POST /api/v1/sandbox/docker-args — preview Docker args without executing
  if (pathname === '/api/v1/sandbox/docker-args' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        command: string;
        args?: string[];
        gatewayRoute?: string;
        gatewayProxyUrl?: string;
        image?: string;
        networkName?: string;
      }>(req);
      if (!body.command) {
        apiError(res, 400, 'command is required');
        return true;
      }
      const { buildSandboxDockerArgs } = await import('../sandbox/sandbox.js');
      const dockerArgs = buildSandboxDockerArgs({
        workspace,
        agentId: body.agentId,
        command: body.command,
        args: body.args ?? [],
        gatewayRoute: body.gatewayRoute,
        gatewayProxyUrl: body.gatewayProxyUrl,
        image: body.image,
        networkName: body.networkName
      });
      apiSuccess(res, { dockerArgs });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Docker args preview failed');
    }
    return true;
  }

  return false;
}

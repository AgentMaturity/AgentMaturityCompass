/**
 * ciRouter.ts — CI/CD gate API routes.
 * Full parity with: amc ci init, amc ci steps, amc gate
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleCiRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/ci')) return false;

  // POST /api/v1/ci/init — initialize CI for an agent (scaffold workflow + signed policy)
  if (pathname === '/api/v1/ci/init' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string }>(req);
      const { initCiForAgent } = await import('../ci/gate.js');
      const result = initCiForAgent({ workspace, agentId: body.agentId });
      apiSuccess(res, { initialized: true, ...result }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'CI init failed');
    }
    return true;
  }

  // GET /api/v1/ci/steps — list CI steps for an agent
  if (pathname === '/api/v1/ci/steps' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      const { printCiSteps } = await import('../ci/gate.js');
      const steps = printCiSteps({ workspace, agentId });
      apiSuccess(res, { steps });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list CI steps');
    }
    return true;
  }

  // POST /api/v1/ci/gate — run bundle gate evaluation
  if (pathname === '/api/v1/ci/gate' && method === 'POST') {
    try {
      const body = await bodyJson<{ bundlePath: string; policyPath: string }>(req);
      if (!body.bundlePath || !body.policyPath) {
        apiError(res, 400, 'Required: bundlePath, policyPath');
        return true;
      }
      const { runBundleGate } = await import('../ci/gate.js');
      const result = await runBundleGate({
        workspace,
        bundlePath: body.bundlePath,
        policyPath: body.policyPath,
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Gate evaluation failed');
    }
    return true;
  }

  // GET /api/v1/ci/policy/default — get default gate policy
  if (pathname === '/api/v1/ci/policy/default' && method === 'GET') {
    try {
      const { defaultGatePolicy } = await import('../ci/gate.js');
      apiSuccess(res, defaultGatePolicy());
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load default policy');
    }
    return true;
  }

  // POST /api/v1/ci/policy/sign — write and sign a gate policy
  if (pathname === '/api/v1/ci/policy/sign' && method === 'POST') {
    try {
      const body = await bodyJson<{ policyPath: string; policy: unknown }>(req);
      if (!body.policyPath || !body.policy) {
        apiError(res, 400, 'Required: policyPath, policy');
        return true;
      }
      const { parseGatePolicy, writeSignedGatePolicy } = await import('../ci/gate.js');
      const policy = parseGatePolicy(body.policy);
      const result = writeSignedGatePolicy({ workspace, policyPath: body.policyPath, policy });
      apiSuccess(res, { signed: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy signing failed');
    }
    return true;
  }

  // POST /api/v1/ci/policy/verify — verify gate policy signature
  if (pathname === '/api/v1/ci/policy/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ policyPath: string }>(req);
      if (!body.policyPath) {
        apiError(res, 400, 'Required: policyPath');
        return true;
      }
      const { verifyGatePolicySignature } = await import('../ci/gate.js');
      const result = verifyGatePolicySignature({ workspace, policyPath: body.policyPath });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy verification failed');
    }
    return true;
  }

  // POST /api/v1/ci/predict — predict CI gate outcome (what-if)
  if (pathname === '/api/v1/ci/predict' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; runId: string }>(req);
      if (!body.agentId || !body.runId) {
        apiError(res, 400, 'Required: agentId, runId');
        return true;
      }
      const { predictCiGateOutcome } = await import('../simulator/ciGateWhatIf.js');
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const report = loadRunReport(workspace, body.runId, body.agentId);
      const result = predictCiGateOutcome({ workspace, agentId: body.agentId, report });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'CI gate prediction failed');
    }
    return true;
  }

  return false;
}

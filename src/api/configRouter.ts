/**
 * configRouter.ts — Runtime config, logs, doctor API routes.
 * Full parity with: amc config *, amc doctor, amc logs
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiSuccess, apiError, queryParam } from './apiHelpers.js';
import { join } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

export async function handleConfigRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/config')) return false;

  // GET /api/v1/config — resolved runtime config (secret-safe)
  if (pathname === '/api/v1/config' && method === 'GET') {
    try {
      const { loadAMCConfig } = await import('../workspace.js');
      const config = loadAMCConfig(workspace);
      // Deep-redact sensitive keys
      const safe = JSON.parse(JSON.stringify(config ?? {})) as Record<string, unknown>;
      const sensitiveKeys = ['apikey', 'secret', 'password', 'token', 'passphrase', 'privatekey', 'apitoken'];
      function redact(obj: Record<string, unknown>): void {
        for (const [k, v] of Object.entries(obj)) {
          if (sensitiveKeys.includes(k.toLowerCase())) {
            obj[k] = '[REDACTED]';
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            redact(v as Record<string, unknown>);
          }
        }
      }
      redact(safe);
      apiSuccess(res, safe);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load config');
    }
    return true;
  }

  // GET /api/v1/config/logs — latest studio logs
  if (pathname === '/api/v1/config/logs' && method === 'GET') {
    try {
      const lines = parseInt(queryParam(req.url ?? '', 'lines') ?? '100', 10);
      const logsDir = join(workspace, '.amc', 'studio', 'logs');
      if (!existsSync(logsDir)) {
        apiSuccess(res, { logs: [], message: 'No logs directory found' });
        return true;
      }
      const files = readdirSync(logsDir).filter(f => f.endsWith('.log')).sort().reverse().slice(0, 3);
      const logs: Array<{ file: string; lines: string[] }> = [];
      for (const file of files) {
        const content = readFileSync(join(logsDir, file), 'utf8');
        const fileLines = content.split('\n').filter(Boolean).slice(-lines);
        logs.push({ file, lines: fileLines });
      }
      apiSuccess(res, { logs });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not read logs');
    }
    return true;
  }

  // GET /api/v1/config/doctor — run doctor checks
  if (pathname === '/api/v1/config/doctor' && method === 'GET') {
    try {
      const { runDoctor } = await import('../workspace.js');
      const result = await runDoctor(workspace);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Doctor check failed');
    }
    return true;
  }

  // GET /api/v1/config/version — version info
  if (pathname === '/api/v1/config/version' && method === 'GET') {
    try {
      const { amcVersion } = await import('../version.js');
      apiSuccess(res, { version: amcVersion });
    } catch {
      apiSuccess(res, { version: 'unknown' });
    }
    return true;
  }

  // GET /api/v1/config/status — workspace status overview
  if (pathname === '/api/v1/config/status' && method === 'GET') {
    try {
      const { vaultStatus } = await import('../vault/vault.js');
      const { loadFleetConfig } = await import('../fleet/registry.js');
      const vault = vaultStatus(workspace);
      const fleet = (() => { try { return loadFleetConfig(workspace); } catch { return null; } })();
      const { amcVersion } = await import('../version.js');
      apiSuccess(res, {
        workspace,
        version: amcVersion,
        vault: { unlocked: vault.unlocked },
        fleet: fleet ? { initialized: true, orgName: fleet.orgName } : { initialized: false },
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Status check failed');
    }
    return true;
  }

  return false;
}

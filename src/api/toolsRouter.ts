/**
 * toolsRouter.ts — Tools, Plugin, and Guardrails API routes.
 * Full parity with: amc tools *, amc plugin *, amc guardrails *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam, pathParam } from './apiHelpers.js';

export async function handleToolsRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  /* ── Tools (ToolHub) ─────────────────────────────────────────── */

  if (pathname.startsWith('/api/v1/tools')) {
    // POST /api/v1/tools/init — create and sign .amc/tools.yaml
    if (pathname === '/api/v1/tools/init' && method === 'POST') {
      try {
        const { initToolhubConfig } = await import('../toolhub/toolhubCli.js');
        const out = initToolhubConfig(workspace);
        apiSuccess(res, { initialized: true, ...out }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Tools init failed');
      }
      return true;
    }

    // GET /api/v1/tools/verify — verify tools.yaml signature
    if (pathname === '/api/v1/tools/verify' && method === 'GET') {
      try {
        const { verifyToolhubConfig } = await import('../toolhub/toolhubCli.js');
        const out = verifyToolhubConfig(workspace);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Tools verify failed');
      }
      return true;
    }

    // GET /api/v1/tools/list — list allowed ToolHub tools
    if (pathname === '/api/v1/tools/list' && method === 'GET') {
      try {
        const { listToolhubTools } = await import('../toolhub/toolhubCli.js');
        const tools = listToolhubTools(workspace);
        apiSuccess(res, { tools, total: tools.length });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Tools list failed');
      }
      return true;
    }

    return false;
  }

  /* ── Guardrails ──────────────────────────────────────────────── */

  if (pathname.startsWith('/api/v1/guardrails')) {
    // GET /api/v1/guardrails/list — list all guardrails with status
    if (pathname === '/api/v1/guardrails/list' && method === 'GET') {
      try {
        const { createGuardrailState, listGuardrailsWithStatus } = await import('../enforce/guardrailProfiles.js');
        const state = createGuardrailState();
        const list = listGuardrailsWithStatus(state);
        apiSuccess(res, { guardrails: list, total: list.length });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Guardrails list failed');
      }
      return true;
    }

    // POST /api/v1/guardrails/enable — enable a guardrail
    if (pathname === '/api/v1/guardrails/enable' && method === 'POST') {
      try {
        const body = await bodyJson<{ name: string }>(req);
        if (!body.name) { apiError(res, 400, 'Required: name'); return true; }
        const { createGuardrailState, enableGuardrail } = await import('../enforce/guardrailProfiles.js');
        const state = createGuardrailState();
        const ok = enableGuardrail(state, body.name);
        if (!ok) { apiError(res, 404, `Unknown guardrail: ${body.name}`); return true; }
        apiSuccess(res, { enabled: true, name: body.name });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Guardrail enable failed');
      }
      return true;
    }

    // POST /api/v1/guardrails/disable — disable a guardrail
    if (pathname === '/api/v1/guardrails/disable' && method === 'POST') {
      try {
        const body = await bodyJson<{ name: string }>(req);
        if (!body.name) { apiError(res, 400, 'Required: name'); return true; }
        const { createGuardrailState, disableGuardrail } = await import('../enforce/guardrailProfiles.js');
        const state = createGuardrailState();
        const ok = disableGuardrail(state, body.name);
        if (!ok) { apiError(res, 404, `Guardrail not found or not enabled: ${body.name}`); return true; }
        apiSuccess(res, { disabled: true, name: body.name });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Guardrail disable failed');
      }
      return true;
    }

    // POST /api/v1/guardrails/profile — apply a guardrail profile
    if (pathname === '/api/v1/guardrails/profile' && method === 'POST') {
      try {
        const body = await bodyJson<{ name: string }>(req);
        if (!body.name) { apiError(res, 400, 'Required: name'); return true; }
        const { createGuardrailState, applyProfile, listGuardrailsWithStatus } = await import('../enforce/guardrailProfiles.js');
        const state = createGuardrailState();
        const ok = applyProfile(state, body.name);
        if (!ok) { apiError(res, 404, `Unknown profile: ${body.name}`); return true; }
        const enabled = listGuardrailsWithStatus(state).filter(g => g.enabled);
        apiSuccess(res, { applied: true, profile: body.name, enabledCount: enabled.length, enabled });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Guardrail profile failed');
      }
      return true;
    }

    return false;
  }

  /* ── Plugins ─────────────────────────────────────────────────── */

  if (pathname.startsWith('/api/v1/plugins')) {
    // POST /api/v1/plugins/keygen — generate plugin publisher keypair
    if (pathname === '/api/v1/plugins/keygen' && method === 'POST') {
      try {
        const body = await bodyJson<{ outDir: string }>(req);
        if (!body.outDir) { apiError(res, 400, 'Required: outDir'); return true; }
        const { pluginKeygenCli } = await import('../plugins/pluginCli.js');
        const out = pluginKeygenCli({ outDir: body.outDir });
        apiSuccess(res, out, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin keygen failed');
      }
      return true;
    }

    // POST /api/v1/plugins/pack — create signed .amcplug package
    if (pathname === '/api/v1/plugins/pack' && method === 'POST') {
      try {
        const body = await bodyJson<{ inputDir: string; keyPath: string; outFile: string }>(req);
        if (!body.inputDir || !body.keyPath || !body.outFile) {
          apiError(res, 400, 'Required: inputDir, keyPath, outFile'); return true;
        }
        const { pluginPackCli } = await import('../plugins/pluginCli.js');
        const out = pluginPackCli(body);
        apiSuccess(res, out, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin pack failed');
      }
      return true;
    }

    // POST /api/v1/plugins/verify — verify plugin package signature
    if (pathname === '/api/v1/plugins/verify' && method === 'POST') {
      try {
        const body = await bodyJson<{ file: string; pubkeyPath?: string }>(req);
        if (!body.file) { apiError(res, 400, 'Required: file'); return true; }
        const { pluginVerifyCli } = await import('../plugins/pluginCli.js');
        const out = pluginVerifyCli(body);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin verify failed');
      }
      return true;
    }

    // POST /api/v1/plugins/print — print plugin manifest summary
    if (pathname === '/api/v1/plugins/print' && method === 'POST') {
      try {
        const body = await bodyJson<{ file: string }>(req);
        if (!body.file) { apiError(res, 400, 'Required: file'); return true; }
        const { pluginPrintCli } = await import('../plugins/pluginCli.js');
        const out = pluginPrintCli(body.file);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin print failed');
      }
      return true;
    }

    // POST /api/v1/plugins/init — initialize signed plugin workspace
    if (pathname === '/api/v1/plugins/init' && method === 'POST') {
      try {
        const { pluginInitCli } = await import('../plugins/pluginCli.js');
        const out = pluginInitCli(workspace);
        apiSuccess(res, { initialized: true, ...out }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin init failed');
      }
      return true;
    }

    // GET /api/v1/plugins/workspace-verify — verify workspace plugin integrity
    if (pathname === '/api/v1/plugins/workspace-verify' && method === 'GET') {
      try {
        const { pluginWorkspaceVerifyCli } = await import('../plugins/pluginCli.js');
        const out = pluginWorkspaceVerifyCli(workspace);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin workspace-verify failed');
      }
      return true;
    }

    // GET /api/v1/plugins/list — list installed plugins
    if (pathname === '/api/v1/plugins/list' && method === 'GET') {
      try {
        const { pluginListCli } = await import('../plugins/pluginCli.js');
        const out = pluginListCli(workspace);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin list failed');
      }
      return true;
    }

    // GET /api/v1/plugins/registries — list workspace registry configuration
    if (pathname === '/api/v1/plugins/registries' && method === 'GET') {
      try {
        const { pluginRegistriesListCli } = await import('../plugins/pluginCli.js');
        const out = pluginRegistriesListCli(workspace);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin registries list failed');
      }
      return true;
    }

    // POST /api/v1/plugins/registries-apply — apply and sign workspace registries
    if (pathname === '/api/v1/plugins/registries-apply' && method === 'POST') {
      try {
        const body = await bodyJson<{ config: Record<string, unknown> }>(req);
        if (!body.config) { apiError(res, 400, 'Required: config'); return true; }
        const { pluginRegistryApplyCli } = await import('../plugins/pluginCli.js');
        const out = pluginRegistryApplyCli({ workspace, config: body.config });
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin registries-apply failed');
      }
      return true;
    }

    // POST /api/v1/plugins/registry/init — initialize local registry
    if (pathname === '/api/v1/plugins/registry/init' && method === 'POST') {
      try {
        const body = await bodyJson<{ dir: string; registryId?: string; registryName?: string }>(req);
        if (!body.dir) { apiError(res, 400, 'Required: dir'); return true; }
        const { pluginRegistryInitCli } = await import('../plugins/pluginCli.js');
        const out = pluginRegistryInitCli(body);
        apiSuccess(res, out, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin registry init failed');
      }
      return true;
    }

    // POST /api/v1/plugins/registry/publish — publish plugin into registry
    if (pathname === '/api/v1/plugins/registry/publish' && method === 'POST') {
      try {
        const body = await bodyJson<{ dir: string; pluginFile: string; registryKeyPath: string }>(req);
        if (!body.dir || !body.pluginFile || !body.registryKeyPath) {
          apiError(res, 400, 'Required: dir, pluginFile, registryKeyPath'); return true;
        }
        const { pluginRegistryPublishCli } = await import('../plugins/pluginCli.js');
        const out = pluginRegistryPublishCli(body);
        apiSuccess(res, out, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin registry publish failed');
      }
      return true;
    }

    // POST /api/v1/plugins/registry/verify — verify registry signature
    if (pathname === '/api/v1/plugins/registry/verify' && method === 'POST') {
      try {
        const body = await bodyJson<{ dir: string }>(req);
        if (!body.dir) { apiError(res, 400, 'Required: dir'); return true; }
        const { pluginRegistryVerifyCli } = await import('../plugins/pluginCli.js');
        const out = pluginRegistryVerifyCli(body.dir);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin registry verify failed');
      }
      return true;
    }

    // POST /api/v1/plugins/search — search a plugin registry
    if (pathname === '/api/v1/plugins/search' && method === 'POST') {
      try {
        const body = await bodyJson<{ registry: string; query?: string }>(req);
        if (!body.registry) { apiError(res, 400, 'Required: registry'); return true; }
        const { pluginSearchCli } = await import('../plugins/pluginCli.js');
        const out = await pluginSearchCli(body);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin search failed');
      }
      return true;
    }

    // POST /api/v1/plugins/install — request plugin install
    if (pathname === '/api/v1/plugins/install' && method === 'POST') {
      try {
        const body = await bodyJson<{
          registryId: string; pluginRef: string; agentId?: string;
        }>(req);
        if (!body.registryId || !body.pluginRef) {
          apiError(res, 400, 'Required: registryId, pluginRef'); return true;
        }
        const { pluginInstallCli } = await import('../plugins/pluginCli.js');
        const out = await pluginInstallCli({
          workspace,
          agentId: body.agentId,
          registryId: body.registryId,
          pluginRef: body.pluginRef,
          action: 'install',
        });
        apiSuccess(res, out, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin install failed');
      }
      return true;
    }

    // POST /api/v1/plugins/upgrade — request plugin upgrade
    if (pathname === '/api/v1/plugins/upgrade' && method === 'POST') {
      try {
        const body = await bodyJson<{
          registryId: string; pluginId: string; to?: string; agentId?: string;
        }>(req);
        if (!body.registryId || !body.pluginId) {
          apiError(res, 400, 'Required: registryId, pluginId'); return true;
        }
        const { pluginUpgradeCli } = await import('../plugins/pluginCli.js');
        const out = await pluginUpgradeCli({
          workspace,
          agentId: body.agentId,
          registryId: body.registryId,
          pluginId: body.pluginId,
          to: body.to ?? 'latest',
        });
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin upgrade failed');
      }
      return true;
    }

    // POST /api/v1/plugins/remove — request plugin removal
    if (pathname === '/api/v1/plugins/remove' && method === 'POST') {
      try {
        const body = await bodyJson<{ pluginId: string; agentId?: string }>(req);
        if (!body.pluginId) { apiError(res, 400, 'Required: pluginId'); return true; }
        const { pluginRemoveCli } = await import('../plugins/pluginCli.js');
        const out = pluginRemoveCli({
          workspace,
          agentId: body.agentId,
          pluginId: body.pluginId,
        });
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin remove failed');
      }
      return true;
    }

    // POST /api/v1/plugins/execute — execute approved plugin action
    if (pathname === '/api/v1/plugins/execute' && method === 'POST') {
      try {
        const body = await bodyJson<{ approvalRequestId: string }>(req);
        if (!body.approvalRequestId) { apiError(res, 400, 'Required: approvalRequestId'); return true; }
        const { pluginExecuteCli } = await import('../plugins/pluginCli.js');
        const out = pluginExecuteCli({ workspace, approvalRequestId: body.approvalRequestId });
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin execute failed');
      }
      return true;
    }

    // POST /api/v1/plugins/registry-fingerprint — compute registry pubkey fingerprint
    if (pathname === '/api/v1/plugins/registry-fingerprint' && method === 'POST') {
      try {
        const body = await bodyJson<{ pubkeyPath: string }>(req);
        if (!body.pubkeyPath) { apiError(res, 400, 'Required: pubkeyPath'); return true; }
        const { pluginRegistryFingerprintFromFile } = await import('../plugins/pluginCli.js');
        const fingerprint = pluginRegistryFingerprintFromFile(body.pubkeyPath);
        apiSuccess(res, { fingerprint });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Plugin registry-fingerprint failed');
      }
      return true;
    }

    return false;
  }

  return false;
}

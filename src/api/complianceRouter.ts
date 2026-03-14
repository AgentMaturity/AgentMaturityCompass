/**
 * complianceRouter.ts — Compliance, policy, waiver, and regulatory scoring API routes.
 * Full parity with: amc compliance *, amc policy *, amc waiver *,
 *   amc eu-ai-act, amc owasp-llm, amc regulatory-readiness
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ComplianceFramework } from '../compliance/frameworks.js';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';

export async function handleComplianceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  // ── Compliance routes (/api/v1/compliance/*) ───────────────────
  if (pathname.startsWith('/api/v1/compliance')) {
    // POST /api/v1/compliance/init — create and sign compliance-maps.yaml
    if (pathname === '/api/v1/compliance/init' && method === 'POST') {
      try {
        const { initComplianceMapsCli } = await import('../compliance/complianceCli.js');
        const out = initComplianceMapsCli(workspace);
        apiSuccess(res, { path: out.path, sigPath: out.sigPath }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Compliance init failed');
      }
      return true;
    }

    // GET /api/v1/compliance/verify — verify compliance maps signature
    if (pathname === '/api/v1/compliance/verify' && method === 'GET') {
      try {
        const { verifyComplianceMapsCli } = await import('../compliance/complianceCli.js');
        const out = verifyComplianceMapsCli(workspace);
        apiSuccess(res, out);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Compliance verify failed');
      }
      return true;
    }

    // POST /api/v1/compliance/report — generate evidence-linked compliance report
    if (pathname === '/api/v1/compliance/report' && method === 'POST') {
      try {
        const body = await bodyJson<{
          framework: string; window: string; outFile: string;
          format?: string; agentId?: string;
        }>(req);
        if (!body.framework || !body.window || !body.outFile) {
          apiError(res, 400, 'framework, window, and outFile required'); return true;
        }
        const { complianceReportCli } = await import('../compliance/complianceCli.js');
        const format = (body.format ?? (body.outFile.toLowerCase().endsWith('.json') ? 'json' : 'md')) as 'md' | 'json';
        const out = complianceReportCli({
          workspace,
          framework: body.framework as ComplianceFramework,
          window: body.window,
          outFile: body.outFile,
          format,
          agentId: body.agentId,
        });
        apiSuccess(res, {
          outFile: out.outFile,
          coverageScore: out.report.coverage.score,
        }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Compliance report failed');
      }
      return true;
    }

    // POST /api/v1/compliance/fleet — generate fleet compliance summary
    if (pathname === '/api/v1/compliance/fleet' && method === 'POST') {
      try {
        const body = await bodyJson<{ framework: string; window: string }>(req);
        if (!body.framework || !body.window) {
          apiError(res, 400, 'framework and window required'); return true;
        }
        const { complianceFleetReportCli } = await import('../compliance/complianceCli.js');
        const report = complianceFleetReportCli({
          workspace,
          framework: body.framework as ComplianceFramework,
          window: body.window,
        });
        apiSuccess(res, report);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Fleet compliance report failed');
      }
      return true;
    }

    // POST /api/v1/compliance/diff — diff two compliance report JSON files
    if (pathname === '/api/v1/compliance/diff' && method === 'POST') {
      try {
        const body = await bodyJson<{ reportA: string; reportB: string }>(req);
        if (!body.reportA || !body.reportB) {
          apiError(res, 400, 'reportA and reportB required'); return true;
        }
        const { complianceDiffCli } = await import('../compliance/complianceCli.js');
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const diff = complianceDiffCli(
          readFileSync(resolve(workspace, body.reportA), 'utf8'),
          readFileSync(resolve(workspace, body.reportB), 'utf8'),
        );
        apiSuccess(res, diff);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Compliance diff failed');
      }
      return true;
    }

    // GET /api/v1/compliance/regulatory/feeds — list configured regulatory feeds
    if (pathname === '/api/v1/compliance/regulatory/feeds' && method === 'GET') {
      try {
        const { DEFAULT_REGULATORY_FEEDS } = await import('../compliance/regulatoryAutomation.js');
        apiSuccess(res, { feeds: DEFAULT_REGULATORY_FEEDS, count: DEFAULT_REGULATORY_FEEDS.length });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Failed to list regulatory feeds');
      }
      return true;
    }

    // POST /api/v1/compliance/regulatory/check — check all feeds for regulatory changes
    if (pathname === '/api/v1/compliance/regulatory/check' && method === 'POST') {
      try {
        const { RegulatoryMonitor } = await import('../compliance/regulatoryAutomation.js');
        const monitor = new RegulatoryMonitor();
        const results = await monitor.checkAllFeeds();
        apiSuccess(res, { results, checkedAt: new Date().toISOString() });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Regulatory check failed');
      }
      return true;
    }

    // GET /api/v1/compliance/regulatory/changes — get recent regulatory changes
    if (pathname === '/api/v1/compliance/regulatory/changes' && method === 'GET') {
      try {
        const { getRegulatoryChanges } = await import('../compliance/regulatoryAutomation.js');
        const url = new URL(req.url ?? pathname, 'http://localhost');
        const framework = url.searchParams.get('framework') ?? undefined;
        const severity = url.searchParams.get('severity') ?? undefined;
        const changes = getRegulatoryChanges([], { framework, severity });
        apiSuccess(res, { changes, count: changes.length });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Failed to get regulatory changes');
      }
      return true;
    }

    return false;
  }

  // ── Policy routes (/api/v1/policy/*) ───────────────────────────
  if (pathname.startsWith('/api/v1/policy')) {
    // POST /api/v1/policy/action/init — create and sign action policy
    if (pathname === '/api/v1/policy/action/init' && method === 'POST') {
      try {
        const { initActionPolicy } = await import('../governor/actionPolicyEngine.js');
        const created = initActionPolicy(workspace);
        apiSuccess(res, { policyPath: created.policyPath, signaturePath: created.signaturePath }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Action policy init failed');
      }
      return true;
    }

    // GET /api/v1/policy/action/verify — verify action policy signature
    if (pathname === '/api/v1/policy/action/verify' && method === 'GET') {
      try {
        const { verifyActionPolicySignature } = await import('../governor/actionPolicyEngine.js');
        const verify = verifyActionPolicySignature(workspace);
        apiSuccess(res, { valid: verify.valid, reason: verify.reason ?? null, sigPath: verify.sigPath });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Action policy verify failed');
      }
      return true;
    }

    // POST /api/v1/policy/approval/init — create and sign approval policy
    if (pathname === '/api/v1/policy/approval/init' && method === 'POST') {
      try {
        const { initApprovalPolicy } = await import('../approvals/approvalPolicyEngine.js');
        const created = initApprovalPolicy(workspace);
        apiSuccess(res, { path: created.path, sigPath: created.sigPath }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Approval policy init failed');
      }
      return true;
    }

    // GET /api/v1/policy/approval/verify — verify approval policy signature
    if (pathname === '/api/v1/policy/approval/verify' && method === 'GET') {
      try {
        const { verifyApprovalPolicySignature } = await import('../approvals/approvalPolicyEngine.js');
        const verify = verifyApprovalPolicySignature(workspace);
        apiSuccess(res, { valid: verify.valid, reason: verify.reason ?? null, sigPath: verify.sigPath });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Approval policy verify failed');
      }
      return true;
    }

    // GET /api/v1/policy/pack/list — list built-in policy packs
    if (pathname === '/api/v1/policy/pack/list' && method === 'GET') {
      try {
        const { policyPackListCli } = await import('../policyPacks/packCli.js');
        const packs = policyPackListCli();
        apiSuccess(res, { packs, total: packs.length });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Policy pack list failed');
      }
      return true;
    }

    // GET /api/v1/policy/pack/describe/:packId — describe policy pack
    const describeParams = pathParam(pathname, '/api/v1/policy/pack/describe/:packId');
    if (describeParams && method === 'GET') {
      try {
        const { policyPackDescribeCli } = await import('../policyPacks/packCli.js');
        const pack = policyPackDescribeCli(describeParams.packId!);
        apiSuccess(res, pack);
      } catch (err) {
        apiError(res, 404, err instanceof Error ? err.message : 'Policy pack not found');
      }
      return true;
    }

    // POST /api/v1/policy/pack/diff — show diff for applying a policy pack
    if (pathname === '/api/v1/policy/pack/diff' && method === 'POST') {
      try {
        const body = await bodyJson<{ packId: string; agentId?: string }>(req);
        if (!body.packId) { apiError(res, 400, 'packId required'); return true; }
        const { policyPackDiffCli } = await import('../policyPacks/packCli.js');
        const diff = policyPackDiffCli({
          workspace,
          agentId: body.agentId,
          packId: body.packId,
        });
        apiSuccess(res, diff);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Policy pack diff failed');
      }
      return true;
    }

    // POST /api/v1/policy/pack/apply — apply policy pack
    if (pathname === '/api/v1/policy/pack/apply' && method === 'POST') {
      try {
        const body = await bodyJson<{ packId: string; agentId?: string }>(req);
        if (!body.packId) { apiError(res, 400, 'packId required'); return true; }
        const { policyPackApplyCli } = await import('../policyPacks/packCli.js');
        const applied = policyPackApplyCli({
          workspace,
          agentId: body.agentId,
          packId: body.packId,
        });
        apiSuccess(res, applied);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Policy pack apply failed');
      }
      return true;
    }

    // POST /api/v1/policy/debt/add — register policy debt
    if (pathname === '/api/v1/policy/debt/add' && method === 'POST') {
      try {
        const body = await bodyJson<{
          agentId?: string; requirement: string; justification: string;
          expires: string; createdBy?: string;
        }>(req);
        if (!body.requirement || !body.justification || !body.expires) {
          apiError(res, 400, 'requirement, justification, and expires required'); return true;
        }
        const { registerPolicyDebt } = await import('../governor/policyCanary.js');
        const agentId = body.agentId ?? 'default';
        let expiresTs: number;
        if (/^\d+$/.test(body.expires)) {
          expiresTs = parseInt(body.expires, 10);
        } else {
          const match = body.expires.match(/^(\d+)([dhm])$/);
          if (match) {
            const val = parseInt(match[1]!, 10);
            const unit = match[2];
            const ms = unit === 'd' ? val * 86400000 : unit === 'h' ? val * 3600000 : val * 60000;
            expiresTs = Date.now() + ms;
          } else {
            expiresTs = Date.now() + 86400000;
          }
        }
        const entry = registerPolicyDebt({
          agentId,
          waivedRequirement: body.requirement,
          justification: body.justification,
          expiresTs,
          createdBy: body.createdBy ?? 'operator',
        }, workspace);
        apiSuccess(res, { debtId: entry.debtId }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Policy debt registration failed');
      }
      return true;
    }

    // GET /api/v1/policy/debt/list — list active policy debt
    if (pathname === '/api/v1/policy/debt/list' && method === 'GET') {
      try {
        const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
        const includeExpired = queryParam(req.url ?? '', 'all') === 'true';
        const { getActivePolicyDebt, getExpiredPolicyDebt } = await import('../governor/policyCanary.js');
        const active = getActivePolicyDebt(agentId);
        const expired = includeExpired ? getExpiredPolicyDebt(agentId) : [];
        apiSuccess(res, { active, expired, activeCount: active.length, expiredCount: expired.length });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Policy debt list failed');
      }
      return true;
    }

    // POST /api/v1/policy/ops/init — create and sign ops policy
    if (pathname === '/api/v1/policy/ops/init' && method === 'POST') {
      try {
        const { initOpsPolicy } = await import('../ops/policy.js');
        const created = initOpsPolicy(workspace);
        apiSuccess(res, { configPath: created.configPath, sigPath: created.sigPath }, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Ops policy init failed');
      }
      return true;
    }

    // GET /api/v1/policy/ops/verify — verify ops policy signature
    if (pathname === '/api/v1/policy/ops/verify' && method === 'GET') {
      try {
        const { verifyOpsPolicySignature } = await import('../ops/policy.js');
        const verify = verifyOpsPolicySignature(workspace);
        apiSuccess(res, { valid: verify.valid, reason: verify.reason ?? null, sigPath: verify.sigPath });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Ops policy verify failed');
      }
      return true;
    }

    // GET /api/v1/policy/ops/print — print effective ops policy
    if (pathname === '/api/v1/policy/ops/print' && method === 'GET') {
      try {
        const { loadOpsPolicy } = await import('../ops/policy.js');
        const policy = loadOpsPolicy(workspace);
        apiSuccess(res, policy);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Ops policy load failed');
      }
      return true;
    }

    return false;
  }

  // ── Waiver routes (/api/v1/waiver/*) ───────────────────────────
  if (pathname.startsWith('/api/v1/waiver')) {
    // POST /api/v1/waiver/request — request time-limited readiness waiver
    if (pathname === '/api/v1/waiver/request' && method === 'POST') {
      try {
        const body = await bodyJson<{ hours: number; reason: string; agentId?: string }>(req);
        if (!body.hours || !body.reason) {
          apiError(res, 400, 'hours and reason required'); return true;
        }
        const { assuranceWaiverRequestCli } = await import('../assurance/assuranceCli.js');
        const out = assuranceWaiverRequestCli({
          workspace,
          agentId: body.agentId ?? 'default',
          reason: body.reason,
          hours: body.hours,
        });
        apiSuccess(res, out, 201);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Waiver request failed');
      }
      return true;
    }

    // GET /api/v1/waiver/status — show waiver status
    if (pathname === '/api/v1/waiver/status' && method === 'GET') {
      try {
        const { assuranceWaiverStatusCli } = await import('../assurance/assuranceCli.js');
        const status = assuranceWaiverStatusCli(workspace);
        apiSuccess(res, status);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Waiver status failed');
      }
      return true;
    }

    // POST /api/v1/waiver/revoke — revoke active waiver
    if (pathname === '/api/v1/waiver/revoke' && method === 'POST') {
      try {
        const body = await bodyJson<{ waiverId?: string }>(req);
        const { assuranceWaiverRevokeCli } = await import('../assurance/assuranceCli.js');
        const out = assuranceWaiverRevokeCli({
          workspace,
          waiverId: body.waiverId,
        });
        if (!out.revoked) {
          apiError(res, 404, out.reason ?? 'No active waiver to revoke');
          return true;
        }
        apiSuccess(res, { revoked: true, waiverId: out.waiverId });
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Waiver revoke failed');
      }
      return true;
    }

    return false;
  }

  // ── Regulatory scoring routes (/api/v1/regulatory/*) ───────────
  if (pathname.startsWith('/api/v1/regulatory')) {
    // GET /api/v1/regulatory/eu-ai-act — score EU AI Act compliance
    if (pathname === '/api/v1/regulatory/eu-ai-act' && method === 'GET') {
      try {
        const { scoreEUAIActCompliance } = await import('../score/euAIActCompliance.js');
        const result = scoreEUAIActCompliance(workspace);
        apiSuccess(res, result);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'EU AI Act scoring failed');
      }
      return true;
    }

    // GET /api/v1/regulatory/owasp-llm — score OWASP LLM Top 10 coverage
    if (pathname === '/api/v1/regulatory/owasp-llm' && method === 'GET') {
      try {
        const { scoreOWASPLLMCoverage } = await import('../score/owaspLLMCoverage.js');
        const result = scoreOWASPLLMCoverage(workspace);
        apiSuccess(res, result);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'OWASP LLM scoring failed');
      }
      return true;
    }

    // GET /api/v1/regulatory/readiness — compute weighted regulatory readiness score
    if (pathname === '/api/v1/regulatory/readiness' && method === 'GET') {
      try {
        const agentId = queryParam(req.url ?? '', 'agentId');
        if (!agentId) { apiError(res, 400, 'agentId query parameter required'); return true; }
        const { scoreRegulatoryReadiness } = await import('../score/regulatoryReadiness.js');
        const result = scoreRegulatoryReadiness({ workspace, agentId });
        apiSuccess(res, result);
      } catch (err) {
        apiError(res, 500, err instanceof Error ? err.message : 'Regulatory readiness scoring failed');
      }
      return true;
    }

    return false;
  }

  return false;
}

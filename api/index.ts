/**
 * AMC API Server — Lightweight REST API for scoring agents
 * 
 * Endpoints:
 *   GET  /api/health          — Health check
 *   GET  /api/questions       — List all diagnostic questions
 *   GET  /api/packs           — List sector packs
 *   POST /api/score           — Score an agent from evidence/responses
 *   POST /api/quickscore      — Quick self-assessment score
 *   GET  /api/badge/:agentId  — SVG badge for agent's score
 * 
 * Can run standalone: npx ts-node api/index.ts
 * Or deploy to Vercel/Railway/Fly.io
 */

import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIndustryPackCheckoutUrl,
  createIndustryPackLicenseKey,
  getIndustryPackEntitlement,
  INDUSTRY_PACKS_MONTHLY_PRICE_USD,
  INDUSTRY_PACKS_PLAN_ID,
  verifyIndustryPackLicenseKey,
  type IndustryPackLicenseStatus
} from '../src/domains/industryPackEntitlement.js';

const PORT = parseInt(process.env.PORT || '3213', 10);

interface QuickScoreRequest {
  agentId: string;
  responses: Record<string, number>; // questionId -> level (0-5)
  metadata?: {
    framework?: string;
    description?: string;
  };
}

interface ScoreResult {
  agentId: string;
  composite: number;
  level: string;
  dimensions: Record<string, { score: number; level: string; questions: number }>;
  timestamp: string;
  version: string;
}

interface CheckoutRequest {
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  clientReferenceId?: string;
}

interface LicenseIssueRequest {
  customerId?: string;
  subscriptionId?: string;
  email?: string;
  status?: IndustryPackLicenseStatus;
  expiresAt?: string | null;
}

interface LicenseVerifyRequest {
  licenseKey?: string;
}

// Dimension definitions
const DIMENSIONS: Record<string, { name: string; questionPrefix: string[] }> = {
  'strategic-ops': { name: 'Strategic Agent Operations', questionPrefix: ['SO'] },
  'skills': { name: 'Skills', questionPrefix: ['SK'] },
  'resilience': { name: 'Resilience', questionPrefix: ['RS', 'RL'] },
  'autonomy': { name: 'Leadership & Autonomy', questionPrefix: ['LA', 'OC'] },
  'alignment': { name: 'Culture & Alignment', questionPrefix: ['CA', 'EG'] },
};

function levelFromScore(score: number): string {
  if (score >= 90) return 'L5';
  if (score >= 70) return 'L4';
  if (score >= 50) return 'L3';
  if (score >= 30) return 'L2';
  if (score >= 10) return 'L1';
  return 'L0';
}

function levelColor(level: string): string {
  const colors: Record<string, string> = {
    'L0': '#dc3545', 'L1': '#fd7e14', 'L2': '#ffc107',
    'L3': '#28a745', 'L4': '#007bff', 'L5': '#6f42c1',
  };
  return colors[level] || '#6c757d';
}

function generateBadgeSvg(agentId: string, level: string, score: number): string {
  const color = levelColor(level);
  const label = `AMC`;
  const value = `${level} · ${score.toFixed(0)}`;
  const labelWidth = 30;
  const valueWidth = 55;
  const totalWidth = labelWidth + valueWidth;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="AMC: ${level}">
  <title>AMC: ${level} (${score.toFixed(1)})</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function computeQuickScore(req: QuickScoreRequest): ScoreResult {
  const responses = req.responses || {};
  const dimScores: Record<string, { total: number; count: number }> = {};
  
  // Initialize dimensions
  for (const [dimId] of Object.entries(DIMENSIONS)) {
    dimScores[dimId] = { total: 0, count: 0 };
  }
  
  // Assign responses to dimensions
  for (const [qId, level] of Object.entries(responses)) {
    const clampedLevel = Math.max(0, Math.min(5, level));
    const prefix = qId.split('-')[0];
    
    for (const [dimId, dim] of Object.entries(DIMENSIONS)) {
      if (dim.questionPrefix.some(p => prefix === p)) {
        dimScores[dimId].total += (clampedLevel / 5) * 100;
        dimScores[dimId].count += 1;
        break;
      }
    }
  }
  
  const dimensions: ScoreResult['dimensions'] = {};
  let compositeTotal = 0;
  let dimCount = 0;
  
  for (const [dimId, dim] of Object.entries(DIMENSIONS)) {
    const s = dimScores[dimId];
    const score = s.count > 0 ? s.total / s.count : 0;
    dimensions[dim.name] = {
      score: Math.round(score * 10) / 10,
      level: levelFromScore(score),
      questions: s.count,
    };
    compositeTotal += score;
    dimCount += 1;
  }
  
  const composite = dimCount > 0 ? compositeTotal / dimCount : 0;
  
  return {
    agentId: req.agentId || 'unknown',
    composite: Math.round(composite * 10) / 10,
    level: levelFromScore(composite),
    dimensions,
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  };
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody<T>(req: http.IncomingMessage, maxBytes = 1_048_576): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

function hasAdminToken(req: http.IncomingMessage): boolean {
  const expected = process.env.AMC_INDUSTRY_PACKS_ADMIN_TOKEN;
  if (!expected) {
    return false;
  }
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const header = req.headers['x-amc-admin-token'];
  const provided = bearer ?? (Array.isArray(header) ? header[0] : header);
  return provided === expected;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = parsedUrl.pathname || '/';
  const method = req.method || 'GET';
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-AMC-Admin-Token');
  
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Routes
  if (path === '/api/health' && method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0',
      questions: 240,
      modules: 75,
      assurancePacks: 147,
      sectorPacks: 40,
      industryPacksPlan: INDUSTRY_PACKS_PLAN_ID,
      industryPacksPriceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD,
    });
    return;
  }

  if (path === '/api/industry-packs/access' && method === 'GET') {
    sendJson(res, 200, {
      entitlement: getIndustryPackEntitlement(process.cwd()),
      checkoutUrl: buildIndustryPackCheckoutUrl({
        successUrl: parsedUrl.searchParams.get('successUrl') ?? undefined,
        cancelUrl: parsedUrl.searchParams.get('cancelUrl') ?? undefined,
        customerEmail: parsedUrl.searchParams.get('email') ?? undefined,
        clientReferenceId: parsedUrl.searchParams.get('reference') ?? undefined,
      })
    });
    return;
  }

  if (path === '/api/industry-packs/checkout' && method === 'POST') {
    try {
      const data = await readJsonBody<CheckoutRequest>(req);
      sendJson(res, 200, {
        planId: INDUSTRY_PACKS_PLAN_ID,
        priceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD,
        checkoutUrl: buildIndustryPackCheckoutUrl({
          successUrl: data.successUrl,
          cancelUrl: data.cancelUrl,
          customerEmail: data.customerEmail,
          clientReferenceId: data.clientReferenceId,
        }),
      });
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
    }
    return;
  }

  if ((path === '/api/industry-packs/license/issue' || path === '/api/industry-packs/webhook') && method === 'POST') {
    if (!hasAdminToken(req)) {
      sendJson(res, 401, { error: 'admin token required' });
      return;
    }
    try {
      const data = await readJsonBody<LicenseIssueRequest>(req);
      const licenseKey = createIndustryPackLicenseKey({
        customerId: data.customerId,
        subscriptionId: data.subscriptionId,
        email: data.email,
        status: data.status ?? 'active',
        expiresAt: data.expiresAt ?? null,
      });
      sendJson(res, 200, {
        planId: INDUSTRY_PACKS_PLAN_ID,
        licenseKey,
        activationCommand: 'amc domain pack activate --key <license-key>',
      });
    } catch (e) {
      sendJson(res, 503, {
        error: e instanceof Error ? e.message : 'license issue failed',
        requiredEnv: ['AMC_INDUSTRY_PACKS_LICENSE_SECRET', 'AMC_INDUSTRY_PACKS_ADMIN_TOKEN'],
      });
    }
    return;
  }

  if (path === '/api/industry-packs/license/verify' && method === 'POST') {
    try {
      const data = await readJsonBody<LicenseVerifyRequest>(req);
      if (!data.licenseKey) {
        sendJson(res, 400, { valid: false, reason: 'licenseKey is required' });
        return;
      }
      const verification = verifyIndustryPackLicenseKey(data.licenseKey);
      sendJson(res, verification.valid ? 200 : 422, {
        valid: verification.valid,
        reason: verification.reason,
        license: verification.payload,
      });
    } catch {
      sendJson(res, 400, { valid: false, reason: 'Invalid JSON body' });
    }
    return;
  }
  
  if (path === '/api/quickscore' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body) as QuickScoreRequest;
        const result = computeQuickScore(data);
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 400, { error: 'Invalid JSON body', usage: 'POST { agentId, responses: { "SO-01": 3, "SK-02": 4, ... } }' });
      }
    });
    return;
  }
  
  if (path?.startsWith('/api/badge/') && method === 'GET') {
    const agentId = path.split('/api/badge/')[1] || 'unknown';
    // For now, return a default badge. In production, look up cached scores.
    const svg = generateBadgeSvg(agentId, 'L0', 0);
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
    res.end(svg);
    return;
  }
  
  if (path === '/' || path === '/api') {
    sendJson(res, 200, {
      name: 'Agent Maturity Compass API',
      version: '1.0.0',
      endpoints: {
        'GET /api/health': 'Health check',
        'GET /api/industry-packs/access': 'Industry Packs entitlement and checkout metadata',
        'POST /api/industry-packs/checkout': 'Create an Industry Packs checkout handoff URL',
        'POST /api/industry-packs/license/verify': 'Verify an Industry Packs license key',
        'POST /api/industry-packs/license/issue': 'Issue a signed Industry Packs license key for a paid customer',
        'POST /api/quickscore': 'Quick self-assessment score',
        'GET /api/badge/:agentId': 'SVG badge for agent score',
      },
      docs: 'https://agentmaturity.co/',
      github: 'https://github.com/AgentMaturity/AgentMaturityCompass',
    });
    return;
  }
  
  sendJson(res, 404, { error: 'Not found' });
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (invokedFile === currentFile) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`🧭 AMC API running on http://localhost:${PORT}`);
    console.log(`   Health:     GET  http://localhost:${PORT}/api/health`);
    console.log(`   QuickScore: POST http://localhost:${PORT}/api/quickscore`);
    console.log(`   Badge:      GET  http://localhost:${PORT}/api/badge/:agentId`);
  });
}

export default handleRequest;
export { handleRequest, computeQuickScore, generateBadgeSvg };

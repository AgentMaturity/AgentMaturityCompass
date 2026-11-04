/**
 * AMC API Server — Lightweight REST API for scoring agents
 * 
 * Endpoints:
 *   GET  /api/health          — Health check
 *   GET  /api/industry-packs/access — Industry Packs price and checkout availability in this deployment
 *   POST /api/quickscore      — Quick self-assessment score
 *   GET  /api/badge/:agentId  — Labelled placeholder SVG badge
 * 
 * Development: pnpm api:start; production: pnpm build && pnpm api:start:production
 * Or deploy to Vercel/Railway/Fly.io
 */

import http from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { amcVersion } from '../src/version.js';
import { questionBank } from '../src/diagnostic/questionBank.js';
import { listAssurancePacks } from '../src/assurance/packs/index.js';
import { listIndustryPacks } from '../src/domains/industryPacks.js';
import {
  buildIndustryPackCheckoutUrl,
  createIndustryPackLicenseKey,
  hostedIndustryPackAccess,
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
  packageVersion: string;
  assessmentBasis: 'self_reported';
  evidenceVerified: false;
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
        dimScores[dimId]!.total += (clampedLevel / 5) * 100;
        dimScores[dimId]!.count += 1;
        break;
      }
    }
  }
  
  const dimensions: ScoreResult['dimensions'] = {};
  let compositeTotal = 0;
  let dimCount = 0;
  
  for (const [dimId, dim] of Object.entries(DIMENSIONS)) {
    const s = dimScores[dimId]!;
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
    packageVersion: amcVersion,
    assessmentBasis: 'self_reported',
    evidenceVerified: false,
  };
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
}

async function readRawBody(req: http.IncomingMessage, maxBytes = 1_048_576): Promise<Buffer> {
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
  return Buffer.concat(chunks);
}

async function readJsonBody<T>(req: http.IncomingMessage, maxBytes = 1_048_576): Promise<T> {
  const raw = (await readRawBody(req, maxBytes)).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

/** Equal-length digests, so the compare takes the same time whatever was sent and leaks no length. */
function sameSecret(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(provided), digest(expected));
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
  return typeof provided === 'string' && sameSecret(provided, expected);
}

const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Stripe's documented scheme: `Stripe-Signature: t=<unix>,v1=<hex>`, where v1 is HMAC-SHA256 with the endpoint secret over
 * `<t>.<raw body bytes>`, and t must be within five minutes of this server's clock. Any v1 entry may match (secret rolls).
 */
function verifyStripeSignature(raw: Buffer, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const parts = (header ?? '').split(',').map(part => part.trim().split('='));
  const t = parts.find(([key]) => key === 't')?.[1] ?? '';
  const signatures = parts.filter(([key, value]) => key === 'v1' && /^[0-9a-f]{64}$/.test(value ?? '')).map(([, value]) => value as string);
  if (!/^\d+$/.test(t) || Math.abs(nowSeconds - Number(t)) > WEBHOOK_TOLERANCE_SECONDS || signatures.length === 0) return false;
  const expected = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${t}.`, 'utf8'), raw])).digest();
  return signatures.reduce((matched, signature) => timingSafeEqual(Buffer.from(signature, 'hex'), expected) || matched, false);
}

// ponytail: per-instance memory, so a redelivery to another serverless instance logs the record again; the fulfilment
// reader dedupes by eventId. A shared store replaces this when fulfilment is automated.
const recordedWebhookEvents = new Set<string>();

interface PaymentEvent {
  id?: unknown;
  type?: unknown;
  data?: { object?: { payment_status?: unknown; customer?: unknown; subscription?: unknown; client_reference_id?: unknown } };
}

/**
 * A verified, paid checkout is recorded once per event id as a fulfilment request. The webhook never issues a licence:
 * issue stays on the admin path (POST /api/industry-packs/license/issue), and delivery to the buyer is not wired.
 */
function recordPaymentEvent(event: PaymentEvent): { received: true; eventId: string; type: string; fulfilment: string; duplicate?: true } {
  const eventId = typeof event.id === 'string' ? event.id : '';
  const type = typeof event.type === 'string' ? event.type : '';
  const session = event.data?.object ?? {};
  const paid = type === 'checkout.session.completed' && session.payment_status === 'paid';
  const result = { received: true as const, eventId, type, fulfilment: paid ? 'licence_issue_pending_admin' : 'ignored' };
  if (recordedWebhookEvents.has(eventId)) return { ...result, duplicate: true };
  recordedWebhookEvents.add(eventId);
  if (paid) {
    const text = (value: unknown) => (typeof value === 'string' ? value : null);
    console.info(JSON.stringify({ event: 'industry_packs_paid_checkout', eventId, planId: INDUSTRY_PACKS_PLAN_ID,
      customerId: text(session.customer), subscriptionId: text(session.subscription), clientReferenceId: text(session.client_reference_id) }));
  }
  return result;
}

let compiledModuleCount: number | null | undefined;
function moduleInventory(): number | null {
  if (compiledModuleCount !== undefined) return compiledModuleCount;
  const walk = (directory: string): number => readdirSync(directory, { withFileTypes: true })
    .reduce((count, entry) => count + (entry.isDirectory()
      ? walk(resolve(directory, entry.name))
      : entry.isFile() && entry.name.endsWith('.js') ? 1 : 0), 0);
  try {
    // Both api/index.ts and the production dist bundle resolve this to dist/.
    compiledModuleCount = walk(fileURLToPath(new URL('../dist/', import.meta.url)));
  } catch {
    compiledModuleCount = null;
  }
  return compiledModuleCount;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // Routing uses only the path/query; an untrusted Host must not crash the service.
  let parsedUrl: URL;
  try { parsedUrl = new URL(req.url || '/', 'http://localhost'); }
  catch { sendJson(res, 400, { error: 'Invalid request URL' }); return; }
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
      version: amcVersion,
      questions: questionBank.length,
      modules: moduleInventory(),
      moduleInventoryBasis: 'compiled_js_files',
      assurancePacks: listAssurancePacks().length,
      sectorPacks: listIndustryPacks().length,
      inventoryBasis: 'registered_catalogs_and_installed_files',
      industryPacksPlan: INDUSTRY_PACKS_PLAN_ID,
      industryPacksPriceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD,
    });
    return;
  }

  if (path === '/api/industry-packs/access' && method === 'GET') {
    sendJson(res, 200, hostedIndustryPackAccess());
    return;
  }

  if (path === '/api/industry-packs/checkout' && method === 'POST') {
    const access = hostedIndustryPackAccess();
    if (!access.checkoutAvailable) {
      sendJson(res, 503, { error: 'checkout_not_available', ...access });
      return;
    }
    let data: CheckoutRequest;
    try {
      data = await readJsonBody<CheckoutRequest>(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
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
    return;
  }

  if (path === '/api/industry-packs/license/issue' && method === 'POST') {
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
        requiredEnv: ['AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY', 'AMC_INDUSTRY_PACKS_ADMIN_TOKEN'],
      });
    }
    return;
  }

  if (path === '/api/industry-packs/webhook' && method === 'POST') {
    const secret = process.env.AMC_INDUSTRY_PACKS_WEBHOOK_SECRET;
    if (!secret) {
      sendJson(res, 503, { error: 'payment webhook is not configured in this deployment' });
      return;
    }
    let raw: Buffer;
    try {
      raw = await readRawBody(req);
    } catch {
      sendJson(res, 413, { error: 'payload too large' });
      return;
    }
    const header = req.headers['stripe-signature'];
    if (!verifyStripeSignature(raw, Array.isArray(header) ? header[0] : header, secret)) {
      sendJson(res, 400, { error: 'invalid or stale Stripe-Signature' });
      return;
    }
    let event: PaymentEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as PaymentEvent;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (!event || typeof event.id !== 'string' || !event.id) {
      sendJson(res, 400, { error: 'event id is required' });
      return;
    }
    sendJson(res, 200, recordPaymentEvent(event));
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
    try {
      const data = await readJsonBody<QuickScoreRequest>(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)
          || (data.agentId !== undefined && typeof data.agentId !== 'string')
          || (data.responses !== undefined && (typeof data.responses !== 'object'
            || data.responses === null || Array.isArray(data.responses)
            || Object.values(data.responses).some(value => typeof value !== 'number' || !Number.isFinite(value))))) {
        sendJson(res, 400, { error: 'responses must be an object of finite numbers' });
        return;
      }
      sendJson(res, 200, computeQuickScore(data));
    } catch (e) {
      sendJson(res, e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400,
        { error: 'Invalid JSON body', usage: 'POST { agentId, responses: { "SO-01": 3, "SK-02": 4, ... } }' });
    }
    return;
  }
  
  if (path?.startsWith('/api/badge/') && method === 'GET') {
    const agentId = path.split('/api/badge/')[1] || 'unknown';
    // For now, return a default badge. In production, look up cached scores.
    const svg = generateBadgeSvg(agentId, 'L0', 0);
    res.setHeader('X-AMC-Score-Basis', 'placeholder-not-measured');
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
    res.end(svg);
    return;
  }
  
  if (path === '/' || path === '/api') {
    sendJson(res, 200, {
      name: 'Agent Maturity Compass API',
      version: amcVersion,
      endpoints: {
        'GET /api/health': 'Health check',
        'GET /api/industry-packs/access': 'Industry Packs price and whether checkout is available in this deployment',
        'POST /api/industry-packs/checkout': 'Create an Industry Packs checkout handoff URL (503 when checkout is not available)',
        'POST /api/industry-packs/license/verify': 'Verify an Industry Packs license key against this server\'s issuing key',
        'POST /api/industry-packs/license/issue': 'Admin only: issue a signed Industry Packs license key for a paid customer',
        'POST /api/industry-packs/webhook': 'Payment provider webhook (Stripe-Signature); records a paid checkout for admin issue',
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
let invokedFile = "";
try {
  if (process.argv[1]) invokedFile = realpathSync(resolve(process.argv[1]));
} catch {
  // Embedders may supply an argv entry that is not a local file.
}

if (invokedFile === currentFile) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : PORT;
    console.log(`🧭 AMC API running on http://localhost:${actualPort}`);
    console.log(`   Health:     GET  http://localhost:${actualPort}/api/health`);
    console.log(`   QuickScore: POST http://localhost:${actualPort}/api/quickscore`);
    console.log(`   Badge:      GET  http://localhost:${actualPort}/api/badge/:agentId`);
  });
}

export default handleRequest;
export { handleRequest, computeQuickScore, generateBadgeSvg };

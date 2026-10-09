/** Synthetic provider only. No AMC authorization or evaluation logic belongs here. */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireWriter, canonical, openTxLog, ownerOnly, prepareDirectory, readJson, removeOwnedSocket, sha256, writePrivateJson } from './txlog.mjs';
import { createFaults, emptyPlan, validateFaultPlan } from './faults.mjs';

const ID = /^[A-Za-z0-9_-]{1,128}$/, KEY = /^[A-Za-z0-9_-]{8,128}$/, REFERENCE = /^[A-Za-z0-9-]{1,35}$/;
const MAX_BODY = 65_536, MAX_RESPONSE = 1_048_576;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).every(key => fields.includes(key));
const text = (value, max = 128) => typeof value === 'string' && value.length > 0 && value.length <= max;
const id = value => typeof value === 'string' && ID.test(value);
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };
const iso = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value.replace(/Z$/, '').replace(/\.\d{3}$/, '')) ? date.getTime() : null;
};
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ? iso(value) : null;
function normalizePayment(body) {
  if (!exact(body, ['kind', 'sourceAccountId', 'payeeId', 'amountMinor', 'currency', 'reference', 'originalTxnId'])
    || !['refund', 'payout'].includes(body.kind) || !id(body.sourceAccountId) || !id(body.payeeId)
    || !Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0 || typeof body.currency !== 'string'
    || typeof body.reference !== 'string' || !REFERENCE.test(body.reference)
    || (body.originalTxnId !== undefined && !id(body.originalTxnId))) fail('invalid_body');
  if (body.currency !== 'USD') fail('currency_not_supported', 422);
  return { kind: body.kind, sourceAccountId: body.sourceAccountId, payeeId: body.payeeId, amountMinor: body.amountMinor,
    currency: body.currency, reference: body.reference, ...(body.originalTxnId === undefined ? {} : { originalTxnId: body.originalTxnId }) };
}
function validateSeed(seed) {
  if (!exact(seed, ['schemaVersion', 'clients', 'accounts', 'payees', 'bankTransactions', 'bookEntries'])
    || (seed.schemaVersion !== undefined && seed.schemaVersion !== 'lighthouse-finance-seed/1')) throw new Error('invalid synthetic seed');
  const shapes = { clients: ['clientId', 'tenantId', 'scopes'], accounts: ['accountId', 'tenantId', 'currency', 'label'],
    payees: ['payeeId', 'tenantId', 'displayName', 'destinationToken', 'version', 'updatedAt'],
    bankTransactions: ['txnId', 'tenantId', 'accountId', 'type', 'amountMinor', 'currency', 'counterpartyRef', 'memo', 'bookedAt'],
    bookEntries: ['entryId', 'tenantId', 'txnRef', 'amountMinor', 'currency', 'postedAt'] };
  for (const [name, fields] of Object.entries(shapes)) {
    if (!Array.isArray(seed[name]) || seed[name].length > 1000 || (name === 'clients' && !seed[name].length)) throw new Error('invalid synthetic seed');
    const seen = new Set(), key = fields[0];
    for (const row of seed[name]) {
      if (!exact(row, fields) || !id(row[key]) || !id(row.tenantId) || seen.has(row[key])) throw new Error('invalid synthetic seed');
      seen.add(row[key]);
      if (name === 'clients' && (!Array.isArray(row.scopes) || row.scopes.some(scope => !['ledger:read', 'payments:read', 'payments:write'].includes(scope)))) throw new Error('invalid synthetic seed');
      if (name === 'accounts' && (row.currency !== 'USD' || !text(row.label))) throw new Error('invalid synthetic seed');
      if (name === 'payees' && (!text(row.displayName) || !/^dst-[A-Za-z0-9_-]{1,100}$/.test(row.destinationToken)
        || !Number.isSafeInteger(row.version) || row.version < 1 || instant(row.updatedAt) === null)) throw new Error('invalid synthetic seed');
      if (['bankTransactions', 'bookEntries'].includes(name) && (!Number.isSafeInteger(row.amountMinor) || row.currency !== 'USD')) throw new Error('invalid synthetic seed');
      if (name === 'bankTransactions' && (!id(row.accountId) || !['capture', 'refund', 'payout', 'fee'].includes(row.type)
        || !text(row.counterpartyRef) || typeof row.memo !== 'string' || row.memo.length > 4096 || instant(row.bookedAt) === null)) throw new Error('invalid synthetic seed');
      if (name === 'bookEntries' && (!id(row.txnRef) || instant(row.postedAt) === null)) throw new Error('invalid synthetic seed');
    }
  }
  if (seed.bankTransactions.some(row => !seed.accounts.some(account => account.accountId === row.accountId && account.tenantId === row.tenantId))) throw new Error('invalid synthetic seed');
  if (seed.bookEntries.some(row => !seed.bankTransactions.some(txn => txn.txnId === row.txnRef && txn.tenantId === row.tenantId))) throw new Error('invalid synthetic seed');
  return structuredClone(seed);
}
const payeeView = ({ destinationToken, ...payee }) => ({ ...payee, destinationTokenSha256: sha256(destinationToken) });
const receipt = payment => ({ paymentId: payment.paymentId, status: 'committed', committedAt: payment.committedAt, logSeq: payment.logSeq });
const paymentBody = payment => Object.fromEntries(['kind', 'sourceAccountId', 'payeeId', 'amountMinor', 'currency', 'reference', 'originalTxnId']
  .filter(key => payment[key] !== undefined).map(key => [key, payment[key]]));
function readBody(req) {
  return new Promise(resolveBody => {
    const chunks = []; let size = 0, settled = false;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolveBody({ bytes: Buffer.concat(chunks), error });
    };
    const timer = setTimeout(() => { finish('request_timeout'); req.destroy(); }, 10_000);
    req.on('data', chunk => {
      if (settled) return;
      const part = Buffer.from(chunk).subarray(0, MAX_BODY - size); chunks.push(part); size += part.length;
      if (part.length < chunk.length) finish('body_too_large');
    });
    req.on('end', () => finish(null)); req.on('aborted', () => finish('body_incomplete')); req.on('error', () => finish('body_incomplete'));
  });
}
function readTokens(dir, clients) {
  const path = join(dir, 'tokens.json');
  if (!existsSync(path)) writePrivateJson(path, Object.fromEntries(clients.map(client => [client.clientId, randomBytes(32).toString('base64url')])));
  ownerOnly(path); const tokens = readJson(path);
  if (!exact(tokens, clients.map(client => client.clientId)) || Object.keys(tokens).length !== clients.length
    || Object.values(tokens).some(token => typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
    || new Set(Object.values(tokens)).size !== clients.length) throw new Error('invalid fixture tokens');
  return new Map(clients.map(client => [tokens[client.clientId], client]));
}
export async function startFixture(options) {
  const dir = resolve(options.dir), seed = validateSeed(readJson(resolve(options.seed))), seedSha256 = sha256(canonical(seed));
  const initialFaults = options.faults ? validateFaultPlan(readJson(resolve(options.faults))) : emptyPlan();
  prepareDirectory(dir); const writer = acquireWriter(dir);
  let log, api, admin; const socketIdentities = {}, sockets = new Set(), delays = new Set(), pending = new Set(); let stopped = false;
  const cleanup = () => {
    let problem;
    for (const [path, identity] of Object.entries(socketIdentities)) try { removeOwnedSocket(path, identity); } catch (error) { problem = error; }
    try { log?.close(); } finally { writer.release(); }
    if (problem) throw problem;
  };
  try {
    for (const name of ['api.sock', 'admin.sock']) {
      const path = join(dir, name);
      if (existsSync(path)) removeOwnedSocket(path, writer.recovered?.sockets?.[path]);
    }
    log = openTxLog(dir);
    const tokens = readTokens(dir, seed.clients), payees = new Map(seed.payees.map(row => [row.payeeId, row]));
    const payments = new Map(), keys = new Map(), keyFor = (tenant, key) => `${tenant}\0${key}`;
    const faults = createFaults(initialFaults), queues = new Map();
    if (!log.records.length) log.append('admin', { action: 'initialize', seedSha256, faultPlan: initialFaults });
    const first = log.records[0];
    if (first.kind !== 'admin' || first.action !== 'initialize' || first.seedSha256 !== seedSha256
      || (options.faults && canonical(first.faultPlan) !== canonical(initialFaults))) throw new Error('fixture seed or initial faults changed');
    faults.replace(first.faultPlan); let faultPlanSeq = first.seq;
    for (const row of log.records.slice(1)) {
      if (row.kind === 'request' && row.channel === 'api' && row.faultPlanSeq === faultPlanSeq) faults.restoreCounts(row.faultCounts);
      if (row.kind === 'admin' && row.action === 'replace_faults') { faults.replace(row.faultPlan); faultPlanSeq = row.seq; }
      if (row.kind === 'admin' && row.action === 'payee_update') {
        const before = payees.get(row.payee?.payeeId);
        if (!before || row.payee.tenantId !== before.tenantId || row.payee.version !== before.version + 1
          || !/^dst-[A-Za-z0-9_-]{1,100}$/.test(row.payee.destinationToken) || instant(row.payee.updatedAt) === null) throw new Error('invalid payee log state');
        payees.set(row.payee.payeeId, row.payee);
      }
      if (row.kind === 'admin' && row.action === 'expire_idempotency_keys') {
        if (!id(row.tenantId) || !Array.isArray(row.idempotencyKeys) || row.idempotencyKeys.some(key => typeof key !== 'string' || !KEY.test(key))) throw new Error('invalid expiry log state');
        for (const key of row.idempotencyKeys) keys.delete(keyFor(row.tenantId, key));
      }
      if (row.kind === 'commit') {
        const payment = row.payment, body = normalizePayment(paymentBody(payment)), payee = payees.get(payment.payeeId);
        if (!id(payment.paymentId) || !id(payment.tenantId) || typeof payment.idempotencyKey !== 'string' || !KEY.test(payment.idempotencyKey) || payments.has(payment.paymentId)
          || keys.has(keyFor(payment.tenantId, payment.idempotencyKey)) || payment.logSeq !== row.seq || instant(payment.committedAt) === null
          || payment.bodySha256 !== sha256(canonical(body)) || !payee || payee.tenantId !== payment.tenantId
          || payment.payeeVersion !== payee.version || payment.destinationTokenSha256 !== sha256(payee.destinationToken)
          || !seed.accounts.some(account => account.accountId === payment.sourceAccountId && account.tenantId === payment.tenantId)
          || (payment.originalTxnId !== undefined && !seed.bankTransactions.some(txn => txn.txnId === payment.originalTxnId && txn.tenantId === payment.tenantId))) throw new Error('invalid payment log state');
        payments.set(payment.paymentId, payment); keys.set(keyFor(payment.tenantId, payment.idempotencyKey), payment);
      }
    }
    const stop = async () => {
      if (stopped) return; stopped = true;
      for (const delay of delays) { clearTimeout(delay.timer); delay.reject(new Error('fixture shutting down')); }
      const closed = [api, admin].filter(Boolean).map(server => new Promise(done => server.close(done)));
      for (const socket of sockets) socket.destroy();
      await Promise.all([...pending]); await Promise.all(closed); cleanup();
    };
    const wait = ms => new Promise((done, reject) => {
      const delay = { reject, timer: setTimeout(() => { delays.delete(delay); done(); }, ms) }; delays.add(delay);
    });
    const serial = async (key, body) => {
      const previous = queues.get(key) ?? Promise.resolve(); let unlock;
      const current = new Promise(done => { unlock = done; }); queues.set(key, current);
      await previous;
      try { return await body(); } finally { unlock(); if (queues.get(key) === current) queues.delete(key); }
    };
    const send = (req, res, requestId, status, body, headers = {}) => {
      if (res.destroyed || req.socket.destroyed || res.writableEnded) { log.append('response', { requestId, status, delivered: false }); return; }
      let bytes = Buffer.from(canonical(body));
      if (bytes.length > MAX_RESPONSE) { status = 413; bytes = Buffer.from('{"error":"response_too_large"}'); }
      log.append('response', { requestId, status });
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': bytes.length, Connection: 'close', ...headers }); res.end(bytes);
    };
    const handler = channel => async (req, res) => {
      res.on('error', () => {});
      const requestId = randomUUID(), method = req.method ?? '', bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? '');
      const client = channel === 'api' ? tokens.get(bearer?.[1]) : null;
      let url; try { if (!req.url?.startsWith('/') || req.url.length > 2048) throw new Error(); url = new URL(req.url, 'http://127.0.0.1'); } catch { url = new URL('/invalid-request', 'http://127.0.0.1'); }
      const path = url.pathname, rawKey = req.headers['idempotency-key'], key = typeof rawKey === 'string' && KEY.test(rawKey) ? rawKey : null;
      const matchedPlanSeq = faultPlanSeq, fault = channel === 'api' ? faults.match(method, path) : null;
      const faultCounts = channel === 'api' ? faults.snapshot().counts : null;
      const reset = fault?.mode === 'reset_before_body', raw = reset ? { bytes: Buffer.alloc(0), error: 'body_not_read' } : await readBody(req);
      let parsed, normalized, bodyError;
      try { parsed = raw.bytes.length ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes)) : null; } catch { bodyError = 'invalid_body'; }
      if (method === 'POST' && path === '/v1/payments' && !raw.error && !bodyError) {
        try { normalized = normalizePayment(parsed); } catch (error) { bodyError = error.code; }
      }
      log.append('request', { requestId, channel, clientId: client?.clientId ?? null, tenantId: client?.tenantId ?? null,
        method, path, faultPlanSeq: channel === 'api' ? matchedPlanSeq : null, faultCounts, matchedFaultId: fault?.id ?? null,
        idempotencyKey: key, bodySha256: sha256(normalized ? canonical(normalized) : raw.bytes),
        rawBodySha256: sha256(raw.bytes), bodyBytesRead: raw.bytes.length, bodyReadComplete: !raw.error, ...(normalized ? { body: normalized } : {}),
        ...(object(parsed) ? { bodyFields: Object.keys(parsed) } : {}), ...(raw.error ? { bodyReadError: raw.error } : {}) });
      if (fault) log.append('fault', { requestId, id: fault.id, mode: fault.mode, faultPlanSeq: matchedPlanSeq });
      if (reset) { req.destroy(); return; }
      const reject = (status, code) => { log.append('reject', { requestId, code }); send(req, res, requestId, status, { error: code }); };
      try {
        if (stopped) fail('shutting_down', 503);
        if (raw.error) fail(raw.error, raw.error === 'body_too_large' ? 413 : 400);
        if (channel === 'api' && !(method === 'GET' && path === '/v1/health')) {
          if (!client) fail('unauthenticated', 401);
          const scope = method === 'POST' && path === '/v1/payments' ? 'payments:write'
            : ['/v1/bank-transactions', '/v1/book-entries'].includes(path) ? 'ledger:read' : 'payments:read';
          if (!client.scopes.includes(scope)) fail('insufficient_scope', 403);
        }
        if (channel === 'admin') {
          if (method === 'GET' && path === '/admin/log') {
            const fromSeq = Number(url.searchParams.get('fromSeq') ?? 1);
            if (!Number.isSafeInteger(fromSeq) || fromSeq < 1) fail('invalid_query');
            const records = log.records.filter(row => row.seq >= fromSeq).slice(0, 200);
            while (records.length && Buffer.byteLength(canonical(records)) > MAX_RESPONSE - 1024) records.pop();
            return send(req, res, requestId, 200, { records, headHash: log.head, nextSeq: (records.at(-1)?.seq ?? fromSeq - 1) + 1 });
          }
          if (method === 'GET' && path === '/admin/state') return send(req, res, requestId, 200, { payments: [...payments.values()], payees: [...payees.values()].map(payeeView), liveKeys: keys.size, faults: faults.snapshot(), headHash: log.head });
          if (method === 'POST' && path === '/admin/shutdown' && parsed === null && !bodyError) parsed = {};
          if (method !== 'POST' || bodyError || !object(parsed)) fail('invalid_body');
          if (path === '/admin/faults') {
            const plan = validateFaultPlan(parsed), row = log.append('admin', { requestId, action: 'replace_faults', faultPlan: plan }); faults.replace(plan); faultPlanSeq = row.seq;
            return send(req, res, requestId, 200, { ok: true });
          }
          if (path === '/admin/expire-idempotency-keys') {
            if (!exact(parsed, ['tenantId', 'idempotencyKey']) || !id(parsed.tenantId)
              || (parsed.idempotencyKey !== undefined && (typeof parsed.idempotencyKey !== 'string' || !KEY.test(parsed.idempotencyKey)))) fail('invalid_body');
            const expired = [...keys.values()].filter(payment => payment.tenantId === parsed.tenantId && (parsed.idempotencyKey === undefined || payment.idempotencyKey === parsed.idempotencyKey));
            log.append('admin', { requestId, action: 'expire_idempotency_keys', tenantId: parsed.tenantId, idempotencyKeys: expired.map(payment => payment.idempotencyKey) });
            for (const payment of expired) keys.delete(keyFor(payment.tenantId, payment.idempotencyKey));
            return send(req, res, requestId, 200, { expired: expired.length });
          }
          const payeeMatch = /^\/admin\/payees\/([A-Za-z0-9_-]+)$/.exec(path);
          if (payeeMatch) {
            const before = payees.get(payeeMatch[1]); if (!before) fail('payee_not_found', 404);
            if (!exact(parsed, ['destinationToken']) || typeof parsed.destinationToken !== 'string' || !/^dst-[A-Za-z0-9_-]{1,100}$/.test(parsed.destinationToken)) fail('invalid_body');
            const payee = { ...before, destinationToken: parsed.destinationToken, version: before.version + 1, updatedAt: new Date().toISOString() };
            log.append('admin', { requestId, action: 'payee_update', payee }); payees.set(payee.payeeId, payee);
            return send(req, res, requestId, 200, { payee: payeeView(payee) });
          }
          if (path === '/admin/shutdown') {
            if (!exact(parsed, [])) fail('invalid_body'); log.append('admin', { requestId, action: 'shutdown' });
            res.once('finish', () => { void stop().catch(() => { process.exitCode = 70; }); }); return send(req, res, requestId, 200, { ok: true });
          }
          fail('not_found', 404);
        }
        if (fault?.mode === 'error_before_commit') return reject(fault.status ?? 503, 'fault_before_commit');
        if (method === 'GET' && path === '/v1/health') return send(req, res, requestId, 200, { ok: true, headHash: log.head });
        const tenant = client.tenantId, owned = rows => rows.filter(row => row.tenantId === tenant);
        if (method === 'GET' && path === '/v1/accounts') return send(req, res, requestId, 200, { accounts: owned(seed.accounts) });
        if (method === 'GET' && path === '/v1/payees') return send(req, res, requestId, 200, { payees: owned([...payees.values()]).map(payeeView) });
        const payeeMatch = /^\/v1\/payees\/([A-Za-z0-9_-]+)$/.exec(path);
        if (method === 'GET' && payeeMatch) {
          const payee = payees.get(payeeMatch[1]); if (!payee || payee.tenantId !== tenant) fail('payee_not_found', 404);
          return send(req, res, requestId, 200, { payee: payeeView(payee) });
        }
        if (method === 'GET' && ['/v1/bank-transactions', '/v1/book-entries'].includes(path)) {
          const from = url.searchParams.has('from') ? iso(url.searchParams.get('from')) : -Infinity;
          const to = url.searchParams.has('to') ? iso(url.searchParams.get('to')) : Infinity;
          if (from === null || to === null || from > to) fail('invalid_query');
          const bank = path === '/v1/bank-transactions', name = bank ? 'bankTransactions' : 'bookEntries';
          return send(req, res, requestId, 200, { [name]: owned(seed[name]).filter(row => { const time = iso(row[bank ? 'bookedAt' : 'postedAt']); return time >= from && time <= to; }) });
        }
        const paymentMatch = /^\/v1\/payments\/([A-Za-z0-9_-]+)$/.exec(path);
        if (method === 'GET' && paymentMatch) {
          const payment = payments.get(paymentMatch[1]); if (!payment || payment.tenantId !== tenant) fail('payment_not_found', 404);
          return send(req, res, requestId, 200, { payment });
        }
        if (method === 'GET' && path === '/v1/payments') {
          const queryKey = url.searchParams.get('idempotencyKey'), reference = url.searchParams.get('reference');
          if (queryKey !== null ? !KEY.test(queryKey) || reference !== null : reference === null || !REFERENCE.test(reference)) fail('invalid_query');
          const payment = queryKey === null ? null : keys.get(keyFor(tenant, queryKey));
          return send(req, res, requestId, 200, { payments: queryKey !== null ? payment ? [payment] : [] : owned([...payments.values()]).filter(row => row.reference === reference) });
        }
        if (method !== 'POST' || path !== '/v1/payments') fail('not_found', 404);
        if (!key) fail('idempotency_key_required');
        if (bodyError || !normalized) fail(bodyError ?? 'invalid_body', bodyError === 'currency_not_supported' ? 422 : 400);
        const index = keyFor(tenant, key), bodySha256 = sha256(canonical(normalized));
        return await serial(index, async () => {
          if (stopped) fail('shutting_down', 503);
          const replay = () => {
            const previous = keys.get(index); if (!previous) return false;
            if (previous.bodySha256 !== bodySha256) fail('idempotency_key_reuse_mismatch', 409);
            log.append('replay', { requestId, paymentId: previous.paymentId, tenantId: tenant, idempotencyKey: key });
            send(req, res, requestId, 200, receipt(previous), { 'Idempotent-Replayed': 'true' }); return true;
          };
          if (replay()) return;
          if (fault?.mode === 'delay_then_commit') await wait(fault.delayMs ?? 2500);
          if (stopped) fail('shutting_down', 503);
          if (replay()) return;
          const payee = payees.get(normalized.payeeId);
          if (!payee || payee.tenantId !== tenant) fail('payee_not_found', 404);
          if (!seed.accounts.some(account => account.accountId === normalized.sourceAccountId && account.tenantId === tenant)) fail('account_not_found', 404);
          if (normalized.originalTxnId !== undefined && !seed.bankTransactions.some(txn => txn.txnId === normalized.originalTxnId && txn.tenantId === tenant)) fail('original_transaction_not_found', 404);
          const payment = { paymentId: `pay_${randomUUID().replaceAll('-', '')}`, tenantId: tenant, idempotencyKey: key, ...normalized,
            payeeVersion: payee.version, destinationTokenSha256: sha256(payee.destinationToken), bodySha256, committedAt: new Date().toISOString(), logSeq: log.nextSeq };
          log.append('commit', { requestId, payment }); payments.set(payment.paymentId, payment); keys.set(index, payment);
          if (fault?.mode === 'crash_after_commit') process.exit(70);
          if (fault?.mode === 'drop_response_after_commit') { req.destroy(); return; }
          if (fault?.mode === 'error_after_commit') return reject(fault.status ?? 500, 'fault_after_commit');
          send(req, res, requestId, 201, receipt(payment));
        });
      } catch (error) { reject(error.status ?? (error.message === 'invalid_fault_plan' ? 400 : 500), error.code ?? (error.message === 'invalid_fault_plan' ? 'invalid_fault_plan' : 'internal_error')); }
    };
    const makeServer = channel => {
      const server = createServer((req, res) => {
        const work = handler(channel)(req, res).catch(() => { req.destroy(); process.exit(70); }).finally(() => pending.delete(work));
        pending.add(work);
      });
      server.headersTimeout = 10_000; server.requestTimeout = 15_000; server.keepAliveTimeout = 1000; server.maxHeadersCount = 100;
      server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
      server.on('clientError', (error, socket) => {
        if (stopped) { socket.destroy(); return; }
        try {
          const requestId = randomUUID();
          log.append('request', { requestId, channel, clientId: null, tenantId: null, method: '', path: '/invalid-request', idempotencyKey: null,
            bodySha256: sha256(''), rawRequestSha256: sha256(error.rawPacket ?? Buffer.alloc(0)), bodyReadError: 'http_parse_error' });
          log.append('reject', { requestId, code: 'invalid_http_request' }); log.append('response', { requestId, status: 400 });
          if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); else socket.destroy();
        } catch { socket.destroy(); process.exit(70); }
      });
      return server;
    };
    api = makeServer('api'); admin = makeServer('admin');
    const listen = (server, address) => new Promise((done, reject) => { server.once('error', reject); server.listen(address, () => { server.removeListener('error', reject); done(); }); });
    const apiSocket = options.port === undefined ? join(dir, 'api.sock') : null, adminSocket = join(dir, 'admin.sock');
    await listen(admin, adminSocket); socketIdentities[adminSocket] = ownerOnly(adminSocket, 'socket'); writer.update(socketIdentities);
    if (apiSocket) { await listen(api, apiSocket); socketIdentities[apiSocket] = ownerOnly(apiSocket, 'socket'); writer.update(socketIdentities); }
    else await listen(api, { host: '127.0.0.1', port: options.port });
    const ready = { ready: true, apiSocket, adminSocket, logPath: log.path, ...(apiSocket ? {} : { apiOrigin: `http://127.0.0.1:${api.address().port}` }) };
    return { ready, stop };
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    await Promise.all([api, admin].filter(server => server?.listening).map(server => new Promise(done => server.close(done))));
    cleanup(); throw error;
  }
}
function argumentsFrom(argv) {
  const options = {};
  for (let n = 0; n < argv.length; n += 2) {
    const key = argv[n]?.slice(2), value = argv[n + 1];
    if (!['dir', 'seed', 'faults', 'port'].includes(key) || !argv[n].startsWith('--') || value === undefined || options[key] !== undefined) throw new Error('usage: --dir DIR --seed FILE [--faults FILE] [--port 0]');
    options[key] = key === 'port' ? Number(value) : value;
  }
  if (!options.dir || !options.seed || (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535))) throw new Error('invalid fixture arguments');
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startFixture(argumentsFrom(process.argv.slice(2))).then(fixture => {
    process.stdout.write(`${canonical(fixture.ready)}\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void fixture.stop().catch(() => { process.exitCode = 70; }); });
  }).catch(() => { process.stderr.write('finance fixture startup failed\n'); process.exitCode = 1; });
}

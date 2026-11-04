/**
 * requestContext.ts — The request id every /api/v1 response carries, and the one log line per error (P1-55).
 *
 * The id is a correlation hint only: never use it for authorization, deduplication or idempotency.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { redactSecrets } from '../shield/redaction/redactSecrets.js';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export interface ApiRequestContext { requestId: string; method: string; path: string; startedAt: number }
export interface ApiErrorLogLine {
  ts: string; level: 'warn' | 'error'; requestId: string; method: string; path: string;
  status: number; durationMs: number; error: string;
  detail?: { name?: string; message: string; stack?: string };
}
export type ApiLogSink = (line: ApiErrorLogLine) => void;

const MAX_DETAIL_MESSAGE_CHARS = 2_000;
const MAX_STACK_LINES = 10;
const contexts = new WeakMap<ServerResponse, ApiRequestContext>();
const stderrSink: ApiLogSink = (line) => { process.stderr.write(`${JSON.stringify(line)}\n`); };
let sink: ApiLogSink = stderrSink;

/** The inbound id only from a trusted forwarder and only when it matches the pattern; otherwise a fresh UUID. */
export function resolveRequestId(req: IncomingMessage, opts: { trustInbound: boolean }): string {
  const inbound = req.headers?.[REQUEST_ID_HEADER];
  return opts.trustInbound && typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
}

export function bindRequestContext(res: ServerResponse, ctx: ApiRequestContext): void {
  contexts.set(res, ctx);
  // Test doubles may lack setHeader; apiSuccess and apiError also pass the id to writeHead.
  if (typeof res.setHeader === 'function' && !res.headersSent) res.setHeader('X-Request-Id', ctx.requestId);
}

export function requestContextOf(res: ServerResponse): ApiRequestContext | undefined {
  return contexts.get(res);
}

/** The bound context, or a fresh one with a generated id when the caller bound none. */
export function ensureRequestContext(res: ServerResponse): ApiRequestContext {
  const bound = contexts.get(res);
  if (bound) return bound;
  const ctx = { requestId: randomUUID(), method: 'unknown', path: 'unknown', startedAt: Date.now() };
  bindRequestContext(res, ctx);
  return ctx;
}

/** null restores the stderr sink. */
export function setApiLogSink(next: ApiLogSink | null): void {
  sink = next ?? stderrSink;
}

const redact = (text: string): string => redactSecrets(text, () => '<AMC_REDACTED>').redacted;

// Redact before capping: a cap that cuts a secret in half leaves a fragment the patterns no longer match.
function describeDetail(detail: unknown): ApiErrorLogLine['detail'] {
  const error = detail instanceof Error ? detail : undefined;
  const message = redact(error ? error.message : String(detail)).slice(0, MAX_DETAIL_MESSAGE_CHARS);
  const stack = error?.stack ? redact(error.stack).split('\n').slice(0, MAX_STACK_LINES).join('\n') : undefined;
  return { ...(error ? { name: error.name } : {}), message, ...(stack ? { stack } : {}) };
}

/** One JSON line per error response: id, method, pathname and status; never headers, bodies, query strings or cookies. */
export function logApiError(res: ServerResponse, status: number, publicMessage: string, detail?: unknown): void {
  const ctx = ensureRequestContext(res);
  sink({
    ts: new Date().toISOString(),
    level: status >= 500 ? 'error' : 'warn',
    requestId: ctx.requestId,
    method: ctx.method,
    path: redact(ctx.path),
    status,
    durationMs: Date.now() - ctx.startedAt,
    error: redact(publicMessage),
    ...(detail === undefined ? {} : { detail: describeDetail(detail) })
  });
}

/**
 * apiHelpers.ts — Shared utilities for API route handlers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError, type ZodType } from "zod";

const MAX_JSON_BODY_BYTES = 1_048_576;
const DANGEROUS_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class RequestBodyError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RequestBodyError";
    this.statusCode = statusCode;
  }
}

export function isRequestBodyError(value: unknown): value is RequestBodyError {
  return value instanceof RequestBodyError;
}

function sanitizeParsedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeParsedJson(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_JSON_KEYS.has(key)) {
        continue;
      }
      out[key] = sanitizeParsedJson(nested);
    }
    return out;
  }
  return value;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const rejectOnce = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    req.on("data", (chunk: Buffer | string) => {
      if (settled) {
        return;
      }
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      totalBytes += buf.length;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        rejectOnce(new RequestBodyError(`JSON body exceeds ${MAX_JSON_BODY_BYTES} bytes`, 413));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error) => {
      rejectOnce(error);
    });
  });
}

/* ── Parse JSON body ─────────────────────────────────────────────── */

export async function bodyJson<T = unknown>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (raw.trim().length === 0) {
    return {} as T;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeParsedJson(parsed) as T;
  } catch {
    throw new RequestBodyError("Invalid JSON body");
  }
}

export async function bodyJsonSchema<T>(req: IncomingMessage, schema: ZodType<T>): Promise<T> {
  try {
    const parsed = await bodyJson<unknown>(req);
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message ?? "request schema mismatch";
      throw new RequestBodyError(`Invalid request body: ${detail}`);
    }
    throw error;
  }
}

/* ── Query parameter extraction ──────────────────────────────────── */

export function queryParam(url: string, key: string): string | undefined {
  const idx = url.indexOf('?');
  if (idx === -1) return undefined;
  const params = new URLSearchParams(url.slice(idx + 1));
  return params.get(key) ?? undefined;
}

/* ── Path parameter extraction (/api/v1/foo/:id) ─────────────────── */

export function pathParam(pathname: string, template: string): Record<string, string> | null {
  const tParts = template.split('/');
  const pParts = pathname.split('/');
  if (tParts.length !== pParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < tParts.length; i++) {
    if (tParts[i]!.startsWith(':')) {
      params[tParts[i]!.slice(1)] = pParts[i]!;
    } else if (tParts[i] !== pParts[i]) {
      return null;
    }
  }
  return params;
}

/* ── Response helpers ────────────────────────────────────────────── */

export function apiSuccess(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, data }));
}

export function apiError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: message }));
}

/* ── Method guard ────────────────────────────────────────────────── */

export function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method?.toUpperCase() === method.toUpperCase()) return true;
  apiError(res, 405, `Method ${req.method} not allowed, expected ${method}`);
  return false;
}

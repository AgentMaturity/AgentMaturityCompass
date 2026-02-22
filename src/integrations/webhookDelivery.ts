import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { sha256Hex } from "../utils/hash.js";

export interface WebhookHttpResponse {
  status: number;
  body: string;
}

export interface WebhookHttpClient {
  post(params: {
    url: string;
    body: string;
    headers: Record<string, string>;
    timeoutMs: number;
  }): Promise<WebhookHttpResponse>;
}

export interface WebhookDeliveryRequest {
  url: string;
  eventType: string;
  payload: Record<string, unknown> | string;
  secret: string;
  headers?: Record<string, string>;
}

export interface WebhookDeliveryPolicy {
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  jitterFactor?: number;
  timeoutMs?: number;
}

export interface WebhookDeliveryDependencies {
  client?: WebhookHttpClient;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  rng?: () => number;
}

export interface WebhookAttemptReceipt {
  attempt: number;
  startedTs: number;
  completedTs: number;
  delivered: boolean;
  httpStatus: number | null;
  error: string | null;
  signature: string;
  backoffMs: number | null;
}

export interface WebhookDeliveryReceipt {
  deliveryId: string;
  eventType: string;
  url: string;
  payloadSha256: string;
  createdTs: number;
  completedTs: number;
  delivered: boolean;
  attempts: WebhookAttemptReceipt[];
}

function requestImpl(url: URL) {
  return url.protocol === "https:" ? httpsRequest : httpRequest;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));
}

function defaultNow(): number {
  return Date.now();
}

function defaultRng(): number {
  return Math.random();
}

function normalizePolicy(policy?: WebhookDeliveryPolicy): Required<WebhookDeliveryPolicy> {
  const maxAttempts = Number.isFinite(policy?.maxAttempts) ? Math.max(1, Math.floor(policy!.maxAttempts!)) : 5;
  const initialBackoffMs = Number.isFinite(policy?.initialBackoffMs)
    ? Math.max(1, Math.floor(policy!.initialBackoffMs!))
    : 250;
  const maxBackoffMs = Number.isFinite(policy?.maxBackoffMs)
    ? Math.max(initialBackoffMs, Math.floor(policy!.maxBackoffMs!))
    : 10_000;
  const jitterFactor = Number.isFinite(policy?.jitterFactor)
    ? Math.min(1, Math.max(0, policy!.jitterFactor!))
    : 0.2;
  const timeoutMs = Number.isFinite(policy?.timeoutMs) ? Math.max(50, Math.floor(policy!.timeoutMs!)) : 10_000;
  return {
    maxAttempts,
    initialBackoffMs,
    maxBackoffMs,
    jitterFactor,
    timeoutMs
  };
}

export function computeBackoffDelayMs(params: {
  attempt: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  jitterFactor: number;
  rng?: () => number;
}): number {
  const baseDelay = Math.min(
    params.maxBackoffMs,
    params.initialBackoffMs * Math.pow(2, Math.max(0, params.attempt - 1))
  );
  if (params.jitterFactor <= 0) {
    return baseDelay;
  }
  const jitterWindow = Math.floor(baseDelay * params.jitterFactor);
  if (jitterWindow <= 0) {
    return baseDelay;
  }
  const rng = params.rng ?? defaultRng;
  const delta = Math.floor((rng() * 2 - 1) * jitterWindow);
  return Math.max(0, baseDelay + delta);
}

export function signWebhookPayload(params: {
  secret: string;
  payload: string;
  timestamp: number;
}): string {
  const canonical = `${params.timestamp}.${params.payload}`;
  const digest = createHmac("sha256", params.secret).update(canonical).digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(params: {
  secret: string;
  payload: string;
  timestamp: number;
  signature: string;
}): boolean {
  const expected = signWebhookPayload({
    secret: params.secret,
    payload: params.payload,
    timestamp: params.timestamp
  });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(params.signature, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function buildWebhookHeaders(params: {
  deliveryId: string;
  attempt: number;
  timestamp: number;
  signature: string;
  extraHeaders?: Record<string, string>;
}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-amc-webhook-delivery-id": params.deliveryId,
    "x-amc-webhook-attempt": String(params.attempt),
    "x-amc-webhook-timestamp": String(params.timestamp),
    "x-amc-webhook-signature": params.signature,
    ...(params.extraHeaders ?? {})
  };
}

export const defaultWebhookHttpClient: WebhookHttpClient = {
  async post(params): Promise<WebhookHttpResponse> {
    const url = new URL(params.url);
    return new Promise<WebhookHttpResponse>((resolvePromise, rejectPromise) => {
      const req = requestImpl(url)(
        url,
        {
          method: "POST",
          headers: {
            ...params.headers,
            "content-length": String(Buffer.byteLength(params.body))
          }
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            resolvePromise({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8")
            });
          });
        }
      );
      req.setTimeout(params.timeoutMs, () => {
        req.destroy(new Error(`webhook timeout after ${params.timeoutMs}ms`));
      });
      req.on("error", rejectPromise);
      req.write(params.body);
      req.end();
    });
  }
};

export async function deliverWebhookWithRetry(params: {
  request: WebhookDeliveryRequest;
  policy?: WebhookDeliveryPolicy;
  dependencies?: WebhookDeliveryDependencies;
  deliveryId?: string;
}): Promise<WebhookDeliveryReceipt> {
  const policy = normalizePolicy(params.policy);
  const client = params.dependencies?.client ?? defaultWebhookHttpClient;
  const sleep = params.dependencies?.sleep ?? defaultSleep;
  const now = params.dependencies?.now ?? defaultNow;
  const rng = params.dependencies?.rng ?? defaultRng;
  const deliveryId = params.deliveryId ?? `wh_${randomUUID().replace(/-/g, "")}`;
  const payloadBody =
    typeof params.request.payload === "string"
      ? params.request.payload
      : JSON.stringify(params.request.payload);
  const payloadSha256 = sha256Hex(payloadBody);
  const createdTs = now();
  const attempts: WebhookAttemptReceipt[] = [];

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const startedTs = now();
    const timestampSeconds = Math.floor(startedTs / 1000);
    const signature = signWebhookPayload({
      secret: params.request.secret,
      payload: payloadBody,
      timestamp: timestampSeconds
    });
    const headers = buildWebhookHeaders({
      deliveryId,
      attempt,
      timestamp: timestampSeconds,
      signature,
      extraHeaders: params.request.headers
    });

    try {
      const response = await client.post({
        url: params.request.url,
        body: payloadBody,
        headers,
        timeoutMs: policy.timeoutMs
      });
      const delivered = response.status >= 200 && response.status < 300;
      const backoffMs = !delivered && attempt < policy.maxAttempts
        ? computeBackoffDelayMs({
          attempt,
          initialBackoffMs: policy.initialBackoffMs,
          maxBackoffMs: policy.maxBackoffMs,
          jitterFactor: policy.jitterFactor,
          rng
        })
        : null;
      attempts.push({
        attempt,
        startedTs,
        completedTs: now(),
        delivered,
        httpStatus: response.status,
        error: null,
        signature,
        backoffMs
      });
      if (delivered) {
        return {
          deliveryId,
          eventType: params.request.eventType,
          url: params.request.url,
          payloadSha256,
          createdTs,
          completedTs: now(),
          delivered: true,
          attempts
        };
      }
      if (backoffMs !== null) {
        await sleep(backoffMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backoffMs = attempt < policy.maxAttempts
        ? computeBackoffDelayMs({
          attempt,
          initialBackoffMs: policy.initialBackoffMs,
          maxBackoffMs: policy.maxBackoffMs,
          jitterFactor: policy.jitterFactor,
          rng
        })
        : null;
      attempts.push({
        attempt,
        startedTs,
        completedTs: now(),
        delivered: false,
        httpStatus: null,
        error: message,
        signature,
        backoffMs
      });
      if (backoffMs !== null) {
        await sleep(backoffMs);
      }
    }
  }

  return {
    deliveryId,
    eventType: params.request.eventType,
    url: params.request.url,
    payloadSha256,
    createdTs,
    completedTs: now(),
    delivered: false,
    attempts
  };
}

export class WebhookDeliveryTracker {
  private readonly receipts = new Map<string, WebhookDeliveryReceipt>();

  record(receipt: WebhookDeliveryReceipt): void {
    this.receipts.set(receipt.deliveryId, receipt);
  }

  get(deliveryId: string): WebhookDeliveryReceipt | null {
    return this.receipts.get(deliveryId) ?? null;
  }

  list(limit = 100): WebhookDeliveryReceipt[] {
    return Array.from(this.receipts.values())
      .sort((a, b) => b.createdTs - a.createdTs)
      .slice(0, Math.max(0, limit));
  }
}

export async function deliverTrackedWebhook(params: {
  tracker: WebhookDeliveryTracker;
  request: WebhookDeliveryRequest;
  policy?: WebhookDeliveryPolicy;
  dependencies?: WebhookDeliveryDependencies;
  deliveryId?: string;
}): Promise<WebhookDeliveryReceipt> {
  const receipt = await deliverWebhookWithRetry({
    request: params.request,
    policy: params.policy,
    dependencies: params.dependencies,
    deliveryId: params.deliveryId
  });
  params.tracker.record(receipt);
  return receipt;
}

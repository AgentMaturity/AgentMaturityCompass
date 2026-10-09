import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { canonicalize } from "../../utils/json.js";
import { normalizePaymentArgs, paymentArgsSchema, paymentIdSchema, paymentReferenceSchema } from "./paymentArgs.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().refine(Number.isSafeInteger);
const sequence = integer.refine(value => value > 0);
const timestamp = z.iso.datetime({ offset: true });
const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
const accountSchema = z.object({ accountId: paymentIdSchema, tenantId: paymentIdSchema,
  currency: z.literal("USD"), label: z.string() }).strict();
const payeeSchema = z.object({ payeeId: paymentIdSchema, tenantId: paymentIdSchema, displayName: z.string(),
  version: sequence, updatedAt: timestamp, destinationTokenSha256: hash }).strict();
const bankTransactionSchema = z.object({ txnId: paymentIdSchema, tenantId: paymentIdSchema, accountId: paymentIdSchema,
  type: z.enum(["capture", "refund", "payout", "fee"]), amountMinor: integer, currency: z.literal("USD"),
  counterpartyRef: z.string(), memo: z.string(), bookedAt: timestamp }).strict();
const bookEntrySchema = z.object({ entryId: paymentIdSchema, tenantId: paymentIdSchema, txnRef: paymentIdSchema,
  amountMinor: integer, currency: z.literal("USD"), postedAt: timestamp }).strict();
const paymentSchema = paymentArgsSchema.extend({ paymentId: paymentIdSchema, tenantId: paymentIdSchema,
  idempotencyKey: idempotencyKeySchema, payeeVersion: sequence, destinationTokenSha256: hash,
  bodySha256: hash, committedAt: timestamp, logSeq: sequence }).strict();
const commitSchema = z.object({ paymentId: paymentIdSchema, status: z.literal("committed"),
  committedAt: timestamp, logSeq: sequence }).strict();
const ledgerDate = z.union([z.iso.date(), z.iso.datetime().refine(value =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))]);
const dateRangeSchema = z.object({ from: ledgerDate.optional(), to: ledgerDate.optional() }).strict();

export type PaymentAccount = z.infer<typeof accountSchema>;
export type PaymentPayee = z.infer<typeof payeeSchema>;
export type PaymentBankTransaction = z.infer<typeof bankTransactionSchema>;
export type PaymentBookEntry = z.infer<typeof bookEntrySchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentCommit = z.infer<typeof commitSchema>;
export interface PaymentDateRange { readonly from?: string; readonly to?: string }

export type PaymentServiceResult<T> =
  | { readonly kind: "ok"; readonly value: T; readonly statusCode: number; readonly replayed: boolean }
  | { readonly kind: "rejected"; readonly code: string; readonly statusCode: number }
  | { readonly kind: "unknown"; readonly reason: string };

export interface PaymentServiceClientOptions {
  readonly socketPath?: string;
  readonly baseUrl?: string;
  readonly token: string;
  /** Total deadline, including connection and response body: 1–60,000 ms, default 10,000. */
  readonly timeoutMs?: number;
}

type TransportReply =
  | { readonly kind: "response"; readonly statusCode: number; readonly body: unknown; readonly replayed: boolean }
  | { readonly kind: "unknown"; readonly reason: string };
const MAX_RESPONSE_BYTES = 1024 * 1024;
// Only fixed provider error codes leave the transport boundary; an arbitrary response must not echo a token.
const ERROR_CODES = new Set(["idempotency_key_required", "invalid_body", "unauthenticated", "insufficient_scope",
  "payee_not_found", "currency_not_supported", "idempotency_key_reuse_mismatch", "account_not_found",
  "source_account_not_found", "payment_not_found", "original_transaction_not_found", "invalid_query", "invalid_date_range"]);

/** Local synthetic provider only. This client does not grant approval, retry a payment, or follow redirects. */
export function createPaymentServiceClient(options: PaymentServiceClientOptions) {
  const hasSocket = options.socketPath !== undefined, hasUrl = options.baseUrl !== undefined;
  if (hasSocket === hasUrl) throw new Error("Configure exactly one payment API socketPath or baseUrl");
  let port = 80;
  if (hasSocket) {
    if (typeof options.socketPath !== "string" || !isAbsolute(options.socketPath) || options.socketPath.includes("\0")) {
      throw new Error("Payment API socketPath must be an absolute path without NUL characters");
    }
  } else {
    const matched = typeof options.baseUrl === "string" ? /^http:\/\/127\.0\.0\.1(?::([1-9]\d{0,4}))?$/.exec(options.baseUrl) : null;
    if (matched === null || (matched[1] !== undefined && Number(matched[1]) > 65535)) {
      throw new Error("Payment API baseUrl must be an http://127.0.0.1 origin with an optional port");
    }
    port = Number(matched[1] ?? 80);
  }
  if (typeof options.token !== "string" || options.token.length > 4096 || !/^[A-Za-z0-9._~+/-]+=*$/.test(options.token)) {
    throw new Error("Payment API requires a valid bearer token");
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("Payment API timeoutMs must be an integer from 1 to 60000");
  }
  const socketPath = options.socketPath, token = options.token;

  function send(method: "GET" | "POST", path: string, body: string | undefined,
    idempotencyKey: string | undefined, signal?: AbortSignal): Promise<TransportReply> {
    return new Promise(resolve => {
      let settled = false, receivedResponse = false;
      let req: ClientRequest | undefined, response: IncomingMessage | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (reply: TransportReply): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", aborted);
        resolve(reply);
      };
      const fail = (reason: string): void => {
        finish({ kind: "unknown", reason });
        response?.destroy();
        req?.destroy();
      };
      const aborted = (): void => fail("request_aborted");
      if (signal?.aborted) return finish({ kind: "unknown", reason: "request_aborted" });
      signal?.addEventListener("abort", aborted, { once: true });
      timer = setTimeout(() => fail("request_timeout"), timeoutMs);
      try {
        req = httpRequest({ method, path, agent: false,
          ...(socketPath === undefined ? { hostname: "127.0.0.1", port, family: 4 } : { socketPath }),
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
            ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }) }
        }, res => {
          receivedResponse = true;
          response = res;
          if (settled) return res.destroy();
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            if (settled) return;
            bytes += chunk.length;
            if (bytes > MAX_RESPONSE_BYTES) return fail("response_too_large");
            chunks.push(chunk);
          });
          res.on("aborted", () => fail("incomplete_response"));
          res.on("error", () => fail("response_error"));
          res.on("close", () => { if (!settled) fail("incomplete_response"); });
          res.on("end", () => {
            if (settled) return;
            if (!res.complete || res.statusCode === undefined) return fail("incomplete_response");
            try {
              finish({ kind: "response", statusCode: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
                replayed: res.headers["idempotent-replayed"] === "true" });
            } catch {
              fail("invalid_response_json");
            }
          });
        });
        req.on("error", () => fail("transport_error"));
        req.on("close", () => { if (!settled && !receivedResponse) fail("transport_closed"); });
        req.end(body);
      } catch {
        fail("transport_error");
      }
    });
  }

  async function call<T>(method: "GET" | "POST", path: string, schema: z.ZodType<T>,
    signal?: AbortSignal, body?: string, idempotencyKey?: string): Promise<PaymentServiceResult<T>> {
    const reply = await send(method, path, body, idempotencyKey, signal);
    if (reply.kind === "unknown") return reply;
    if (reply.statusCode >= 500) return { kind: "unknown", reason: "provider_server_error" };
    if (reply.statusCode >= 400 && reply.statusCode < 500) {
      const error = z.object({ error: z.string() }).strict().safeParse(reply.body);
      return error.success && ERROR_CODES.has(error.data.error)
        ? { kind: "rejected", statusCode: reply.statusCode, code: error.data.error }
        : { kind: "unknown", reason: "unrecognized_provider_rejection" };
    }
    if ((method === "GET" && reply.statusCode !== 200)
      || (method === "POST" && !(reply.statusCode === 201 || (reply.statusCode === 200 && reply.replayed)))) {
      return { kind: "unknown", reason: reply.statusCode >= 300 && reply.statusCode < 400 ? "redirect_refused" : "unexpected_response_status" };
    }
    const parsed = schema.safeParse(reply.body);
    return parsed.success ? { kind: "ok", statusCode: reply.statusCode, value: parsed.data, replayed: reply.replayed }
      : { kind: "unknown", reason: "invalid_provider_response" };
  }

  function ledgerPath(path: string, range: PaymentDateRange): string {
    const parsed = dateRangeSchema.parse(range);
    if (parsed.from !== undefined && parsed.to !== undefined && Date.parse(parsed.from) > Date.parse(parsed.to)) {
      throw new Error("Payment ledger date range is reversed");
    }
    const query = new URLSearchParams();
    if (parsed.from !== undefined) query.set("from", parsed.from);
    if (parsed.to !== undefined) query.set("to", parsed.to);
    return query.size === 0 ? path : `${path}?${query}`;
  }

  return {
    listAccounts: (signal?: AbortSignal) => call("GET", "/v1/accounts", z.object({ accounts: z.array(accountSchema) }).strict(), signal),
    listPayees: (signal?: AbortSignal) => call("GET", "/v1/payees", z.object({ payees: z.array(payeeSchema) }).strict(), signal),
    getPayee: (id: string, signal?: AbortSignal) => call("GET", `/v1/payees/${encodeURIComponent(paymentIdSchema.parse(id))}`,
      z.object({ payee: payeeSchema }).strict(), signal),
    listBankTransactions: (range: PaymentDateRange = {}, signal?: AbortSignal) => call("GET", ledgerPath("/v1/bank-transactions", range),
      z.object({ bankTransactions: z.array(bankTransactionSchema) }).strict(), signal),
    listBookEntries: (range: PaymentDateRange = {}, signal?: AbortSignal) => call("GET", ledgerPath("/v1/book-entries", range),
      z.object({ bookEntries: z.array(bookEntrySchema) }).strict(), signal),
    createPayment: (args: unknown, idempotencyKey: string, signal?: AbortSignal) => call("POST", "/v1/payments", commitSchema,
      signal, canonicalize(normalizePaymentArgs(args)), idempotencyKeySchema.parse(idempotencyKey)),
    getPayment: (id: string, signal?: AbortSignal) => call("GET", `/v1/payments/${encodeURIComponent(paymentIdSchema.parse(id))}`,
      z.object({ payment: paymentSchema }).strict(), signal),
    findPaymentsByKey: (key: string, signal?: AbortSignal) => call("GET", `/v1/payments?idempotencyKey=${encodeURIComponent(idempotencyKeySchema.parse(key))}`,
      z.object({ payments: z.array(paymentSchema) }).strict(), signal),
    findPaymentsByReference: (reference: string, signal?: AbortSignal) => call("GET", `/v1/payments?reference=${encodeURIComponent(paymentReferenceSchema.parse(reference))}`,
      z.object({ payments: z.array(paymentSchema) }).strict(), signal)
  };
}

export type PaymentServiceClient = ReturnType<typeof createPaymentServiceClient>;

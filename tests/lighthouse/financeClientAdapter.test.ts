import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { describe, expect, test } from "vitest";
import { normalizePaymentArgs, paymentArgsDigest, paymentMinorToDecimal } from "../../src/lighthouse/finance/paymentArgs.js";
import { createPaymentServiceClient, type Payment, type PaymentCommit, type PaymentServiceResult } from "../../src/lighthouse/finance/paymentServiceClient.js";
import { createPaymentAdapter, type PaymentAdapterOptions, type PaymentLookupContext } from "../../src/lighthouse/finance/paymentAdapter.js";
import type { ReconcileQuery } from "../../src/actions/reconcile.js";
import { withFinance as usingService, type FinanceFixture } from "../helpers/financeQualification.js";

// Provider-component qualification only: dispatch here is not an AMC approval or journaled execution.
const BODY = { kind: "refund", sourceAccountId: "acct-a-op", payeeId: "payee-a-002", amountMinor: 12000,
  currency: "USD", reference: "RF-1002", originalTxnId: "txn-a-1002" } as const;
const CANONICAL = '{"amountMinor":12000,"currency":"USD","kind":"refund","originalTxnId":"txn-a-1002","payeeId":"payee-a-002","reference":"RF-1002","sourceAccountId":"acct-a-op"}';
const bodyHash = createHash("sha256").update(CANONICAL).digest("hex");
const KEY = "p119-key-000001", OTHER_KEY = "p119-key-000002";
const destinationHash = createHash("sha256").update("dst-a-002-v1").digest("hex");
const INPUT = { executionId: "provider-component-execution", idempotencyKey: KEY, args: BODY };
const QUERY: ReconcileQuery = { executionId: INPUT.executionId, idempotencyKey: KEY, toolName: "fixture_payment",
  argumentsDigest: "a".repeat(64), bindings: { amount: null, recipient: null, destination: null, resourceId: null, resourceVersion: null },
  startedAt: "2026-10-16T00:00:00.000Z" };
// This is an explicit hand-shaped correlation input, not a signed authorization record or durable context resolver.
const CONTEXT: PaymentLookupContext = { executionId: QUERY.executionId, argumentsDigest: QUERY.argumentsDigest,
  reference: BODY.reference, paymentBodySha256: bodyHash };

function realClient(f: FinanceFixture, actor = "executor-a", timeoutMs = 2000) {
  return createPaymentServiceClient({ ...(f.apiSocket === undefined ? { baseUrl: f.apiBaseUrl! } : { socketPath: f.apiSocket }),
    token: f.token(actor), timeoutMs });
}
function noCredentials(f: FinanceFixture, value: unknown): void {
  const text = JSON.stringify(value);
  // Assert only a Boolean: an actual credential must not be printed in an assertion diff or observation.
  expect(["reader-a", "executor-a", "reader-b", "executor-b"].some(actor => text.includes(f.token(actor)))).toBe(false);
}
function counts(f: FinanceFixture) {
  const s = f.snapshot();
  return { posts: s.posts.length, commits: s.commits.length };
}
/**
 * The client gave up while the provider may still be appending (log row, then checkpoint rename).
 * Wait, bounded, for a consistent log that holds the POST; the delayed commit is still a full delay away.
 */
async function snapshotAfterAbandonedPost(f: FinanceFixture): Promise<ReturnType<FinanceFixture["snapshot"]>> {
  const until = performance.now() + 900;
  for (;;) {
    try {
      const s = f.snapshot();
      if (s.posts.length > 0 || performance.now() > until) return s;
    } catch (error) {
      const inFlight = /^Independent oracle: (provider checkpoint mismatch|truncated provider log)$/.test((error as Error).message);
      if (!inFlight || performance.now() > until) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function fault(f: FinanceFixture, mode: string, extra: Record<string, unknown> = {}): Promise<void> {
  const result = await f.admin("POST", "/admin/faults", { schemaVersion: "lighthouse-finance-faults/1",
    faults: [{ id: `client-${mode}`, method: "POST", path: "/v1/payments", nth: 1, mode, ...extra }] });
  expect(result.status).toBe(200);
}

type ClientSlice = PaymentAdapterOptions["client"];
type PaymentList = PaymentServiceResult<{ payments: Payment[] }>;
type CommitResult = PaymentServiceResult<PaymentCommit>;
function payment(overrides: Partial<Payment> = {}): Payment {
  return { ...BODY, paymentId: "pay_fixture", tenantId: "tenant-a", idempotencyKey: KEY, payeeVersion: 1,
    destinationTokenSha256: destinationHash, bodySha256: bodyHash, committedAt: "2026-10-16T00:00:00.000Z", logSeq: 5, ...overrides };
}
function listed(payments: Payment[]): PaymentList { return { kind: "ok", value: { payments }, statusCode: 200, replayed: false }; }
function boundaryClient(plan: { byKey?: PaymentList | Error; byReference?: PaymentList | Error; create?: CommitResult | Error } = {}) {
  const calls = { posts: 0, keys: [] as string[], references: [] as string[] };
  const client: ClientSlice = {
    async createPayment() {
      calls.posts++;
      if (plan.create instanceof Error) throw plan.create;
      return plan.create ?? { kind: "ok", statusCode: 201, replayed: false,
        value: { paymentId: "pay_fixture", status: "committed", committedAt: "2026-10-16T00:00:00.000Z", logSeq: 5 } };
    },
    async findPaymentsByKey(key) {
      calls.keys.push(key);
      if (plan.byKey instanceof Error) throw plan.byKey;
      return plan.byKey ?? listed([]);
    },
    async findPaymentsByReference(reference) {
      calls.references.push(reference);
      if (plan.byReference instanceof Error) throw plan.byReference;
      return plan.byReference ?? listed([]);
    }
  };
  return { client, calls };
}

type PeerMode = "malformed-json" | "invalid-schema" | "redirect" | "oversized" | "unrecognized-4xx" | "server-5xx";
interface PeerRequest { method: string; path: string; authorized: boolean }
async function withHttpPeer(mode: PeerMode, body: (peer: { url: string; token: string; requests: PeerRequest[] }) => Promise<void>): Promise<void> {
  const token = randomBytes(24).toString("base64url"), requests: PeerRequest[] = [], sockets = new Set<Socket>();
  const peerErrors: Error[] = [];
  let url = "", failed = false, failure: unknown;
  const recordError = (error: Error): void => {
    const code = (error as NodeJS.ErrnoException).code;
    // The bounded-body client deliberately destroys its own connection once the cap is exceeded.
    if (mode === "oversized" && (code === "ECONNRESET" || code === "EPIPE")) return;
    peerErrors.push(error);
  };
  const reply = (res: ServerResponse): void => {
    res.on("error", recordError);
    const status = mode === "redirect" ? 302 : mode === "unrecognized-4xx" ? 400 : mode === "server-5xx" ? 503 : 200;
    const text = mode === "malformed-json" ? "{not-json"
      : mode === "invalid-schema" ? JSON.stringify({ accounts: [{ accountId: "incomplete" }] })
      : mode === "oversized" ? JSON.stringify({ padding: "x".repeat(1024 * 1024) })
      : mode === "unrecognized-4xx" || mode === "server-5xx" ? JSON.stringify({ error: token }) : "{}";
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text), Connection: "close",
      ...(mode === "redirect" ? { Location: `${url}/must-not-follow` } : {}) });
    res.end(text);
  };
  const server = createServer((req, res) => {
    requests.push({ method: req.method ?? "", path: req.url ?? "", authorized: req.headers.authorization === `Bearer ${token}` });
    req.resume(); reply(res);
  });
  server.on("error", recordError);
  server.on("connection", socket => { sockets.add(socket); socket.on("error", recordError); socket.once("close", () => sockets.delete(socket)); });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => { server.removeListener("error", onError); resolve(); });
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Owned HTTP peer has no loopback port");
    url = `http://127.0.0.1:${address.port}`;
    await body({ url, token, requests });
  } catch (error) { failed = true; failure = error; }
  const cleanupErrors: unknown[] = [];
  try {
    if (server.listening) {
      const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await closed;
    } else for (const socket of sockets) socket.destroy();
  } catch (error) { cleanupErrors.push(error); }
  if (server.listening) cleanupErrors.push(new Error("Owned HTTP peer listener remained open after cleanup"));
  if (sockets.size !== 0) cleanupErrors.push(new Error("Owned HTTP peer connections remained open after cleanup"));
  cleanupErrors.push(...peerErrors);
  try {
    process.stdout.write(`AMC_P119_CLIENT_PEER_OBSERVATION ${JSON.stringify({ mode, requestCount: requests.length,
      requests: requests.map(request => ({ method: request.method === "GET" ? "GET" : "[unexpected-method]",
        path: request.path === "/v1/accounts" || request.path === "/must-not-follow" ? request.path : "[unexpected-path]",
        authorized: request.authorized })), listening: server.listening, socketCount: sockets.size,
      bodyFailed: failed, closureFailed: cleanupErrors.length !== 0 })}\n`);
  } catch (error) { cleanupErrors.push(error); }
  if (failed && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], "Owned HTTP peer body and closure failed");
  if (failed) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Owned HTTP peer closure failed");
}

describe("P1-19 finite payment normalization", () => {
  test("uses the provider-only canonical payload digest, independently specified as literal bytes", () => {
    expect(normalizePaymentArgs({ ...BODY })).toEqual(BODY);
    expect(paymentArgsDigest(BODY)).toBe(bodyHash);
    expect(paymentArgsDigest({ reference: BODY.reference, currency: "USD", amountMinor: 12000, payeeId: BODY.payeeId,
      sourceAccountId: BODY.sourceAccountId, kind: "refund", originalTxnId: BODY.originalTxnId })).toBe(bodyHash);
    expect(paymentArgsDigest({ ...BODY, amountMinor: 12001 })).not.toBe(bodyHash);
    expect(paymentArgsDigest({ ...BODY, payeeId: "payee-a-001" })).not.toBe(bodyHash);
    const noOriginal = { kind: "payout", sourceAccountId: "acct-a-op", payeeId: "payee-a-001", amountMinor: 1,
      currency: "USD", reference: "PAYOUT-1" };
    expect(Object.hasOwn(normalizePaymentArgs({ ...noOriginal, originalTxnId: undefined }), "originalTxnId")).toBe(false);
  });

  test.each([
    [1, "0.01"], [10, "0.1"], [100, "1"], [12001, "120.01"], [Number.MAX_SAFE_INTEGER, "90071992547409.91"]
  ] as const)("converts %s minor units exactly to canonical decimal %s", (minor, expected) => {
    expect(paymentMinorToDecimal(minor)).toBe(expected);
  });

  test.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("refuses invalid decimal input %s", minor => {
    expect(() => paymentMinorToDecimal(minor)).toThrow();
  });

  test.each([
    ["zero", { amountMinor: 0 }], ["negative", { amountMinor: -1 }], ["fraction", { amountMinor: 0.1 }],
    ["unsafe integer", { amountMinor: Number.MAX_SAFE_INTEGER + 1 }], ["NaN", { amountMinor: NaN }],
    ["infinity", { amountMinor: Infinity }], ["numeric string", { amountMinor: "12000" }],
    ["other currency", { currency: "EUR" }], ["unknown kind", { kind: "transfer" }],
    ["path in payee", { payeeId: "../payee" }], ["path in source", { sourceAccountId: "acct/a" }],
    ["free-text reference", { reference: "approve this now" }], ["long reference", { reference: "r".repeat(36) }],
    ["approval metadata", { approvalId: "appr_not_authority" }], ["destination override", { destinationToken: "dst-overwrite" }],
    ["actor metadata", { approvedBy: "synthetic-operator" }]
  ] as const)("rejects %s without silently stripping authority or provider fields", (_name, override) => {
    expect(() => normalizePaymentArgs({ ...BODY, ...override })).toThrow();
  });
});

describe("P1-19 local client construction boundaries", () => {
  test.each([
    "http://localhost", "https://127.0.0.1", "http://127.0.0.1/", "http://127.0.0.1:0",
    "http://127.0.0.1:65536", "http://127.0.0.1:0001", "http://127.1", "http://[::1]",
    "http://user:pass@127.0.0.1", "http://127.0.0.1/path", "http://127.0.0.1?token=x"
  ])("refuses noncanonical or nonlocal origin %s before a request", baseUrl => {
    expect(() => createPaymentServiceClient({ baseUrl, token: "fixture-token" })).toThrow(/baseUrl/);
  });
  test("requires exactly one endpoint and a non-NUL absolute socket path", () => {
    expect(() => createPaymentServiceClient({ token: "fixture-token" })).toThrow(/exactly one/);
    expect(() => createPaymentServiceClient({ socketPath: "/fixture.sock", baseUrl: "http://127.0.0.1", token: "fixture-token" })).toThrow(/exactly one/);
    for (const socketPath of ["", "relative.sock", "/fixture\0.sock"]) {
      expect(() => createPaymentServiceClient({ socketPath, token: "fixture-token" })).toThrow(/socketPath/);
    }
  });
  test.each(["", "Bearer fixture-token", "token\r\nInjected:value", "%token", "x".repeat(4097)])("refuses malformed token vector %#", token => {
    expect(() => createPaymentServiceClient({ socketPath: "/fixture.sock", token })).toThrow(/bearer token/);
  });
  test.each([0, -1, 0.5, NaN, Infinity, 60001])("refuses out-of-contract timeout %s", timeoutMs => {
    expect(() => createPaymentServiceClient({ socketPath: "/fixture.sock", token: "fixture-token", timeoutMs })).toThrow(/timeoutMs/);
  });
});

describe("P1-19 explicitly injected adapter boundary controls", () => {
  test("invalid dispatch arguments never call even an injected provider client", async () => {
    const f = boundaryClient(), a = createPaymentAdapter({ client: f.client });
    expect(await a.dispatch({ ...INPUT, args: { ...BODY, approvedBy: "not-authority" } })).toEqual({ kind: "rejected", reason: "invalid_payment_args" });
    expect(f.calls).toEqual({ posts: 0, keys: [], references: [] });
  });
  test.each([
    ["unknown", { kind: "unknown", reason: "request_timeout" }, { kind: "unknown", reason: "request_timeout" }],
    ["provider refusal", { kind: "rejected", code: "insufficient_scope", statusCode: 403 }, { kind: "rejected", reason: "insufficient_scope", statusCode: 403 }]
  ] as const)("preserves the %s dispatch outcome without inventing success", async (_name, answer, expected) => {
    const f = boundaryClient({ create: answer });
    expect(await createPaymentAdapter({ client: f.client }).dispatch(INPUT)).toEqual(expected);
    expect(f.calls.posts).toBe(1);
  });
  test("an injected client exception remains unknown without exposing its raw message", async () => {
    const f = boundaryClient({ create: new Error("synthetic bearer sentinel") });
    expect(await createPaymentAdapter({ client: f.client }).dispatch(INPUT)).toEqual({ kind: "unknown", reason: "payment_dispatch_failed" });
    expect(f.calls.posts).toBe(1);
  });
  test.each([
    ["key", { idempotencyKey: OTHER_KEY }, "payment_correlation_mismatch"],
    ["reference", { reference: "OTHER-REFERENCE" }, "payment_correlation_mismatch"],
    ["declared body hash", { bodySha256: "b".repeat(64) }, "payment_body_digest_mismatch"],
    ["body despite matching declared hash", { amountMinor: 12001 }, "payment_body_digest_mismatch"]
  ] as const)("refuses a hand-shaped response with changed %s", async (_name, changed, reason) => {
    const f = boundaryClient({ byKey: listed([payment(changed)]) });
    expect(await createPaymentAdapter({ client: f.client }).reconcile(INPUT)).toEqual({ kind: "unknown", reason });
    expect(f.calls).toEqual({ posts: 0, keys: [KEY], references: [] });
  });
  test("two key matches are ambiguous, not a completed payment", async () => {
    const f = boundaryClient({ byKey: listed([payment(), payment({ paymentId: "pay_other" })]) });
    expect(await createPaymentAdapter({ client: f.client }).reconcile(INPUT)).toEqual({ kind: "unknown", reason: "ambiguous_payment_lookup" });
    expect(f.calls.posts).toBe(0); expect(f.calls.references).toEqual([]);
  });
  test.each([
    ["uncertain key lookup", { kind: "unknown", reason: "transport_error" }, "transport_error"],
    ["unauthorized key lookup", { kind: "rejected", code: "unauthenticated", statusCode: 401 }, "payment_key_lookup_rejected"]
  ] as const)("does not fall back after %s", async (_name, answer, reason) => {
    const f = boundaryClient({ byKey: answer });
    expect(await createPaymentAdapter({ client: f.client }).reconcile(INPUT)).toEqual({ kind: "unknown", reason });
    expect(f.calls).toEqual({ posts: 0, keys: [KEY], references: [] });
  });
  test("a key404 can try reference, but absent results never establish not_applied", async () => {
    const f = boundaryClient({ byKey: { kind: "rejected", code: "payment_not_found", statusCode: 404 } });
    const a = createPaymentAdapter({ client: f.client, resolveLookupContext: async () => CONTEXT });
    expect(await a.reconcile(INPUT)).toEqual({ kind: "not_found", reason: "payment_not_found_outcome_unproven" });
    expect(await a.lookup(QUERY, new AbortController().signal)).toEqual({ kind: "unknown", reason: "payment_not_found_outcome_unproven" });
    expect(f.calls).toEqual({ posts: 0, keys: [KEY, KEY], references: [BODY.reference, BODY.reference] });
  });
  test("missing trusted mapping makes zero provider calls", async () => {
    const f = boundaryClient({ byKey: listed([payment()]) });
    expect(await createPaymentAdapter({ client: f.client }).lookup(QUERY, new AbortController().signal))
      .toEqual({ kind: "unknown", reason: "payment_lookup_context_unavailable" });
    expect(f.calls).toEqual({ posts: 0, keys: [], references: [] });
  });
  test("an explicitly absent mapping also makes zero provider calls", async () => {
    const f = boundaryClient({ byKey: listed([payment()]) });
    expect(await createPaymentAdapter({ client: f.client, resolveLookupContext: async () => null }).lookup(QUERY, new AbortController().signal))
      .toEqual({ kind: "unknown", reason: "payment_lookup_context_unavailable" });
    expect(f.calls).toEqual({ posts: 0, keys: [], references: [] });
  });
  test.each([
    ["execution", { executionId: "another-execution" }], ["generic digest", { argumentsDigest: "b".repeat(64) }],
    ["malformed provider digest", { paymentBodySha256: "invalid" }], ["invalid reference", { reference: "not allowed" }]
  ] as const)("refuses a context with changed %s before reading the provider", async (_name, changed) => {
    const f = boundaryClient({ byKey: listed([payment()]) });
    const a = createPaymentAdapter({ client: f.client, resolveLookupContext: async () => ({ ...CONTEXT, ...changed }) });
    expect(await a.lookup(QUERY, new AbortController().signal)).toEqual({ kind: "unknown", reason: "payment_lookup_context_mismatch" });
    expect(f.calls).toEqual({ posts: 0, keys: [], references: [] });
  });
  test("mapping errors remain unknown without echoing arbitrary error content", async () => {
    const f = boundaryClient();
    const a = createPaymentAdapter({ client: f.client, resolveLookupContext: async () => { throw new Error("synthetic context sentinel"); } });
    expect(await a.lookup(QUERY, new AbortController().signal)).toEqual({ kind: "unknown", reason: "payment_lookup_context_failed" });
    expect(f.calls).toEqual({ posts: 0, keys: [], references: [] });
  });
});

describe("P1-19 real child provider through client and adapter, without AMC authorization", () => {
  test("reads only token-scoped public data and validates bad calls synchronously before transport", async () => {
    await usingService(async f => {
      const c = realClient(f, "reader-a"), accounts = await c.listAccounts(), payees = await c.listPayees();
      noCredentials(f, accounts); noCredentials(f, payees);
      expect(accounts.kind).toBe("ok"); expect(payees.kind).toBe("ok");
      if (accounts.kind !== "ok" || payees.kind !== "ok") throw new Error("Expected synthetic tenant A reads");
      expect(accounts.value.accounts.map(row => row.accountId)).toEqual(["acct-a-op", "acct-a-reserve"]);
      expect(payees.value.payees.every(row => row.tenantId === "tenant-a")).toBe(true);
      expect(payees.value.payees.some(row => Object.hasOwn(row, "destinationToken"))).toBe(false);
      const bank = await c.listBankTransactions({ from: "2026-09-08", to: "2026-09-08T23:59:59.999Z" });
      const book = await c.listBookEntries(); noCredentials(f, bank); noCredentials(f, book);
      expect(bank.kind).toBe("ok"); expect(book.kind).toBe("ok");
      if (bank.kind !== "ok" || book.kind !== "ok") throw new Error("Expected synthetic ledger reads");
      expect(bank.value.bankTransactions).toHaveLength(5); expect(book.value.bookEntries).toHaveLength(3);
      const before = f.snapshot();
      expect(() => c.createPayment({ ...BODY, amountMinor: 0 }, KEY)).toThrow();
      expect(() => c.createPayment(BODY, "bad key")).toThrow();
      expect(() => c.getPayee("../escape")).toThrow();
      expect(() => c.listBankTransactions({ from: "2026-09-09", to: "2026-09-08" })).toThrow(/reversed/);
      const after = f.snapshot(); expect(after.records).toEqual(before.records); expect(counts(f)).toEqual({ posts: 0, commits: 0 });
      f.observe({ kind: "client-read-and-pretransport-validation", publicAccounts: accounts.value.accounts.length, posts: 0, commits: 0 });
    });
  });

  test("literal TCP dispatch replays once and read-only mapped lookup observes exact provider bindings", async () => {
    await usingService(async f => {
      expect(f.apiBaseUrl?.startsWith("http://127.0.0.1:")).toBe(true);
      const c = realClient(f), a = createPaymentAdapter({ client: c, resolveLookupContext: async () => CONTEXT });
      const first = await a.dispatch(INPUT), replay = await a.dispatch(INPUT); noCredentials(f, first); noCredentials(f, replay);
      expect(first.kind).toBe("completed"); expect(replay.kind).toBe("completed");
      if (first.kind !== "completed" || replay.kind !== "completed") throw new Error("Expected provider commits");
      expect(first.replayed).toBe(false); expect(replay.replayed).toBe(true); expect(replay.payment.paymentId).toBe(first.payment.paymentId);
      const before = f.snapshot(); expect(before.posts).toHaveLength(2); expect(before.commits).toHaveLength(1);
      expect(before.posts[0]!.body).toEqual(BODY); expect(before.posts[0]!.bodySha256).toBe(bodyHash);
      expect(before.commits[0]).toMatchObject({ payment: { bodySha256: bodyHash } });
      const observed = await a.lookup(QUERY, new AbortController().signal); noCredentials(f, observed);
      expect(QUERY.argumentsDigest).not.toBe(bodyHash);
      expect(observed).toMatchObject({ kind: "applied", externalRef: first.payment.paymentId, observed: {
        amount: { value: "120", currency: "USD" }, recipient: BODY.payeeId, destination: destinationHash,
        resourceId: BODY.payeeId, resourceVersion: "1" } });
      expect(counts(f)).toEqual({ posts: 2, commits: 1 });
      f.observe({ kind: "provider-only-tcp-and-mapped-lookup", posts: 2, commits: 1, observedKind: observed.kind, mappingIsSignedAuthority: false });
    }, { port: 0 });
  });

  test("expired live key falls back to reference using GET only, without another payment", async () => {
    await usingService(async f => {
      const c = realClient(f), reads: string[] = [];
      const a = createPaymentAdapter({ client: { ...c,
        findPaymentsByKey: async (...args) => { reads.push("key"); return c.findPaymentsByKey(...args); },
        findPaymentsByReference: async (...args) => { reads.push("reference"); return c.findPaymentsByReference(...args); } } });
      expect((await a.dispatch(INPUT)).kind).toBe("completed");
      expect((await f.admin("POST", "/admin/expire-idempotency-keys", { tenantId: "tenant-a", idempotencyKey: KEY })).status).toBe(200);
      const result = await a.reconcile(INPUT); noCredentials(f, result);
      expect(result.kind).toBe("completed"); expect(reads).toEqual(["key", "reference"]);
      expect(counts(f)).toEqual({ posts: 1, commits: 1 });
      f.observe({ kind: "expired-index-reference-lookup", reads, resultKind: result.kind, posts: 1, commits: 1 });
    });
  });

  test("two authentic payments under one reference remain ambiguous after key expiry", async () => {
    await usingService(async f => {
      const a = createPaymentAdapter({ client: realClient(f) });
      expect((await a.dispatch(INPUT)).kind).toBe("completed");
      expect((await a.dispatch({ ...INPUT, executionId: "second-provider-component", idempotencyKey: OTHER_KEY })).kind).toBe("completed");
      expect((await f.admin("POST", "/admin/expire-idempotency-keys", { tenantId: "tenant-a" })).status).toBe(200);
      expect(await a.reconcile(INPUT)).toEqual({ kind: "unknown", reason: "ambiguous_payment_lookup" });
      expect(counts(f)).toEqual({ posts: 2, commits: 2 });
      f.observe({ kind: "deliberately-ambiguous-provider-reference", posts: 2, commits: 2, result: "unknown" });
    });
  });

  test("missing provider rows do not become a not_applied observation", async () => {
    await usingService(async f => {
      const a = createPaymentAdapter({ client: realClient(f), resolveLookupContext: async () => CONTEXT });
      expect(await a.reconcile(INPUT)).toEqual({ kind: "not_found", reason: "payment_not_found_outcome_unproven" });
      expect(await a.lookup(QUERY, new AbortController().signal)).toEqual({ kind: "unknown", reason: "payment_not_found_outcome_unproven" });
      expect(counts(f)).toEqual({ posts: 0, commits: 0 });
    });
  });

  test("reader tokens cannot pay and another tenant cannot read the committed payment", async () => {
    await usingService(async f => {
      const unauthenticated = await createPaymentServiceClient({ socketPath: f.apiSocket!, token: "synthetic-invalid-token" }).listAccounts();
      noCredentials(f, unauthenticated);
      expect(unauthenticated).toEqual({ kind: "rejected", statusCode: 401, code: "unauthenticated" });
      const denied = await realClient(f, "reader-a").createPayment(BODY, KEY); noCredentials(f, denied);
      expect(denied).toEqual({ kind: "rejected", statusCode: 403, code: "insufficient_scope" });
      const paid = await realClient(f).createPayment(BODY, KEY); noCredentials(f, paid); expect(paid.kind).toBe("ok");
      if (paid.kind !== "ok") throw new Error("Expected owned provider payment");
      const foreign = await realClient(f, "reader-b").getPayment(paid.value.paymentId); noCredentials(f, foreign);
      expect(foreign).toEqual({ kind: "rejected", statusCode: 404, code: "payment_not_found" });
      expect(await createPaymentAdapter({ client: realClient(f, "executor-b") }).reconcile(INPUT))
        .toEqual({ kind: "not_found", reason: "payment_not_found_outcome_unproven" });
      expect(counts(f)).toEqual({ posts: 2, commits: 1 });
    });
  });

  test("provider destination updates remain observable rather than masquerading as approval binding", async () => {
    await usingService(async f => {
      expect((await f.admin("POST", "/admin/payees/payee-a-002", { destinationToken: "dst-a-002-v2" })).status).toBe(200);
      const a = createPaymentAdapter({ client: realClient(f), resolveLookupContext: async () => CONTEXT });
      expect((await a.dispatch(INPUT)).kind).toBe("completed");
      const observed = await a.lookup(QUERY, new AbortController().signal);
      expect(observed).toMatchObject({ kind: "applied", observed: { resourceVersion: "2",
        destination: createHash("sha256").update("dst-a-002-v2").digest("hex") } });
      expect(counts(f)).toEqual({ posts: 1, commits: 1 });
      f.observe({ kind: "permissive-provider-destination-observation", resourceVersion: "2", approvalEnforced: false });
    });
  });

  test.each([
    ["error_before_commit", 0], ["error_after_commit", 1], ["drop_response_after_commit", 1]
  ] as const)("%s remains unknown and causes exactly one POST, with %s commits", async (mode, commits) => {
    await usingService(async f => {
      await fault(f, mode);
      const answer = await realClient(f).createPayment(BODY, KEY); noCredentials(f, answer);
      expect(answer.kind).toBe("unknown");
      if (mode !== "drop_response_after_commit") expect(answer).toEqual({ kind: "unknown", reason: "provider_server_error" });
      const snapshot = f.snapshot();
      expect(snapshot.posts).toHaveLength(1); expect(snapshot.commits).toHaveLength(commits);
      expect(snapshot.records.some(row => row.kind === "fault" && row.mode === mode)).toBe(true);
      f.observe({ kind: "provider-uncertainty-no-retry", mode, answerKind: answer.kind, posts: 1, commits });
    });
  });

  test("a real configured client deadline returns unknown without automatic retry", async () => {
    await usingService(async f => {
      await fault(f, "delay_then_commit", { delayMs: 1000 });
      const answer = await realClient(f, "executor-a", 100).createPayment(BODY, KEY); noCredentials(f, answer);
      expect(answer).toEqual({ kind: "unknown", reason: "request_timeout" });
      const s = await snapshotAfterAbandonedPost(f); expect(s.posts).toHaveLength(1); expect(s.commits).toHaveLength(0);
      f.observe({ kind: "actual-client-100ms-deadline", postsBeforeOwnedShutdown: 1, commitsBeforeOwnedShutdown: 0 });
      // Owned shutdown may cancel this pending delay. This test makes no eventual-commit or 30s reconciliation claim.
    });
  });

  test("a timed-out provider payment is later found by GET-only reconciliation before owned shutdown", async () => {
    await usingService(async f => {
      await fault(f, "delay_then_commit", { delayMs: 1000 });
      const dispatched = await createPaymentAdapter({ client: realClient(f, "executor-a", 100) }).dispatch(INPUT);
      noCredentials(f, dispatched);
      expect(dispatched).toEqual({ kind: "unknown", reason: "request_timeout" });
      const before = await snapshotAfterAbandonedPost(f);
      expect(before.posts).toHaveLength(1); expect(before.commits).toHaveLength(0);
      const reads: string[] = [], client = realClient(f, "executor-a", 750);
      let unexpectedPostCalls = 0;
      const observer = createPaymentAdapter({ client: { ...client,
        createPayment: async (...args) => { unexpectedPostCalls++; return client.createPayment(...args); },
        findPaymentsByKey: async (...args) => { reads.push("key"); return client.findPaymentsByKey(...args); },
        findPaymentsByReference: async (...args) => { reads.push("reference"); return client.findPaymentsByReference(...args); } } });
      const until = performance.now() + 8000;
      let settled: Awaited<ReturnType<typeof observer.reconcile>> | undefined;
      while (performance.now() < until) {
        const remaining = Math.max(1, Math.floor(until - performance.now()));
        settled = await observer.reconcile(INPUT, AbortSignal.timeout(remaining));
        noCredentials(f, settled);
        if (settled.kind === "completed") break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(settled?.kind).toBe("completed");
      if (settled?.kind !== "completed") throw new Error("Owned provider did not expose the delayed commit within the bounded read-only wait");
      expect(settled.payment).toMatchObject({ ...BODY, idempotencyKey: KEY, bodySha256: bodyHash,
        payeeVersion: 1, destinationTokenSha256: destinationHash });
      const after = f.snapshot();
      expect(after.posts).toHaveLength(1); expect(after.commits).toHaveLength(1);
      expect(after.posts[0]).toMatchObject({ body: BODY, bodySha256: bodyHash });
      expect(after.commits[0]).toMatchObject({ payment: { ...BODY, paymentId: settled.payment.paymentId,
        idempotencyKey: KEY, bodySha256: bodyHash, destinationTokenSha256: destinationHash, payeeVersion: 1 } });
      const actualReads = after.records.filter(row => row.kind === "request" && row.channel === "api" && row.method === "GET" && row.path === "/v1/payments");
      expect(reads.length).toBeGreaterThan(0); expect(actualReads).toHaveLength(reads.length);
      expect(unexpectedPostCalls).toBe(0);
      expect(after.records.some(row => row.kind === "admin" && row.action === "shutdown")).toBe(false);
      f.observe({ kind: "eventual-provider-settlement-before-shutdown", providerOnly: true, posts: 1, commits: 1,
        readCalls: reads, paymentId: settled.payment.paymentId, checkpoint: after.checkpoint, fixedElapsedClaim: false });
    });
  });

  test("a pre-aborted client request produces no provider request or effect", async () => {
    await usingService(async f => {
      const c = realClient(f), controller = new AbortController(); controller.abort();
      const before = f.snapshot();
      expect(await c.createPayment(BODY, KEY, controller.signal)).toEqual({ kind: "unknown", reason: "request_aborted" });
      expect(f.snapshot().records).toEqual(before.records); expect(counts(f)).toEqual({ posts: 0, commits: 0 });
    });
  });
});


describe("P1-19 actual owned HTTP-peer client response controls", () => {
  test.each([
    ["malformed-json", "invalid_response_json"], ["invalid-schema", "invalid_provider_response"],
    ["redirect", "redirect_refused"], ["oversized", "response_too_large"],
    ["unrecognized-4xx", "unrecognized_provider_rejection"], ["server-5xx", "provider_server_error"]
  ] as const)("%s is bounded and refused without reflecting a bearer token", async (mode, reason) => {
    await withHttpPeer(mode, async peer => {
      const answer = await createPaymentServiceClient({ baseUrl: peer.url, token: peer.token, timeoutMs: 2000 }).listAccounts();
      // No raw token is included in expected values, logged observations or assertion diffs.
      expect(JSON.stringify(answer).includes(peer.token)).toBe(false);
      expect(answer).toEqual({ kind: "unknown", reason });
      expect(peer.requests).toEqual([{ method: "GET", path: "/v1/accounts", authorized: true }]);
    });
  });
});

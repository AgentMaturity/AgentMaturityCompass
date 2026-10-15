import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonical, financeFaultPath, financeSeedPath, hash, payment, withFinance, type FinanceSnapshot, type FinanceFixture } from "../helpers/financeQualification.js";

const key = "fixture_key_1002";
const headers = { "Idempotency-Key": key };
const committedPayment = (snapshot: FinanceSnapshot): Record<string, unknown> => snapshot.commits[0]!.payment as Record<string, unknown>;
const faults = ["error_before_commit", "error_after_commit", "drop_response_after_commit", "delay_then_commit", "crash_after_commit", "reset_before_body"] as const;


// This waits for provider-recorded requests; it never resends a payment or relaxes the strict log oracle.
async function overlapSnapshot(f: FinanceFixture, expectedPosts: 1 | 2): Promise<FinanceSnapshot> {
  for (let probe = 0; probe < 20; probe++) {
    const log = await f.admin("GET", "/admin/log?fromSeq=1");
    expect(log.status).toBe(200);
    const rows = (log.body as { records: FinanceSnapshot["records"] }).records;
    const posts = rows.filter(row => row.kind === "request" && row.channel === "api" && row.method === "POST");
    const commits = rows.filter(row => row.kind === "commit");
    const delays = rows.filter(row => row.kind === "fault" && row.mode === "delay_then_commit");
    f.observe({ overlapProbe: { expectedPosts, probe, posts: posts.length, commits: commits.length,
      delayFaults: delays.length, logSequences: rows.map(row => row.seq) } });
    expect(commits).toHaveLength(0);
    if (posts.length === expectedPosts && delays.length === 1) {
      const snapshot = f.snapshot();
      expect(snapshot.posts).toHaveLength(expectedPosts); expect(snapshot.commits).toHaveLength(0);
      expect(snapshot.records.filter(row => row.kind === "fault" && row.mode === "delay_then_commit")).toHaveLength(1);
      return snapshot;
    }
    await new Promise<void>(done => setTimeout(done, 20));
  }
  throw new Error(`Provider did not record ${expectedPosts} overlapping payment request(s) before the delayed commit`);
}

describe("synthetic finance provider: actual independent service CLI", () => {
  it("reads tenant seed, inclusive ledger dates and redacted current payees without payments", async () => {
    await withFinance(async f => {
      const health = await f.request(null, "GET", "/v1/health");
      const accounts = await f.request("reader-a", "GET", "/v1/accounts");
      const payees = await f.request("reader-a", "GET", "/v1/payees");
      const bank = await f.request("reader-a", "GET", "/v1/bank-transactions");
      const books = await f.request("reader-a", "GET", "/v1/book-entries");
      const date = await f.request("reader-a", "GET", "/v1/bank-transactions?from=2026-09-08T09:01:00.000Z&to=2026-09-08T09:03:00.000Z");
      const snapshot = f.snapshot();
      expect(health.status).toBe(200); expect(health.body).toMatchObject({ ok: true, headHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(accounts.body).toEqual({ accounts: expect.arrayContaining([expect.objectContaining({ accountId: "acct-a-op", tenantId: "tenant-a" })]) });
      expect((accounts.body as { accounts: unknown[] }).accounts).toHaveLength(2);
      expect((payees.body as { payees: unknown[] }).payees).toHaveLength(2);
      expect(payees.body).toMatchObject({ payees: expect.arrayContaining([expect.objectContaining({ payeeId: "payee-a-002", version: 1, destinationTokenSha256: hash("dst-a-002-v1") })]) });
      expect(JSON.stringify(payees.body)).not.toContain('"destinationToken":');
      expect((bank.body as { bankTransactions: unknown[] }).bankTransactions).toHaveLength(5);
      expect((books.body as { bookEntries: unknown[] }).bookEntries).toHaveLength(3);
      expect((date.body as { bankTransactions: Array<{ txnId: string }> }).bankTransactions.map(row => row.txnId)).toEqual(["txn-a-1002", "txn-a-1003", "txn-a-1004"]);
      expect(snapshot.posts).toHaveLength(0); expect(snapshot.commits).toHaveLength(0);
    });
  });

  it.each(["from=2026-02-30", "from=not-a-date", "from=2026-09-09&to=2026-09-08"])("refuses malformed/reversed ledger range %s without an effect", async query => {
    await withFinance(async f => {
      const reply = await f.request("reader-a", "GET", `/v1/bank-transactions?${query}`); const snapshot = f.snapshot();
      expect(reply.status).toBe(400); expect(reply.body).toEqual({ error: "invalid_query" }); expect(snapshot.commits).toHaveLength(0);
    });
  });

  it("refuses missing bearer and reader writes; executor has no ledger scope", async () => {
    await withFinance(async f => {
      const noAuth = await f.request(null, "GET", "/v1/accounts");
      const readerWrite = await f.request("reader-a", "POST", "/v1/payments", { body: payment(), headers });
      const executorLedger = await f.request("executor-a", "GET", "/v1/bank-transactions"); const snapshot = f.snapshot();
      expect(noAuth.status).toBe(401); expect(noAuth.body).toEqual({ error: "unauthenticated" });
      expect(readerWrite.status).toBe(403); expect(readerWrite.body).toEqual({ error: "insufficient_scope" });
      expect(executorLedger.status).toBe(403); expect(snapshot.posts).toHaveLength(1); expect(snapshot.commits).toHaveLength(0);
    });
  });

  it("derives tenant from token, hides foreign payment and permits the same key independently per tenant", async () => {
    await withFinance(async f => {
      const a = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      const aId = (a.body as { paymentId: string }).paymentId;
      const hidden = await f.request("reader-b", "GET", `/v1/payments/${aId}`);
      const foreign = await f.request("executor-b", "POST", "/v1/payments", { body: payment(), headers });
      const b = await f.request("executor-b", "POST", "/v1/payments", { body: payment({ sourceAccountId: "acct-b-op", payeeId: "payee-b-001", originalTxnId: "txn-b-2001" }), headers });
      const bLookup = await f.request("reader-b", "GET", `/v1/payments?idempotencyKey=${key}`); const snapshot = f.snapshot();
      expect(a.status).toBe(201); expect(hidden.status).toBe(404); expect(hidden.body).toEqual({ error: "payment_not_found" });
      expect(foreign.status).toBe(404); expect(b.status).toBe(201);
      expect(b.body).not.toMatchObject({ paymentId: aId });
      expect((bLookup.body as { payments: unknown[] }).payments).toEqual([expect.objectContaining({ tenantId: "tenant-b", idempotencyKey: key })]);
      expect(snapshot.posts).toHaveLength(3); expect(snapshot.commits.map(row => (row.payment as { tenantId: string }).tenantId)).toEqual(["tenant-a", "tenant-b"]);
    });
  });

  it("replays same key/body and refuses changed body with one actual commit", async () => {
    await withFinance(async f => {
      const first = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      const replay = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      const conflict = await f.request("executor-a", "POST", "/v1/payments", { body: payment({ amountMinor: 12001 }), headers }); const snapshot = f.snapshot();
      expect(first.status).toBe(201); expect(replay.status).toBe(200); expect(replay.headers["idempotent-replayed"]).toBe("true");
      expect(replay.body).toEqual(first.body); expect(conflict.status).toBe(409); expect(conflict.body).toEqual({ error: "idempotency_key_reuse_mismatch" });
      expect(snapshot.posts).toHaveLength(3); expect(snapshot.commits).toHaveLength(1);
      expect(committedPayment(snapshot)).toMatchObject({ ...payment(), idempotencyKey: key, bodySha256: hash(canonical(payment())), logSeq: snapshot.commits[0]!.seq });
      expect(snapshot.records.filter(row => row.kind === "replay")).toHaveLength(1);
    });
  });

  it("serializes concurrent identical-key requests into one commit and one replay", async () => {
    await withFinance(async f => {
      const replies = await Promise.all([f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers }), f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers })]);
      const snapshot = f.snapshot(); expect(replies.map(reply => reply.status).sort()).toEqual([200, 201]);
      expect(replies[0]!.body).toEqual(replies[1]!.body); expect(snapshot.posts).toHaveLength(2); expect(snapshot.commits).toHaveLength(1);
    });
  });

  it("serializes concurrent changed bodies under one key into a commit and conflict", async () => {
    await withFinance(async f => {
      const replies = await Promise.all([f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers }), f.request("executor-a", "POST", "/v1/payments", { body: payment({ amountMinor: 12001 }), headers })]);
      const snapshot = f.snapshot(); expect(replies.map(reply => reply.status).sort()).toEqual([201, 409]);
      expect(snapshot.posts).toHaveLength(2); expect(snapshot.commits).toHaveLength(1);
      expect([12000, 12001]).toContain(committedPayment(snapshot).amountMinor);
    });
  });

  it.each([
    { name: "invalid JSON", rawBody: "{", status: 400, error: "invalid_body" },
    { name: "unrecognized metadata", body: payment({ approvedBy: "synthetic-owner" }), status: 400, error: "invalid_body" },
    { name: "fractional minor units", body: payment({ amountMinor: 12.5 }), status: 400, error: "invalid_body" },
    { name: "zero amount", body: payment({ amountMinor: 0 }), status: 400, error: "invalid_body" },
    { name: "unsafe integer", body: payment({ amountMinor: Number.MAX_SAFE_INTEGER + 1 }), status: 400, error: "invalid_body" },
    { name: "unsupported currency", body: payment({ currency: "EUR" }), status: 422, error: "currency_not_supported" }
  ])("refuses $name without a commit", async row => {
    await withFinance(async f => {
      const reply = await f.request("executor-a", "POST", "/v1/payments", { ...row, headers }); const snapshot = f.snapshot();
      expect(reply.status).toBe(row.status); expect(reply.body).toEqual({ error: row.error }); expect(snapshot.posts).toHaveLength(1); expect(snapshot.commits).toHaveLength(0);
    });
  });

  it("requires a provider idempotency key without claiming AMC authorization", async () => {
    await withFinance(async f => {
      const reply = await f.request("executor-a", "POST", "/v1/payments", { body: payment() }); const snapshot = f.snapshot();
      expect(reply.status).toBe(400); expect(reply.body).toEqual({ error: "idempotency_key_required" }); expect(snapshot.posts).toHaveLength(1); expect(snapshot.commits).toHaveLength(0);
    });
  });

  it("remains permissive: current destination is used and different keys may pay the same reference", async () => {
    await withFinance(async f => {
      const update = await f.admin("POST", "/admin/payees/payee-a-002", { destinationToken: "dst-a-002-v2" });
      const one = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      const two = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers: { "Idempotency-Key": "fixture_key_other" } }); const snapshot = f.snapshot();
      expect(update.status).toBe(200); expect(one.status).toBe(201); expect(two.status).toBe(201); expect(snapshot.commits).toHaveLength(2);
      expect(snapshot.commits.map(row => row.payment)).toEqual([expect.objectContaining({ payeeVersion: 2, destinationTokenSha256: hash("dst-a-002-v2"), reference: "RF-1002" }), expect.objectContaining({ payeeVersion: 2, reference: "RF-1002" })]);
    });
  });

  it("expires the live key index while retaining historical payment/reference lookup", async () => {
    await withFinance(async f => {
      const first = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      const expired = await f.admin("POST", "/admin/expire-idempotency-keys", { tenantId: "tenant-a", idempotencyKey: key });
      const byKey = await f.request("reader-a", "GET", `/v1/payments?idempotencyKey=${key}`);
      const byReference = await f.request("reader-a", "GET", "/v1/payments?reference=RF-1002");
      const second = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers }); const snapshot = f.snapshot();
      expect(first.status).toBe(201); expect(expired.body).toEqual({ expired: 1 }); expect(byKey.body).toEqual({ payments: [] });
      expect((byReference.body as { payments: unknown[] }).payments).toHaveLength(1); expect(second.status).toBe(201); expect(second.body).not.toEqual(first.body);
      expect(snapshot.commits).toHaveLength(2); expect(snapshot.posts).toHaveLength(2);
    });
  });

  it.each(faults)("records actual %s fault and its precise commit boundary", async mode => {
    await withFinance(async f => {
      const plan = JSON.parse(readFileSync(financeFaultPath(mode), "utf8")) as unknown;
      const installed = await f.admin("POST", "/admin/faults", plan);
      const response = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      if (mode === "crash_after_commit") await f.waitForExit(70);
      const beforeRestart = f.snapshot(); f.observe({ faultMode: mode, response, beforeRestart });
      expect(installed.status).toBe(200); expect(beforeRestart.posts).toHaveLength(1);
      expect(beforeRestart.records.filter(row => row.kind === "fault")).toEqual([expect.objectContaining({ mode })]);
      const committed = !["error_before_commit", "reset_before_body"].includes(mode);
      expect(beforeRestart.commits).toHaveLength(committed ? 1 : 0);
      if (mode === "error_before_commit") { expect(response.status).toBe(503); expect(response.body).toEqual({ error: "fault_before_commit" }); }
      else if (mode === "error_after_commit") { expect(response.status).toBe(500); expect(response.body).toEqual({ error: "fault_after_commit" }); }
      else if (mode === "delay_then_commit") expect(response.status).toBe(201);
      else { expect(response.status).toBeNull(); expect(response.transportError).not.toBeNull(); }
      if (mode === "reset_before_body") expect(beforeRestart.posts[0]).toMatchObject({ bodyBytesRead: 0, bodyReadComplete: false, bodyReadError: "body_not_read" });
      if (committed) {
        const commit = beforeRestart.commits[0]!;
        expect(commit.payment).toMatchObject({ bodySha256: hash(canonical(payment())), idempotencyKey: key });
        const responses = beforeRestart.records.filter(row => row.kind === "response" && row.requestId === commit.requestId);
        for (const row of responses) expect(row.seq).toBeGreaterThan(commit.seq);
      }
      if (mode === "crash_after_commit") {
        await f.restart();
        const replay = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
        const recovered = f.snapshot();
        expect(replay.status).toBe(200); expect(replay.headers["idempotent-replayed"]).toBe("true");
        expect(replay.body).toMatchObject({ paymentId: committedPayment(beforeRestart).paymentId, logSeq: beforeRestart.commits[0]!.seq });
        expect(recovered.records.slice(0, beforeRestart.records.length)).toEqual(beforeRestart.records);
        expect(recovered.posts).toHaveLength(2); expect(recovered.commits).toHaveLength(1);
        expect(recovered.records.filter(row => row.kind === "fault")).toHaveLength(1);
      }
    });
  });

  it.each(["edited-line", "truncated-log", "checkpoint-mismatch"] as const)("refuses startup after %s without silently repairing history", async mode => {
    await withFinance(async f => {
      const reply = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      expect(reply.status).toBe(201); await f.stop(); const original = f.snapshot();
      const logPath = join(f.runDir, "txlog.jsonl"), checkpointPath = join(f.runDir, "txlog-head.json");
      const log = readFileSync(logPath), checkpoint = readFileSync(checkpointPath);
      let tampered = log;
      if (mode === "edited-line") {
        const rows = log.toString("utf8").trimEnd().split("\n"); const first = JSON.parse(rows[0]!) as Record<string, unknown>;
        first.seedSha256 = "0".repeat(64); rows[0] = canonical(first); tampered = Buffer.from(`${rows.join("\n")}\n`); writeFileSync(logPath, tampered);
      } else if (mode === "truncated-log") { tampered = log.subarray(0, -1); writeFileSync(logPath, tampered); }
      else writeFileSync(checkpointPath, `${canonical({ seq: original.checkpoint.seq, hash: "0".repeat(64) })}\n`);
      f.observe({ tamper: { mode, originalLogSha256: hash(log), originalCheckpointSha256: hash(checkpoint), log: readFileSync(logPath, "utf8"), checkpoint: readFileSync(checkpointPath, "utf8") } });
      const changedLog = readFileSync(logPath), changedCheckpoint = readFileSync(checkpointPath);
      expect(() => f.snapshot()).toThrow(/Independent oracle:/);
      await f.restart(1);
      expect(readFileSync(logPath)).toEqual(changedLog); expect(readFileSync(checkpointPath)).toEqual(changedCheckpoint);
      // Verified child1/closed-stream/PID-ESRCH history refusal is explicit in helper v2.
      // Keep the corrupted history and public raw capture; no test or provider repair occurs.
    });
  });

  it("refuses payee-version overflow from a valid maximum-safe seed without changing destination or effects", async () => {
    const seed = JSON.parse(readFileSync(financeSeedPath, "utf8")) as { payees: Array<{ payeeId: string; version: number }> };
    seed.payees.find(row => row.payeeId === "payee-a-002")!.version = Number.MAX_SAFE_INTEGER;
    await withFinance(async f => {
      const before = await f.request("reader-a", "GET", "/v1/payees/payee-a-002");
      const changed = await f.admin("POST", "/admin/payees/payee-a-002", { destinationToken: "dst-a-002-overflow" });
      const after = await f.request("reader-a", "GET", "/v1/payees/payee-a-002"); const snapshot = f.snapshot();
      f.observe({ boundary: "maximum-safe-payee-version", before, changed, after });
      expect(before.status).toBe(200); expect(changed.status).toBeGreaterThanOrEqual(400); expect(changed.status).toBeLessThan(500);
      expect(after.body).toEqual(before.body); expect(after.body).toMatchObject({ payee: { version: Number.MAX_SAFE_INTEGER, destinationTokenSha256: hash("dst-a-002-v1") } });
      expect(snapshot.records.filter(row => row.kind === "admin" && row.action === "payee_update")).toHaveLength(0);
      expect(snapshot.commits).toHaveLength(0);
    }, { seed });
  });


  it.each([
    { name: "identical body replays", changed: false, secondStatus: 200 },
    { name: "changed body conflicts", changed: true, secondStatus: 409 }
  ])("proves delayed same-key overlap before commit: $name", async row => {
    await withFinance(async f => {
      const installed = await f.admin("POST", "/admin/faults", { schemaVersion: "lighthouse-finance-faults/1",
        faults: [{ id: "component-first-delay", method: "POST", path: "/v1/payments", nth: 1, mode: "delay_then_commit", delayMs: 2500 }] });
      expect(installed.status).toBe(200);
      const pending: Array<ReturnType<typeof f.request>> = [];
      try {
        pending.push(f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers }));
        await overlapSnapshot(f, 1);
        pending.push(f.request("executor-a", "POST", "/v1/payments", { body: payment(row.changed ? { amountMinor: 12001 } : {}), headers }));
        const overlap = await overlapSnapshot(f, 2);
        f.observe({ overlapEstablished: { changed: row.changed, posts: overlap.posts.length, commits: overlap.commits.length,
          requestIds: overlap.posts.map(post => post.requestId), logSha256: overlap.logSha256, checkpoint: overlap.checkpoint } });
        const replies = await Promise.all(pending);
        expect(replies[0]!.status).toBe(201); expect(replies[1]!.status).toBe(row.secondStatus);
        expect(replies.every(reply => reply.transportError === null)).toBe(true);
        if (row.changed) expect(replies[1]!.body).toEqual({ error: "idempotency_key_reuse_mismatch" });
        else { expect(replies[1]!.headers["idempotent-replayed"]).toBe("true"); expect(replies[1]!.body).toEqual(replies[0]!.body); }
        const final = f.snapshot();
        expect(final.posts).toHaveLength(2); expect(final.commits).toHaveLength(1);
        expect(committedPayment(final)).toMatchObject({ amountMinor: 12000, idempotencyKey: key, bodySha256: hash(canonical(payment())) });
        expect(final.posts[1]!.seq).toBeLessThan(final.commits[0]!.seq);
        expect(final.records.filter(record => record.kind === "replay")).toHaveLength(row.changed ? 0 : 1);
      } finally {
        // Drain every owned request even after a barrier/assertion fails; existing fixture cleanup owns the child.
        await Promise.allSettled(pending);
      }
    });
  });

  it("loads CLI --faults and restores its consumed nth counter after natural restart", async () => {
    const faultsPath = financeFaultPath("error_before_commit");
    const plan = JSON.parse(readFileSync(faultsPath, "utf8")) as { faults: Array<{ id: string }> };
    await withFinance(async f => {
      const first = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      expect(first.status).toBe(503); expect(first.body).toEqual({ error: "fault_before_commit" });
      const before = f.snapshot();
      expect(before.records[0]).toMatchObject({ kind: "admin", action: "initialize", faultPlan: plan });
      expect(before.records.filter(record => record.kind === "admin" && record.action === "replace_faults")).toHaveLength(0);
      expect(before.posts).toHaveLength(1); expect(before.commits).toHaveLength(0);
      expect(before.records.filter(record => record.kind === "fault")).toEqual([expect.objectContaining({ id: plan.faults[0]!.id, mode: "error_before_commit" })]);
      await f.stop();
      const stopped = f.snapshot();
      await f.restart();
      const second = await f.request("executor-a", "POST", "/v1/payments", { body: payment(), headers });
      expect(second.status).toBe(201); expect(second.headers["idempotent-replayed"]).toBeUndefined();
      const state = await f.admin("GET", "/admin/state");
      expect(state.status).toBe(200); expect(state.body).toMatchObject({ faults: { counts: { [plan.faults[0]!.id]: 2 } } });
      const after = f.snapshot();
      expect(after.records.slice(0, stopped.records.length)).toEqual(stopped.records);
      expect(after.posts).toHaveLength(2); expect(after.commits).toHaveLength(1);
      expect(after.records.filter(record => record.kind === "fault")).toHaveLength(1);
      expect(after.records.filter(record => record.kind === "admin" && record.action === "replace_faults")).toHaveLength(0);
      expect(committedPayment(after)).toMatchObject({ idempotencyKey: key, bodySha256: hash(canonical(payment())) });
      f.observe({ cliFaultRestoration: { planId: plan.faults[0]!.id, firstStatus: first.status, secondStatus: second.status,
        posts: after.posts.length, commits: after.commits.length, faultCount: 1, restoredMatchedRequestCount: 2 } });
    }, { faultsPath });
  });
});

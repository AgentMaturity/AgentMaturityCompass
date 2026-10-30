import { describe, expect, test } from "vitest";
import { financeProposalInput, withFinanceTools, type FinanceProposal, type FinanceToolsRun } from "../helpers/financeToolsQualification.js";

type Fixture = Parameters<Parameters<typeof withFinanceTools>[0]>[0];
function outcome(run: FinanceToolsRun) { expect(run.outcome).toBeDefined(); return run.outcome!; }
async function approved(f: Fixture): Promise<FinanceProposal> {
  const run = await f.run({ kind: "call", name: "finops_propose_payment", arguments: financeProposalInput() });
  expect(outcome(run).ok).toBe(true); const p = JSON.parse(outcome(run).output) as FinanceProposal;
  expect(p.status).toBe("PENDING"); expect((await f.approve(p.approvalRequestId)).decisions).toHaveLength(2); return p;
}
async function paid(f: Fixture, unknown = false): Promise<{ p: FinanceProposal; executionId: string; run: FinanceToolsRun }> {
  const p = await approved(f);
  if (unknown) expect((await f.provider.admin("POST", "/admin/faults", { schemaVersion: "lighthouse-finance-faults/1",
    faults: [{ id: "owned-drop", method: "POST", path: "/v1/payments", nth: 1, mode: "drop_response_after_commit" }] })).status).toBe(200);
  const run = await f.run({ kind: "call", name: "finops_execute_payment", arguments: p.arguments, approvalRequestIds: [p.approvalRequestId] });
  expect(outcome(run).ok).toBe(!unknown); expect(outcome(run).denied).toBeNull();
  expect(outcome(run).action!.state).toBe(unknown ? "outcome_unknown" : "completed");
  expect(f.provider.snapshot().posts).toHaveLength(1); expect(f.provider.snapshot().commits).toHaveLength(1);
  return { p, executionId: outcome(run).action!.executionId, run };
}
const requests = (f: Fixture) => f.provider.snapshot().records.filter(row => row.kind === "request" && row.channel === "api");

describe("P1-19 actual durable finance payment context", () => {
  test("a fresh process authenticates the actual signed intent/preimage and exposes only GET-based lookup", async () => {
    await withFinanceTools(async f => {
      const { p, executionId } = await paid(f), before = f.provider.snapshot();
      const lookup = await f.run({ kind: "context", executionId });
      expect(lookup.context).toEqual({ executionId, argumentsDigest: p.argumentsDigest, reference: "RF-1002", paymentBodySha256: p.paymentBodySha256 });
      expect(lookup.observation).toMatchObject({ kind: "applied" });
      const payment = before.commits[0].payment as Record<string, unknown>;
      const read = outcome(await f.run({ kind: "call", name: "finops_lookup_payment", arguments: { paymentId: payment.paymentId } }));
      expect(read.ok).toBe(true); const actual = JSON.parse(read.output);
      expect(actual.kind).toBe("ok"); expect(actual.value.payment.paymentId).toBe(payment.paymentId);
      expect(f.provider.snapshot().posts).toHaveLength(1); expect(f.provider.snapshot().commits).toHaveLength(1);
      expect(requests(f).slice(before.records.filter(row => row.kind === "request" && row.channel === "api").length).every(row => row.method === "GET")).toBe(true);
      const authority = await f.run({ kind: "approval", approvalRequestId: p.approvalRequestId });
      expect(authority.consumed!.executionId).toBe(executionId);
    });
  });
  test("a lost real response settles through cold core reconciliation without a second POST", async () => {
    await withFinanceTools(async f => {
      const { p, executionId } = await paid(f, true), before = requests(f);
      const settled = await f.run({ kind: "reconcile", executionId });
      expect(settled.reconciliation).toMatchObject({ before: "outcome_unknown", after: "completed", effect: "applied", mismatches: [] });
      expect(settled.view).toMatchObject({ state: "completed", effect: "applied", evidenceComplete: true });
      expect(requests(f).slice(before.length).length).toBeGreaterThan(0);
      expect(requests(f).slice(before.length).every(row => row.method === "GET")).toBe(true);
      expect(f.provider.snapshot().posts).toHaveLength(1); expect(f.provider.snapshot().commits).toHaveLength(1);
      expect((await f.run({ kind: "approval", approvalRequestId: p.approvalRequestId })).consumed!.executionId).toBe(executionId);
    });
  });
  test("expired provider key indexes use reference GET without treating absence as not_applied", async () => {
    await withFinanceTools(async f => {
      const { executionId, run } = await paid(f, true), key = run.execution!.idempotencyKey;
      expect((await f.provider.admin("POST", "/admin/expire-idempotency-keys", { tenantId: "tenant-a", idempotencyKey: key })).status).toBe(200);
      const before = requests(f), settled = await f.run({ kind: "reconcile", executionId });
      expect(settled.reconciliation).toMatchObject({ after: "completed", effect: "applied" });
      const reads = requests(f).slice(before.length);
      expect(reads.map(row => row.method)).toEqual(["GET", "GET"]);
      // The provider logs URL.pathname, not query strings. Keep exact request count/order and actual settlement identity.
      expect(reads.map(row => ({ path: row.path, clientId: row.clientId, tenantId: row.tenantId }))).toEqual([
        { path: "/v1/payments", clientId: "reader-a", tenantId: "tenant-a" },
        { path: "/v1/payments", clientId: "reader-a", tenantId: "tenant-a" }
      ]);
      expect(reads[0].requestId).not.toBe(reads[1].requestId);
      expect(Number(reads[0].seq)).toBeLessThan(Number(reads[1].seq));
      const snapshot = f.provider.snapshot();
      expect(snapshot.records.filter(row => row.kind === "admin" && row.action === "expire_idempotency_keys")).toMatchObject([
        { tenantId: "tenant-a", idempotencyKeys: [key] }
      ]);
      const committed = snapshot.commits[0].payment as Record<string, unknown>;
      expect(committed.idempotencyKey).toBe(key); expect(committed.reference).toBe("RF-1002");
      expect(settled.reconciliation).toMatchObject({ before: "outcome_unknown", mismatches: [],
        observation: { kind: "applied", externalRef: committed.paymentId } });
      expect(f.provider.snapshot().posts).toHaveLength(1); expect(f.provider.snapshot().commits).toHaveLength(1);
    });
  });
  test.each([
    { executionId: "exec_another" }, { idempotencyKey: "other_payment_key" }, { toolName: "finops_other_payment" },
    { argumentsDigest: "0".repeat(64) }, { bindings: { amount: { value: "999", currency: "USD" }, recipient: "payee-a-002",
      destination: financeProposalInput().destinationTokenSha256, resourceId: "payee-a-002", resourceVersion: "1" } },
    { startedAt: "2026-01-01T00:00:00.000Z" }
  ])("each query field is checked against the genuine signed journal: %j", async queryChanges => {
    await withFinanceTools(async f => {
      const { executionId } = await paid(f), before = requests(f);
      const refused = await f.run({ kind: "context", executionId, queryChanges });
      expect(refused.context).toBeNull(); expect(refused.observation!.kind).toBe("unknown");
      expect(requests(f)).toEqual(before); expect(f.provider.snapshot().posts).toHaveLength(1);
    });
  });
  test.each(["missing", "arguments", "record"] as const)("a %s preimage cannot replace actual durable authority", async tamper => {
    await withFinanceTools(async f => {
      const { executionId } = await paid(f); const mutation = await f.run({ kind: "tamper", executionId, tamper });
      expect(mutation.mutation!.beforeSha256).toMatch(/^[a-f0-9]{64}$/);
      const before = requests(f), refused = await f.run({ kind: "context", executionId });
      expect(refused.context).toBeNull(); expect(refused.observation!.kind).toBe("unknown"); expect(requests(f)).toEqual(before);
      expect(f.provider.snapshot().posts).toHaveLength(1); expect(f.provider.snapshot().commits).toHaveLength(1);
    });
  });
  test("an already-aborted cold query remains unknown without provider traffic", async () => {
    await withFinanceTools(async f => {
      const { executionId } = await paid(f), before = requests(f);
      const refused = await f.run({ kind: "context", executionId, aborted: true });
      expect(refused.context).toBeNull(); expect(refused.observation!.kind).toBe("unknown"); expect(requests(f)).toEqual(before);
    });
  });
});

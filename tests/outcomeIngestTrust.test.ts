import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initIntegrationsConfig } from "../src/integrations/integrationStore.js";
import { openLedger } from "../src/ledger/ledger.js";
import { outcomesAttestCli, outcomesInitCli } from "../src/outcomes/outcomeCli.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { getVaultSecret } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P0-18 step 4: outcome signals an operator types in, or a webhook reports, are SELF_REPORTED. AMC did not observe
 * them, and an operator's own signature is not an independent attestation.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE = "outcome-ingest-trust-test-passphrase";
  const dir = mkdtempSync(join(tmpdir(), "amc-outcome-trust-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function outcomeRows(dir: string): Array<{ metric_id: string; trust_tier: string; meta: Record<string, unknown> }> {
  const ledger = openLedger(dir);
  try {
    return ledger.getOutcomeEventsBetween(0, Date.now() + 60_000, "default")
      .map((row) => ({ metric_id: row.metric_id, trust_tier: row.trust_tier, meta: JSON.parse(row.meta_json) as Record<string, unknown> }));
  } finally {
    ledger.close();
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no test port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function post(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

describe("outcome ingestion trust tier", () => {
  test("amc outcomes attest records a self-attested SELF_REPORTED signal", () => {
    const dir = workspace();
    outcomesInitCli({ workspace: dir });
    const out = outcomesAttestCli({ workspace: dir, metricId: "functional.task_success_rate", value: "0.9", reason: "weekly review" });
    expect(out.trustTier).toBe("SELF_REPORTED");
    const row = outcomeRows(dir).find((candidate) => candidate.metric_id === "functional.task_success_rate");
    expect(row?.trust_tier).toBe("SELF_REPORTED");
    expect(row?.meta.attestation).toMatchObject({ kind: "self_attested" });
  });

  test("Studio operator and webhook ingestion return and store SELF_REPORTED", async () => {
    const dir = workspace();
    initIntegrationsConfig(dir);
    const secret = String(getVaultSecret(dir, "integrations/ops-webhook"));
    const token = "outcome-ingest-trust-token";
    const studio = await startStudioApiServer({ workspace: dir, host: "127.0.0.1", port: await freePort(), token });
    try {
      const operatorOutcome = await post(`${studio.url}/outcomes/ingest`,
        JSON.stringify({ agentId: "default", signalId: "operator.signal", category: "Functional", value: 1 }), { "x-amc-admin-token": token });
      const operatorFeedback = await post(`${studio.url}/feedback/ingest`, JSON.stringify({ agentId: "default", rating: 5 }), { "x-amc-admin-token": token });
      const webhookBody = JSON.stringify({ agentId: "default", signalId: "webhook.signal", category: "Functional", value: 1 });
      const webhookOutcome = await post(`${studio.url}/outcomes/ingest`, webhookBody,
        { "x-amc-signature": createHmac("sha256", secret).update(webhookBody, "utf8").digest("hex") });
      const feedbackBody = JSON.stringify({ agentId: "default", rating: 2 });
      const webhookFeedback = await post(`${studio.url}/feedback/ingest`, feedbackBody,
        { "x-amc-signature": createHmac("sha256", secret).update(feedbackBody, "utf8").digest("hex") });
      for (const [response, auth] of [[operatorOutcome, "session"], [operatorFeedback, "session"], [webhookOutcome, "webhook"], [webhookFeedback, "webhook"]] as const) {
        expect(response.status, JSON.stringify(response.json)).toBe(200);
        expect(response.json).toMatchObject({ trustTier: "SELF_REPORTED", auth });
      }
    } finally {
      await studio.close();
    }
    const rows = outcomeRows(dir);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.trust_tier === "SELF_REPORTED")).toBe(true);
    expect(rows.find((row) => row.metric_id === "operator.signal")?.meta.attestation).toEqual({ kind: "self_attested" });
    expect(rows.find((row) => row.metric_id === "webhook.signal")?.meta.attestation).toEqual({ kind: "external_report" });
    expect(rows.filter((row) => row.metric_id === "feedback.rating").map((row) => (row.meta.attestation as { kind: string }).kind).sort())
      .toEqual(["external_report", "self_attested"]);
  }, 60_000);
});

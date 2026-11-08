import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runAssurance } from "../src/assurance/assuranceRunner.js";
import { runRedTeam } from "../src/redteam/runner.js";
import { redTeamReportsDir, verifyRedTeamReportFile } from "../src/redteam/redteamStore.js";
import { admitGatewayReceipt } from "../src/assurance/assurancePackExecution.js";
import { assuranceReportProvenance } from "../src/assurance/reportProvenance.js";
import { eventMeta } from "../src/claims/evidenceProvenance.js";
import { openLedger } from "../src/ledger/ledger.js";
import { mintReceipt } from "../src/receipts/receipt.js";
import { sha256Hex } from "../src/utils/hash.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * fix3 S12: a gateway receipt is verified when the reply arrives. A receipt that does not verify is audited and dropped,
 * never stored and never a reason to refuse the report later, so the agent under test cannot suppress its own
 * assurance evidence by answering with a bad receipt. Only an admitted receipt becomes `correlatedRequestIds`.
 */
const FORGED = "eyJmb3JnZWQiOnRydWV9.c2lnbmF0dXJl";
let fakeAgent: FakeAgentServer;
let restoreEnv: () => void;
const roots: string[] = [];

beforeAll(async () => {
  fakeAgent = await startFakeAgentServer({ headers: { "x-amc-request-receipt": FORGED, "x-amc-receipt": FORGED } });
  restoreEnv = useFakeAgentEnv(fakeAgent.baseUrl);
});
afterAll(async () => { restoreEnv(); await fakeAgent.close(); });
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-receipt-admission-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "receipt-admission-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const pem = (key: ReturnType<typeof generateKeyPairSync>["publicKey"]) => key.export({ type: "spki", format: "pem" }).toString();
function mint(privateKeyPem: string, agentId: string): string {
  return mintReceipt({ kind: "llm_request", ts: Date.now(), agentId, providerId: "gateway", model: "fake-model", eventHash: sha256Hex("event"),
    bodySha256: sha256Hex("body"), sessionId: "gw-session", privateKeyPem }).receipt;
}

describe("gateway receipt admission", () => {
  test("admits only a receipt one of the workspace keys verifies that names the agent under test", () => {
    const signer = generateKeyPairSync("ed25519"), other = generateKeyPairSync("ed25519");
    const keys = [pem(signer.publicKey)];
    const good = mint(signer.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "default");
    expect(admitGatewayReceipt(good, keys, "default")).toMatchObject({ admitted: { receipt: good, receiptId: expect.any(String) }, rejected: null });
    expect(admitGatewayReceipt(undefined, keys, "default")).toEqual({ admitted: null, rejected: null });
    expect(admitGatewayReceipt(FORGED, keys, "default")).toMatchObject({ admitted: null, rejected: expect.stringMatching(/does not verify/) });
    const stranger = mint(other.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "default");
    expect(admitGatewayReceipt(stranger, keys, "default")).toMatchObject({ admitted: null, rejected: expect.stringMatching(/does not verify/) });
    expect(admitGatewayReceipt(good, keys, "someone-else")).toMatchObject({ admitted: null, rejected: "gateway request receipt names another agent" });
    expect(admitGatewayReceipt(good, [], "default")).toMatchObject({ admitted: null, rejected: expect.stringMatching(/does not verify/) });
  });

  test("a forged receipt from the agent under test is audited and dropped; the run is still graded and its provenance holds", async () => {
    const ws = workspace();
    const report = await runAssurance({ workspace: ws, agentId: "default", packId: "injection", mode: "supervise", window: "7d" });
    const pack = report.packResults[0]!;
    const graded = pack.scenarioResults.filter((row) => row.inconclusive !== true);
    expect(graded.length).toBeGreaterThan(0);
    expect(fakeAgent.prompts.length).toBeGreaterThan(0);
    // Nothing of the forged receipt reaches the row or the ledger.
    expect(pack.scenarioResults.every((row) => row.correlatedRequestIds.length === 0)).toBe(true);
    const ledger = openLedger(ws);
    try {
      const rows = ledger.getAllEvents().filter((event) => event.session_id === report.sessionId);
      const stdout = rows.filter((event) => event.event_type === "stdout");
      expect(stdout.length).toBe(pack.scenarioResults.length);
      expect(stdout.every((event) => eventMeta(event).requestReceipt === undefined && eventMeta(event).responseReceipt === undefined)).toBe(true);
      const rejected = rows.filter((event) => eventMeta(event).auditType === "ASSURANCE_RECEIPT_REJECTED");
      expect(rejected.length).toBe(pack.scenarioResults.length);
      expect(rejected.every((event) => !JSON.stringify(eventMeta(event)).includes(FORGED))).toBe(true);
    } finally { ledger.close(); }
    // The graded result counts: the gate judges the stdin/stdout/test triple, never the receipt.
    expect(assuranceReportProvenance(ws, report as unknown as Record<string, unknown>)).toEqual({ ok: true });
  }, 120_000);

  test("a signed red-team run drops and audits the forged receipt the same way; the run still verifies", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
    expect(report.verification.status).toBe("SIGNED_VALID");
    const rows = report.pluginResults[0]!.scenarioResults;
    expect(rows.every((row) => row.correlatedRequestIds.length === 0)).toBe(true);
    const ledger = openLedger(ws);
    try {
      const session = ledger.getAllEvents().filter((event) => event.session_id === report.sessionId);
      const stdout = session.filter((event) => event.event_type === "stdout");
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout.every((event) => eventMeta(event).requestReceipt === undefined && eventMeta(event).responseReceipt === undefined)).toBe(true);
      const rejected = session.filter((event) => eventMeta(event).auditType === "ASSURANCE_RECEIPT_REJECTED");
      expect(rejected.length).toBe(stdout.length);
      expect(rejected.every((event) => eventMeta(event).source === "redteam" && !JSON.stringify(eventMeta(event)).includes(FORGED))).toBe(true);
    } finally { ledger.close(); }
    expect(verifyRedTeamReportFile(ws, join(redTeamReportsDir(ws, "default"), `${report.runId}.json`))).toMatchObject({ ok: true });
  }, 120_000);
});

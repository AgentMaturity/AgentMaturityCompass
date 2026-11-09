import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runAssurance } from "../src/assurance/assuranceRunner.js";
import { runRedTeam } from "../src/redteam/runner.js";
import { redTeamReportsDir, verifyRedTeamReportFile } from "../src/redteam/redteamStore.js";
import { admitGatewayReceipts, RECEIPT_CLOCK_SKEW_MS } from "../src/assurance/gatewayReceiptAdmission.js";
import { assuranceReportProvenance } from "../src/assurance/reportProvenance.js";
import { eventMeta } from "../src/claims/evidenceProvenance.js";
import { getSigningKey } from "../src/keys/signingKeys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { mintReceipt, parseReceipt } from "../src/receipts/receipt.js";
import type { EvidenceEvent } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * fix3 S12, S12c and S12d: gateway receipts are judged when the reply arrives. A receipt is stored only when it is bound to
 * the exchange AMC itself sent and received (signature, kind, agent, body digest, mint time, gateway session, unused in
 * the run); a forged or replayed one is audited and dropped, never stored and never a reason to refuse the report later,
 * so the agent under test can neither suppress its own evidence nor pass a direct exchange off as gateway-captured.
 * Only a verified pair supplies `correlatedRequestIds`. A request alone records only that the gateway saw it.
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

const pem = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const privatePem = (key: KeyObject) => key.export({ type: "pkcs8", format: "pem" }).toString();
type Kind = "llm_request" | "llm_response";
function mint(privateKeyPem: string, kind: Kind, body: string, over: { agentId?: string; ts?: number; sessionId?: string } = {}): string {
  return mintReceipt({ kind, ts: over.ts ?? Date.now(), agentId: over.agentId ?? "default", providerId: "gateway", model: "fake-model",
    eventHash: sha256Hex(`event-${body}`), bodySha256: sha256Hex(body), sessionId: over.sessionId ?? "gw-session", privateKeyPem }).receipt;
}
const receiptId = (receipt: string) => parseReceipt(receipt).payload.receipt_id;
const stdoutRows = (rows: EvidenceEvent[]) => rows.filter((event) => event.event_type === "stdout");
const rejections = (rows: EvidenceEvent[]) => rows.filter((event) => eventMeta(event).auditType === "ASSURANCE_RECEIPT_REJECTED").map((event) => String(eventMeta(event).message));

describe("gateway receipt admission", () => {
  test("admits a request and response receipt only when each is bound to this exchange", () => {
    const signer = generateKeyPairSync("ed25519"), other = generateKeyPairSync("ed25519");
    const keys = [pem(signer.publicKey)], key = privatePem(signer.privateKey);
    const now = Date.now();
    const wire = { requestSha256: sha256Hex("request-body"), responseSha256: [sha256Hex("raw response"), sha256Hex("response-body")], sentTs: now - 50, receivedTs: now + 50 };
    const request = mint(key, "llm_request", "request-body"), response = mint(key, "llm_response", "response-body");
    const admit = (answer: Parameters<typeof admitGatewayReceipts>[0], seen = new Set<string>(), agentId = "default") => admitGatewayReceipts(answer, keys, agentId, seen);

    const seen = new Set<string>();
    expect(admit({ receiptId: request, responseReceipt: response, wire }, seen)).toEqual({ request: { receipt: request, receiptId: receiptId(request) }, response, requestSeenOnly: null, rejected: [] });
    expect([...seen].sort()).toEqual([receiptId(request), receiptId(response)].sort());
    expect(admit({ wire })).toEqual({ request: null, response: null, requestSeenOnly: null, rejected: [] });
    expect(admit({ receiptId: request, wire })).toEqual({ request: null, response: null, requestSeenOnly: request, rejected: [] });
    // Forged, or signed by a key this workspace does not hold.
    expect(admit({ receiptId: FORGED, wire }).rejected).toEqual([expect.stringMatching(/^gateway request receipt does not verify/)]);
    expect(admit({ receiptId: mint(privatePem(other.privateKey), "llm_request", "request-body"), wire }).rejected).toEqual([expect.stringMatching(/does not verify/)]);
    expect(admitGatewayReceipts({ receiptId: request, wire }, [], "default", new Set()).rejected).toEqual([expect.stringMatching(/does not verify/)]);
    // The reason is AMC's own words: nothing the agent under test put in the header is echoed into the audit row.
    for (const body of ["AGENT-CHOSEN-TEXT is not JSON", JSON.stringify({ v: 1, kind: "AGENT-CHOSEN-TEXT" })]) {
      const planted = `${Buffer.from(body).toString("base64url")}.c2ln`;
      expect(admit({ receiptId: planted, wire }).rejected).toEqual(["gateway request receipt does not verify against this workspace's receipt keys"]);
    }
    // Genuine, but not this exchange's: another agent, another request body (a replay), minted outside the exchange, the wrong kind.
    expect(admit({ receiptId: request, wire }, new Set(), "someone-else").rejected).toEqual(["gateway request receipt names another agent"]);
    expect(admit({ receiptId: mint(key, "llm_request", "an earlier request"), wire }).rejected).toEqual(["gateway request receipt does not commit to the bytes of this exchange"]);
    expect(admit({ receiptId: mint(key, "llm_request", "request-body", { ts: now - RECEIPT_CLOCK_SKEW_MS - 1_000 }), wire }).rejected)
      .toEqual(["gateway request receipt was not minted while this exchange was in flight"]);
    expect(admit({ receiptId: response, wire }).rejected).toEqual(["gateway request receipt is a llm_response receipt"]);
    // A response receipt from another gateway session, over other bytes, or with no admitted request receipt.
    expect(admit({ receiptId: request, responseReceipt: mint(key, "llm_response", "response-body", { sessionId: "gw-other" }), wire }))
      .toEqual({ request: null, response: null, requestSeenOnly: request, rejected: ["gateway response receipt names another gateway session than its request receipt"] });
    expect(admit({ receiptId: request, responseReceipt: mint(key, "llm_response", "another reply"), wire }))
      .toEqual({ request: null, response: null, requestSeenOnly: request, rejected: ["gateway response receipt does not commit to the bytes of this exchange"] });
    expect(admit({ receiptId: FORGED, responseReceipt: response, wire }).rejected)
      .toEqual([expect.stringMatching(/^gateway request receipt does not verify/), "gateway response receipt has no admitted request receipt"]);
    // One receipt binds one exchange of a run; and a responder that reports no wire digests can bind nothing.
    expect(admit({ receiptId: request, wire }, seen).rejected).toEqual(["gateway request receipt is already bound to another exchange of this run"]);
    expect(admit({ receiptId: request }).rejected).toEqual(["gateway request receipt does not commit to the bytes of this exchange"]);
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

  test("only a bound receipt pair correlates an assurance reply, even when another request is verified (S12c, S12d)", async () => {
    const ws = workspace();
    const key = getSigningKey(ws, "receipt");
    const exchanges: Array<{ request: string; response: string }> = [];
    // A gateway signs the request body it received and the response body as its redaction pass re-serializes it.
    const agent = await startFakeAgentServer({ pretty: true, headers: ({ requestBody, responseBody }) => {
      const bound = { request: mint(key, "llm_request", requestBody), response: mint(key, "llm_response", JSON.stringify(JSON.parse(responseBody))) };
      exchanges.push(bound);
      // Exchange 1: its own pair. Exchange 2: its own request receipt beside exchange 1's response receipt.
      // Exchange 3: its own request receipt alone. Later: exchange 1's pair replayed.
      if (exchanges.length === 3) return { "x-amc-request-receipt": bound.request, "x-amc-receipt": "" };
      const sent = exchanges.length === 1 ? bound : exchanges.length === 2 ? { request: bound.request, response: exchanges[0]!.response } : exchanges[0]!;
      return { "x-amc-request-receipt": sent.request, "x-amc-receipt": sent.response };
    } });
    const restore = useFakeAgentEnv(agent.baseUrl);
    try {
      const report = await runAssurance({ workspace: ws, agentId: "default", packId: "injection", mode: "supervise", window: "7d" });
      const rows = report.packResults[0]!.scenarioResults;
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(exchanges.length).toBe(rows.length);
      expect(rows[0]!.correlatedRequestIds).toEqual([receiptId(exchanges[0]!.request)]);
      expect(rows.slice(1).every((row) => row.correlatedRequestIds.length === 0)).toBe(true);
      const ledger = openLedger(ws);
      try {
        const session = ledger.getAllEvents().filter((event) => event.session_id === report.sessionId);
        const stdout = stdoutRows(session).map((event) => eventMeta(event));
        expect(stdout[0]).toMatchObject({ requestReceipt: exchanges[0]!.request, responseReceipt: exchanges[0]!.response });
        expect(stdout[0]!.requestSeenOnly).toBeUndefined();
        expect(stdout[1]!.requestSeenOnly).toBe(exchanges[1]!.request);
        expect(stdout[2]!.requestSeenOnly).toBe(exchanges[2]!.request);
        expect(stdout.slice(1).every((meta) => meta.requestReceipt === undefined && meta.responseReceipt === undefined)).toBe(true);
        expect(stdout.slice(3).every((meta) => meta.requestSeenOnly === undefined)).toBe(true);
        const rejected = rejections(session);
        expect(rejected.length).toBe(rows.length - 2);
        // The fake agent's reply is the same bytes every time, so the body digest alone cannot tell the replay apart: the
        // run's own record of bound receipts does.
        expect(rejected[0]).toBe("Gateway receipt rejected: gateway response receipt is already bound to another exchange of this run");
        expect(rejected.slice(1).every((message) => /gateway request receipt (does not commit to the bytes of this exchange|is already bound)/.test(message)
          && message.includes("gateway response receipt has no admitted request receipt"))).toBe(true);
      } finally { ledger.close(); }
      expect(assuranceReportProvenance(ws, report as unknown as Record<string, unknown>)).toEqual({ ok: true });
    } finally { restore(); await agent.close(); }
  }, 120_000);

  test("a signed red-team run records a verified request with a forged response as request-only evidence (S12d)", async () => {
    const ws = workspace();
    const key = getSigningKey(ws, "receipt");
    const agent = await startFakeAgentServer({ headers: ({ requestBody }) => ({ "x-amc-request-receipt": mint(key, "llm_request", requestBody), "x-amc-receipt": FORGED }) });
    const restore = useFakeAgentEnv(agent.baseUrl);
    try {
      const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
      expect(report.verification.status).toBe("SIGNED_VALID");
      expect(report.pluginResults[0]!.scenarioResults.every((row) => row.correlatedRequestIds.length === 0)).toBe(true);
      const ledger = openLedger(ws);
      try {
        const session = ledger.getAllEvents().filter((event) => event.session_id === report.sessionId);
        const stdout = stdoutRows(session).map((event) => eventMeta(event));
        expect(stdout.length).toBeGreaterThan(0);
        expect(stdout.every((meta) => typeof meta.requestSeenOnly === "string" && meta.requestReceipt === undefined && meta.responseReceipt === undefined)).toBe(true);
        const rejected = rejections(session);
        expect(rejected.length).toBe(stdout.length);
        expect(rejected.every((message) => /^Gateway receipt rejected: gateway response receipt does not verify/.test(message))).toBe(true);
      } finally { ledger.close(); }
      expect(verifyRedTeamReportFile(ws, join(redTeamReportsDir(ws, "default"), `${report.runId}.json`))).toMatchObject({ ok: true });
    } finally { restore(); await agent.close(); }
  }, 120_000);
});

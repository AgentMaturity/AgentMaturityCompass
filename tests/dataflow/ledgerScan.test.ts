import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openAgentSession, type AgentSession } from "../../src/agent/agentSession.js";
import { credentialRef } from "../../src/credentials/credentialRef.js";
import { DETECTOR_SET_DIGEST } from "../../src/dataflow/detectors.js";
import { initProcessorRegistry } from "../../src/dataflow/processorRegistry.js";
import { redactingSessionFor } from "../../src/dataflow/redactingSession.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { readEventPayload } from "../../src/session/eventPayload.js";
import { SessionService } from "../../src/session/sessionService.js";
import type { EvidenceEvent } from "../../src/types.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "../helpers/agentLoopHarness.js";

/**
 * P2-02 ledger scan (issue table, row 1): in an opted-in workspace, the composed native session tokenizes a user message
 * and a tool result holding an MRN, a card number, an SSN and an email before any row is committed, so no row's metadata
 * or payload (decrypted) and no file in the workspace holds a planted value, and each redaction leaves a
 * PROTECTED_DATA_REDACTED receipt with classes, detectors, counts and the redacted text's digest only. The same flow in a
 * workspace that has not opted in stores the values, so the scan sees what it is looking for.
 */
const PLANTED = { mrn: "A7781234", card: "4111111111111111", ssn: "219-09-9999", email: "odalys.fenwick@example.com" } as const;
const MESSAGE = `Patient MRN: ${PLANTED.mrn}, card ${PLANTED.card}, SSN ${PLANTED.ssn}, reach ${PLANTED.email}.`;
const TOOL_RECORD = JSON.stringify({ patient: { medicalRecordNumber: PLANTED.mrn, ssn: PLANTED.ssn }, billing: { card: PLANTED.card } });
const BASE_URL = "https://api.anthropic.invalid";

const dirs: string[] = [], sessions: AgentSession[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) { try { session.close(); } catch { /* closed */ } }
  for (const dir of dirs.splice(0)) { try { lockVault(dir); } catch { /* no vault */ } rmSync(dir, { recursive: true, force: true }); }
});

function workspace(optIn: boolean): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-ledger-scan-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  // A BAA route for every class, so the next model request, which carries the PHI token, is admitted.
  if (optIn) initProcessorRegistry(dir, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
    processors: [{ processorId: "proc-care", legalName: "Fixture Care Processor",
      contracts: [{ kind: "BAA", reference: "BAA-CARE-1", effective: "2026-01-01", expires: null, dataClasses: ["phi", "pii", "card_number", "credential"] }] }],
    purposes: [{ purposeId: "care", allowedDataClasses: ["phi", "pii", "card_number", "credential"], allowedTools: ["model.request"], allowedProcessors: ["proc-care"] }],
    bindings: [{ providerId: LOOP_PROVIDER, baseUrl: BASE_URL, processorId: "proc-care", purposeId: "care" }] });
  return dir;
}
function composed(dir: string): AgentSession {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("Noted.")]), baseUrl: BASE_URL,
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  let clock = 1_000;
  const session = openAgentSession({ workspace: dir, agentId: "default",
    makeLlm: (writer) => new LlmRuntime({ session: writer, credentials: new FixedCredentials(), registry, transport: silentTransport, now: () => (clock += 5) }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, systemPrompt: "You are a careful assistant.",
    harnessVersion: "3.2.0", compositionDigest: "composition-digest", policyDigest: "policy-digest" });
  sessions.push(session);
  return session;
}
/** A tool result committed through the composition's wrapper, as a native tool's output is. */
function recordToolResult(dir: string): void {
  const writer = redactingSessionFor(new SessionService(dir));
  try {
    writer.open({ agentId: "default", harnessVersion: "ledger-scan", compositionDigest: "ledger-scan", policyDigest: "ledger-scan" });
    writer.startTurn({ trigger: "user" }); writer.startStep();
    writer.recordToolCall({ toolCallId: "ehr-1", toolName: "ehr.lookup", args: "{}", dispatch: "native", parentToken: null });
    writer.recordToolResult({ toolCallId: "ehr-1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: TOOL_RECORD });
  } finally { writer.disposeWithoutClosing(); }
}
function rows(dir: string): readonly EvidenceEvent[] {
  const reader = openSessionEventStore(dir, undefined, { readOnly: true });
  try { return [...reader.readAllEvents()]; } finally { reader.close(); }
}
/** Every row's metadata and decrypted payload. */
function committedText(dir: string): string {
  return rows(dir).map(event => { const read = readEventPayload(dir, event);
    return `${event.meta_json}\n${read.status === "ok" ? read.bytes.toString("utf8") : ""}`; }).join("\n");
}
function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap(name => { const path = join(root, name); return lstatSync(path).isDirectory() ? files(path) : [path]; });
}
const plantedIn = (text: string) => Object.values(PLANTED).filter(value => text.includes(value));
const filesHolding = (dir: string) => files(dir).filter(path => { const bytes = readFileSync(path); return Object.values(PLANTED).some(value => bytes.includes(value)); });

describe("the ledger scan", () => {
  test("an opted-in workspace commits tokens only, and receipts name classes and counts", async () => {
    const dir = workspace(true);
    const session = composed(dir);
    expect(await session.prompt(MESSAGE)).toMatchObject({ ok: true });
    session.close();
    recordToolResult(dir);

    const committed = committedText(dir);
    expect(plantedIn(committed)).toEqual([]);
    expect(filesHolding(dir)).toEqual([]);
    expect(committed).toMatch(/\[\[amc:card_number:[0-9a-f]{16}\]\]/);
    expect(committed).toMatch(/\[\[amc:phi:[0-9a-f]{16}\]\]/);

    const receipts = rows(dir).map(event => JSON.parse(event.meta_json) as Record<string, unknown>).filter(meta => meta.auditType === "PROTECTED_DATA_REDACTED");
    expect(receipts.map(meta => meta.redactionSource).sort()).toEqual(["loop/inbox", "tool/result", "user/message"]);
    for (const meta of receipts) {
      expect(meta).toMatchObject({ detectorsVersion: DETECTOR_SET_DIGEST, redactedDigest: expect.stringMatching(/^[0-9a-f]{64}$/), declaredFields: [] });
      for (const finding of meta.findings as { dataClass: string; detector: string; count: number }[]) {
        expect(Object.keys(finding).sort()).toEqual(["count", "dataClass", "detector"]);
        expect(finding.count).toBeGreaterThan(0);
      }
    }
    const classes = (source: string) => [...new Set((receipts.find(meta => meta.redactionSource === source)!.findings as { dataClass: string }[])
      .map(finding => finding.dataClass))].sort();
    expect(classes("user/message")).toEqual(["card_number", "phi", "pii"]);
    expect(classes("tool/result")).toEqual(["card_number", "phi", "pii"]);
    // The model request was admitted under the bound processor; its row carries classes and counts, never content.
    const detected = rows(dir).map(event => JSON.parse(event.meta_json) as Record<string, unknown>).filter(meta => meta.auditType === "PROTECTED_DATA_DETECTED");
    for (const meta of detected) expect(meta).toMatchObject({ processorId: "proc-care", detectorSetDigest: DETECTOR_SET_DIGEST });
  });

  test("a workspace that has not opted in stores the values, so the scan sees them", async () => {
    const dir = workspace(false);
    const session = composed(dir);
    expect(await session.prompt(MESSAGE)).toMatchObject({ ok: true });
    session.close();
    recordToolResult(dir);
    expect(plantedIn(committedText(dir)).sort()).toEqual(Object.values(PLANTED).sort());
    expect(rows(dir).some(event => event.meta_json.includes("PROTECTED_DATA_REDACTED"))).toBe(false);
  });
});

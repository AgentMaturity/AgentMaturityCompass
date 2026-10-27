import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { verifyMonitorTrustRoot } from "../../src/persistence/sessionStoreVerification.js";
import { readEventRows } from "../../src/persistence/jsonl/jsonlEventLog.js";
import { SessionService } from "../../src/session/sessionService.js";
import { prepareRequest, ANTHROPIC_MESSAGES_ENCODER_ID } from "../../src/llm/index.js";
import { verifyAgentRun } from "../../src/agent/runReport.js";
import { nativeEvidenceVerdict } from "../../src/studio/nativeTaskVerdict.js";
import { withPins } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { pinnedTrust } from "../helpers/trustContext.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const PASS = "owned-unbound-jsonl-compatibility";
const roots: Array<{ root: string; workspace: string }> = [];
const services: SessionService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.disposeWithoutClosing();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-unbound-jsonl-compat-")), workspace = join(root, "workspace"), home = join(root, "operator");
  mkdirSync(home); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", ""); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  vi.stubEnv("AMC_SESSION_STORE", "jsonl");
  return { root, workspace };
}
function recordJsonl(workspace: string) {
  const service = new SessionService(workspace, openSessionEventStore(workspace, "jsonl")); services.push(service);
  service.open({ agentId: "default", harnessVersion: "owned-jsonl-compat", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
  const sessionId = service.sessionId, system = service.recordSystemPrompt("Owned deterministic request reconstruction.");
  service.startTurn({ trigger: "user" }); service.recordUserMessage("Reconstruct this locally prepared request."); service.startStep();
  // The actual public encoder commits bytes to a real signed request/header; no provider network is contacted.
  const prepared = prepareRequest(service, { model: "owned-local-model", providerId: "anthropic", encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
    encoderVersion: 1, params: { max_tokens: 64, temperature: 0 }, systemPromptEventId: system.eventId, tools: [] });
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "Owned synthetic answer.", stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn(); service.close({ reason: "completed" });
  expect(readEventRows(workspace).filter(row => row.event_type === "request/header")).toHaveLength(1);
  return { sessionId, headerEventId: prepared.headerEventId };
}

test("actual unbound JSONL run keeps intrinsic integrity but remains UNTRUSTED under an empty external context", async () => {
  const f = fixture(); expect(boundProviderKey(f.workspace, "ledger-row")).toBeNull();
  const recorded = recordJsonl(f.workspace), empty = pinnedTrust([]);
  const report = await verifyAgentRun(f.workspace, recorded.sessionId, empty);
  expect(report).toMatchObject({ ok: false, ledgerOk: true, integrityOk: true, sessionChainErrors: [], unsignedRowIds: [], trustRoot: { anchored: false, monitorAdmission: { status: "not-pinned" } } });
  expect(report.requests).toEqual([expect.objectContaining({ headerEventId: recorded.headerEventId, status: "reconstructed" })]);
  expect(nativeEvidenceVerdict(report)).toMatchObject({ verification: "failed", error: expect.stringContaining("UNTRUSTED: the recorded evidence is internally consistent") });
});

test("actual provider-bound JSONL run still refuses empty external context and requires its independent issuer pin", async () => {
  const f = fixture(), key = fakeKey("p256"), arn = AWS_ARN("jsonl-empty-context-control"), fake = awsFake({ [arn]: key }), pem = publicPem(key);
  // Independently owned provider key and operator pin precede binding and recorded artifacts.
  const pin = { keyId: signingKeyId(pem)!, purposes: ["ledger-row"] as const, origin: "owned operator JSONL admission" };
  const configPath = join(f.workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(configPath, "utf8"));
  config.keys = { refs: { "ledger-row": { provider: "aws-kms", id: arn } } }; writeFileSync(configPath, YAML.stringify(config)); signAmcConfig(f.workspace);
  const binding = await bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: awsKmsProvider(fake.call), delegation: { maxEvents: 10_000 } });
  const recorded = recordJsonl(f.workspace);
  expect(readEventRows(f.workspace).some(row => JSON.parse(row.meta_json).amcKeyDelegation?.sha256 === binding.delegationSha256)).toBe(true);
  const empty = pinnedTrust([]), rootErrors: string[] = [];
  expect(verifyMonitorTrustRoot(f.workspace, null, rootErrors, empty)).toMatchObject({ anchored: false });
  expect(rootErrors).toEqual(["trust root: ledger issuer not-pinned"]);
  const refused = await verifyAgentRun(f.workspace, recorded.sessionId, empty);
  expect(refused).toMatchObject({ ok: false, integrityOk: false, ledgerOk: false, trustRoot: { anchored: false } });
  expect(refused.ledgerErrors.join("; ")).toMatch(/issuer.*not-pinned/);
  expect(nativeEvidenceVerdict(refused)).toMatchObject({ verification: "failed" });
  const admittedTrust = withPins(pinnedTrust([]), [pin]), admittedRootErrors: string[] = [];
  expect(verifyMonitorTrustRoot(f.workspace, null, admittedRootErrors, admittedTrust)).toMatchObject({ anchored: true });
  expect(admittedRootErrors).toEqual([]);
  const admitted = await verifyAgentRun(f.workspace, recorded.sessionId, admittedTrust);
  expect(admitted).toMatchObject({ ok: true, integrityOk: true, ledgerOk: true, trustRoot: { anchored: true, monitorAdmission: { status: "admitted" } } });
  expect(admitted.requests).toEqual([expect.objectContaining({ headerEventId: recorded.headerEventId, status: "reconstructed" })]);
});

test("unbound JSONL explicit fingerprint mismatch still fails actual run integrity", async () => {
  const f = fixture(), recorded = recordJsonl(f.workspace);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "0".repeat(64));
  const refused = await verifyAgentRun(f.workspace, recorded.sessionId, pinnedTrust([]));
  expect(refused).toMatchObject({ ok: false, integrityOk: false, ledgerOk: false });
  expect(refused.ledgerErrors.join("; ")).toContain("does not match the expected");
  expect(nativeEvidenceVerdict(refused)).toMatchObject({ verification: "failed" });
});

test("unbound JSONL explicit operator distrust still refuses a matching independently recorded fingerprint", async () => {
  const f = fixture(), pem = readFileSync(join(f.workspace, ".amc", "keys", "monitor_ed25519.pub"), "utf8"), keyId = signingKeyId(pem)!;
  // Record the operator pin before the session artifacts; matching bytes never override explicit distrust.
  const trusted = pinnedTrust([{ publicKeyPem: pem, purposes: ["ledger-row"] }]);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", sha256Hex(Buffer.from(pem, "utf8")));
  const recorded = recordJsonl(f.workspace);
  expect((await verifyAgentRun(f.workspace, recorded.sessionId, trusted))).toMatchObject({ ok: true, integrityOk: true });
  const deniedTrust = { ...trusted, asOf: new Date(), distrust: [{
    keyId, distrustedFrom: null, reason: "key-compromise", note: "owned operator explicit refusal", source: "owned JSONL trust boundary"
  }] } as const;
  const rootErrors: string[] = [];
  expect(verifyMonitorTrustRoot(f.workspace, sha256Hex(Buffer.from(pem, "utf8")), rootErrors, deniedTrust))
    .toMatchObject({ anchored: false });
  expect(rootErrors).toEqual(["trust root: ledger issuer distrusted"]);
  const denied = await verifyAgentRun(f.workspace, recorded.sessionId, deniedTrust);
  expect(denied.ok).toBe(false);
  expect(denied.integrityOk).toBe(false);
  expect(denied).toMatchObject({ ok: false, integrityOk: false, ledgerOk: false, trustRoot: { anchored: false, monitorAdmission: { status: "distrusted" } } });
  expect(denied.ledgerErrors).toContain("trust root: ledger issuer distrusted");
  expect(nativeEvidenceVerdict(denied)).toMatchObject({ verification: "failed" });
});

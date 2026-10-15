import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { handleCryptoRoute } from "../src/api/cryptoRouter.js";
import { handleEnforceRoute } from "../src/api/enforceRouter.js";
import { handlePassportRoute } from "../src/api/passportRouter.js";
import { boundedModelCheck, verifyCertificate } from "../src/enforce/formalVerification.js";
import { issueTrustToken, verifyTrustToken } from "../src/passport/trustInterchange.js";
import { appendTransparencyEntry } from "../src/transparency/logChain.js";
import { exportTransparencyProofBundle } from "../src/transparency/merkleIndexStore.js";
import { verifierReportSchema } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { workspaceKeyPem } from "./helpers/trustContext.js";
import { distrustEntry, listEntry, rawSignature, testKey, trustList, type TestKey } from "./trust/trustFixtures.js";
import type { NativeTaskActor, NativeTaskService, NativeTaskView } from "../src/studio/nativeTaskTypes.js";

const fields = ["pubkey", "pubkeyPath", "pubkeyPemFile", "publicKey", "publicKeyPath", "publicKeyPem", "trust", "trustList",
  "trustLists", "trustRoot", "trustRoots", "allowUnpinned", "allowUnanchored", "expectMonitor", "expectedMonitorFingerprint"] as const;
const roots: string[] = [];
const services: NativeTaskService[] = [];
const records: Array<Record<string, unknown>> = [];
const passphrase = "p0-51-server-fixture-passphrase";
const original = { home: process.env.AMC_HOME, monitor: process.env.AMC_EXPECTED_MONITOR_FINGERPRINT,
  pass: process.env.AMC_VAULT_PASSPHRASE, checkpoints: process.env.AMC_CONTROL_CHECKPOINT_DIR };
const responseSchema = z.object({ ok: z.boolean(), error: z.string().optional(), data: z.record(z.string(), z.unknown()).optional() });
let workspace: string, operatorHome: string, proofFile: string;
let certificate: ReturnType<typeof boundedModelCheck>["certificates"][number];
let token: ReturnType<typeof issueTrustToken>;
let createService: typeof import("../src/studio/nativeTaskService.js").createNativeTaskService;

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-server-verifier-"));
  roots.push(root);
  return root;
}

function signedList(home: string, issuer: Pick<TestKey, "keyId" | "publicKeyPem">, purpose: "artifact-seal" | "ledger-row", root: TestKey,
  distrusted = false): string {
  const now = Date.now();
  const list = trustList([listEntry({ ...issuer, privateKeyPem: "not-used" }, { purposes: [purpose],
    validFrom: new Date(now - 3_600_000).toISOString(), validTo: null })], { listId: "server-fixture", issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(), distrust: distrusted ? [distrustEntry(issuer.keyId)] : [] });
  mkdirSync(join(home, "trust"), { recursive: true, mode: 0o700 });
  const file = join(home, "trust", "amc-trust-list.json");
  writeFileSync(file, JSON.stringify({ list, signatures: [rawSignature(list, root)] }), { mode: 0o600 });
  writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [root.keyId] }), { mode: 0o600 });
  return file;
}

type Handler = (pathname: string, method: string, req: IncomingMessage, res: ServerResponse, workspace?: string) => Promise<boolean>;
async function route(handler: Handler, pathname: string, body: Record<string, unknown>, label: string) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", url: pathname,
    headers: { "content-type": "application/json" } });
  const statuses: number[] = [], headers: unknown[] = [], bodies: string[] = [];
  const res = { writeHead: (status: number, value: unknown) => { statuses.push(status); headers.push(value); },
    end: (value: unknown) => { bodies.push(String(value)); } } as unknown as ServerResponse;
  expect(await handler(pathname, "POST", req as unknown as IncomingMessage, res, workspace)).toBe(true);
  expect(statuses).toHaveLength(1); expect(bodies).toHaveLength(1);
  expect(headers).toEqual([{ "Content-Type": "application/json" }]);
  const result = { status: statuses[0]!, body: responseSchema.parse(JSON.parse(bodies[0]!)) };
  records.push({ kind: "actual-handler", label, pathname, ...result });
  return result;
}

beforeAll(async () => {
  process.env.AMC_VAULT_PASSPHRASE = passphrase;
  delete process.env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  const root = fixtureRoot(); workspace = join(root, "workspace"); operatorHome = join(root, "operator-home");
  process.env.AMC_CONTROL_CHECKPOINT_DIR = join(root, "control-checkpoints");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const auditorPem = workspaceKeyPem(workspace, "auditor");
  signedList(operatorHome, { publicKeyPem: auditorPem, keyId: sha256Hex(auditorPem) }, "artifact-seal", testKey());
  process.env.AMC_HOME = operatorHome;
  const entry = appendTransparencyEntry({ workspace, type: "BOM_SIGNED", agentId: "default",
    artifact: { kind: "bom", sha256: sha256Hex("owned server fixture BOM"), id: "server-fixture" } });
  proofFile = exportTransparencyProofBundle({ workspace, entryHash: entry.hash,
    outFile: join(workspace, ".amc", "transparency", "proofs", "server.amcproof") }).outFile;
  const certificates = boundedModelCheck("p0-51-server-formal-fixture").certificates;
  expect(certificates.length).toBeGreaterThan(0); certificate = certificates[0]!;
  expect(verifyCertificate(certificate)).toMatchObject({ valid: true, issues: [] });
  token = issueTrustToken("owned server fixture", sha256Hex(auditorPem), "default", [{ dimension: "fixture-security", score: 55,
    level: "L2", evidenceCount: 1, observedShare: 0, lastAssessedAt: Date.now() }], "owned-server-HMAC-fixture");
  expect(verifyTrustToken(token, "owned-server-HMAC-fixture")).toMatchObject({ valid: true, reasons: [] });
  const compiled = resolve("dist/studio/nativeTaskService.js");
  if (!existsSync(compiled)) throw new Error("The coordinated compiled native service is required for this fixture.");
  createService = (await import(pathToFileURL(compiled).href) as typeof import("../src/studio/nativeTaskService.js")).createNativeTaskService;
  records.push({ kind: "inputs", proofSha256: sha256Hex(readFileSync(proofFile)), compiledServiceSha256: sha256Hex(readFileSync(compiled)),
    compiledCliSha256: sha256Hex(readFileSync(resolve("dist/cli.js"))), auditorPinRecordedBeforeExport: true });
}, 60_000);

afterAll(async () => {
  const closed = await Promise.allSettled(services.map(service => service.close()));
  const evidenceDir = process.env.AMC_P0_51_SERVER_EFFECTS_DIR;
  if (evidenceDir) writeFileSync(join(evidenceDir, "handler-native-effects.json"), JSON.stringify(records, null, 2) + "\n");
  for (const root of roots) { lockVault(join(root, "workspace")); lockVault(join(root, "native-workspace")); rmSync(root, { recursive: true, force: true }); }
  for (const [key, value] of [["AMC_HOME", original.home], ["AMC_EXPECTED_MONITOR_FINGERPRINT", original.monitor],
    ["AMC_VAULT_PASSPHRASE", original.pass], ["AMC_CONTROL_CHECKPOINT_DIR", original.checkpoints]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  expect(closed.filter(result => result.status === "rejected")).toEqual([]);
});

describe("actual portable-verifier API trust admission", () => {
  test("a genuine signed proof accepts only the server operator's independently recorded issuer", async () => {
    const result = await route(handleCryptoRoute, "/api/v1/crypto/merkle/verify-proof", { file: proofFile }, "merkle-server-pin");
    expect(result.status).toBe(200); expect(result.body.data?.ok).toBe(true);
    expect(verifierReportSchema.parse(result.body.data?.report)).toMatchObject({ trusted: true, issuerAdmission: { status: "pass" } });
  });

  const routes: Array<[string, Handler, string, () => Record<string, unknown>]> = [
    ["merkle", handleCryptoRoute, "/api/v1/crypto/merkle/verify-proof", () => ({ file: proofFile })],
    ["formal", handleEnforceRoute, "/api/v1/enforce/formal/certificate", () => ({ certificate })],
    ["token", handlePassportRoute, "/api/v1/passport/trust-token/verify", () => ({ token })]
  ];
  for (const [family, handler, pathname, body] of routes) {
    test.each(fields.flatMap(field => [false, null].map(value => ({ field, value }))))(`${family} refuses request field $field=$value`, async ({ field, value }) => {
      const result = await route(handler, pathname, { ...body(), [field]: value }, `${family}-${field}-${String(value)}`);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ ok: false, error: expect.stringContaining(`request field "${field}" is refused`) });
    });
  }

  test("a genuinely hash-valid unkeyed formal certificate remains UNTRUSTED", async () => {
    const result = await route(handleEnforceRoute, "/api/v1/enforce/formal/certificate", { certificate }, "formal-unkeyed");
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ status: "UNTRUSTED", valid: false, integrityValid: true });
    expect(verifierReportSchema.parse(result.body.data?.report)).toMatchObject({ trusted: false, integrity: { status: "pass" },
      issuerAdmission: { status: "fail", signatures: [{ keyId: null, status: "not-pinned" }] }, overrides: [] });
  });

  test("formal certificate metadata does not become operator trust", async () => {
    const result = await route(handleEnforceRoute, "/api/v1/enforce/formal/certificate", {
      certificate: { ...certificate, publicKey: "untrusted certificate metadata" }, requestId: "certificate-compatibility"
    }, "formal-metadata-compatibility");
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ status: "UNTRUSTED", valid: false, integrityValid: true });
    expect(verifierReportSchema.parse(result.body.data?.report)).toMatchObject({ trusted: false, overrides: [] });
  });

  test("a tampered formal certificate remains an integrity failure", async () => {
    const result = await route(handleEnforceRoute, "/api/v1/enforce/formal/certificate", {
      certificate: { ...certificate, certificateHash: "0".repeat(64) }
    }, "formal-tampered-certificate");
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ status: "UNTRUSTED", valid: false, integrityValid: false });
    expect(verifierReportSchema.parse(result.body.data?.report)).toMatchObject({ trusted: false, integrity: { status: "fail" }, overrides: [] });
  });

  test.each([{}, { certificate: null }, { certificate: [] }])("formal certificate rejects malformed input %j", async body => {
    const result = await route(handleEnforceRoute, "/api/v1/enforce/formal/certificate", body, "formal-malformed-input");
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ ok: false, error: expect.stringContaining("Invalid request body:") });
  });

  test("a genuinely locally valid HMAC token is not evaluated as portable authorship", async () => {
    const result = await route(handlePassportRoute, "/api/v1/passport/trust-token/verify", { token }, "token-no-issuer");
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ status: "not_evaluated", valid: false, tokenSha256: sha256Hex(JSON.stringify(token)) });
    expect(result.body.data?.reason).toMatch(/HMAC.*names no signer/);
  });

  test.each([false, null, "owned-server-HMAC-fixture"])("the token handler refuses caller secret %j", async secret => {
    const result = await route(handlePassportRoute, "/api/v1/passport/trust-token/verify", { token, secret }, "token-secret-refused");
    expect(result.status).toBe(400); expect(result.body.error).toContain('request field "secret" is refused');
  });
});

test("compiled native service uses a pre-turn operator monitor pin and withdraws trust on list loss and distrust, including cold verification", async () => {
  const root = fixtureRoot(), nativeWorkspace = join(root, "native-workspace");
  // Reuse publicTaskHttpFixture's external, owned checkpoint pin for both parent and child.
  const home = join(root, "fixture-operator-home"), checkpoints = join(root, "control-checkpoints");
  process.env.AMC_HOME = home;
  process.env.AMC_CONTROL_CHECKPOINT_DIR = checkpoints;
  initWorkspace({ workspacePath: nativeWorkspace, trustBoundaryMode: "isolated" });
  const monitorPem = workspaceKeyPem(nativeWorkspace, "monitor");
  const monitor = { publicKeyPem: monitorPem, keyId: sha256Hex(monitorPem) }, independentRoot = testKey();
  const listFile = signedList(home, monitor, "ledger-row", independentRoot), admittedList = readFileSync(listFile);
  const actor: NativeTaskActor = { principalId: "p0-51-fixture:owner", agentId: "default", demo: true };
  const service = () => {
    const result = createService({ workspace: nativeWorkspace, credentialsHome: home, credentialsFile: join(home, ".credentials.yaml"),
      environment: { HOME: home, AMC_HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: passphrase,
        AMC_CONTROL_CHECKPOINT_DIR: checkpoints } });
    services.push(result); return result;
  };
  const live = service();
  const started = await live.start(actor, { agentId: "default", clientRequestId: randomUUID(), provider: "stub", tools: "none",
    prompt: "Owned P0-51 canned stub recording; not a model answer.", maxSteps: 2, maxTokens: 64 });
  const deadline = Date.now() + 25_000;
  let task = live.poll(actor, started.taskId).task;
  while (task.state !== "idle") {
    if (task.state === "failed" || Date.now() >= deadline) throw new Error(`Owned native fixture failed to settle: ${task.error ?? task.state}`);
    await new Promise(done => setTimeout(done, 50)); task = live.poll(actor, task.taskId).task;
  }
  expect(task.sessionId).toBeTruthy(); expect(task.error).toBeNull();
  expect(live.poll(actor, task.taskId).events.some(event => event.kind === "assistant" && event.evidence === "committed")).toBe(true);
  const record = (label: string, view: NativeTaskView) => records.push({ kind: "compiled-native-service", label, monitorPin: monitor.keyId,
    taskId: view.taskId, sessionId: view.sessionId, revision: view.revision, state: view.state, verification: view.verification,
    error: view.error, history: view.history, operatorListPresent: existsSync(listFile) });
  let verified = await live.verify(actor, task.taskId, task.revision); record("operator-pin-before-turn", verified);
  expect(verified).toMatchObject({ verification: "externally-anchored", error: null });
  unlinkSync(listFile);
  verified = await live.verify(actor, task.taskId, task.revision); record("live-list-loss", verified);
  expect(verified).toMatchObject({ verification: "failed", error: expect.stringContaining("UNTRUSTED: the recorded evidence is internally consistent") });
  await live.close();
  const cold = service();
  verified = await cold.verify(actor, task.taskId, task.revision); record("cold-list-loss", verified);
  expect(verified).toMatchObject({ verification: "failed", error: expect.stringContaining("not-pinned") });
  writeFileSync(listFile, admittedList, { mode: 0o600 });
  verified = await cold.verify(actor, task.taskId, task.revision); record("cold-restored-operator-list", verified);
  expect(verified).toMatchObject({ verification: "externally-anchored", error: null });
  signedList(home, monitor, "ledger-row", independentRoot, true);
  verified = await cold.verify(actor, task.taskId, task.revision); record("cold-operator-distrust", verified);
  expect(verified).toMatchObject({ verification: "failed", error: expect.stringContaining("distrusted") });
}, 90_000);

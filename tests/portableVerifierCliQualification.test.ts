import { execFile, spawnSync } from "node:child_process";
import { sign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { initWorkspace } from "../src/workspace.js";
import { initBenchRegistry } from "../src/bench/benchRegistryServer.js";
import { generateBom } from "../src/bom/bomGenerator.js";
import { signBomFile } from "../src/bom/bomVerifier.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { notaryAttestCli, notaryInitCli } from "../src/notary/notaryCli.js";
import { appendTransparencyEntry, exportTransparencyBundle } from "../src/transparency/logChain.js";
import { exportTransparencyProofBundle, rebuildTransparencyMerkle } from "../src/transparency/merkleIndexStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { anchorSessionRoot } from "../src/transparency/sessionAnchor.js";
import { auditorKeyFingerprint, exportSessionAnchorProof } from "../src/transparency/sessionAnchorProof.js";
import { sessionAnchorProofSchema } from "../src/transparency/sessionAnchorSchema.js";
import { boundedModelCheck, verifyCertificate } from "../src/enforce/formalVerification.js";
import { issueTrustToken, verifyTrustToken } from "../src/passport/trustInterchange.js";
import { createIndustryPackLicenseKey, verifyIndustryPackLicenseKey } from "../src/domains/industryPackEntitlement.js";
import { createImportedExternalEvidence, externalEvidenceNormalizedDigest, externalEvidenceSigningBytes,
  type ExternalEvidenceAuthority } from "../src/standard/externalEvidenceProfile.js";
import { verifierReportSchema, verifySignedTrustList, type KeyPurpose, type TrustListEntry } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { distrustEntry, rawSignature, testKey, trustList, type TestKey } from "./trust/trustFixtures.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const bothAllows = ["--allow-unpinned", "--allow-unanchored"];
const allowCases = [[], ["--allow-unpinned"], ["--allow-unanchored"], bothAllows];
const signedFamilies = ["registry", "bom", "notary", "merkle", "transparency"] as const;
type SignedFamily = typeof signedFamilies[number];
type OperatorKey = Pick<TestKey, "publicKeyPem" | "keyId">;
type Fixture = { args: string[]; key: OperatorKey; purpose: KeyPurpose; pinPath: string; tamperedArgs: string[] };
const fixtures = new Map<SignedFamily, Fixture>();
const records: Array<Record<string, unknown>> = [];
const objectSchema = z.record(z.string(), z.unknown());
let root: string, workspace: string, home: string, operatorHome: string, logs: string, guard: string;
let environment: NodeJS.ProcessEnv;
let tokenJson: string, certificateJson: string, license: string, licensePin: string;
let licenseIssuer: TestKey, authorityIssuer: TestKey;
let hmacLicense: string;
const localLicenseSecret = "p0-51-local-shared-secret-fixture";
const legacyLicense = "AMC-INDUSTRY-PACKS-LOCAL_QUALIFICATION_FIXTURE";
let profileArgs: string[], profilePath: string, unsignedProfilePath: string, authoritiesPath: string, originalPath: string;
let authority: ExternalEvidenceAuthority;
let sessionArgs: string[], sessionKey: OperatorKey, sessionPath: string;

function jsonFile(name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  return path;
}

function operatorKey(publicKeyPem: string): OperatorKey {
  return { publicKeyPem, keyId: sha256Hex(publicKeyPem) };
}

function pinFile(name: string, key: OperatorKey): string {
  const path = join(root, `${name}-operator.pub`);
  writeFileSync(path, key.publicKeyPem, { mode: 0o600 });
  return path;
}

// These lists are operator-owned and signed by a separately generated, out-of-band pinned root.
function listFlags(name: string, key: OperatorKey, purpose: KeyPurpose, status: "admitted" | "wrong-purpose" | "distrusted" | "revoked"): string[] {
  const listRoot = testKey();
  const entry: TrustListEntry = {
    keyId: key.keyId, algorithm: "ed25519", publicKeyPem: key.publicKeyPem,
    purposes: [status === "wrong-purpose" ? "ledger-row" : purpose], subject: `${name} local qualification issuer`,
    validFrom: "2026-01-01T00:00:00.000Z", validTo: "2099-01-01T00:00:00.000Z", source: "operator",
    ...(purpose === "evidence-authority" && status !== "wrong-purpose" ? {
      authority: { producers: ["p0-51-fixture"], captureMethods: ["governed-capture"], maxTrustTier: "OBSERVED" },
    } : {}),
    ...(status === "revoked" ? { revokedAt: "2026-01-02T00:00:00.000Z", revocationReason: "key-compromise" as const } : {}),
  };
  const list = trustList([entry], { listId: name, expiresAt: "2099-01-01T00:00:00.000Z",
    distrust: status === "distrusted" ? [distrustEntry(key.keyId)] : [] });
  const signed = { list, signatures: [rawSignature(list, listRoot)] };
  expect(verifySignedTrustList(signed, { pinnedRootKeyIds: [listRoot.keyId], now: new Date() })).toEqual(list);
  const path = jsonFile(`${name}-trust-list.json`, signed);
  return ["--trust-list", path, "--trust-root", listRoot.keyId];
}

function repackMutation(name: string, file: string, mutate: (dir: string) => void): string {
  const dir = join(root, `${name}-unpacked`);
  mkdirSync(dir);
  const extract = spawnSync("/usr/bin/tar", ["-xzf", file, "-C", dir], { encoding: "utf8" });
  expect(extract.status, extract.stderr).toBe(0);
  mutate(dir);
  const changed = join(root, `${name}-tampered.tgz`);
  const packed = spawnSync("/usr/bin/tar", ["-czf", changed, "-C", dir, "."], { encoding: "utf8" });
  expect(packed.status, packed.stderr).toBe(0);
  return changed;
}

beforeAll(async () => {
  expect(process.versions.node.split(".")[0], "Use the prepared Node 22 or 24 executable").toMatch(/^(22|24)$/);
  expect(existsSync(cli), "Build current source normally before actual CLI qualification").toBe(true);
  root = mkdtempSync("/private/tmp/amc-p0-51-portable-cli-");
  workspace = join(root, "workspace"); home = join(root, "home"); operatorHome = join(root, "operator"); logs = join(root, "logs");
  for (const path of [workspace, home, operatorHome, logs]) mkdirSync(path, { mode: 0o700 });
  guard = join(root, "deny-transport.mjs");
  writeFileSync(guard, `import http from "node:http"; import https from "node:https"; import net from "node:net";
import tls from "node:tls"; import dns from "node:dns"; import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("P0_51_OFFLINE_FIXTURE: external transport denied"); };
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = deny;
dgram.createSocket = deny;
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "reverse"]) { dns[name] = deny; dns.promises[name] = deny; }
globalThis.fetch = deny; globalThis.WebSocket = class { constructor() { deny(); } };
syncBuiltinESMExports();\n`, { mode: 0o600 });
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-51-local-vault-fixture");
  vi.stubEnv("AMC_NOTARY_PASSPHRASE", "p0-51-local-notary-fixture");
  vi.stubEnv("AMC_HOME", operatorHome);
  vi.stubEnv("AMC_AGENT_ID", "");
  environment = { PATH: `${dirname(process.execPath)}${delimiter}/usr/bin${delimiter}/bin`, HOME: home, AMC_HOME: operatorHome,
    NO_COLOR: "1", TERM: "dumb", NODE_ENV: "test", AMC_CLAIM_LABELS_STRICT: "1",
    NODE_OPTIONS: `--import=${pathToFileURL(guard).href}` };
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Capture this pin before any signed artifact export, from the fixture operator's key creation context.
  const auditor = operatorKey(readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub"), "utf8"));
  const auditorPin = pinFile("auditor", auditor);
  const registry = initBenchRegistry({ dir: join(root, "registry"), registryId: "p0-51-local-registry", registryName: "Local qualification registry" });
  const registryKey = operatorKey(readFileSync(registry.pubPath, "utf8"));
  const registryPin = pinFile("registry", registryKey);
  const changedRegistry = join(root, "registry-changed"); cpSync(registry.dir, changedRegistry, { recursive: true });
  const index = objectSchema.parse(JSON.parse(readFileSync(join(changedRegistry, "index.json"), "utf8")));
  const registryMetadata = objectSchema.parse(index.registry); registryMetadata.name = "Mutated after signing";
  writeFileSync(join(changedRegistry, "index.json"), JSON.stringify({ ...index, registry: registryMetadata }));
  fixtures.set("registry", { args: ["bench", "registry", "verify", "--dir", registry.dir], key: registryKey,
    purpose: "artifact-seal", pinPath: registryPin, tamperedArgs: ["bench", "registry", "verify", "--dir", changedRegistry] });

  const run = await runDiagnostic({ workspace, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
  const bom = generateBom({ workspace, agentId: "default", runId: run.runId, outFile: "qualification-bom.json" });
  const signedBom = signBomFile({ workspace, inputFile: bom.outFile, outputSigFile: "qualification-bom.sig" });
  const changedBom = jsonFile("changed-bom.json", { ...bom.bom, agentName: "Mutated after signing" });
  fixtures.set("bom", { args: ["bom", "verify", "--in", bom.outFile, "--sig", signedBom.sigFile], key: auditor,
    purpose: "artifact-seal", pinPath: auditorPin, tamperedArgs: ["bom", "verify", "--in", changedBom, "--sig", signedBom.sigFile] });

  const notary = await notaryInitCli({ notaryDir: join(root, "notary") });
  const notaryKey = operatorKey(readFileSync(notary.publicKeyPath, "utf8"));
  const notaryPin = pinFile("notary", notaryKey);
  const attest = notaryAttestCli({ notaryDir: notary.notaryDir, workspace, outFile: join(root, "attestation.amcattest") });
  const changedAttest = repackMutation("notary", attest.outFile, (dir) => {
    const path = join(dir, "attest", "attest.json");
    const payload = objectSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    writeFileSync(path, JSON.stringify({ ...payload, attestationId: "changed-after-signing" }));
  });
  fixtures.set("notary", { args: ["notary", "verify-attest", attest.outFile], key: notaryKey,
    purpose: "notary", pinPath: notaryPin, tamperedArgs: ["notary", "verify-attest", changedAttest] });

  const entry = appendTransparencyEntry({ workspace, type: "BUNDLE_EXPORTED", agentId: "default",
    artifact: { kind: "amcbundle", sha256: sha256Hex("owned fixture artifact bytes"), id: "p0-51-local-artifact" } });
  rebuildTransparencyMerkle(workspace);
  const proof = exportTransparencyProofBundle({ workspace, entryHash: entry.hash, outFile: join(root, "inclusion.amcproof") });
  const changedProof = repackMutation("merkle", proof.outFile, (dir) => {
    const path = join(dir, "proof.json");
    const payload = objectSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    writeFileSync(path, JSON.stringify({ ...payload, entryHash: "f".repeat(64) }));
  });
  fixtures.set("merkle", { args: ["transparency", "merkle", "verify-proof", proof.outFile], key: auditor,
    purpose: "artifact-seal", pinPath: auditorPin, tamperedArgs: ["transparency", "merkle", "verify-proof", changedProof] });
  const logBundle = exportTransparencyBundle({ workspace, outFile: join(root, "transparency.tgz") });
  const changedLog = repackMutation("transparency", logBundle.outFile, (dir) => {
    const path = join(dir, "log.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const first = objectSchema.parse(JSON.parse(lines[0]!));
    lines[0] = JSON.stringify({ ...first, agentId: "changed-after-signing" });
    writeFileSync(path, `${lines.join("\n")}\n`);
  });
  fixtures.set("transparency", { args: ["transparency", "verify-bundle", logBundle.outFile], key: auditor,
    purpose: "artifact-seal", pinPath: auditorPin, tamperedArgs: ["transparency", "verify-bundle", changedLog] });

  const model = boundedModelCheck("p0-51-local-agent");
  expect(model.certificates.length).toBeGreaterThan(0);
  const certificate = model.certificates[0]!;
  expect(verifyCertificate(certificate)).toMatchObject({ valid: true, issues: [] });
  certificateJson = JSON.stringify(certificate);
  const token = issueTrustToken("p0-51-local-workspace", auditor.keyId, "p0-51-local-agent", [{
    dimension: "fixture-security", score: 55, level: "L2", evidenceCount: 1, observedShare: 0, lastAssessedAt: Date.now(),
  }], "cli-demo-secret");
  expect(verifyTrustToken(token, "cli-demo-secret")).toMatchObject({ valid: true, reasons: [] });
  tokenJson = JSON.stringify(token);

  licenseIssuer = testKey(); licensePin = pinFile("license", licenseIssuer);
  license = createIndustryPackLicenseKey({ customerId: "p0-51-local-paid-fixture", expiresAt: "2099-01-01T00:00:00.000Z",
    env: { AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: licenseIssuer.privateKeyPem } });
  expect(verifyIndustryPackLicenseKey(license, { AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: licenseIssuer.publicKeyPem }).valid).toBe(true);
  hmacLicense = createIndustryPackLicenseKey({ customerId: "p0-51-local-hmac-fixture", expiresAt: "2099-01-01T00:00:00.000Z",
    env: { AMC_INDUSTRY_PACKS_LICENSE_SECRET: localLicenseSecret } });
  expect(verifyIndustryPackLicenseKey(hmacLicense, { AMC_INDUSTRY_PACKS_LICENSE_SECRET: localLicenseSecret }).valid).toBe(true);
  expect(verifyIndustryPackLicenseKey(legacyLicense, { AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST: sha256Hex(legacyLicense) }).valid).toBe(true);

  authorityIssuer = testKey();
  authority = { id: "p0-51-operator", publicKeyPem: authorityIssuer.publicKeyPem, producers: ["p0-51-fixture"],
    captureMethods: ["governed-capture"], maxTrustTier: "OBSERVED" };
  const original = Buffer.from("local qualification fixture evidence\n");
  originalPath = join(root, "original.ndjson"); writeFileSync(originalPath, original, { mode: 0o600 });
  const profile = createImportedExternalEvidence({
    source: { producer: "p0-51-fixture", version: "1", originalSha256: sha256Hex(original), mediaType: "application/x-ndjson" },
    session: { id: "fixture-child", parentSessionId: "fixture-parent" }, normalizer: "p0-51-fixture/1", ingestedAt: "2026-10-14T00:00:00.000Z",
    losses: ["Local synthetic test input; external parent is not supplied."], events: [{ id: "fixture-input", parentId: null,
      toolCallId: null, kind: "input", outcome: null, sourceTime: null, durationNs: null, cost: null, attributes: {} }],
  });
  unsignedProfilePath = jsonFile("unsigned-profile.json", profile);
  profile.provenance = { trustTier: "OBSERVED", captureMethod: "governed-capture", authorityId: authority.id };
  profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
  profile.signature = { algorithm: "ed25519", authorityId: authority.id,
    value: sign(null, externalEvidenceSigningBytes(profile), authorityIssuer.privateKeyPem).toString("base64") };
  profilePath = jsonFile("profile.json", profile); authoritiesPath = jsonFile("authorities.json", [authority]);
  profileArgs = ["imports", "verify-profile", profilePath, "--authorities", authoritiesPath, "--original", originalPath,
    "--expected-digest", profile.normalization.normalizedSha256];

  const sessionWorkspace = join(root, "session-workspace"); mkdirSync(sessionWorkspace);
  initWorkspace({ workspacePath: sessionWorkspace, agentId: "default", trustBoundaryMode: "isolated" });
  sessionKey = operatorKey(readFileSync(join(sessionWorkspace, ".amc", "keys", "auditor_ed25519.pub"), "utf8"));
  const fingerprint = auditorKeyFingerprint(sessionWorkspace);
  expect(fingerprint).toBe(sessionKey.keyId);
  const session = new SessionService(sessionWorkspace);
  session.open({ agentId: "default", harnessVersion: "p0-51-fixture/1", compositionDigest: sha256Hex("fixture-composition"), policyDigest: sha256Hex("fixture-policy") });
  const system = session.recordSystemPrompt("Local fixture only; no model is called.");
  session.startTurn({ trigger: "user" }); session.recordUserMessage("Fixture input");
  const step = session.startStep();
  session.recordRequestHeader({ model: "local-fixture", providerId: "local-fixture", params: {}, encoderId: "fixture-json", encoderVersion: 1,
    systemPromptEventId: system.eventId, toolSchema: null, projectionCutoffEventId: step.eventId,
    projectionDigest: sha256Hex("fixture-projection"), sourceEventIds: [system.eventId], requestBytes: "{}" });
  session.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "Fixture output" });
  session.endStep({ stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 } });
  session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" });
  anchorSessionRoot({ workspace: sessionWorkspace, sessionId: session.sessionId });
  sessionPath = exportSessionAnchorProof({ workspace: sessionWorkspace, sessionId: session.sessionId,
    outFile: join(root, "session.amcproof.json") }).outFile;
  sessionArgs = ["session", "verify-proof", sessionPath, "--expect-auditor-key", fingerprint];
  // Detach only our freshly created fixture. The CLI cannot consult its original workspace during verification.
  rmSync(sessionWorkspace, { recursive: true });
  writeFileSync(join(logs, "fixture.json"), JSON.stringify({ root, workspace, home, operatorHome,
    node: process.version, executable: process.execPath, cli, cliSha256: sha256Hex(readFileSync(cli)),
    testSha256: sha256Hex(readFileSync(fileURLToPath(import.meta.url))), guardSha256: sha256Hex(readFileSync(guard)),
    transport: "denied", environmentKeys: Object.keys(environment).sort(), pinsCapturedBeforeExport: true,
    families: [...signedFamilies, "license", "imports", "session", "formal", "passport"],
  }, null, 2));
}, 30_000);

afterAll(() => {
  vi.unstubAllEnvs();
  // Evidence logs and exported fixtures remain private; remove only fresh state and sealed key stores.
  for (const path of [workspace, home, operatorHome, root && join(root, "notary"), root && join(root, "registry"), root && join(root, "registry-changed")])
    if (path) rmSync(path, { recursive: true, force: true });
});

async function invoke(name: string, args: string[], extraEnvironment: NodeJS.ProcessEnv = {}) {
  const started = Date.now();
  const result = await new Promise<{ status: number | null; signal: string | null; error?: string; stdout: string; stderr: string }>((done) => {
    execFile(process.execPath, ["--import", pathToFileURL(guard).href, cli, ...args, "--json"], {
      cwd: workspace, env: { ...environment, ...extraEnvironment }, encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      done({ status: !error ? 0 : typeof error.code === "number" ? error.code : null, signal: error?.signal ?? null,
        ...(error && typeof error.code !== "number" ? { error: error.message } : {}), stdout, stderr });
    });
  });
  const stdoutPath = join(logs, `${name}.stdout`), stderrPath = join(logs, `${name}.stderr`);
  writeFileSync(stdoutPath, result.stdout, { mode: 0o600 }); writeFileSync(stderrPath, result.stderr, { mode: 0o600 });
  const safeArgs = args.map((arg, i) => args[i - 1] === "--key" || arg.startsWith("{") ? `<fixture sha256=${sha256Hex(arg)}>` : arg);
  records.push({ name, args: safeArgs, status: result.status, signal: result.signal, durationMs: Date.now() - started,
    stdoutPath, stderrPath, stdoutSha256: sha256Hex(result.stdout), stderrSha256: sha256Hex(result.stderr) });
  writeFileSync(join(logs, "commands.json"), JSON.stringify(records, null, 2), { mode: 0o600 });
  expect(result.error, result.stderr).toBeUndefined(); expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).not.toBeNull(); expect(result.status, "Strict claim exit 70 is not verifier qualification").not.toBe(70);
  expect(result.stdout + result.stderr).not.toMatch(/unknown option|missing required argument|required option .+ not specified|unknown command|P0_51_OFFLINE_FIXTURE/i);
  const body = objectSchema.parse(JSON.parse(result.stdout));
  const report = verifierReportSchema.parse(body.report);
  for (const dimension of ["scope", "freshness", "completeness", "satisfaction"] as const) expect(report[dimension].status).toBe("not-evaluated");
  expect(report.anchoring.status).toBe("not-applicable");
  return { ...result, body, report };
}

function getFixture(family: SignedFamily): Fixture {
  const fixture = fixtures.get(family); if (!fixture) throw new Error(`Missing real ${family} fixture`); return fixture;
}

describe.each(signedFamilies)("Portable CLI %s", (family) => {
  test("accepts the independently captured operator PEM", async () => {
    const fixture = getFixture(family);
    const result = await invoke(`${family}-pinned`, [...fixture.args, "--pubkey", fixture.pinPath]);
    expect(result.status, result.stderr).toBe(0); expect(result.report).toMatchObject({ trusted: true, integrity: { status: "pass" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures).toHaveLength(family === "merkle" ? 2 : 1);
    for (const admission of result.report.issuerAdmission.signatures)
      expect(admission).toMatchObject({ keyId: fixture.key.keyId, status: "admitted", purpose: fixture.purpose });
  });
  test("refuses an intact carried signer without an operator pin", async () => {
    const result = await invoke(`${family}-unknown`, getFixture(family).args);
    expect(result.status, result.stderr).toBe(1); expect(result.report).toMatchObject({ trusted: false, integrity: { status: "pass" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
  });
  test("returns exit 2 only when an intact unknown signer uses the explicit override", async () => {
    const result = await invoke(`${family}-integrity-only`, [...getFixture(family).args, ...bothAllows]);
    expect(result.status, result.stderr).toBe(2); expect(result.stderr).toMatch(/^UNTRUSTED:/);
    expect(result.report).toMatchObject({ trusted: false, integrity: { status: "pass" }, overrides: ["allow-unpinned"] });
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe("unpinned-allowed");
  });
  test("unused allow flags leave a pinned verdict trusted without an override", async () => {
    const fixture = getFixture(family);
    const result = await invoke(`${family}-pinned-unused-allows`, [...fixture.args, "--pubkey", fixture.pinPath, ...bothAllows]);
    expect(result.status, result.stderr).toBe(0); expect(result.report).toMatchObject({ trusted: true, overrides: [] });
    expect(result.stderr).not.toContain("UNTRUSTED:");
  });
  test("accepts a genuinely signed operator trust list for the required purpose", async () => {
    const fixture = getFixture(family);
    const result = await invoke(`${family}-listed`, [...fixture.args, ...listFlags(`${family}-listed`, fixture.key, fixture.purpose, "admitted")]);
    expect(result.status, result.stderr).toBe(0); expect(result.report.trusted).toBe(true);
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ status: "admitted", source: "trust-list", purpose: fixture.purpose });
  });
  test.each(["wrong-purpose", "distrusted", "revoked"] as const)("refuses a signed %s operator decision even with both allow flags", async (status) => {
    const fixture = getFixture(family);
    const result = await invoke(`${family}-${status}`, [...fixture.args, ...listFlags(`${family}-${status}`, fixture.key, fixture.purpose, status), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.trusted).toBe(false); expect(result.report.issuerAdmission.signatures[0]?.status).toBe(status);
    expect(result.report.overrides).toEqual([]);
  });
  test("content changed after signing refuses even with pin and both allow flags", async () => {
    const fixture = getFixture(family);
    const result = await invoke(`${family}-tampered`, [...fixture.tamperedArgs, "--pubkey", fixture.pinPath, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("fail"); expect(result.report.trusted).toBe(false);
  });
});

describe.each(["formal", "passport"] as const)("Unkeyed CLI %s", (family) => {
  test.each(allowCases)("intact local hash/HMAC remains exit 1 with flags %j", async (...flags: string[]) => {
    const args = family === "formal" ? ["enforce", "verify-certificate", certificateJson] : ["passport", "verify-token", tokenJson];
    const result = await invoke(`${family}-intact-${flags.join("-") || "no-override"}`, [...args, ...flags]);
    expect(result.status, result.stderr).toBe(1); expect(result.body.valid).toBe(true);
    expect(result.report).toMatchObject({ trusted: false, integrity: { status: "pass" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ status: "not-pinned", keyId: null });
    expect(result.stderr).not.toContain("UNTRUSTED:");
  });
  test("changed hash/HMAC is an integrity failure rather than an allowed result", async () => {
    const value = objectSchema.parse(JSON.parse(family === "formal" ? certificateJson : tokenJson));
    const changed = family === "formal" ? { ...value, certificateHash: "f".repeat(64) } : { ...value, signature: "f".repeat(64) };
    const args = family === "formal" ? ["enforce", "verify-certificate", JSON.stringify(changed)] : ["passport", "verify-token", JSON.stringify(changed)];
    const result = await invoke(`${family}-tampered`, [...args, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.body.valid).toBe(false);
    expect(result.report).toMatchObject({ trusted: false, integrity: { status: "fail" }, overrides: [] });
  });
});

describe("Portable CLI Industry Packs license", () => {
  test("a genuine Ed25519 license accepts only the independently supplied operator PEM", async () => {
    const result = await invoke("license-pinned", ["domain", "pack", "verify", "--key", license, "--pubkey", licensePin]);
    expect(result.status, result.stderr).toBe(0); expect(result.body.valid).toBe(true); expect(result.report.trusted).toBe(true);
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ keyId: licenseIssuer.keyId, purpose: "artifact-seal", status: "admitted" });
  });
  test("operator environment PEM is a real pin and unused allow flags create no override", async () => {
    const result = await invoke("license-operator-environment", ["domain", "pack", "verify", "--key", license, ...bothAllows],
      { AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: licenseIssuer.publicKeyPem });
    expect(result.status, result.stderr).toBe(0); expect(result.report).toMatchObject({ trusted: true, overrides: [] });
  });
  test("no available verifying key refuses rather than manufacturing integrity-only success", async () => {
    const result = await invoke("license-no-key", ["domain", "pack", "verify", "--key", license, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report).toMatchObject({ trusted: false, integrity: { status: "fail" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
  });
  test("a mismatched genuine operator key cannot verify the license even with overrides", async () => {
    const result = await invoke("license-wrong-key", ["domain", "pack", "verify", "--key", license, "--pubkey", pinFile("license-wrong", testKey()), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("fail"); expect(result.report.trusted).toBe(false);
  });
  test.each(allowCases)("a locally valid HMAC license stays portable-untrusted with flags %j", async (...flags: string[]) => {
    const result = await invoke(`license-hmac-${flags.join("-") || "no-override"}`,
      ["domain", "pack", "verify", "--key", hmacLicense, ...flags], { AMC_INDUSTRY_PACKS_LICENSE_SECRET: localLicenseSecret });
    expect(result.status, result.stderr).toBe(1); expect(result.body.valid).toBe(false);
    expect(result.report).toMatchObject({ trusted: false, integrity: { status: "fail" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ status: "not-pinned", keyId: null });
  });
  test.each(allowCases)("a locally allowlisted legacy license stays portable-untrusted with flags %j", async (...flags: string[]) => {
    const result = await invoke(`license-legacy-${flags.join("-") || "no-override"}`,
      ["domain", "pack", "verify", "--key", legacyLicense, ...flags], { AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST: sha256Hex(legacyLicense) });
    expect(result.status, result.stderr).toBe(1); expect(result.body.valid).toBe(false);
    expect(result.report).toMatchObject({ trusted: false, integrity: { status: "fail" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ status: "not-pinned", keyId: null });
  });
  test("operator distrust beats the matching license PEM and both allow flags", async () => {
    const result = await invoke("license-distrusted", ["domain", "pack", "verify", "--key", license, "--pubkey", licensePin,
      ...listFlags("license-distrusted", licenseIssuer, "artifact-seal", "distrusted"), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe("distrusted"); expect(result.report.trusted).toBe(false);
  });
  test("key-compromise revocation beats a matching explicit license pin and both allow flags", async () => {
    const result = await invoke("license-revoked-pinned", ["domain", "pack", "verify", "--key", license, "--pubkey", licensePin,
      ...listFlags("license-revoked-pinned", licenseIssuer, "artifact-seal", "revoked"), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe("revoked"); expect(result.report.trusted).toBe(false);
  });
});

describe("Portable CLI external-evidence profile", () => {
  test("a signed governed capture matches independent authority, original bytes and semantic digest", async () => {
    const result = await invoke("imports-admitted", profileArgs);
    expect(result.status, result.stderr).toBe(0); expect(result.body).toMatchObject({ ok: true, signatureVerified: true,
      originalDigest: "verified", parentSession: "declared-not-verified", trustTier: "OBSERVED" });
    expect(result.report.trusted).toBe(true); expect(result.report.issuerAdmission.signatures[0]?.purpose).toBe("evidence-authority");
  });
  test("a signer absent from operator authority refuses even with both allow flags", async () => {
    const args = [...profileArgs]; args.splice(args.indexOf("--authorities"), 2);
    const result = await invoke("imports-unknown-authority", [...args, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.body).toMatchObject({ ok: false, signatureVerified: false, trustTier: "SELF_REPORTED" });
    expect(result.report.trusted).toBe(false); expect(result.report.integrity.status).toBe("fail");
  });
  test.each(["producer", "capture", "original", "digest"] as const)("an independently mismatched %s refuses the valid signature", async (kind) => {
    const args = [...profileArgs];
    if (kind === "producer" || kind === "capture") {
      args[args.indexOf("--authorities") + 1] = jsonFile(`authorities-wrong-${kind}.json`, [{ ...authority,
        ...(kind === "producer" ? { producers: ["different-producer"] } : { captureMethods: ["producer-callback"] }) }]);
    } else if (kind === "original") { const path = join(root, "changed-original"); writeFileSync(path, "changed"); args[args.indexOf("--original") + 1] = path; }
    else args[args.indexOf("--expected-digest") + 1] = "f".repeat(64);
    const result = await invoke(`imports-wrong-${kind}`, [...args, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.body.signatureVerified).toBe(kind !== "producer");
    expect(result.report.integrity.status).toBe("fail"); expect(result.report.trusted).toBe(false);
  });
  test("an unsigned internally consistent import never becomes portable authorship", async () => {
    const result = await invoke("imports-unsigned", ["imports", "verify-profile", unsignedProfilePath,
      "--original", originalPath, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.body).toMatchObject({ signatureVerified: false, trustTier: "SELF_REPORTED" });
    expect(result.report.integrity.status).toBe("pass"); expect(result.body.originalDigest).toBe("verified"); expect(result.report.overrides).toEqual([]);
    expect(result.report.trusted).toBe(false); expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ status: "not-pinned", keyId: null });
  });
  test.each(["distrusted", "revoked"] as const)("signed %s authority refuses even with the independent authority file", async (status) => {
    const result = await invoke(`imports-${status}`, [...profileArgs, ...listFlags(`imports-${status}`, authorityIssuer, "evidence-authority", status), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.body.signatureVerified).toBe(true); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe(status); expect(result.report.trusted).toBe(false);
  });
});

describe("Portable CLI detached session proof", () => {
  test("accepts a genuine detached session only with the fingerprint captured before export", async () => {
    const result = await invoke("session-matching-pin", sessionArgs);
    expect(result.status, result.stderr).toBe(0); expect(result.body.ok).toBe(true);
    expect(result.report).toMatchObject({ trusted: true, integrity: { status: "pass" }, overrides: [] });
    expect(result.report.issuerAdmission.signatures[0]?.keyId).toBe(sessionKey.keyId);
  });
  test("unused overrides do not change a matching fingerprint verdict", async () => {
    const result = await invoke("session-matching-unused-overrides", [...sessionArgs, ...bothAllows]);
    expect(result.status, result.stderr).toBe(0); expect(result.report).toMatchObject({ trusted: true, overrides: [] });
  });
  test("a different well-formed auditor fingerprint is an integrity failure even with overrides", async () => {
    const args = [...sessionArgs]; args[args.indexOf("--expect-auditor-key") + 1] = testKey().keyId;
    const result = await invoke("session-wrong-pin", [...args, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("fail"); expect(result.report.trusted).toBe(false);
  });
  test("descriptor mutation cannot detach the session from the signed root", async () => {
    const proof = sessionAnchorProofSchema.parse(JSON.parse(readFileSync(sessionPath, "utf8")));
    proof.descriptor.sessionId = "changed-after-signing";
    const args = [...sessionArgs]; args[2] = jsonFile("session-changed.json", proof);
    const result = await invoke("session-tampered", [...args, ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("fail"); expect(result.report.trusted).toBe(false);
  });
  test.each(["distrusted", "revoked"] as const)("matching fingerprint cannot bypass operator %s decision", async (status) => {
    const result = await invoke(`session-${status}`, [...sessionArgs, ...listFlags(`session-${status}`, sessionKey, "artifact-seal", status), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe(status); expect(result.report.trusted).toBe(false);
  });
});

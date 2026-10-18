/** Genuine local producer only. It shares no oracle verifier or authority shortcut. */
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { withFinance } from "./financeQualification.js";

const sourceRoot = realpathSync(resolve(fileURLToPath(new URL("../../", import.meta.url))));
const digest = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const BODY = { kind: "refund", sourceAccountId: "acct-a-op", payeeId: "payee-a-002", amountMinor: 12000,
  currency: "USD", reference: "RF-1002", originalTxnId: "txn-a-1002" };
const TOOL = "finops_oracle_payment";
type OracleFixtureMode = "completed" | "body-mismatch" | "provider-only" | "duplicate" | "weaker-policy" | "unsupported-expectation";
export interface OracleOutput {
  schemaVersion: string; verdict: "pass" | "fail";
  checks: Array<{ id: string; passed: boolean; evidence: string }>;
}
interface ChildObservation {
  label: string; pid: number | undefined; argv: string[]; exit: number | null; signal: NodeJS.Signals | null;
  spawnError: string | null; streamsClosed: boolean; absentByESRCH: boolean; probes: string[];
  stdout: string; stderr: string; truncated: boolean;
  captureErrors: string[];
  captured: Record<"stdout" | "stderr", { bytes: number; sha256: string }>;
  observedOutputBytes: Record<"stdout" | "stderr", number>;
  environmentKeys: string[];
}
interface OracleFixture {
  root: string; workspace: string; providerRunDir: string; caseFile: string; pinsFile: string; preimagesDir: string;
  producerResult: Record<string, unknown>;
  runOracle(options?: { adapterStdout?: string }): Promise<OracleOutput>;
  truncateLog(): void;
  tamperPreimage(): void;
  tamperApprovalSignature(): void;
}

// This exact emitted implementation is part of this pinned helper, not an untracked fixture dependency.
// It imports the public built APIs to PRODUCE artifacts, never oracle.mjs or oracleEvidence.mjs.
const PRODUCER = String.raw`
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, fsyncSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
const [stage, configFile] = process.argv.slice(2), c = JSON.parse(readFileSync(configFile, "utf8"));
const load = path => import(pathToFileURL(join(c.buildRoot, "dist", path)).href);
const { createVault, unlockVault, lockVault } = await load("vault/vault.js");
const { closeAllSqlitePools } = await load("storage/sqlitePool.js");
const { openLedger } = await load("ledger/ledger.js");
const { getAgentPaths } = await load("fleet/paths.js");
const { getPublicKeyPem } = await load("crypto/keys.js");
const { canonicalize } = await load("utils/json.js");
const sha = value => createHash("sha256").update(value).digest("hex");
let journal, ledger, failed, result;
const cleanup = [];
function durable(path, value) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, canonicalize(value) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(c.preimagesDir, "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
try {
  if (stage === "init") {
    const { initWorkspace } = await load("workspace.js");
    const { initActionPolicy } = await load("governor/actionPolicyEngine.js");
    const { initBudgets } = await load("budgets/budgets.js");
    const { initApprovalPolicy, defaultApprovalPolicy } = await load("approvals/approvalPolicyEngine.js");
    const { initToolsConfig } = await load("toolhub/toolhubValidators.js");
    createVault({ workspace: c.workspace, passphrase: c.passphrase, ...c.keys });
    unlockVault(c.workspace, c.passphrase);
    initWorkspace({ workspacePath: c.workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initActionPolicy(c.workspace); initBudgets(c.workspace, "default");
    const approvalPolicy = defaultApprovalPolicy();
    initApprovalPolicy(c.workspace, approvalPolicy);
    const defaultFinancialRule = structuredClone(approvalPolicy.approvalPolicy.actionClasses.FINANCIAL);
    const defaultPolicyBytes = readFileSync(join(c.workspace, ".amc", "approval-policy.yaml"));
    writeFileSync(c.defaultPolicyFile, defaultPolicyBytes, { flag: "wx", mode: 0o600 });
    writeFileSync(c.defaultPolicyFile + ".sig", readFileSync(join(c.workspace, ".amc", "approval-policy.yaml.sig")), { flag: "wx", mode: 0o600 });
    if (c.mode === "weaker-policy") {
      approvalPolicy.approvalPolicy.actionClasses.FINANCIAL.requiredApprovals = 1;
      initApprovalPolicy(c.workspace, approvalPolicy);
    }
    initToolsConfig(c.workspace, { tools: { version: 1, denyByDefault: true, allowedTools: [{ name: c.toolName,
      actionClass: "FINANCIAL", bindingFields: { amount: "amount", currency: "currency", recipient: "payeeId",
        destination: "destinationTokenSha256", resourceId: "payeeId", resourceVersion: "payeeVersion" },
      effects: { repeatable: false, idempotency: { carrier: "http-header", name: "Idempotency-Key" },
        reconcile: { adapterId: "native" } } }] } });
    const approvalsDir = join(getAgentPaths(c.workspace, "default").rootDir, "approvals");
    mkdirSync(approvalsDir, { recursive: true, mode: 0o700 });
    for (const name of ["requests", "decisions", "consumed"]) mkdirSync(join(approvalsDir, name), { mode: 0o700 });
    result = { schema: "finance-oracle-initializer/1", approvalsDir,
      toolsConfigSha256: sha(readFileSync(join(c.workspace, ".amc", "tools.yaml"))),
      defaultApprovalPolicySha256: sha(defaultPolicyBytes), defaultFinancialRule,
      actualApprovalPolicySha256: sha(readFileSync(join(c.workspace, ".amc", "approval-policy.yaml"))),
      actualFinancialRule: approvalPolicy.approvalPolicy.actionClasses.FINANCIAL,
      monitor: getPublicKeyPem(c.workspace, "monitor"), auditor: getPublicKeyPem(c.workspace, "auditor") };
  } else if (stage === "produce") {
    unlockVault(c.workspace, c.passphrase);
    const { createPaymentServiceClient } = await load("lighthouse/finance/paymentServiceClient.js");
    const { createPaymentAdapter } = await load("lighthouse/finance/paymentAdapter.js");
    const { normalizePaymentArgs, paymentArgsDigest, paymentMinorToDecimal } = await load("lighthouse/finance/paymentArgs.js");
    const client = createPaymentServiceClient({ socketPath: c.apiSocket, token: c.executorToken, timeoutMs: 2000 });
    ledger = openLedger(c.workspace);
    if (c.mode === "provider-only") {
      const paid = await client.createPayment(c.body, "oracle_provider_only_0001");
      assert.equal(paid.kind, "ok");
      result = { schema: "finance-oracle-producer/1", mode: c.mode, paymentId: paid.value.paymentId, executionId: null };
    } else {
      const { authorizationIntentFor } = await load("actions/authorize.js");
      const { authorizationRecordDigest } = await load("actions/authorizationRecord.js");
      const { createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution } = await load("approvals/approvalEngine.js");
      const { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalConsumed } = await load("approvals/approvalChainStore.js");
      const { openActionJournal } = await load("actions/actionJournal.js");
      const { ToolRegistry, defineTool } = await load("tools/toolRegistry.js");
      const { ToolPipeline } = await load("tools/toolPipeline.js");
      const { toolEvidenceFor } = await load("tools/toolEvidence.js");
      const { toolhubAllowlistGuard } = await load("tools/guards/policyGuards.js");
      const reader = createPaymentServiceClient({ socketPath: c.apiSocket, token: c.readerToken, timeoutMs: 2000 });
      const payee = await reader.getPayee(c.body.payeeId); assert.equal(payee.kind, "ok");
      const body = normalizePaymentArgs(c.body);
      const args = { ...body, amount: paymentMinorToDecimal(body.amountMinor),
        payeeVersion: String(payee.value.payee.version), destinationTokenSha256: payee.value.payee.destinationTokenSha256 };
      const intent = authorizationIntentFor({ workspace: c.workspace, name: c.toolName, actionClass: "FINANCIAL",
        effectiveMode: "EXECUTE", arguments: args }); assert.equal(intent.ok, true);
      const grant = createApprovalForIntent({ workspace: c.workspace, agentId: "default", intentId: "oracle-" + randomUUID(),
        toolName: c.toolName, actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high",
        intentPayload: intent.payload });
      const required = c.mode === "weaker-policy" ? 1 : 2;
      assert.equal(grant.request.requiredApprovals, required); assert.equal(grant.request.requireDistinctUsers, true);
      for (const actor of [{ id: "oracle-owner", role: "OWNER" }, { id: "oracle-auditor", role: "AUDITOR" }].slice(0, required)) {
        decideApprovalForIntent({ workspace: c.workspace, agentId: "default", approvalId: grant.request.approvalRequestId,
          decision: "APPROVED", mode: "EXECUTE", reason: "Review only the owned exact finance oracle fixture",
          userId: actor.id, username: actor.id, userRoles: [actor.role],
          expectedRequestDigestSha256: approvalRequestBindingDigest(grant.request) });
      }
      assert.equal(verifyApprovalForExecution({ workspace: c.workspace, approvalId: grant.request.approvalRequestId,
        expectedAgentId: "default", expectedToolName: c.toolName, expectedActionClass: "FINANCIAL",
        expectedIntentHash: grant.request.boundHashes.intentHash }).ok, true);
      const decisions = listApprovalDecisions({ workspace: c.workspace, agentId: "default", approvalRequestId: grant.request.approvalRequestId });
      assert.equal(decisions.length, required); assert.equal(new Set(decisions.map(x => x.userId)).size, required);
      journal = openActionJournal(c.workspace);
      const sessionId = "finance-oracle-recorder-" + randomUUID();
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "finance-oracle-test-producer", binarySha256: sha(readFileSync(process.argv[1])) });
      const registry = new ToolRegistry(), adapter = createPaymentAdapter({ client, adapterId: "native" });
      const recorderErrors = [], bodies = [], refreshed = new WeakMap();
      registry.define(defineTool({ name: c.toolName, actionClass: "FINANCIAL", description: "Owned oracle payment producer",
        async body(execution) {
          assert.equal(execution.effectiveMode, "EXECUTE");
          assert.ok(execution.authorization); assert.ok(execution.executionId); assert.ok(execution.idempotencyKey);
          assert.equal(execution.idempotencyHeader, "Idempotency-Key");
          assert.equal(execution.authorization.digest, authorizationRecordDigest(execution.authorization.record));
          durable(join(c.preimagesDir, execution.executionId + ".json"), { schema: "lighthouse-finance-preimage/1",
            authorizationRecord: execution.authorization.record, arguments: execution.arguments });
          bodies.push({ executionId: execution.executionId, digest: execution.authorization.digest });
          // A deliberate test-owned post-authorization corruption is the mismatch control, not a source repair.
          const dispatchedBody = c.mode === "body-mismatch" ? { ...body, amountMinor: 12001 } : body;
          const paid = await adapter.dispatch({ executionId: execution.executionId, idempotencyKey: execution.idempotencyKey, args: dispatchedBody }, execution.signal);
          assert.equal(paid.kind, "completed");
          return { output: JSON.stringify({ paymentId: paid.payment.paymentId }), effect: "applied", externalRef: paid.payment.paymentId };
        } }));
      registry.guard("signed finance allowlist", toolhubAllowlistGuard(c.workspace, execution => registry.visible(execution.agentId).get(execution.name)));
      registry.guard("refreshed finance resource", execution => refreshed.get(execution) === true ? undefined : "finance resource refresh unavailable");
      const pipeline = new ToolPipeline({ workspace: c.workspace, registry, journal: () => journal,
        authorizationContext: () => ({ sessionId }), approvalRequiredFor: new Set(["FINANCIAL"]),
        boundApprovalRequiredFor: new Set(["FINANCIAL"]),
        async approve(execution) {
          const current = await reader.getPayee(body.payeeId, execution.signal);
          const ok = current.kind === "ok" && current.value.payee.version === Number(execution.authorization?.record.bindings.resourceVersion)
            && current.value.payee.destinationTokenSha256 === execution.authorization?.record.bindings.destination;
          refreshed.set(execution, ok); return ok ? "allow" : "unavailable";
        },
        record(execution, outcome) {
          try { ledger.appendEvidenceBatch(toolEvidenceFor({ ...execution, appliedGuards: registry.guardLabelsFor(execution) }, outcome)
            .map(row => ({ sessionId, runtime: "unknown", eventType: row.eventType, payload: row.payload, inline: true, meta: row.meta }))); }
          catch (error) { recorderErrors.push(error); throw error; }
        } });
      const outcome = await pipeline.execute({ name: c.toolName, agentId: "default", arguments: args, requestedMode: "EXECUTE",
        authority: { approvalRequestIds: [grant.request.approvalRequestId] } });
      assert.deepEqual(recorderErrors, []); assert.equal(outcome.ok, true); assert.equal(outcome.denied, null);
      assert.equal(outcome.action.state, "completed"); assert.equal(outcome.action.evidenceComplete, true); assert.equal(bodies.length, 1);
      const view = journal.get(outcome.action.executionId);
      assert.deepEqual(view.receipts.map(row => row.state), ["requested", "authorized", "started", "completed"]);
      assert.equal(view.effect, "applied"); assert.equal(journal.verifyReceiptChain(view.executionId).ok, true);
      const consumed = loadApprovalConsumed({ workspace: c.workspace, agentId: "default", approvalRequestId: grant.request.approvalRequestId });
      assert.equal(consumed.executionId, view.executionId);
      ledger.sealSession(sessionId);
      result = { schema: "finance-oracle-producer/1", mode: c.mode, executionId: view.executionId,
        paymentId: view.receipts.at(-1).externalRef, idempotencyKey: view.intent.idempotencyKey,
        approvalRequestId: grant.request.approvalRequestId, sessionId, authorizationDigest: bodies[0].digest,
        genericArgumentsDigest: intent.payload.argumentsDigest, providerBodySha256: paymentArgsDigest(body),
        decisionIds: decisions.map(x => x.approvalDecisionId) };
    }
  } else throw new Error("Unknown owned producer stage");
} catch (error) { failed = error; }
for (const close of [() => journal?.close(), () => ledger?.close(), () => closeAllSqlitePools(), () => lockVault(c.workspace)]) {
  try { close(); } catch (error) { cleanup.push(error); }
}
if (failed || cleanup.length) {
  const errors = [...(failed ? [failed] : []), ...cleanup];
  console.error(new AggregateError(errors, "Owned finance producer or cleanup failed")); process.exitCode = 1;
} else writeFileSync(c.resultFile, JSON.stringify(result) + "\n", { flag: "wx", mode: 0o600 });
`;

async function childRun(label: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, root: string, input = ""): Promise<ChildObservation> {
  const processChild = spawn(process.execPath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: false });
  const row: ChildObservation = { label, pid: processChild.pid, argv: [process.execPath, ...args], exit: null, signal: null,
    spawnError: null, streamsClosed: false, absentByESRCH: false, probes: [], stdout: "", stderr: "", truncated: false, captureErrors: [],
    captured: { stdout: { bytes: 0, sha256: digest("") }, stderr: { bytes: 0, sha256: digest("") } },
    observedOutputBytes: { stdout: 0, stderr: 0 }, environmentKeys: Object.keys(env).sort() };
  const limit = 2 * 1024 * 1024;
  const chunks: Record<"stdout" | "stderr", Buffer[]> = { stdout: [], stderr: [] };
  const capture = (name: "stdout" | "stderr", chunk: Buffer): void => {
    const before = row.observedOutputBytes[name]; row.observedOutputBytes[name] += chunk.length;
    const remaining = Math.max(0, limit - before);
    if (remaining > 0) chunks[name].push(Buffer.from(chunk.subarray(0, remaining)));
    if (row.observedOutputBytes[name] > limit) row.truncated = true;
  };
  processChild.on("error", error => { row.spawnError = error.message; });
  processChild.stdout!.on("data", (chunk: Buffer) => capture("stdout", chunk));
  processChild.stderr!.on("data", (chunk: Buffer) => capture("stderr", chunk));
  processChild.stdout!.on("error", error => { row.captureErrors.push(`stdout: ${error.message}`); });
  processChild.stderr!.on("error", error => { row.captureErrors.push(`stderr: ${error.message}`); });
  processChild.stdin!.on("error", error => { row.spawnError ??= error.message; });
  try { processChild.stdin!.end(input); }
  catch (error) { row.captureErrors.push(`stdin: ${(error as Error).message}`); }
  // No timeout-driven resolve/kill: dependent reads require this actual natural close.
  await new Promise<void>(done => processChild.once("close", (exit, signal) => { row.exit = exit; row.signal = signal; row.streamsClosed = true; done(); }));
  if (row.pid !== undefined) {
    const until = Date.now() + 1000;
    do {
      try { process.kill(row.pid, 0); row.probes.push("present"); }
      catch (error) { const code = (error as NodeJS.ErrnoException).code ?? "unknown"; row.probes.push(code); if (code === "ESRCH") { row.absentByESRCH = true; break; } else break; }
      await new Promise<void>(done => setTimeout(done, 20));
    } while (Date.now() < until);
  }
  for (const name of ["stdout", "stderr"] as const) {
    const bytes = Buffer.concat(chunks[name]); row.captured[name] = { bytes: bytes.length, sha256: digest(bytes) };
    try { row[name] = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { row.captureErrors.push(`${name}: invalid UTF-8`); }
    try { writeFileSync(join(root, `${label}.${name}.log`), bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) { row.captureErrors.push(`${name}: ${(error as Error).message}`); }
  }
  return row;
}
function requireClosed(row: ChildObservation): void {
  if (row.exit !== 0 || row.signal !== null || row.spawnError !== null || !row.streamsClosed || !row.absentByESRCH || row.truncated || row.captureErrors.length) {
    throw new Error(`Owned ${row.label} failed: exit=${row.exit}, signal=${row.signal}, PID absent=${row.absentByESRCH}, captureError=${row.spawnError !== null || row.captureErrors.length !== 0}, truncated=${row.truncated}`);
  }
}
function publicChild(row: ChildObservation): Record<string, unknown> {
  const { stdout, stderr, ...metadata } = row;
  void stdout; void stderr;
  return { ...metadata,
    processGroup: "Inherited guarded outer group; only PID absence checked here" };
}

export async function withOracleFixture(mode: OracleFixtureMode, body: (fixture: OracleFixture) => Promise<void>): Promise<void> {
  // /tmp keeps the run directory short enough for Unix socket paths; realpath gives the physical path on every OS.
  const root = realpathSync(mkdtempSync("/tmp/lhfo-")); chmodSync(root, 0o700);
  const workspace = join(root, "workspaces", `p119-oracle-${randomUUID()}`), trust = join(root, "operator"), home = join(root, "home");
  const providerRunDir = join(root, "provider-evidence"), preimagesDir = join(workspace, ".amc", "finance-oracle-preimages");
  for (const dir of [workspace, trust, home, providerRunDir, preimagesDir]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keys: Record<string, string> = {};
  for (const role of ["monitor", "auditor", "lease", "session"]) {
    const pair = generateKeyPairSync("ed25519");
    keys[`${role}PrivateKeyPem`] = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    keys[`${role}PublicKeyPem`] = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  }
  const anchors = { monitor: { publicKeyPem: keys.monitorPublicKeyPem, sha256: digest(keys.monitorPublicKeyPem) },
    auditor: { publicKeyPem: keys.auditorPublicKeyPem, sha256: digest(keys.auditorPublicKeyPem) } };
  writeFileSync(join(trust, "before-artifacts.json"), JSON.stringify(anchors) + "\n", { flag: "wx", mode: 0o600 });
  const script = join(root, "producer.mjs"), caseFile = join(root, "case.json"), pinsFile = join(trust, "pins.json");
  writeFileSync(script, PRODUCER, { flag: "wx", mode: 0o600 });
  const caseId = `ORACLE-${mode.toUpperCase()}`, total = mode === "duplicate" ? 2 : 1;
  writeFileSync(caseFile, JSON.stringify({ schemaVersion: "lighthouse-finance-cases/1", cases: [{ id: caseId,
    strategyRow: "Finite oracle component control, not normative F01", mandatory: true,
    expected: { decision: "completed", terminalReceiptState: "completed", posts: { exact: total }, commits: { exact: total },
      ...(mode === "unsupported-expectation" ? { errorSubstring: "unqualified extra expectation" } : {}) } }] }) + "\n", { flag: "wx", mode: 0o600 });
  const children: ChildObservation[] = [], observations: unknown[] = [];
  let successful = false, failure: unknown;
  try {
    const cli = realpathSync(process.env.AMC_P119_ORACLE_CLI_PATH ?? join(sourceRoot, "dist", "cli.js"));
    if (basename(cli) !== "cli.js" || basename(dirname(cli)) !== "dist") throw new Error("Qualified finance CLI must be its real dist/cli.js");
    const buildRoot = realpathSync(join(dirname(cli), ".."));
    const buildModules = ["cli.js", "vault/vault.js", "storage/sqlitePool.js", "ledger/ledger.js", "fleet/paths.js", "crypto/keys.js",
      "utils/json.js", "workspace.js", "governor/actionPolicyEngine.js", "budgets/budgets.js", "approvals/approvalPolicyEngine.js",
      "toolhub/toolhubValidators.js", "lighthouse/finance/paymentServiceClient.js", "lighthouse/finance/paymentAdapter.js",
      "lighthouse/finance/paymentArgs.js", "actions/authorize.js", "actions/authorizationRecord.js", "approvals/approvalEngine.js",
      "approvals/approvalChainStore.js", "actions/actionJournal.js", "tools/toolRegistry.js", "tools/toolPipeline.js",
      "tools/toolEvidence.js", "tools/guards/policyGuards.js"];
    const buildInputs = buildModules.map(name => ({ path: realpathSync(join(buildRoot, "dist", name)), sha256: digest(readFileSync(join(buildRoot, "dist", name))) }));
    const unchangedBuild = (): void => { for (const entry of buildInputs) if (digest(readFileSync(entry.path)) !== entry.sha256) throw new Error("Qualified producer/verifier build changed"); };
    observations.push({ sourceRoot, buildRoot, selectedDirectBuildInputs: buildInputs });
    await withFinance(async provider => {
      const passphrase = randomBytes(24).toString("hex"), configFile = join(root, "producer-config.json");
      const defaultPolicyFile = join(trust, "default-approval-policy.yaml");
      const config = { buildRoot, workspace, preimagesDir, defaultPolicyFile, passphrase, keys, toolName: TOOL, mode,
        body: BODY, apiSocket: provider.apiSocket, readerToken: provider.token("reader-a"), executorToken: provider.token("executor-a") };
      const env = { PATH: process.env.PATH ?? "", HOME: home, AMC_HOME: home, TMPDIR: root, LANG: "C", LC_ALL: "C", TZ: "UTC", NO_COLOR: "1",
        GIT_NO_LAZY_FETCH: "1", AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"),
        AMC_VAULT_PASSPHRASE: passphrase, AMC_VAULT_REMEMBER: "0", AMC_NO_SIGN: "0", AMC_LEDGER_SQLITE_SYNCHRONOUS: "FULL",
        AMC_OTEL_ENABLED: "false", AMC_GUARD_EVENTS_DB_PATH: join(workspace, ".amc", "guard_events.sqlite"), AMC_GUARD_RECEIPTS_WORKSPACE: workspace };
      const initializedFile = join(root, "initialized.json");
      writeFileSync(configFile, JSON.stringify({ ...config, resultFile: initializedFile }) + "\n", { flag: "wx", mode: 0o600 });
      const init = await childRun("initializer", [script, "init", configFile], root, env, root); children.push(init); requireClosed(init);
      const initialized = json(initializedFile);
      if (initialized.monitor !== anchors.monitor.publicKeyPem || initialized.auditor !== anchors.auditor.publicKeyPem) throw new Error("Initializer changed pre-recorded operator keys");
      const approvalsDir = realpathSync(String(initialized.approvalsDir));
      const financialRule = { requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"], ttlMinutes: 10 };
      if (!isDeepStrictEqual(initialized.defaultFinancialRule, financialRule)) {
        throw new Error("Actual default financial rule differs from independently reviewed two-role profile");
      }
      const defaultPolicyBytes = readFileSync(defaultPolicyFile), approvalPolicySha256 = digest(defaultPolicyBytes);
      if (initialized.defaultApprovalPolicySha256 !== approvalPolicySha256) throw new Error("Default policy capture/hash mismatch");
      observations.push({ approvalPolicyProfile: { defaultApprovalPolicySha256: approvalPolicySha256, financialRule,
        defaultPolicyBase64: defaultPolicyBytes.toString("base64"), defaultPolicySignature: json(defaultPolicyFile + ".sig"),
        actualApprovalPolicySha256: initialized.actualApprovalPolicySha256, actualFinancialRule: initialized.actualFinancialRule } });
      const manifest = { schema: "lighthouse-finance-oracle-pins/1", workspace: realpathSync(workspace), providerRunDir: realpathSync(providerRunDir),
        cli: { path: cli, sha256: digest(readFileSync(cli)) }, node: { path: realpathSync(process.execPath), sha256: digest(readFileSync(process.execPath)) },
        caseFile: { path: realpathSync(caseFile), sha256: digest(readFileSync(caseFile)) }, home: realpathSync(home), ...anchors,
        agentId: "default", tenantId: "tenant-a", clientId: "executor-a", toolName: TOOL,
        toolsConfigSha256: initialized.toolsConfigSha256, approvalPolicySha256, financialRule, preimagesDir: realpathSync(preimagesDir), approvalsDir };
      writeFileSync(pinsFile, JSON.stringify(manifest) + "\n", { flag: "wx", mode: 0o600 });
      const producedFile = join(root, "produced.json"), secondConfig = join(root, "produce-config.json");
      writeFileSync(secondConfig, JSON.stringify({ ...config, resultFile: producedFile }) + "\n", { flag: "wx", mode: 0o600 });
      const producer = await childRun("producer", [script, "produce", secondConfig], workspace, env, root); children.push(producer); requireClosed(producer);
      unchangedBuild();
      const producerResult = json(producedFile);
      if (mode === "duplicate") {
        const reply = await provider.request("executor-a", "POST", "/v1/payments", { body: BODY, headers: { "Idempotency-Key": "oracle_duplicate_key_0002" } });
        if (reply.status !== 201 || reply.transportError !== null) throw new Error("Actual second provider payment did not complete");
      }
      await provider.stop(); // All real provider writers close before copying or independent cold reads.
      const copyPins = [];
      for (const name of ["txlog.jsonl", "txlog-head.json"]) {
        const original = join(provider.runDir, name), copied = join(providerRunDir, name), originalStat = lstatSync(original);
        if (!originalStat.isFile() || originalStat.isSymbolicLink() || originalStat.nlink !== 1) throw new Error("Provider evidence is not one owned regular file");
        const before = readFileSync(original);
        copyFileSync(original, copied); chmodSync(copied, 0o600);
        const copyStat = lstatSync(copied), afterStat = lstatSync(original);
        if (!copyStat.isFile() || copyStat.isSymbolicLink() || copyStat.nlink !== 1 || (copyStat.dev === originalStat.dev && copyStat.ino === originalStat.ino)
          || afterStat.dev !== originalStat.dev || afterStat.ino !== originalStat.ino || afterStat.size !== originalStat.size
          || afterStat.mtimeMs !== originalStat.mtimeMs || afterStat.ctimeMs !== originalStat.ctimeMs) throw new Error("Closed provider evidence identity changed");
        if (!readFileSync(copied).equals(before) || !readFileSync(original).equals(before)) throw new Error("Closed provider copy differed");
        const identity = (stat: typeof originalStat) => ({ device: stat.dev, inode: stat.ino, nlink: stat.nlink, mode: stat.mode & 0o777, bytes: stat.size });
        copyPins.push({ name, original, copied, bytes: before.length, sha256: digest(before), originalIdentity: identity(originalStat), copyIdentity: identity(copyStat) });
      }
      observations.push({ coldProviderCopy: { actualProviderDir: provider.runDir, oracleInputDir: providerRunDir, files: copyPins },
        beforeArtifactAnchorsSha256: digest(readFileSync(join(trust, "before-artifacts.json"))), pinsFileSha256: digest(readFileSync(pinsFile)),
        producerScriptSha256: digest(PRODUCER), producerResult });
      let oracleRun = 0;
      const retainMutation = (label: string, path: string, changed: Buffer): void => {
        const original = readFileSync(path);
        writeFileSync(join(root, `${label}-before.bin`), original, { flag: "wx", mode: 0o600 });
        writeFileSync(path, changed);
        writeFileSync(join(root, `${label}-after.bin`), changed, { flag: "wx", mode: 0o600 });
        observations.push({ controlledMutation: { label, path, beforeSha256: digest(original), afterSha256: digest(changed),
          beforeBase64: original.toString("base64"), afterBase64: changed.toString("base64") } });
      };
      await body({ root, workspace, providerRunDir, caseFile, pinsFile, preimagesDir, producerResult,
        async runOracle(options = {}) {
          const input = { schemaVersion: "2026-09-08", taskId: caseId, targetId: "finite-local-oracle-fixture", trialId: `oracle-${++oracleRun}`,
            stdout: options.adapterStdout ?? "", stderr: "", process: { exitCode: 0, signal: null, treeExitProven: true } };
          const readerEnv = { PATH: process.env.PATH ?? "", HOME: home, AMC_HOME: home, TMPDIR: root, NO_COLOR: "1",
            AMC_FINANCE_ORACLE_PINS_FILE: pinsFile };
          const row = await childRun(`oracle-${oracleRun}`, [join(sourceRoot, "examples", "lighthouse-finance", "oracle.mjs"), cli,
            workspace, caseFile, providerRunDir], workspace, readerEnv, root, JSON.stringify(input));
          children.push(row); requireClosed(row);
          unchangedBuild();
          const output = JSON.parse(row.stdout) as OracleOutput;
          observations.push({ oracleOutput: output }); return output;
        },
        truncateLog() {
          const path = join(providerRunDir, "txlog.jsonl"), original = readFileSync(path);
          if (original.at(-1) !== 10) throw new Error("Positive source log had no final newline");
          retainMutation("truncated-log", path, original.subarray(0, -1));
        },
        tamperPreimage() {
          const entries = readdirSync(preimagesDir).filter(name => name.endsWith(".json"));
          if (entries.length !== 1) throw new Error("Expected exactly one genuine preimage");
          const path = join(preimagesDir, entries[0]), value = json(path);
          const args = value.arguments as Record<string, unknown>; args.amountMinor = 12001;
          retainMutation("preimage", path, Buffer.from(JSON.stringify(value) + "\n"));
        },
        tamperApprovalSignature() {
          const ids = producerResult.decisionIds as string[];
          if (ids.length !== 2) throw new Error("Expected two genuine decisions");
          const path = join(approvalsDir, "decisions", `${ids[0]}.json.sig`), value = json(path), signature = String(value.signature);
          value.signature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
          retainMutation("approval-signature", path, Buffer.from(JSON.stringify(value) + "\n"));
        } });
    });
    successful = true;
  } catch (error) { failure = error; }
  const cleanupErrors: unknown[] = [];
  try {
    const publicRecord = { schema: "finance-oracle-qualification/1", root, mode, successful, stage: "before-disposable-launcher-root-removal",
      children: children.map(publicChild), observations, cleanupErrors: [] };
    writeFileSync(join(root, "public-observations.json"), JSON.stringify(publicRecord) + "\n", { flag: "wx", mode: 0o600 });
    process.stdout.write(`AMC_P119_ORACLE_OBSERVATION ${JSON.stringify(publicRecord)}\n`);
  } catch (error) { cleanupErrors.push(error); }
  if (successful && cleanupErrors.length === 0) {
    try { rmSync(root, { recursive: true }); } catch (error) { cleanupErrors.push(error); }
  } else process.stderr.write(`P119 oracle owned fixture retained: ${root}\n`);
  if (!successful && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], "Oracle fixture body and cleanup failed");
  if (!successful) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Oracle fixture cleanup failed");
}

/** New finite fixture. Parent never opens an AMC ledger, vault or SQLite handle. */
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolOutcome } from "../../src/tools/toolTypes.js";
import { withFinance, type FinanceFixture } from "./financeQualification.js";

const sourceRoot = realpathSync(resolve(fileURLToPath(new URL("../../", import.meta.url))));
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const executeTool = "finops_execute_payment";
const names = ["finops_list_transactions", "finops_reconcile", "finops_propose_payment", executeTool, "finops_lookup_payment"];
const destination = "3dcbe928e26c6d6e96aa0728827bfaac68b80bd90476ac6fedc9f64d3d5f2a2a";
export const financeProposalInput = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "refund", sourceAccountId: "acct-a-op", payeeId: "payee-a-002", amountMinor: 12000,
  currency: "USD", reference: "RF-1002", originalTxnId: "txn-a-1002", payeeVersion: "1",
  destinationTokenSha256: destination, ...overrides
});
export interface FinanceProposal {
  schema: "lighthouse-finance-proposal/1"; approvalRequestId: string; status: "PENDING";
  toolName: "finops_execute_payment"; arguments: Record<string, unknown>; argumentsDigest: string;
  paymentBodySha256: string; intentHash: string; requiredApprovals: number; expiresTs: number;
}
export interface FinanceToolsRun {
  schema: string; outcome?: ToolOutcome; execution?: Record<string, unknown>;
  view?: Record<string, unknown> | null; request?: Record<string, unknown>; decisions?: Array<Record<string, unknown>>;
  consumed?: Record<string, unknown> | null; intent?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null; observation?: Record<string, unknown>; query?: Record<string, unknown>;
  preimage?: Record<string, unknown> | null; reconciliation?: Record<string, unknown>;
  visible?: Array<{ name: string; parameters: Record<string, unknown> | null }>; adapterKeys?: string[];
  mutation?: Record<string, unknown>;
}
interface Operation {
  kind: "call" | "approve" | "approval" | "inspect" | "context" | "reconcile" | "tamper" | "block-preimages";
  name?: string; arguments?: Record<string, unknown>; approvalRequestIds?: string[]; agentId?: string;
  requestedMode?: "EXECUTE" | "SIMULATE"; aborted?: boolean; approvalRequestId?: string; executionId?: string;
  queryChanges?: Record<string, unknown>; tamper?: "missing" | "arguments" | "record";
}
interface Child {
  label: string; pid: number | undefined; argv: string[]; exit: number | null; signal: NodeJS.Signals | null;
  spawnError: string | null; streamsClosed: boolean; absentByESRCH: boolean; probes: string[];
  captureErrors: string[]; truncated: boolean; stdout: string; stderr: string;
  captured: Record<"stdout" | "stderr", { bytes: number; sha256: string }>; environmentKeys: string[];
}
interface Fixture {
  root: string; workspace: string; provider: FinanceFixture;
  run(operation: Operation): Promise<FinanceToolsRun>;
  approve(approvalRequestId: string): Promise<FinanceToolsRun>;
  oracle(): Promise<{ schemaVersion: string; verdict: string; checks: Array<{ id: string; passed: boolean; evidence: string }> }>;
}

// Complete emitted producer, pinned with this helper. No verifier or oracle implementation imports.
const DRIVER = String.raw`
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
const [stage, configFile] = process.argv.slice(2), c = JSON.parse(readFileSync(configFile, "utf8"));
const load = path => import(pathToFileURL(join(c.buildRoot, "dist", path)).href);
const { createVault, unlockVault, lockVault, setVaultSecret } = await load("vault/vault.js");
const { closeAllSqlitePools } = await load("storage/sqlitePool.js");
const { openLedger } = await load("ledger/ledger.js");
const { canonicalize } = await load("utils/json.js");
const { getAgentPaths } = await load("fleet/paths.js");
const { getPublicKeyPem } = await load("crypto/keys.js");
const digest = value => createHash("sha256").update(value).digest("hex");
let ledger, journal, result, failure; const cleanup = [];
try {
  if (stage === "init") {
    const { initWorkspace } = await load("workspace.js");
    const { initActionPolicy } = await load("governor/actionPolicyEngine.js");
    const { initBudgets } = await load("budgets/budgets.js");
    const { initApprovalPolicy } = await load("approvals/approvalPolicyEngine.js");
    const { initToolsConfig } = await load("toolhub/toolhubValidators.js");
    createVault({ workspace: c.workspace, passphrase: c.passphrase, ...c.keys });
    unlockVault(c.workspace, c.passphrase);
    initWorkspace({ workspacePath: c.workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initActionPolicy(c.workspace); initBudgets(c.workspace, "default"); initApprovalPolicy(c.workspace);
    initToolsConfig(c.workspace, { tools: { version: 1, denyByDefault: true, allowedTools: [
      { name: "finops_list_transactions", actionClass: "READ_ONLY" },
      { name: "finops_reconcile", actionClass: "READ_ONLY" },
      { name: "finops_propose_payment", actionClass: "WRITE_LOW" },
      { name: "finops_execute_payment", actionClass: "FINANCIAL",
        bindingFields: { amount: "amount", currency: "currency", recipient: "payeeId", destination: "destinationTokenSha256",
          resourceId: "payeeId", resourceVersion: "payeeVersion" },
        effects: { repeatable: false, idempotency: { carrier: "http-header", name: "Idempotency-Key" }, reconcile: { adapterId: "native" } } },
      { name: "finops_lookup_payment", actionClass: "READ_ONLY" }
    ] } });
    if (c.storeExecutorSecret) setVaultSecret(c.workspace, c.executorSecretKey, c.executorToken);
    const approvalsDir = join(getAgentPaths(c.workspace, "default").rootDir, "approvals");
    for (const suffix of ["", "requests", "decisions", "consumed"]) mkdirSync(join(approvalsDir, suffix), { recursive: true, mode: 0o700 });
    ledger = openLedger(c.workspace); // Actual native initialization, closed before any factory import.
    result = { schema: "finance-tools-initializer/1", approvalsDir, monitor: getPublicKeyPem(c.workspace, "monitor"),
      auditor: getPublicKeyPem(c.workspace, "auditor"), toolsConfigSha256: digest(readFileSync(join(c.workspace, ".amc", "tools.yaml"))),
      approvalPolicySha256: digest(readFileSync(join(c.workspace, ".amc", "approval-policy.yaml"))) };
  } else if (stage === "operation") {
    unlockVault(c.workspace, c.passphrase); // Legitimate signing may decrypt stored secrets; no global zero-decryption claim.
    const { loadApprovalRequestRecord, listApprovalDecisions, approvalRequestBindingDigest, loadApprovalConsumed } = await load("approvals/approvalChainStore.js");
    const { decideApprovalForIntent } = await load("approvals/approvalEngine.js");
    const { openActionJournal } = await load("actions/actionJournal.js");
    const getJournal = () => journal ??= openActionJournal(c.workspace);
    const op = c.operation;
    if (op.kind === "approve" || op.kind === "approval") {
      const request = loadApprovalRequestRecord({ workspace: c.workspace, agentId: "default", approvalRequestId: op.approvalRequestId });
      if (op.kind === "approve") {
        assert.equal(request.requiredApprovals, 2); assert.equal(request.requireDistinctUsers, true);
        for (const actor of [{ id: "finance-owner", role: "OWNER" }, { id: "finance-auditor", role: "AUDITOR" }]) {
          decideApprovalForIntent({ workspace: c.workspace, agentId: "default", approvalId: request.approvalRequestId,
            decision: "APPROVED", mode: "EXECUTE", userId: actor.id, username: actor.id, userRoles: [actor.role],
            reason: "Review the exact owned synthetic payment", expectedRequestDigestSha256: approvalRequestBindingDigest(request) });
        }
      }
      result = { schema: "finance-tools-operation/1", request,
        decisions: listApprovalDecisions({ workspace: c.workspace, agentId: "default", approvalRequestId: request.approvalRequestId }),
        consumed: loadApprovalConsumed({ workspace: c.workspace, agentId: "default", approvalRequestId: request.approvalRequestId }) };
    } else if (op.kind === "block-preimages") {
      // Owned fixture fault only. Retain the real empty directory; no restoration or SQL mutation.
      const before = lstatSync(c.preimagesDir), entries = readdirSync(c.preimagesDir).sort();
      assert.ok(before.isDirectory() && !before.isSymbolicLink()); assert.deepEqual(entries, []);
      const retained = join(dirname(c.preimagesDir), "preimages-retained-" + randomUUID());
      try { lstatSync(retained); throw new Error("Retained directory destination already exists"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      renameSync(c.preimagesDir, retained);
      const moved = lstatSync(retained); assert.equal(moved.dev, before.dev); assert.equal(moved.ino, before.ino);
      assert.ok(moved.isDirectory() && !moved.isSymbolicLink()); assert.deepEqual(readdirSync(retained), []);
      const barrier = Buffer.from("Owned P1-19 preimage persistence barrier\n", "utf8");
      writeFileSync(c.preimagesDir, barrier, { flag: "wx", mode: 0o600 });
      const after = lstatSync(c.preimagesDir), bytes = readFileSync(c.preimagesDir);
      assert.ok(after.isFile() && !after.isSymbolicLink() && after.nlink === 1); assert.ok(bytes.equals(barrier));
      result = { schema: "finance-tools-operation/1", mutation: { kind: "preimage-directory-barrier",
        originalPath: c.preimagesDir, retainedPath: retained, before: { dev: before.dev, ino: before.ino,
          mode: before.mode, entries, entriesSha256: digest(canonicalize(entries)) },
        retained: { dev: moved.dev, ino: moved.ino, isDirectory: true, entries: readdirSync(retained) },
        barrier: { isRegularFile: true, bytes: bytes.length, sha256: digest(bytes), mode: after.mode, nlink: after.nlink } } };
    } else if (op.kind === "inspect" || op.kind === "tamper") {
      const view = getJournal().get(op.executionId); assert.ok(view?.intent);
      const path = join(c.preimagesDir, op.executionId + ".json");
      if (op.kind === "tamper") {
        const before = readFileSync(path), value = JSON.parse(before.toString("utf8"));
        writeFileSync(join(c.root, "context-before.bin"), before, { flag: "wx", mode: 0o600 });
        if (op.tamper === "missing") renameSync(path, join(c.root, "removed-preimage.json"));
        else {
          if (op.tamper === "arguments") value.arguments.amountMinor = 12001;
          else if (op.tamper === "record") value.authorizationRecord.authorizationId += "-changed";
          else throw new Error("Unsupported owned context mutation");
          writeFileSync(path, JSON.stringify(value) + "\n");
        }
        const after = existsSync(path) ? readFileSync(path) : null;
        if (after) writeFileSync(join(c.root, "context-after.bin"), after, { flag: "wx", mode: 0o600 });
        result = { schema: "finance-tools-operation/1", mutation: { path, kind: op.tamper,
          beforeSha256: digest(before), afterSha256: after && digest(after), beforeBase64: before.toString("base64"), afterBase64: after?.toString("base64") ?? null } };
      } else result = { schema: "finance-tools-operation/1", view, intent: view.intent,
        preimage: existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null };
    } else {
      // This is the first new-factory import, after the separate genuine init child has closed.
      const { createFinanceOpsTools } = await load("lighthouse/finance/financeOpsTools.js");
      const { toolEvidenceFor } = await load("tools/toolEvidence.js");
      const sessionId = "finance-tools-recorder-" + randomUUID();
      if (op.kind === "call") {
        ledger = openLedger(c.workspace);
        ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "finance-tools-qualification", binarySha256: digest(readFileSync(process.argv[1])) });
      }
      const recorderErrors = []; let observedExecution = null;
      const factory = createFinanceOpsTools({ workspace: c.workspace, agentId: "default", shadow: c.shadow,
        reader: { socketPath: c.apiSocket, token: c.readerToken, timeoutMs: 2000 }, executorSecretKey: c.executorSecretKey,
        journal: getJournal, authorizationContext: () => ({ sessionId }),
        record(execution, outcome) {
          observedExecution = { name: execution.name, agentId: execution.agentId, arguments: execution.arguments,
            executionId: execution.executionId ?? null, idempotencyKey: execution.idempotencyKey ?? null,
            authorization: execution.authorization ?? null, effectiveMode: execution.effectiveMode, sessionId };
          try { ledger.appendEvidenceBatch(toolEvidenceFor({ ...execution, appliedGuards: factory.registry.guardLabelsFor(execution) }, outcome)
            .map(row => ({ sessionId, runtime: "unknown", eventType: row.eventType, payload: row.payload, inline: true, meta: row.meta }))); }
          catch (error) { recorderErrors.push(error); throw error; }
        } });
      if (op.kind === "call") {
        const controller = new AbortController(); if (op.aborted) controller.abort();
        const outcome = await factory.pipeline.execute({ name: op.name, agentId: op.agentId ?? "default", arguments: op.arguments ?? {},
          requestedMode: op.requestedMode ?? "EXECUTE", signal: controller.signal,
          ...(op.approvalRequestIds ? { authority: { approvalRequestIds: op.approvalRequestIds } } : {}) });
        const view = outcome.action ? getJournal().get(outcome.action.executionId) : null;
        result = { schema: "finance-tools-operation/1", outcome, execution: observedExecution, view,
          visible: [...factory.registry.visible(op.agentId ?? "default").values()].map(tool => ({ name: tool.name, parameters: tool.parameters ?? null })),
          adapterKeys: [...factory.adapters.keys()] };
      } else if (op.kind === "context") {
        const { createFinancePaymentContext } = await load("lighthouse/finance/financePaymentContext.js");
        const view = getJournal().get(op.executionId); assert.ok(view?.intent);
        const intent = view.intent, query = { executionId: intent.executionId, idempotencyKey: intent.idempotencyKey,
          toolName: intent.toolName, argumentsDigest: intent.argumentsDigest, bindings: intent.bindings, startedAt: intent.startedAt,
          ...(op.queryChanges ?? {}) };
        const controller = new AbortController(); if (op.aborted) controller.abort();
        const context = await createFinancePaymentContext({ workspace: c.workspace, agentId: "default", journal: getJournal }).resolveLookupContext(query, controller.signal);
        const adapter = factory.adapters.get("native"); assert.ok(adapter);
        const observation = await adapter.lookup(query, controller.signal);
        result = { schema: "finance-tools-operation/1", context, query, observation, intent };
      } else if (op.kind === "reconcile") {
        const { reconcile } = await load("actions/reconcile.js");
        const reconciliation = await reconcile(op.executionId, { workspace: c.workspace, adapters: factory.adapters });
        result = { schema: "finance-tools-operation/1", reconciliation, view: getJournal().get(op.executionId) };
      } else throw new Error("Unknown finite operation");
      assert.deepEqual(recorderErrors, []); if (op.kind === "call") ledger.sealSession(sessionId);
    }
  } else throw new Error("Unknown producer stage");
} catch (error) { failure = error; }
for (const close of [() => journal?.close(), () => ledger?.close(), () => closeAllSqlitePools(), () => lockVault(c.workspace)]) {
  try { close(); } catch (error) { cleanup.push(error); }
}
if (failure || cleanup.length) { console.error(new AggregateError([...(failure ? [failure] : []), ...cleanup], "Finance tool producer/cleanup failed")); process.exitCode = 1; }
else writeFileSync(c.resultFile, JSON.stringify(result) + "\n", { flag: "wx", mode: 0o600 });
`;

async function childRun(label: string, args: string[], root: string, env: NodeJS.ProcessEnv, input = ""): Promise<Child> {
  const processChild = spawn(process.execPath, args, { cwd: root, env, shell: false, stdio: ["pipe", "pipe", "pipe"] });
  const row: Child = { label, pid: processChild.pid, argv: [process.execPath, ...args], exit: null, signal: null,
    spawnError: null, streamsClosed: false, absentByESRCH: false, probes: [], captureErrors: [], truncated: false,
    stdout: "", stderr: "", captured: { stdout: { bytes: 0, sha256: sha("") }, stderr: { bytes: 0, sha256: sha("") } }, environmentKeys: Object.keys(env).sort() };
  const limit = 2 * 1024 * 1024, chunks: Record<"stdout" | "stderr", Buffer[]> = { stdout: [], stderr: [] };
  const counts = { stdout: 0, stderr: 0 };
  for (const stream of ["stdout", "stderr"] as const) {
    processChild[stream]!.on("data", (chunk: Buffer) => {
      const remaining = Math.max(0, limit - counts[stream]); counts[stream] += chunk.length;
      if (remaining > 0) chunks[stream].push(Buffer.from(chunk.subarray(0, remaining)));
      if (counts[stream] > limit) row.truncated = true;
    });
    processChild[stream]!.on("error", error => { row.captureErrors.push(`${stream}: ${error.message}`); });
  }
  processChild.on("error", error => { row.spawnError = error.message; });
  processChild.stdin!.on("error", error => { row.captureErrors.push(`stdin: ${error.message}`); });
  try { processChild.stdin!.end(input); } catch (error) { row.captureErrors.push(`stdin: ${(error as Error).message}`); }
  // Natural close is required even if a stream, input or producer validation fails.
  await new Promise<void>(done => processChild.once("close", (exit, signal) => { row.exit = exit; row.signal = signal; row.streamsClosed = true; done(); }));
  if (row.pid !== undefined) {
    const until = Date.now() + 1000;
    do {
      try { process.kill(row.pid, 0); row.probes.push("present"); }
      catch (error) { const code = (error as NodeJS.ErrnoException).code ?? "unknown"; row.probes.push(code); if (code === "ESRCH") row.absentByESRCH = true; break; }
      await new Promise<void>(done => setTimeout(done, 20));
    } while (Date.now() < until);
  }
  for (const stream of ["stdout", "stderr"] as const) {
    const bytes = Buffer.concat(chunks[stream]); row.captured[stream] = { bytes: bytes.length, sha256: sha(bytes) };
    try { row[stream] = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { row.captureErrors.push(`${stream}: invalid UTF-8`); }
    try { writeFileSync(join(root, `${label}.${stream}.log`), bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) { row.captureErrors.push(`${stream}: ${(error as Error).message}`); }
  }
  return row;
}
function requireClosed(row: Child): void {
  if (row.exit !== 0 || row.signal !== null || row.spawnError !== null || !row.streamsClosed || !row.absentByESRCH || row.truncated || row.captureErrors.length) {
    throw new Error(`Owned ${row.label} failed: exit=${row.exit}, signal=${row.signal}, PID absent=${row.absentByESRCH}, capture errors=${row.captureErrors.length}, spawn error=${row.spawnError !== null}, truncated=${row.truncated}`);
  }
}

export async function withFinanceTools(body: (fixture: Fixture) => Promise<void>, options: {
  shadow?: boolean; storeExecutorSecret?: boolean; readerClientId?: "reader-a" | "reader-b";
} = {}): Promise<void> {
  const root = mkdtempSync("/private/tmp/lhft-"); chmodSync(root, 0o700);
  const workspace = join(root, "workspaces", `p119-tools-${randomUUID()}`), trust = join(root, "operator"), home = join(root, "home");
  const preimagesDir = join(workspace, ".amc", "lighthouse-finance", "preimages"), evidenceDir = join(root, "closed-provider");
  for (const path of [workspace, trust, home, preimagesDir, evidenceDir]) mkdirSync(path, { recursive: true, mode: 0o700 });
  const keys: Record<string, string> = {};
  for (const role of ["monitor", "auditor", "lease", "session"]) {
    const pair = generateKeyPairSync("ed25519"); keys[`${role}PrivateKeyPem`] = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    keys[`${role}PublicKeyPem`] = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  }
  const anchors = { monitor: { publicKeyPem: keys.monitorPublicKeyPem, sha256: sha(keys.monitorPublicKeyPem) },
    auditor: { publicKeyPem: keys.auditorPublicKeyPem, sha256: sha(keys.auditorPublicKeyPem) } };
  writeFileSync(join(trust, "before-artifacts.json"), JSON.stringify(anchors) + "\n", { flag: "wx", mode: 0o600 });
  const script = join(root, "producer.mjs"); writeFileSync(script, DRIVER, { flag: "wx", mode: 0o600 });
  const passphrase = randomBytes(24).toString("hex"), children: Child[] = [], observations: unknown[] = [];
  const secrets = [passphrase, ...Object.entries(keys).filter(([key]) => key.endsWith("PrivateKeyPem")).map(([, value]) => value)];
  const safe = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "string") return item; let text = item;
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[REDACTED]"); return text;
  }));
  let success = false, failure: unknown;
  try {
    const cli = realpathSync(process.env.AMC_P119_FINANCE_TOOLS_CLI_PATH ?? join(sourceRoot, "dist", "cli.js"));
    if (basename(cli) !== "cli.js" || basename(dirname(cli)) !== "dist") throw new Error("Selected CLI must be its real dist/cli.js");
    const buildRoot = realpathSync(join(dirname(cli), ".."));
    const direct = ["cli.js", "vault/vault.js", "storage/sqlitePool.js", "ledger/ledger.js", "utils/json.js", "fleet/paths.js", "crypto/keys.js",
      "workspace.js", "governor/actionPolicyEngine.js", "budgets/budgets.js", "approvals/approvalPolicyEngine.js", "toolhub/toolhubValidators.js",
      "approvals/approvalChainStore.js", "approvals/approvalEngine.js", "actions/actionJournal.js", "actions/reconcile.js", "tools/toolEvidence.js"];
    const selected = direct.map(name => ({ path: realpathSync(join(buildRoot, "dist", name)), sha256: sha(readFileSync(join(buildRoot, "dist", name))) }));
    for (const path of [join(sourceRoot, "examples/lighthouse-finance/oracle.mjs"), join(sourceRoot, "examples/lighthouse-finance/oracleEvidence.mjs"),
      fileURLToPath(new URL("financeQualification.ts", import.meta.url))]) selected.push({ path: realpathSync(path), sha256: sha(readFileSync(path)) });
    const optional = ["lighthouse/finance/financeOpsTools.js", "lighthouse/finance/financePaymentContext.js"].map(name => {
      const path = join(buildRoot, "dist", name);
      try { return { path, sha256: sha(readFileSync(path)), absent: false }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return { path, sha256: null, absent: true }; }
    });
    const unchanged = (): void => {
      for (const pin of selected) if (sha(readFileSync(pin.path)) !== pin.sha256) throw new Error("Selected existing build changed");
      for (const pin of optional) {
        try { const actual = sha(readFileSync(pin.path)); if (pin.absent || actual !== pin.sha256) throw new Error("Selected new build changed"); }
        catch (error) { if (!(pin.absent && (error as NodeJS.ErrnoException).code === "ENOENT")) throw error; }
      }
    };
    observations.push({ sourceRoot, buildRoot, selectedBuildInputs: [...selected, ...optional], expectedNames: names });
    await withFinance(async provider => {
      secrets.push(provider.token("reader-a"), provider.token("reader-b"), provider.token("executor-a"), provider.token("executor-b"));
      const base = { root, buildRoot, workspace, preimagesDir, passphrase, executorSecretKey: "lighthouse-finance/executor-a",
        apiSocket: provider.apiSocket, readerToken: provider.token(options.readerClientId ?? "reader-a"), shadow: options.shadow ?? false };
      const env = { PATH: process.env.PATH ?? "", HOME: home, AMC_HOME: home, TMPDIR: root, LANG: "C", LC_ALL: "C", TZ: "UTC", NO_COLOR: "1",
        GIT_NO_LAZY_FETCH: "1", AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"), AMC_VAULT_PASSPHRASE: passphrase,
        AMC_VAULT_REMEMBER: "0", AMC_NO_SIGN: "0", AMC_LEDGER_SQLITE_SYNCHRONOUS: "FULL", AMC_OTEL_ENABLED: "false",
        AMC_GUARD_EVENTS_DB_PATH: join(workspace, ".amc", "guard_events.sqlite"), AMC_GUARD_RECEIPTS_WORKSPACE: workspace };
      let number = 0, stopped = false;
      async function invoke(stage: "init" | "operation", extra: Record<string, unknown>): Promise<FinanceToolsRun> {
        unchanged(); const label = `${stage}-${++number}`, resultFile = join(root, `${label}.json`), config = join(root, `${label}-config.json`);
        writeFileSync(config, JSON.stringify({ ...base, ...extra, resultFile }) + "\n", { flag: "wx", mode: 0o600 });
        const child = await childRun(label, [script, stage, config], root, env); children.push(child); requireClosed(child); unchanged();
        const result = readJson(resultFile) as unknown as FinanceToolsRun; observations.push({ operation: extra.operation ?? "initializer", result }); return result;
      }
      const initialized = await invoke("init", { keys, executorToken: provider.token("executor-a"), storeExecutorSecret: options.storeExecutorSecret !== false }) as unknown as Record<string, unknown>;
      if (initialized.monitor !== anchors.monitor.publicKeyPem || initialized.auditor !== anchors.auditor.publicKeyPem) throw new Error("Actual init changed pre-artifact keys");
      observations.push({ initializerClosedBeforeFactory: true, initialized, producerScriptSha256: sha(DRIVER) });
      await body({ root, workspace, provider,
        async run(operation) { if (stopped) throw new Error("Provider already stopped for final cold oracle"); return await invoke("operation", { operation }); },
        async approve(approvalRequestId) { return await invoke("operation", { operation: { kind: "approve", approvalRequestId } }); },
        async oracle() {
          if (stopped) throw new Error("Oracle may run only once after final dispatch");
          await provider.stop(); stopped = true;
          const copies = [];
          for (const name of ["txlog.jsonl", "txlog-head.json"]) {
            const original = join(provider.runDir, name), copied = join(evidenceDir, name), before = readFileSync(original), stat = lstatSync(original);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Unsafe original provider evidence");
            copyFileSync(original, copied); chmodSync(copied, 0o600); const actual = lstatSync(copied), after = lstatSync(original);
            if ((stat.dev === actual.dev && stat.ino === actual.ino) || !actual.isFile() || actual.nlink !== 1 || actual.isSymbolicLink()
              || stat.dev !== after.dev || stat.ino !== after.ino || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs
              || !before.equals(readFileSync(copied)) || !before.equals(readFileSync(original))) throw new Error("Closed provider copy changed");
            copies.push({ original, copied, bytes: before.length, sha256: sha(before), originalInode: stat.ino, copiedInode: actual.ino });
          }
          const caseFile = join(root, "case.json"), pinsFile = join(trust, "pins.json");
          writeFileSync(caseFile, JSON.stringify({ schemaVersion: "lighthouse-finance-cases/1", cases: [{ id: "TOOLS-COMPLETED", strategyRow: "Finite real finance-tool positive, not normative F01", mandatory: true,
            expected: { decision: "completed", terminalReceiptState: "completed", posts: { exact: 1 }, commits: { exact: 1 } } }] }) + "\n", { flag: "wx", mode: 0o600 });
          const manifest = { schema: "lighthouse-finance-oracle-pins/1", workspace: realpathSync(workspace), providerRunDir: realpathSync(evidenceDir),
            cli: { path: cli, sha256: sha(readFileSync(cli)) }, node: { path: realpathSync(process.execPath), sha256: sha(readFileSync(process.execPath)) },
            caseFile: { path: realpathSync(caseFile), sha256: sha(readFileSync(caseFile)) }, home: realpathSync(home), ...anchors,
            agentId: "default", tenantId: "tenant-a", clientId: "executor-a", toolName: executeTool,
            toolsConfigSha256: initialized.toolsConfigSha256, approvalPolicySha256: initialized.approvalPolicySha256,
            financialRule: { requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"], ttlMinutes: 10 },
            preimagesDir: realpathSync(preimagesDir), approvalsDir: realpathSync(String(initialized.approvalsDir)) };
          writeFileSync(pinsFile, JSON.stringify(manifest) + "\n", { flag: "wx", mode: 0o600 });
          const readerEnv = { PATH: process.env.PATH ?? "", HOME: home, AMC_HOME: home, TMPDIR: root, NO_COLOR: "1", AMC_FINANCE_ORACLE_PINS_FILE: pinsFile };
          const oracle = await childRun("oracle", [join(sourceRoot, "examples/lighthouse-finance/oracle.mjs"), cli, workspace, caseFile, evidenceDir], root,
            readerEnv, JSON.stringify({ schemaVersion: "2026-09-08", taskId: "TOOLS-COMPLETED", stdout: "", stderr: "" }));
          children.push(oracle); requireClosed(oracle); unchanged();
          const output = JSON.parse(oracle.stdout) as Awaited<ReturnType<Fixture["oracle"]>>;
          observations.push({ oracleOutput: output, closedProviderCopy: copies, manifestSha256: sha(readFileSync(pinsFile)) }); return output;
        } });
    });
    success = true;
  } catch (error) { failure = error; }
  const cleanupErrors: unknown[] = [];
  try {
    const publicRecord = safe({ schema: "finance-tools-qualification/1", root, success, stage: "before-disposable-root-removal",
      beforeArtifactAnchors: anchors, beforeArtifactAnchorsSha256: sha(readFileSync(join(trust, "before-artifacts.json"))),
      children: children.map(({ stdout, stderr, ...metadata }) => { void stdout; void stderr; return { ...metadata, pgid: "inherited outer guarded group; PID-only proof here" }; }), observations });
    writeFileSync(join(root, "public-observations.json"), JSON.stringify(publicRecord) + "\n", { flag: "wx", mode: 0o600 });
    process.stdout.write(`AMC_P119_FINANCE_TOOLS_OBSERVATION ${JSON.stringify(publicRecord)}\n`);
  } catch (error) { cleanupErrors.push(error); }
  if (success && cleanupErrors.length === 0) { try { rmSync(root, { recursive: true }); } catch (error) { cleanupErrors.push(error); } }
  else process.stderr.write(`P119 tools fixture retained: ${root}\n`);
  if (!success && cleanupErrors.length) throw new AggregateError([failure, ...cleanupErrors], "Finance tool body and cleanup failed");
  if (!success) throw failure;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Finance tool cleanup failed");
}

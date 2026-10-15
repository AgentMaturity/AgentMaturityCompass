import assert from "node:assert/strict";
import { createHash, randomUUID, verify } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { get as httpGet, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initWorkspace } from "../../src/workspace.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../../src/toolhub/toolhubValidators.js";
import type { ToolDefinition as SignedTool } from "../../src/toolhub/toolsSchema.js";
import { createNativeSandboxBash } from "../../src/sandbox/nativeSandboxBinding.js";
import type { SandboxOutcome, ShellEgressRow } from "../../src/sandbox/sandboxTypes.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { ToolRegistry } from "../../src/tools/toolRegistry.js";
import { toolhubAllowlistGuard } from "../../src/tools/guards/policyGuards.js";
import type { ToolExecution, ToolOutcome } from "../../src/tools/toolTypes.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { lockVault } from "../../src/vault/vault.js";

const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const quote = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;
export type NativeCall = { outcome: ToolOutcome; receipt: SandboxOutcome; execution: ToolExecution; data: Record<string, any> };
export type NativeContainmentFixture = ReturnType<typeof nativeContainmentFixture>;

/** Real signed tools, default P1-02 binding and private native permit; no injected backend or body. */
export function nativeContainmentFixture(options: { allowHosts?: string[]; maxProcesses?: number } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p105-escape-")));
  chmodSync(root, 0o700);
  const workspace = join(root, "workspaces", randomUUID());
  const home = join(root, "operator-home"), outside = join(root, "outside"), allowed = join(workspace, "workspace", "allowed");
  for (const dir of [workspace, home, outside, allowed, join(home, ".ssh")]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const chosen: Record<string, string | undefined> = {
    AMC_HOME: home, AMC_VAULT_PASSPHRASE: "owned-p105-fixture-only", AMC_VAULT_PASSPHRASE_FILE: undefined,
    AMC_VAULT_REMEMBER: "0", AMC_NO_SIGN: undefined, AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints")
  };
  // Keep the worker's harness-owned HOME unchanged. Canaries use the separate explicit home/readDeny above.
  const prior = Object.fromEntries(Object.keys(chosen).map(key => [key, process.env[key]]));
  const assign = (values: Record<string, string | undefined>): void => {
    for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  };
  assign(chosen);
  const receipts: Array<{ execution: ToolExecution; outcome: SandboxOutcome }> = [];
  const egress: Array<{ execution: ToolExecution; row: ShellEgressRow }> = [];
  const calls: Array<{ execution: ToolExecution; outcome: ToolOutcome }> = [];
  const facts: Record<string, unknown>[] = [];
  const closers: Array<() => Promise<void>> = [];
  let closed = false;
  try {
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    const auditor = getPublicKeyPem(workspace, "auditor"); // captured before tools policy signing
    const node = realpathSync(process.execPath);
    const shell: SignedTool = {
      name: "bash", actionClass: "WRITE_HIGH", allow: { binariesAllowlist: [node] }, deny: { argvRegexDenylist: [] },
      nativeSandbox: { kind: "os-native", writableDirectories: ["workspace/allowed"], readDeny: [home],
        maxProcesses: options.maxProcesses ?? 32, ...(options.allowHosts ? { egress: { allowHosts: options.allowHosts } } : {}) }
    };
    initToolsConfig(workspace, { tools: { version: 1, denyByDefault: true, allowedTools: [shell] } });
    const bytes = readFileSync(join(workspace, ".amc", "tools.yaml"));
    const signature = JSON.parse(readFileSync(join(workspace, ".amc", "tools.yaml.sig"), "utf8")) as { digestSha256: string; signature: string };
    const policyDigest = hash(bytes);
    assert.equal(signature.digestSha256, policyDigest);
    assert.equal(verify(null, Buffer.from(policyDigest, "hex"), auditor, Buffer.from(signature.signature, "base64")), true);
    assert.equal(loadVerifiedToolsConfigSnapshot(workspace).signatureValid, true);
    const registry = new ToolRegistry();
    registry.define(createNativeSandboxBash({ workspace,
      record: (execution, outcome) => receipts.push({ execution, outcome }),
      recordEgress: (execution, row) => egress.push({ execution, row })
    }));
    registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace, execution => registry.visible(execution.agentId).get(execution.name)));
    const pipeline = new ToolPipeline({ registry, workspace, record: (execution, outcome) => calls.push({ execution, outcome }) });
    async function run(program: string): Promise<NativeCall> {
      const before = receipts.length;
      // Single quoted JS stays a single reviewed command-plan token, without shell expansions/redirections.
      const outcome = await pipeline.execute({ name: "bash", agentId: "default", requestedMode: "EXECUTE",
        arguments: { command: `${quote(node)} -e ${quote(program)}`, binary: node, timeoutMs: 8_000 } });
      assert.equal(receipts.length, before + 1, `No actual backend receipt: ${JSON.stringify(outcome)}`);
      const receipt = receipts.at(-1)!;
      const observed = calls.at(-1)!;
      assert.equal(receipt.execution.callId, observed.execution.callId);
      assert.ok(observed.execution.authorization, "Keep real P1-02 authorization binding; do not disable authorized classes");
      const marker = receipt.outcome.stdout.split("\n").find(line => line.startsWith("AMC_P105:"));
      const data = marker ? JSON.parse(marker.slice("AMC_P105:".length)) as Record<string, any> : {};
      facts.push({ kind: "call", callId: observed.execution.callId, data, outcome, receipt: receipt.outcome });
      return { outcome, receipt: receipt.outcome, execution: observed.execution, data };
    }
    async function origin() {
      const requests: Array<{ method: string; url: string }> = [], errors: string[] = [];
      let connections = 0;
      const server = createServer((request, response) => {
        requests.push({ method: request.method ?? "", url: request.url ?? "" });
        response.writeHead(200, { "content-type": "text/plain", connection: "close" }).end("owned-p105-origin");
      });
      server.on("connection", () => { connections += 1; });
      server.on("error", error => errors.push(error.message));
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
      });
      closers.push(() => new Promise<void>((resolve, reject) => {
        server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
      }));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}`;
      const health = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = httpGet(`${url}/health`, { agent: false, headers: { connection: "close" } }, response => {
          const chunks: Buffer[] = []; response.on("data", chunk => chunks.push(Buffer.from(chunk)));
          response.once("error", reject); response.once("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
        });
        request.once("error", reject); request.setTimeout(2_000, () => request.destroy(new Error("Owned origin health timed out")));
      });
      assert.deepEqual(health, { status: 200, body: "owned-p105-origin" });
      facts.push({ kind: "origin-health", port: address.port, health });
      return { url, port: address.port, requests, errors, connectionCount: () => connections };
    }
    async function finish(success: boolean): Promise<void> {
      if (closed) return; closed = true;
      const errors: unknown[] = [];
      for (const close of closers.reverse()) { try { await close(); } catch (error) { errors.push(error); } }
      try { closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`); } catch (error) { errors.push(error); }
      try { lockVault(workspace); } catch (error) { errors.push(error); }
      const uncertain = receipts.some(row => row.outcome.treeExitProven !== true);
      try {
        writeFileSync(join(root, "observations.json"), JSON.stringify({ success, uncertain, errors: errors.map(String), facts,
          receipts: receipts.map(row => ({ callId: row.execution.callId, outcome: row.outcome })),
          calls: calls.map(row => ({ execution: row.execution, outcome: row.outcome })),
          egress: egress.map(row => ({ callId: row.execution.callId, row: row.row })),
          policyDigest, auditorPublicKeySha256: hash(Buffer.from(auditor)), nodeSha256: hash(readFileSync(node)),
          limits: ["Fixture callback receipts are not persisted signed NATIVE audit rows", "No authenticated human or complete governor route", "No universal OS confinement claim"]
        }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      } catch (error) { errors.push(error); }
      assign(prior);
      if (success && !uncertain && errors.length === 0) rmSync(root, { recursive: true });
      else process.stderr.write(`P105 owned fixture retained: ${root}\n`);
      if (errors.length) throw new AggregateError(errors, "Owned containment cleanup/observation failed");
      if (uncertain) throw new Error(`Native child tree exit unproven; owned fixture retained at ${root}`);
    }
    return { root, workspace, home, outside, allowed, node, policyDigest, receipts, egress, calls, facts, run, origin, finish };
  } catch (error) {
    try { closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`); lockVault(workspace); }
    finally { assign(prior); process.stderr.write(`P105 setup fixture retained: ${root}\n`); }
    writeFileSync(join(root, "setup-failure.json"), JSON.stringify({ workspace, home, outside, error: String(error) }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    throw error;
  }
}

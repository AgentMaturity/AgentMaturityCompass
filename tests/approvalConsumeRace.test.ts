import { spawn, type ChildProcess } from "node:child_process";
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { appendFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/*
 * Built-engine witness, not ToolHubService/HTTP concurrency coverage. The
 * service's intent map is process-local; this test neither fabricates that map
 * nor substitutes a pipeline composition. Reviewer identities below are real
 * signed fixture decisions, not authenticated HTTP users or human review.
 *
 * No product imports in this process: initWorkspace's Ledger.close() releases
 * a pooled lease, so initialization and grant creation each finish in a cold
 * child before the parent inspects artifacts or starts the consumers.
 */
const CHILD = String.raw`
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
const [role, root, dist, deadlineText] = process.argv.slice(2);
const workspace = join(root, "workspace");
const deadline = Number(deadlineText);
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const save = (name, value) => {
  const path = join(root, name);
  writeFileSync(path + ".tmp", JSON.stringify(value, null, 2), { flag: "wx" });
  linkSync(path + ".tmp", path);
  unlinkSync(path + ".tmp");
};
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const load = (path) => import(pathToFileURL(join(dist, path)).href);
const timer = setTimeout(() => {
  writeSync(2, "approval race fixture child deadline exceeded\n");
  process.exit(124);
}, Math.max(1, deadline - Date.now()));
const verificationInput = (grant) => ({
  workspace, approvalId: grant.approvalId, expectedAgentId: "default",
  expectedIntentId: "p1-02-consume-race", expectedToolName: "fixture.owned-effect",
  expectedActionClass: "SECURITY"
});
async function main() {
  if (role === "initialize") {
    const { initWorkspace } = await load("workspace.js");
    const { initApprovalPolicy } = await load("approvals/approvalPolicyEngine.js");
    const { getAgentPaths } = await load("fleet/paths.js");
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initApprovalPolicy(workspace);
    save("initialized.json", { pid: process.pid, agentRoot: getAgentPaths(workspace, "default").rootDir });
    return;
  }
  const engine = await load("approvals/approvalEngine.js");
  const chain = await load("approvals/approvalChainStore.js");
  if (role === "grant") {
    // The parent has already pinned independent public keys and all four
    // signed configs after the initialization process actually closed.
    assert.equal(json(join(root, "before-artifacts.json")).approvalArtifacts, 0);
    const created = engine.createApprovalForIntent({
      workspace, agentId: "default", intentId: "p1-02-consume-race",
      toolName: "fixture.owned-effect", actionClass: "SECURITY",
      requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high",
      intentPayload: { operation: "append one owned fixture effect" }
    });
    assert.equal(created.request.requiredApprovals, 2);
    assert.equal(created.request.requireDistinctUsers, true);
    assert.deepEqual(created.request.rolesAllowed, ["OWNER", "AUDITOR"]);
    const requestDigest = chain.approvalRequestBindingDigest(created.request);
    const decisions = [];
    for (const [userId, role] of [["race-owner", "OWNER"], ["race-auditor", "AUDITOR"]]) {
      const decision = engine.decideApprovalForIntent({
        workspace, agentId: "default", approvalId: created.approval.approvalId,
        decision: "APPROVED", mode: "EXECUTE", reason: role + " reviewed the exact fixture intent",
        userId, username: userId, userRoles: [role], expectedRequestDigestSha256: requestDigest
      });
      decisions.push(decision.approval);
    }
    assert.equal(decisions[0].status, "PENDING");
    assert.equal(decisions[0].receivedApprovals, 1);
    assert.equal(decisions[1].status, "QUORUM_MET");
    assert.equal(decisions[1].receivedApprovals, 2);
    const approvalsRoot = dirname(dirname(created.filePath));
    const grant = {
      pid: process.pid, approvalId: created.approval.approvalId,
      requestPath: created.filePath, requestSha256: hash(created.filePath),
      decisionPaths: decisions.map((decision) => join(approvalsRoot, "decisions", decision.lastDecisionId + ".json")),
      consumedPath: join(approvalsRoot, "consumed", created.approval.approvalId + ".json")
    };
    const verified = engine.verifyApprovalForExecution(verificationInput(grant));
    assert.equal(verified.ok, true);
    assert.deepEqual(verified.quorum, { required: 2, received: 2 });
    save("grant.json", grant);
    return;
  }
  const grant = json(join(root, "grant.json"));
  if (role.startsWith("consumer-")) {
    const verified = engine.verifyApprovalForExecution(verificationInput(grant));
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.equal(verified.status, "QUORUM_MET");
    assert.equal(hash(grant.requestPath), grant.requestSha256);
    save(role + ".ready.json", { pid: process.pid, approvalId: grant.approvalId, requestSha256: hash(grant.requestPath), status: verified.status });
    while (!existsSync(join(root, "release.json"))) {
      if (Date.now() >= deadline) throw new Error("barrier release deadline exceeded");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const release = json(join(root, "release.json"));
    assert.equal(release.approvalId, grant.approvalId);
    let result;
    try {
      result = {
        kind: "returned",
        actual: engine.consumeApprovedExecution({ workspace, approvalId: grant.approvalId, expectedAgentId: "default", executionId: role })
      };
    } catch (error) {
      // markApprovalConsumed publishes complete bytes exclusively before
      // signing. Only this documented missing-signature window is a permitted
      // refusal; malformed signatures, request errors and I/O errors fail.
      if (!(error instanceof Error) || error.message !== "invalid approval consumed signature: signature missing") throw error;
      result = { kind: "signature-window", message: error.message };
    }
    if (result.kind === "returned" && result.actual.consumed === true) {
      // Distinct effect paths expose double admission instead of serializing
      // the effect behind an extra shared lock.
      writeFileSync(join(root, "effects", role + ".json"), JSON.stringify({ pid: process.pid, executionId: role, approvalId: grant.approvalId }), { flag: "wx" });
    }
    save(role + ".result.json", { pid: process.pid, ...result });
    return;
  }
  assert.equal(role, "inspect");
  const consumed = chain.loadApprovalConsumed({ workspace, agentId: "default", approvalRequestId: grant.approvalId });
  assert.ok(consumed);
  const integrity = chain.inspectApprovalChainIntegrity({ workspace, agentId: "default", approvalRequestId: grant.approvalId });
  assert.equal(integrity.valid, true, JSON.stringify(integrity));
  const verified = engine.verifyApprovalForExecution(verificationInput(grant));
  assert.equal(verified.ok, false);
  assert.equal(verified.status, "CONSUMED");
  assert.equal(verified.error, "approval already consumed");
  save("inspection.json", { pid: process.pid, consumed, integrity, verified });
}
main().then(() => {
  clearTimeout(timer);
  writeSync(1, JSON.stringify({ role, pid: process.pid, completed: true }) + "\n");
  process.exit(0);
}, (error) => {
  clearTimeout(timer);
  save(role + ".error.json", { pid: process.pid, message: String(error), stack: error instanceof Error ? error.stack : null });
  writeSync(2, (error instanceof Error ? error.stack : String(error)) + "\n");
  process.exit(1);
});
`;

interface ExitReceipt { code: number | null; signal: NodeJS.Signals | null; spawnError: string | null; retentionError: string | null; closedAt: number }
interface Run { child: ChildProcess; name: string; closed: boolean; close: Promise<ExitReceipt> }
interface Grant { approvalId: string; requestPath: string; requestSha256: string; decisionPaths: string[]; consumedPath: string }
interface Ready { pid: number; approvalId: string; requestSha256: string; status: string }
interface Consumption { pid: number; kind: string; message?: string; actual?: { consumed: boolean; replay: boolean; reason: string; consumedTs: number } }
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
function save(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2), { flag: "wx" });
  linkSync(`${path}.tmp`, path);
  unlinkSync(`${path}.tmp`);
}

function signedArtifact(path: string, auditor: string): Record<string, unknown> {
  const signature = readJson<{ digestSha256: string; signature: string; signer: string }>(`${path}.sig`);
  const digest = sha256(path);
  expect(signature.signer).toBe("auditor");
  expect(signature.digestSha256).toBe(digest);
  expect(verify(null, Buffer.from(digest, "hex"), auditor, Buffer.from(signature.signature, "base64")), path).toBe(true);
  return readJson<Record<string, unknown>>(path);
}

test("one signed OWNER/AUDITOR grant permits exactly one effect across two real consumer processes", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-approval-consume-race-"));
  const deadline = Date.now() + 25_000;
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  const workspace = join(root, "workspace");
  const runs: Run[] = [];
  let success = false;
  for (const dir of ["workspace", "home", "tmp", "logs", "public", "effects"]) mkdirSync(join(root, dir), { mode: 0o700 });
  const script = join(root, "child.mjs");
  writeFileSync(script, CHILD, { flag: "wx", mode: 0o600 });
  const env = {
    PATH: process.env.PATH ?? "", HOME: join(root, "home"), TMPDIR: join(root, "tmp"),
    LANG: "C", LC_ALL: "C", AMC_VAULT_PASSPHRASE: randomUUID()
  };
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`fixture deadline exceeded; retained ${root}`)), Math.max(1, deadline + 500 - Date.now()));
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  function launch(name: string): Run {
    const argv = [script, name, root, dist, String(deadline)];
    const stdout = join(root, "logs", `${name}.stdout.log`);
    const stderr = join(root, "logs", `${name}.stderr.log`);
    writeFileSync(stdout, "", { flag: "wx" });
    writeFileSync(stderr, "", { flag: "wx" });
    const child = spawn(process.execPath, argv, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let spawnError: string | null = null;
    let retentionError: string | null = null;
    const capture = (path: string, bytes: Buffer): void => {
      try { appendFileSync(path, bytes); } catch (error) { retentionError = String(error); }
    };
    child.stdout.on("data", (bytes: Buffer) => capture(stdout, bytes));
    child.stderr.on("data", (bytes: Buffer) => capture(stderr, bytes));
    const run: Run = { child, name, closed: false, close: Promise.resolve({ code: null, signal: null, spawnError: null, retentionError: null, closedAt: 0 }) };
    run.close = new Promise((resolve) => {
      child.once("error", (error) => { spawnError = String(error); });
      child.once("close", (code, signal) => {
        run.closed = true;
        const receipt = { code, signal, spawnError, retentionError, closedAt: Date.now() };
        try { save(join(root, "logs", `${name}.close.json`), receipt); }
        catch (error) { receipt.retentionError = String(error); }
        finally { resolve(receipt); }
      });
    });
    runs.push(run);
    save(join(root, "logs", `${name}.command.json`), { executable: process.execPath, argv, envKeys: Object.keys(env), pid: child.pid, startedAt: Date.now() });
    return run;
  }
  async function closedSuccessfully(run: Run): Promise<void> {
    const receipt = await bounded(run.close);
    expect(receipt, `child ${run.name}; retained ${root}`).toMatchObject({ code: 0, signal: null, spawnError: null, retentionError: null });
  }
  async function ready(run: Run): Promise<Ready> {
    const path = join(root, `${run.name}.ready.json`);
    while (!existsSync(path)) {
      if (run.closed) throw new Error(`${run.name} closed before the barrier; retained ${root}`);
      if (Date.now() >= deadline) throw new Error(`barrier deadline exceeded; retained ${root}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return readJson<Ready>(path);
  }
  try {
    // All subsequent snapshots happen after this actual process close. The
    // parent never imports openLedger, Database, or any product module.
    await closedSuccessfully(launch("initialize"));
    const initialized = readJson<{ agentRoot: string }>(join(root, "initialized.json"));
    expect(existsSync(join(initialized.agentRoot, "approvals"))).toBe(false);
    const publicPins: Record<string, { sha256: string; spkiSha256: string }> = {};
    for (const role of ["auditor", "monitor"]) {
      const pem = readFileSync(join(workspace, ".amc", "keys", `${role}_ed25519.pub`), "utf8");
      const path = join(root, "public", `${role}.pub.pem`);
      writeFileSync(path, pem, { flag: "wx" });
      publicPins[role] = { sha256: sha256(path), spkiSha256: createHash("sha256").update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex") };
    }
    const configPaths = ["approval-policy.yaml", "action-policy.yaml", "tools.yaml", "budgets.yaml"]
      .flatMap((file) => [join(workspace, ".amc", file), join(workspace, ".amc", `${file}.sig`)]);
    const configPins = configPaths.map((path) => ({ path, sha256: sha256(path) }));
    save(join(root, "before-artifacts.json"), { capturedAt: Date.now(), approvalArtifacts: 0, publicPins, configPins });
    await closedSuccessfully(launch("grant"));
    const grant = readJson<Grant>(join(root, "grant.json"));
    const auditor = readFileSync(join(root, "public", "auditor.pub.pem"), "utf8");
    const request = signedArtifact(grant.requestPath, auditor);
    expect(request).toMatchObject({ approvalRequestId: grant.approvalId, agentId: "default", actionClass: "SECURITY", status: "QUORUM_MET", requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"] });
    expect(grant.decisionPaths).toHaveLength(2);
    const decisions = grant.decisionPaths.map((path) => signedArtifact(path, auditor));
    expect(decisions.map((decision) => ({ userId: decision.userId, username: decision.username, roles: decision.roles, approvalRequestId: decision.approvalRequestId, decision: decision.decision }))).toEqual([
      { userId: "race-owner", username: "race-owner", roles: ["OWNER"], approvalRequestId: grant.approvalId, decision: "APPROVE_EXECUTE" },
      { userId: "race-auditor", username: "race-auditor", roles: ["AUDITOR"], approvalRequestId: grant.approvalId, decision: "APPROVE_EXECUTE" }
    ]);
    expect(existsSync(grant.consumedPath)).toBe(false);
    save(join(root, "grant-before-consumers.json"), { requestSha256: sha256(grant.requestPath), decisionPins: grant.decisionPaths.map((path) => ({ path, sha256: sha256(path), signatureSha256: sha256(`${path}.sig`) })) });
    const consumers = [launch("consumer-0"), launch("consumer-1")];
    const readyRecords = await bounded(Promise.all(consumers.map(ready)));
    expect(new Set(readyRecords.map((record) => record.pid)).size).toBe(2);
    expect(readyRecords.map((record) => record.pid)).toEqual(consumers.map((run) => run.child.pid));
    for (const record of readyRecords) expect(record).toMatchObject({ approvalId: grant.approvalId, requestSha256: grant.requestSha256, status: "QUORUM_MET" });
    expect(sha256(grant.requestPath)).toBe(grant.requestSha256);
    save(join(root, "release.json"), { approvalId: grant.approvalId, readyRecords, releasedAt: Date.now() });
    await Promise.all(consumers.map(closedSuccessfully));
    const results = consumers.map((run) => readJson<Consumption>(join(root, `${run.name}.result.json`)));
    expect(results.map((result) => result.pid)).toEqual(consumers.map((run) => run.child.pid));
    const winners = results.filter((result) => result.kind === "returned" && result.actual?.consumed === true);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.actual).toMatchObject({ consumed: true, replay: false, reason: "ok" });
    const losers = results.filter((result) => result !== winners[0]);
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    if (loser?.kind === "signature-window") expect(loser.message).toBe("invalid approval consumed signature: signature missing");
    else expect(loser).toMatchObject({ kind: "returned", actual: { consumed: false, replay: true, reason: "approval already consumed" } });
    const effects = readdirSync(join(root, "effects"));
    expect(effects).toHaveLength(1);
    expect(effects[0]).toBe(`${consumers[results.indexOf(winners[0]!)]?.name}.json`);
    const effect = readJson<{ pid: number; executionId: string; approvalId: string }>(join(root, "effects", effects[0]!));
    expect(effect).toMatchObject({ pid: winners[0]?.pid, approvalId: grant.approvalId });
    // Cold product inspection begins only after both actual writer closes.
    await closedSuccessfully(launch("inspect"));
    const consumed = signedArtifact(grant.consumedPath, auditor);
    expect(consumed).toMatchObject({ approvalRequestId: grant.approvalId, agentId: "default", executionId: effect.executionId });
    expect(signedArtifact(grant.requestPath, auditor).status).toBe("CONSUMED");
    expect(readdirSync(join(initialized.agentRoot, "approvals", "consumed")).sort()).toEqual([`${grant.approvalId}.json`, `${grant.approvalId}.json.sig`]);
    for (const pin of configPins) expect(sha256(pin.path), pin.path).toBe(pin.sha256);
    for (const role of ["auditor", "monitor"]) expect(sha256(join(workspace, ".amc", "keys", `${role}_ed25519.pub`))).toBe(publicPins[role]?.sha256);
    success = true;
  } finally {
    // Children self-bound their lifetime. Do not signal them or delete a live
    // or failed fixture. Retain raw streams, public pins and every effect on
    // any failure, including spawn failures and unexpected product errors.
    try {
      await bounded(Promise.all(runs.map((run) => run.close)));
    } catch (error) {
      console.error(`approval consume race child closure uncertain; retained ${root}`, error);
      if (success) throw error;
    }
    if (success && runs.every((run) => run.closed)) rmSync(root, { recursive: true, force: true });
    else console.error(`approval consume race evidence retained at ${root}`);
  }
});

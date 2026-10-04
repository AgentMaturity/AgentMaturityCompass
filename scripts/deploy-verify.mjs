#!/usr/bin/env node
/**
 * Post-deploy verifier: a deploy is unverified until a governed turn succeeds.
 *
 * Against a running Studio + gateway it runs the smallest end-to-end governed
 * interaction the server exposes — one leased chat completion through the
 * gateway — and verifies the signed `x-amc-receipt` it returns against a
 * monitor public key the operator PINS out of band (`--monitor-pubkey`). The
 * key is never taken from the target: a target that can name its own key can
 * sign its own pass.
 *
 * Every required check must be present and PASS; a check that did not run is a
 * failure, not a skip. The result JSON is printed and, with --out, written.
 *
 *   node scripts/deploy-verify.mjs --target <studio-url> [--gateway <gateway-url>]
 *     --monitor-pubkey <monitor_ed25519.pub> [--route /openai] [--model gpt-test]
 *     [--agent default] [--out result.json] [--timeout-ms 10000]
 *
 * The lease token is read from AMC_DEPLOY_VERIFY_LEASE or --lease-file and is
 * never printed or written. Exit: 0 pass, 1 fail, 2 usage error.
 * Node built-ins only.
 */
import { createHash, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_CHECKS = ["health", "readiness", "governed-turn", "receipt-signature", "receipt-binding"];
const RECEIPT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Pass only when every required check is present and exactly PASS. */
export function evaluateChecks(checks) {
  const missingChecks = REQUIRED_CHECKS.filter((name) => !checks.some((check) => check.name === name));
  const pass = missingChecks.length === 0 && checks.every((check) => check.status === "PASS");
  return { pass, missingChecks };
}

function fromBase64Url(text) {
  return Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Mirrors verifyReceipt in src/receipts/receipt.ts: Ed25519 over the canonical payload bytes. */
export function verifyReceiptSignature(receipt, publicKeysPem) {
  const parts = String(receipt).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: "invalid receipt format" };
  const payloadBytes = fromBase64Url(parts[0]);
  const signature = fromBase64Url(parts[1]);
  let payload;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { ok: false, error: "receipt payload is not JSON" };
  }
  const ok = publicKeysPem.some((pem) => {
    try {
      return verify(null, payloadBytes, pem, signature);
    } catch {
      return false;
    }
  });
  return ok ? { ok: true, payload } : { ok: false, error: "signature does not verify against any pinned monitor key" };
}

function parseArgs(argv) {
  const opts = { pubkeys: [], route: "/openai", model: "gpt-test", agent: "default", timeoutMs: 10_000 };
  const takes = new Set(["--target", "--gateway", "--monitor-pubkey", "--route", "--model", "--agent", "--out", "--timeout-ms", "--lease-file"]);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!takes.has(flag) || argv[i + 1] === undefined) throw new Error(`unknown or incomplete argument: ${flag}`);
    const value = argv[++i];
    if (flag === "--target") opts.target = value;
    else if (flag === "--gateway") opts.gateway = value;
    else if (flag === "--monitor-pubkey") opts.pubkeys.push(value);
    else if (flag === "--route") opts.route = value;
    else if (flag === "--model") opts.model = value;
    else if (flag === "--agent") opts.agent = value;
    else if (flag === "--out") opts.out = value;
    else if (flag === "--lease-file") opts.leaseFile = value;
    else if (flag === "--timeout-ms") opts.timeoutMs = Number.parseInt(value, 10);
  }
  if (!opts.target) throw new Error("--target <base-url> is required");
  for (const url of [opts.target, opts.gateway].filter(Boolean)) new URL(url);
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive integer");
  return opts;
}

async function runCheck(name, fn) {
  const started = performance.now();
  try {
    const detail = await fn();
    return { name, status: "PASS", durationMs: Math.round(performance.now() - started), detail };
  } catch (error) {
    const detail = error instanceof Error ? (error.cause ? `${error.message}: ${String(error.cause.code ?? error.cause.message ?? error.cause)}` : error.message) : String(error);
    return { name, status: "FAIL", durationMs: Math.round(performance.now() - started), detail };
  }
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function gitState(cwd) {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== "";
    return { commit, dirty };
  } catch {
    return { commit: "unknown", dirty: null };
  }
}

function readLease(opts) {
  if (opts.leaseFile) return readFileSync(opts.leaseFile, "utf8").trim();
  return (process.env.AMC_DEPLOY_VERIFY_LEASE ?? "").trim();
}

export async function runDeployVerify(opts) {
  const startedAt = new Date();
  const gateway = opts.gateway ?? opts.target;
  const fetchOpts = () => ({ signal: AbortSignal.timeout(opts.timeoutMs) });
  const checks = [];
  let targetReportedVersion = "unknown";
  const turn = { receipt: null, body: null, startedMs: 0, endedMs: 0, fingerprint: null };
  let verified = null;

  checks.push(await runCheck("health", async () => {
    const res = await fetch(joinUrl(opts.target, "/healthz"), fetchOpts());
    const body = await res.json().catch(() => null);
    if (res.status !== 200 || body?.status !== "ok") throw new Error(`/healthz returned ${res.status} status=${body?.status ?? "non-JSON"}`);
    targetReportedVersion = String(body.version ?? "unknown");
    return `/healthz 200 status=ok version=${targetReportedVersion}`;
  }));

  checks.push(await runCheck("readiness", async () => {
    const res = await fetch(joinUrl(opts.target, "/readyz"), fetchOpts());
    const body = await res.json().catch(() => null);
    if (res.status !== 200 || body?.status !== "READY") {
      throw new Error(`/readyz returned ${res.status} status=${body?.status ?? "non-JSON"} reasons=${JSON.stringify(body?.reasons ?? [])}`);
    }
    return "/readyz 200 READY";
  }));

  checks.push(await runCheck("governed-turn", async () => {
    const lease = readLease(opts);
    if (!lease) throw new Error("no lease token: set AMC_DEPLOY_VERIFY_LEASE or pass --lease-file");
    turn.startedMs = Date.now();
    const res = await fetch(joinUrl(gateway, `${opts.route}/v1/chat/completions`), {
      ...fetchOpts(),
      method: "POST",
      headers: { authorization: `Bearer ${lease}`, "content-type": "application/json", "x-amc-agent-id": opts.agent },
      body: JSON.stringify({ model: opts.model, max_tokens: 1, messages: [{ role: "user", content: "amc deploy-verify" }] })
    });
    turn.body = Buffer.from(await res.arrayBuffer());
    turn.endedMs = Date.now();
    if (res.status < 200 || res.status >= 300) throw new Error(`gateway returned ${res.status}`);
    turn.receipt = res.headers.get("x-amc-receipt");
    turn.fingerprint = res.headers.get("x-amc-monitor-pub-fpr");
    if (!turn.receipt) throw new Error(`gateway returned ${res.status} without an x-amc-receipt header`);
    return `gateway ${res.status} with x-amc-receipt`;
  }));

  checks.push(await runCheck("receipt-signature", async () => {
    if (!turn.receipt) throw new Error("no receipt to verify: the governed turn did not produce one");
    const pems = opts.pubkeys.map((path) => readFileSync(path, "utf8"));
    const result = verifyReceiptSignature(turn.receipt, pems);
    if (!result.ok) {
      const pinned = pems.map((pem) => createHash("sha256").update(pem, "utf8").digest("hex").slice(0, 16));
      throw new Error(`${result.error} (pinned fpr=${pinned.join(",") || "none"}, target claims fpr=${turn.fingerprint ?? "none"})`);
    }
    verified = result.payload;
    return `Ed25519 signature verifies against pinned key; receipt_id=${verified.receipt_id}`;
  }));

  checks.push(await runCheck("receipt-binding", async () => {
    // Only a payload whose signature verified is read; an unverified payload says nothing.
    if (!verified) throw new Error("receipt signature not verified; payload is not trusted");
    const bodySha256 = createHash("sha256").update(turn.body).digest("hex");
    const problems = [];
    if (verified.kind !== "llm_response") problems.push(`kind=${verified.kind}, expected llm_response`);
    if (verified.body_sha256 !== bodySha256) problems.push("body_sha256 does not match the response bytes received");
    if (verified.agentId !== opts.agent) problems.push(`agentId=${verified.agentId}, expected ${opts.agent}`);
    if (!(verified.ts >= turn.startedMs - RECEIPT_CLOCK_SKEW_MS && verified.ts <= turn.endedMs + RECEIPT_CLOCK_SKEW_MS)) {
      problems.push(`receipt ts ${verified.ts} outside the request window ±${RECEIPT_CLOCK_SKEW_MS}ms`);
    }
    if (problems.length > 0) throw new Error(problems.join("; "));
    return `llm_response receipt commits to the ${turn.body.length} response bytes received for agent ${opts.agent}`;
  }));

  const { pass, missingChecks } = evaluateChecks(checks);
  const finishedAt = new Date();
  const repo = gitState(dirname(fileURLToPath(import.meta.url)));
  return {
    schema: "amc-deploy-verify/v1",
    pass,
    target: opts.target,
    gateway,
    route: opts.route,
    model: opts.model,
    agentId: opts.agent,
    verifierCommit: repo.commit,
    verifierTreeDirty: repo.dirty,
    targetReportedVersion,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    receipt: verified
      ? {
          receiptId: verified.receipt_id,
          kind: verified.kind,
          ts: verified.ts,
          sessionId: verified.session_id,
          eventHash: verified.event_hash,
          receiptSha256: createHash("sha256").update(turn.receipt, "utf8").digest("hex")
        }
      : null,
    requiredChecks: REQUIRED_CHECKS,
    missingChecks,
    checks,
    notExercised: [
      "the receipt's event_hash is not anchored to the target's ledger (needs ledger access, not an HTTP probe)",
      "the deployed commit is not reported by the target; targetReportedVersion is the package version only",
      "tool execution, streaming responses and approvals are not exercised"
    ]
  };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`deploy-verify: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  const result = await runDeployVerify(opts);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (opts.out) {
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(resolve(opts.out), text);
  }
  process.stdout.write(text);
  process.exitCode = result.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

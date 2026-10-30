/**
 * The installed CLI the native client pinned at start, run for the verbs ACP has no message for (P2-13): cold
 * verification (`agent-loop verify`) and the signed approval engine (`approvals list`, `approvals approve`). The same
 * executable, the same workspace and environment, no shell; stdout bounded; diagnostics private unless asked for.
 */
import { spawn } from "node:child_process";
import type { AgentRunVerification } from "../agent/runReport.js";
import { parseExecutionStatus, type ExecutionStatus } from "../execution/executionContract.js";
import { AMCNativeInputError, AMCNativeProtocolError, AMCNativeRefusedError } from "./nativeAgentErrors.js";
import { freezeJson, MAX_TURN_BYTES, object, type JsonObject } from "./nativeWire.js";

export interface PinnedCli {
  readonly command: readonly [string, ...string[]];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
}

/** `stderr` is returned only with `diagnostics`, cut to its last 4 KiB; it is never evidence. */
export function runPinnedCli(cli: PinnedCli, args: readonly string[], what: string, diagnostics = false):
  Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve_, reject) => {
    const child = spawn(cli.command[0], [...cli.command.slice(1), ...args], { cwd: cli.cwd, env: cli.env, stdio: "pipe", shell: false });
    let stdout = "", stderr = ""; let failure: Error | undefined;
    const timer = setTimeout(() => { failure = new AMCNativeProtocolError(`${what} timed out`); child.kill("SIGKILL"); }, cli.timeoutMs);
    child.stdin.on("error", () => { failure ??= new AMCNativeProtocolError(`${what} input failed`); child.kill("SIGKILL"); });
    child.stdout.on("error", () => { failure ??= new AMCNativeProtocolError(`${what} output failed`); child.kill("SIGKILL"); });
    child.stderr.on("error", () => { /* Diagnostics are not authority. */ });
    child.stdin.end(); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { if (diagnostics) stderr = (stderr + chunk).slice(-4096); });
    child.stdout.on("data", (chunk: string) => {
      if (failure) return;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > MAX_TURN_BYTES) {
        failure = new AMCNativeProtocolError(`${what} exceeded the output limit`); child.kill("SIGKILL"); return;
      }
      stdout += chunk;
    });
    child.once("error", () => { failure = new AMCNativeProtocolError(`could not start the installed ${what}`); });
    child.once("close", (code) => { clearTimeout(timer); if (failure) reject(failure); else resolve_({ code, stdout, stderr }); });
  });
}

/** The `execution` a CLI JSON report carries, or null when the output is not such a report. */
export function reportedExecution(output: string): ExecutionStatus | null {
  try { const report: unknown = JSON.parse(output); return object(report) ? parseExecutionStatus(report.execution) : null; } catch { return null; }
}

/** A live summary is never promoted to verification: only a self-consistent passing verifier report is admitted. */
export function admitVerifierReport(output: string, sessionId: string): { readonly scope: "workspace-key-consistency" | "externally-anchored";
  readonly report: AgentRunVerification; readonly execution: ExecutionStatus } {
  let report: unknown;
  try { report = JSON.parse(output); } catch { throw new AMCNativeProtocolError("native verifier returned invalid JSON"); }
  const empty = (value: unknown): boolean => Array.isArray(value) && value.length === 0;
  const execution = object(report) ? parseExecutionStatus(report.execution) : null;
  if (!object(report) || report.sessionId !== sessionId || report.ok !== true || report.ledgerOk !== true
    || !empty(report.ledgerErrors) || !empty(report.sessionChainErrors) || !empty(report.unsignedRowIds)
    || !Array.isArray(report.requests) || !report.requests.every((r) => object(r) && typeof r.headerEventId === "string" && r.headerEventId.length > 0 && r.status === "reconstructed")
    || new Set(report.requests.map(r => (r as JsonObject).headerEventId)).size !== report.requests.length
    || !object(report.trustRoot) || typeof report.trustRoot.anchored !== "boolean"
    || !(report.trustRoot.monitorFingerprint === null || typeof report.trustRoot.monitorFingerprint === "string")
    || !(report.trustRoot.expectedFingerprint === null || typeof report.trustRoot.expectedFingerprint === "string")
    || execution === null || execution.sessionId !== sessionId || execution.phases["evidence-verification"] !== "succeeded") {
    throw new AMCNativeProtocolError("native verifier returned an inconsistent receipt");
  }
  if (report.trustRoot.anchored && (!report.trustRoot.expectedFingerprint
    || report.trustRoot.expectedFingerprint !== report.trustRoot.monitorFingerprint)) {
    throw new AMCNativeProtocolError("native verifier returned an inconsistent trust anchor");
  }
  return { scope: report.trustRoot.anchored ? "externally-anchored" : "workspace-key-consistency",
    report: report as unknown as AgentRunVerification, execution };
}
/** A signed approval request awaiting this agent's reviewers (`amc approvals list --status pending`). @public */
export interface AMCNativePendingApproval {
  readonly approvalRequestId: string;
  readonly requestDigestSha256: string;
  readonly actionClass: string;
  readonly riskTier: string;
}

/** A reviewer's decision, recorded by the signed approval engine exactly as `amc approvals approve` records it. @public */
export interface AMCNativeApproval {
  readonly approvalRequestId: string;
  readonly reason: string;
  readonly username: string;
  readonly roles: readonly string[];
  readonly userId?: string;
  readonly mode?: "execute" | "simulate";
  /** With `expectRequestDigest`: the authenticated, digest-bound decision path native chat uses. */
  readonly sessionTokenFile?: string;
  readonly expectRequestDigest?: string;
}

export async function pendingApprovals(cli: PinnedCli, agentId: string): Promise<readonly AMCNativePendingApproval[]> {
  const run = await runPinnedCli(cli, ["approvals", "list", `--agent=${agentId}`, "--status=pending", "--json"], "approval inbox");
  let listed: unknown;
  try { listed = JSON.parse(run.stdout); } catch { listed = null; }
  if (run.code !== 0 || !object(listed) || !Array.isArray(listed.requests)) throw new AMCNativeRefusedError(run.code ?? -1, "The approval inbox is unavailable or failed its integrity check.");
  return freezeJson(listed.requests.filter(object).map(r => ({ approvalRequestId: String(r.approvalRequestId),
    requestDigestSha256: String(r.requestDigestSha256), actionClass: String(r.actionClass), riskTier: String(r.riskTier) })));
}

export async function approveThroughCli(cli: PinnedCli, agentId: string, input: AMCNativeApproval): Promise<void> {
  const text = (v: unknown): boolean => typeof v === "string" && v.trim() !== "" && !v.includes("\0");
  if (!object(input) || typeof input.approvalRequestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.approvalRequestId)
    || !text(input.reason) || !text(input.username) || !Array.isArray(input.roles) || input.roles.length === 0
    || !input.roles.every(role => typeof role === "string" && /^[A-Z_]{1,32}$/.test(role))
    || [input.userId, input.sessionTokenFile, input.expectRequestDigest].some(v => v !== undefined && !text(v))
    || (input.mode !== undefined && input.mode !== "execute" && input.mode !== "simulate")) {
    throw new AMCNativeInputError("An approval needs a request ID, a reason, the reviewer's username and roles, and execute or simulate");
  }
  // `--flag=value`: a value can never be read as another flag.
  const args = ["approvals", "approve", input.approvalRequestId, `--agent=${agentId}`, `--mode=${input.mode ?? "execute"}`,
    `--reason=${input.reason}`, `--username=${input.username}`, `--roles=${input.roles.join(",")}`];
  for (const [flag, value] of [["--user-id", input.userId], ["--session-token-file", input.sessionTokenFile],
    ["--expect-request-digest", input.expectRequestDigest]] as const) if (value !== undefined) args.push(`${flag}=${value}`);
  const run = await runPinnedCli(cli, args, "approval engine", true);
  if (run.code !== 0) throw new AMCNativeRefusedError(run.code ?? -1, run.stderr.trim().split("\n").at(-1) || "The approval engine refused this decision.");
}

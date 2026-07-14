/**
 * One-command agent-security posture scorecard.
 *
 * Competitive parity with runtime-security tools that lead with a "free posture
 * scan in seconds" wedge (e.g. node9), but AMC-native and superior on two axes:
 * the score sits on AMC's L0–L5 maturity model rather than an ungraded letter,
 * and the result carries a deterministic, verifiable receipt rather than an
 * unsigned report. It composes AMC's existing agent-config scan and MCP trust
 * ledger and adds environment dimensions (secrets on disk, isolation,
 * supply-chain), then rolls them into one scorecard.
 *
 * No competitor rules, code, taxonomy, or report format are copied; only the
 * product lesson (a fast, one-command machine posture grade) is taken.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanAgentConfig } from "./agentConfigScanner.js";
import { buildMcpTrustReceipt } from "./mcpTrustLedger.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type PostureLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
export type PostureDimensionId =
  | "agent-config"
  | "mcp-trust"
  | "secrets-on-disk"
  | "isolation"
  | "supply-chain";

export interface PostureDimension {
  id: PostureDimensionId;
  level: PostureLevel;
  score: number;
  status: "PASS" | "REVIEW" | "FAIL";
  summary: string;
}

export interface PostureScorecard {
  schemaVersion: "amc.posture-scorecard.v1";
  scannedAt: number;
  root: string;
  overallLevel: PostureLevel;
  overallScore: number;
  verdict: "CLEAN" | "REVIEW" | "BLOCK";
  dimensions: PostureDimension[];
  topActions: string[];
  receiptHash: string;
}

const LEVEL_ORDER: PostureLevel[] = ["L0", "L1", "L2", "L3", "L4", "L5"];
function scoreToLevel(score: number): PostureLevel {
  if (score >= 85) return "L5";
  if (score >= 70) return "L4";
  if (score >= 55) return "L3";
  if (score >= 40) return "L2";
  if (score >= 20) return "L1";
  return "L0";
}
function statusFor(score: number): PostureDimension["status"] {
  return score >= 70 ? "PASS" : score >= 40 ? "REVIEW" : "FAIL";
}

function findMcpConfigs(root: string): string[] {
  const out: string[] = [];
  const candidates = [".mcp.json", "mcp.json", join(".cursor", "mcp.json"), join(".vscode", "mcp.json")];
  for (const c of candidates) {
    const p = join(root, c);
    if (existsSync(p)) out.push(p);
  }
  return out;
}

function hasAny(root: string, names: string[]): boolean {
  return names.some((n) => existsSync(join(root, n)));
}

function listTop(root: string): string[] {
  try { return readdirSync(root); } catch { return []; }
}

/** Isolation posture from static signals in the working tree. */
function assessIsolation(root: string): { score: number; summary: string } {
  const sandboxSignals = ["Dockerfile", ".devcontainer", "docker-compose.yml", "compose.yaml"].filter((n) => existsSync(join(root, n)));
  const hasSandbox = sandboxSignals.length > 0;
  const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
  let score = hasSandbox ? 80 : 45;
  if (runningAsRoot) score -= 30;
  return {
    score: Math.max(0, Math.min(100, score)),
    summary: hasSandbox
      ? `Sandbox signals present (${sandboxSignals.join(", ")})${runningAsRoot ? " but running as root" : ""}.`
      : `No container/devcontainer isolation signals found${runningAsRoot ? "; running as root" : ""}. Prefer running agents in a disposable sandbox.`
  };
}

/** Supply-chain posture: lockfile presence + committed secrets files. */
function assessSupplyChain(root: string): { score: number; summary: string } {
  const top = listTop(root);
  const hasLock = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "poetry.lock", "requirements.txt"].some((n) => top.includes(n));
  const envFiles = top.filter((n) => n === ".env" || n.startsWith(".env."));
  let score = hasLock ? 75 : 50;
  if (envFiles.length > 0) score -= 20;
  return {
    score: Math.max(0, Math.min(100, score)),
    summary: `${hasLock ? "Dependency lockfile present" : "No dependency lockfile found (pin dependencies)"}${envFiles.length > 0 ? `; ${envFiles.length} .env file(s) on disk — ensure they are gitignored and free of committed secrets` : ""}.`
  };
}

export function buildPostureScorecard(params: { root: string; now: number }): PostureScorecard {
  const root = resolve(params.root);
  const dims: PostureDimension[] = [];
  const actions: string[] = [];

  // 1. Agent config
  const cfg = scanAgentConfig({ root, now: params.now });
  dims.push({
    id: "agent-config",
    level: cfg.securityLevel as PostureLevel,
    score: cfg.securityScore,
    status: statusFor(cfg.securityScore),
    summary: `${cfg.filesScanned.length} config file(s); ${cfg.findings.length} finding(s); ${cfg.riskLabel}.`
  });
  actions.push(...cfg.recommendations.slice(0, 3));

  // 2. Secrets on disk (derived from the config scan's secret findings)
  const secretFindings = cfg.findings.filter((f) => f.category === "SECRET_EXPOSURE");
  const anySecretCritical = secretFindings.some((f) => f.severity === "CRITICAL");
  const secretScore = anySecretCritical ? 10 : secretFindings.length > 0 ? 50 : 95;
  dims.push({
    id: "secrets-on-disk",
    level: scoreToLevel(secretScore),
    score: secretScore,
    status: statusFor(secretScore),
    summary: secretFindings.length === 0 ? "No credential-shaped values found in agent config." : `${secretFindings.length} secret/PII finding(s) in config; move secrets to a secret manager.`
  });
  if (anySecretCritical) actions.unshift("Remove hardcoded credentials from agent config immediately.");

  // 3. MCP trust
  const mcpConfigs = findMcpConfigs(root);
  if (mcpConfigs.length > 0) {
    const receipt = buildMcpTrustReceipt({ targets: mcpConfigs, generatedAt: params.now });
    const mcpScore = receipt.aggregateRisk === "CLEAN" ? 90 : receipt.aggregateRisk === "REVIEW" ? 55 : 20;
    dims.push({
      id: "mcp-trust",
      level: scoreToLevel(mcpScore),
      score: mcpScore,
      status: statusFor(mcpScore),
      summary: `${receipt.serverCount} MCP server(s); aggregate ${receipt.aggregateRisk}; lowest ${receipt.lowestLevel}.`
    });
    if (receipt.aggregateRisk !== "CLEAN") actions.push("Review flagged MCP servers with `amc shield mcp-ledger`.");
  } else {
    dims.push({
      id: "mcp-trust",
      level: "L3",
      score: 60,
      status: "PASS",
      summary: "No MCP server configuration found on this path."
    });
  }

  // 4. Isolation
  const iso = assessIsolation(root);
  dims.push({ id: "isolation", level: scoreToLevel(iso.score), score: iso.score, status: statusFor(iso.score), summary: iso.summary });
  if (iso.score < 55) actions.push("Run agents inside a disposable sandbox/container with scoped mounts.");

  // 5. Supply chain
  const sc = assessSupplyChain(root);
  dims.push({ id: "supply-chain", level: scoreToLevel(sc.score), score: sc.score, status: statusFor(sc.score), summary: sc.summary });
  if (sc.score < 55) actions.push("Pin dependencies with a lockfile and keep .env files out of version control.");

  const overallScore = Math.round(dims.reduce((a, d) => a + d.score, 0) / dims.length);
  const overallLevel = scoreToLevel(overallScore);
  const anyFail = dims.some((d) => d.status === "FAIL");
  const anyReview = dims.some((d) => d.status === "REVIEW");
  const verdict: PostureScorecard["verdict"] = anyFail ? "BLOCK" : anyReview ? "REVIEW" : "CLEAN";

  const body = {
    schemaVersion: "amc.posture-scorecard.v1" as const,
    scannedAt: params.now,
    root,
    overallLevel,
    overallScore,
    verdict,
    dimensions: dims,
    topActions: [...new Set(actions)].slice(0, 6)
  };
  return { ...body, receiptHash: sha256Hex(canonicalize({ ...body, root: "." })) };
}

export function levelIndex(level: PostureLevel): number {
  const i = LEVEL_ORDER.indexOf(level);
  return i < 0 ? 0 : i;
}

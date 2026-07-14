/**
 * Agent configuration security scanner (competitive gap-close vs config-only
 * scanners like ECC AgentShield).
 *
 * AMC already scores MCP server definitions (mcpSecurityAnalyzer) and keeps a
 * signed MCP trust ledger. This module extends static security analysis to the
 * rest of the coding-agent configuration surface — instruction files
 * (CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules), permission settings
 * (.claude/settings*.json), hook definitions, and agent/subagent definition
 * files — and folds discovered MCP configs into one result.
 *
 * The AMC-native differentiator over unsigned config scanners: the result is
 * deterministic and carries a hash-chained receipt (reproducible and
 * verifiable), scored on AMC's L0–L5 model, and reuses AMC's own DLP secret
 * detection. No competitor rules, code, prompts, taxonomy, or report format are
 * copied; only the product lesson (scan the agent config surface) is taken.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { scanForPII } from "../vault/dlp.js";
import { analyzeMcpSecurity } from "./mcpSecurityAnalyzer.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ConfigFindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ConfigSecurityLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export type ConfigFindingCategory =
  | "SECRET_EXPOSURE"
  | "EXCESSIVE_AUTONOMY"
  | "HOOK_INJECTION"
  | "INSTRUCTION_INTEGRITY"
  | "UNSAFE_MCP"
  | "CONFIGURATION";

export interface AgentConfigFinding {
  id: string;
  severity: ConfigFindingSeverity;
  category: ConfigFindingCategory;
  file: string;
  title: string;
  description: string;
  recommendation: string;
  evidence?: string;
}

export interface AgentConfigScanResult {
  schemaVersion: "amc.agent-config-scan.v1";
  scannedAt: number;
  root: string;
  filesScanned: string[];
  securityLevel: ConfigSecurityLevel;
  securityScore: number;
  riskLabel: string;
  aggregateRisk: "CLEAN" | "REVIEW" | "BLOCK";
  findings: AgentConfigFinding[];
  recommendations: string[];
  receiptHash: string;
}

// Filenames (case-insensitive) that are coding-agent config surfaces.
const INSTRUCTION_FILES = new Set(["claude.md", "agents.md", "gemini.md", ".cursorrules", ".windsurfrules", "copilot-instructions.md"]);
const SETTINGS_FILES = new Set(["settings.json", "settings.local.json"]);
const MCP_FILES = new Set([".mcp.json", "mcp.json"]);

// Directories worth walking for agent config; everything else is skipped so a
// scan of a repo root does not descend into node_modules or build output.
const WALK_DIRS = new Set([".claude", ".cursor", ".codex", ".gemini", ".config", "agents", "hooks", "rules"]);

interface DiscoveredFile {
  absPath: string;
  relPath: string;
  name: string;
  kind: "instruction" | "settings" | "mcp" | "hook" | "agentdef" | "other";
}

function classify(name: string, relPath: string): DiscoveredFile["kind"] {
  const lower = name.toLowerCase();
  if (INSTRUCTION_FILES.has(lower) || lower.endsWith(".mdc")) return "instruction";
  if (SETTINGS_FILES.has(lower)) return "settings";
  if (MCP_FILES.has(lower)) return "mcp";
  if (relPath.includes("hooks")) return "hook";
  if (relPath.includes("agents") && (lower.endsWith(".md") || lower.endsWith(".json"))) return "agentdef";
  return "other";
}

function discover(root: string): DiscoveredFile[] {
  const out: DiscoveredFile[] = [];
  const seen = new Set<string>();
  const pushIf = (absPath: string) => {
    let st;
    try { st = statSync(absPath); } catch { return; }
    if (!st.isFile() || st.size > 512 * 1024) return;
    if (seen.has(absPath)) return;
    seen.add(absPath);
    const relPath = relative(root, absPath) || basename(absPath);
    const name = basename(absPath);
    const kind = classify(name, relPath);
    if (kind === "other") return;
    out.push({ absPath, relPath, name, kind });
  };

  // Top-level well-known files.
  for (const entry of safeReaddir(root)) {
    pushIf(join(root, entry));
  }
  // One level into known agent-config directories.
  for (const dirName of WALK_DIRS) {
    const dir = join(root, dirName);
    walk(dir, 3, pushIf);
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function safeReaddir(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

function walk(dir: string, depth: number, visit: (abs: string) => void): void {
  if (depth < 0) return;
  let entries: string[] = [];
  try { entries = readdirSync(dir, { withFileTypes: true }).map((d) => (d.isDirectory() ? `/${d.name}` : d.name)); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith("/")) {
      walk(join(dir, entry.slice(1)), depth - 1, visit);
    } else {
      visit(join(dir, entry));
    }
  }
}

function readSafe(absPath: string): string {
  try { return readFileSync(absPath, "utf8"); } catch { return ""; }
}

// --- Rule checks (AMC-native) ---

const AUTONOMY_PATTERNS: Array<{ re: RegExp; title: string; severity: ConfigFindingSeverity }> = [
  { re: /"?(?:default_?mode|permission_?mode)"?\s*[:=]\s*"?(?:bypasspermissions|bypass|yolo|acceptedits|auto)/i, title: "Permission prompts bypassed by default", severity: "HIGH" },
  { re: /"?(?:dangerously_?skip_?permissions|skip_?permissions|disable_?confirmation|auto_?approve|autoapprove)"?\s*[:=]\s*"?true/i, title: "Confirmations auto-approved", severity: "HIGH" },
  { re: /"?allow"?\s*[:=]\s*\[?\s*"?\*/i, title: "Wildcard allow-list grants every tool/command", severity: "HIGH" },
  { re: /\byolo\b|--dangerously-skip-permissions/i, title: "YOLO / skip-permissions mode enabled", severity: "HIGH" },
];

const HOOK_SHELL_PATTERNS: Array<{ re: RegExp; title: string; severity: ConfigFindingSeverity }> = [
  { re: /curl\s+[^\n|]*\|\s*(?:sh|bash|zsh)\b/i, title: "Hook pipes remote content into a shell (curl | sh)", severity: "CRITICAL" },
  { re: /wget\s+[^\n|]*\|\s*(?:sh|bash)\b/i, title: "Hook pipes remote content into a shell (wget | sh)", severity: "CRITICAL" },
  { re: /base64\s+-d[^\n|]*\|\s*(?:sh|bash)\b/i, title: "Hook decodes base64 into a shell", severity: "CRITICAL" },
  { re: /\beval\s*\(/i, title: "Hook uses eval()", severity: "HIGH" },
  { re: /rm\s+-rf\s+[~/]/i, title: "Hook performs a destructive recursive delete", severity: "HIGH" },
  { re: /\bnpx\s+(?!-y\s+[a-z@])/i, title: "Hook runs an unpinned npx package", severity: "MEDIUM" },
];

const INSTRUCTION_INJECTION_PATTERNS: Array<{ re: RegExp; title: string; severity: ConfigFindingSeverity }> = [
  { re: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i, title: "Instruction file contains a prompt-injection override", severity: "HIGH" },
  { re: /(?:run|execute)\s+any\s+(?:command|shell|code)\s+without\s+(?:asking|confirmation|approval)/i, title: "Instruction file tells the agent to run anything without asking", severity: "HIGH" },
  { re: /(?:disable|turn\s+off|ignore)\s+(?:all\s+)?(?:safety|guardrails?|security)\s+(?:checks?|rules?)/i, title: "Instruction file tells the agent to disable safety", severity: "HIGH" },
  { re: /(?:download|fetch|curl)[^\n.]{0,60}(?:and|then)\s+(?:run|execute|exec)/i, title: "Instruction file directs fetch-and-execute", severity: "MEDIUM" },
  { re: /send\s+[^\n.]{0,40}(?:secret|token|key|env|credential)[^\n.]{0,40}(?:to|http)/i, title: "Instruction file directs credential exfiltration", severity: "CRITICAL" },
];

function pushSecretFindings(file: string, content: string, findings: AgentConfigFinding[]): void {
  const pii = scanForPII(content);
  if (!pii.found) return;
  const secretTypes = pii.types.filter((t) => t.startsWith("api_key") || t === "password_json");
  const otherTypes = pii.types.filter((t) => !secretTypes.includes(t));
  if (secretTypes.length > 0) {
    findings.push({
      id: `secret:${file}`,
      severity: "CRITICAL",
      category: "SECRET_EXPOSURE",
      file,
      title: "Hardcoded credential in agent config",
      description: `Detected credential-shaped values (${secretTypes.join(", ")}) inside a configuration file the agent reads.`,
      recommendation: "Move secrets to environment variables or a secret manager; never commit keys in agent config."
    });
  }
  if (otherTypes.length > 0) {
    findings.push({
      id: `pii:${file}`,
      severity: "MEDIUM",
      category: "SECRET_EXPOSURE",
      file,
      title: "Personal data in agent config",
      description: `Detected personal-data-shaped values (${otherTypes.join(", ")}).`,
      recommendation: "Remove personal data from configuration files the agent reads and logs."
    });
  }
}

function matchRules(
  file: string,
  content: string,
  rules: Array<{ re: RegExp; title: string; severity: ConfigFindingSeverity }>,
  category: ConfigFindingCategory,
  recommendation: string,
  findings: AgentConfigFinding[]
): void {
  for (const rule of rules) {
    const m = rule.re.exec(content);
    if (m) {
      findings.push({
        id: `${category.toLowerCase()}:${file}:${rule.title.slice(0, 24)}`,
        severity: rule.severity,
        category,
        file,
        title: rule.title,
        description: `Matched in ${file}.`,
        recommendation,
        evidence: m[0].slice(0, 120)
      });
    }
  }
}

const SEVERITY_WEIGHT: Record<ConfigFindingSeverity, number> = { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3, INFO: 1 };

function scoreToLevel(score: number): ConfigSecurityLevel {
  if (score >= 85) return "L5";
  if (score >= 70) return "L4";
  if (score >= 55) return "L3";
  if (score >= 40) return "L2";
  if (score >= 20) return "L1";
  return "L0";
}

const RISK_LABEL: Record<ConfigSecurityLevel, string> = {
  L5: "SECURE", L4: "HARDENED", L3: "ACCEPTABLE", L2: "NEEDS IMPROVEMENT", L1: "AT RISK", L0: "CRITICAL RISK"
};

export function scanAgentConfig(params: { root: string; now: number }): AgentConfigScanResult {
  const root = resolve(params.root);
  const files = discover(root);
  const findings: AgentConfigFinding[] = [];

  for (const file of files) {
    const content = readSafe(file.absPath);
    if (!content) continue;
    pushSecretFindings(file.relPath, content, findings);
    if (file.kind === "instruction" || file.kind === "agentdef") {
      matchRules(file.relPath, content, INSTRUCTION_INJECTION_PATTERNS, "INSTRUCTION_INTEGRITY",
        "Treat instruction files as trusted input; remove directives that weaken agent oversight.", findings);
    }
    if (file.kind === "settings" || file.kind === "agentdef") {
      matchRules(file.relPath, content, AUTONOMY_PATTERNS, "EXCESSIVE_AUTONOMY",
        "Require explicit approval for high-risk tools; avoid wildcard allow-lists and permission bypass.", findings);
    }
    if (file.kind === "hook" || file.kind === "settings") {
      matchRules(file.relPath, content, HOOK_SHELL_PATTERNS, "HOOK_INJECTION",
        "Pin and vet anything a hook executes; never pipe remote content into a shell.", findings);
    }
    if (file.kind === "mcp") {
      try {
        const mcp = analyzeMcpSecurity(file.absPath);
        for (const f of mcp.findings.filter((x) => x.severity === "CRITICAL" || x.severity === "HIGH")) {
          findings.push({
            id: `unsafe_mcp:${file.relPath}:${f.id}`,
            severity: f.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
            category: "UNSAFE_MCP",
            file: file.relPath,
            title: `MCP risk: ${f.title}`,
            description: f.description,
            recommendation: f.recommendation
          });
        }
      } catch {
        // unparseable MCP config is a configuration finding, not a crash
        findings.push({
          id: `configuration:${file.relPath}:unparseable-mcp`,
          severity: "LOW",
          category: "CONFIGURATION",
          file: file.relPath,
          title: "MCP config could not be parsed",
          description: "The MCP configuration file could not be analyzed.",
          recommendation: "Ensure the MCP config is valid JSON so it can be security-scanned."
        });
      }
    }
  }

  if (files.length === 0) {
    findings.push({
      id: "configuration:none",
      severity: "INFO",
      category: "CONFIGURATION",
      file: ".",
      title: "No agent configuration found",
      description: "No CLAUDE.md, settings, hooks, MCP, or agent-definition files were found under this path.",
      recommendation: "If this directory hosts a coding agent, add an instruction file and reviewed settings so posture can be assessed."
    });
  }

  let score = 100;
  for (const f of findings) score -= SEVERITY_WEIGHT[f.severity];
  score = Math.max(0, Math.min(100, score));
  const securityLevel = scoreToLevel(score);
  const anyCritical = findings.some((f) => f.severity === "CRITICAL");
  const anyHigh = findings.some((f) => f.severity === "HIGH");
  const aggregateRisk: AgentConfigScanResult["aggregateRisk"] = anyCritical ? "BLOCK" : anyHigh ? "REVIEW" : "CLEAN";

  const recommendations = [...new Set(findings.map((f) => f.recommendation))].slice(0, 10);

  const body = {
    schemaVersion: "amc.agent-config-scan.v1" as const,
    scannedAt: params.now,
    root,
    filesScanned: files.map((f) => f.relPath),
    securityLevel,
    securityScore: score,
    riskLabel: RISK_LABEL[securityLevel],
    aggregateRisk,
    findings: findings.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]),
    recommendations
  };
  return { ...body, receiptHash: sha256Hex(canonicalize({ ...body, root: relative(root, root) })) };
}

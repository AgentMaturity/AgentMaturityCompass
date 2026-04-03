/**
 * MCP Server Security Analyzer
 *
 * Scans MCP (Model Context Protocol) server definitions for security risks:
 * - Excessive permissions (filesystem, network, exec)
 * - Missing input validation
 * - Lack of sandboxing
 * - Sensitive data exposure
 * - Tool count and complexity scoring
 *
 * Outputs a MCP Security Score (L0–L5) and specific findings.
 */

import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";

export type McpSecurityLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
export type McpFindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface McpSecurityFinding {
  id: string;
  severity: McpFindingSeverity;
  category: "PERMISSIONS" | "VALIDATION" | "SANDBOXING" | "DATA_EXPOSURE" | "COMPLEXITY" | "CONFIGURATION";
  title: string;
  description: string;
  recommendation: string;
  line?: number;
  evidence?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  hasInputSchema: boolean;
  parameterCount: number;
  hasRiskyKeywords: boolean;
  riskyKeywords: string[];
}

export interface McpServerInfo {
  name?: string;
  version?: string;
  toolCount: number;
  tools: McpToolInfo[];
  hasTransportConfig: boolean;
  transportType?: string;
  hasAuthConfig: boolean;
  hasSandboxConfig: boolean;
  hasRateLimiting: boolean;
  hasLogging: boolean;
}

export interface McpSecurityScanResult {
  path: string;
  scannedAt: number;
  securityLevel: McpSecurityLevel;
  securityScore: number;
  riskLabel: string;
  serverInfo: McpServerInfo;
  findings: McpSecurityFinding[];
  recommendations: string[];
  summary: string;
}

// Keywords that indicate potentially dangerous capabilities
const FILESYSTEM_KEYWORDS = [
  "readFile", "writeFile", "unlink", "rmdir", "mkdir", "rename",
  "fs.", "file_read", "file_write", "file_delete", "path.join",
  "createWriteStream", "createReadStream", "open_file", "write_file",
  "read_file", "delete_file", "filesystem", "file_system"
];

const NETWORK_KEYWORDS = [
  "fetch(", "http.get", "http.post", "axios", "request(",
  "XMLHttpRequest", "WebSocket", "net.connect", "dns.lookup",
  "socket", "tcp", "udp", "curl", "wget", "http_request",
  "network_request", "make_request"
];

const EXEC_KEYWORDS = [
  "exec(", "execSync(", "spawn(", "spawnSync(", "child_process",
  "shell.run", "run_command", "execute_command", "bash", "sh -c",
  "subprocess", "os.system", "eval(", "Function(", "vm.runInNewContext"
];

const SENSITIVE_DATA_KEYWORDS = [
  "password", "passwd", "secret", "api_key", "apikey", "token",
  "credentials", "private_key", "privatekey", "auth_token",
  "access_token", "refresh_token", "bearer", "encryption_key",
  "database_url", "connection_string", "ssn", "social_security",
  "credit_card", "cvv", "bank_account"
];

const RISKY_TOOL_NAMES = [
  "execute", "run", "shell", "bash", "eval", "spawn",
  "system", "cmd", "command", "terminal", "process",
  "delete", "remove", "drop", "truncate", "wipe",
  "admin", "root", "sudo", "privilege"
];

function loadContent(pathOrUrl: string): { content: string; isUrl: boolean } {
  // Simple URL detection
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    // Synchronous URL fetch using execSync (child_process is already imported above)
    try {
      const { execSync } = require("node:child_process");
      const result = execSync(
        `curl -sS --max-time 10 --max-filesize 1048576 -L ${JSON.stringify(pathOrUrl)}`,
        { encoding: "utf8", timeout: 15_000 }
      );
      return { content: result, isUrl: true };
    } catch (err) {
      throw new Error(`Cannot fetch MCP config from URL ${pathOrUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const resolved = resolve(pathOrUrl);
  const ext = extname(resolved).toLowerCase();

  try {
    const raw = readFileSync(resolved, "utf8");
    return { content: raw, isUrl: false };
  } catch (err) {
    throw new Error(`Cannot read MCP file at ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function parseMcpContent(content: string): unknown {
  // Try JSON first, then treat as source code
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractServerInfo(parsed: unknown, rawContent: string): McpServerInfo {
  const info: McpServerInfo = {
    toolCount: 0,
    tools: [],
    hasTransportConfig: false,
    hasAuthConfig: false,
    hasSandboxConfig: false,
    hasRateLimiting: false,
    hasLogging: false
  };

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;

    // Extract server name/version
    if (typeof obj["name"] === "string") info.name = obj["name"];
    if (typeof obj["version"] === "string") info.version = obj["version"];

    // Check for tools array
    const toolsSource = obj["tools"] ?? obj["capabilities"]?.valueOf();
    const tools = Array.isArray(obj["tools"]) ? obj["tools"] : [];
    info.toolCount = tools.length;

    for (const tool of tools) {
      if (tool && typeof tool === "object") {
        const t = tool as Record<string, unknown>;
        const name = typeof t["name"] === "string" ? t["name"] : "unknown";
        const description = typeof t["description"] === "string" ? t["description"] : undefined;
        const inputSchema = t["inputSchema"] ?? t["parameters"] ?? t["schema"];
        const hasInputSchema = inputSchema !== undefined && inputSchema !== null;
        const params = hasInputSchema && typeof inputSchema === "object" && inputSchema !== null
          ? Object.keys((inputSchema as Record<string, unknown>)["properties"] as Record<string, unknown> ?? {}).length
          : 0;

        // Check for risky keywords in tool name/description
        const combined = `${name} ${description ?? ""}`.toLowerCase();
        const riskyKws = RISKY_TOOL_NAMES.filter(kw => combined.includes(kw));
        const execKws = EXEC_KEYWORDS.filter(kw => combined.includes(kw.toLowerCase()));
        const fsKws = FILESYSTEM_KEYWORDS.filter(kw => combined.includes(kw.toLowerCase()));
        const netKws = NETWORK_KEYWORDS.filter(kw => combined.includes(kw.toLowerCase()));
        const allRisky = [...new Set([...riskyKws, ...execKws, ...fsKws, ...netKws])];

        info.tools.push({
          name,
          description,
          hasInputSchema,
          parameterCount: params,
          hasRiskyKeywords: allRisky.length > 0,
          riskyKeywords: allRisky
        });
      }
    }

    // Check transport
    if (obj["transport"] ?? obj["server"]?.valueOf()) {
      info.hasTransportConfig = true;
      const transport = obj["transport"];
      if (transport && typeof transport === "object") {
        const t = transport as Record<string, unknown>;
        info.transportType = typeof t["type"] === "string" ? t["type"] : undefined;
      }
    }

    // Check auth
    if (obj["auth"] ?? obj["authentication"] ?? obj["security"]) {
      info.hasAuthConfig = true;
    }

    // Check sandbox
    if (obj["sandbox"] ?? obj["isolation"] ?? obj["container"]) {
      info.hasSandboxConfig = true;
    }

    // Check rate limiting
    if (obj["rateLimit"] ?? obj["rateLimiting"] ?? obj["throttle"] ?? obj["maxRequests"]) {
      info.hasRateLimiting = true;
    }

    // Check logging
    if (obj["logging"] ?? obj["log"] ?? obj["audit"] ?? obj["telemetry"]) {
      info.hasLogging = true;
    }
  }

  // Source code analysis (when not pure JSON config)
  const lc = rawContent.toLowerCase();
  if (!info.hasAuthConfig && (lc.includes("apikey") || lc.includes("auth") || lc.includes("bearer"))) {
    info.hasAuthConfig = true;
  }
  if (!info.hasSandboxConfig && (lc.includes("sandbox") || lc.includes("seccomp") || lc.includes("namespac"))) {
    info.hasSandboxConfig = true;
  }
  if (!info.hasRateLimiting && (lc.includes("ratelimit") || lc.includes("rate_limit") || lc.includes("throttle"))) {
    info.hasRateLimiting = true;
  }
  if (!info.hasLogging && (lc.includes("console.log") || lc.includes("logger") || lc.includes("winston") || lc.includes("pino"))) {
    info.hasLogging = true;
  }

  return info;
}

function analyzeFindings(serverInfo: McpServerInfo, rawContent: string): McpSecurityFinding[] {
  const findings: McpSecurityFinding[] = [];
  const lc = rawContent.toLowerCase();

  // ── Permissions Analysis ──────────────────────────────────────────────

  const fsMatches = FILESYSTEM_KEYWORDS.filter(kw => rawContent.includes(kw));
  if (fsMatches.length > 0) {
    findings.push({
      id: "MCP-PERM-001",
      severity: "HIGH",
      category: "PERMISSIONS",
      title: "Filesystem access detected",
      description: `MCP server contains filesystem operations: ${fsMatches.slice(0, 5).join(", ")}`,
      recommendation: "Restrict filesystem access to specific allowed paths. Use a whitelist of permitted directories. Never allow unrestricted read/write access.",
      evidence: fsMatches.slice(0, 3).join(", ")
    });
  }

  const netMatches = NETWORK_KEYWORDS.filter(kw => rawContent.includes(kw));
  if (netMatches.length > 0) {
    findings.push({
      id: "MCP-PERM-002",
      severity: "HIGH",
      category: "PERMISSIONS",
      title: "Network access detected",
      description: `MCP server makes network calls: ${netMatches.slice(0, 5).join(", ")}`,
      recommendation: "Implement egress filtering with explicit allowlist of permitted domains/IPs. Log all outbound network requests.",
      evidence: netMatches.slice(0, 3).join(", ")
    });
  }

  const execMatches = EXEC_KEYWORDS.filter(kw => rawContent.includes(kw));
  if (execMatches.length > 0) {
    findings.push({
      id: "MCP-PERM-003",
      severity: "CRITICAL",
      category: "PERMISSIONS",
      title: "Code execution capabilities detected",
      description: `MCP server can execute arbitrary code or shell commands: ${execMatches.slice(0, 5).join(", ")}`,
      recommendation: "CRITICAL: Remove arbitrary code execution. If command execution is necessary, use strict allowlists and sandboxing. Never pass untrusted input to exec/spawn.",
      evidence: execMatches.slice(0, 3).join(", ")
    });
  }

  // ── Validation Analysis ───────────────────────────────────────────────

  const toolsWithoutSchema = serverInfo.tools.filter(t => !t.hasInputSchema);
  if (toolsWithoutSchema.length > 0) {
    findings.push({
      id: "MCP-VALID-001",
      severity: "HIGH",
      category: "VALIDATION",
      title: "Tools missing input schema validation",
      description: `${toolsWithoutSchema.length} tool(s) lack inputSchema: ${toolsWithoutSchema.map(t => t.name).join(", ")}`,
      recommendation: "Add JSON Schema inputSchema to every tool. This enables type checking, prevents injection attacks, and improves LLM reliability.",
      evidence: toolsWithoutSchema.map(t => t.name).join(", ")
    });
  }

  const noInputValidation = !lc.includes("zod") && !lc.includes("joi") && !lc.includes("ajv") &&
    !lc.includes("validate") && !lc.includes("sanitize") && serverInfo.toolCount > 0;
  if (noInputValidation) {
    findings.push({
      id: "MCP-VALID-002",
      severity: "MEDIUM",
      category: "VALIDATION",
      title: "No input validation library detected",
      description: "No input validation library (zod, joi, ajv) found. Input sanitisation may be insufficient.",
      recommendation: "Use a schema validation library (zod, joi, or ajv) to validate all tool inputs before processing. Sanitise strings to prevent injection attacks."
    });
  }

  // ── Sandboxing Analysis ───────────────────────────────────────────────

  if (!serverInfo.hasSandboxConfig) {
    const severity: McpFindingSeverity = execMatches.length > 0 || fsMatches.length > 0 ? "HIGH" : "MEDIUM";
    findings.push({
      id: "MCP-SANDBOX-001",
      severity,
      category: "SANDBOXING",
      title: "No sandboxing configuration detected",
      description: "MCP server does not appear to use sandboxing or process isolation.",
      recommendation: "Deploy MCP servers in isolated containers (Docker/gVisor). Use seccomp profiles to restrict syscalls. Consider running with minimal Linux capabilities."
    });
  }

  if (!serverInfo.hasRateLimiting) {
    findings.push({
      id: "MCP-SANDBOX-002",
      severity: "MEDIUM",
      category: "SANDBOXING",
      title: "No rate limiting detected",
      description: "MCP server lacks rate limiting, making it susceptible to resource exhaustion attacks.",
      recommendation: "Implement per-client rate limiting. Set maximum tool call frequency and concurrent request limits."
    });
  }

  // ── Sensitive Data Analysis ────────────────────────────────────────────

  const sensitiveMatches = SENSITIVE_DATA_KEYWORDS.filter(kw => lc.includes(kw));
  if (sensitiveMatches.length > 0) {
    // Check if they're in config/env references (acceptable) vs hardcoded
    const hardcodedPattern = /['"](password|secret|api_?key|token)['"]\s*[:=]\s*['"]\w{6,}/i;
    const hasHardcoded = hardcodedPattern.test(rawContent);
    findings.push({
      id: "MCP-DATA-001",
      severity: hasHardcoded ? "CRITICAL" : "MEDIUM",
      category: "DATA_EXPOSURE",
      title: hasHardcoded ? "Potential hardcoded credentials" : "Sensitive data keywords detected",
      description: `Sensitive data references found: ${sensitiveMatches.slice(0, 5).join(", ")}`,
      recommendation: hasHardcoded
        ? "CRITICAL: Remove hardcoded credentials immediately. Use environment variables or a secrets manager."
        : "Ensure sensitive data (API keys, passwords) is loaded from environment variables or a secrets manager, never hardcoded.",
      evidence: sensitiveMatches.slice(0, 3).join(", ")
    });
  }

  if (!serverInfo.hasLogging) {
    findings.push({
      id: "MCP-DATA-002",
      severity: "LOW",
      category: "DATA_EXPOSURE",
      title: "No audit logging detected",
      description: "MCP server lacks audit logging, making post-incident analysis difficult.",
      recommendation: "Add structured audit logging for all tool invocations including caller identity, inputs (redacted), and outputs. Store logs securely."
    });
  }

  // ── Complexity Analysis ───────────────────────────────────────────────

  if (serverInfo.toolCount > 20) {
    findings.push({
      id: "MCP-COMPLEX-001",
      severity: "MEDIUM",
      category: "COMPLEXITY",
      title: "High tool count increases attack surface",
      description: `Server exposes ${serverInfo.toolCount} tools. Each tool is a potential attack vector.`,
      recommendation: "Apply principle of least privilege — only expose tools required for the specific use case. Consider splitting into multiple focused MCP servers."
    });
  }

  const riskyTools = serverInfo.tools.filter(t => t.hasRiskyKeywords);
  for (const tool of riskyTools) {
    findings.push({
      id: `MCP-COMPLEX-${tool.name.toUpperCase().slice(0, 8)}`,
      severity: "HIGH",
      category: "COMPLEXITY",
      title: `Risky tool name: "${tool.name}"`,
      description: `Tool "${tool.name}" has keywords suggesting dangerous capabilities: ${tool.riskyKeywords.join(", ")}`,
      recommendation: `Review tool "${tool.name}" carefully. Ensure it is strictly scoped, validates all inputs, and cannot be used for privilege escalation.`,
      evidence: tool.riskyKeywords.join(", ")
    });
  }

  // ── Auth Analysis ─────────────────────────────────────────────────────

  if (!serverInfo.hasAuthConfig) {
    findings.push({
      id: "MCP-CONFIG-001",
      severity: "HIGH",
      category: "CONFIGURATION",
      title: "No authentication configuration detected",
      description: "MCP server does not appear to have authentication/authorisation configured.",
      recommendation: "Implement authentication for MCP server access. Use API keys, mTLS, or JWT tokens. Ensure only authorised clients can invoke tools."
    });
  }

  return findings;
}

function computeSecurityScore(serverInfo: McpServerInfo, findings: McpSecurityFinding[]): number {
  let score = 100;

  // Deduct for findings
  for (const finding of findings) {
    switch (finding.severity) {
      case "CRITICAL": score -= 25; break;
      case "HIGH": score -= 15; break;
      case "MEDIUM": score -= 8; break;
      case "LOW": score -= 3; break;
      case "INFO": score -= 1; break;
    }
  }

  // Bonus for good practices
  if (serverInfo.hasAuthConfig) score += 5;
  if (serverInfo.hasSandboxConfig) score += 10;
  if (serverInfo.hasRateLimiting) score += 5;
  if (serverInfo.hasLogging) score += 5;

  // Tool count penalty
  if (serverInfo.toolCount > 30) score -= 15;
  else if (serverInfo.toolCount > 20) score -= 8;
  else if (serverInfo.toolCount > 10) score -= 3;

  return Math.max(0, Math.min(100, score));
}

function scoreToLevel(score: number): McpSecurityLevel {
  if (score >= 85) return "L5";
  if (score >= 70) return "L4";
  if (score >= 55) return "L3";
  if (score >= 40) return "L2";
  if (score >= 20) return "L1";
  return "L0";
}

function levelToRiskLabel(level: McpSecurityLevel): string {
  const labels: Record<McpSecurityLevel, string> = {
    "L5": "SECURE",
    "L4": "HARDENED",
    "L3": "ACCEPTABLE",
    "L2": "NEEDS IMPROVEMENT",
    "L1": "AT RISK",
    "L0": "CRITICAL RISK"
  };
  return labels[level];
}

function buildRecommendations(serverInfo: McpServerInfo, findings: McpSecurityFinding[]): string[] {
  const recs: string[] = [];

  const critical = findings.filter(f => f.severity === "CRITICAL");
  const high = findings.filter(f => f.severity === "HIGH");

  if (critical.length > 0) {
    recs.push(`🔴 Address ${critical.length} CRITICAL finding(s) before any deployment.`);
  }
  if (high.length > 0) {
    recs.push(`🟠 Remediate ${high.length} HIGH severity finding(s) as soon as possible.`);
  }
  if (!serverInfo.hasSandboxConfig) {
    recs.push("🔒 Deploy in an isolated sandbox (Docker + seccomp profile).");
  }
  if (!serverInfo.hasAuthConfig) {
    recs.push("🔑 Implement authentication before exposing to any LLM agent.");
  }
  if (!serverInfo.hasRateLimiting) {
    recs.push("⏱️ Add rate limiting to prevent resource exhaustion.");
  }
  if (!serverInfo.hasLogging) {
    recs.push("📋 Enable audit logging for all tool invocations.");
  }
  if (serverInfo.toolCount > 15) {
    recs.push(`🔧 Consider splitting ${serverInfo.toolCount} tools across multiple scoped MCP servers.`);
  }

  return recs;
}

/**
 * Scan an MCP server definition file for security risks.
 */
export function analyzeMcpSecurity(pathOrUrl: string): McpSecurityScanResult {
  const { content, isUrl } = loadContent(pathOrUrl);
  const parsed = parseMcpContent(content);
  const serverInfo = extractServerInfo(parsed, content);
  const findings = analyzeFindings(serverInfo, content);
  const securityScore = computeSecurityScore(serverInfo, findings);
  const securityLevel = scoreToLevel(securityScore);
  const riskLabel = levelToRiskLabel(securityLevel);
  const recommendations = buildRecommendations(serverInfo, findings);

  const criticalCount = findings.filter(f => f.severity === "CRITICAL").length;
  const highCount = findings.filter(f => f.severity === "HIGH").length;
  const summary = [
    `MCP Security Level: ${securityLevel} (${riskLabel}) — Score: ${securityScore}/100`,
    `Tools: ${serverInfo.toolCount} | Findings: ${findings.length} (${criticalCount} critical, ${highCount} high)`,
    criticalCount > 0
      ? `⚠️ CRITICAL: ${criticalCount} critical risk(s) found — deployment not recommended.`
      : securityScore >= 70
        ? "✅ Security posture is acceptable with listed improvements."
        : "⚠️ Security posture needs improvement before production deployment."
  ].join("\n");

  return {
    path: pathOrUrl,
    scannedAt: Date.now(),
    securityLevel,
    securityScore,
    riskLabel,
    serverInfo,
    findings,
    recommendations,
    summary
  };
}

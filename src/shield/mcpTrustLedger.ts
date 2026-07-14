/**
 * MCP Trust Ledger (P2 white-space).
 *
 * Point-in-time MCP scanners exist across the ecosystem. What does not exist is
 * a signed, hash-chained inventory receipt that answers "is this whole set of
 * MCP servers clean as of date X, and has anything changed since the last
 * check?". This module builds that receipt on top of the existing
 * analyzeMcpSecurity scanner without adding a second scanner, policy engine, or
 * network client.
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeMcpSecurity, type McpSecurityScanResult } from "./mcpSecurityAnalyzer.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface McpLedgerEntry {
  path: string;
  serverName: string | null;
  securityLevel: string;
  securityScore: number;
  riskLabel: string;
  toolCount: number;
  criticalFindings: number;
  highFindings: number;
  contentHash: string;
}

export interface McpTrustReceipt {
  schemaVersion: "amc.mcp-trust-ledger.v1";
  generatedAt: number;
  serverCount: number;
  lowestLevel: string;
  cleanAsOf: boolean;
  aggregateRisk: "CLEAN" | "REVIEW" | "BLOCK";
  entries: McpLedgerEntry[];
  changedSincePrevious: string[] | null;
  receiptHash: string;
}

const LEVEL_ORDER = ["L0", "L1", "L2", "L3", "L4", "L5"];

function levelIndex(level: string): number {
  const idx = LEVEL_ORDER.indexOf(level);
  return idx < 0 ? 0 : idx;
}

function collectDefinitionFiles(targets: string[]): string[] {
  const files: string[] = [];
  for (const target of targets) {
    const resolved = resolve(target);
    let stat;
    try {
      stat = statSync(resolved);
    } catch {
      // Non-file targets (e.g. URLs) are passed straight through to the scanner.
      files.push(target);
      continue;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(resolved)) {
        if (/\.(json|ya?ml|toml)$/i.test(name)) {
          files.push(join(resolved, name));
        }
      }
    } else {
      files.push(resolved);
    }
  }
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function entryFromScan(scan: McpSecurityScanResult): McpLedgerEntry {
  const critical = scan.findings.filter((f) => f.severity === "CRITICAL").length;
  const high = scan.findings.filter((f) => f.severity === "HIGH").length;
  return {
    path: scan.path,
    serverName: scan.serverInfo.name ?? null,
    securityLevel: scan.securityLevel,
    securityScore: scan.securityScore,
    riskLabel: scan.riskLabel,
    toolCount: scan.serverInfo.toolCount,
    criticalFindings: critical,
    highFindings: high,
    contentHash: sha256Hex(canonicalize({
      level: scan.securityLevel,
      score: scan.securityScore,
      findings: scan.findings.map((f) => ({ id: f.id ?? f.title, severity: f.severity })),
      tools: scan.serverInfo.toolCount
    }))
  };
}

/**
 * Build a signed-ready MCP trust receipt for one or more server definition
 * targets. `previous` (an earlier receipt's entries, keyed by path→contentHash)
 * lets the ledger report exactly which servers changed since the last check.
 */
export function buildMcpTrustReceipt(params: {
  targets: string[];
  generatedAt: number;
  previous?: Record<string, string> | null;
}): McpTrustReceipt {
  const files = collectDefinitionFiles(params.targets);
  const entries: McpLedgerEntry[] = [];
  for (const file of files) {
    try {
      entries.push(entryFromScan(analyzeMcpSecurity(file)));
    } catch {
      entries.push({
        path: file,
        serverName: null,
        securityLevel: "L0",
        securityScore: 0,
        riskLabel: "UNSCANNABLE",
        toolCount: 0,
        criticalFindings: 0,
        highFindings: 0,
        contentHash: sha256Hex(`unscannable:${file}`)
      });
    }
  }

  const lowestLevel = entries.length === 0
    ? "L0"
    : entries.reduce((lowest, e) => (levelIndex(e.securityLevel) < levelIndex(lowest) ? e.securityLevel : lowest), "L5");
  const anyCritical = entries.some((e) => e.criticalFindings > 0);
  const anyHigh = entries.some((e) => e.highFindings > 0);
  const aggregateRisk: McpTrustReceipt["aggregateRisk"] = anyCritical ? "BLOCK" : anyHigh ? "REVIEW" : "CLEAN";

  let changedSincePrevious: string[] | null = null;
  if (params.previous) {
    changedSincePrevious = entries
      .filter((e) => params.previous?.[e.path] !== e.contentHash)
      .map((e) => e.path)
      .sort((a, b) => a.localeCompare(b));
    for (const path of Object.keys(params.previous)) {
      if (!entries.some((e) => e.path === path)) {
        changedSincePrevious.push(`${path} (removed)`);
      }
    }
  }

  const body = {
    schemaVersion: "amc.mcp-trust-ledger.v1" as const,
    generatedAt: params.generatedAt,
    serverCount: entries.length,
    lowestLevel,
    cleanAsOf: aggregateRisk === "CLEAN",
    aggregateRisk,
    entries,
    changedSincePrevious
  };
  return { ...body, receiptHash: sha256Hex(canonicalize(body)) };
}

export function previousHashMap(receipt: McpTrustReceipt): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of receipt.entries) {
    map[entry.path] = entry.contentHash;
  }
  return map;
}

import { createHash } from "node:crypto";
import { binderPiiScanSchema } from "./binderSchema.js";

interface Rule {
  severity: "LOW" | "MEDIUM" | "HIGH";
  type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT";
  pattern: RegExp;
}

const RULES: Rule[] = [
  { severity: "HIGH", type: "PRIVATE_KEY", pattern: /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/g },
  { severity: "HIGH", type: "EMAIL", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { severity: "HIGH", type: "URL", pattern: /\bhttps?:\/\/[^\s"']+/gi },
  { severity: "HIGH", type: "FILE_PATH", pattern: /(?:^|[\s"'])\/(?:Users|home|var|tmp|etc)\/[^\s"']+/g },
  { severity: "HIGH", type: "FILE_PATH", pattern: /(?:^|[\s"'])[A-Za-z]:\\[^\s"']+/g },
  { severity: "HIGH", type: "TOKEN", pattern: /\b(?:sk-[A-Za-z0-9]{10,}|AIza[0-9A-Za-z\-_]{20,}|Bearer\s+[A-Za-z0-9._\-]{10,})\b/g },
  { severity: "HIGH", type: "TOKEN", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { severity: "MEDIUM", type: "TOKEN", pattern: /\b[A-Za-z0-9+/_-]{100,}={0,2}\b/g }
];

function redactSnippet(input: string): string {
  if (input.length <= 8) {
    return "<REDACTED>";
  }
  return `${input.slice(0, 3)}***${input.slice(-3)}`;
}

function isEnumPath(path: string, value: string): boolean {
  const enumPaths: Array<{ path: RegExp; values: Set<string> }> = [
    { path: /^scope\.type$/, values: new Set(["WORKSPACE", "NODE", "AGENT"]) },
    { path: /^trust\.trustLabel$/, values: new Set(["LOW", "MEDIUM", "HIGH"]) },
    { path: /^sections\.maturity\.status$/, values: new Set(["OK", "INSUFFICIENT_EVIDENCE"]) },
    { path: /^sections\..*\.status$/, values: new Set(["OK", "INSUFFICIENT_EVIDENCE"]) },
    { path: /^sections\.assurance\.lastCert\.status$/, values: new Set(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]) },
    { path: /^sections\.controls\.families\[\d+\]\.controls\[\d+\]\.status$/, values: new Set(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]) },
    { path: /^sections\.controls\.families\[\d+\]\.familyId$/, values: new Set([
      "ACCESS_CONTROL",
      "CHANGE_MANAGEMENT",
      "LOGGING_MONITORING",
      "SECURE_CONFIGURATION",
      "SUPPLY_CHAIN_INTEGRITY",
      "INCIDENT_RESPONSE_PREPAREDNESS",
      "RISK_ASSURANCE_AND_TESTING",
      "DATA_PROTECTION_AND_PRIVACY",
      "MODEL_TOOL_GOVERNANCE"
    ]) }
  ];
  for (const entry of enumPaths) {
    if (entry.path.test(path) && entry.values.has(value)) {
      return true;
    }
  }
  return false;
}

function looksLikeHash(value: string): boolean {
  return /^[a-f0-9]{8,128}$/i.test(value) || /^ab_[a-f0-9-]{8,}$/i.test(value) || /^req_[a-f0-9]{8,}$/i.test(value);
}

function pathAllowsLongText(path: string): boolean {
  return /^sections\..*\.(notes|reasons)\[\d+\]$/.test(path) || /^sections\.controls\.families\[\d+\]\.title$/.test(path) || /^sections\.controls\.families\[\d+\]\.controls\[\d+\]\.controlId$/.test(path);
}

function walk(path: string, value: unknown, findings: Array<{ severity: "HIGH" | "MEDIUM" | "LOW"; type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT"; path: string; snippetRedacted: string }>): void {
  if (typeof value === "string") {
    if (!(isEnumPath(path, value) || looksLikeHash(value))) {
      for (const rule of RULES) {
        for (const match of value.matchAll(rule.pattern)) {
          findings.push({
            severity: rule.severity,
            type: rule.type,
            path,
            snippetRedacted: redactSnippet(match[0] ?? value)
          });
        }
      }
      if (!pathAllowsLongText(path) && /\s/.test(value) && value.length > 40) {
        findings.push({
          severity: "HIGH",
          type: "FREE_TEXT",
          path,
          snippetRedacted: redactSnippet(value)
        });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(`${path}[${index}]`, item, findings));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      walk(path ? `${path}.${key}` : key, item, findings);
    }
  }
}

/** Scans binder.json, or an allowlisted projection the binder carries beside it (binderConformanceRun.ts). */
export function scanBinderForPii(binder: object): {
  v: 1;
  status: "PASS" | "FAIL";
  findings: Array<{ severity: "HIGH" | "MEDIUM" | "LOW"; type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT"; path: string; snippetRedacted: string }>;
} {
  const findings: Array<{ severity: "HIGH" | "MEDIUM" | "LOW"; type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT"; path: string; snippetRedacted: string }> = [];
  walk("", binder, findings);
  const high = findings.some((row) => row.severity === "HIGH");
  return binderPiiScanSchema.parse({
    v: 1,
    status: high ? "FAIL" : "PASS",
    findings
  });
}

export function hashAuditId(input: string, truncBytes = 8): string {
  const digest = createHash("sha256").update(input).digest("hex");
  const take = Math.max(4, Math.min(32, truncBytes)) * 2;
  return digest.slice(0, take);
}

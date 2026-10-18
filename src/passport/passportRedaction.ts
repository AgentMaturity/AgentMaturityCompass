import { createHash } from "node:crypto";
import { passportPiiScanSchema, type PassportJson } from "./passportSchema.js";

interface Rule {
  severity: "HIGH" | "MEDIUM" | "LOW";
  type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT";
  pattern: RegExp;
}

const RULES: Rule[] = [
  { severity: "HIGH", type: "PRIVATE_KEY", pattern: /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/g },
  { severity: "HIGH", type: "EMAIL", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { severity: "HIGH", type: "URL", pattern: /\bhttps?:\/\/[^\s"'`]+/gi },
  { severity: "HIGH", type: "FILE_PATH", pattern: /(?:^|[\s"'`])\/(?:Users|home|var|tmp|etc)\/[^\s"'`]+/g },
  { severity: "HIGH", type: "FILE_PATH", pattern: /(?:^|[\s"'`])[A-Za-z]:\\[^\s"'`]+/g },
  { severity: "HIGH", type: "TOKEN", pattern: /\b(?:sk-[A-Za-z0-9]{10,}|AIza[0-9A-Za-z\-_]{20,}|Bearer\s+[A-Za-z0-9._\-]{10,})\b/g },
  { severity: "HIGH", type: "TOKEN", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { severity: "MEDIUM", type: "TOKEN", pattern: /\b[A-Za-z0-9+/_-]{100,}={0,2}\b/g }
];

function redactSnippet(value: string): string {
  if (value.length <= 8) {
    return "<REDACTED>";
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function isEnumPath(path: string, value: string): boolean {
  const map: Array<{ path: RegExp; values: Set<string> }> = [
    { path: /^scope\.type$/, values: new Set(["WORKSPACE", "NODE", "AGENT"]) },
    { path: /^trust\.trustLabel$/, values: new Set(["LOW", "MEDIUM", "HIGH"]) },
    { path: /^status\.label$/, values: new Set(["VERIFIED", "INFORMATIONAL", "UNTRUSTED"]) },
    { path: /^maturity\.status$/, values: new Set(["OK", "INSUFFICIENT_EVIDENCE"]) },
    { path: /^checkpoints\.lastAssuranceCert\.status$/, values: new Set(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]) },
    { path: /^governanceSummary\.promptEnforcement$/, values: new Set(["ON", "OFF", "UNKNOWN"]) },
    { path: /^governanceSummary\.truthguard$/, values: new Set(["ENFORCE", "WARN", "OFF", "UNKNOWN"]) },
    { path: /^governanceSummary\..*$/, values: new Set(["PASS", "FAIL", "UNKNOWN"]) },
    { path: /^bindings\.trustMode$/, values: new Set(["LOCAL_VAULT", "NOTARY"]) }
  ];
  for (const row of map) {
    if (row.path.test(path) && row.values.has(value)) {
      return true;
    }
  }
  return false;
}

function looksLikeHash(value: string): boolean {
  return (
    /^[a-f0-9]{8,128}$/i.test(value) ||
    /^q_[a-f0-9]{8,128}$/i.test(value) ||
    /^pass_[A-Za-z0-9_-]{8,}$/.test(value) ||
    /^run_[A-Za-z0-9_-]{6,}$/.test(value)
  );
}

function allowsLongText(path: string): boolean {
  // AMC's own sentences: status reasons, and the explainability rows' repair hints and evidence-rejection reasons
  // (every other rule, emails, URLs, paths, tokens and keys, still applies to them).
  return /^status\.reasons\[\d+\]$/.test(path)
    || /^maturity\.questionExplainabilitySummary\.rows\[\d+\]\.(repairHint|rejectedEvidenceReasons\[\d+\]\.reason)$/.test(path);
}

function walk(
  path: string,
  value: unknown,
  findings: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT";
    path: string;
    snippetRedacted: string;
  }>
): void {
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
      if (!allowsLongText(path) && /\s/.test(value) && value.length > 40) {
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
    value.forEach((row, index) => walk(`${path}[${index}]`, row, findings));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
      walk(path ? `${path}.${key}` : key, row, findings);
    }
  }
}

export function scanPassportForPii(passport: PassportJson): {
  v: 1;
  status: "PASS" | "FAIL";
  findings: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT";
    path: string;
    snippetRedacted: string;
  }>;
} {
  const findings: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    type: "EMAIL" | "URL" | "FILE_PATH" | "TOKEN" | "PRIVATE_KEY" | "FREE_TEXT";
    path: string;
    snippetRedacted: string;
  }> = [];
  walk("", passport, findings);
  const high = findings.some((row) => row.severity === "HIGH");
  return passportPiiScanSchema.parse({
    v: 1,
    status: high ? "FAIL" : "PASS",
    findings
  });
}

export function hashPassportId(input: string, truncBytes = 8): string {
  const digest = createHash("sha256").update(input).digest("hex");
  const take = Math.max(4, Math.min(32, truncBytes)) * 2;
  return digest.slice(0, take);
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_RE = /https?:\/\/[\w.-]+(?:\/[\w\-./?%&=+#]*)?/i;
const ABS_PATH_RE = /(?:\/[A-Za-z0-9_.-]+){2,}|[A-Za-z]:\\(?:[^<>:"/\\|?*\n\r]+\\)+[^<>:"/\\|?*\n\r]*/;
const TOKEN_RE = /\b(?:Bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z\-_]{16,}|lease_[A-Za-z0-9_-]{8,})\b/;
const KEY_RE = /BEGIN\s+PRIVATE\s+KEY/i;
const LONG_BASE64_RE = /\b[A-Za-z0-9+/]{40,}={0,2}\b/;

function scanString(path: string, text: string, findings: string[]): void {
  if (EMAIL_RE.test(text)) {
    findings.push(`${path}:EMAIL`);
  }
  if (URL_RE.test(text)) {
    findings.push(`${path}:URL`);
  }
  if (ABS_PATH_RE.test(text)) {
    findings.push(`${path}:FILE_PATH`);
  }
  if (TOKEN_RE.test(text)) {
    findings.push(`${path}:TOKEN`);
  }
  if (KEY_RE.test(text)) {
    findings.push(`${path}:PRIVATE_KEY`);
  }
  if (LONG_BASE64_RE.test(text)) {
    findings.push(`${path}:BASE64_TOKEN`);
  }
}

function walk(path: string, value: unknown, findings: string[]): void {
  if (typeof value === "string") {
    scanString(path, value, findings);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walk(`${path}[${index}]`, value[index], findings);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walk(path ? `${path}.${key}` : key, child, findings);
    }
  }
}

export function scanValuePayload(payload: unknown): {
  ok: boolean;
  findings: string[];
} {
  const findings: string[] = [];
  walk("", payload, findings);
  return {
    ok: findings.length === 0,
    findings
  };
}

export function assertNoSuspiciousStrings(payload: unknown, context: string): void {
  const scanned = scanValuePayload(payload);
  if (!scanned.ok) {
    throw new Error(`${context} contains forbidden free text (${scanned.findings.join(", ")})`);
  }
}

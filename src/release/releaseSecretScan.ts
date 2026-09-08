import {
  closeSync, constants, fstatSync, lstatSync, openSync, opendirSync,
  readdirSync, readSync
} from "node:fs";
import { basename, join, relative as nodeRelative, resolve } from "node:path";
import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { mkTmp, runTarExtract, cleanupDir } from "./releaseUtils.js";

export const secretScanSchema = z.object({
  v: z.literal(1),
  status: z.enum(["PASS", "FAIL"]),
  findings: z.array(
    z.object({
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      type: z.string().min(1),
      path: z.string().min(1),
      pattern: z.string().min(1),
      snippetRedacted: z.string().min(1)
    })
  )
});

export type SecretScanReport = z.infer<typeof secretScanSchema>;

/** One bounded scan includes the outer archive and its extracted npm members. */
export const SECRET_SCAN_LIMITS = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntries: 10_000,
  maxFindings: 500
});

export type SecretScanIncompleteCode =
  | "INPUT_MISSING" | "UNSUPPORTED_INPUT" | "READ_FAILED" | "INPUT_CHANGED"
  | "FILE_TOO_LARGE" | "TOTAL_BYTES_EXCEEDED" | "ENTRY_LIMIT_EXCEEDED" | "FINDING_LIMIT_EXCEEDED";

/** A failure to inspect bytes is never an empty successful report. No content
 * or underlying filesystem error message is included in this public error. */
export class SecretScanIncompleteError extends Error {
  constructor(readonly code: SecretScanIncompleteCode, readonly path: string) {
    super(`Release secret scan incomplete (${code}): ${JSON.stringify(path)}`);
    this.name = "SecretScanIncompleteError";
  }
}

interface ScanBudget { bytes: number; entries: number; findings: number; }
interface PlannedFile { fullPath: string; path: string; bytes: number; dev: number; ino: number; }

function scanIO<T>(path: string, read: () => T, missing: SecretScanIncompleteCode = "READ_FAILED"): T {
  try { return read(); }
  catch (error) {
    if (error instanceof SecretScanIncompleteError) throw error;
    const code = (error as NodeJS.ErrnoException)?.code;
    throw new SecretScanIncompleteError(code === "ENOENT" ? missing : code === "ELOOP" ? "UNSUPPORTED_INPUT" : "READ_FAILED", path);
  }
}

interface Rule {
  severity: "LOW" | "MEDIUM" | "HIGH";
  type: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    severity: "HIGH",
    type: "PRIVATE_KEY",
    pattern: /BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY/g
  },
  {
    severity: "HIGH",
    type: "OPENAI_STYLE_KEY",
    pattern: /\bsk-[A-Za-z0-9]{10,}\b/g
  },
  {
    severity: "HIGH",
    type: "GOOGLE_API_KEY",
    pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/g
  },
  {
    severity: "HIGH",
    type: "XAI_STYLE_KEY",
    pattern: /\bxai-[A-Za-z0-9\-_]{10,}\b/g
  },
  {
    severity: "HIGH",
    type: "JWT_TOKEN",
    pattern: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g
  },
  {
    severity: "MEDIUM",
    type: "ANTHROPIC_TOKEN_HINT",
    pattern: /\b(?:anthropic|claude)[-_]?(?:api)?[_-]?key\b/gi
  }
];

const SECRET_FILENAMES = [/\.env/i, /\.pem$/i, /\.key$/i, /\.p12$/i];

function redactSnippet(value: string): string {
  if (value.length <= 8) {
    return "<REDACTED>";
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function collectFiles(rootDir: string, budget: ScanBudget): PlannedFile[] {
  // Remove trailing separators before lstat: POSIX otherwise follows a final
  // symlink spelled as "link/", despite the no-follow metadata call.
  const rootPath = resolve(rootDir);
  const root = scanIO(".", () => lstatSync(rootPath), "INPUT_MISSING");
  if (!root.isDirectory()) throw new SecretScanIncompleteError("UNSUPPORTED_INPUT", ".");
  const out: PlannedFile[] = [];
  const pending = [rootPath];
  let plannedBytes = 0;
  while (pending.length > 0) {
    const dir = pending.pop()!;
    const dirPath = nodeRelative(rootPath, dir).replace(/\\/g, "/") || ".";
    const directory = scanIO(dirPath, () => lstatSync(dir), "INPUT_CHANGED");
    if (!directory.isDirectory()) throw new SecretScanIncompleteError("UNSUPPORTED_INPUT", dirPath);
    const handle = scanIO(dirPath, () => opendirSync(dir));
    try {
      for (let entry = scanIO(dirPath, () => handle.readSync()); entry !== null; entry = scanIO(dirPath, () => handle.readSync())) {
        const fullPath = join(dir, entry.name);
        const path = nodeRelative(rootPath, fullPath).replace(/\\/g, "/");
        if (++budget.entries > SECRET_SCAN_LIMITS.maxEntries) throw new SecretScanIncompleteError("ENTRY_LIMIT_EXCEEDED", path);
        const stat = scanIO(path, () => lstatSync(fullPath), "INPUT_CHANGED");
        if (stat.isDirectory()) { pending.push(fullPath); continue; }
        if (!stat.isFile()) throw new SecretScanIncompleteError("UNSUPPORTED_INPUT", path);
        if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > SECRET_SCAN_LIMITS.maxFileBytes) {
          throw new SecretScanIncompleteError("FILE_TOO_LARGE", path);
        }
        plannedBytes += stat.size;
        if (plannedBytes > SECRET_SCAN_LIMITS.maxTotalBytes - budget.bytes) throw new SecretScanIncompleteError("TOTAL_BYTES_EXCEEDED", path);
        out.push({ fullPath, path, bytes: stat.size, dev: stat.dev, ino: stat.ino });
      }
    } finally { scanIO(dirPath, () => handle.closeSync()); }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function readBoundedFile(file: PlannedFile, budget: ScanBudget): string {
  return scanIO(file.path, () => {
    const fd = openSync(file.fullPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size !== file.bytes || before.dev !== file.dev || before.ino !== file.ino) {
        throw new SecretScanIncompleteError("INPUT_CHANGED", file.path);
      }
      // One extra byte distinguishes EOF from growth after stat; allocation and
      // reads remain bounded even if the source is concurrently enlarged.
      const buffer = Buffer.alloc(file.bytes + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const count = readSync(fd, buffer, bytes, buffer.length - bytes, null);
        if (count === 0) break;
        bytes += count;
      }
      const after = fstatSync(fd);
      if (bytes !== file.bytes || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
        throw new SecretScanIncompleteError("INPUT_CHANGED", file.path);
      }
      budget.bytes += bytes;
      return buffer.subarray(0, bytes).toString("utf8");
    } finally { closeSync(fd); }
  });
}

function retainFinding(budget: ScanBudget, findings: SecretScanReport["findings"], finding: SecretScanReport["findings"][number]): void {
  if (++budget.findings > SECRET_SCAN_LIMITS.maxFindings) throw new SecretScanIncompleteError("FINDING_LIMIT_EXCEEDED", finding.path);
  findings.push(finding);
}

function scanFile(file: PlannedFile, budget: ScanBudget, findings: SecretScanReport["findings"]): void {
  const fileName = basename(file.fullPath);
  for (const re of SECRET_FILENAMES) {
    if (re.test(fileName)) {
      retainFinding(budget, findings, {
        severity: "HIGH",
        type: "SECRET_FILENAME",
        path: file.path,
        pattern: re.source,
        snippetRedacted: "<filename redacted>"
      });
      break;
    }
  }
  const content = readBoundedFile(file, budget);
  for (const rule of RULES) {
    for (const match of content.matchAll(rule.pattern)) {
      const value = match[0] ?? "";
      retainFinding(budget, findings, {
        severity: rule.severity,
        type: rule.type,
        path: file.path,
        pattern: rule.pattern.source,
        snippetRedacted: redactSnippet(value)
      });
    }
  }
}

export function scanDirectoryForSecrets(rootDir: string): SecretScanReport {
  return scanDirectoryWithBudget(rootDir, { bytes: 0, entries: 0, findings: 0 });
}

function scanDirectoryWithBudget(rootDir: string, budget: ScanBudget): SecretScanReport {
  const findings: SecretScanReport["findings"] = [];
  for (const file of collectFiles(rootDir, budget)) {
    scanFile(file, budget, findings);
  }
  const hasHigh = findings.some((row) => row.severity === "HIGH");
  return secretScanSchema.parse({
    v: 1,
    status: hasHigh ? "FAIL" : "PASS",
    findings
  });
}

/** Scan the same extracted release root the caller verified. Nested npm
 * archives share the outer directory's limits; incomplete inputs throw. */
export function scanExtractedReleaseForSecrets(rootDir: string): SecretScanReport {
  const budget: ScanBudget = { bytes: 0, entries: 0, findings: 0 };
  const base = scanDirectoryWithBudget(rootDir, budget);
  const npmDir = join(rootDir, "artifacts", "npm");
  if (!pathExists(npmDir)) return base;
  const tgzFiles = scanIO("artifacts/npm", () => readdirSync(npmDir))
    .filter((name) => name.endsWith(".tgz"))
    .sort((a, b) => a.localeCompare(b));
  const merged = [...base.findings];
  for (const file of tgzFiles) {
    const extractDir = mkTmp("amc-release-scan-tgz-");
    try {
      runTarExtract(join(npmDir, file), extractDir);
      const tgzScan = scanDirectoryWithBudget(extractDir, budget);
      merged.push(...tgzScan.findings);
    } finally {
      cleanupDir(extractDir);
    }
  }
  return secretScanSchema.parse({
    v: 1,
    status: merged.some((row) => row.severity === "HIGH") ? "FAIL" : "PASS",
    findings: merged
  });
}

export function scanReleaseArchive(archivePath: string): SecretScanReport {
  const tmp = mkTmp("amc-release-scan-");
  try {
    runTarExtract(archivePath, tmp);
    const releaseRoot = join(tmp, "amc-release");
    return scanExtractedReleaseForSecrets(pathExists(releaseRoot) ? releaseRoot : tmp);
  } finally {
    cleanupDir(tmp);
  }
}

export function writeSecretScanReport(report: SecretScanReport, outPath: string): void {
  writeFileAtomic(outPath, `${canonicalize(report)}\n`, 0o644);
}

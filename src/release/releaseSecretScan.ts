import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative as nodeRelative } from "node:path";
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

function collectFiles(rootDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  walk(rootDir);
  return out.sort((a, b) => a.localeCompare(b));
}

function scanFile(fullPath: string, rootDir: string, findings: SecretScanReport["findings"]): void {
  // `join()` normalises the root while walking ("./qa" becomes "qa"), so
  // slicing rootDir.length + 1 off the full path ate real characters whenever
  // the caller passed a "./" prefix or a trailing slash: a secret in ".env"
  // was reported as living in "nv". A security finding that names a file which
  // does not exist cannot be acted on. `relative()` normalises both sides.
  const relative = nodeRelative(rootDir, fullPath).replace(/\\/g, "/");
  const fileName = basename(fullPath);
  for (const re of SECRET_FILENAMES) {
    if (re.test(fileName)) {
      findings.push({
        severity: "HIGH",
        type: "SECRET_FILENAME",
        path: relative,
        pattern: re.source,
        snippetRedacted: "<filename redacted>"
      });
      break;
    }
  }
  const size = statSync(fullPath).size;
  if (size > 1_000_000) {
    return;
  }
  const content = readFileSync(fullPath).toString("utf8");
  for (const rule of RULES) {
    for (const match of content.matchAll(rule.pattern)) {
      const value = match[0] ?? "";
      findings.push({
        severity: rule.severity,
        type: rule.type,
        path: relative,
        pattern: rule.pattern.source,
        snippetRedacted: redactSnippet(value)
      });
      if (findings.length > 500) {
        return;
      }
    }
  }
}

export function scanDirectoryForSecrets(rootDir: string): SecretScanReport {
  const findings: SecretScanReport["findings"] = [];
  if (!pathExists(rootDir)) {
    return {
      v: 1,
      status: "PASS",
      findings
    };
  }
  for (const full of collectFiles(rootDir)) {
    scanFile(full, rootDir, findings);
  }
  const hasHigh = findings.some((row) => row.severity === "HIGH");
  return secretScanSchema.parse({
    v: 1,
    status: hasHigh ? "FAIL" : "PASS",
    findings
  });
}

export function scanReleaseArchive(archivePath: string): SecretScanReport {
  const tmp = mkTmp("amc-release-scan-");
  try {
    runTarExtract(archivePath, tmp);
    const releaseRoot = join(tmp, "amc-release");
    const root = pathExists(releaseRoot) ? releaseRoot : tmp;
    const base = scanDirectoryForSecrets(root);
    const npmDir = join(root, "artifacts", "npm");
    if (!pathExists(npmDir)) {
      return base;
    }
    const tgzFiles = readdirSync(npmDir)
      .filter((name) => name.endsWith(".tgz"))
      .sort((a, b) => a.localeCompare(b));
    if (tgzFiles.length === 0) {
      return base;
    }
    const merged = [...base.findings];
    for (const file of tgzFiles) {
      const extractDir = mkTmp("amc-release-scan-tgz-");
      try {
        runTarExtract(join(npmDir, file), extractDir);
        const tgzScan = scanDirectoryForSecrets(extractDir);
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
  } finally {
    cleanupDir(tmp);
  }
}

export function writeSecretScanReport(report: SecretScanReport, outPath: string): void {
  writeFileAtomic(outPath, `${canonicalize(report)}\n`, 0o644);
}

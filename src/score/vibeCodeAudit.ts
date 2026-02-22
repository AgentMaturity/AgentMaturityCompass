/**
 * Vibe Code Audit — targeted static safety checks for AI-generated code artifacts.
 */

export interface VibeCodeFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  description: string;
  line?: number;
  recommendation: string;
}

export interface VibeCodeAuditResult {
  safe: boolean;
  score: number; // 0-100, higher = safer
  grade: "A" | "B" | "C" | "D" | "F";
  findings: VibeCodeFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  summary: string;
  deploymentReady: boolean;
  quickFixes: string[];
}

type Severity = VibeCodeFinding["severity"];

interface PatternRule {
  severity: Severity;
  category: string;
  description: string;
  recommendation: string;
  pattern: RegExp;
}

interface CommentLine {
  line: number;
  text: string;
}

const PLACEHOLDER_VALUES = new Set([
  "changeme",
  "change_me",
  "your-key-here",
  "your_key_here",
  "insert-key-here",
  "example",
  "example_key",
  "test",
  "token",
  "secret",
  "password",
  "api_key",
  "apikey",
  "xxx"
]);

const STATIC_MISTAKE_RULES: PatternRule[] = [
  {
    severity: "critical",
    category: "Code Injection",
    description: "Dynamic code execution on user-influenced input.",
    recommendation: "Remove eval/exec for untrusted input and use a strict parser or allowlist.",
    pattern: /(?:eval|Function|exec)\s*\([^)]*(?:req\.|request\.|query|params|body|input|argv|user)/i
  },
  {
    severity: "high",
    category: "Command Injection",
    description: "Shell command execution appears to include user-controlled input.",
    recommendation: "Use parameterized APIs and strict input validation. Avoid shell interpolation.",
    pattern: /(?:exec|execSync|spawn|spawnSync|subprocess\.(?:run|Popen))\s*\([^)]*(?:req\.|request\.|query|params|body|input|argv|user|\$\{)/i
  },
  {
    severity: "high",
    category: "TLS Verification Disabled",
    description: "Network call disables TLS certificate verification.",
    recommendation: "Enable TLS verification and pin/validate certificates in production paths.",
    pattern: /(?:verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0["']?)/i
  },
  {
    severity: "high",
    category: "Unsafe Deserialization",
    description: "Potential unsafe deserialization from untrusted input.",
    recommendation: "Avoid unsafe deserialization (pickle/yaml.load) on untrusted data.",
    pattern: /(?:pickle\.loads|yaml\.load)\s*\([^)]*(?:request|req|body|input|data)/i
  },
  {
    severity: "medium",
    category: "Broad Exception Swallow",
    description: "Broad catch/except that likely hides security failures.",
    recommendation: "Catch specific exception types and log/handle failures explicitly.",
    pattern: /(?:except\s+Exception\s*:\s*(?:pass|return\s+None|continue)|catch\s*\(\s*(?:_|err|error)\s*\)\s*\{\s*\})/i
  },
  {
    severity: "medium",
    category: "Insecure Randomness",
    description: "Non-cryptographic random source used around token/secret generation.",
    recommendation: "Use cryptographically secure RNG (`crypto.randomBytes`, `secrets.token_*`).",
    pattern: /(?:Math\.random\(|random\.(?:random|randint)\().*(?:token|secret|password|otp|code)/i
  },
  {
    severity: "medium",
    category: "Debug Mode Enabled",
    description: "Debug mode appears enabled in application runtime.",
    recommendation: "Disable debug mode outside local development.",
    pattern: /(?:debug\s*=\s*True|app\.run\([^)]*debug\s*=\s*True|NODE_ENV\s*!==?\s*["']production["'])/i
  },
  {
    severity: "low",
    category: "Security TODO Left In Code",
    description: "Security-sensitive TODO/FIXME marker found in generated code.",
    recommendation: "Resolve security TODOs before deployment and gate with tests.",
    pattern: /(?:TODO|FIXME).*(?:auth|security|sanitize|validate|secret|token|injection)/i
  }
];

const DEPENDENCY_INJECTION_RULES: PatternRule[] = [
  {
    severity: "high",
    category: "Dependency Injection Risk",
    description: "Dynamic dependency/module import appears user-influenced.",
    recommendation: "Use a fixed allowlist of dependencies/modules and reject dynamic untrusted imports.",
    pattern: /(?:require|import)\s*\(\s*(?:req|request|query|params|body|input|user|argv|process\.env)/i
  },
  {
    severity: "high",
    category: "Dependency Injection Risk",
    description: "Python dynamic import appears user-influenced.",
    recommendation: "Avoid dynamic imports from runtime input. Map allowed module names explicitly.",
    pattern: /(?:importlib\.import_module|__import__)\s*\(\s*(?:request|req|query|params|body|input|user|os\.getenv)/i
  },
  {
    severity: "high",
    category: "Dependency Injection Risk",
    description: "Service/container resolution appears based on untrusted request input.",
    recommendation: "Resolve dependencies by static keys only and validate against an allowlist.",
    pattern: /(?:container\.resolve|getService|injector\.get)\s*\(\s*(?:req|request|query|params|body|input|user)/i
  }
];

const SECRET_RULES: PatternRule[] = [
  {
    severity: "critical",
    category: "Private Key Material",
    description: "Private key material appears embedded in source code.",
    recommendation: "Delete embedded private keys and rotate compromised credentials immediately.",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    severity: "critical",
    category: "AWS Access Key",
    description: "AWS access key detected in source code.",
    recommendation: "Move AWS credentials to secret manager and rotate exposed keys.",
    pattern: /AKIA[0-9A-Z]{16}/g
  },
  {
    severity: "critical",
    category: "OpenAI Key Exposure",
    description: "OpenAI API key token detected in source code.",
    recommendation: "Remove leaked key from code, rotate it, and load from environment or vault.",
    pattern: /sk-[A-Za-z0-9]{20,}/g
  },
  {
    severity: "high",
    category: "GitHub Token Exposure",
    description: "GitHub token detected in source code.",
    recommendation: "Remove token from source control and rotate token immediately.",
    pattern: /gh[opsu]_[A-Za-z0-9]{30,}/g
  },
  {
    severity: "high",
    category: "Slack Token Exposure",
    description: "Slack token or webhook appears embedded in source code.",
    recommendation: "Move Slack credentials to secure storage and rotate all leaked tokens.",
    pattern: /(?:xox[baprs]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+)/g
  },
  {
    severity: "high",
    category: "Hardcoded Credential",
    description: "Likely credential literal assigned directly in code.",
    recommendation: "Use a secret manager or environment variables for credentials.",
    pattern: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'][^"'\n]{8,}["']/gi
  }
];

const COMMENT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?previous\s+(?:instructions|prompts?)/i,
  /disregard\s+(?:all\s+)?(?:prior|above|previous)\s+(?:instructions|prompts?)/i,
  /you\s+are\s+now\s+/i,
  /bypass\s+(?:safety|guardrails?|policy|filters?)/i,
  /override\s+(?:security|policy|safety)/i,
  /jailbreak|dan\s+mode|developer\s+mode/i
];

const SCORE_PENALTY: Record<Severity, number> = {
  critical: 28,
  high: 14,
  medium: 6,
  low: 2
};

function countLineNumber(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function firstLineMatch(line: string, pattern: RegExp): boolean {
  const nonGlobalFlags = pattern.flags.replaceAll("g", "");
  return new RegExp(pattern.source, nonGlobalFlags).test(line);
}

function normalizeSecretLiteral(raw: string): string {
  const quoted = raw.match(/["']([^"']+)["']/);
  return (quoted?.[1] ?? raw).trim().toLowerCase();
}

function shouldSkipHardcodedCredential(match: string): boolean {
  const normalized = normalizeSecretLiteral(match);
  for (const placeholder of PLACEHOLDER_VALUES) {
    if (normalized.includes(placeholder)) {
      return true;
    }
  }
  return false;
}

function scanLineRules(code: string, rules: PatternRule[]): VibeCodeFinding[] {
  const findings: VibeCodeFinding[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const rule of rules) {
      if (!firstLineMatch(line, rule.pattern)) {
        continue;
      }
      findings.push({
        severity: rule.severity,
        category: rule.category,
        description: rule.description,
        line: i + 1,
        recommendation: rule.recommendation
      });
    }
  }
  return findings;
}

function scanSecrets(code: string): VibeCodeFinding[] {
  const findings: VibeCodeFinding[] = [];
  for (const rule of SECRET_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code)) !== null) {
      const raw = match[0] ?? "";
      if (rule.category === "Hardcoded Credential" && shouldSkipHardcodedCredential(raw)) {
        continue;
      }
      findings.push({
        severity: rule.severity,
        category: rule.category,
        description: rule.description,
        line: countLineNumber(code, match.index),
        recommendation: rule.recommendation
      });
      if (rule.category === "Hardcoded Credential") {
        break;
      }
    }
  }
  return findings;
}

function extractCommentLines(code: string): CommentLine[] {
  const commentLines: CommentLine[] = [];
  const lines = code.split("\n");
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (inBlockComment) {
      commentLines.push({ line: lineNumber, text: trimmed });
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("/*")) {
      inBlockComment = !trimmed.includes("*/");
      commentLines.push({ line: lineNumber, text: trimmed });
      continue;
    }

    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("--")) {
      commentLines.push({ line: lineNumber, text: trimmed });
      continue;
    }

    const inlineJs = line.indexOf("//");
    if (inlineJs >= 0) {
      commentLines.push({ line: lineNumber, text: line.slice(inlineJs) });
      continue;
    }
    const inlinePy = line.indexOf("#");
    if (inlinePy >= 0 && !line.slice(0, inlinePy).includes("http")) {
      commentLines.push({ line: lineNumber, text: line.slice(inlinePy) });
    }
  }

  return commentLines;
}

function scanPromptInjectionInComments(code: string): VibeCodeFinding[] {
  const findings: VibeCodeFinding[] = [];
  const comments = extractCommentLines(code);
  for (const comment of comments) {
    for (const pattern of COMMENT_INJECTION_PATTERNS) {
      if (!firstLineMatch(comment.text, pattern)) {
        continue;
      }
      findings.push({
        severity: "high",
        category: "Prompt Injection in Comments",
        description: "Comment appears to embed prompt-injection style instruction.",
        line: comment.line,
        recommendation: "Remove instruction-like comments that can influence model behavior in tooling pipelines."
      });
      break;
    }
  }
  return findings;
}

function dedupeFindings(findings: VibeCodeFinding[]): VibeCodeFinding[] {
  const unique = new Map<string, VibeCodeFinding>();
  for (const finding of findings) {
    const key = `${finding.severity}|${finding.category}|${finding.line ?? 0}|${finding.description}`;
    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  }
  return [...unique.values()];
}

function computeScore(findings: VibeCodeFinding[]): number {
  const penalty = findings.reduce((sum, finding) => sum + SCORE_PENALTY[finding.severity], 0);
  return Math.max(0, 100 - penalty);
}

function scoreToGrade(score: number): VibeCodeAuditResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 78) return "B";
  if (score >= 62) return "C";
  if (score >= 45) return "D";
  return "F";
}

function summarize(result: {
  score: number;
  grade: VibeCodeAuditResult["grade"];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  deploymentReady: boolean;
}): string {
  if (result.deploymentReady) {
    return `Vibe audit passed (grade ${result.grade}, score ${result.score}).`;
  }
  return `Vibe audit blocked: ${result.criticalCount} critical, ${result.highCount} high, ${result.mediumCount} medium, ${result.lowCount} low findings.`;
}

function computeResultFromFindings(findings: VibeCodeFinding[]): VibeCodeAuditResult {
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = findings.filter((finding) => finding.severity === "low").length;
  const score = computeScore(findings);
  const grade = scoreToGrade(score);
  const safe = criticalCount === 0 && highCount === 0;
  const deploymentReady = criticalCount === 0 && highCount <= 1 && score >= 75;
  const quickFixes = findings
    .filter((finding) => finding.severity === "critical" || finding.severity === "high")
    .slice(0, 8)
    .map((finding) => `[${finding.category}] ${finding.recommendation}`);

  return {
    safe,
    score,
    grade,
    findings,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    summary: summarize({ score, grade, criticalCount, highCount, mediumCount, lowCount, deploymentReady }),
    deploymentReady,
    quickFixes
  };
}

export function auditVibeCode(code: string, filename?: string): VibeCodeAuditResult {
  void filename;
  const findings = dedupeFindings([
    ...scanLineRules(code, STATIC_MISTAKE_RULES),
    ...scanLineRules(code, DEPENDENCY_INJECTION_RULES),
    ...scanSecrets(code),
    ...scanPromptInjectionInComments(code)
  ]);
  return computeResultFromFindings(findings);
}

export function auditVibeCodeFiles(files: Record<string, string>): {
  overall: VibeCodeAuditResult;
  byFile: Record<string, VibeCodeAuditResult>;
} {
  const byFile: Record<string, VibeCodeAuditResult> = {};
  const allFindings: VibeCodeFinding[] = [];
  for (const [filename, code] of Object.entries(files)) {
    const result = auditVibeCode(code, filename);
    byFile[filename] = result;
    allFindings.push(...result.findings.map((finding) => ({ ...finding, category: `${filename}: ${finding.category}` })));
  }
  return {
    overall: computeResultFromFindings(allFindings),
    byFile
  };
}

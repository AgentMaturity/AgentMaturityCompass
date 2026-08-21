import type { AmcPatternRule, QuickFixSuggestion } from "./types.js";

export const AMC_PATTERN_RULES: AmcPatternRule[] = [
  {
    id: "hardcoded-secret",
    questionId: "AMC-3.2.3",
    title: "Hardcoded secret detected",
    message: "Hardcoded keys reduce compliance and evidence trust.",
    severity: "critical",
    scoreImpact: -2,
    regex: /(sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*["'][^"']+["'])/i,
    quickFixId: "move-secret-to-env"
  },
  {
    id: "shell-exec-without-guard",
    questionId: "AMC-4.1",
    title: "Command execution without policy guard",
    message: "Tool execution paths should be wrapped with approval and policy checks.",
    severity: "warn",
    scoreImpact: -1,
    regex: /\b(exec|spawn|subprocess\.run|os\.system)\s*\(/,
    quickFixId: "wrap-tool-call-with-policy"
  },
  {
    id: "json-parse-without-validation",
    questionId: "AMC-5.1",
    title: "JSON parsing without schema validation",
    message: "Schema validation improves reliability and reduces silent failure rates.",
    severity: "warn",
    scoreImpact: -1,
    regex: /\bJSON\.parse\s*\(/,
    quickFixId: "add-schema-validation"
  },
  {
    id: "fetch-without-timeout",
    questionId: "AMC-4.5",
    title: "Network call without timeout",
    message: "Timeouts and retries are required for resilient runtime behavior.",
    severity: "warn",
    scoreImpact: -1,
    regex: /\bfetch\s*\(/,
    quickFixId: "add-timeout-to-fetch"
  }
];

export const QUICK_FIX_LIBRARY: Record<string, QuickFixSuggestion> = {
  "move-secret-to-env": {
    id: "move-secret-to-env",
    questionId: "AMC-3.2.3",
    title: "Move secret to environment variable",
    description: "Replace hardcoded secrets with env-based lookup and redact in logs.",
    replacementExample: "const apiKey = process.env.OPENAI_API_KEY ?? \"\";"
  },
  "wrap-tool-call-with-policy": {
    id: "wrap-tool-call-with-policy",
    questionId: "AMC-4.1",
    title: "Wrap tool call with policy check",
    description: "Route command execution through governor/approval checks before execution.",
    replacementExample: "await governor.check({ action: \"TOOL_EXEC\", risk: \"high\" });"
  },
  "add-schema-validation": {
    id: "add-schema-validation",
    questionId: "AMC-5.1",
    title: "Validate parsed JSON with schema",
    description: "Validate runtime payloads before business logic execution.",
    replacementExample: "const payload = mySchema.parse(JSON.parse(raw));"
  },
  "add-timeout-to-fetch": {
    id: "add-timeout-to-fetch",
    questionId: "AMC-4.5",
    title: "Add timeout/abort signal",
    description: "Use AbortController and retry policies for network calls.",
    replacementExample: "fetch(url, { signal: AbortSignal.timeout(5000) })"
  }
};


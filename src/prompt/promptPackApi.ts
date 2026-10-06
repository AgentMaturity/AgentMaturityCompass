import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { listAgents } from "../fleet/registry.js";
import { resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { checkNotaryTrust } from "../trust/trustConfig.js";
import { verifyWorkspacePromptPack } from "./promptPackVerifier.js";
import { buildPromptPackArtifact, inspectPromptPackArtifact } from "./promptPackArtifact.js";
import { diffLatestPromptPack } from "./promptDiff.js";
import {
  ensurePromptDirs,
  initPromptPolicy,
  loadPromptPolicy,
  loadPromptSchedulerState,
  promptLatestPackPath,
  promptPolicyPath,
  promptSchedulerPath,
  savePromptPolicy,
  savePromptSchedulerState,
  verifyPromptPolicySignature,
  verifyPromptSchedulerStateSignature
} from "./promptPolicyStore.js";
import { listPromptAgentsWithPacks, savePromptLintReport, savePromptPackArtifact, verifyPromptLintSignature } from "./promptPackStore.js";
import { promptLintSchema, type PromptPackProvider } from "./promptPackSchema.js";
import { loadLatestCgxContextPack } from "../cgx/cgxStore.js";
import { compilePromptPack } from "./promptCompiler.js";
import { validateTruthguardForWorkspace } from "../truthguard/truthguardApi.js";
import { truthguardResultSchema } from "../truthguard/truthguardSchema.js";
import type { PromptPolicy } from "./promptPolicySchema.js";

function currentPolicySha(workspace: string): string {
  if (!pathExists(promptPolicyPath(workspace))) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(promptPolicyPath(workspace)));
}

function currentCgxSha(workspace: string, agentId: string): string {
  const pack = loadLatestCgxContextPack(workspace, agentId);
  if (!pack) {
    return "0".repeat(64);
  }
  return sha256Hex(Buffer.from(canonicalize(pack), "utf8"));
}

function listKnownAgents(workspace: string): string[] {
  try {
    const rows = listAgents(workspace).map((row) => row.id);
    if (!rows.includes("default")) {
      rows.unshift("default");
    }
    return [...new Set(rows)].sort((a, b) => a.localeCompare(b));
  } catch {
    return ["default"];
  }
}

function tempArtifactPath(workspace: string, agentId: string): string {
  const tmp = mkdtempSync(join(tmpdir(), "amc-prompt-build-"));
  return join(tmp, `${agentId}.amcprompt`);
}

function nextRefreshTs(nowTs: number, cadenceHours: number): number {
  return nowTs + Math.max(1, cadenceHours) * 60 * 60 * 1000;
}

function fileExists(path: string): boolean {
  return pathExists(path);
}

function textFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((row) => textFromUnknown(row));
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return Object.values(row).flatMap((item) => textFromUnknown(item));
  }
  return [];
}

function extractCandidatePromptTexts(params: {
  provider: PromptPackProvider;
  requestKind: string;
  body: unknown;
}): string[] {
  const row = (typeof params.body === "object" && params.body !== null ? params.body : {}) as Record<string, unknown>;
  if (params.provider === "anthropic") {
    return [...textFromUnknown(row.system), ...textFromUnknown(row.messages)];
  }
  if (params.provider === "gemini") {
    return [...textFromUnknown(row.systemInstruction), ...textFromUnknown(row.contents)];
  }
  if (params.requestKind === "responses") {
    return [...textFromUnknown(row.instructions), ...textFromUnknown(row.input)];
  }
  return textFromUnknown(row.messages);
}

function detectOverrideMatches(params: {
  policy: PromptPolicy;
  texts: string[];
}): string[] {
  const hits = new Set<string>();
  const patterns = params.policy.promptPolicy.enforcement.overridePatterns;
  for (const text of params.texts) {
    const normalized = text.toLowerCase();
    for (const pattern of patterns) {
      if (normalized.includes(pattern.toLowerCase())) {
        hits.add(pattern);
      }
    }
  }
  return [...hits].sort((a, b) => a.localeCompare(b));
}

function injectPromptBody(params: {
  provider: PromptPackProvider;
  requestKind: string;
  body: unknown;
  systemPrompt: string;
  stripUserSystemMessages: boolean;
}): unknown {
  const row = (typeof params.body === "object" && params.body !== null ? { ...(params.body as Record<string, unknown>) } : {}) as Record<string, unknown>;
  if (params.provider === "anthropic") {
    row.system = params.systemPrompt;
    return row;
  }
  if (params.provider === "gemini") {
    row.systemInstruction = {
      parts: [{ text: params.systemPrompt }]
    };
    return row;
  }
  if (params.requestKind === "responses") {
    if (params.stripUserSystemMessages && Array.isArray(row.input)) {
      row.input = row.input.filter((item) => {
        if (!item || typeof item !== "object") {
          return true;
        }
        const role = (item as Record<string, unknown>).role;
        return role !== "system";
      });
    }
    row.instructions = params.systemPrompt;
    return row;
  }
  const messages = Array.isArray(row.messages) ? [...row.messages] : [];
  const filtered = params.stripUserSystemMessages
    ? messages.filter((item) => {
        if (!item || typeof item !== "object") {
          return true;
        }
        return (item as Record<string, unknown>).role !== "system";
      })
    : messages;
  row.messages = [{ role: "system", content: params.systemPrompt }, ...filtered];
  return row;
}

function extractResponseText(provider: PromptPackProvider, responseBody: unknown): string {
  const row = (typeof responseBody === "object" && responseBody !== null ? responseBody : {}) as Record<string, unknown>;
  if (provider === "anthropic") {
    const content = Array.isArray(row.content) ? row.content : [];
    const text = content
      .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).text : ""))
      .filter((item): item is string => typeof item === "string");
    return text.join("\n").trim();
  }
  if (provider === "gemini") {
    const candidates = Array.isArray(row.candidates) ? row.candidates : [];
    const first = candidates[0] && typeof candidates[0] === "object" ? (candidates[0] as Record<string, unknown>) : {};
    const content = first.content && typeof first.content === "object" ? (first.content as Record<string, unknown>) : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map((part) => (part && typeof part === "object" ? (part as Record<string, unknown>).text : ""))
      .filter((item): item is string => typeof item === "string");
    return text.join("\n").trim();
  }
  const choices = Array.isArray(row.choices) ? row.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const message = first.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : {};
  const content = message.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item === "object" ? ((item as Record<string, unknown>).text ?? "") : ""))
      .filter((item): item is string => typeof item === "string")
      .join("\n")
      .trim();
  }
  return "";
}

function toTruthguardOutput(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // fallback below
    }
  }
  return {
    v: 1,
    answer: trimmed.length > 0 ? trimmed : "UNKNOWN",
    claims: trimmed.length > 0 ? [{ text: trimmed }] : [],
    unknowns: trimmed.length > 0 ? [] : [{ text: "No assistant content returned." }],
    nextActions: []
  };
}

function redactSnippet(value: string): string {
  if (value.length <= 8) {
    return "<REDACTED>";
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function applyStrongClaimRules(params: {
  policy: PromptPolicy;
  output: unknown;
  result: ReturnType<typeof validateTruthguardForWorkspace>["result"];
}) {
  const strongRes = [...params.result.violations];
  const reasons = [...params.result.reasons];
  const parsed = typeof params.output === "object" && params.output !== null ? (params.output as Record<string, unknown>) : {};
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const answer = typeof parsed.answer === "string" ? parsed.answer : "";
  const regexes = params.policy.promptPolicy.truth.strongClaimRegexes
    .map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch {
        return null;
      }
    })
    .filter((row): row is RegExp => row !== null);
  if (params.policy.promptPolicy.truth.requireEvidenceRefsForStrongClaims) {
    if (regexes.some((re) => re.test(answer))) {
      strongRes.push({
        kind: "MISSING_EVIDENCE_REF",
        path: "answer",
        message: "strong claim requires evidenceRefs",
        snippetRedacted: redactSnippet(answer)
      });
      reasons.push("strong claim requires evidenceRefs");
    }
    claims.forEach((row, index) => {
      if (!row || typeof row !== "object") {
        return;
      }
      const claim = row as Record<string, unknown>;
      const text = typeof claim.text === "string" ? claim.text : "";
      if (!regexes.some((re) => re.test(text))) {
        return;
      }
      const refs = Array.isArray(claim.evidenceRefs) ? claim.evidenceRefs.filter((item) => typeof item === "string") : [];
      if (refs.length > 0) {
        return;
      }
      strongRes.push({
        kind: "MISSING_EVIDENCE_REF",
        path: `claims[${index}]`,
        message: "strong claim requires evidenceRefs",
        snippetRedacted: redactSnippet(text)
      });
      reasons.push("strong claim requires evidenceRefs");
    });
  }
  return truthguardResultSchema.parse({
    ...params.result,
    status: strongRes.length === 0 ? "PASS" : "FAIL",
    reasons: [...new Set(reasons)].sort((a, b) => a.localeCompare(b)),
    violations: strongRes.sort((a, b) => `${a.kind}:${a.path}:${a.message}`.localeCompare(`${b.kind}:${b.path}:${b.message}`))
  });
}

function requiredOutputSchemaAllowed(policy: PromptPolicy, output: unknown): boolean {
  if (!output || typeof output !== "object") {
    return true;
  }
  const schemaId = (output as Record<string, unknown>).schemaId;
  if (typeof schemaId !== "string") {
    return true;
  }
  return policy.promptPolicy.truth.allowedOutputContractSchemaIds.includes(schemaId);
}

export function promptInitForApi(workspace: string) {
  let initialized = null as ReturnType<typeof initPromptPolicy> | null;
  if (!fileExists(promptPolicyPath(workspace))) {
    initialized = initPromptPolicy(workspace);
  }
  if (!fileExists(promptSchedulerPath(workspace))) {
    savePromptSchedulerState(workspace, loadPromptSchedulerState(workspace));
  }
  ensurePromptDirs(workspace);
  return initialized ?? {
    path: promptPolicyPath(workspace),
    sigPath: `${promptPolicyPath(workspace)}.sig`,
    policy: loadPromptPolicy(workspace)
  };
}

export function promptVerifyForApi(workspace: string): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const policySig = verifyPromptPolicySignature(workspace);
  if (!policySig.valid) {
    errors.push(`policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const schedulerSig = verifyPromptSchedulerStateSignature(workspace);
  if (!(schedulerSig.valid || !schedulerSig.signatureExists)) {
    errors.push(`scheduler signature invalid: ${schedulerSig.reason ?? "unknown"}`);
  }
  for (const agentId of listPromptAgentsWithPacks(workspace)) {
    const verify = verifyWorkspacePromptPack(workspace, promptLatestPackPath(workspace, agentId));
    if (!verify.ok) {
      errors.push(`pack(${agentId}) invalid: ${verify.errors.join("; ")}`);
    }
    const lintSig = verifyPromptLintSignature(workspace, agentId);
    if (!(lintSig.valid || !lintSig.signatureExists)) {
      errors.push(`lint(${agentId}) signature invalid: ${lintSig.reason ?? "unknown"}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

export function promptPolicyForApi(workspace: string): {
  policy: PromptPolicy;
  signature: ReturnType<typeof verifyPromptPolicySignature>;
} {
  return {
    policy: loadPromptPolicy(workspace),
    signature: verifyPromptPolicySignature(workspace)
  };
}

export function promptPolicyApplyForApi(params: {
  workspace: string;
  policy: PromptPolicy;
  reason: string;
  actor: string;
}) {
  const saved = savePromptPolicy(params.workspace, params.policy);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "PROMPT_POLICY_APPLIED",
    agentId: params.actor,
    artifact: {
      kind: "policy",
      id: "prompt-policy",
      sha256: sha256Hex(readFileSync(saved.path))
    }
  });
  return {
    ...saved,
    reason: params.reason
  };
}

export function buildPromptPackForApi(params: {
  workspace: string;
  agentId?: string;
  outFile?: string;
}) {
  const agentId = resolveAgentId(params.workspace, params.agentId ?? "default");
  const tempOut = params.outFile ? resolve(params.workspace, params.outFile) : tempArtifactPath(params.workspace, agentId);
  const built = buildPromptPackArtifact({
    workspace: params.workspace,
    agentId,
    outFile: tempOut
  });
  const persisted = savePromptPackArtifact({
    workspace: params.workspace,
    agentId,
    artifactPath: built.outFile,
    generatedTs: built.pack.generatedTs
  });
  const lintSaved = savePromptLintReport({
    workspace: params.workspace,
    agentId,
    lint: built.lint
  });
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "PROMPT_PACK_CREATED",
    agentId,
    artifact: {
      kind: "policy",
      id: built.pack.packId,
      sha256: built.sha256
    }
  });
  if (built.lint.status === "FAIL") {
    appendTransparencyEntry({
      workspace: params.workspace,
      type: "PROMPT_LINT_FAILED",
      agentId,
      artifact: {
        kind: "policy",
        id: built.pack.packId,
        sha256: sha256Hex(Buffer.from(canonicalize(built.lint), "utf8"))
      }
    });
  }
  if (!params.outFile) {
    try {
      rmSync(dirname(built.outFile), { recursive: true, force: true });
    } catch {
      // noop
    }
  }
  return {
    ...built,
    agentId,
    persisted,
    lintSaved
  };
}

export function promptStatusForApi(workspace: string): Array<{
  agentId: string;
  hasPack: boolean;
  packSha256: string | null;
  packId: string | null;
  templateId: string | null;
  generatedTs: number | null;
  cgxPackSha256: string | null;
  signature: "PASS" | "FAIL" | "MISSING";
  lint: "PASS" | "FAIL" | "MISSING";
  findings: number;
}> {
  const policy = loadPromptPolicy(workspace);
  const rows = listKnownAgents(workspace);
  return rows.map((agentId) => {
    const latest = promptLatestPackPath(workspace, agentId);
    if (!pathExists(latest)) {
      return {
        agentId,
        hasPack: false,
        packSha256: null,
        packId: null,
        templateId: policy.promptPolicy.templates.byAgentType.other,
        generatedTs: null,
        cgxPackSha256: null,
        signature: "MISSING" as const,
        lint: "MISSING" as const,
        findings: 0
      };
    }
    const inspect = inspectPromptPackArtifact(latest);
    const verify = verifyWorkspacePromptPack(workspace, latest);
    const lint = promptLintSchema.parse(inspect.lint ?? { v: 1, status: "FAIL", findings: [] });
    return {
      agentId,
      hasPack: true,
      packSha256: sha256Hex(readFileSync(latest)),
      packId: inspect.pack.packId,
      templateId: inspect.pack.templateId,
      generatedTs: inspect.pack.generatedTs,
      cgxPackSha256: inspect.pack.bindings.cgxPackSha256,
      signature: verify.ok ? "PASS" : "FAIL",
      lint: lint.status,
      findings: lint.findings.length
    };
  });
}

export function promptShowForApi(params: {
  workspace: string;
  agentId: string;
  provider: PromptPackProvider;
  format: "text" | "json";
}) {
  const latest = promptLatestPackPath(params.workspace, params.agentId);
  if (!pathExists(latest)) {
    throw new Error(`prompt pack not found for agent ${params.agentId}`);
  }
  const inspect = inspectPromptPackArtifact(latest);
  const value =
    params.provider === "openai"
      ? inspect.providerFiles.openai
      : params.provider === "anthropic"
        ? inspect.providerFiles.anthropic
        : params.provider === "gemini"
          ? inspect.providerFiles.gemini
          : params.provider === "xai"
            ? inspect.providerFiles.xai
            : params.provider === "openrouter"
              ? inspect.providerFiles.openrouter
              : inspect.providerFiles.generic;
  if (params.format === "json") {
    return value;
  }
  if ("systemMessage" in value) {
    return value.systemMessage;
  }
  if ("system" in value) {
    return value.system;
  }
  return value.systemInstruction;
}

export function promptDiffForApi(params: {
  workspace: string;
  agentId: string;
}) {
  return diffLatestPromptPack(params.workspace, params.agentId);
}

export function promptSchedulerStatusForApi(workspace: string) {
  const state = loadPromptSchedulerState(workspace);
  return {
    state,
    signature: verifyPromptSchedulerStateSignature(workspace)
  };
}

export function promptSchedulerSetEnabledForApi(params: {
  workspace: string;
  enabled: boolean;
}) {
  const current = loadPromptSchedulerState(params.workspace);
  const next = {
    ...current,
    enabled: params.enabled
  };
  const saved = savePromptSchedulerState(params.workspace, next);
  return { state: next, ...saved };
}

export function promptSchedulerRunNowForApi(params: {
  workspace: string;
  agent: string | "all";
}) {
  const policySig = verifyPromptPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`prompt policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const agents = params.agent === "all" ? listKnownAgents(params.workspace) : [resolveAgentId(params.workspace, params.agent)];
  const built = agents.map((agentId) =>
    buildPromptPackForApi({
      workspace: params.workspace,
      agentId
    })
  );
  const policy = loadPromptPolicy(params.workspace);
  const now = Date.now();
  const next = loadPromptSchedulerState(params.workspace);
  const updated = {
    ...next,
    lastRefreshTs: now,
    nextRefreshTs: nextRefreshTs(now, policy.promptPolicy.recurrence.refreshCadenceHours),
    lastOutcome: {
      status: "OK" as const,
      reason: ""
    }
  };
  savePromptSchedulerState(params.workspace, updated);
  return {
    built: built.map((row) => ({
      agentId: row.agentId,
      packId: row.pack.packId,
      sha256: row.sha256,
      lint: row.lint.status
    })),
    scheduler: updated
  };
}

export function promptSchedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
}) {
  const state = loadPromptSchedulerState(params.workspace);
  if (!state.enabled) {
    return { ran: false, reason: "disabled" as const };
  }
  if (!params.workspaceReady) {
    const next = {
      ...state,
      lastOutcome: {
        status: "ERROR" as const,
        reason: "workspace not ready"
      }
    };
    savePromptSchedulerState(params.workspace, next);
    return { ran: false, reason: "workspace_not_ready" as const };
  }
  const policySig = verifyPromptPolicySignature(params.workspace);
  if (!policySig.valid) {
    const next = {
      ...state,
      lastOutcome: {
        status: "ERROR" as const,
        reason: `prompt policy invalid: ${policySig.reason ?? "unknown"}`
      }
    };
    savePromptSchedulerState(params.workspace, next);
    return { ran: false, reason: "policy_untrusted" as const };
  }
  const now = Date.now();
  if (state.nextRefreshTs && state.nextRefreshTs > now) {
    return { ran: false, reason: "not_due" as const };
  }
  const out = promptSchedulerRunNowForApi({
    workspace: params.workspace,
    agent: "all"
  });
  return {
    ran: true,
    built: out.built
  };
}

function isPackStale(params: {
  workspace: string;
  agentId: string;
  packPath: string;
  policy: PromptPolicy;
}) {
  if (!pathExists(params.packPath)) {
    return true;
  }
  const inspect = inspectPromptPackArtifact(params.packPath);
  const ageMs = Date.now() - inspect.pack.generatedTs;
  if (ageMs > params.policy.promptPolicy.recurrence.refreshCadenceHours * 60 * 60 * 1000) {
    return true;
  }
  if (inspect.pack.bindings.promptPolicySha256 !== currentPolicySha(params.workspace)) {
    return true;
  }
  if (inspect.pack.bindings.cgxPackSha256 !== currentCgxSha(params.workspace, params.agentId)) {
    return true;
  }
  return false;
}

export async function preparePromptForBridgeRequest(params: {
  workspace: string;
  agentId: string;
  provider: PromptPackProvider;
  requestKind: string;
  body: unknown;
}) {
  const policySig = verifyPromptPolicySignature(params.workspace);
  const policy = loadPromptPolicy(params.workspace);
  if (policy.promptPolicy.enforcement.mode === "ENFORCE" && !policySig.valid) {
    return {
      ok: false as const,
      status: 503,
      code: "PROMPT_POLICY_UNTRUSTED",
      reasons: [policySig.reason ?? "invalid signature"]
    };
  }
  if (policy.promptPolicy.enforcement.mode === "ENFORCE" && policy.promptPolicy.enforcement.requireNotarySigner) {
    const trust = await checkNotaryTrust(params.workspace);
    if (!trust.ok) {
      return {
        ok: false as const,
        status: 503,
        code: "PROMPT_NOTARY_UNAVAILABLE",
        reasons: trust.reasons
      };
    }
  }
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const latestPath = promptLatestPackPath(params.workspace, agentId);
  if (isPackStale({ workspace: params.workspace, agentId, packPath: latestPath, policy })) {
    buildPromptPackForApi({
      workspace: params.workspace,
      agentId
    });
  }
  if (!pathExists(latestPath)) {
    return {
      ok: false as const,
      status: 503,
      code: "PROMPT_PACK_MISSING",
      reasons: ["no prompt pack available"]
    };
  }
  const verify = verifyWorkspacePromptPack(params.workspace, latestPath);
  if (policy.promptPolicy.enforcement.mode === "ENFORCE" && policy.promptPolicy.enforcement.requirePackSignatureValid && !verify.ok) {
    return {
      ok: false as const,
      status: 503,
      code: "PROMPT_PACK_INVALID",
      reasons: verify.errors
    };
  }
  const inspect = inspectPromptPackArtifact(latestPath);
  const lint = inspect.lint;
  if (
    policy.promptPolicy.enforcement.mode === "ENFORCE" &&
    policy.promptPolicy.enforcement.failClosedOnLintFail &&
    lint &&
    lint.status === "FAIL"
  ) {
    return {
      ok: false as const,
      status: 503,
      code: "PROMPT_LINT_FAILED",
      reasons: [`findings=${lint.findings.length}`]
    };
  }

  const texts = extractCandidatePromptTexts({
    provider: params.provider,
    requestKind: params.requestKind,
    body: params.body
  });
  const overrideMatches = detectOverrideMatches({
    policy,
    texts
  });
  if (
    policy.promptPolicy.enforcement.mode === "ENFORCE" &&
    policy.promptPolicy.enforcement.rejectIfUserTriesToOverride &&
    overrideMatches.length > 0
  ) {
    return {
      ok: false as const,
      status: 400,
      code: "PROMPT_OVERRIDE_REJECTED",
      reasons: overrideMatches,
      overrideMatches
    };
  }

  const providerPrompt =
    params.provider === "openai"
      ? inspect.providerFiles.openai.systemMessage
      : params.provider === "anthropic"
        ? inspect.providerFiles.anthropic.system
        : params.provider === "gemini"
          ? inspect.providerFiles.gemini.systemInstruction
          : params.provider === "xai"
            ? inspect.providerFiles.xai.systemMessage
            : params.provider === "openrouter"
              ? inspect.providerFiles.openrouter.systemMessage
              : inspect.providerFiles.generic.systemMessage;

  const body =
    policy.promptPolicy.enforcement.mode === "ENFORCE"
      ? injectPromptBody({
          provider: params.provider,
          requestKind: params.requestKind,
          body: params.body,
          systemPrompt: providerPrompt,
          stripUserSystemMessages: policy.promptPolicy.enforcement.stripUserSystemMessages
        })
      : params.body;

  return {
    ok: true as const,
    policy,
    body,
    overrideMatches,
    binding: {
      packSha256: sha256Hex(readFileSync(latestPath)),
      packId: inspect.pack.packId,
      templateId: inspect.pack.templateId,
      cgxPackSha256: inspect.pack.bindings.cgxPackSha256
    }
  };
}

export function validateBridgeResponseWithPromptPolicy(params: {
  workspace: string;
  provider: PromptPackProvider;
  responseBody: unknown;
  policy: PromptPolicy;
}) {
  if (!params.policy.promptPolicy.truth.requireTruthguardForBridgeResponses) {
    return {
      result: truthguardResultSchema.parse({
        v: 1,
        status: "PASS",
        reasons: [],
        missingEvidenceRefs: [],
        violations: []
      }),
      shouldBlock: false
    };
  }
  const responseText = extractResponseText(params.provider, params.responseBody);
  const output = toTruthguardOutput(responseText);
  const evaluated = validateTruthguardForWorkspace({
    workspace: params.workspace,
    output
  });
  let result = applyStrongClaimRules({
    policy: params.policy,
    output,
    result: evaluated.result
  });
  if (!requiredOutputSchemaAllowed(params.policy, output)) {
    result = truthguardResultSchema.parse({
      ...result,
      status: "FAIL",
      reasons: [...new Set([...result.reasons, "output schemaId is not allowlisted"])].sort((a, b) => a.localeCompare(b)),
      violations: [
        ...result.violations,
        {
          kind: "DISALLOWED_MODEL",
          path: "schemaId",
          message: "output schemaId is not allowlisted",
          snippetRedacted: "<REDACTED>"
        }
      ]
    });
  }
  const shouldBlock = params.policy.promptPolicy.truth.enforcementMode === "ENFORCE" && result.status === "FAIL";
  return {
    result,
    shouldBlock,
    output
  };
}

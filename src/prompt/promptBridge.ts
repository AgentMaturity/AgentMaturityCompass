import YAML from "yaml";
import { readFileSync } from "node:fs";
import { resolveAgentId } from "../fleet/paths.js";
import { pathExists } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, captureOrgPairsAuthority } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { checkNotaryTrust } from "../trust/trustConfig.js";
import { loadLatestCgxContextPack, cgxLatestPackPath } from "../cgx/cgxStore.js";
import { promptPolicyPath, promptLatestPackPath, promptLatestPackShaPath, promptLatestLintPath, loadPromptPolicyAttemptAsync } from "./promptPolicyStore.js";
import { promptPolicySchema, type PromptPolicy } from "./promptPolicySchema.js";
import { inspectPromptPackArtifact } from "./promptPackArtifact.js";
import { verifyWorkspacePromptPack } from "./promptPackVerifier.js";
import { buildPromptPackForApiAsync, capturePromptPackAuthority } from "./promptPackAsync.js";
import { capturePromptFiles, assertPromptFilesCurrent } from "./promptPublication.js";
import type { PromptPackProvider } from "./promptPackSchema.js";
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
  const input = {workspace:params.workspace,agentId:params.agentId,provider:params.provider,requestKind:params.requestKind,body:structuredClone(params.body)};
  params = input;
  const path = promptPolicyPath(input.workspace), before = captureOrgPairs([path]), bytes = orgPairBytes(before,path), sidecar = orgPairBytes(before,`${path}.sig`);
  const policySig = bytes === null ? {valid:false,reason:"prompt policy missing"} : sidecar === null ? {valid:false,reason:"signature missing"} : verifyAuditorSignatureBytes(input.workspace,"BUNDLE",bytes,sidecar);
  const missingAuthority = bytes === null ? captureOrgPairsAuthority(input.workspace) : null;
  const initializedPolicy = bytes === null ? await loadPromptPolicyAttemptAsync(input.workspace,
    {beforePublish:missingAuthority!,assertInputsCurrent:()=>assertOrgPairsCurrent(before)}, before) : null;
  const policy = initializedPolicy === null ? promptPolicySchema.parse(YAML.parse(bytes!.toString("utf8")) as unknown) : initializedPolicy.policy;
  initializedPolicy?.assertCurrent();
  const policyPair = bytes === null ? captureOrgPairs([path]) : before;
  const assertPolicy = () => { initializedPolicy?.assertCurrent(); assertOrgPairsCurrent(policyPair); };
  assertPolicy();
  if (policy.promptPolicy.enforcement.mode === "ENFORCE" && !policySig.valid) {
    return {
      ok: false as const,
      status: 503,
      code: "PROMPT_POLICY_UNTRUSTED",
      reasons: [policySig.reason ?? "invalid signature"]
    };
  }
  const agentId = resolveAgentId(input.workspace,input.agentId), latestPath = promptLatestPackPath(input.workspace,agentId);
  const staleAtEntry = isPackStale({workspace:input.workspace,agentId,packPath:latestPath,policy});
  const original = staleAtEntry ? capturePromptPackAuthority(input.workspace,undefined,true) : null;
  const cgxPath = cgxLatestPackPath(input.workspace,agentId), lintPath = promptLatestLintPath(input.workspace,agentId);
  const selected = capturePromptFiles([latestPath, cgxPath, `${cgxPath}.sig`, ...(staleAtEntry ? [promptLatestPackShaPath(input.workspace,agentId),lintPath,`${lintPath}.sig`] : [])]);
  const assertRead = () => { assertPolicy(); assertPromptFilesCurrent(selected); };
  const assertBuild = () => { original!.assertCurrent(); assertPolicy(); };
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
  if (staleAtEntry) {
    // One handoff check only: the builder then owns its exact snapshots, including its legitimate cold/publication writes.
    assertBuild(); assertPromptFilesCurrent(selected);
    await buildPromptPackForApiAsync({workspace:input.workspace,agentId},{beforePublish:assertBuild});
  }
  else {
    try { assertRead(); } catch { return {ok:false as const,status:503,code:"PROMPT_PACK_INVALID",reasons:["selected prompt inputs changed during readiness; retry"]}; }
    if (isPackStale({workspace:input.workspace,agentId,packPath:latestPath,policy})) return {
      ok:false as const,status:503,code:"PROMPT_PACK_INVALID",reasons:["prompt pack became stale during readiness; retry"]};
  }
  assertPolicy();
  const returnedPack = capturePromptFiles([latestPath]);
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

  assertPolicy(); assertPromptFilesCurrent(returnedPack);
  return {
    ok: true as const,
    policy,
    body,
    overrideMatches,
    binding: {
      packSha256: sha256Hex(returnedPack[0]!.bytes!),
      packId: inspect.pack.packId,
      templateId: inspect.pack.templateId,
      cgxPackSha256: inspect.pack.bindings.cgxPackSha256
    }
  };
}

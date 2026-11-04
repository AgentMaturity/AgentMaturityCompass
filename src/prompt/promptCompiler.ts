import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { capturePromptLessons } from "./promptLessonTransfer.js";
import type { LessonTransferRequest } from "../learning/lessonProvenance.js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadAgentConfig } from "../fleet/registry.js";
import { resolveAgentId } from "../fleet/paths.js";
import { listToolhubTools } from "../toolhub/toolhubCli.js";
import { loadBridgeConfig } from "../bridge/bridgeConfigStore.js";
import type { CgxContextPack } from "../cgx/cgxSchema.js";
import { loadLatestCgxContextPack, saveCgxContextPack } from "../cgx/cgxStore.js";
import { buildCgxContextPack } from "../cgx/cgxContextPack.js";
import { canonPath } from "../canon/canonLoader.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { listAdvisories } from "../forecast/forecastStore.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { hashId } from "../bench/benchRedaction.js";
import { pathExists } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { buildAnthropicProviderTemplate } from "./providerTemplates/anthropic.js";
import { buildGeminiProviderTemplate } from "./providerTemplates/gemini.js";
import { buildGenericProviderTemplate } from "./providerTemplates/generic.js";
import { buildOpenAiProviderTemplate } from "./providerTemplates/openai.js";
import { buildOpenRouterProviderTemplate } from "./providerTemplates/openrouter.js";
import { buildXaiProviderTemplate } from "./providerTemplates/xai.js";
import { runPromptLint } from "./promptLint.js";
import { loadPromptPolicy, promptPolicyPath } from "./promptPolicyStore.js";
import { promptPackSchema, type PromptPack, type PromptProviderFiles } from "./promptPackSchema.js";
import { selectPromptTemplateId, renderNorthstarSystemPrompt } from "./promptTemplates.js";
import type { PromptPolicy, PromptTemplateAgentType } from "./promptPolicySchema.js";

function riskTier(value: string): "LOW" | "MEDIUM" | "HIGH" {
  const normalized = value.toLowerCase();
  if (normalized === "high" || normalized === "critical") {
    return "HIGH";
  }
  if (normalized === "med") {
    return "MEDIUM";
  }
  return "LOW";
}

function detectAgentType(text: string): PromptTemplateAgentType {
  const value = text.toLowerCase();
  if (/(code|developer|devops|software|engineering)/.test(value)) {
    return "code-agent";
  }
  if (/(support|customer|cx|service|helpdesk)/.test(value)) {
    return "support-agent";
  }
  if (/(ops|operations|sre|platform|infra)/.test(value)) {
    return "ops-agent";
  }
  if (/(research|analysis|scientist|investigation)/.test(value)) {
    return "research-agent";
  }
  if (/(sales|revenue|growth|account)/.test(value)) {
    return "sales-agent";
  }
  return "other";
}

function redactPolicyText(input: string, policy: PromptPolicy): string {
  let text = input;
  if (policy.promptPolicy.privacy.redactAllEmails) {
    text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]");
  }
  if (policy.promptPolicy.privacy.redactAllFilePaths) {
    text = text
      .replace(/(?:^|[\s"'`])\/(?:Users|home|var|tmp|etc)\/[^\s"'`]+/g, " [REDACTED_PATH]")
      .replace(/(?:^|[\s"'`])[A-Za-z]:\\[^\s"'`]+/g, " [REDACTED_PATH]");
  }
  return text.replace(/\s+/g, " ").trim();
}

function advisorySortWeight(severity: "INFO" | "WARN" | "CRITICAL"): number {
  if (severity === "CRITICAL") return 0;
  if (severity === "WARN") return 1;
  return 2;
}

function fileSha(path: string): string {
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(path));
}

function hashForWorkspaceId(workspace: string): string {
  return hashId(workspace, 8);
}

function resolveCgxPack(workspace: string, agentId: string) {
  const existing = loadLatestCgxContextPack(workspace, agentId);
  if (existing) {
    return existing;
  }
  const built = buildCgxContextPack({
    workspace,
    agentId
  });
  saveCgxContextPack(workspace, agentId, built);
  return built;
}

function extractHighRiskTools(tools: ReturnType<typeof listToolhubTools>): string[] {
  const high = new Set(["WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "DATA_EXPORT", "IDENTITY", "NETWORK_EXTERNAL"]);
  return tools
    .filter((row) => high.has(row.actionClass))
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));
}

export interface CompiledPromptPack {
  pack: PromptPack;
  providerFiles: PromptProviderFiles;
  lint: ReturnType<typeof runPromptLint>;
  hashes: {
    cgxPackSha256: string;
    policySha256: string;
    canonSha256: string;
    bankSha256: string;
    mechanicTargetsSha256: string | null;
  };
}

export function compilePromptPack(params: {
  workspace: string;
  agentId?: string;
  lessons?: LessonTransferRequest;
}): CompiledPromptPack {
  const workspace = params.workspace;
  const agentId = resolveAgentId(workspace, params.agentId ?? "default");
  const policy = loadPromptPolicy(workspace);
  const cgxPack = resolveCgxPack(workspace, agentId);
  return compilePromptPackWithInputs(workspace, agentId, policy, cgxPack, capturePromptCompilerFacts(workspace, agentId, params.lessons), fileSha(promptPolicyPath(workspace)));
}

/** Internal fact capture shared with the actual async compiler; no signing or initialization is performed here. */
export function capturePromptCompilerFacts(workspace: string, agentId: string, lessons?: LessonTransferRequest) {
  const advisories = listAdvisories(workspace).filter(row => row.scope.type === "WORKSPACE" || (row.scope.type === "AGENT" && row.scope.id === agentId))
    .sort((x, y) => advisorySortWeight(x.severity) - advisorySortWeight(y.severity) || x.advisoryId.localeCompare(y.advisoryId)).slice(0, 5);
  return structuredClone({ bridge: loadBridgeConfig(workspace), trust: loadTrustConfig(workspace), agent: loadAgentConfig(workspace, agentId),
    tools: listToolhubTools(workspace), advisories, lessonTransfer: capturePromptLessons(workspace, agentId, lessons), canonSha: fileSha(canonPath(workspace)), bankSha: fileSha(diagnosticBankPath(workspace)),
    mechanicSha: pathExists(mechanicTargetsPath(workspace)) ? fileSha(mechanicTargetsPath(workspace)) : null });
}
/** Pure template construction; callers retain their own authenticated input/publication boundaries. */
export function compilePromptPackWithInputs(workspace: string, agentId: string, policy: PromptPolicy, cgxPack: CgxContextPack,
  facts: ReturnType<typeof capturePromptCompilerFacts>, policySha: string): CompiledPromptPack {
  const { bridge, trust, agent } = facts;

  const agentType = detectAgentType(`${agent.role} ${agent.domain} ${agent.agentName}`);
  const selectedTemplate = policy.promptPolicy.templates.byAgentType[agentType];
  const providers = Object.entries(bridge.bridge.providers)
    .filter(([, row]) => row.enabled)
    .map(([provider]) => provider)
    .sort((a, b) => a.localeCompare(b));
  const models = Object.values(bridge.bridge.providers)
    .filter((row) => row.enabled)
    .flatMap((row) => row.modelAllowlist)
    .filter((row, index, arr) => arr.indexOf(row) === index)
    .sort((a, b) => a.localeCompare(b));
  const tools = (policy.promptPolicy.privacy.allowIncludeToolNames ? facts.tools.map((row) => row.name) : [])
    .filter((row, index, arr) => arr.indexOf(row) === index)
    .sort((a, b) => a.localeCompare(b));

  const transformTasks = [...cgxPack.topTransformTasks]
    .slice(0, policy.promptPolicy.privacy.includeOnlyTopTasksCount)
    .map((row) => ({
      taskId: row.taskId,
      title: redactPolicyText(row.title, policy),
      why: redactPolicyText(row.why, policy),
      evidenceToVerify: [...row.evidenceRefs.eventHashes.map((hash) => `evh:${hash}`), ...row.evidenceRefs.runIds.map((run) => `run:${run}`)]
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 8)
    }));

  const advisories = facts.advisories.map(row => ({ advisoryId: row.advisoryId, severity: row.severity, category: row.category,
    summary: redactPolicyText(row.summary, policy) }));

  const cgxSha = sha256Hex(Buffer.from(canonicalize(cgxPack), "utf8"));
  const { canonSha, bankSha, mechanicSha } = facts;

  const pack = promptPackSchema.parse({
    v: 1,
    packId: `pp_${randomUUID().replace(/-/g, "")}`,
    generatedTs: Date.now(),
    templateId: selectedTemplate,
    agent: {
      agentIdHash: hashId(agentId, 8),
      agentType,
      riskTier: riskTier(agent.riskTier),
      workspaceIdHash: hashForWorkspaceId(workspace)
    },
    bindings: {
      cgxPackSha256: cgxSha,
      promptPolicySha256: policySha,
      canonSha256: canonSha,
      bankSha256: bankSha,
      mechanicTargetsSha256: mechanicSha,
      trustMode: trust.trust.mode,
      notaryFingerprint: trust.trust.mode === "NOTARY" ? trust.trust.notary.pinnedPubkeyFingerprint : null
    },
    northstar: {
      mission: {
        summary: redactPolicyText(cgxPack.mission.summary, policy).slice(0, 400),
        sources: ["cgx:mission", "cgx:truthConstraints", "cgx:topTransformTasks"]
      },
      constraints: [
        "You must not claim actions without evidenceRefs.",
        "If unknown, say UNKNOWN and explain missing evidence.",
        "Never request or reveal secrets.",
        "Never use disallowed tools/models.",
        "Follow approval requirements for risky actions."
      ],
      recurrence: {
        cadenceHours: policy.promptPolicy.recurrence.refreshCadenceHours,
        selfReflectionChecklist: [
          "Did I cite receipts/evidenceRefs for strong claims?",
          "Did I stay within allowed tools/models/budgets?",
          "Did I escalate approvals when required?",
          "Did I record outcomes and failures honestly?"
        ]
      },
      outputContract: {
        schemaId: "amc.output.v1",
        jsonExample: {
          v: 1,
          answer: "Short factual answer.",
          claims: [{ text: "Completed approved action.", evidenceRefs: ["ev_123"] }],
          unknowns: [{ text: "Missing evidence for deployment status." }],
          nextActions: [{ actionId: "review-approval", requiresApproval: true }]
        }
      }
    },
    allowlists: {
      providers,
      models: policy.promptPolicy.privacy.allowIncludeModelNames ? models : [],
      tools,
      highRiskTools: extractHighRiskTools(facts.tools)
    },
    checkpoints: {
      topTransformTasks: transformTasks,
      currentAdvisories: advisories,
      ...(facts.lessonTransfer ? { lessonTransfer: facts.lessonTransfer } : {})
    }
  });

  const providerFiles: PromptProviderFiles = {
    openai: buildOpenAiProviderTemplate(
      renderNorthstarSystemPrompt({
        pack,
        provider: "openai",
        providerTemplateId: selectPromptTemplateId({ policy, agentType, provider: "openai" })
      }),
      policy.promptPolicy.truth.structuredOutput.prefer
    ),
    anthropic: buildAnthropicProviderTemplate(
      renderNorthstarSystemPrompt({
        pack,
        provider: "anthropic",
        providerTemplateId: selectPromptTemplateId({ policy, agentType, provider: "anthropic" })
      })
    ),
    gemini: buildGeminiProviderTemplate(
      renderNorthstarSystemPrompt({
        pack,
        provider: "gemini",
        providerTemplateId: selectPromptTemplateId({ policy, agentType, provider: "gemini" })
      })
    ),
    xai: buildXaiProviderTemplate(
      renderNorthstarSystemPrompt({
        pack,
        provider: "xai",
        providerTemplateId: selectPromptTemplateId({ policy, agentType, provider: "xai" })
      })
    ),
    openrouter: buildOpenRouterProviderTemplate(
      renderNorthstarSystemPrompt({
        pack,
        provider: "openrouter",
        providerTemplateId: selectPromptTemplateId({ policy, agentType, provider: "openrouter" })
      })
    ),
    generic: buildGenericProviderTemplate(
      renderNorthstarSystemPrompt({
        pack,
        provider: "generic",
        providerTemplateId: selectPromptTemplateId({ policy, agentType, provider: "generic" })
      })
    )
  };

  if (facts.lessonTransfer) pack.bindings.providerFilesSha256 = sha256Hex(canonicalize(providerFiles));

  const lint = runPromptLint({
    pack,
    providerFiles,
    policy
  });

  if (facts.lessonTransfer && (lint.status === "FAIL" || redactSecrets(canonicalize({ pack, providerFiles }), () => "[REDACTED]").findings.length > 0)) {
    throw new Error("lesson prompt failed admission: sensitive or disallowed prompt content");
  }

  return {
    pack,
    providerFiles,
    lint,
    hashes: {
      cgxPackSha256: cgxSha,
      policySha256: policySha,
      canonSha256: canonSha,
      bankSha256: bankSha,
      mechanicTargetsSha256: mechanicSha
    }
  };
}

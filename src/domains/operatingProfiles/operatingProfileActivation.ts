import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import {
  approvalPolicyPath,
  approvalRuleForAction,
  defaultApprovalPolicy,
  initApprovalPolicy,
  loadApprovalPolicy,
  verifyApprovalPolicySignature
} from "../../approvals/approvalPolicyEngine.js";
import { approvalPolicySchema, type ApprovalPolicy } from "../../approvals/approvalPolicySchema.js";
import {
  budgetsPath,
  budgetsSchema,
  loadBudgetsConfig,
  signBudgetsConfig,
  verifyBudgetsConfigSignature,
  type BudgetsConfig
} from "../../budgets/budgets.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import { actionPolicyPath, assertActionPolicyWriterReady, initActionPolicy } from "../../governor/actionPolicyEngine.js";
import { actionPolicySchema } from "../../governor/actionPolicySchema.js";
import { opsPolicyPath, opsPolicySchema, signOpsPolicy } from "../../ops/policy.js";
import {
  loadRuntimeFirewallPolicy,
  runtimeFirewallPolicyPath,
  writeRuntimeFirewallPolicy,
  type RuntimeFirewallPolicy
} from "../../runtime/firewall.js";
import { initToolsConfig, toolsConfigPath } from "../../toolhub/toolhubValidators.js";
import { toolsConfigSchema } from "../../toolhub/toolsSchema.js";
import { ensureDir, pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { visitProfileFacts } from "./operatingProfileConsistency.js";
import { OPERATING_PROFILE_DIR } from "./operatingProfileEmit.js";
import { loadSignedOperatingProfile } from "./operatingProfileSignature.js";
import type { OperatingProfile } from "./operatingProfileTypes.js";

export type SignedConfigName = "approvalPolicy" | "budgets" | "tools" | "actionPolicy" | "opsPolicy" | "firewall";

export interface ActivateOperatingProfileInput {
  workspacePath: string;
  profilePath: string;
  agentId: string;
  dryRun?: boolean;
  allowWidening?: boolean;
}

export interface ActivatedConfig {
  config: SignedConfigName;
  path: string;
  /** Digest of the written bytes; in a dry run, of the bytes that would be written (null for the firewall, which stamps its write time). */
  sha256: string | null;
  sigPath: string;
}

export interface ActivationResult {
  station: OperatingProfile["station"];
  agentId: string;
  profilePath: string;
  profileSha256: string;
  signerFingerprint: string;
  dryRun: boolean;
  allowWidening: boolean;
  /** Each "<config>: <field> <old> -> <new>" the activation weakens; non-empty only with allowWidening. */
  widenings: string[];
  configs: ActivatedConfig[];
  reviewedFacts: Array<{ path: string; reviewedBy?: string; reviewedAt?: string }>;
  /** amc-operating-profiles/<agent>/<station>.activation.json; null in a dry run. */
  recordPath: string | null;
}

interface PlannedConfig {
  config: SignedConfigName;
  path: string;
  bytes: string | null;
  write: () => string;
}

const FIREWALL_STRENGTH: Record<RuntimeFirewallPolicy["mode"], number> = { observe: 0, warn: 1, block: 2 };
const firewallFragmentSchema = z.object({ mode: z.enum(["observe", "warn", "block"]), failClosedOnMissingPolicy: z.boolean() });

/** The current config when it exists; one that fails its signature check stops the activation. */
function currentVerified<T>(name: string, path: string, verify: () => { valid: boolean; reason: string | null }, load: () => T): T | null {
  if (!pathExists(path)) return null;
  const check = verify();
  if (!check.valid) throw new Error(`current ${name} does not verify (${check.reason ?? "invalid"}); repair it before activating a profile`);
  return load();
}

function currentFirewall(workspace: string): RuntimeFirewallPolicy | null {
  try {
    return loadRuntimeFirewallPolicy(workspace);
  } catch (error) {
    throw new Error(`current firewall policy does not verify (${error instanceof Error ? error.message : String(error)}); repair it before activating a profile`);
  }
}

function approvalWidenings(current: ApprovalPolicy, next: ApprovalPolicy): string[] {
  return ACTION_CLASSES.flatMap((actionClass) => {
    const before = approvalRuleForAction(current, actionClass);
    const after = approvalRuleForAction(next, actionClass);
    const field = `actionClasses.${actionClass}`;
    return [
      ...(after.requiredApprovals < before.requiredApprovals ? [`approvalPolicy: ${field}.requiredApprovals ${before.requiredApprovals} -> ${after.requiredApprovals}`] : []),
      ...(before.requireDistinctUsers && !after.requireDistinctUsers ? [`approvalPolicy: ${field}.requireDistinctUsers true -> false`] : [])
    ];
  });
}

type AgentBudget = BudgetsConfig["budgets"]["perAgent"][string];

function budgetLimits(budget: AgentBudget): Record<string, number> {
  return {
    "daily.maxLlmRequests": budget.daily.maxLlmRequests,
    "daily.maxLlmTokens": budget.daily.maxLlmTokens,
    "daily.maxCostUsd": budget.daily.maxCostUsd,
    "perMinute.maxLlmRequests": budget.perMinute.maxLlmRequests,
    "perMinute.maxLlmTokens": budget.perMinute.maxLlmTokens,
    ...Object.fromEntries(Object.entries(budget.daily.maxToolExecutes).map(([actionClass, max]) => [`daily.maxToolExecutes.${actionClass}`, max as number]))
  };
}

/** A limit that rises, or an action-class limit that disappears (no limit), weakens the budget. */
function budgetWidenings(agentId: string, current: AgentBudget, next: AgentBudget): string[] {
  const after = budgetLimits(next);
  return Object.entries(budgetLimits(current)).flatMap(([field, before]) => {
    const value = after[field];
    if (value === undefined) return [`budgets: perAgent.${agentId}.${field} ${before} -> unlimited`];
    return value > before ? [`budgets: perAgent.${agentId}.${field} ${before} -> ${value}`] : [];
  });
}

function firewallWidenings(current: RuntimeFirewallPolicy, next: z.infer<typeof firewallFragmentSchema>): string[] {
  return [
    ...(FIREWALL_STRENGTH[next.mode] < FIREWALL_STRENGTH[current.mode] ? [`firewall: mode ${current.mode} -> ${next.mode}`] : []),
    ...(current.failClosedOnMissingPolicy && !next.failClosedOnMissingPolicy ? ["firewall: failClosedOnMissingPolicy true -> false"] : [])
  ];
}

/**
 * Parses every fragment with the schema its signing command uses, compares it with the current
 * verified config and returns the writes. Nothing is written here.
 */
function planActivation(workspace: string, profile: OperatingProfile, agentId: string): { planned: PlannedConfig[]; widenings: string[] } {
  const fragments = profile.proposedSignedConfigs;
  const approval = approvalPolicySchema.parse(fragments.approvalPolicy);
  const tools = toolsConfigSchema.parse(fragments.tools);
  const action = actionPolicySchema.parse(fragments.actionPolicy);
  const ops = opsPolicySchema.parse(fragments.opsPolicy);
  const firewall = firewallFragmentSchema.parse(fragments.firewall);
  const agentBudget = budgetsSchema.parse(fragments.budgets).budgets.perAgent[agentId];
  if (!agentBudget) throw new Error(`operating profile budgets carry no entry for agent ${agentId}`);

  // The runtime applies the default approval policy when none is written, so that is the baseline.
  const currentApproval = currentVerified("approval policy", approvalPolicyPath(workspace), () => verifyApprovalPolicySignature(workspace), () => loadApprovalPolicy(workspace)) ?? defaultApprovalPolicy();
  const currentBudgets = currentVerified("budgets", budgetsPath(workspace), () => verifyBudgetsConfigSignature(workspace), () => loadBudgetsConfig(workspace));
  const currentAgentBudget = currentBudgets?.budgets.perAgent[agentId];
  const currentFirewallPolicy = currentFirewall(workspace);
  const widenings = [
    ...approvalWidenings(currentApproval, approval),
    ...(currentAgentBudget ? budgetWidenings(agentId, currentAgentBudget, agentBudget) : []),
    ...(currentFirewallPolicy ? firewallWidenings(currentFirewallPolicy, firewall) : [])
  ];

  // Only this agent's budget changes; other agents' entries in the signed file are kept.
  const budgets = budgetsSchema.parse({
    budgets: { ...(currentBudgets?.budgets ?? { version: 1 }), perAgent: { ...currentBudgets?.budgets.perAgent, [agentId]: agentBudget } }
  });
  const writeYaml = (path: string, value: unknown, sign: () => string) => (): string => {
    writeFileAtomic(path, YAML.stringify(value), 0o644);
    return sign();
  };
  const planned: PlannedConfig[] = [
    { config: "approvalPolicy", path: approvalPolicyPath(workspace), bytes: YAML.stringify(approval), write: () => initApprovalPolicy(workspace, approval).sigPath },
    { config: "budgets", path: budgetsPath(workspace), bytes: YAML.stringify(budgets), write: writeYaml(budgetsPath(workspace), budgets, () => signBudgetsConfig(workspace)) },
    { config: "tools", path: toolsConfigPath(workspace), bytes: YAML.stringify(tools), write: () => initToolsConfig(workspace, tools).sigPath },
    { config: "actionPolicy", path: actionPolicyPath(workspace), bytes: YAML.stringify(action), write: () => initActionPolicy(workspace, action).signaturePath },
    { config: "opsPolicy", path: opsPolicyPath(workspace), bytes: YAML.stringify(ops), write: writeYaml(opsPolicyPath(workspace), ops, () => signOpsPolicy(workspace)) },
    // ponytail: the firewall writer takes mode and fail-closed only; every rule stays on (its default), never weaker than the profile's rules.
    {
      config: "firewall",
      path: runtimeFirewallPolicyPath(workspace),
      bytes: null,
      write: () => writeRuntimeFirewallPolicy({ workspace, mode: firewall.mode, failClosedOnMissingPolicy: firewall.failClosedOnMissingPolicy }).signaturePath
    }
  ];
  return { planned, widenings };
}

/**
 * Activates a signed, reviewed operating profile into the six signed configs under `.amc/`.
 * Refuses an unsigned, edited, foreign-signed or inconsistent profile, a profile for another
 * agent, and (unless `allowWidening`) any fragment weaker than the current verified config.
 * The proposal file is never changed. The configs remain self-reported configuration.
 */
export function activateOperatingProfile(input: ActivateOperatingProfileInput): ActivationResult {
  const workspace = resolve(input.workspacePath);
  const agentId = input.agentId.trim();
  const signed = loadSignedOperatingProfile(workspace, input.profilePath);
  const { profile } = signed;
  if (profile.agentId !== agentId) throw new Error(`operating profile is for agent ${profile.agentId}, not ${agentId}`);

  const { planned, widenings } = planActivation(workspace, profile, agentId);
  const allowWidening = input.allowWidening === true;
  if (widenings.length > 0 && !allowWidening) {
    throw new Error(`activation would weaken ${widenings.join("; ")}; pass --allow-widening after review`);
  }
  const reviewedFacts: ActivationResult["reviewedFacts"] = [];
  visitProfileFacts(profile, (path, entry) => {
    if (entry.fact?.status === "reviewed") reviewedFacts.push({ path, reviewedBy: entry.fact.reviewedBy, reviewedAt: entry.fact.reviewedAt });
  });
  const base = {
    station: profile.station,
    agentId,
    profilePath: signed.profilePath,
    profileSha256: signed.digestSha256,
    signerFingerprint: signed.signerFingerprint,
    allowWidening,
    widenings,
    reviewedFacts
  };

  if (input.dryRun === true) {
    const configs = planned.map((entry) => ({
      config: entry.config,
      path: entry.path,
      sha256: entry.bytes === null ? null : sha256Hex(Buffer.from(entry.bytes, "utf8")),
      sigPath: `${entry.path}.sig`
    }));
    return { ...base, dryRun: true, configs, recordPath: null };
  }

  ensureDir(join(workspace, ".amc"));
  assertActionPolicyWriterReady(workspace);
  // ponytail: sequential writes after full validation; a crash mid-way leaves earlier configs activated (each still signed).
  const configs = planned.map((entry) => {
    const sigPath = entry.write();
    return { config: entry.config, path: entry.path, sha256: sha256Hex(readFileSync(entry.path)), sigPath };
  });
  const recordPath = join(workspace, OPERATING_PROFILE_DIR, agentId, `${profile.station}.activation.json`);
  const record = { schemaVersion: profile.schemaVersion, claimKind: "self_reported", ...base, activatedTs: Date.now(), configs };
  writeFileAtomic(recordPath, `${JSON.stringify(record, null, 2)}\n`, 0o644);
  return { ...base, dryRun: false, configs, recordPath };
}

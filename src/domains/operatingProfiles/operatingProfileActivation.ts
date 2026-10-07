import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
import { budgetsPath, budgetsSchema, loadBudgetsConfig, signBudgetsConfig, verifyBudgetsConfigSignature } from "../../budgets/budgets.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import {
  ACTION_POLICY_WRITER_LOCK,
  actionPolicyPath,
  assertActionPolicyWriterReady,
  loadActionPolicy,
  signActionPolicyWithLockHeld,
  verifyActionPolicySignature
} from "../../governor/actionPolicyEngine.js";
import { actionPolicySchema, type ActionPolicy } from "../../governor/actionPolicySchema.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { loadOpsPolicy, opsPolicyPath, opsPolicySchema, signOpsPolicy, verifyOpsPolicySignature } from "../../ops/policy.js";
import {
  defaultRuntimeFirewallPolicy,
  loadRuntimeFirewallPolicy,
  runtimeFirewallPolicyPath,
  writeRuntimeFirewallPolicy,
  type RuntimeFirewallPolicy
} from "../../runtime/firewall.js";
import { initToolsConfig, loadToolsConfig, toolsConfigPath, verifyToolsConfigSignature } from "../../toolhub/toolhubValidators.js";
import { toolsConfigSchema, type ToolDefinition, type ToolsConfig } from "../../toolhub/toolsSchema.js";
import { pathExists, writeFileAtomic } from "../../utils/fs.js";
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

/** How a change to a field moves its control. A field with no rule is weakened by any change (fail closed). */
type Rule =
  | { kind: "ignore" }
  | { kind: "floor"; absent: number }
  | { kind: "ceiling"; absent: number }
  | { kind: "trueIsWeaker" | "falseIsWeaker" | "addedIsWeaker" | "removedIsWeaker" }
  | { kind: "order"; weakestFirst: readonly string[] };
type Rules = ReadonlyArray<readonly [RegExp, Rule]>;

const FLOOR: Rule = { kind: "floor", absent: -Infinity }; // a minimum; lower or removed is weaker
const CEILING: Rule = { kind: "ceiling", absent: Infinity }; // a limit; higher or removed (unlimited) is weaker
const TRUE_WEAKER: Rule = { kind: "trueIsWeaker" };
const FALSE_WEAKER: Rule = { kind: "falseIsWeaker" };
const ADDED_WEAKER: Rule = { kind: "addedIsWeaker" };
const REMOVED_WEAKER: Rule = { kind: "removedIsWeaker" };
const order = (...weakestFirst: string[]): Rule => ({ kind: "order", weakestFirst });

const ASSURANCE_RULES: Rules = [
  [/\.requireAssurancePacks(\.[^.]+)?$/, REMOVED_WEAKER],
  [/\.minScore$/, FLOOR],
  [/\.maxSucceeded$/, CEILING]
];
const APPROVAL_RULES: Rules = [
  [/^defaults\.simulateAlwaysAllowed$/, TRUE_WEAKER],
  [/\.requiredApprovals$/, FLOOR],
  [/\.requireDistinctUsers$/, FALSE_WEAKER],
  [/\.rolesAllowed$/, ADDED_WEAKER],
  [/\.ttlMinutes$/, CEILING],
  ...ASSURANCE_RULES
];
const BUDGET_RULES: Rules = [
  [/^unknownTokenUsage$/, order("ALLOW_WITH_WARNING", "BLOCK")],
  [/^(daily\.(maxLlmRequests|maxLlmTokens|maxCostUsd)|perMinute\.\w+|daily\.maxToolExecutes\.\w+)$/, CEILING],
  [/^consequences\.onExceed$/, REMOVED_WEAKER]
];
const TOOLS_RULES: Rules = [
  [/^denyByDefault$/, FALSE_WEAKER],
  [/^allowedTools\[[^\]]+\]$/, ADDED_WEAKER],
  [/\]\.allow\.\w+$/, ADDED_WEAKER],
  [/\]\.deny\.\w+$/, REMOVED_WEAKER],
  [/\]\.maxBytes$/, CEILING],
  [/\]\.(requireExecTicket|denyByDefault)$/, FALSE_WEAKER]
];
const ACTION_RULES: Rules = [
  [/^defaultMode$/, order("ALLOW", "DENY")],
  [/^riskTierDefaults\.\w+\.requireSandboxForExecute$/, FALSE_WEAKER],
  [/\]\.minEffectiveQuestionLevels\.[^.]+$/, FLOOR],
  [/\]\.requireTrustTierAtLeast$/, order("SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED")],
  [/\]\.allowExecute$/, TRUE_WEAKER],
  [/\]\.requireExecTicket$/, FALSE_WEAKER],
  ...ASSURANCE_RULES
];
const OPS_RULES: Rules = [
  [/^retention\.(prunePayloadsAfterDays|keepArchiveSegmentsDays)$/, FLOOR],
  [/^retention\.pruneGuardEventsAfterDays$/, { kind: "floor", absent: Infinity }], // absent: never pruned
  [/^(encryption\.(blobEncryptionEnabled|reencryptOnRotate)|backups\.requireEncryptedBackups)$/, FALSE_WEAKER],
  [/^(encryption\.keyRotationDays|backups\.maxBackupAgeDaysWarning)$/, CEILING],
  [/^backups\.excludePaths$/, ADDED_WEAKER],
  [/^backups\.includePaths$/, REMOVED_WEAKER]
];
const FIREWALL_RULES: Rules = [
  [/^(updatedAt|schemaVersion)$/, { kind: "ignore" }],
  [/^(enabled|failClosedOnMissingPolicy|redaction\.redactSecrets)$/, FALSE_WEAKER],
  [/^mode$/, order("observe", "warn", "block")],
  [/^(thresholds\.\w+|rules\.maxPayloadChars|redaction\.maxPreviewChars)$/, CEILING],
  [/^rules\.\w+$/, FALSE_WEAKER]
];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function show(value: unknown): string {
  if (value === undefined) return "absent";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * Every change from `before` to `after` that weakens a control, as "<config>: <path> <old> -> <new>".
 * Objects are compared field by field; a field no rule covers counts as weakened by any change.
 */
function weakenings(config: string, rules: Rules, before: unknown, after: unknown, path = ""): string[] {
  if (same(before, after)) return [];
  const weaker = [`${config}: ${path || "(all)"} ${show(before)} -> ${show(after)}`];
  const recurse = (): string[] => {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap((key) => weakenings(config, rules, left[key], right[key], key.startsWith("[") || !path ? `${path}${key}` : `${path}.${key}`));
  };
  const rule = rules.find(([pattern]) => pattern.test(path))?.[1];
  switch (rule?.kind) {
    case "ignore":
      return [];
    case "floor":
    case "ceiling": {
      const number = (value: unknown): number => (value === undefined ? rule.absent : typeof value === "number" ? value : Number.NaN);
      const [from, to] = [number(before), number(after)];
      if (Number.isNaN(from) || Number.isNaN(to)) return weaker;
      return (rule.kind === "floor" ? to < from : to > from) ? weaker : [];
    }
    case "trueIsWeaker":
      return after === true && before !== true ? weaker : [];
    case "falseIsWeaker":
      return before === true && after !== true ? weaker : [];
    case "order": {
      const rank = (value: unknown): number => (value === undefined ? rule.weakestFirst.length - 1 : rule.weakestFirst.indexOf(String(value)));
      return rank(after) < rank(before) ? weaker : [];
    }
    case "addedIsWeaker":
    case "removedIsWeaker": {
      if (Array.isArray(before) || Array.isArray(after)) {
        if (!Array.isArray(before) || !Array.isArray(after)) return weaker;
        const [from, to] = rule.kind === "addedIsWeaker" ? [before, after] : [after, before];
        return to.some((item) => !from.some((existing) => same(existing, item))) ? weaker : [];
      }
      if (before === undefined) return rule.kind === "addedIsWeaker" ? weaker : [];
      if (after === undefined) return rule.kind === "removedIsWeaker" ? weaker : [];
      return isRecord(before) && isRecord(after) ? recurse() : weaker;
    }
    default:
      return isRecord(before) && isRecord(after) ? recurse() : weaker;
  }
}

/** A list as a record keyed "[key]", so entries are matched by identity, not by position. */
function keyed<T>(items: readonly T[], key: (item: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) {
    let id = `[${key(item)}]`;
    for (let n = 2; id in out; n += 1) id = `[${key(item)}#${n}]`;
    out[id] = item;
  }
  return out;
}

const toolKey = (tool: ToolDefinition): string => (tool.context?.kind === "mcp" ? `mcp:${tool.context.server.id}/${tool.name}` : tool.name);
const keyedTools = (config: ToolsConfig) => ({ ...config.tools, allowedTools: keyed(config.tools.allowedTools, toolKey) });
const keyedActions = (policy: ActionPolicy) => ({ ...policy, actions: keyed(policy.actions, (rule) => rule.actionClass) });

/** Effective rule per action class (a missing class falls back to the default rule), plus every removed rule. */
function approvalWeakenings(current: ApprovalPolicy, next: ApprovalPolicy): string[] {
  const effective = (policy: ApprovalPolicy) => ({
    ...policy.approvalPolicy,
    actionClasses: Object.fromEntries(ACTION_CLASSES.map((actionClass) => [actionClass, approvalRuleForAction(policy, actionClass)]))
  });
  const removed = ACTION_CLASSES
    .filter((actionClass) => current.approvalPolicy.actionClasses[actionClass] && !next.approvalPolicy.actionClasses[actionClass])
    .map((actionClass) => `approvalPolicy: actionClasses.${actionClass} ${show(current.approvalPolicy.actionClasses[actionClass])} -> absent`);
  return [...removed, ...weakenings("approvalPolicy", APPROVAL_RULES, effective(current), effective(next))];
}

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

/** Without a signed tools, action-policy or budgets file, or a firewall policy, the runtime fails closed: any activation widens it. */
const failsClosed = (config: SignedConfigName): string => `${config}: absent (the runtime fails closed without it) -> activated`;
const firewallFragmentSchema = z.object({ mode: z.enum(["observe", "warn", "block"]), failClosedOnMissingPolicy: z.boolean() });

/**
 * Parses every fragment with the schema its signing command uses, compares it with the current
 * verified config (or the runtime default when none is written) and returns the writes.
 * Nothing is written here.
 */
function planActivation(workspace: string, profile: OperatingProfile, agentId: string): { planned: PlannedConfig[]; widenings: string[] } {
  const fragments = profile.proposedSignedConfigs;
  const approval = approvalPolicySchema.parse(fragments.approvalPolicy);
  const tools = toolsConfigSchema.parse(fragments.tools);
  const action = actionPolicySchema.parse(fragments.actionPolicy);
  const ops = opsPolicySchema.parse(fragments.opsPolicy);
  const firewallFragment = firewallFragmentSchema.parse(fragments.firewall);
  const agentBudget = budgetsSchema.parse(fragments.budgets).budgets.perAgent[agentId];
  if (!agentBudget) throw new Error(`operating profile budgets carry no entry for agent ${agentId}`);
  // What writeRuntimeFirewallPolicy writes: the default policy for the mode, enabled, every rule on.
  const firewall = { ...defaultRuntimeFirewallPolicy(firewallFragment.mode), enabled: true, failClosedOnMissingPolicy: firewallFragment.failClosedOnMissingPolicy };

  // Approval and ops policies fall back to their defaults when no file is written, so those are the baselines.
  const currentApproval = currentVerified("approval policy", approvalPolicyPath(workspace), () => verifyApprovalPolicySignature(workspace), () => loadApprovalPolicy(workspace)) ?? defaultApprovalPolicy();
  const currentOps = currentVerified("ops policy", opsPolicyPath(workspace), () => verifyOpsPolicySignature(workspace), () => loadOpsPolicy(workspace)) ?? loadOpsPolicy(workspace);
  const currentBudgets = currentVerified("budgets", budgetsPath(workspace), () => verifyBudgetsConfigSignature(workspace), () => loadBudgetsConfig(workspace));
  const currentTools = currentVerified("tools config", toolsConfigPath(workspace), () => verifyToolsConfigSignature(workspace), () => loadToolsConfig(workspace));
  const currentAction = currentVerified("action policy", actionPolicyPath(workspace), () => verifyActionPolicySignature(workspace), () => loadActionPolicy(workspace));
  const currentFirewallPolicy = currentFirewall(workspace);
  // An agent with no entry in a signed budgets file has no limits, so any entry narrows it.
  const currentAgentBudget = currentBudgets?.budgets.perAgent[agentId];
  const widenings = [
    ...approvalWeakenings(currentApproval, approval),
    ...(currentBudgets ? (currentAgentBudget ? weakenings("budgets", BUDGET_RULES, currentAgentBudget, agentBudget) : []) : [failsClosed("budgets")]),
    ...(currentTools ? weakenings("tools", TOOLS_RULES, keyedTools(currentTools), keyedTools(tools)) : [failsClosed("tools")]),
    ...(currentAction ? weakenings("actionPolicy", ACTION_RULES, keyedActions(currentAction), keyedActions(action)) : [failsClosed("actionPolicy")]),
    ...weakenings("opsPolicy", OPS_RULES, currentOps.opsPolicy, ops.opsPolicy),
    ...(currentFirewallPolicy ? weakenings("firewall", FIREWALL_RULES, currentFirewallPolicy, firewall) : [failsClosed("firewall")])
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
    // Written inside the action-policy writer lock that activateOperatingProfile holds.
    { config: "actionPolicy", path: actionPolicyPath(workspace), bytes: YAML.stringify(action), write: writeYaml(actionPolicyPath(workspace), action, () => signActionPolicyWithLockHeld(workspace)) },
    { config: "opsPolicy", path: opsPolicyPath(workspace), bytes: YAML.stringify(ops), write: writeYaml(opsPolicyPath(workspace), ops, () => signOpsPolicy(workspace)) },
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
 * Blocked in agent mode. Refuses an unsigned, edited, foreign-signed or inconsistent profile,
 * a profile for another agent, and (unless `allowWidening`) any change that weakens the current
 * verified config. Planning and writing happen under the action-policy writer lock, the same
 * lock `amc policy pack apply` holds. The proposal file is never changed. The configs remain
 * self-reported configuration.
 */
export function activateOperatingProfile(input: ActivateOperatingProfileInput): ActivationResult {
  const workspace = resolve(input.workspacePath);
  assertOwnerMode(workspace, "domain apply --activate-profile");
  const agentId = input.agentId.trim();
  const signed = loadSignedOperatingProfile(workspace, input.profilePath);
  const { profile } = signed;
  if (profile.agentId !== agentId) throw new Error(`operating profile is for agent ${profile.agentId}, not ${agentId}`);
  const allowWidening = input.allowWidening === true;
  const reviewedFacts: ActivationResult["reviewedFacts"] = [];
  visitProfileFacts(profile, (path, entry) => {
    if (entry.fact?.status === "reviewed") reviewedFacts.push({ path, reviewedBy: entry.fact.reviewedBy, reviewedAt: entry.fact.reviewedAt });
  });
  const plan = (): { planned: PlannedConfig[]; widenings: string[] } => {
    const result = planActivation(workspace, profile, agentId);
    if (result.widenings.length > 0 && !allowWidening) {
      throw new Error(`activation would weaken ${result.widenings.join("; ")}; pass --allow-widening after review`);
    }
    return result;
  };
  const base = {
    station: profile.station,
    agentId,
    profilePath: signed.profilePath,
    profileSha256: signed.digestSha256,
    signerFingerprint: signed.signerFingerprint,
    allowWidening,
    reviewedFacts
  };

  if (input.dryRun === true) {
    const { planned, widenings } = plan();
    const configs = planned.map((entry) => ({
      config: entry.config,
      path: entry.path,
      sha256: entry.bytes === null ? null : sha256Hex(Buffer.from(entry.bytes, "utf8")),
      sigPath: `${entry.path}.sig`
    }));
    return { ...base, dryRun: true, widenings, configs, recordPath: null };
  }

  const { widenings, configs } = withControlFileLock({
    root: dirname(actionPolicyPath(workspace)),
    name: ACTION_POLICY_WRITER_LOCK,
    timeoutMs: 500,
    operation: () => {
      assertActionPolicyWriterReady(workspace);
      const { planned, widenings: found } = plan();
      // ponytail: sequential writes after full validation; a crash mid-way leaves earlier configs activated (each still signed).
      const written = planned.map((entry) => {
        const sigPath = entry.write();
        return { config: entry.config, path: entry.path, sha256: sha256Hex(readFileSync(entry.path)), sigPath };
      });
      return { widenings: found, configs: written };
    }
  });
  const recordPath = join(workspace, OPERATING_PROFILE_DIR, agentId, `${profile.station}.activation.json`);
  const record = { schemaVersion: profile.schemaVersion, claimKind: "self_reported", ...base, widenings, activatedTs: Date.now(), configs };
  writeFileAtomic(recordPath, `${JSON.stringify(record, null, 2)}\n`, 0o644);
  return { ...base, dryRun: false, widenings, configs, recordPath };
}

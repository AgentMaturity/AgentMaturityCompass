/**
 * `amc init --coding` and `amc init --regulated` (P1-40): a new workspace that can run a governed native task at once.
 *
 * Every file is written and signed through the path its own command uses (tools, firewall, budgets, config, users,
 * presets, approval policy, control plan), in owner mode, with the operator's own vault passphrase: nothing here
 * generates, defaults or prints a secret. Signatures checked against the workspace's own keys are a local audit trail,
 * not portable trust (P0-09).
 *
 * `--regulated` also compiles and signs a Layer 0 control plan from a starter deployment profile whose facts are all
 * unknown: the compiler never guesses a fact, so the plan stays blocked until the operator states them, and activating
 * it needs a plan review approved by two OWNER or AUDITOR users other than its requester. Nothing is activated here.
 */
import { readFileSync, rmSync } from "node:fs";
import { userInfo } from "node:os";
import { join, relative } from "node:path";
import inquirer from "inquirer";
import YAML from "yaml";
import { checkToolsetReadiness, type ToolsetReadiness } from "../agent/agentToolset.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../agent/stubProvider.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import type { ApprovalPolicy } from "../approvals/approvalPolicySchema.js";
import { defaultActionPolicy, initActionPolicy, initActionPolicyAsync } from "../governor/actionPolicyStore.js";
import type { ActionPolicy } from "../governor/actionPolicySchema.js";
import { initUsersConfig, usersConfigPath } from "../auth/authApi.js";
import { passwordPolicyProblem } from "../auth/passwordHash.js";
import { compileCatalogPlan } from "../catalog/catalogCli.js";
import { signAmcConfig } from "../config/amcConfigSignature.js";
import { readSecretFromEnvOrFile } from "../config/loadConfig.js";
import { keyPaths } from "../crypto/keys.js";
import { keysetAnchoring } from "../keys/keyset.js";
import { assertOwnerMode } from "../mode/mode.js";
import { savePresets, preparePresetsAsync } from "../presets/agentPresets.js";
import { captureOrgFiles, assertOrgPairsCurrent, captureOrgPairsAuthority, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { loadRuntimeFirewallPolicy, writeRuntimeFirewallPolicy, type RuntimeFirewallMode } from "../runtime/firewall.js";
import { signToolsConfig, toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { defaultToolsConfig, toolsConfigSchema, type ToolDefinition } from "../toolhub/toolsSchema.js";
import { originForEntry } from "../tools/builtin/nativeToolBreadth/originPolicy.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { prepareCodingAdoption, recordCodingAdoption, sealAdoptionPassphrase } from "./codingAdoption.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { applyAMCConfigProfile, initWorkspace, loadAMCConfig, saveAMCConfig } from "../workspace.js";

export type StarterProfileKind = "coding" | "regulated";
export interface StarterOwner { readonly username: string; readonly password: string }

export interface StarterProfileReport {
  readonly kind: StarterProfileKind;
  readonly readiness: ToolsetReadiness;
  readonly owner: { readonly userId: string; readonly username: string };
  readonly firewallMode: RuntimeFirewallMode;
  /** sha256 of the monitor public key, for the operator to record outside the workspace and pin at verification. */
  readonly monitorFingerprint: string;
  /** The compiled, signed, never activated Layer 0 plan (`--regulated` only). */
  readonly plan: {
    readonly status: "ready" | "blocked";
    readonly digest: string;
    readonly outDir: string;
    readonly profilePath: string;
    readonly applicable: number;
    readonly unresolved: ReadonlyArray<{ readonly controlId: string; readonly missingFacts: readonly string[] }>;
  } | null;
  readonly nextCommand: string;
}

const MIN_SECRET = 8;
const STARTER_PROFILE_ID = "regulated-starter";
const passphraseRefusal = (kind: StarterProfileKind): string =>
  `A ${kind} workspace needs a real vault passphrase; set AMC_VAULT_PASSPHRASE or run interactively.`;

/** The starter the init flags select, or null; throws the refusal before anything is written. */
export function starterProfileFlag(opts: { coding?: boolean; regulated?: boolean; minimal?: boolean; skipVault?: boolean;
  trustBoundary?: string; webAllowHost?: readonly string[] }): StarterProfileKind | null {
  if (opts.coding && opts.regulated) throw new Error("--coding and --regulated are mutually exclusive.");
  if (opts.webAllowHost?.length && !opts.coding) throw new Error("--web-allow-host enables web_fetch and web_search in --coding only; --regulated keeps them off.");
  for (const host of opts.webAllowHost ?? []) {
    if (originForEntry(host) === null) throw new Error(`--web-allow-host ${JSON.stringify(host)} is not a hostname or an http(s) origin; nothing was written.`);
  }
  const kind: StarterProfileKind | null = opts.coding ? "coding" : opts.regulated ? "regulated" : null;
  if (kind === null) return null;
  if (opts.minimal) throw new Error(`--${kind} cannot be combined with --minimal.`);
  if (opts.trustBoundary !== undefined) throw new Error(`--${kind} sets the trust boundary; drop --trust-boundary.`);
  if (opts.skipVault) throw new Error(passphraseRefusal(kind));
  return kind;
}

/**
 * fs.read, fs.write and fs.edit over the workspace, and bash confined by the OS (P1-05) with no egress. With
 * `webHosts` (`--coding --web-allow-host`, P2-13), web_fetch and web_search too, granted exactly those origins in the
 * signed policy; web_search still refuses every call until a caller composes a search provider. The other S8 tools
 * (ask_user, todo, plan) stay off in both profiles.
 */
function starterTools(webHosts: readonly string[] = []): string {
  const defaults = defaultToolsConfig().tools;
  const tool = (name: string): ToolDefinition => defaults.allowedTools.find((t) => t.name === name)!;
  const files = (name: string): ToolDefinition => ({ ...tool(name), allow: { ...tool(name).allow, paths: ["./**"] },
    deny: { ...tool(name).deny, paths: [...(tool(name).deny?.paths ?? []), ...SECRET_PATHS] } });
  const web = (name: string): ToolDefinition => ({ name, actionClass: "NETWORK_EXTERNAL", allow: { hostAllowlist: [...webHosts] } } as ToolDefinition);
  const config = toolsConfigSchema.parse({ tools: { ...defaults, allowedTools: [files("fs.read"), files("fs.write"), files("fs.edit"),
    { ...tool("bash"), nativeSandbox: { kind: "os-native", writableDirectories: ["."] } },
    ...(webHosts.length ? [web("web_fetch"), web("web_search")] : [])] } });
  return [
    "# amc init starter tools (P1-40). bash runs confined by the OS (Bubblewrap on Linux, Seatbelt on macOS) and has",
    "# no network: without nativeSandbox.egress every connection is denied. To let it reach a package registry, add",
    "# under bash.nativeSandbox, for example:",
    "#       egress: { allowHosts: [registry.npmjs.org, pypi.org, files.pythonhosted.org] }",
    "# then run: amc tools sign",
    "# Note: each entry covers ports 443 and 80 only; write host:port for another port.",
    YAML.stringify(config)
  ].join("\n");
}

/** Files that usually hold secrets: the coding profile's file tools never read or write them. */
const SECRET_PATHS = ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx", "**/id_rsa*", "**/id_ed25519*",
  "**/.ssh/**", "**/.aws/**", "**/.gnupg/**", "**/.netrc", "**/.npmrc", "**/.pypirc", "**/secrets/**"];

/**
 * The coding profile's Action Policy: the default, except that a file edit (WRITE_LOW) or a shell command (WRITE_HIGH)
 * a person approves runs for real (`executeOnApproval`); without that approval it stays SIMULATE. The shell keeps its OS
 * sandbox; the per-call approval stands in for the owner's execution ticket. Every other class is unchanged.
 */
export function codingActionPolicy(): ActionPolicy {
  return { ...defaultActionPolicy(), actions: defaultActionPolicy().actions.map((rule) =>
    rule.actionClass === "WRITE_LOW" ? { ...rule, executeOnApproval: true }
      : rule.actionClass === "WRITE_HIGH" ? { ...rule, executeOnApproval: true, requireExecTicket: false } : rule) };
}

/** One person working alone approves their own edits and commands: one OWNER or APPROVER for WRITE_LOW and WRITE_HIGH. */
function codingApprovalPolicy(): ApprovalPolicy {
  const base = defaultApprovalPolicy();
  const solo = { requiredApprovals: 1, rolesAllowed: ["APPROVER", "OWNER"] as const, requireDistinctUsers: false };
  const classes = base.approvalPolicy.actionClasses;
  return { ...base, approvalPolicy: { ...base.approvalPolicy, actionClasses: { ...classes,
    WRITE_LOW: { ...classes.WRITE_LOW!, ...solo, rolesAllowed: [...solo.rolesAllowed], ttlMinutes: 60 },
    WRITE_HIGH: { ...classes.WRITE_HIGH!, ...solo, rolesAllowed: [...solo.rolesAllowed], ttlMinutes: 15 } } } };
}

/** Every fact unknown: the compiler never guesses one, and the operator states them before any activation. */
function starterDeploymentProfile(workspace: string): object {
  const unknown = { value: null, provenance: "asserted", source: "amc init --regulated: unknown until the operator states it", reviewedBy: null };
  const id = workspaceIdFromDirectory(workspace);
  return { profileVersion: 1, profileId: STARTER_PROFILE_ID,
    deployment: { tenantId: id, workspaceId: id, deploymentId: STARTER_PROFILE_ID, agentIds: ["default"] },
    ...Object.fromEntries(["primaryStation", "stations", "domains", "jurisdictions", "roles", "entityTypes", "riskClass", "useCases",
      "dataClasses"].map((fact) => [fact, unknown])),
    euRoleRecord: null, art63Record: null, operatingProfile: null, exceptions: [] };
}

function compileStarterPlan(workspace: string): NonNullable<StarterProfileReport["plan"]> {
  const profilePath = join(workspace, "amc-control-plans", STARTER_PROFILE_ID, "deployment-profile.json");
  ensureDir(join(workspace, "amc-control-plans", STARTER_PROFILE_ID));
  writeFileAtomic(profilePath, `${JSON.stringify(starterDeploymentProfile(workspace), null, 2)}\n`, 0o644);
  const { plan, outDir } = compileCatalogPlan(workspace, { profile: relative(workspace, profilePath) });
  return { status: plan.status, digest: plan.digest, outDir, profilePath,
    applicable: plan.requirements.filter((r) => r.applicability === "applicable").length,
    unresolved: plan.requirements.filter((r) => r.applicability === "unresolved").map((r) => ({ controlId: r.controlId, missingFacts: r.missingFacts })) };
}

/**
 * Writes and signs the starter's policy into an initialized workspace (after initWorkspace), in owner mode. The owner
 * becomes the first ACTIVE OWNER of a signed users.yaml, so identity-binding plans (P1-78) can name a principal.
 */
export function applyStarterProfile(workspace: string, kind: StarterProfileKind, owner: StarterOwner, webHosts: readonly string[] = []): StarterProfileReport {
  assertOwnerMode(workspace, "init");
  if (webHosts.length && kind !== "coding") throw new Error("--regulated keeps web_fetch and web_search off.");
  // Never over an existing users.yaml: it would replace every user and their roles.
  if (pathExists(usersConfigPath(workspace))) throw new Error(`${usersConfigPath(workspace)} exists; a starter profile only initializes a new workspace.`);
  writeFileAtomic(toolsConfigPath(workspace), starterTools(webHosts), 0o644);
  signToolsConfig(workspace);
  const firewallMode = kind === "coding" ? "warn" : "block";
  writeRuntimeFirewallPolicy({ workspace, mode: firewallMode });
  // saveAMCConfig rewrites bytes initWorkspace signed, so the config is signed again after it.
  saveAMCConfig(workspace, applyAMCConfigProfile(kind === "coding" ? "dev" : "prod", loadAMCConfig(workspace)));
  signAmcConfig(workspace);
  const users = initUsersConfig({ workspace, username: owner.username, password: owner.password });
  if (kind === "coding") {
    initActionPolicy(workspace, codingActionPolicy());
    initApprovalPolicy(workspace, codingApprovalPolicy());
  }
  if (kind === "regulated") {
    initApprovalPolicy(workspace);
    savePresets(workspace, [{ id: "regulated", description: "Regulated starter (amc init --regulated): every tool call waits for a "
      + "signed human approval decided under the WRITE_HIGH rule. The stub provider is a synthetic demonstration; name your own provider and model.",
    model: STUB_PROVIDER_MODEL, providerId: STUB_PROVIDER_ID, tools: "workspace", approveTools: "WRITE_HIGH" }]);
  }
  return starterReport(workspace, kind, firewallMode, users.owner);
}

/** Coding: a chat that asks before each edit or command. Regulated: a run under the two-approver preset. */
const nextCommandFor = (kind: StarterProfileKind): string => kind === "coding"
  ? "amc agent-loop chat --provider stub --tools workspace --approval-mode default"
  : 'amc agent-loop run "..." --provider stub --tools workspace --preset regulated';

/** What init prints: readiness, the owner, the monitor fingerprint, the plan (`--regulated`) and the next command. */
function starterReport(workspace: string, kind: StarterProfileKind, firewallMode: RuntimeFirewallMode,
  owner: { readonly userId: string; readonly username: string }): StarterProfileReport {
  return { kind, firewallMode, readiness: checkToolsetReadiness(workspace), owner: { userId: owner.userId, username: owner.username },
    monitorFingerprint: sha256Hex(readFileSync(keyPaths(workspace).monitorPublic)), plan: kind === "regulated" ? compileStarterPlan(workspace) : null,
    nextCommand: nextCommandFor(kind) };
}

class StarterProfilePublicationError extends Error {
  readonly code = "STARTER_PROFILE_INCOMPLETE";
  constructor(readonly completedPhases: readonly string[], readonly phase: string, cause: unknown) {
    super(`starter profile did not complete (${phase}: ${cause instanceof Error ? cause.message : String(cause)}); successful earlier phases remain and the failed phase may be partial`, { cause });
    this.name = "StarterProfilePublicationError";
  }
}
/** Maintained starter counterpart. Existing sync policy/approval/control-plan producers keep their own contracts. */
async function applyStarterProfileAsync(workspace: string, kind: StarterProfileKind, owner: StarterOwner, webHosts: readonly string[] = [],
  options: OrgPairsOptions & { keepFirewall?: boolean } = {}): Promise<StarterProfileReport> {
  const selectedOwner = { username: owner.username, password: owner.password }, caller = options.beforePublish, inputs = options.assertInputsCurrent;
  const original = captureOrgPairsAuthority(workspace, () => { caller?.(); assertOwnerMode(workspace, "init"); });
  const completed: string[] = []; let phase = "users-precondition";
  if (webHosts.length && kind !== "coding") throw new Error("--regulated keeps web_fetch and web_search off.");
  if (pathExists(usersConfigPath(workspace))) throw new Error(`${usersConfigPath(workspace)} exists; a starter profile only initializes a new workspace.`);
  try {
    phase = "tools-body"; writeFileAtomic(toolsConfigPath(workspace), starterTools(webHosts), 0o644); completed.push(phase);
    phase = "tools-signature"; signToolsConfig(workspace); completed.push(phase);
    const kept = options.keepFirewall === true ? loadRuntimeFirewallPolicy(workspace)?.mode : undefined;
    const firewallMode: RuntimeFirewallMode = kept ?? (kind === "coding" ? "warn" : "block");
    // A workspace moved in place keeps the firewall policy it has (UX-01): the starter's warn mode never replaces block.
    phase = "firewall"; const firewall = options.keepFirewall === true ? null : writeRuntimeFirewallPolicy({ workspace, mode: firewallMode }); completed.push(phase);
    phase = "config-body"; saveAMCConfig(workspace, applyAMCConfigProfile(kind === "coding" ? "dev" : "prod", loadAMCConfig(workspace))); completed.push(phase);
    phase = "config-signature"; signAmcConfig(workspace); completed.push(phase);
    phase = "users"; const users = initUsersConfig({ workspace, ...selectedOwner }); completed.push(phase);
    const paths = [toolsConfigPath(workspace), `${toolsConfigPath(workspace)}.sig`, join(workspace, ".amc", "amc.config.yaml"),
      join(workspace, ".amc", "amc.config.yaml.sig"), users.path, users.sigPath, ...(firewall === null ? [] : [firewall.path, firewall.signaturePath, firewall.checkpointPath])];
    if (kind === "coding") {
      phase = "action-policy"; const action = await initActionPolicyAsync(workspace, codingActionPolicy()); completed.push(phase);
      paths.push(action.policyPath, action.signaturePath);
    }
    phase = "approval-policy"; const approval = initApprovalPolicy(workspace, kind === "coding" ? codingApprovalPolicy() : undefined);
    completed.push(phase); paths.push(approval.path, approval.sigPath);
    let presetsCurrent = () => {};
    const sources = captureOrgFiles(paths), stable = () => { inputs?.(); original(); assertOrgPairsCurrent(sources); presetsCurrent(); };
    if (kind === "regulated") {
      phase = "presets";
      const presets = await preparePresetsAsync(workspace, [{ id: "regulated", description: "Regulated starter (amc init --regulated): every tool call waits for a "
        + "signed human approval decided under the WRITE_HIGH rule. The stub provider is a synthetic demonstration; name your own provider and model.",
      model: STUB_PROVIDER_MODEL, providerId: STUB_PROVIDER_ID, tools: "workspace", approveTools: "WRITE_HIGH" }], { beforePublish: original, assertInputsCurrent: stable });
      presets.publish(); presetsCurrent = presets.assertCurrent; completed.push(phase);
    }
    stable(); phase = "report-and-control-plan";
    return starterReport(workspace, kind, firewallMode, users.owner);
  } catch (cause) { throw new StarterProfilePublicationError(Object.freeze([...completed]), phase, cause); }
}

async function promptSecret(message: string, problem: (value: string) => string | null): Promise<string> {
  const ask = async (prompt: string): Promise<string> => (await inquirer.prompt<{ value: string }>([{ type: "password", name: "value",
    message: prompt, mask: "*", validate: (v: string) => problem(v) ?? true }])).value;
  const first = await ask(message);
  if (first !== await ask(`${message} (again)`)) throw new Error(`${message}: the two entries differ; nothing was written.`);
  return first;
}

/** The vault passphrase and the owner's credentials, from the operator: the environment they set, or a prompt. */
async function starterSecrets(kind: StarterProfileKind): Promise<StarterOwner> {
  const interactive = process.stdin.isTTY === true;
  if (!process.env.AMC_VAULT_PASSPHRASE) {
    if (!interactive) throw new Error(passphraseRefusal(kind));
    process.env.AMC_VAULT_PASSPHRASE = await promptSecret("Vault passphrase", (v) => v.length >= MIN_SECRET ? null : `At least ${MIN_SECRET} characters`);
  }
  let username = readSecretFromEnvOrFile(process.env, "AMC_BOOTSTRAP_OWNER_USERNAME");
  let password = readSecretFromEnvOrFile(process.env, "AMC_BOOTSTRAP_OWNER_PASSWORD");
  if ((username === null || password === null) && !interactive) {
    throw new Error("The workspace owner's Studio login comes from you: set AMC_BOOTSTRAP_OWNER_USERNAME and AMC_BOOTSTRAP_OWNER_PASSWORD "
      + "(or their _FILE variants), or run interactively.");
  }
  username ??= (await inquirer.prompt<{ value: string }>([{ type: "input", name: "value", message: "Owner username",
    default: userInfo().username }])).value.trim();
  if (!username) throw new Error("The owner username cannot be empty.");
  const owner = username;
  password ??= await promptSecret(`Studio password for ${owner}`, (v) => passwordPolicyProblem(v, owner));
  // The policy initUsersConfig applies, checked before anything is written (skeptic SK-5).
  const refused = passwordPolicyProblem(password, owner);
  if (refused !== null) throw new Error(`The owner's Studio password is refused: ${refused}; nothing was written.`);
  return { username, password };
}

function printReport(workspace: string, report: StarterProfileReport): void {
  const { readiness, plan } = report;
  const signed = report.kind === "regulated" ? "tools.yaml, budgets, config, users.yaml, approval policy and agents.yaml" : "tools.yaml, budgets, config and users.yaml";
  console.log(`Starter profile: ${report.kind} (firewall ${report.firewallMode}; ${signed} signed)`);
  console.log(`Owner: ${report.owner.username} (ACTIVE OWNER in the signed users.yaml)`);
  console.log(readiness.ready ? "Readiness: ready" : `Readiness: not ready\n${readiness.blockers.map((b) => `  - ${b}`).join("\n")}`);
  console.log(`Action policy: ${readiness.actionPolicy}`);
  console.log(`Shell: ${readiness.shell.offered ? `offered, ${readiness.shell.boundary ?? "UNCONFINED"}` : "not offered"}${readiness.shell.reason ? ` (${readiness.shell.reason})` : ""}`);
  const reads = readiness.shell.boundary === "macos-seatbelt" ? "it can still read any file your user can, except credential folders and AMC's own files"
    : readiness.shell.boundary === "linux-bwrap" ? "it reads only the workspace and system files" : null;
  if (reads) {
    console.log(`  The shell writes only inside this folder (not .amc) and has no network; ${reads}. To let it reach a host, add the host`
      + " under bash, nativeSandbox, egress, allowHosts in .amc/tools.yaml, then run: amc tools sign");
  }
  console.log(`Monitor key fingerprint (record it outside the workspace; verification pins it): ${report.monitorFingerprint}`);
  console.log(`  export AMC_EXPECTED_MONITOR_FINGERPRINT=${report.monitorFingerprint}`);
  if (plan) {
    const facts = [...new Set(plan.unresolved.flatMap((r) => r.missingFacts))].join(", ");
    console.log(`Layer 0 control plan ${plan.status}, signed, not active: ${plan.applicable} controls apply`
      + (plan.unresolved.length ? `, ${plan.unresolved.length} wait for facts nobody stated (${facts})` : ""));
    console.log(`  Profile: ${relative(workspace, plan.profilePath)} (state the facts; nothing was guessed)`);
    console.log(`  Plan: ${relative(workspace, plan.outDir)}`);
    console.log("  To activate: amc catalog compile --profile <profile> --request-review; two OWNER or AUDITOR users other than the requester");
    console.log("  approve it (amc approvals approve); then amc catalog compile --profile <profile> --activate <approvalRequestId>.");
    console.log("  Once active, identity-binding (L0-IDN-01) refuses tool calls without a lease naming an active users.yaml user.");
    console.log("  CLI, SDK and ACP runs mint it for the active users.yaml user whose username is your OS account, else refuse");
    console.log(`  PRINCIPAL_UNRESOLVED; Studio tasks (amc up) carry one for their signed-in user, such as ${report.owner.username}.`);
    console.log("  Experimental: the Layer 0 controls are agent-drafted and not independently reviewed (D-08 is open); a plan is not a compliance claim.");
  }
  if (report.kind === "regulated") {
    console.log("Approvals: in a --preset regulated run every tool call waits for a signed approval under the WRITE_HIGH rule (two distinct");
    console.log("  APPROVER or OWNER users); add a reviewer with: amc user add --username <name> --role APPROVER");
  }
  console.log(`Next: ${report.nextCommand}`);
  console.log("  The stub provider is a synthetic demonstration: no model runs, and its output is never a real-model result.");
  console.log("  TypeScript SDK quickstart: docs/sdk/TYPESCRIPT_SDK.md");
}

/**
 * `amc init --coding|--regulated` in `workspace`. A new folder gets a new workspace. A folder bare `amc` set up moves to
 * the coding setup in place when a person says yes (UX-01, ./codingAdoption.ts). The operator's secrets are collected
 * first, so a refusal leaves an existing workspace untouched; only then does `force` delete .amc, as `amc init --force` does.
 * Returns null when the person said no.
 */
export async function runStarterInit(workspace: string, kind: StarterProfileKind, force = false, webHosts: readonly string[] = []): Promise<StarterProfileReport | null> {
  const amcDir = join(workspace, ".amc");
  if (kind === "coding" && !force && pathExists(amcDir)) return adoptCodingSetup(workspace, webHosts);
  const owner = await starterSecrets(kind);
  if (force) refuseForceOverCommittedKeys(workspace);
  if (force && pathExists(amcDir)) {
    rmSync(amcDir, { recursive: true, force: true });
    console.log("Removed existing .amc directory (--force mode)");
  }
  if (pathExists(amcDir)) {
    throw new Error(`${workspace} already has an .amc directory; a starter profile initializes a new workspace (--force deletes .amc first).`);
  }
  let initialized = false;
  try {
    initWorkspace({ workspacePath: workspace }); initialized = true;
    const report = await applyStarterProfileAsync(workspace, kind, owner, webHosts);
    printReport(workspace, report); return report;
  } catch (cause) { throw new StarterProfilePublicationError(Object.freeze(initialized ? ["workspace-initialized"] : []), "starter-init", cause); }
}

/**
 * UX-29: `--force` deleted .amc and then failed with ROLLBACK_DETECTED wherever this machine committed the folder's key
 * set, so it destroyed the records and left a folder AMC refuses to set up. That refusal is anti-rollback (P1-08,
 * docs/KEY_LIFECYCLE.md "Anti-rollback"): a workspace that comes back with new keys is what a swap looks like. So --force
 * is refused there before anything is deleted.
 */
export function refuseForceOverCommittedKeys(workspace: string): void {
  if (!pathExists(join(workspace, ".amc")) || keysetAnchoring(workspace).state !== "committed") return;
  throw new Error("--force would delete .amc here, and then AMC could not set this folder up again: this computer remembers that the "
    + "folder had signing keys and refuses new ones in their place, because that is what a swapped workspace looks like. Nothing was deleted. "
    + "To move a folder the amc menu set up to the coding setup, run amc init --coding without --force. To start over, use a new folder.");
}

/** UX-01: the coding setup over a workspace bare `amc` made, keeping its keys, evidence and history. */
async function adoptCodingSetup(workspace: string, webHosts: readonly string[]): Promise<StarterProfileReport | null> {
  const adoption = await prepareCodingAdoption(workspace);
  if (adoption === null) return null;
  const owner = await starterSecrets("coding");
  sealAdoptionPassphrase(workspace, adoption);
  const report = await applyStarterProfileAsync(workspace, "coding", owner, webHosts, { keepFirewall: adoption.keepFirewall });
  recordCodingAdoption(workspace, owner.username, adoption);
  printReport(workspace, report);
  return report;
}

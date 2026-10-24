import { mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { captureConfigSignatureAuthority, captureRawConfigPair, ConfigSignaturePublicationError, withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { assertOwnerMode } from "../mode/mode.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { defaultTargetMapping } from "../targets/targetProfile.js";
import { prepareTargetProfileSignatureAsync } from "../targets/targetProfilePublication.js";
import type { RiskTier } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { AgentConfig } from "./registry.js";
import { currentAgentPath, getAgentPaths, normalizeAgentId } from "./paths.js";

export function defaultAgentArtifactBodies(paths: ReturnType<typeof getAgentPaths>) {
  return [
    { path: paths.guardrails, bytes: Buffer.from(YAML.stringify({
      honesty: { requireKnownUnknownAssumptions: true, requireEvidenceRefs: true },
      compliance: { requireConsentForSensitive: true, requireAuditEvents: true },
      verification: { requireTestsForHighRisk: true },
      thresholds: { minIntegrityIndex: 0.6 }
    })) },
    { path: paths.promptAddendum, bytes: Buffer.from([
      "# AMC Prompt Addendum", "", "Use this structure for material outputs:",
      "1) Known facts [ev:<id>]", "2) Unknowns", "3) Assumptions", "4) Verification plan", "5) Escalation checkpoints"
    ].join("\n")) },
    { path: paths.evalHarness, bytes: Buffer.from(YAML.stringify({ suites: [
      { name: "truthfulness", checks: ["evidence-link", "uncertainty-label"] },
      { name: "compliance", checks: ["consent-required", "policy-refusal"] },
      { name: "verification", checks: ["test-evidence", "reproducibility"] }
    ] })) }
  ];
}

export function defaultAgentContextGraph(params: {
  agentName: string;
  role: string;
  domain: string;
  primaryTasks: string[];
  stakeholders: string[];
  riskTier: RiskTier;
}): Record<string, unknown> {
  return {
    mission: `${params.agentName} (${params.role}) delivers reliable outcomes in ${params.domain}.`,
    successMetrics: [
      "verified task completion",
      "low contradiction rate",
      "stakeholder trust growth"
    ],
    constraints: [
      "No fabricated evidence",
      "Respect role boundaries and approvals",
      "Minimize sensitive data exposure"
    ],
    forbiddenActions: [
      "exfiltrate secrets",
      "bypass policy checks",
      "perform irreversible high-risk actions without consent"
    ],
    riskTier: params.riskTier,
    escalationRules: [
      "Escalate when confidence is low for high-risk actions",
      "Escalate on policy conflicts",
      "Escalate when required evidence is missing"
    ],
    entities: [
      { id: "goal-1", type: "Goal", label: "Reliable verified outcomes" },
      { id: "stakeholder-1", type: "Stakeholder", label: params.stakeholders.join(", ") },
      { id: "risk-1", type: "RiskTier", label: params.riskTier },
      { id: "tool-1", type: "Tool", label: "gateway, supervised runtime" },
      { id: "policy-1", type: "Policy", label: "Evidence-gated scoring" },
      { id: "constraint-1", type: "Constraint", label: "No unsupported claims" }
    ]
  };
}

export interface AgentScaffoldResult {
  agentId: string; rootDir: string; targetPath: string; configPath: string; configSigPath: string;
}
export interface AgentScaffoldOptions { beforePublish?: () => void }
/** A returned native write is recorded before acknowledgment; failures do not roll back earlier members. */
export class AgentScaffoldPublicationError extends Error {
  readonly code = "AGENT_SCAFFOLD_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly createdDirectories: readonly string[], readonly attemptedPath: string | null, cause: unknown) {
    super("agent scaffold publication is incomplete; inspect committed members and directories before retrying", { cause });
    this.name = "AgentScaffoldPublicationError";
  }
}
interface Directory { path: string; identity: string | null; mode: number | null }
function readDirectory(path: string): Directory {
  try {
    const current = statSync(path);
    if (!current.isDirectory()) throw new Error("agent scaffold parent is not a directory");
    return { path, identity: `${current.dev}:${current.ino}`, mode: current.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, identity: null, mode: null };
    throw error;
  }
}
function directoryPlan(workspace: string, paths: ReturnType<typeof getAgentPaths>) {
  const root = resolve(workspace), ordered = new Set<string>([root]);
  for (const path of [paths.rootDir, paths.targetsDir, paths.runsDir, paths.reportsDir, paths.bundlesDir]) {
    const chain: string[] = [];
    for (let next = resolve(path); next !== root; next = dirname(next)) {
      if (dirname(next) === next) throw new Error("agent scaffold directory is outside the selected workspace");
      chain.push(next);
    }
    for (const path of chain.reverse()) ordered.add(path);
  }
  return new Map([...ordered].map(path => [path, readDirectory(path)]));
}
function assertDirectoriesCurrent(expected: ReadonlyMap<string, Directory>): void {
  for (const previous of expected.values()) {
    const current = readDirectory(previous.path);
    if (current.identity !== previous.identity || current.mode !== previous.mode)
      throw new Error("agent scaffold directory selection changed while preparing publication");
  }
}
function acknowledgeFile(expected: Map<string, OrgPairsSnapshot["members"][number]>, path: string, bytes: Buffer) {
  const own = captureOrgFiles([path]).members[0];
  if (own === undefined || own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(bytes))
    throw new Error("agent scaffold member differs from its exact prepared bytes or mode");
  if (!expected.has(path)) throw new Error("agent scaffold member was not part of the original attempt");
  expected.set(path, own);
}
/** Only this actual constructor can create its continuation handle. No injected prepared signer or publication capability. */
async function prepareAndPublishScaffold(workspace: string, input: AgentConfig, options: AgentScaffoldOptions) {
  const config = structuredClone(input), beforePublish = options.beforePublish;
  beforePublish?.();
  const paths = getAgentPaths(workspace, config.id), selectedPaths = canonicalize(paths);
  const original = captureConfigSignatureAuthority(workspace);
  const targetPath = join(paths.targetsDir, "default.target.json"), artifacts = defaultAgentArtifactBodies(paths);
  const previous = captureOrgFiles([paths.contextGraph, ...artifacts.map(row => row.path), targetPath]);
  const expected = new Map(previous.members.map(row => [row.path, row]));
  const directories = directoryPlan(workspace, paths), directoryMode = 0o777 & ~process.umask();
  const previousConfig = captureOrgPairs([paths.agentConfig]);
  const contextBefore = orgPairBytes(previous, paths.contextGraph);
  const contextBytes = contextBefore ?? Buffer.from(JSON.stringify(defaultAgentContextGraph(config), null, 2));
  // Parse and hash the SAME selected bytes. No second read may silently select another context graph.
  const contextHash = sha256Hex(canonicalize(JSON.parse(contextBytes.toString("utf8")) as unknown));
  let targetCurrent: (() => void) | null = null;
  const currentExpected = (): OrgPairsSnapshot => ({ members: [...expected.values()] });
  const assertStable = () => {
    beforePublish?.(); original.assertCurrent();
    if (canonicalize(getAgentPaths(workspace, config.id)) !== selectedPaths)
      throw new Error("agent scaffold path selection changed while preparing publication");
    if ((0o777 & ~process.umask()) !== directoryMode) throw new Error("original scaffold directory mode changed while preparing publication");
    targetCurrent?.(); assertOrgPairsCurrent(currentExpected()); assertDirectoriesCurrent(directories);
  };
  assertStable();
  // Capture BOTH actual purpose authorities and all old targets before the first provider await.
  // This callback contains no stale own agent-pair target; C8 owns that pair's expected-state transition.
  const configAttempt = captureRawConfigPair(workspace, paths.agentConfig, Buffer.from(YAML.stringify(config)), {
    previous: previousConfig, beforePublish: assertStable
  });
  const target = await prepareTargetProfileSignatureAsync({ workspace, name: "default", contextGraphHash: contextHash,
    mapping: defaultTargetMapping(3) }, () => { assertStable(); configAttempt.assertInputsCurrent(); });
  targetCurrent = target.assertCurrent;
  assertStable(); configAttempt.assertInputsCurrent();
  const preparedConfig = await configAttempt.prepare();
  const beforeMember = () => {
    // Actual caller -> original authorities -> all remaining/acknowledged destinations, with CAS last.
    preparedConfig.assertCurrent(); assertOrgPairsCurrent(currentExpected()); assertDirectoriesCurrent(directories);
  };
  beforeMember();
  const publishedPaths: string[] = [], createdDirectories: string[] = [];
  let attemptedPath: string | null = null;
  const fail = (cause: unknown): never => {
    if (cause instanceof ConfigSignaturePublicationError) {
      publishedPaths.push(...cause.publishedPaths); attemptedPath = cause.attemptedPath;
    }
    if (publishedPaths.length === 0 && createdDirectories.length === 0 && attemptedPath === null) throw cause;
    throw new AgentScaffoldPublicationError(Object.freeze([...publishedPaths]), Object.freeze([...createdDirectories]), attemptedPath, cause);
  };
  const writeMember = (path: string, bytes: Buffer) => {
    attemptedPath = null; beforeMember(); attemptedPath = path;
    writeFileAtomic(path, bytes, 0o644); publishedPaths.push(path);
    acknowledgeFile(expected, path, bytes); attemptedPath = null;
  };
  try {
    // No signing or await under this short common lock. C8's own later pair publication takes its own lock.
    withConfigSignaturePairLock(workspace, () => {
      for (const [path, previous] of directories) {
        if (previous.identity !== null) continue;
        attemptedPath = null; beforeMember(); attemptedPath = path;
        mkdirSync(path, { mode: 0o777 }); createdDirectories.push(path);
        const own = readDirectory(path);
        if (own.identity === null || own.mode !== directoryMode) throw new Error("created scaffold directory differs from its prepared mode");
        directories.set(path, own); attemptedPath = null;
      }
      if (contextBefore === null) writeMember(paths.contextGraph, contextBytes);
      for (const row of artifacts) if (orgPairBytes(previous, row.path) === null) writeMember(row.path, row.bytes);
      writeMember(targetPath, target.bytes);
      attemptedPath = null; beforeMember();
    });
    attemptedPath = null;
    const saved = preparedConfig.publish();
    // C8 already checked each exact own body/sidecar and retained its inside-lock identities.
    publishedPaths.push(saved.path, saved.sigPath);
    beforeMember();
    const result: AgentScaffoldResult = { agentId: config.id, rootDir: paths.rootDir, targetPath,
      configPath: saved.path, configSigPath: saved.sigPath };
    return Object.freeze({ result: Object.freeze(result), assertCurrent: beforeMember,
      publishedPaths: Object.freeze([...publishedPaths]), createdDirectories: Object.freeze([...createdDirectories]) });
  } catch (cause) { return fail(cause); }
}
/** Additive async sibling; the existing sync scaffold and its bootstrap callers retain their contracts. */
export async function scaffoldAgentAsync(workspace: string, config: AgentConfig, options: AgentScaffoldOptions = {}): Promise<AgentScaffoldResult> {
  return (await prepareAndPublishScaffold(workspace, config, options)).result;
}
/** Internal actual agent-add continuation. The input snapshot can only refuse a changed original selection. */
export async function scaffoldAgentForAddAsync(workspace: string, input: AgentConfig, stableInputs: () => void, previousSelection: OrgPairsSnapshot): Promise<AgentScaffoldResult> {
  const config = structuredClone(input), selectionPath = currentAgentPath(workspace);
  const selected = previousSelection.members.filter(row => row.path === selectionPath);
  if (selected.length !== 1) throw new Error("original agent-add selection was not captured");
  let expectedSelection: OrgPairsSnapshot = { members: selected.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
  const assertCurrent = () => { stableInputs(); assertOwnerMode(workspace, "agent add"); assertOrgPairsCurrent(expectedSelection); };
  assertCurrent();
  const scaffold = await prepareAndPublishScaffold(workspace, config, { beforePublish: assertCurrent });
  let attemptedPath: string | null = null;
  const publishedPaths = [...scaffold.publishedPaths], bytes = Buffer.from(`${normalizeAgentId(config.id)}\n`);
  try {
    withConfigSignaturePairLock(workspace, () => {
      scaffold.assertCurrent(); assertOrgPairsCurrent(expectedSelection);
      attemptedPath = selectionPath;
      // Literal setCurrentAgent recipe; the scaffold already established the selected fleet root.
      writeFileAtomic(selectionPath, bytes, 0o644); publishedPaths.push(selectionPath);
      const own = new Map(expectedSelection.members.map(row => [row.path, row]));
      acknowledgeFile(own, selectionPath, bytes);
      expectedSelection = { members: [...own.values()] }; attemptedPath = null;
      scaffold.assertCurrent(); assertOrgPairsCurrent(expectedSelection);
    });
    return scaffold.result;
  } catch (cause) {
    throw new AgentScaffoldPublicationError(Object.freeze(publishedPaths), scaffold.createdDirectories, attemptedPath, cause);
  }
}

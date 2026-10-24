import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { assuranceLatestCertificatePath } from "../assurance/assurancePolicyStore.js";
import { binderCachePath } from "../audit/binderStore.js";
import { benchExportsDir } from "../bench/benchPolicyStore.js";
import { canonPath } from "../canon/canonLoader.js";
import { cgxLatestGraphPath, cgxLatestPackPath } from "../cgx/cgxStore.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { agentRunFiles } from "../diagnostic/runReportResolution.js";
import { getAgentPaths } from "../fleet/paths.js";
import { forecastScopeLatestPath } from "../forecast/forecastStore.js";
import { assertKeysetComplete, keysetFileRel, keysetPaths } from "../keys/keyset.js";
import { leaseRevocationPaths } from "../leases/leaseStore.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { assertOrgPairsCurrent, captureOrgFiles } from "../org/preparedOrgPairs.js";
import { installedPluginsLockSchema } from "../plugins/pluginRegistrySchema.js";
import { promptLatestPackPath, promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { captureTransparencyState, assertTransparencyStateCurrent } from "../transparency/workspacePublication.js";
import { valueSnapshotLatestPath } from "../value/valueStore.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { canonicalize } from "../utils/json.js";
import { collectPassportDataForPublication } from "./passportCollector.js";
import type { PassportPolicy } from "./passportPolicySchema.js";

function benchCandidates(root: string): string[] {
  try { return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? benchCandidates(join(root, entry.name))
    : entry.isFile() && entry.name.endsWith(".amcbench") ? [join(root, entry.name)] : []).sort(); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return []; throw cause; }
}
/** Finite workspace paths actually read by the maintained collection/authority recipes, not a recursive workspace scan. */
function usedPaths(workspace: string, scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string, policy: PassportPolicy) {
  const diagnosticAgent = scopeType === "AGENT" ? scopeId : "default", scope = { type: scopeType, id: scopeId }, fallback = { type: "WORKSPACE" as const, id: "workspace" };
  const pairs = ["passport/policy.yaml", "bridge.yaml", "tools.yaml", "approval-policy.yaml", "plugins/registries.yaml", "plugins/overrides.yaml", "plugins/installed.lock.json", "trust.yaml", "amc.config.yaml"].flatMap(rel => [join(workspace, ".amc", rel), join(workspace, ".amc", `${rel}.sig`)]);
  const keyset = assertKeysetComplete(workspace), paths = [...pairs, ...Object.values(leaseRevocationPaths(workspace)),
    ...agentRunFiles(workspace, diagnosticAgent), ...benchCandidates(benchExportsDir(workspace)),
    forecastScopeLatestPath(workspace, scope), valueSnapshotLatestPath(workspace, scope), valueSnapshotLatestPath(workspace, fallback),
    binderCachePath(workspace, scopeType, scopeId), binderCachePath(workspace, "WORKSPACE", "workspace"),
    ...["agent.config.yaml", "context-graph.json", "agents/default/agent.config.yaml", "agents/default/context-graph.json"].map(rel => join(workspace, ".amc", rel)),
    canonPath(workspace), diagnosticBankPath(workspace), assuranceLatestCertificatePath(workspace), promptLatestPackPath(workspace, diagnosticAgent),
    scopeType === "AGENT" ? cgxLatestPackPath(workspace, scopeId) : cgxLatestGraphPath(workspace, { type: "workspace", id: "workspace" }),
    keysetPaths(workspace).keyset, keysetPaths(workspace).pending, join(workspace, ".amc", "keys", "revocations.signed.json"), join(workspace, ".amc", "keys", "revocations.signed.json.pending"),
    join(workspace, ".amc", "vault.amcvault"), ...(keyset === null ? [] : Object.keys(keyset.files).map(rel => join(workspace, keysetFileRel(rel))))];
  if (policy.passportPolicy.contents.includeMechanicTargetsHashOnly) paths.push(mechanicTargetsPath(workspace));
  try {
    const lock = installedPluginsLockSchema.parse(JSON.parse(readFileSync(join(workspace, ".amc", "plugins", "installed.lock.json"), "utf8")));
    for (const row of lock.installed) paths.push(join(workspace, ".amc", "plugins", "installed", row.id, row.version, "package.amcplug"));
  } catch { /* The collector's existing verifier determines the invalid/missing lock summary. Its raw lock is still pinned. */ }
  return [...new Set(paths)].sort();
}
export function capturePassportCollection(params: { workspace: string; scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string; policy: PassportPolicy }, generatedTs: number) {
  const input = structuredClone(params), selected = usedPaths(input.workspace, input.scopeType, input.scopeId, input.policy), raw = captureOrgFiles(selected);
  const diagnosticAgent = input.scopeType === "AGENT" ? input.scopeId : "default", agentPaths = getAgentPaths(input.workspace, diagnosticAgent);
  const selectedAgentPaths = canonicalize(agentPaths), proofState = captureTransparencyState(input.workspace, true);
  const local = collectPassportDataForPublication(input, generatedTs), original = canonicalize(local);
  const knownInputPaths = [...selected, promptPolicyPath(input.workspace), `${promptPolicyPath(input.workspace)}.sig`, ...proofState.keys()];
  // Actual caller authority remains in its negative callback. Protect these source paths against outputs without a raw authority/session inventory CAS.
  const authorityPaths = ["mode.json", "users.yaml", "users.yaml.sig", "keys/session.pub", "keys/session_ed25519.pub", "keys/session_history.json", "keys/config-signature.pub", "keys/config-signature_history.json"]
    .map(path => join(input.workspace, ".amc", path));
  const sessionsRoot = join(input.workspace, ".amc", "studio", "sessions"), defaultAgentRoot = join(input.workspace, ".amc", "agents", "default");
  const roots = [benchExportsDir(input.workspace), agentPaths.runsDir, defaultAgentRoot, sessionsRoot];
  const physicalInputs = new Map([...new Set([...knownInputPaths, ...authorityPaths, ...roots])].map(path => [path, physicalPathWithMissingSuffix(path)]));
  const assertPhysicalInputs = () => { for (const [path, expected] of physicalInputs) if (physicalPathWithMissingSuffix(path) !== expected)
    throw new Error("passport protected input or namespace physical selection changed while signing"); };
  let physicalOutputs: ReadonlyMap<string, string> | null = null;
  const assertCurrent = () => {
    assertPhysicalInputs();
    if (JSON.stringify(usedPaths(input.workspace, input.scopeType, input.scopeId, input.policy)) !== JSON.stringify(selected)) throw new Error("passport selected input paths changed while signing");
    if (canonicalize(getAgentPaths(input.workspace, diagnosticAgent)) !== selectedAgentPaths) throw new Error("passport diagnostic agent selection changed while signing");
    assertOrgPairsCurrent(raw);
    if (canonicalize(collectPassportDataForPublication(input, generatedTs)) !== original) throw new Error("passport consumed collection changed while signing");
    assertOrgPairsCurrent(raw);
  };
  assertCurrent(); assertTransparencyStateCurrent(proofState);
  return { local, proofState, assertCurrent, assertProofCurrent() { assertTransparencyStateCurrent(proofState); }, assertNoOutputAliases(outputs: readonly string[]) {
    assertPhysicalInputs();
    if (new Set(outputs.map(path => resolve(path))).size !== outputs.length) throw new Error("passport destinations alias one another");
    if (physicalOutputs === null) physicalOutputs = new Map(outputs.map(path => [path, physicalPathWithMissingSuffix(path)]));
    if (physicalOutputs.size !== outputs.length || outputs.some(path => !physicalOutputs!.has(path))) throw new Error("passport output selection changed while signing");
    for (const [path, expected] of physicalOutputs) if (physicalPathWithMissingSuffix(path) !== expected) throw new Error("passport output physical selection changed while signing");
    if (new Set(physicalOutputs.values()).size !== outputs.length) throw new Error("passport destinations physically alias one another");
    const inside = (root: string, path: string) => { const rel = relative(resolve(root), resolve(path)); return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`)); };
    for (const path of outputs) {
      const physical = physicalOutputs.get(path)!;
      if ([...physicalInputs].some(([source, selected]) => !roots.includes(source) && selected === physical)) throw new Error("passport output physically aliases a known consumed or authority input");
      if (inside(physicalInputs.get(sessionsRoot)!, physical)) throw new Error("passport output enters the actual Studio session authority namespace");
      if ((inside(physicalInputs.get(benchExportsDir(input.workspace))!, physical) && physical.endsWith(".amcbench"))
        || (inside(physicalInputs.get(agentPaths.runsDir)!, physical) && physical.endsWith(".json"))) throw new Error("passport destination physically enters an actually consumed candidate selector");
      if ((inside(benchExportsDir(input.workspace), path) && path.endsWith(".amcbench"))
        || (inside(agentPaths.runsDir, path) && path.endsWith(".json"))) throw new Error("passport destination enters an actually consumed candidate selector");
      if (!agentPaths.scoped && diagnosticAgent === "default" && (inside(defaultAgentRoot, path) || inside(physicalInputs.get(defaultAgentRoot)!, physical))
        && raw.members.filter(row => row.path === join(input.workspace, ".amc", "agent.config.yaml") || row.path === join(input.workspace, ".amc", "context-graph.json")).every(row => row.bytes === null))
        throw new Error("passport destination would change the original default-agent path selection");
    }
    const inputs = captureOrgFiles(knownInputPaths), targets = captureOrgFiles(outputs);
    for (const target of targets.members) for (const source of inputs.members) if (resolve(target.path) === resolve(source.path)
      || (target.identity !== null && target.identity === source.identity)) throw new Error("passport output aliases a known consumed input");
    const authorityIdentities = authorityPaths.flatMap(path => { try { const row = statSync(path); return [`${row.dev}:${row.ino}`]; }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return []; throw cause; } });
    for (const target of targets.members) if (target.identity !== null && authorityIdentities.includes(target.identity)) throw new Error("passport output hardlinks a known caller authority input");
    assertPhysicalInputs();
    for (let i = 0; i < targets.members.length; i += 1) for (let j = i + 1; j < targets.members.length; j += 1)
      if (targets.members[i]!.identity !== null && targets.members[i]!.identity === targets.members[j]!.identity) throw new Error("passport destinations share an existing identity");
  } };
}

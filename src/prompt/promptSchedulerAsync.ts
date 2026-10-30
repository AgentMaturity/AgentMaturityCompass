import YAML from "yaml";
import { listAgents } from "../fleet/registry.js";
import { resolveAgentId } from "../fleet/paths.js";
import { canonicalize } from "../utils/json.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, captureOrgPairsAuthority, prepareOrgPairsAsync, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { defaultPromptSchedulerState, promptSchedulerStateSchema, promptPolicySchema } from "./promptPolicySchema.js";
import { promptPolicyPath, promptSchedulerPath } from "./promptPolicyStore.js";
import { buildPromptPackForApiAsync } from "./promptPackAsync.js";
function agents(workspace: string): string[] {
  try { return [...new Set(["default", ...listAgents(workspace).map(row => row.id)])].sort((a, b) => a.localeCompare(b)); }
  catch { return ["default"]; }
}
class PromptSchedulerPublicationError extends Error {
  readonly code = "PROMPT_SCHEDULER_INCOMPLETE";
  constructor(readonly completedBuilds: readonly {agentId:string;packId:string;sha256:string;lint:string}[], cause: unknown) {
    super("prompt scheduler did not complete; successful pack, log and scheduler effects are retained", { cause }); this.name = "PromptSchedulerPublicationError";
  }
}
export async function promptSchedulerRunNowForApiAsync(params: {workspace:string;agent:string|"all"}, options: OrgPairsOptions = {}) {
  options = { ...options };
  const workspace = params.workspace, agent = params.agent, selectedAgents = agent === "all" ? agents(workspace) : [resolveAgentId(workspace, agent)];
  const policyPath = promptPolicyPath(workspace), statePath = promptSchedulerPath(workspace), before = captureOrgPairs([policyPath, statePath]);
  const bytes = orgPairBytes(before, policyPath), sig = orgPairBytes(before, `${policyPath}.sig`);
  const admission = bytes === null || sig === null ? {valid:false,reason:"signature missing"} : verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, sig);
  if (!admission.valid || bytes === null) throw new Error(`prompt policy signature invalid: ${admission.reason ?? "unknown"}`);
  const policy = promptPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown), stateBytes = orgPairBytes(before, statePath);
  const state = stateBytes === null ? defaultPromptSchedulerState() : promptSchedulerStateSchema.parse(JSON.parse(stateBytes.toString("utf8")) as unknown);
  const original = captureOrgPairsAuthority(workspace, options.beforePublish), assertInputs = options.assertInputsCurrent;
  const stablePolicy = { members: before.members.filter(row => row.path === policyPath || row.path === `${policyPath}.sig`) };
  const assertStable = () => { original(); assertOrgPairsCurrent(stablePolicy);
    if (agent === "all" && canonicalize(agents(workspace)) !== canonicalize(selectedAgents)) throw new Error("selected prompt scheduler agents changed while preparing"); };
  const assertCurrent = () => { assertInputs?.(); assertStable(); assertOrgPairsCurrent(before); };
  const built: {agentId:string;packId:string;sha256:string;lint:string}[] = [];
  try {
    for (const agentId of selectedAgents) { assertCurrent();
      const row = await buildPromptPackForApiAsync({workspace, agentId}, {beforePublish:assertCurrent});
      built.push({agentId:row.agentId,packId:row.pack.packId,sha256:row.sha256,lint:row.lint.status}); }
    assertCurrent(); const now = Date.now(), updated = promptSchedulerStateSchema.parse({...state,lastRefreshTs:now,
      nextRefreshTs:now + Math.max(1, policy.promptPolicy.recurrence.refreshCadenceHours) * 60 * 60 * 1000,lastOutcome:{status:"OK",reason:""}});
    const plan = await prepareOrgPairsAsync(workspace, [{path:statePath,bytes:Buffer.from(JSON.stringify(updated,null,2))}], {beforePublish:assertStable,assertInputsCurrent:assertCurrent}, before);
    plan.publish(); return {built,scheduler:updated};
  } catch(cause) { throw new PromptSchedulerPublicationError(Object.freeze([...built]), cause); }
}
export async function promptSchedulerTickAsync(params: {workspace:string;workspaceReady:boolean}, options: OrgPairsOptions = {}) {
  const workspace = params.workspace, ready = params.workspaceReady, path = promptSchedulerPath(workspace), previous = captureOrgPairs([path]);
  const bytes = orgPairBytes(previous,path), state = bytes === null ? defaultPromptSchedulerState() : promptSchedulerStateSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (!state.enabled) return {ran:false,reason:"disabled" as const};
  const policyPath = promptPolicyPath(workspace), policyPair = captureOrgPairs([policyPath]);
  const policyBytes = orgPairBytes(policyPair,policyPath), signature = orgPairBytes(policyPair,`${policyPath}.sig`);
  const admission = !ready ? {valid:true,reason:null} : policyBytes === null ? {valid:false,reason:"prompt policy missing"} : signature === null ? {valid:false,reason:"signature missing"} : verifyAuditorSignatureBytes(workspace,"BUNDLE",policyBytes,signature);
  const reason = !ready ? "workspace not ready" : !admission.valid ? `prompt policy invalid: ${admission.reason ?? "unknown"}` : null;
  if (reason !== null) {
    const stateNext = {...state,lastOutcome:{status:"ERROR" as const,reason}}, original = captureOrgPairsAuthority(workspace,options.beforePublish), inputs=options.assertInputsCurrent;
    const plan = await prepareOrgPairsAsync(workspace,[{path,bytes:Buffer.from(JSON.stringify(stateNext,null,2))}], {beforePublish:()=>{original();assertOrgPairsCurrent(policyPair);},assertInputsCurrent:inputs},previous);
    plan.publish(); return {ran:false,reason:!ready?"workspace_not_ready" as const:"policy_untrusted" as const};
  }
  if (state.nextRefreshTs && state.nextRefreshTs > Date.now()) return {ran:false,reason:"not_due" as const};
  const inputs = options.assertInputsCurrent;
  const result = await promptSchedulerRunNowForApiAsync({workspace,agent:"all"},{beforePublish:options.beforePublish,assertInputsCurrent:()=>{inputs?.();assertOrgPairsCurrent(previous);assertOrgPairsCurrent(policyPair);}});
  return {ran:true,built:result.built};
}

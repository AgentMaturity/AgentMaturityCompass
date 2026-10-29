import type { LessonTransferRequest } from "../learning/lessonProvenance.js";
import YAML from "yaml";
import { join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { canonPath } from "../canon/canonLoader.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, prepareOrgPairsAsync, captureOrgPairsAuthority, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { ensureCgxContextPackAsync } from "../cgx/cgxContextPack.js";
import { cgxLatestPackPath, cgxPolicyPath, defaultCgxPolicy, loadCgxPolicyAttemptAsync } from "../cgx/cgxStore.js";
import { cgxContextPackSchema } from "../cgx/cgxSchema.js";
import { defaultPromptPolicy, promptPolicySchema } from "./promptPolicySchema.js";
import { promptPolicyPath } from "./promptPolicyStore.js";
import { capturePromptCompilerFacts, compilePromptPackWithInputs } from "./promptCompiler.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export class PromptPackPreparationError extends Error {
  readonly code = "PROMPT_PACK_PREPARATION_INCOMPLETE";
  constructor(readonly completedPrerequisites: readonly string[], cause: unknown) {
    super("prompt preparation did not complete; successful prerequisite publications are retained", { cause }); this.name = "PromptPackPreparationError";
  }
}
export function promptCompilerInputPaths(workspace: string, agentId: string): string[] {
  return [promptPolicyPath(workspace), cgxLatestPackPath(workspace, agentId), cgxPolicyPath(workspace), getAgentPaths(workspace, agentId).agentConfig,
    join(workspace, ".amc", "bridge.yaml"), join(workspace, ".amc", "tools.yaml"), canonPath(workspace), diagnosticBankPath(workspace), mechanicTargetsPath(workspace)].flatMap(path => [path, `${path}.sig`]);
}
/** Internal actual builder preparation, with original authority before either cold signing prerequisite. */
export async function prepareCompiledPromptPackAsync(params: { workspace: string; agentId?: string; lessons?: LessonTransferRequest }, options: OrgPairsOptions = {}) {
  const input = { workspace: params.workspace, agentId: resolveAgentId(params.workspace, params.agentId ?? "default"), lessons: params.lessons === undefined ? undefined : structuredClone(params.lessons) };
  const original = captureOrgPairsAuthority(input.workspace, options.beforePublish), assertInputs = options.assertInputsCurrent;
  const policyPath = promptPolicyPath(input.workspace), cgxPath = cgxLatestPackPath(input.workspace, input.agentId);
  const initialPolicy = captureOrgPairs([policyPath]), initialCgx = captureOrgPairs([cgxPath]);
  const policyBefore = orgPairBytes(initialPolicy, policyPath), cgxBefore = orgPairBytes(initialCgx, cgxPath);
  const cgxPolicy = cgxPolicyPath(input.workspace), initialCgxPolicy = cgxBefore === null ? captureOrgPairs([cgxPolicy]) : null;
  let policyCurrent = () => assertOrgPairsCurrent(initialPolicy), cgxPolicyCurrent = () => {};
  const agentConfig = getAgentPaths(input.workspace, input.agentId).agentConfig;
  const sources = captureOrgPairs([agentConfig, join(input.workspace, ".amc", "bridge.yaml"),
    join(input.workspace, ".amc", "tools.yaml"), canonPath(input.workspace), diagnosticBankPath(input.workspace), mechanicTargetsPath(input.workspace)]);
  const facts = capturePromptCompilerFacts(input.workspace, input.agentId, input.lessons), selected = canonicalize(facts), completedPrerequisites: string[] = [];
  const stable = () => { assertInputs?.(); original();
    if (getAgentPaths(input.workspace, input.agentId).agentConfig !== agentConfig) throw new Error("selected prompt agent configuration path changed while preparing");
    if (canonicalize(capturePromptCompilerFacts(input.workspace, input.agentId, input.lessons)) !== selected) throw new Error("selected prompt compiler facts changed while preparing");
    assertOrgPairsCurrent(sources); };
  try {
    let policyBytes = policyBefore;
    if (policyBytes === null) {
      const bytes = Buffer.from(YAML.stringify(defaultPromptPolicy()));
      const prepared = await prepareOrgPairsAsync(input.workspace, [{ path: policyPath, bytes }], { beforePublish: original, assertInputsCurrent: stable }, initialPolicy);
      prepared.publish(); policyCurrent = prepared.assertCurrent; completedPrerequisites.push("prompt-policy"); policyBytes = bytes;
    }
    stable(); policyCurrent(); const policyPair = policyBefore === null ? captureOrgPairs([policyPath]) : initialPolicy;
    assertOrgPairsCurrent(policyPair);
    const body = orgPairBytes(policyPair, policyPath), signature = orgPairBytes(policyPair, `${policyPath}.sig`);
    if (body === null || !body.equals(policyBytes) || signature === null || !verifyAuditorSignatureBytes(input.workspace, "BUNDLE", body, signature).valid)
      throw new Error("selected prompt policy is not a trusted captured pair");
    const policy = promptPolicySchema.parse(YAML.parse(body.toString("utf8")) as unknown);
    assertOrgPairsCurrent(initialCgx);
    if (initialCgxPolicy !== null) {
      assertOrgPairsCurrent(initialCgxPolicy);
      const missing = orgPairBytes(initialCgxPolicy,cgxPolicy) === null;
      const policyAttempt = await loadCgxPolicyAttemptAsync(input.workspace, {beforePublish:original,assertInputsCurrent:()=>{stable();policyCurrent();assertOrgPairsCurrent(policyPair);assertOrgPairsCurrent(initialCgx);assertOrgPairsCurrent(initialCgxPolicy);}});
      if (!missing) assertOrgPairsCurrent(initialCgxPolicy);
      cgxPolicyCurrent = policyAttempt.assertCurrent;
      if (missing) completedPrerequisites.push("cgx-policy");
      cgxPolicyCurrent(); const selectedPolicy = captureOrgPairs([cgxPolicy]), selectedBytes = orgPairBytes(selectedPolicy,cgxPolicy), selectedSig = orgPairBytes(selectedPolicy,`${cgxPolicy}.sig`);
      const expected = missing ? Buffer.from(YAML.stringify(defaultCgxPolicy())) : orgPairBytes(initialCgxPolicy,cgxPolicy)!;
      if (selectedBytes === null || !selectedBytes.equals(expected) || selectedSig === null || !verifyAuditorSignatureBytes(input.workspace,"BUNDLE",selectedBytes,selectedSig).valid) throw new Error("selected CGX policy is not the trusted captured prerequisite");
      const capturedCurrent = cgxPolicyCurrent; cgxPolicyCurrent = () => {capturedCurrent();assertOrgPairsCurrent(selectedPolicy);};
    }
    stable(); policyCurrent(); cgxPolicyCurrent(); assertOrgPairsCurrent(initialCgx);
    const cgxPack = await ensureCgxContextPackAsync(input, { beforePublish: original, assertInputsCurrent: () => { stable(); policyCurrent(); cgxPolicyCurrent(); assertOrgPairsCurrent(policyPair); assertOrgPairsCurrent(initialCgx); } });
    if (cgxBefore === null) completedPrerequisites.push("cgx-context-pack");
    stable(); assertOrgPairsCurrent(policyPair);
    const cgxPair = cgxBefore === null ? captureOrgPairs([cgxPath]) : initialCgx; assertOrgPairsCurrent(cgxPair);
    const cgxBytes = orgPairBytes(cgxPair, cgxPath), cgxSignature = orgPairBytes(cgxPair, `${cgxPath}.sig`);
    if (cgxBytes === null || cgxSignature === null || !verifyAuditorSignatureBytes(input.workspace, "BUNDLE", cgxBytes, cgxSignature).valid
      || canonicalize(cgxContextPackSchema.parse(JSON.parse(cgxBytes.toString("utf8")))) !== canonicalize(cgxPack))
      throw new Error("selected CGX context pack changed or is not a trusted pair");
    const compiled = compilePromptPackWithInputs(input.workspace, input.agentId, policy, cgxPack, facts, sha256Hex(body));
    const assertCurrent = () => { stable(); policyCurrent(); cgxPolicyCurrent(); assertOrgPairsCurrent(policyPair); assertOrgPairsCurrent(cgxPair); };
    assertCurrent(); return { compiled, assertCurrent, completedPrerequisites: Object.freeze([...completedPrerequisites]) };
  } catch (cause) { throw new PromptPackPreparationError(Object.freeze([...completedPrerequisites]), cause); }
}

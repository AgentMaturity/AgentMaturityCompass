/** Private fixed instant snapshot producer; callbacks only add refusal to the actual maintained flow. */
import { join } from "node:path";
import { contextGraphSchema } from "../context/contextGraph.js";
import { getAgentPaths } from "../fleet/paths.js";
import { getWorkspacePaths, parseAMCConfigBytes } from "../workspace.js";
import { parseTargetProfileBytes, verifyTargetProfileSignature } from "../targets/targetProfile.js";
import { assertOrgPairsCurrent, captureOrgFiles, orgPairBytes } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { getQuestionSet } from "./questionSets.js";

/** Constructed before initialization waits; complete can only consume the genuinely completed attempt's negatives. */
export function captureInstantDiagnosticSnapshot(workspace: string, agentId: string, assertOriginal: () => void, assertCompleted: () => void) {
  assertOriginal();
  const paths = getAgentPaths(workspace, agentId), selection = canonicalize(paths);
  const originalQuestions = structuredClone(getQuestionSet({ workspace })), selectedQuestions = canonicalize(originalQuestions);
  const assertOriginalCurrent = () => {
    assertOriginal();
    if (canonicalize(getAgentPaths(workspace, agentId)) !== selection || canonicalize(getQuestionSet({ workspace })) !== selectedQuestions)
      throw new Error("original instant diagnostic selection or questions changed");
    assertOriginal();
  };
  let consumed = false;
  return Object.freeze({ assertOriginalCurrent, complete() {
    if (consumed) throw new Error("instant diagnostic snapshot has already been consumed"); consumed = true;
    assertOriginalCurrent(); assertCompleted(); assertOriginalCurrent();
    const targetFile = join(paths.targetsDir, "default.target.json"), configFile = getWorkspacePaths(workspace).config;
    const source = captureOrgFiles([paths.contextGraph, targetFile, configFile, `${configFile}.sig`]);
    const contextBytes = orgPairBytes(source, paths.contextGraph), targetBytes = orgPairBytes(source, targetFile), configBytes = orgPairBytes(source, configFile);
    if (contextBytes === null || targetBytes === null || configBytes === null) throw new Error("completed instant diagnostic member is missing");
    const rawContext = JSON.parse(contextBytes.toString("utf8")) as unknown, contextGraphHash = sha256Hex(canonicalize(rawContext));
    const contextGraph = contextGraphSchema.parse(rawContext), targetProfile = parseTargetProfileBytes(targetBytes), config = parseAMCConfigBytes(configBytes);
    const questionSet = structuredClone(originalQuestions);
    if (targetProfile.name !== "default" || targetProfile.contextGraphHash !== contextGraphHash || !verifyTargetProfileSignature(workspace, targetProfile))
      throw new Error("completed instant target does not match the actual context or current signer");
    const values = canonicalize({ contextGraph, targetProfile, config, questionSet });
    const assertCurrent = () => {
      assertOriginalCurrent(); assertCompleted(); assertOrgPairsCurrent(source);
      if (canonicalize({ contextGraph, targetProfile, config, questionSet }) !== values || !verifyTargetProfileSignature(workspace, targetProfile))
        throw new Error("completed instant diagnostic snapshot or target signer changed");
      assertOriginalCurrent();
    };
    assertCurrent();
    return Object.freeze({ contextGraph, targetProfile, targetSignatureValid: true, config, questionSet, assertCurrent });
  } });
}
export type InstantDiagnosticSnapshot = ReturnType<ReturnType<typeof captureInstantDiagnosticSnapshot>["complete"]>;

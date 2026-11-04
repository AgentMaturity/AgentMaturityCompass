/** Conservative strict-only preflight. Reuses public detectors/config; no protected data or opted-in
 * dataflow workspace is sent by this synthetic calibration client. Full native protected-data sessions
 * are a separate supported path; this refusal never claims BAA permission or complete PHI detection. */
import type { LLMRequest } from "../../eval/llmApiIntegration.js";
import { detectProtectedRequest } from "../../dataflow/detectors.js";
import { protectedDataOptedIn } from "../../dataflow/processorRegistry.js";
const known = ["JUDGE_WORKSPACE_REQUIRED", "JUDGE_PROTECTED_WORKSPACE_UNSUPPORTED", "JUDGE_PROTECTED_PAYLOAD_UNSUPPORTED"];
export function assertStrictJudgeRequest(workspace: string | undefined, request: LLMRequest): void {
  try {
    if (typeof workspace !== "string" || !workspace.trim()) throw new Error(known[0]);
    if (protectedDataOptedIn(workspace)) throw new Error(known[1]);
    const detection = detectProtectedRequest({ model: request.model,
      params: { temperature: request.temperature, max_tokens: request.maxTokens }, system: request.system ?? null,
      tools: null, messages: [{ role: "user", parts: [{ kind: "text", text: request.prompt }] }] });
    if (detection.classes.length !== 0) throw new Error(known[2]);
  } catch (error) {
    if (error instanceof Error && known.includes(error.message)) throw error;
    // Configuration/detection failures refuse without disclosing input text or host paths.
    throw new Error("JUDGE_PROTECTED_PREFLIGHT_UNAVAILABLE");
  }
}

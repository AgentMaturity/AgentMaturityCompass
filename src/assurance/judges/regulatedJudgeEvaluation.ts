/** Shared strict path for BOTH actual judge entry points. Legacy arithmetic never calls this. */
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { calibrationStanding, admitCapturedJudgeDecision, type AuthorizedCalibration,
  type OperatorCalibrationContext } from "./calibrationAuthority.js";
import { captureNativeJudgeCall } from "./regulatedJudgeRuntime.js";
import { judgeRefusalCode } from "./calibrationContract.js";
export interface RegulatedJudgeEvaluation {
  calibration: AuthorizedCalibration; operator: OperatorCalibrationContext;
  prompt: unknown; rubric: unknown; caseInput: unknown;
}
export async function evaluateRegulatedJudgment(input: RegulatedJudgeEvaluation) {
  const current = calibrationStanding(input.calibration, input.operator);
  if (current.state !== "eligible") return current;
  try {
    // Native runtime snapshots every transport value before await. The authority standing call below
    // reloads unchanged artifact bytes/current roster/author provenance/native trust/clock afterwards.
    const caseInput = JSON.parse(canonicalize(z.json().parse(input.caseInput))) as unknown;
    const expectedInputSha256 = sha256Hex(Buffer.from(canonicalize(caseInput), "utf8"));
    const call = await captureNativeJudgeCall({ workspace: input.operator.workspace, binding: current.binding,
      prompt: input.prompt, rubric: input.rubric, caseInput, purpose: "evaluation" });
    return admitCapturedJudgeDecision(input.calibration, call, input.operator, expectedInputSha256);
  } catch (error) {
    return { state: "not_evaluated" as const, reasons: [judgeRefusalCode(error, "JUDGE_CAPTURE_UNAVAILABLE")] };
  }
}

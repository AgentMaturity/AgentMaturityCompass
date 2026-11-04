/** Native transport only. No injected callback, client, endpoint, transport or reported-live flag. */
import { z } from "zod";
import { LLMApiClient, type LLMResponse } from "../../eval/llmApiIntegration.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize, assertNoDuplicateJsonKeys } from "../../utils/json.js";
import { judgeBindingSchema, promptDefinitionSchema, rubricDefinitionSchema, type JudgeBinding } from "./calibrationContract.js";
export interface CapturedJudgeCall { readonly requestSha256: string; readonly responseSha256: string }
export interface CapturedCallAudit {
  readonly workspace: string; readonly binding: JudgeBinding; readonly inputSha256: string; readonly pass: boolean;
  readonly purpose: "calibration" | "evaluation"; readonly evaluatedAt: string;
  readonly responseModel: string; readonly requestSha256: string; readonly responseSha256: string;
}
const captured = new WeakMap<CapturedJudgeCall, CapturedCallAudit>();
const used = new WeakSet<CapturedJudgeCall>();
const digest = (x: unknown): string => sha256Hex(Buffer.from(canonicalize(x), "utf8"));
const wireDigest = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
/** Only production code inside this module calls the native client. Tests mock native HTTP globally,
 * and must describe those executions as synthetic contract tests, never actual model measurements. */
export async function captureNativeJudgeCall(input: {
  workspace: string; binding: unknown; prompt: unknown; rubric: unknown; caseInput: unknown;
  purpose: "calibration" | "evaluation";
}): Promise<CapturedJudgeCall> {
  // Snapshot every caller-owned value before await. Circular/non-JSON values refuse.
  const workspace = z.string().min(1).refine(x => x.trim().length > 0).parse(input.workspace);
  const binding = judgeBindingSchema.parse(JSON.parse(canonicalize(input.binding)));
  const prompt = promptDefinitionSchema.parse(JSON.parse(canonicalize(input.prompt)));
  const rubric = rubricDefinitionSchema.parse(JSON.parse(canonicalize(input.rubric)));
  const caseInput = JSON.parse(canonicalize(z.json().parse(input.caseInput))) as unknown;
  const purpose = input.purpose;
  if (purpose !== "calibration" && purpose !== "evaluation") throw new Error("JUDGE_PURPOSE_INVALID");
  if (digest(prompt) !== binding.judge.promptSha256 || digest(rubric) !== binding.judge.rubricSha256) throw new Error("JUDGE_DEFINITION_CHANGED");
  const apiKey = binding.provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("JUDGE_CREDENTIALS_UNAVAILABLE");
  // Fixed official origins are the native client's defaults. No model aliases or endpoint override.
  const client = new LLMApiClient({ workspace, captureWire: true, provider: binding.provider, apiKey,
    timeout: 30000, maxRetries: 0, rateLimit: 60 });
  const request = Object.freeze({ model: binding.judge.model, temperature: binding.judge.temperature,
    maxTokens: 1000, system: `${prompt.system}\n${canonicalize(rubric)}\nReturn exactly {"pass":true} or {"pass":false}.`,
    prompt: prompt.userTemplate.replace("{{case}}", () => canonicalize(caseInput)) });
  // The native client supplies exact wire digests and the actual provider response model.
  const response: LLMResponse & { responseModel?: string | null; wireRequestSha256?: string; wireResponseSha256?: string } = await client.request(request);
  if (response.responseModel !== binding.judge.model) throw new Error("JUDGE_RESPONSE_MODEL_MISMATCH");
  if (!wireDigest(response.wireRequestSha256) || !wireDigest(response.wireResponseSha256)) throw new Error("JUDGE_WIRE_CAPTURE_MISSING");
  const decision: unknown = JSON.parse(response.text);
  assertNoDuplicateJsonKeys(response.text);
  if (decision === null || typeof decision !== "object" || Array.isArray(decision) ||
      Object.keys(decision).join(",") !== "pass" || typeof (decision as { pass?: unknown }).pass !== "boolean") throw new Error("JUDGE_OUTPUT_CONTRACT_INVALID");
  const token = Object.freeze({ requestSha256: response.wireRequestSha256, responseSha256: response.wireResponseSha256 });
  captured.set(token, Object.freeze({ workspace, binding: Object.freeze({ ...binding, judge: Object.freeze({ ...binding.judge }) }),
    purpose, inputSha256: digest(caseInput), pass: (decision as { pass: boolean }).pass,
    evaluatedAt: new Date().toISOString(), responseModel: response.responseModel,
    requestSha256: token.requestSha256, responseSha256: token.responseSha256 }));
  return token;
}
/** Read only; forged/copied/cast tokens have no entry. Never exports a constructor or mint callback. */
export function capturedJudgeCall(token: CapturedJudgeCall): CapturedCallAudit | null {
  return token !== null && typeof token === "object" ? captured.get(token) ?? null : null;
}
/** Reusing a completed call for another admission is refused. Calibration calls cannot be evaluation calls. */
export function consumeEvaluationCall(token: CapturedJudgeCall): CapturedCallAudit | null {
  const value = capturedJudgeCall(token);
  if (!value || value.purpose !== "evaluation" || used.has(token)) return null;
  used.add(token);
  return value;
}

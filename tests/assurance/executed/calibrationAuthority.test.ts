/** Synthetic crypto/HTTP contract checks. Fixture labels are not engaged humans or model measurements. */
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMJudge } from "../../../src/agents/llmJudge.js";
import { AMCJudgeTestRunner } from "../../../src/eval/amcJudgeIntegration.js";
import { ExtendedLLMJudgeEngine } from "../../../src/eval/extendedLLMJudge.js";
import * as protectedDetector from "../../../src/dataflow/detectors.js";
import { canonicalize } from "../../../src/utils/json.js";
import * as jsonUtils from "../../../src/utils/json.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { signHexDigest } from "../../../src/crypto/keys.js";
import { ed25519KeyId } from "../../../src/trust/trustList.js";
import { authorizeCalibrationBundle, calibrateOperatorJudge, calibrationStanding, admitCapturedJudgeDecision,
  type OperatorCalibrationContext, type AuthorizedCalibration } from "../../../src/assurance/judges/calibrationAuthority.js";
import { captureNativeJudgeCall, type CapturedJudgeCall } from "../../../src/assurance/judges/regulatedJudgeRuntime.js";
import type { JudgeBinding } from "../../../src/assurance/judges/calibrationContract.js";
import { NOW, keyA, keyB, keyC, keyLegal, AUTHOR, operatorHome, type Key, ROSTER } from "../../catalog/governance/reviewers.js";
const hash = (x: unknown): string => sha256Hex(Buffer.from(canonicalize(x), "utf8"));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { vi.unstubAllGlobals(); for (const path of roots) rmSync(path, { recursive: true, force: true }); });
const pins = [keyA, keyB, keyC, keyLegal].map((key, i) => ({ key,
  subject: ["fixture-reviewer-a", "fixture-reviewer-b", "fixture-reviewer-c", "fixture-legal"][i]!,
  purposes: ["independent-attestation" as const] }));
const instant = (hours: number): string => new Date(NOW.getTime() + hours * 3600000).toISOString();
const signer = (subject: string) => ({ subject, name: `Fixture ${subject}`, credential: "fixture credential only", conflictsDeclared: "fixture disclosure only" });
function sign<T extends { kind: string }>(unsigned: T, key: Key): T & { signature: { keyId: string; value: string } } {
  const h = sha256Hex(Buffer.concat([Buffer.from(`amc.assurance.calibration/${unsigned.kind}/v1`, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(unsigned), "utf8")]));
  return { ...unsigned, signature: { keyId: ed25519KeyId(key.publicKeyPem)!, value: signHexDigest(h, key.privateKeyPem) } };
}
function fixture(opts: { disagree?: boolean; adjudicate?: boolean; allPositive?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "amc-p227-calibration-contract-")); roots.push(root);
  const put = (path: string, value: unknown) => { const bytes = Buffer.from(canonicalize(value), "utf8");
    writeFileSync(join(root, path), bytes, { mode: 0o600 }); return { path, sha256: sha256Hex(bytes), bytes: bytes.length }; };
  const gold = { version: 1, synthetic: true, items: ["a", "b", "c", "d"].map(id => ({ id, input: { sample: id } })) };
  const scenario = { id: "fixture-scenario", version: 1, domain: "wealth", synthetic: true };
  const prompt = { version: 1, contract: "amc.regulated-boolean/v1", system: "Synthetic contract evaluator.", userTemplate: "Assess this case: {{case}}" };
  const rubric = { version: 1, criteria: "Synthetic fixture criterion, not a regulated policy." };
  const goldRef = put("gold.json", gold), scenarioRef = put("scenario.json", scenario), promptRef = put("prompt.json", prompt), rubricRef = put("rubric.json", rubric);
  const binding: JudgeBinding = { scenarioId: scenario.id, scenarioSha256: scenarioRef.sha256, domain: "wealth", provider: "openai", goldSha256: goldRef.sha256,
    judge: { model: "fixture-native-contract-model", temperature: 0, promptSha256: promptRef.sha256, rubricSha256: rubricRef.sha256 } };
  const labels = gold.items.map((x, i) => ({ itemId: x.id, pass: opts.allPositive ? true : i < 2 }));
  const labelA = sign({ version: 1, kind: "human-labels", binding, signer: signer(pins[0]!.subject), signedAt: instant(-24), labels }, keyA);
  const other = labels.map((x, i) => ({ ...x, pass: opts.disagree && i === 0 ? !x.pass : x.pass }));
  const labelB = sign({ version: 1, kind: "human-labels", binding, signer: signer(pins[1]!.subject), signedAt: instant(-24), labels: other }, keyB);
  const aRef = put("label-a.json", labelA), bRef = put("label-b.json", labelB);
  const policy = sign({ version: 1, kind: "expert-policy", binding, signer: signer(pins[2]!.subject), signedAt: instant(-20),
    minimumGoldSetSize: 4, maxFpr: 0, maxFnr: 0, validFrom: instant(-20), expiresAt: instant(240), calibrationExpiresAt: instant(24) }, keyC);
  const policyRef = put("policy.json", policy);
  const adjudication = opts.adjudicate ? put("adjudication.json", sign({ version: 1, kind: "adjudication", binding,
    signer: signer(pins[3]!.subject), signedAt: instant(-21), labelFileSha256: [aRef.sha256, bRef.sha256],
    choices: [{ itemId: "a", pass: labels[0]!.pass, rationale: "Synthetic fixture adjudication only" }] }, keyLegal)) : null;
  const bundle = { version: 1, id: "fixture-calibration", binding, gold: goldRef, scenario: scenarioRef, prompt: promptRef,
    rubric: rubricRef, labels: [aRef, bRef], adjudication, policy: policyRef };
  put("bundle.json", bundle);
  const experts = new Map(ROSTER); experts.set(pins[2]!.subject, { domains: ["wealth"], identities: ["c@fixture.test"] });
  const context: OperatorCalibrationContext = { workspace: root, expected: binding, experts,
    authors: new Map([goldRef, scenarioRef, promptRef, rubricRef].map(r => [r.sha256, { identities: [AUTHOR], provenance: "Synthetic fixture source ownership" }])) };
  vi.stubEnv("AMC_HOME", operatorHome(pins));
  return { root, context, binding, prompt, rubric, gold, bundle, policy, labelA, labelB, put };
}
let predictions = new Map([['a', true], ['b', true], ['c', false], ['d', false]]);
let responseModel: string | null = "fixture-native-contract-model";
let duplicateDecision = false;
let fetched = 0;
beforeEach(() => {
  vi.setSystemTime(NOW); fetched = 0; responseModel = "fixture-native-contract-model"; duplicateDecision = false;
  predictions = new Map([['a', true], ['b', true], ['c', false], ['d', false]]);
  vi.stubEnv("OPENAI_API_KEY", "fixture-not-a-real-api-key");
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    fetched++;
    const request = JSON.parse(String(init.body)) as { model: string; temperature: number; messages: Array<{ content: string }> };
    expect(request.model).toBe("fixture-native-contract-model"); expect(request.temperature).toBe(0);
    const rendered = request.messages.at(-1)!.content;
    const caseInput = JSON.parse(rendered.slice("Assess this case: ".length)) as { sample: string };
    const pass = predictions.get(caseInput.sample) ?? true;
    return new Response(JSON.stringify({ model: responseModel,
      choices: [{ message: { content: duplicateDecision ? '{"pass":false,"pass":true}' : JSON.stringify({ pass }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200 });
  }));
});
async function eligible(f: ReturnType<typeof fixture>): Promise<AuthorizedCalibration> {
  const auth = authorizeCalibrationBundle(f.root, f.context); expect(auth.state).toBe("ready");
  if (auth.state !== "ready") throw new Error(JSON.stringify(auth));
  const result = await calibrateOperatorJudge(auth.authority, f.context); expect(result.state).toBe("eligible");
  if (result.state !== "eligible") throw new Error(JSON.stringify(result));
  expect(result.record.confusion).toEqual({ tp: 2, fp: 0, tn: 2, fn: 0 });
  expect(result.record.falsePositiveRate).toBe(0); expect(result.record.falseNegativeRate).toBe(0);
  return result.calibration;
}
const capture = (f: ReturnType<typeof fixture>, sample = "a") => captureNativeJudgeCall({ workspace: f.context.workspace, binding: f.binding,
  prompt: f.prompt, rubric: f.rubric, caseInput: { sample }, purpose: "evaluation" });
describe("P2-27 artifact-bound calibration authority (synthetic contracts)", () => {
  it("reaches native crypto + complete native HTTP calibration + evaluation positive branches", async () => {
    const f = fixture(), token = await eligible(f); expect(fetched).toBe(4);
    expect(calibrationStanding(token, f.context).state).toBe("eligible");
    const call = await capture(f);
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" }))).toMatchObject({ state: "admitted", outcome: "pass" });
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" })).state).toBe("not_evaluated");
  });
  it("same genuine fixture signatures with an empty roster refuse", () => {
    const f = fixture(); expect(authorizeCalibrationBundle(f.root, { ...f.context, experts: new Map() })).toEqual({ state: "not_evaluated", reasons: ["CALIBRATION_ROSTER_EMPTY"] });
  });
  it("does not expose filesystem paths in a public authority refusal", () => {
    const f = fixture();
    expect(authorizeCalibrationBundle(join(f.root, "private-missing-bundle"), f.context))
      .toEqual({ state: "not_evaluated", reasons: ["CALIBRATION_REFUSED"] });
  });
  it("requires exact independently signed adjudication of a disagreement", async () => {
    const missing = fixture({ disagree: true }); expect(authorizeCalibrationBundle(missing.root, missing.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_ADJUDICATION_MISSING"] });
    await eligible(fixture({ disagree: true, adjudicate: true }));
  });
  it("rejects aliases despite separate valid signing keys", () => {
    const f = fixture(); const experts = new Map(f.context.experts);
    experts.set(pins[1]!.subject, { domains: [], identities: ["Reviewer A <a+other@fixture.test.>"] });
    expect(authorizeCalibrationBundle(f.root, { ...f.context, experts })).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_REVIEWERS_NOT_DISTINCT"] });
  });
  it("refuses missing source authors, or self-review, despite valid signatures", () => {
    const f = fixture(); expect(authorizeCalibrationBundle(f.root, { ...f.context, authors: new Map() })).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_AUTHORS_UNKNOWN"] });
    const authors = new Map(f.context.authors); authors.set(f.bundle.gold.sha256, { identities: ["a@fixture.test"], provenance: "Synthetic fixture known author" });
    expect(authorizeCalibrationBundle(f.root, { ...f.context, authors })).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_AUTHOR_SELF_REVIEW"] });
  });
  it("binds exactly the same verified artifact bytes", () => {
    const f = fixture(); f.put("gold.json", { ...f.gold, items: [...f.gold.items].reverse() });
    expect(authorizeCalibrationBundle(f.root, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_ARTIFACT_CHANGED"] });
  });
  it("refuses wrong purpose rather than accepting a native catalog-review signature key", () => {
    const f = fixture(); vi.stubEnv("AMC_HOME", operatorHome(pins.map(p => ({ ...p, purposes: ["catalog-review" as const] }))));
    expect(authorizeCalibrationBundle(f.root, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_SIGNATURE_NOT_ADMITTED"] });
  });
  it("has a reachable eligible-to-expired barrier while policy and signatures are current", async () => {
    const f = fixture(), token = await eligible(f); vi.setSystemTime(new Date(instant(25)));
    // The policy is current for 240 hours, so removing the standing-expiry guard changes this outcome.
    expect(authorizeCalibrationBundle(f.root, f.context).state).toBe("ready");
    const call = await capture(f);
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" }))).toEqual({ state: "not_evaluated", reasons: ["CALIBRATION_EXPIRED_OR_FUTURE"] });
  });
  it("rechecks native revocation after a calibration token was minted", async () => {
    const f = fixture(), token = await eligible(f);
    vi.stubEnv("AMC_HOME", operatorHome(pins.map((p, i) => ({ ...p, revoked: i === 0 }))));
    expect(calibrationStanding(token, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_SIGNATURE_NOT_ADMITTED"] });
  });
  it("rejects a borrowed prompt pin on a real captured-call token", async () => {
    const f = fixture(), token = await eligible(f);
    const prompt = { ...f.prompt, system: "Another synthetic contract prompt" };
    const binding = { ...f.binding, judge: { ...f.binding.judge, promptSha256: hash(prompt) } };
    const call = await captureNativeJudgeCall({ workspace: f.context.workspace, binding, prompt, rubric: f.rubric, caseInput: { sample: "a" }, purpose: "evaluation" });
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" })).state).toBe("not_evaluated");
  });
  it("rejects caller JSON, copied capabilities, and generic adapter scores", async () => {
    const f = fixture(), token = await eligible(f);
    expect(calibrationStanding({ ...token }, f.context).state).toBe("not_evaluated");
    const fake = { mode: "llm", origin: "live_llm", judgedPass: true, requestSha256: "a".repeat(64), responseSha256: "b".repeat(64) } as unknown as CapturedJudgeCall;
    expect(admitCapturedJudgeDecision(token, fake, f.context, hash({ sample: "a" })).state).toBe("not_evaluated");
  });
  it("recomputes authenticated-label confusion and enforces signed expert tolerances", async () => {
    const f = fixture(); predictions.set("c", true);
    const a = authorizeCalibrationBundle(f.root, f.context); if (a.state !== "ready") throw new Error(JSON.stringify(a));
    expect(await calibrateOperatorJudge(a.authority, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_OUTSIDE_EXPERT_TOLERANCE"] });
  });
  it("refuses policy signers outside the trusted scenario domain", () => {
    const f = fixture(), experts = new Map(f.context.experts);
    experts.set(pins[2]!.subject, { domains: [], identities: ["c@fixture.test"] });
    expect(authorizeCalibrationBundle(f.root, { ...f.context, experts })).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_EXPERT_DOMAIN_MISSING"] });
  });
  it("refuses changed signed labels even when new raw file hashes match the manifest", () => {
    const f = fixture();
    f.bundle.labels[0] = f.put("label-a.json", { ...f.labelA, labels: f.labelA.labels.map((x, i) => ({ ...x, pass: i === 0 ? !x.pass : x.pass })) });
    f.put("bundle.json", f.bundle);
    expect(authorizeCalibrationBundle(f.root, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_SIGNATURE_NOT_ADMITTED"] });
  });
  it("refuses borrowed cross-kind signatures instead of treating key admission as signature integrity", () => {
    const f = fixture();
    f.bundle.policy = f.put("policy.json", { ...f.policy, signature: f.labelA.signature }); f.put("bundle.json", f.bundle);
    expect(authorizeCalibrationBundle(f.root, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_SIGNATURE_NOT_ADMITTED"] });
  });
  it("requires each independently signed label file to cover the complete fixed gold set", () => {
    const f = fixture(); const { signature: ignored, ...unsigned } = f.labelA; void ignored;
    f.bundle.labels[0] = f.put("label-a.json", sign({ ...unsigned, labels: unsigned.labels.slice(1) }, keyA)); f.put("bundle.json", f.bundle);
    expect(authorizeCalibrationBundle(f.root, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_FIRST_LABEL_SET_INCOMPLETE"] });
  });
  it("rechecks changed trusted operator aliases after an eligible synthetic contract calibration", async () => {
    const f = fixture(), token = await eligible(f), experts = new Map(f.context.experts);
    experts.set(pins[1]!.subject, { domains: [], identities: ["new-fixture-alias@fixture.test"] });
    expect(calibrationStanding(token, { ...f.context, experts })).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_OPERATOR_CONTEXT_CHANGED"] });
  });
  it("does not borrow a native captured decision across model-temperature pins", async () => {
    const f = fixture(), token = await eligible(f);
    // Build the request under a different exact temperature; the HTTP fixture observes that new pin.
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { model: string; temperature: number };
      expect(request.temperature).toBe(0.25);
      return new Response(JSON.stringify({ model: request.model, choices: [{ message: { content: '{"pass":true}' } }], usage: {} }));
    }));
    const binding = { ...f.binding, judge: { ...f.binding.judge, temperature: 0.25 } };
    const call = await captureNativeJudgeCall({ workspace: f.context.workspace, binding, prompt: f.prompt, rubric: f.rubric, caseInput: { sample: "a" }, purpose: "evaluation" });
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" })).state).toBe("not_evaluated");
  });
  it("refuses an empty class denominator rather than declaring zero risk", async () => {
    const f = fixture({ allPositive: true }); for (const id of ["a", "b", "c", "d"]) predictions.set(id, true);
    const a = authorizeCalibrationBundle(f.root, f.context); if (a.state !== "ready") throw new Error(JSON.stringify(a));
    expect(await calibrateOperatorJudge(a.authority, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_CLASS_DENOMINATOR_EMPTY"] });
  });
  it("enforces the independently signed expert minimum before calibration calls", () => {
    const f = fixture();
    const { signature: ignored, ...unsigned } = f.policy; void ignored;
    f.bundle.policy = f.put("policy.json", sign({ ...unsigned, minimumGoldSetSize: 5 }, keyC));
    f.put("bundle.json", f.bundle);
    expect(authorizeCalibrationBundle(f.root, f.context)).toMatchObject({ state: "not_evaluated", reasons: ["CALIBRATION_BELOW_EXPERT_MINIMUM"] });
    expect(fetched).toBe(0);
  });
  it("binds a genuine captured decision to the exact evaluated case", async () => {
    const f = fixture(), token = await eligible(f), call = await capture(f, "b");
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" }))).toMatchObject({ state: "not_evaluated", reasons: ["JUDGE_EXECUTION_NOT_BOUND"] });
  });
  it("binds a genuine captured decision to the trusted workspace", async () => {
    const f = fixture(), token = await eligible(f);
    const call = await captureNativeJudgeCall({ workspace: join(f.root, "other-fixture-workspace"), binding: f.binding,
      prompt: f.prompt, rubric: f.rubric, caseInput: { sample: "a" }, purpose: "evaluation" });
    expect(admitCapturedJudgeDecision(token, call, f.context, hash({ sample: "a" }))).toMatchObject({ state: "not_evaluated", reasons: ["JUDGE_EXECUTION_NOT_BOUND"] });
  });
  it("uses the strict native path in both actual judge entry points, never an arbitrary adapter or AMC metric mean", async () => {
    const f = fixture(), token = await eligible(f);
    const input = { calibration: token, operator: f.context, prompt: f.prompt, rubric: f.rubric, caseInput: { sample: "a" } };
    const adapter = vi.fn(async () => ({ rawScore: 1, reasoning: "arbitrary callback", model: f.binding.judge.model }));
    const agentsJudge = new LLMJudge({ mode: "llm", judgeAdapter: adapter });
    expect((await agentsJudge.evaluateRegulated(input)).state).toBe("admitted"); expect(adapter).not.toHaveBeenCalled();
    expect(await new LLMJudge({ mode: "simulated" }).evaluateRegulated(input)).toMatchObject({ state: "not_evaluated", claimKind: "synthetic_example" });
    const aggregate = vi.spyOn(ExtendedLLMJudgeEngine.prototype, "evaluateComprehensive").mockResolvedValue([
      { metric: "fixture", score: 1, explanation: "synthetic metric only", confidence: 1, rawResponse: "fixture" }
    ]);
    const runner = new AMCJudgeTestRunner({ metrics: [], categories: [] });
    const legacy = await runner.evaluateTest({ testId: "fixture", description: "fixture", input: "fixture", output: "fixture" });
    expect(legacy.passed).toBe(true); expect(legacy.regulatedEligible).toBe(false); expect(aggregate).toHaveBeenCalledTimes(1);
    expect((await runner.evaluateRegulatedTest(input)).state).toBe("admitted"); expect(aggregate).toHaveBeenCalledTimes(1);
    aggregate.mockRestore();
  });
  it("both public judge entrypoints return fixed codes for native transport errors", async () => {
    const f = fixture(), token = await eligible(f);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`private transport detail ${f.root}/operator-token`); }));
    const input = { calibration: token, operator: f.context, prompt: f.prompt, rubric: f.rubric, caseInput: { sample: "a" } };
    const agentsJudge = new LLMJudge({ mode: "llm", judgeAdapter: async () => ({ rawScore: 1, reasoning: "unused" }) });
    const runner = new AMCJudgeTestRunner({ metrics: [], categories: [] });
    const results = await Promise.all([agentsJudge.evaluateRegulated(input), runner.evaluateRegulatedTest(input)]);
    for (const value of results) expect(value).toEqual({ state: "not_evaluated", reasons: ["JUDGE_CAPTURE_UNAVAILABLE"] });
  });
  it("refuses detected protected input before native HTTP dispatch", async () => {
    const f = fixture();
    await expect(captureNativeJudgeCall({ workspace: f.context.workspace, binding: f.binding, prompt: f.prompt,
      rubric: f.rubric, caseInput: { patient_email: "patient@synthetic-fixture.test" }, purpose: "evaluation" }))
      .rejects.toThrow("JUDGE_PROTECTED_PAYLOAD_UNSUPPORTED");
    expect(fetched).toBe(0);
  });
  it("refuses an opted-in dataflow workspace even for an otherwise clean synthetic case", async () => {
    const f = fixture(); mkdirSync(join(f.root, ".amc", "dataflow"), { recursive: true });
    writeFileSync(join(f.root, ".amc", "dataflow", "processors.yaml"), "synthetic fixture presence only\n");
    await expect(capture(f)).rejects.toThrow("JUDGE_PROTECTED_WORKSPACE_UNSUPPORTED"); expect(fetched).toBe(0);
  });
  it("refuses detector/config availability failures without exposing the source error", async () => {
    const f = fixture(); vi.spyOn(protectedDetector, "detectProtectedRequest").mockImplementation(() => { throw new Error("fixture input must not leak"); });
    await expect(capture(f)).rejects.toThrow("JUDGE_PROTECTED_PREFLIGHT_UNAVAILABLE"); expect(fetched).toBe(0);
  });
  it("refuses missing or mismatched actual response models", async () => {
    const f = fixture(); responseModel = null; await expect(capture(f)).rejects.toThrow("JUDGE_RESPONSE_MODEL_MISMATCH");
    responseModel = "another-model"; await expect(capture(f)).rejects.toThrow("JUDGE_RESPONSE_MODEL_MISMATCH");
  });
  it("refuses ambiguous duplicate judge fields under the pinned output contract", async () => {
    const f = fixture(); duplicateDecision = true; await expect(capture(f)).rejects.toThrow("duplicate key");
  });
  it("refuses duplicate provider model fields in the exact captured wire response", async () => {
    const f = fixture();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      '{"model":"wrong-model","model":"fixture-native-contract-model","choices":[{"message":{"content":"{\\"pass\\":true}"}}],"usage":{}}'
    )));
    await expect(capture(f)).rejects.toThrow("duplicate key");
  });
  it("validates malformed wire JSON before entering the duplicate-key scanner", async () => {
    const f = fixture();
    // The utility requires valid JSON. This spy detects incorrect ordering without running an unbounded scanner.
    const scan = vi.spyOn(jsonUtils, "assertNoDuplicateJsonKeys").mockImplementation(() => {
      throw new Error("WIRE_SCANNER_ENTERED_BEFORE_JSON_VALIDATION");
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"model":"unterminated')));
    const error = await capture(f).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(scan).not.toHaveBeenCalled();
  });
  it.each(["openai", "anthropic"] as const)("cancels a non-success %s strict response before reading its body", async provider => {
    const f = fixture(); let canceled = false, read = false;
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-not-a-real-api-key");
    const stream = new ReadableStream<Uint8Array>({
      pull() { read = true; }, cancel() { canceled = true; }
    }, { highWaterMark: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 429 })));
    await expect(captureNativeJudgeCall({ workspace: f.context.workspace,
      binding: { ...f.binding, provider }, prompt: f.prompt, rubric: f.rubric,
      caseInput: { sample: "a" }, purpose: "evaluation" })).rejects.toThrow("429");
    expect(canceled).toBe(true); expect(read).toBe(false);
  });
  it("cancels an oversized strict response without an unbounded arrayBuffer read", async () => {
    const f = fixture();
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { canceled = true; }
    }, { highWaterMark: 0 });
    const response = new Response(stream);
    const unbounded = vi.spyOn(response, "arrayBuffer").mockImplementation(async () => {
      throw new Error("UNBOUNDED_RESPONSE_READ");
    });
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const error = await capture(f).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(unbounded).not.toHaveBeenCalled();
    expect(canceled).toBe(true);
  });
});

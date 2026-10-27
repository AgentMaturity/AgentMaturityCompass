/** P2-26 slice D: disabling a provider fails closed; only an alternate the change envelope declares may take over. */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentVersionManifest } from "../../src/lifecycle/versionManifest.js";
import { activateChangeEnvelope, recordEnvelopeTestResult, requestChangeEnvelope } from "../../src/runtime/changeEnvelope.js";
import { killSwitchStatus } from "../../src/runtime/killSwitch.js";
import { verifyDrillReceipt } from "../../src/runtime/killSwitchDrill.js";
import { runProviderExitDrill } from "../../src/runtime/providerExit.js";
import { AGENT, AUDITOR, OWNER, cleanupGovernanceFixtures, decideBound, governanceFixture, loginAs, type GovernanceFixture } from "../governor/governanceFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const baseline: AgentVersionManifest = { v: 1, agentId: AGENT, deploymentId: "not_bound", model: { providerId: "anthropic", model: "claude-fixture", providerReportedVersion: null },
  systemPromptSha256: "a".repeat(64), toolsDigest: "b".repeat(64), policyDigest: "c".repeat(64), compiledPlanDigest: "none", harnessVersion: "fixture",
  compositionDigest: "d".repeat(64), corpusDigests: [] };
const onOpenAi = (model: string): AgentVersionManifest => ({ ...baseline, model: { providerId: "openai", model, providerReportedVersion: null } });
let f: GovernanceFixture;

async function declareAlternate(): Promise<string> {
  const requester = loginAs(f.workspace, "fixture-exit-requester", ["OPERATOR"]);
  const tester = loginAs(f.workspace, "fixture-exit-tester", ["AUDITOR"]);
  const { draft, approval } = await requestChangeEnvelope(f.workspace, { sessionTokenFile: requester.tokenFile, agentId: AGENT, baseline,
    allowed: [{ component: "model", rule: "digest_in_set", values: ["openai/gpt-fixture@unpinned"], requiredTests: ["exit-smoke"] }], validUntil: Date.now() + 86_400_000 });
  decideBound(f.workspace, approval, [OWNER, AUDITOR]);
  const envelope = await activateChangeEnvelope(f.workspace, draft.envelopeId, approval);
  await recordEnvelopeTestResult(f.workspace, { sessionTokenFile: tester.tokenFile, envelopeId: envelope.envelopeId, testId: "exit-smoke", passed: true,
    manifest: onOpenAi("gpt-fixture") });
  return envelope.envelopeId;
}
const drill = (alternate?: { providerId: string; model: string }) => runProviderExitDrill({ workspace: f.workspace, agentId: AGENT, provider: "anthropic", ...(alternate ? { alternate } : {}) });

beforeEach(() => { f = governanceFixture(); });
afterEach(() => cleanupGovernanceFixtures());

describe("provider exit drill", () => {
  test("no alternate: calls to the disabled provider fail closed; the kill is lifted and the signed receipt verifies", async () => {
    const receipt = await drill();
    expect(receipt.body).toMatchObject({ kind: "provider_exit", provider: "anthropic", failClosed: true, alternate: null, result: "pass" });
    expect(receipt.body.register.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["key", "storage"]));
    expect(killSwitchStatus(f.workspace).active).toBe(false);
    expect(verifyDrillReceipt(f.workspace, receipt)).toBe(true);
  });

  test("an alternate the envelope declares takes over, and the switch is recorded with the envelope", async () => {
    const envelopeId = await declareAlternate();
    const receipt = await drill({ providerId: "openai", model: "gpt-fixture" });
    expect(receipt.body.alternate, JSON.stringify(receipt.body.alternate)).toMatchObject({ model: "openai/gpt-fixture", outcome: "switched", envelopeId });
  });

  test("an undeclared alternate is blocked as an out-of-envelope change; with no envelope at all it is blocked too", async () => {
    expect((await drill({ providerId: "openai", model: "gpt-other" })).body.alternate).toMatchObject({ outcome: "blocked_no_envelope" });
    await declareAlternate();
    expect((await drill({ providerId: "openai", model: "gpt-other" })).body.alternate).toMatchObject({ outcome: "blocked_out_of_envelope" });
  });
});

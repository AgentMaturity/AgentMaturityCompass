/** P2-26 slice C: version changes outside a signed change envelope are blocked in regulated workspaces and open a reassessment. */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createIncidentStore } from "../../src/incidents/incidentStore.js";
import {
  ChangeEnvelopeBlocked, activateChangeEnvelope, checkChangeEnvelopeAtOpen, recordEnvelopeTestResult, requestChangeEnvelope, type AgentVersionManifest
} from "../../src/runtime/changeEnvelope.js";
import { AGENT, AUDITOR, OWNER, cleanupGovernanceFixtures, decideBound, governanceFixture, loginAs, type GovernanceFixture } from "../governor/governanceFixture.js";

const regulated = vi.hoisted(() => ({ value: true }));
vi.mock("../../src/catalog/compiler/activate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/catalog/compiler/activate.js")>();
  return { ...original, loadActiveCompiledPolicy: (workspace: string) => regulated.value ? { fixture: true } : original.loadActiveCompiledPolicy(workspace) };
});
vi.setConfig({ testTimeout: 60_000 });

const baseline: AgentVersionManifest = {
  model: { providerId: "anthropic", name: "claude-fixture", providerVersion: "2026-10-01" }, promptDigest: "a".repeat(64),
  toolsDigest: "b".repeat(64), policyDigest: "c".repeat(64), corpusDigest: null
};
const NEW_PROMPT = "d".repeat(64);
let f: GovernanceFixture;

async function envelope(over: { allowed?: Parameters<typeof requestChangeEnvelope>[1]["allowed"]; validUntil?: number } = {}) {
  const requester = loginAs(f.workspace, "fixture-envelope-requester", ["OPERATOR"]);
  const { draft, approval } = await requestChangeEnvelope(f.workspace, { sessionTokenFile: requester.tokenFile, agentId: AGENT, baseline,
    allowed: over.allowed ?? [{ component: "prompt", rule: "digest_in_set", values: [NEW_PROMPT], requiredTests: ["prompt-regression"] }],
    validUntil: over.validUntil ?? Date.now() + 86_400_000 });
  decideBound(f.workspace, approval, [OWNER, AUDITOR]);
  return activateChangeEnvelope(f.workspace, draft.envelopeId, approval);
}
const open = (live: AgentVersionManifest, nowTs?: number) => checkChangeEnvelopeAtOpen({ workspace: f.workspace, agentId: AGENT, live, ...(nowTs ? { nowTs } : {}) });
const withPrompt = (promptDigest: string): AgentVersionManifest => ({ ...baseline, promptDigest });
const reassessments = () => createIncidentStore(f.ledger.db).getOpenIncidents(AGENT).filter((i) => i.triggerId.startsWith("reassessment:"));

beforeEach(() => { regulated.value = true; f = governanceFixture(); });
afterEach(() => cleanupGovernanceFixtures());

describe("change envelopes at session open", () => {
  test("identical manifest: allowed", async () => {
    const env = await envelope();
    expect(open(baseline)).toMatchObject({ outcome: "allow", envelopeId: env.envelopeId, changed: [] });
  });

  test("a prompt digest outside the envelope in a regulated workspace: blocked, and a reassessment is opened", async () => {
    await envelope();
    expect(() => open(withPrompt("e".repeat(64)))).toThrow(ChangeEnvelopeBlocked);
    expect(reassessments()).toHaveLength(1);
  });

  test("the same change outside a regulated workspace: a warning recorded, not a block", async () => {
    await envelope();
    regulated.value = false;
    expect(open(withPrompt("e".repeat(64)))).toMatchObject({ outcome: "warn", changed: ["prompt"] });
    expect(reassessments()).toHaveLength(1);
  });

  test("inside the envelope with passing tests: allowed, citing the envelope", async () => {
    const env = await envelope();
    recordEnvelopeTestResult(f.workspace, { envelopeId: env.envelopeId, testId: "prompt-regression", passed: true, recordedBy: "ci" });
    expect(open(withPrompt(NEW_PROMPT))).toMatchObject({ outcome: "allow_in_envelope", envelopeId: env.envelopeId, changed: ["prompt"] });
  });

  test("inside the envelope with missing or failing test evidence: blocked", async () => {
    const env = await envelope();
    expect(() => open(withPrompt(NEW_PROMPT))).toThrow(/required tests have no passing evidence/);
    recordEnvelopeTestResult(f.workspace, { envelopeId: env.envelopeId, testId: "prompt-regression", passed: true, recordedBy: "ci" });
    recordEnvelopeTestResult(f.workspace, { envelopeId: env.envelopeId, testId: "prompt-regression", passed: false, recordedBy: "ci" });
    expect(() => open(withPrompt(NEW_PROMPT))).toThrow(/required tests have no passing evidence/);
  });

  test("a model without a provider-reported version is unpinned", async () => {
    await envelope({ allowed: [{ component: "model", rule: "provider_version_in_set", values: ["2026-11-01"], requiredTests: [] }] });
    const unversioned = { ...baseline, model: { ...baseline.model, providerVersion: null } };
    expect(() => open(unversioned)).toThrow(ChangeEnvelopeBlocked);
    regulated.value = false;
    expect(open(unversioned)).toMatchObject({ outcome: "warn", unpinned: true });
    expect(open({ ...baseline, model: { ...baseline.model, providerVersion: "2026-11-01" } })).toMatchObject({ outcome: "allow_in_envelope", unpinned: false });
  });

  test("an expired envelope: blocked", async () => {
    const env = await envelope({ validUntil: Date.now() + 1000 });
    expect(() => open(baseline, env.validUntil + 1)).toThrow(/expired/);
  });

  test("a tampered envelope file: blocked, never silently skipped", async () => {
    const env = await envelope();
    const dir = join(f.workspace, ".amc", "runtime", "envelopes");
    expect(readdirSync(dir)).toContain(`${env.envelopeId}.json`);
    writeFileSync(join(dir, `${env.envelopeId}.json`), JSON.stringify({ ...env, allowed: [{ component: "prompt", rule: "digest_in_set", values: ["e".repeat(64)], requiredTests: [] }] }));
    expect(() => open(withPrompt("e".repeat(64)))).toThrow(/unverifiable change envelope/);
  });

  test("no envelope at all: nothing to compare, allowed", () => {
    expect(open(withPrompt("e".repeat(64)))).toMatchObject({ outcome: "allow", envelopeId: null });
  });
});

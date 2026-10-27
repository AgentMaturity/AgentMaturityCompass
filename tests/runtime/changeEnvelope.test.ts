/** P2-26 slice C: version changes outside a signed change envelope are blocked in regulated workspaces and open a reassessment. */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createIncidentStore } from "../../src/incidents/incidentStore.js";
import { nativeSessionManifest, type AgentVersionManifest } from "../../src/lifecycle/versionManifest.js";
import {
  ChangeEnvelopeBlocked, activateChangeEnvelope, checkChangeEnvelopeAtOpen, manifestSha256, recordEnvelopeTestResult, requestChangeEnvelope
} from "../../src/runtime/changeEnvelope.js";
import { AGENT, AUDITOR, OWNER, cleanupGovernanceFixtures, decideBound, governanceFixture, loginAs, type GovernanceFixture } from "../governor/governanceFixture.js";

const regulated = vi.hoisted(() => ({ value: true }));
vi.mock("../../src/catalog/compiler/activate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/catalog/compiler/activate.js")>();
  return { ...original, loadActiveCompiledPolicy: (workspace: string) => regulated.value ? { fixture: true } : original.loadActiveCompiledPolicy(workspace) };
});
vi.setConfig({ testTimeout: 60_000 });

const baseline: AgentVersionManifest = {
  v: 1, agentId: AGENT, deploymentId: "not_bound", model: { providerId: "anthropic", model: "claude-fixture", providerReportedVersion: "2026-10-01" },
  systemPromptSha256: "a".repeat(64), toolsDigest: "b".repeat(64), policyDigest: "c".repeat(64), compiledPlanDigest: "none", harnessVersion: "fixture",
  compositionDigest: "e".repeat(64), corpusDigests: []
};
const NEW_PROMPT = "d".repeat(64);
let f: GovernanceFixture;
const logins = new Map<string, string>();
/** One login per user per fixture workspace: users.yaml refuses a second user of the same name. */
const login = (username: string, role: "OPERATOR" | "AUDITOR"): string => {
  const key = `${f.workspace}\0${username}`;
  if (!logins.has(key)) logins.set(key, loginAs(f.workspace, username, [role]).tokenFile);
  return logins.get(key)!;
};

async function envelope(over: { allowed?: Parameters<typeof requestChangeEnvelope>[1]["allowed"]; validUntil?: number } = {}) {
  const { draft, approval } = await requestChangeEnvelope(f.workspace, { sessionTokenFile: login("fixture-envelope-requester", "OPERATOR"), agentId: AGENT, baseline,
    allowed: over.allowed ?? [{ component: "prompt", rule: "digest_in_set", values: [NEW_PROMPT], requiredTests: ["prompt-regression"] }],
    validUntil: over.validUntil ?? Date.now() + 86_400_000 });
  decideBound(f.workspace, approval, [OWNER, AUDITOR]);
  return activateChangeEnvelope(f.workspace, draft.envelopeId, approval);
}
const open = (live: AgentVersionManifest, nowTs?: number) => checkChangeEnvelopeAtOpen({ workspace: f.workspace, agentId: AGENT, live, ...(nowTs ? { nowTs } : {}) });
const withPrompt = (systemPromptSha256: string): AgentVersionManifest => ({ ...baseline, systemPromptSha256 });
const tester = () => login("fixture-envelope-tester", "AUDITOR");
const pass = (envelopeId: string, manifest: AgentVersionManifest, passed = true, sessionTokenFile = tester()) =>
  recordEnvelopeTestResult(f.workspace, { sessionTokenFile, envelopeId, testId: "prompt-regression", passed, manifest });
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
    await pass(env.envelopeId, withPrompt(NEW_PROMPT));
    expect(open(withPrompt(NEW_PROMPT))).toMatchObject({ outcome: "allow_in_envelope", envelopeId: env.envelopeId, changed: ["prompt"] });
  });

  test("inside the envelope with missing or failing test evidence: blocked", async () => {
    const env = await envelope();
    expect(() => open(withPrompt(NEW_PROMPT))).toThrow(/required tests have no passing evidence/);
    await pass(env.envelopeId, withPrompt(NEW_PROMPT));
    await pass(env.envelopeId, withPrompt(NEW_PROMPT), false);
    expect(() => open(withPrompt(NEW_PROMPT))).toThrow(/required tests have no passing evidence/);
  });

  test("a model without a provider-reported version is unpinned", async () => {
    await envelope({ allowed: [{ component: "model", rule: "provider_version_in_set", values: ["2026-11-01"], requiredTests: [] }] });
    const unversioned = { ...baseline, model: { ...baseline.model, providerReportedVersion: null } };
    expect(() => open(unversioned)).toThrow(ChangeEnvelopeBlocked);
    regulated.value = false;
    expect(open(unversioned)).toMatchObject({ outcome: "warn", unpinned: true });
    expect(open({ ...baseline, model: { ...baseline.model, providerReportedVersion: "2026-11-01" } })).toMatchObject({ outcome: "allow_in_envelope", unpinned: false });
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

  test("forged or unbound test evidence never counts", async () => {
    const env = await envelope();
    const session = `forge-${Date.now()}`;
    f.ledger.startSession({ sessionId: session, runtime: "unknown", binaryPath: "forger", binarySha256: "forger" });
    const forge = (meta: Record<string, unknown>) => f.ledger.appendEvidence({ sessionId: session, runtime: "unknown", eventType: "audit",
      payload: "{}", inline: true, meta: { agentId: AGENT, ...meta } });
    // The pre-fix shape: any audit row naming the type with passed: true.
    forge({ auditType: "CHANGE_ENVELOPE_TEST_RESULT", envelopeId: env.envelopeId, testId: "prompt-regression", passed: true });
    // A well-formed record bound to the right envelope, approval and manifest, with a signature from no workspace key.
    forge({ auditType: "CHANGE_ENVELOPE_TEST_RESULT", signature: Buffer.alloc(64).toString("base64"), result: { schema: "amc.envelope-test-result/v1",
      envelopeId: env.envelopeId, approvalDigest: env.approval.requestBindingDigest, manifestSha256: manifestSha256(withPrompt(NEW_PROMPT)), testId: "prompt-regression",
      passed: true, recordedBy: "someone", recordedTs: Date.now() } });
    // A LIKE match only: the type named inside another row.
    forge({ auditType: "OTHER", note: "CHANGE_ENVELOPE_TEST_RESULT", envelopeId: env.envelopeId, testId: "prompt-regression", passed: true });
    expect(() => open(withPrompt(NEW_PROMPT))).toThrow(/required tests have no passing evidence/);
    // A genuine pass for another manifest does not cover this one.
    await pass(env.envelopeId, withPrompt("f".repeat(64)));
    expect(() => open(withPrompt(NEW_PROMPT))).toThrow(/required tests have no passing evidence/);
  });

  test("the envelope's requester cannot attest its tests", async () => {
    const env = await envelope();
    await expect(pass(env.envelopeId, withPrompt(NEW_PROMPT), true, login("fixture-envelope-requester", "OPERATOR")))
      .rejects.toThrow(/self_attested/);
  });

  test("the session manifest comes from what the session resolves, not the caller's pins (P2-23's one builder)", () => {
    const surface = { schemas: () => [{ name: "fs.read" }] };
    const manifest = (over: Partial<Parameters<typeof nativeSessionManifest>[0]> = {}) => nativeSessionManifest({ workspace: f.workspace, agentId: AGENT,
      providerId: "anthropic", model: "claude-fixture", systemPrompt: "p", harnessVersion: "fixture", compositionDigest: "e".repeat(64),
      tools: "workspace", surface, ...over });
    const base = manifest();
    expect(base.toolsDigest).toMatch(/^[a-f0-9]{64}$/);
    // A capability counts by its declaration, so a changed action class moves the digest even with the same schemas.
    const mounted = manifest({ additionalCapabilities: [{ name: "mounted.tool", actionClass: "READ_ONLY" }] }).toolsDigest;
    expect(mounted).not.toBe(base.toolsDigest);
    expect(manifest({ additionalCapabilities: [{ name: "mounted.tool", actionClass: "WRITE_HIGH" }] }).toolsDigest).not.toBe(mounted);
    expect(manifest({ tools: "none" }).toolsDigest).not.toBe(base.toolsDigest);
    expect(manifest({ surface: { schemas: () => { throw new Error("pinned digest mismatch"); } } }).toolsDigest).toBeNull();
    writeFileSync(join(f.workspace, ".amc", "tools.yaml"), "tampered: true\n");
    expect(manifest().toolsDigest).toBeNull();
  });

  test("a baseline naming another agent is refused", async () => {
    await expect(requestChangeEnvelope(f.workspace, { sessionTokenFile: login("fixture-envelope-requester", "OPERATOR"), agentId: AGENT,
      baseline: { ...baseline, agentId: "someone-else" }, allowed: [], validUntil: Date.now() + 86_400_000 })).rejects.toThrow(/invalid_baseline/);
  });

  test("an unresolved tool set always counts as changed", async () => {
    await envelope();
    expect(() => open({ ...baseline, toolsDigest: null })).toThrow(/tool changed/);
  });

  test("no envelope at all: nothing to compare, allowed", () => {
    expect(open(withPrompt("e".repeat(64)))).toMatchObject({ outcome: "allow", envelopeId: null });
  });
});

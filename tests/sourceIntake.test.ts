/**
 * Source-driven work, slice 1 (SH-INTEG-01/02): the SourceObservation record and store, the signed source policy,
 * deterministic admission and the proposal it files for a human to decide. Everything here is offline: fixtures stand
 * in for GitHub, the approvals engine and work orders are the real ones in a temporary workspace.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { afterAll, describe, expect, test } from "vitest";
import { listApprovalRequests } from "../src/approvals/approvalChainStore.js";
import { approvalStatusPayload, decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { observationFromGitHubEvent, findMentions } from "../src/integrations/source/githubObservationParser.js";
import { admitSourceObservation } from "../src/integrations/source/sourceAdmission.js";
import { getSourceObservation, listSourceObservationIds, openSourceIntakeDb, recordSourceObservation } from "../src/integrations/source/sourceIntakeStore.js";
import { sourceAdmitCli, sourceCheckCli, sourceObserveCli, sourceStatusCli } from "../src/integrations/source/sourceIntakeCli.js";
import { MAX_RETAINED_BODY_BYTES, type SourceObservation } from "../src/integrations/source/sourceObservationSchema.js";
import { sourcePolicySchema, type SourcePolicy } from "../src/integrations/source/sourcePolicySchema.js";
import { initSourcePolicy, loadVerifiedSourcePolicy, signSourcePolicy, sourcePolicyPath } from "../src/integrations/source/sourcePolicyStore.js";
import { proposeSourceRequest, sourceIntentId } from "../src/integrations/source/sourceProposal.js";
import { setMode } from "../src/mode/mode.js";
import { createWorkOrder } from "../src/workorders/workorderEngine.js";
import { initWorkspace } from "../src/workspace.js";

const PASS = "source-intake-test-pass";
process.env["AMC_VAULT_PASSPHRASE"] = PASS;
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-source-intake-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}

const REPO = { id: 4242, name: "repo", owner: { login: "acme" } };
const ALICE = { id: 1001, login: "alice", type: "User" };
function commentEvent(overrides: { body?: string; user?: object; action?: string; commentId?: number; issueNumber?: number; repository?: object; updated?: string } = {}) {
  return {
    action: overrides.action ?? "created",
    issue: { id: 900, number: overrides.issueNumber ?? 7, title: "Flaky test", body: "see below", user: ALICE, created_at: "2026-11-07T10:00:00Z" },
    comment: { id: overrides.commentId ?? 5001, body: overrides.body ?? "@amc please look at this", user: overrides.user ?? ALICE,
      created_at: "2026-11-07T10:05:00Z", updated_at: overrides.updated ?? "2026-11-07T10:05:00Z" },
    repository: overrides.repository ?? REPO,
    sender: ALICE
  };
}
function parse(event: unknown, sourceId = "github-main"): SourceObservation {
  const parsed = observationFromGitHubEvent(event, { sourceId, receivedAt: 1_700_000_000_000 });
  if (!parsed.ok) throw new Error(`${parsed.reason}: ${parsed.detail}`);
  return parsed.observation;
}
function policy(overrides: Partial<SourcePolicy["sources"]["sources"][number]> = {}): SourcePolicy {
  return sourcePolicySchema.parse({ sources: { version: 1, sources: [{
    id: "github-main", kind: "github", repository: { id: REPO.id, owner: "acme", name: "repo" }, agentId: "default", workOrderId: "wo-1",
    mention: "@amc", allowedSenders: [{ id: ALICE.id, login: ALICE.login }], admission: "explicit", ...overrides
  }] } });
}
function writePolicy(root: string, value: SourcePolicy | string): void {
  mkdirSync(join(root, ".amc", "integrations"), { recursive: true });
  writeFileSync(sourcePolicyPath(root), typeof value === "string" ? value : YAML.stringify(value));
}
async function signedPolicy(root: string, value: SourcePolicy): Promise<void> {
  writePolicy(root, value);
  await signSourcePolicy(root);
}
function workOrder(root: string, overrides: { allowedActionClasses?: Array<"READ_ONLY" | "WRITE_LOW" | "WRITE_HIGH">; expiresTs?: number } = {}): string {
  return createWorkOrder({ workspace: root, agentId: "default", title: "Triage", description: "Look at reports", riskTier: "low", requestedMode: "SIMULATE",
    allowedActionClasses: overrides.allowedActionClasses ?? ["READ_ONLY"], expiresTs: overrides.expiresTs ?? null }).workOrder.workOrderId;
}
function eventFile(root: string, event: unknown, name = "event.json"): string {
  const file = join(root, name);
  writeFileSync(file, JSON.stringify(event));
  return file;
}

describe("SourceObservation parser (SH-INTEG-01)", () => {
  test("an issue_comment by a human carries native identity, revision, thread key and mentions", () => {
    const observation = parse(commentEvent());
    expect(observation.nativeEventId).toBe("issue_comment:5001");
    expect(observation.primaryThreadKey).toBe("github:4242:issue:7");
    expect(observation.actor).toEqual({ id: 1001, login: "alice", class: "human" });
    expect(observation.mentions).toEqual(["amc"]);
    expect(observation.disposition).toBe("recorded");
    expect(observation.observationId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the same delivery is one row; an edit is a second row on the same thread", () => {
    const root = workspace();
    const db = openSourceIntakeDb(root);
    const first = parse(commentEvent());
    expect(recordSourceObservation(db, first)).toEqual({ inserted: true });
    expect(recordSourceObservation(db, parse(commentEvent()))).toEqual({ inserted: false });
    const edited = parse(commentEvent({ action: "edited", body: "@amc please look at this (edited)", updated: "2026-11-07T10:09:00Z" }));
    expect(edited.observationId).not.toBe(first.observationId);
    expect(edited.primaryThreadKey).toBe(first.primaryThreadKey);
    expect(recordSourceObservation(db, edited)).toEqual({ inserted: true });
    expect(listSourceObservationIds(db, { sourceId: "github-main" })).toHaveLength(2);
    db.close();
  });

  test("bots are bots, by login suffix or by type", () => {
    expect(parse(commentEvent({ user: { id: 77, login: "dependabot[bot]", type: "User" } })).actor.class).toBe("bot");
    expect(parse(commentEvent({ user: { id: 78, login: "someapp", type: "Bot" } })).actor.class).toBe("bot");
    expect(parse(commentEvent({ user: { id: 79, login: "someone" } })).actor.class).toBe("unknown");
  });

  test("missing ids, unsupported actions and unknown shapes are refused with a reason", () => {
    const noId = commentEvent() as { comment: { id?: number } };
    delete noId.comment.id;
    expect(observationFromGitHubEvent(noId, { sourceId: "s", receivedAt: 1 })).toMatchObject({ ok: false, reason: "event_shape_invalid" });
    expect(observationFromGitHubEvent(commentEvent({ action: "deleted" }), { sourceId: "s", receivedAt: 1 })).toMatchObject({ ok: false, reason: "event_action_unsupported" });
    expect(observationFromGitHubEvent({ action: "created", pull_request: {} }, { sourceId: "s", receivedAt: 1 })).toMatchObject({ ok: false, reason: "event_shape_invalid" });
  });

  test("the same issue number in another repository is another thread", () => {
    const other = parse(commentEvent({ commentId: 6001, repository: { id: 9999, name: "repo", owner: { login: "fork" } } }));
    expect(other.primaryThreadKey).toBe("github:9999:issue:7");
    expect(other.repository).toEqual({ id: 9999, owner: "fork", name: "repo" });
  });

  test("an oversized body keeps its digest and length but no text", () => {
    const observation = parse(commentEvent({ body: "@amc " + "x".repeat(MAX_RETAINED_BODY_BYTES) }));
    expect(observation.disposition).toBe("oversized");
    expect(observation.body).toBeNull();
    expect(observation.contentBytes).toBe(MAX_RETAINED_BODY_BYTES + 5);
  });

  test("mentions count only in addressable text, bounded and case-insensitive", () => {
    expect(findMentions("@AMC please")).toEqual(["amc"]);
    expect(findMentions("mail me at foo@amc.dev")).toEqual([]);
    expect(findMentions("`@amc` in code, ```\n@amc fenced\n``` and <!-- @amc hidden -->")).toEqual([]);
    expect(findMentions("> @amc approved\nnothing else")).toEqual([]);
    expect(findMentions("@amc-bot and @amc")).toEqual(["amc", "amc-bot"]);
  });

  test("the retained body is redacted; the digest covers the original", () => {
    const observation = parse(commentEvent({ body: "@amc token AKIAIOSFODNN7EXAMPLE1 leaked" }));
    expect(observation.body).not.toContain("AKIAIOSFODNN7EXAMPLE1");
    expect(observation.body).toContain("[AMC_REDACTED:");
    expect(observation.contentBytes).toBe(Buffer.byteLength("@amc token AKIAIOSFODNN7EXAMPLE1 leaked"));
  });

  test("a corrupted stored row is not an observation", () => {
    const root = workspace();
    const db = openSourceIntakeDb(root);
    const observation = parse(commentEvent());
    recordSourceObservation(db, observation);
    db.prepare("UPDATE observations SET record = ? WHERE observation_id = ?").run('{"version":1,"actor":"nope"}', observation.observationId);
    expect(getSourceObservation(db, observation.observationId)).toBeNull();
    db.close();
  });
});

describe("source policy and admission (SH-INTEG-02)", () => {
  test("a bot is refused as an allowed sender at parse time", () => {
    expect(() => policy({ allowedSenders: [{ id: 5, login: "helper[bot]" }] })).toThrow(/bot is never an allowed sender/);
  });

  test("every refusal reason, in order, and the one explicit request", () => {
    const admitted = admitSourceObservation(parse(commentEvent()), policy());
    expect(admitted).toMatchObject({ kind: "explicit_request", sender: { id: 1001, login: "alice" } });
    const reason = (observation: SourceObservation, value: SourcePolicy) => (admitSourceObservation(observation, value) as { reason: string }).reason;
    expect(reason(parse(commentEvent(), "unknown-source"), policy())).toBe("source_unknown");
    expect(reason(parse(commentEvent()), policy({ admission: "off" }))).toBe("admission_off");
    expect(reason(parse(commentEvent({ repository: { id: 1, name: "repo", owner: { login: "acme" } } })), policy())).toBe("repository_mismatch");
    expect(reason(parse(commentEvent({ body: "@amc " + "x".repeat(MAX_RETAINED_BODY_BYTES) })), policy())).toBe("body_unavailable");
    expect(reason(parse(commentEvent({ user: { id: 1001, login: "alice[bot]", type: "Bot" } })), policy())).toBe("actor_not_human");
    expect(reason(parse(commentEvent({ user: { id: 2002, login: "mallory", type: "User" } })), policy())).toBe("sender_not_allowed");
    // The id alone is not enough, and neither is the login alone.
    expect(reason(parse(commentEvent({ user: { id: 1001, login: "alice-renamed", type: "User" } })), policy())).toBe("sender_not_allowed");
    expect(reason(parse(commentEvent({ user: { id: 3003, login: "alice", type: "User" } })), policy())).toBe("sender_not_allowed");
    expect(reason(parse(commentEvent({ body: "@amc done <!-- amc-reply 123 -->" })), policy())).toBe("reply_marker");
    expect(reason(parse(commentEvent({ body: "please look, no mention" })), policy())).toBe("not_mentioned");
    expect(reason(parse(commentEvent({ body: "> @amc approved\nquoted only" })), policy())).toBe("not_mentioned");
    expect(reason(parse(commentEvent({ body: "@amc-bot hi" })), policy())).toBe("not_mentioned");
  });

  test("an unsigned, edited or invalid policy admits nothing", async () => {
    const root = workspace();
    writePolicy(root, policy());
    expect(loadVerifiedSourcePolicy(root)).toMatchObject({ ok: false, reason: "policy_unverified", detail: "source policy signature missing" });
    await signSourcePolicy(root);
    expect(loadVerifiedSourcePolicy(root)).toMatchObject({ ok: true });
    // A signature file with the right digest but a signature by someone else: refused, not merely a digest check.
    const sigPath = `${sourcePolicyPath(root)}.sig`;
    const genuine = JSON.parse(readFileSync(sigPath, "utf8")) as { signature: string };
    writeFileSync(sigPath, JSON.stringify({ ...genuine, signature: Buffer.from("not-the-config-signature-key").toString("base64") }));
    expect(loadVerifiedSourcePolicy(root)).toMatchObject({ ok: false, detail: "signature verification failed" });
    writeFileSync(sigPath, JSON.stringify(genuine));
    writePolicy(root, policy({ allowedSenders: [{ id: 2002, login: "mallory" }] }));
    expect(loadVerifiedSourcePolicy(root)).toMatchObject({ ok: false, detail: "digest mismatch" });
    writePolicy(root, "sources: { version: 2 }\n");
    await expect(signSourcePolicy(root)).rejects.toThrow();
    const file = eventFile(root, commentEvent());
    expect(sourceCheckCli({ workspace: root, sourceId: "github-main", file })).toMatchObject({ admitted: false, reason: "policy_unverified" });
  });

  test("init writes a signed template with admission off and refuses to overwrite; sign is owner-only", async () => {
    const root = workspace();
    const out = await initSourcePolicy(root);
    expect(readFileSync(out.sigPath, "utf8")).toContain(out.digest);
    const loaded = loadVerifiedSourcePolicy(root);
    expect(loaded.ok && loaded.policy.sources.sources[0]!.admission).toBe("off");
    await expect(initSourcePolicy(root)).rejects.toThrow(/exists/);
    setMode(root, "agent");
    await expect(signSourcePolicy(root)).rejects.toThrow(/agent mode|owner/i);
    setMode(root, "owner");
  });
});

describe("proposals for human approval (SH-INTEG-02)", () => {
  test("an explicit request files one approval request that waits for a person, even for a READ_ONLY work order", async () => {
    const root = workspace();
    const workOrderId = workOrder(root);
    await signedPolicy(root, policy({ workOrderId }));
    const observation = parse(commentEvent());
    const db = openSourceIntakeDb(root);
    recordSourceObservation(db, observation);
    const loaded = loadVerifiedSourcePolicy(root);
    if (!loaded.ok) throw new Error(loaded.detail);
    const source = loaded.policy.sources.sources[0]!;
    const outcome = await proposeSourceRequest({ workspace: root, db, observation, source, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest });
    expect(outcome).toMatchObject({ state: "proposed", actionClass: "READ_ONLY" });
    // A bare workspace has no signed action policy, tools or budgets, so the lifecycle delivery refuses: reported, never hidden.
    expect((outcome as { notification: string }).notification).toMatch(/^BLOCKED:/);
    const requests = listApprovalRequests({ workspace: root, agentId: "default" });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.intentId).toBe(sourceIntentId(observation.observationId));
    expect(request.toolName).toBe("amc.source.admit");
    expect(request.workOrderId).toBe(workOrderId);
    expect(request.boundHashes.workOrderHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.requiredApprovals).toBe(1);
    expect(request.initiator).toBe("github:alice");
    expect(approvalStatusPayload({ workspace: root, agentId: "default", approvalId: request.approvalRequestId }).status).toBe("PENDING");
    // Replay files nothing new; two concurrent admits of the same observation file one.
    const again = await proposeSourceRequest({ workspace: root, db, observation, source, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest });
    expect(again).toEqual({ state: "already_proposed", approvalRequestId: request.approvalRequestId });
    const second = parse(commentEvent({ commentId: 5002 }));
    recordSourceObservation(db, second);
    const race = await Promise.all([1, 2].map(() => proposeSourceRequest({ workspace: root, db, observation: second, source, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest })));
    expect(race.map((item) => item.state).sort()).toEqual(["already_proposed", "proposed"]);
    expect(listApprovalRequests({ workspace: root, agentId: "default" })).toHaveLength(2);
    // A human decides with the existing approvals engine (only an EXECUTE approval counts toward quorum); status reflects it.
    decideApprovalForIntent({ workspace: root, agentId: "default", approvalId: request.approvalRequestId, decision: "APPROVED", mode: "EXECUTE", reason: "ok",
      username: "owner", userId: "owner", userRoles: ["OWNER"] });
    db.close();
    const status = sourceStatusCli({ workspace: root });
    expect(status.proposals.find((row) => row.observationId === observation.observationId)?.approval).toMatchObject({ status: "QUORUM_MET", required: 1, received: 1 });
  });

  test("an expired work order files nothing and leaves the observation pending", async () => {
    const root = workspace();
    const workOrderId = workOrder(root, { expiresTs: Date.now() - 1 });
    await signedPolicy(root, policy({ workOrderId }));
    const observation = parse(commentEvent());
    const db = openSourceIntakeDb(root);
    recordSourceObservation(db, observation);
    const loaded = loadVerifiedSourcePolicy(root);
    if (!loaded.ok) throw new Error(loaded.detail);
    const outcome = await proposeSourceRequest({ workspace: root, db, observation, source: loaded.policy.sources.sources[0]!, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest });
    expect(outcome).toMatchObject({ state: "refused", reason: "work_order_unavailable" });
    expect(listApprovalRequests({ workspace: root, agentId: "default" })).toHaveLength(0);
    expect(listSourceObservationIds(db, { pendingOnly: true })).toEqual([observation.observationId]);
    db.close();
  });

  test("admit --all-pending decides every recorded observation once and records refusals without the body", async () => {
    const root = workspace();
    const workOrderId = workOrder(root, { allowedActionClasses: ["READ_ONLY", "WRITE_LOW"] });
    await signedPolicy(root, policy({ workOrderId }));
    sourceObserveCli({ workspace: root, sourceId: "github-main", file: eventFile(root, commentEvent(), "a.json") });
    sourceObserveCli({ workspace: root, sourceId: "github-main", file: eventFile(root, commentEvent({ commentId: 5002, user: { id: 2002, login: "mallory", type: "User" } }), "b.json") });
    const first = await sourceAdmitCli({ workspace: root, allPending: true });
    expect(first.results.map((row) => (row.admitted ? row.state : row.reason)).sort()).toEqual(["proposed", "sender_not_allowed"]);
    const proposed = first.results.find((row) => row.admitted) as { actionClass: string };
    expect(proposed.actionClass).toBe("WRITE_LOW");
    expect((await sourceAdmitCli({ workspace: root, allPending: true })).results).toEqual([]);
    const status = sourceStatusCli({ workspace: root });
    expect(status.pending).toBe(0);
    expect(status.proposals.map((row) => row.state).sort()).toEqual(["not_admitted", "proposed"]);
    expect(JSON.stringify(status)).not.toContain("please look at this");
  });
});

describe("through the CLI (SH-INTEG-01/02)", () => {
  const cli = resolve("dist/cli.js");
  const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [cli, "integrations", "source", ...args], { cwd, encoding: "utf8", env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS }, timeout: 120_000 });

  test("observe records, check decides without storing, status reports; check exits 1 when not admitted", async () => {
    const root = workspace();
    const workOrderId = workOrder(root);
    const file = eventFile(root, commentEvent());
    const unsigned = run(root, ["check", "--source", "github-main", "--event", file]);
    expect(unsigned.status).toBe(1);
    expect(JSON.parse(unsigned.stdout)).toMatchObject({ admitted: false, reason: "policy_unverified" });
    await signedPolicy(root, policy({ workOrderId }));
    const verify = run(root, ["verify"]);
    expect(verify.status, verify.stderr).toBe(0);
    const check = run(root, ["check", "--source", "github-main", "--event", file]);
    expect(check.status, check.stderr).toBe(0);
    expect(JSON.parse(check.stdout)).toMatchObject({ admitted: true, workOrderId, agentId: "default" });
    expect(JSON.parse(run(root, ["status"]).stdout).pending).toBe(0);
    const observe = run(root, ["observe", "--source", "github-main", "--event", file]);
    expect(observe.status, observe.stderr).toBe(0);
    expect(JSON.parse(observe.stdout)).toMatchObject({ ok: true, inserted: true, actor: { class: "human" } });
    const admit = run(root, ["admit", "--all-pending"]);
    expect(admit.status, admit.stderr).toBe(0);
    expect(JSON.parse(admit.stdout).results[0]).toMatchObject({ admitted: true, state: "proposed" });
    const status = JSON.parse(run(root, ["status"]).stdout);
    expect(status.policy.verified).toBe(true);
    expect(status.proposals[0]).toMatchObject({ state: "proposed", approval: { status: "PENDING", required: 1 } });
  });
});

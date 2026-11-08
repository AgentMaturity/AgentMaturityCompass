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
import { listApprovalRequests, loadApprovalRequestRecord } from "../src/approvals/approvalChainStore.js";
import { approvalStatusPayload, decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { observationFromGitHubEvent, findMentions } from "../src/integrations/source/githubObservationParser.js";
import { admitSourceObservation } from "../src/integrations/source/sourceAdmission.js";
import {
  countSourceObservations, getSourceObservation, listProposals, listSourceObservationIds, openSourceIntakeDb, recordSourceObservation, releaseProposal, reserveProposal,
  settleProposal
} from "../src/integrations/source/sourceIntakeStore.js";
import { sourceAdmitCli, sourceCheckCli, sourceObserveCli, sourceStatusCli } from "../src/integrations/source/sourceIntakeCli.js";
import { MAX_RETAINED_BODY_BYTES, type SourceObservation } from "../src/integrations/source/sourceObservationSchema.js";
import { sourcePolicySchema, type SourcePolicy } from "../src/integrations/source/sourcePolicySchema.js";
import { initSourcePolicy, loadVerifiedSourcePolicy, signSourcePolicy, sourcePolicyPath } from "../src/integrations/source/sourcePolicyStore.js";
import { proposalQuorum, proposeSourceRequest, sourceIntentId } from "../src/integrations/source/sourceProposal.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { setMode } from "../src/mode/mode.js";
import type { ActionClass } from "../src/types.js";
import { createWorkOrder, expireWorkOrder } from "../src/workorders/workorderEngine.js";
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
const MALLORY = { id: 2002, login: "mallory", type: "User" };
/** `sender` is whoever caused the event; GitHub sets it to the author on `created`/`opened`, so the fixture does too. */
function commentEvent(overrides: { body?: string; user?: object; sender?: object; action?: string; commentId?: number; issueNumber?: number; repository?: object; updated?: string } = {}) {
  return {
    action: overrides.action ?? "created",
    issue: { id: 900, number: overrides.issueNumber ?? 7, title: "Flaky test", body: "see below", user: ALICE, created_at: "2026-11-07T10:00:00Z" },
    comment: { id: overrides.commentId ?? 5001, body: overrides.body ?? "@amc please look at this", user: overrides.user ?? ALICE,
      created_at: "2026-11-07T10:05:00Z", updated_at: overrides.updated ?? "2026-11-07T10:05:00Z" },
    repository: overrides.repository ?? REPO,
    sender: overrides.sender ?? overrides.user ?? ALICE
  };
}
function issueEvent(overrides: { action?: string; sender?: object; title?: string } = {}) {
  return {
    action: overrides.action ?? "opened",
    issue: { id: 901, number: 8, title: overrides.title ?? "@amc triage this", body: "details", user: ALICE, created_at: "2026-11-07T11:00:00Z" },
    repository: REPO,
    sender: overrides.sender ?? ALICE
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
function workOrder(root: string, overrides: { allowedActionClasses?: ActionClass[]; expiresTs?: number; agentId?: string } = {}): string {
  return createWorkOrder({ workspace: root, agentId: overrides.agentId ?? "default", title: "Triage", description: "Look at reports", riskTier: "low", requestedMode: "SIMULATE",
    allowedActionClasses: overrides.allowedActionClasses ?? ["READ_ONLY"], expiresTs: overrides.expiresTs ?? null }).workOrder.workOrderId;
}
/** A proposal setup: signed policy on a fresh work order, the observation recorded, the verified policy's source. */
async function proposalSetup(root: string, overrides: Parameters<typeof workOrder>[1] = {}, event: unknown = commentEvent()) {
  const workOrderId = workOrder(root, overrides);
  await signedPolicy(root, policy({ workOrderId }));
  const observation = parse(event);
  const db = openSourceIntakeDb(root);
  recordSourceObservation(db, observation);
  const loaded = loadVerifiedSourcePolicy(root);
  if (!loaded.ok) throw new Error(loaded.detail);
  const source = loaded.policy.sources.sources[0]!;
  const propose = (extra: { now?: number; beforeSettle?: () => void } = {}) =>
    proposeSourceRequest({ workspace: root, db, observation, source, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest, ...extra });
  return { workOrderId, observation, db, source, loaded, propose };
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

  test("the actor is the sender; an edit by anyone but the author is refused (S7)", () => {
    const refusal = (event: unknown) => observationFromGitHubEvent(event, { sourceId: "s", receivedAt: 1 });
    // Alice edits her own comment: admitted as alice.
    expect(parse(commentEvent({ action: "edited", body: "@amc please deploy the hotfix" })).actor).toEqual({ id: 1001, login: "alice", class: "human" });
    // A bot, an unlisted collaborator or a maintainer edits alice's comment: not alice's request.
    expect(refusal(commentEvent({ action: "edited", sender: { id: 4949, login: "some-app[bot]", type: "Bot" } }))).toMatchObject({ ok: false, reason: "editor_not_author" });
    expect(refusal(commentEvent({ action: "edited", sender: MALLORY }))).toMatchObject({ ok: false, reason: "editor_not_author", detail: expect.stringContaining("mallory (2002)") });
    expect(refusal(issueEvent({ action: "edited", sender: MALLORY, title: "@amc run the release job" }))).toMatchObject({ ok: false, reason: "editor_not_author" });
    // A payload whose sender is not the author on `created` is malformed or forged, never credited to the author.
    expect(refusal(commentEvent({ sender: MALLORY }))).toMatchObject({ ok: false, reason: "editor_not_author" });
    // No sender at all is not an event.
    const { sender: _sender, ...noSender } = commentEvent();
    expect(refusal(noSender)).toMatchObject({ ok: false, reason: "event_shape_invalid", detail: expect.stringContaining("sender") });
    // The class comes from the sender, so a bot sender on its own item is a bot.
    expect(parse(commentEvent({ user: { id: 78, login: "someapp", type: "Bot" } })).actor.class).toBe("bot");
  });

  test("Enterprise Managed User logins (handle_shortcode) are logins, in events and in the policy", () => {
    const bob = { id: 3003, login: "bob_acme", type: "User" };
    expect(parse(commentEvent({ user: bob, body: "@amc look" })).actor).toEqual({ id: 3003, login: "bob_acme", class: "human" });
    expect(() => policy({ allowedSenders: [{ id: 3003, login: "bob_acme" }] })).not.toThrow();
    expect(findMentions("ping @bob_acme and @amc")).toEqual(["amc", "bob_acme"]);
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

  test("a sentence-final or emphasised mention is a mention, as GitHub renders it", () => {
    expect(findMentions("Can you take a look, @amc.")).toEqual(["amc"]);
    expect(findMentions("_@amc_ please")).toEqual(["amc"]);
    expect(findMentions("thanks @amc!")).toEqual(["amc"]);
    expect(findMentions("see @amc.dev")).toEqual([]);
  });

  test("everything GitHub renders as code or hides is stripped before mentions are read", () => {
    for (const hidden of [
      "visible text <!-- hidden\n@amc do the thing",
      "log:\n```\n@amc do the thing",
      "run ``@amc`` literally",
      "Example:\n\n    @amc deploy\n",
      "Example:\n\n\t@amc deploy\n",
      "<code>@amc deploy</code>",
      "<pre>\n@amc deploy\n</pre>",
      "<pre>\n@amc deploy unterminated",
      "<img alt=\"@amc deploy\">",
      "> quoted line\n@amc continuation"
    ]) expect(findMentions(hidden), hidden).toEqual([]);
    // What follows a closed hidden region, or a blank line after a quote, is addressed.
    expect(findMentions("> quoted\n\n@amc after the quote")).toEqual(["amc"]);
    expect(findMentions("<!-- note -->\n@amc after the comment")).toEqual(["amc"]);
    expect(findMentions("a `lone backtick and @amc")).toEqual(["amc"]);
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

  test("a policy_unverified refusal is not recorded: the observation stays pending and is proposed once the policy is signed", async () => {
    const root = workspace();
    const workOrderId = workOrder(root);
    writePolicy(root, policy({ workOrderId }));
    sourceObserveCli({ workspace: root, sourceId: "github-main", file: eventFile(root, commentEvent()) });
    const unsigned = await sourceAdmitCli({ workspace: root, allPending: true });
    expect(unsigned.results).toMatchObject([{ admitted: false, reason: "policy_unverified", detail: "source policy signature missing" }]);
    expect(unsigned.remainingPending).toBe(1);
    expect(sourceStatusCli({ workspace: root })).toMatchObject({ pending: 1, proposalsTotal: 0 });
    await signSourcePolicy(root);
    const signed = await sourceAdmitCli({ workspace: root, allPending: true });
    expect(signed.results).toMatchObject([{ admitted: true, state: "proposed" }]);
    expect(signed.remainingPending).toBe(0);
  });

  test("observe and admit are owner-mode commands", async () => {
    const root = workspace();
    const file = eventFile(root, commentEvent());
    setMode(root, "agent");
    expect(() => sourceObserveCli({ workspace: root, sourceId: "github-main", file })).toThrow(/agent mode/);
    await expect(sourceAdmitCli({ workspace: root, allPending: true })).rejects.toThrow(/agent mode/);
    // check only reads, so CI in agent mode still gets its answer.
    expect(sourceCheckCli({ workspace: root, sourceId: "github-main", file })).toMatchObject({ admitted: false, reason: "policy_unverified" });
    setMode(root, "owner");
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
    // Replay files nothing new.
    const again = await proposeSourceRequest({ workspace: root, db, observation, source, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest });
    expect(again).toEqual({ state: "already_proposed", approvalRequestId: request.approvalRequestId });
    // An observation another live filer has reserved is held: nothing is filed for it.
    const second = parse(commentEvent({ commentId: 5002 }));
    recordSourceObservation(db, second);
    const reservation = reserveProposal(db, second.observationId, Date.now());
    expect(reservation.outcome).toBe("reserved");
    const held = await proposeSourceRequest({ workspace: root, db, observation: second, source, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest });
    expect(held).toEqual({ state: "held" });
    expect(listApprovalRequests({ workspace: root, agentId: "default" })).toHaveLength(1);
    // Only the reservation's holder can settle or release it.
    expect(settleProposal(db, second.observationId, "not-the-token", { state: "not_admitted", reason: "x" }, Date.now())).toBe(false);
    expect(settleProposal(db, second.observationId, "not-the-token", { state: "proposed", approvalRequestId: "apprreq_x" }, Date.now())).toBe(false);
    releaseProposal(db, second.observationId, "not-the-token");
    expect(listSourceObservationIds(db, { pendingOnly: true })).toEqual([]);
    releaseProposal(db, second.observationId, (reservation as { token: string }).token);
    expect(listSourceObservationIds(db, { pendingOnly: true })).toEqual([second.observationId]);
    // A human decides with the existing approvals engine (only an EXECUTE approval counts toward quorum); status reflects it.
    decideApprovalForIntent({ workspace: root, agentId: "default", approvalId: request.approvalRequestId, decision: "APPROVED", mode: "EXECUTE", reason: "ok",
      username: "owner", userId: "owner", userRoles: ["OWNER"] });
    db.close();
    const status = sourceStatusCli({ workspace: root });
    expect(status.proposals.find((row) => row.observationId === observation.observationId)?.approval).toMatchObject({ status: "QUORUM_MET", required: 1, received: 1 });
  });

  test("a filer whose reservation was taken over after the TTL cancels its own request, so one request stays filed", async () => {
    const root = workspace();
    const { observation, db, propose } = await proposalSetup(root);
    const t0 = Date.now();
    let takerRequestId = "";
    const outcome = await propose({
      now: t0,
      beforeSettle: () => {
        // 61 s later another filer takes the stale reservation over and files its own request.
        const taken = reserveProposal(db, observation.observationId, t0 + 61_000);
        if (taken.outcome !== "reserved") throw new Error(`taker got ${taken.outcome}`);
        takerRequestId = `apprreq_taker_${t0}`;
        expect(settleProposal(db, observation.observationId, taken.token, { state: "proposed", approvalRequestId: takerRequestId }, t0 + 61_000)).toBe(true);
      }
    });
    expect(outcome).toMatchObject({ state: "refused", reason: "approval_refused", detail: expect.stringMatching(/taken over by another filer; request apprreq_\S+ cancelled$/) });
    const rows = listProposals(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "proposed", approvalRequestId: takerRequestId, token: null });
    const requests = listApprovalRequests({ workspace: root, agentId: "default" });
    expect(requests).toHaveLength(1);
    expect(loadApprovalRequestRecord({ workspace: root, agentId: "default", approvalRequestId: requests[0]!.approvalRequestId }).status).toBe("CANCELLED");
    db.close();
  });

  test("a signed work order of another agent placed under the source agent's directory is a mismatch, and check refuses what admit refuses", async () => {
    const root = workspace();
    const otherId = workOrder(root, { agentId: "other" });
    const from = join(getAgentPaths(root, "other").rootDir, "workorders");
    const to = join(getAgentPaths(root, "default").rootDir, "workorders");
    mkdirSync(to, { recursive: true });
    for (const name of [`${otherId}.json`, `${otherId}.json.sig`]) writeFileSync(join(to, name), readFileSync(join(from, name)));
    await signedPolicy(root, policy({ workOrderId: otherId }));
    const observation = parse(commentEvent());
    const db = openSourceIntakeDb(root);
    recordSourceObservation(db, observation);
    const loaded = loadVerifiedSourcePolicy(root);
    if (!loaded.ok) throw new Error(loaded.detail);
    const outcome = await proposeSourceRequest({ workspace: root, db, observation, source: loaded.policy.sources.sources[0]!, sender: { id: 1001, login: "alice" }, policyDigest: loaded.digest });
    expect(outcome).toMatchObject({ state: "refused", reason: "work_order_agent_mismatch", detail: "work order belongs to other, source names default" });
    expect(listApprovalRequests({ workspace: root, agentId: "default" })).toHaveLength(0);
    db.close();
    const file = eventFile(root, commentEvent());
    expect(sourceCheckCli({ workspace: root, sourceId: "github-main", file })).toMatchObject({ admitted: false, reason: "work_order_agent_mismatch" });
  });

  test("check verifies the bound work order: expired and revoked work orders are not admitted", async () => {
    const root = workspace();
    const file = eventFile(root, commentEvent());
    const expired = workOrder(root, { expiresTs: Date.now() - 1 });
    await signedPolicy(root, policy({ workOrderId: expired }));
    expect(sourceCheckCli({ workspace: root, sourceId: "github-main", file })).toMatchObject({ admitted: false, reason: "work_order_unavailable", detail: expect.stringContaining("expired") });
    const live = workOrder(root);
    await signedPolicy(root, policy({ workOrderId: live }));
    expect(sourceCheckCli({ workspace: root, sourceId: "github-main", file })).toMatchObject({ admitted: true, workOrderId: live });
    expireWorkOrder({ workspace: root, agentId: "default", workOrderId: live, reason: "test" });
    expect(sourceCheckCli({ workspace: root, sourceId: "github-main", file })).toMatchObject({ admitted: false, reason: "work_order_unavailable" });
  });

  test("the proposal is filed under the strictest class as the approval policy rates it, with every allowed rule folded into the floor", async () => {
    const root = workspace();
    // Default policy: SECURITY is OWNER/AUDITOR, NETWORK_EXTERNAL is APPROVER/OWNER; the catalogue order would pick NETWORK_EXTERNAL.
    expect(proposalQuorum(root, ["SECURITY", "NETWORK_EXTERNAL"])).toEqual({ actionClass: "SECURITY", quorumFloor: { requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER"] } });
    expect(proposalQuorum(root, ["NETWORK_EXTERNAL", "DEPLOY"]).actionClass).toBe("DEPLOY");
    expect(proposalQuorum(root, ["READ_ONLY"])).toEqual({ actionClass: "READ_ONLY", quorumFloor: { requiredApprovals: 1, requireDistinctUsers: false, rolesAllowed: ["APPROVER", "OWNER"] } });
    const { workOrderId, observation, db, propose } = await proposalSetup(root, { allowedActionClasses: ["SECURITY", "NETWORK_EXTERNAL"] });
    const outcome = await propose();
    expect(outcome).toMatchObject({ state: "proposed", actionClass: "SECURITY" });
    const request = listApprovalRequests({ workspace: root, agentId: "default" })[0]!;
    expect(request).toMatchObject({ workOrderId, intentId: sourceIntentId(observation.observationId), requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER"] });
    // Two APPROVER-only users do not count toward quorum (the SECURITY rule allows OWNER/AUDITOR only); two distinct OWNERs do.
    const decide = (userId: string, userRoles: Array<"APPROVER" | "OWNER">) => decideApprovalForIntent({ workspace: root, agentId: "default", approvalId: request.approvalRequestId,
      decision: "APPROVED", mode: "EXECUTE", reason: "ok", username: userId, userId, userRoles });
    const quorum = () => approvalStatusPayload({ workspace: root, agentId: "default", approvalId: request.approvalRequestId }).quorum;
    decide("a1", ["APPROVER"]);
    decide("a2", ["APPROVER"]);
    expect(quorum()).toMatchObject({ required: 2, received: 0 });
    decide("o1", ["OWNER"]);
    decide("o2", ["OWNER"]);
    expect(quorum()).toMatchObject({ required: 2, received: 2, status: "QUORUM_MET" });
    db.close();
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
    expect(status.sources[0]).toMatchObject({ observations: 2, pending: 0 });
  });

  test("counts are exact beyond the list cap; proposals list newest first", async () => {
    const root = workspace();
    const db = openSourceIntakeDb(root);
    const ids = [5001, 5002, 5003].map((commentId) => { const o = parse(commentEvent({ commentId })); recordSourceObservation(db, o); return o.observationId; });
    expect(listSourceObservationIds(db, { pendingOnly: true, limit: 2 })).toHaveLength(2);
    expect(countSourceObservations(db, { pendingOnly: true })).toBe(3);
    expect(countSourceObservations(db, { sourceId: "github-main" })).toBe(3);
    expect(countSourceObservations(db, { sourceId: "other" })).toBe(0);
    const first = reserveProposal(db, ids[0]!, 1_000) as { token: string };
    settleProposal(db, ids[0]!, first.token, { state: "not_admitted", reason: "old" }, 1_000);
    const second = reserveProposal(db, ids[1]!, 2_000) as { token: string };
    settleProposal(db, ids[1]!, second.token, { state: "proposed", approvalRequestId: "apprreq_new" }, 2_000);
    expect(listProposals(db).map((row) => row.state)).toEqual(["proposed", "not_admitted"]);
    expect(listProposals(db, 1)).toHaveLength(1);
    expect(countSourceObservations(db, { pendingOnly: true })).toBe(1);
    db.close();
  });
});

describe("through the CLI (SH-INTEG-01/02)", () => {
  const cli = resolve("dist/cli.js");
  const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [cli, "integrations", "source", ...args], { cwd, encoding: "utf8", env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS }, timeout: 120_000 });

  test("observe records, check decides without storing, status reports; check exits 1 when not admitted", { timeout: 120_000 }, async () => {
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
    expect(JSON.parse(admit.stdout)).toMatchObject({ results: [{ admitted: true, state: "proposed" }], remainingPending: 0 });
    const status = JSON.parse(run(root, ["status"]).stdout);
    expect(status.policy.verified).toBe(true);
    expect(status.proposals[0]).toMatchObject({ state: "proposed", approval: { status: "PENDING", required: 1 } });
  });
});

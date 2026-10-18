/**
 * P1-34 review records: the verifier binds a record to a signed approval decision over the subject digest, refuses
 * agents, self-review and unconfirmed F5 verdicts, and expires a record whose subject changed. The quorum needs two
 * distinct humans, one credentialed for the subject's domain. Reviewer names here are fixture labels, not people.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approvalRequestBindingDigest, loadApprovalRequestRecord } from "../../../src/approvals/approvalChainStore.js";
import { createApprovalForIntent, decideApprovalForIntent } from "../../../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../../../src/approvals/approvalPolicyEngine.js";
import type { UserRole } from "../../../src/auth/roles.js";
import {
  catalogReviewIntent, meetsReviewQuorum, verifyReviewRecord, type ReviewContext, type ReviewRecord, type ReviewSubject
} from "../../../src/catalog/governance/reviewRecord.js";
import { getAgentPaths } from "../../../src/fleet/paths.js";
import { newWorkspace } from "../l0/workspaces.js";

const SUBJECT = { kind: "control", id: "L1-WLT-US-01", version: "0.1.0", digest: `sha256:${"a".repeat(64)}` } as const;

function setup(): string {
  const ws = newWorkspace("amc-gov-");
  initApprovalPolicy(ws);
  return ws;
}

function requestReview(ws: string, subject: ReviewRecord["subject"] = SUBJECT): string {
  return createApprovalForIntent({ workspace: ws, agentId: "default", ...catalogReviewIntent(subject),
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high" }).approval.approvalRequestId;
}

function decide(ws: string, approvalId: string, userId: string, opts: { denied?: boolean; roles?: UserRole[]; bound?: boolean } = {}): void {
  const request = loadApprovalRequestRecord({ workspace: ws, agentId: "default", approvalRequestId: approvalId, requireValidSignature: true });
  decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: opts.denied ? "DENIED" : "APPROVED", mode: "EXECUTE",
    reason: "catalog review fixture", userId, username: userId, userRoles: opts.roles ?? ["OWNER"],
    ...(opts.bound === false ? {} : { expectedRequestDigestSha256: approvalRequestBindingDigest(request) }) });
}

function record(approvalRequestId: string, userId = "fixture-reviewer-a", over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    recordVersion: 1, id: `rr-${userId}`, subject: SUBJECT, role: "domain_lead",
    reviewer: { name: `Fixture ${userId}`, credential: "fixture credential", affiliation: "fixture", conflictsDeclared: "none (fixture)",
      identity: { userId, kind: "human" } },
    decision: "approve", scope: ["statement", "citations"], aiInputs: [], notes: "", decidedAt: "2026-10-18", nextReviewDue: "2026-11-17",
    approvalRequestId, ...over
  };
}

const ctx = (ws: string, over: Partial<ReviewContext> = {}): ReviewContext =>
  ({ workspace: ws, agentId: "default", currentDigest: SUBJECT.digest, authors: ["fixture-author"], f5Confirmations: [], ...over });

describe("verifyReviewRecord (P1-34 step 3)", () => {
  it("a human record bound to a signed decision over the subject digest verifies", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    expect(verifyReviewRecord(record(id), ctx(ws))).toMatchObject({ status: "valid", reason: null });
  });

  it("refuses a record whose reviewer identity is an agent", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    const agent = record(id);
    (agent.reviewer.identity as { kind: string }).kind = "agent";
    expect(verifyReviewRecord(agent, ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_RECORD_INVALID" });
  });

  it("refuses a decision signed by a user holding the AGENT role, whatever the record declares", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a", { roles: ["AGENT"] });
    expect(verifyReviewRecord(record(id), ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_AGENT_IDENTITY" });
  });

  it("refuses self-review: the reviewer authored the subject or the change", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    expect(verifyReviewRecord(record(id), ctx(ws, { authors: ["Fixture-Reviewer-A"] })))
      .toMatchObject({ status: "refused", reason: "GOV_REVIEW_SELF_REVIEW" });
    expect(verifyReviewRecord(record(id), ctx(ws, { authors: ["fixture fixture-reviewer-a"] })))
      .toMatchObject({ status: "refused", reason: "GOV_REVIEW_SELF_REVIEW" });
  });

  it("refuses a blank credential or conflicts declaration", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    const blank = record(id);
    for (const field of ["credential", "conflictsDeclared"] as const) {
      const r = { ...blank, reviewer: { ...blank.reviewer, [field]: "  " } };
      expect(verifyReviewRecord(r, ctx(ws)).reason, field).toBe("GOV_REVIEW_RECORD_INVALID");
    }
  });

  it("a subject edited after the decision makes the record expired", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    expect(verifyReviewRecord(record(id), ctx(ws, { currentDigest: `sha256:${"b".repeat(64)}` })))
      .toMatchObject({ status: "expired", reason: "GOV_REVIEW_SUBJECT_CHANGED" });
  });

  it("refuses a record claiming a digest the approval was not bound to", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    const other = { ...SUBJECT, digest: `sha256:${"c".repeat(64)}` };
    expect(verifyReviewRecord(record(id, undefined, { subject: other }), ctx(ws, { currentDigest: other.digest })))
      .toMatchObject({ status: "refused", reason: "GOV_REVIEW_APPROVAL_UNBOUND" });
  });

  it("refuses a missing or unreadable approval request", () => {
    const ws = setup();
    expect(verifyReviewRecord(record("apprreq_missing"), ctx(ws)))
      .toMatchObject({ status: "refused", reason: "GOV_REVIEW_APPROVAL_UNVERIFIED" });
  });

  it("refuses every record on a request whose decision chain was tampered with", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    decide(ws, id, "fixture-reviewer-b");
    const dir = join(getAgentPaths(ws, "default").rootDir, "approvals", "decisions");
    const other = readdirSync(dir).map((f) => join(dir, f)).find((p) => p.endsWith(".json") && readFileSync(p, "utf8").includes("fixture-reviewer-b"))!;
    writeFileSync(other, readFileSync(other, "utf8").replace("catalog review fixture", "edited after signing"));
    expect(verifyReviewRecord(record(id), ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_APPROVAL_UNVERIFIED" });
  });

  it("refuses when the reviewer has no decision on the request", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-b");
    expect(verifyReviewRecord(record(id), ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_DECISION_MISSING" });
  });

  it("refuses a decision recorded without the request binding digest", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a", { bound: false });
    expect(verifyReviewRecord(record(id), ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_DECISION_UNBOUND" });
  });

  it("refuses an approve record over a denial, and accepts a reject record over one", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a", { denied: true });
    expect(verifyReviewRecord(record(id), ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_DECISION_MISMATCH" });
    expect(verifyReviewRecord(record(id, undefined, { decision: "reject" }), ctx(ws))).toMatchObject({ status: "valid" });
  });

  it("refuses a confirmed F5 verdict without a confirmation row naming this record", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    const r = record(id, undefined, { aiInputs: [{ kind: "f5_verdict", ref: "wealth/fixture-pack/WLT-01", confirmed: true }] });
    expect(verifyReviewRecord(r, ctx(ws))).toMatchObject({ status: "refused", reason: "GOV_REVIEW_F5_UNCONFIRMED" });
    const row = { station: "wealth", packId: "fixture-pack", questionId: "WLT-01", verdict: "rewrite" as const, reviewRecordId: r.id };
    expect(verifyReviewRecord(r, ctx(ws, { f5Confirmations: [row] }))).toMatchObject({ status: "valid" });
    expect(verifyReviewRecord(r, ctx(ws, { f5Confirmations: [{ ...row, reviewRecordId: "rr-other" }] })).reason).toBe("GOV_REVIEW_F5_UNCONFIRMED");
  });
});

describe("meetsReviewQuorum (P1-34 step 4)", () => {
  const subject: ReviewSubject = { ...SUBJECT, domains: ["wealth"], aiDrafted: false };
  const experts = new Map([["fixture-reviewer-a", ["wealth"]], ["fixture-legal", ["legal"]]]);
  const qctx = (ws: string) => ({ workspace: ws, agentId: "default", authors: ["fixture-author"], f5Confirmations: [], experts });

  it("one reviewer is not a quorum", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    expect(meetsReviewQuorum(subject, [record(id)], qctx(ws))).toMatchObject({ met: false, reasons: ["GOV_QUORUM_TWO_HUMANS"] });
  });

  it("two humans, one credentialed for the subject's domain, are a quorum", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    decide(ws, id, "fixture-reviewer-b");
    const result = meetsReviewQuorum(subject, [record(id), record(id, "fixture-reviewer-b", { role: "second_reviewer" })], qctx(ws));
    expect(result).toMatchObject({ met: true, reasons: [] });
    expect(result.approvers.sort()).toEqual(["fixture-reviewer-a", "fixture-reviewer-b"]);
  });

  it("two humans with no domain credential are not a quorum; one record twice is one human", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-b");
    decide(ws, id, "fixture-reviewer-c");
    expect(meetsReviewQuorum(subject, [record(id, "fixture-reviewer-b"), record(id, "fixture-reviewer-c")], qctx(ws)).reasons)
      .toEqual(["GOV_QUORUM_DOMAIN_EXPERT"]);
    const ws2 = setup();
    const id2 = requestReview(ws2);
    decide(ws2, id2, "fixture-reviewer-a");
    expect(meetsReviewQuorum(subject, [record(id2), record(id2)], qctx(ws2)).reasons).toEqual(["GOV_QUORUM_TWO_HUMANS"]);
  });

  it("a citation needs a credentialed legal reviewer", () => {
    const cited = { ...SUBJECT, kind: "citation" as const };
    const citation: ReviewSubject = { ...subject, ...cited };
    const ws = setup();
    const id = requestReview(ws, cited);
    decide(ws, id, "fixture-reviewer-a");
    decide(ws, id, "fixture-reviewer-b");
    const two = [record(id, "fixture-reviewer-a", { subject: cited }), record(id, "fixture-reviewer-b", { subject: cited })];
    expect(meetsReviewQuorum(citation, two, qctx(ws)).reasons).toEqual(["GOV_QUORUM_LEGAL_REVIEWER"]);
    const ws2 = setup();
    const id2 = requestReview(ws2, cited);
    decide(ws2, id2, "fixture-reviewer-a");
    decide(ws2, id2, "fixture-legal");
    const withLegal = [record(id2, "fixture-reviewer-a", { subject: cited }), record(id2, "fixture-legal", { subject: cited, role: "legal_reviewer" })];
    expect(meetsReviewQuorum(citation, withLegal, qctx(ws2))).toMatchObject({ met: true });
  });

  it("AI-drafted content needs a human approval confirming the draft", () => {
    const drafted: ReviewSubject = { ...subject, aiDrafted: true };
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    decide(ws, id, "fixture-reviewer-b");
    const plain = [record(id), record(id, "fixture-reviewer-b")];
    expect(meetsReviewQuorum(drafted, plain, qctx(ws)).reasons).toEqual(["GOV_QUORUM_AI_DRAFT"]);
    const confirming = [record(id, undefined, { aiInputs: [{ kind: "draft", ref: "L1-WLT-US-01@0.1.0", confirmed: true }] }), plain[1]];
    expect(meetsReviewQuorum(drafted, confirming, qctx(ws))).toMatchObject({ met: true });
  });

  it("a verified objection blocks the quorum, and refused or expired records never count", () => {
    const ws = setup();
    const id = requestReview(ws);
    decide(ws, id, "fixture-reviewer-a");
    decide(ws, id, "fixture-reviewer-b");
    const objection = requestReview(ws);
    decide(ws, objection, "fixture-reviewer-c", { denied: true });
    const records = [record(id), record(id, "fixture-reviewer-b"), record(objection, "fixture-reviewer-c", { decision: "request_changes" })];
    expect(meetsReviewQuorum(subject, records, qctx(ws)).reasons).toEqual(["GOV_QUORUM_OBJECTION"]);
    const moved = { ...subject, digest: `sha256:${"d".repeat(64)}` };
    expect(meetsReviewQuorum(moved, [record(id), record(id, "fixture-reviewer-b")], qctx(ws)).reasons)
      .toEqual(["GOV_QUORUM_TWO_HUMANS", "GOV_QUORUM_DOMAIN_EXPERT"]);
  });
});

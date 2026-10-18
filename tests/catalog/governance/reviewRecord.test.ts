/**
 * P1-34 review records: a record counts only when a key that a signed trust list pins for catalog-review signed it, the
 * record names that key's trust-list subject as its reviewer, and the reviewer did not author the subject. Forged,
 * unpinned, self-signed and self-reviewed records are unverified and move nothing. Subjects here are fixture labels.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { meetsReviewQuorum, verifyReviewRecord, type ReviewContext, type ReviewSubject } from "../../../src/catalog/governance/reviewRecord.js";
import { ed25519KeyId, loadTrustContext } from "../../../src/trust/index.js";
import { pinnedTrust } from "../../helpers/trustContext.js";
import { NOW, REVIEWERS, SUBJECT, author, keyA, keyB, keyC, keyLegal, keypair, record, root, signedList, trust } from "./reviewers.js";

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext =>
  ({ trust: REVIEWERS, currentDigest: SUBJECT.digest, authors: ["fixture-author"], f5Confirmations: [], ...over });

describe("verifyReviewRecord (P1-34 step 3)", () => {
  it("a record signed by a key pinned for catalog-review, naming that key's subject, verifies", () => {
    expect(verifyReviewRecord(record(keyA, "fixture-reviewer-a"), ctx())).toMatchObject({ status: "valid", reason: null, reviewer: "fixture-reviewer-a" });
  });

  it("a forged record (edited after signing, or a borrowed signature) is unverified", () => {
    const signed = record(keyA, "fixture-reviewer-a", { decision: "reject" });
    expect(verifyReviewRecord({ ...signed, decision: "approve" }, ctx())).toMatchObject({ status: "unverified", reason: "GOV_REVIEW_SIGNATURE_INVALID" });
    const other = record(keyB, "fixture-reviewer-b");
    expect(verifyReviewRecord({ ...signed, signature: other.signature }, ctx()).reason).toBe("GOV_REVIEW_SIGNATURE_INVALID");
  });

  it("a self-signed record by a key no trust list pins is unverified, whatever its fields say", () => {
    const stranger = keypair();
    expect(verifyReviewRecord(record(stranger, "fixture-reviewer-a"), ctx())).toMatchObject({ status: "unverified", reason: "GOV_REVIEW_SIGNER_UNPINNED", reviewer: null });
  });

  it("only a signed trust list pins reviewer authority: not a --pubkey pin, --allow-unpinned, another purpose or a revoked key", () => {
    const r = record(keyA, "fixture-reviewer-a");
    expect(verifyReviewRecord(r, ctx({ trust: pinnedTrust([{ publicKeyPem: keyA.publicKeyPem, purposes: ["catalog-review"] }]) })).reason).toBe("GOV_REVIEW_SIGNER_UNPINNED");
    expect(verifyReviewRecord(r, ctx({ trust: { ...trust([]), allowUnpinned: true } })).reason).toBe("GOV_REVIEW_SIGNER_UNPINNED");
    expect(verifyReviewRecord(r, ctx({ trust: trust([{ key: keyA, subject: "fixture-reviewer-a", purposes: ["artifact-seal"] }]) })).reason).toBe("GOV_REVIEW_SIGNER_UNPINNED");
    expect(verifyReviewRecord(r, ctx({ trust: trust([{ key: keyA, subject: "fixture-reviewer-a", revoked: true }]) })).reason).toBe("GOV_REVIEW_SIGNER_UNPINNED");
  });

  it("a decision date after the server's verification time cannot admit the key", () => {
    expect(verifyReviewRecord(record(keyA, "fixture-reviewer-a", { decidedAt: "2026-12-01" }), ctx()).reason).toBe("GOV_REVIEW_SIGNER_UNPINNED");
  });

  it("the reviewer comes from the signature: a record naming anyone else is unverified", () => {
    expect(verifyReviewRecord(record(keyA, "fixture-reviewer-b"), ctx())).toMatchObject({ status: "unverified", reason: "GOV_REVIEW_REVIEWER_UNKNOWN", reviewer: "fixture-reviewer-a" });
  });

  it("refuses a record whose reviewer identity is an agent", () => {
    const agent = record(keyA, "fixture-reviewer-a");
    (agent.reviewer.identity as { kind: string }).kind = "agent";
    expect(verifyReviewRecord(agent, ctx())).toMatchObject({ status: "unverified", reason: "GOV_REVIEW_RECORD_INVALID" });
  });

  it("refuses self-review: the signing reviewer authored the subject or the change", () => {
    expect(verifyReviewRecord(record(author, "fixture-author"), ctx())).toMatchObject({ status: "unverified", reason: "GOV_REVIEW_SELF_REVIEW" });
    expect(verifyReviewRecord(record(keyA, "fixture-reviewer-a"), ctx({ authors: [" Fixture-Reviewer-A "] })).reason).toBe("GOV_REVIEW_SELF_REVIEW");
  });

  it("refuses a blank credential or conflicts declaration", () => {
    for (const field of ["credential", "conflictsDeclared"] as const) {
      const base = record(keyA, "fixture-reviewer-a");
      const blank = record(keyA, "fixture-reviewer-a", { reviewer: { ...base.reviewer, [field]: "  " } });
      expect(verifyReviewRecord(blank, ctx()).reason, field).toBe("GOV_REVIEW_RECORD_INVALID");
    }
  });

  it("a subject edited after the review makes the record expired", () => {
    expect(verifyReviewRecord(record(keyA, "fixture-reviewer-a"), ctx({ currentDigest: `sha256:${"b".repeat(64)}` })))
      .toMatchObject({ status: "expired", reason: "GOV_REVIEW_SUBJECT_CHANGED" });
  });

  it("refuses a confirmed F5 verdict without a confirmation row naming this record", () => {
    const r = record(keyA, "fixture-reviewer-a", { aiInputs: [{ kind: "f5_verdict", ref: "wealth/fixture-pack/WLT-01", confirmed: true }] });
    expect(verifyReviewRecord(r, ctx()).reason).toBe("GOV_REVIEW_F5_UNCONFIRMED");
    const row = { station: "wealth", packId: "fixture-pack", questionId: "WLT-01", verdict: "rewrite" as const, reviewRecordId: r.id };
    expect(verifyReviewRecord(r, ctx({ f5Confirmations: [row] })).status).toBe("valid");
    expect(verifyReviewRecord(r, ctx({ f5Confirmations: [{ ...row, reviewRecordId: "rr-other" }] })).reason).toBe("GOV_REVIEW_F5_UNCONFIRMED");
  });

  it("through the operator's AMC home: pinned there it verifies; an m-of-n policy the list does not meet loads no trust", () => {
    const home = mkdtempSync(join(tmpdir(), "amc-gov-home-"));
    try {
      mkdirSync(join(home, "trust"), { recursive: true, mode: 0o700 });
      writeFileSync(join(home, "trust", "amc-trust-list.json"), JSON.stringify(signedList([{ key: keyA, subject: "fixture-reviewer-a" }])), { mode: 0o600 });
      const rootsFile = (roots: string[], threshold: number) =>
        writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots, threshold }), { mode: 0o600 });
      rootsFile([ed25519KeyId(root.publicKeyPem)!], 1);
      expect(verifyReviewRecord(record(keyA, "fixture-reviewer-a"), ctx({ trust: loadTrustContext({ amcHome: home, now: NOW }) })).status).toBe("valid");
      rootsFile([ed25519KeyId(root.publicKeyPem)!, ed25519KeyId(keyB.publicKeyPem)!], 2);
      expect(() => loadTrustContext({ amcHome: home, now: NOW })).toThrow(/required/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("meetsReviewQuorum (P1-34 step 4)", () => {
  const subject: ReviewSubject = { ...SUBJECT, domains: ["wealth"], aiDrafted: false };
  const experts = new Map([["fixture-reviewer-a", ["wealth"]], ["fixture-legal", ["legal"]]]);
  const qctx = { trust: REVIEWERS, authors: ["fixture-author"], f5Confirmations: [], experts };
  const a = record(keyA, "fixture-reviewer-a");
  const b = record(keyB, "fixture-reviewer-b", { role: "second_reviewer" });

  it("one reviewer is not a quorum", () => {
    expect(meetsReviewQuorum(subject, [a], qctx)).toMatchObject({ met: false, reasons: ["GOV_QUORUM_TWO_HUMANS"] });
  });

  it("two pinned humans, one credentialed for the subject's domain, are a quorum", () => {
    const result = meetsReviewQuorum(subject, [a, b], qctx);
    expect(result).toMatchObject({ met: true, reasons: [] });
    expect(result.approvers.sort()).toEqual(["fixture-reviewer-a", "fixture-reviewer-b"]);
  });

  it("forged, unpinned or self-review records never count", () => {
    const forged = { ...record(keyB, "fixture-reviewer-b", { decision: "reject" }), decision: "approve" };
    const stranger = record(keypair(), "fixture-reviewer-c");
    const self = record(author, "fixture-author");
    expect(meetsReviewQuorum(subject, [a, forged, stranger, self], qctx).reasons).toEqual(["GOV_QUORUM_TWO_HUMANS"]);
  });

  it("no domain credential is no quorum; one reviewer twice is one human", () => {
    expect(meetsReviewQuorum(subject, [b, record(keyC, "fixture-reviewer-c")], qctx).reasons).toEqual(["GOV_QUORUM_DOMAIN_EXPERT"]);
    expect(meetsReviewQuorum(subject, [a, record(keyA, "fixture-reviewer-a", { id: "rr-again" })], qctx).reasons).toEqual(["GOV_QUORUM_TWO_HUMANS"]);
    expect(meetsReviewQuorum(subject, [a, b], { ...qctx, experts: new Map() }).reasons).toEqual(["GOV_QUORUM_DOMAIN_EXPERT"]);
  });

  it("a citation needs a credentialed legal reviewer", () => {
    const cited = { ...SUBJECT, kind: "citation" as const };
    const citation: ReviewSubject = { ...subject, ...cited };
    expect(meetsReviewQuorum(citation, [record(keyA, "fixture-reviewer-a", { subject: cited }), record(keyB, "fixture-reviewer-b", { subject: cited })], qctx).reasons)
      .toEqual(["GOV_QUORUM_LEGAL_REVIEWER"]);
    expect(meetsReviewQuorum(citation, [record(keyA, "fixture-reviewer-a", { subject: cited }),
      record(keyLegal, "fixture-legal", { subject: cited, role: "legal_reviewer" })], qctx)).toMatchObject({ met: true });
  });

  it("AI-drafted content needs a human approval confirming the draft", () => {
    const drafted: ReviewSubject = { ...subject, aiDrafted: true };
    expect(meetsReviewQuorum(drafted, [a, b], qctx).reasons).toEqual(["GOV_QUORUM_AI_DRAFT"]);
    const confirming = record(keyA, "fixture-reviewer-a", { aiInputs: [{ kind: "draft", ref: "L1-WLT-US-01@0.1.0", confirmed: true }] });
    expect(meetsReviewQuorum(drafted, [confirming, b], qctx)).toMatchObject({ met: true });
  });

  it("a valid objection blocks the quorum; expired records never count", () => {
    expect(meetsReviewQuorum(subject, [a, b, record(keyC, "fixture-reviewer-c", { decision: "request_changes" })], qctx).reasons).toEqual(["GOV_QUORUM_OBJECTION"]);
    expect(meetsReviewQuorum({ ...subject, digest: `sha256:${"d".repeat(64)}` }, [a, b], qctx).reasons).toEqual(["GOV_QUORUM_TWO_HUMANS", "GOV_QUORUM_DOMAIN_EXPERT"]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { approvalDecisionSchema, approvalRequestBindingDigest, approvalRequestSchema } from "../src/approvals/approvalChainStore.js";
import { evaluateApprovalQuorum } from "../src/approvals/approvalQuorum.js";

/**
 * Records written before P1-78 keep parsing and keep their binding digest (A4 constraints 3 and 4). The fixture was built
 * from int 8d1e8e7d7 before any P1-78 edit: an engine request and its bound decision as the engine wrote them, and an
 * A4-shaped gate request as src/a4/a4Gates.ts parses one. a4Verify recomputes approvalRequestBindingDigest offline over
 * exported bundles, so a changed digest for an old record would turn every exported gate invalid.
 */
const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/approvals/pre-p1-78/approval-records.json"), "utf8")) as {
  engineRequest: { record: Record<string, unknown>; bindingDigest: string };
  engineDecision: { record: Record<string, unknown> };
  a4Request: { record: Record<string, unknown>; bindingDigest: string };
};
const strictRequest = z.strictObject(approvalRequestSchema.shape);
const strictDecision = z.strictObject(approvalDecisionSchema.shape);

describe("approval records written before P1-78", () => {
  for (const [name, entry] of [["engine request", fixture.engineRequest], ["A4 gate request", fixture.a4Request]] as const) {
    it(`${name}: parses under the strict schema unchanged and digests as it did`, () => {
      const parsed = strictRequest.parse(entry.record);
      expect(parsed, "nothing stripped, nothing added").toEqual(entry.record);
      expect(approvalRequestSchema.parse(entry.record)).toEqual(entry.record);
      expect(approvalRequestBindingDigest(approvalRequestSchema.parse(entry.record))).toBe(entry.bindingDigest);
      // Status evolves outside the digest, as before.
      expect(approvalRequestBindingDigest({ ...approvalRequestSchema.parse(entry.record), status: "QUORUM_MET" })).toBe(entry.bindingDigest);
    });
  }

  it("decision: parses under the strict schema, stays bound to the request digest and still counts", () => {
    const decision = strictDecision.parse(fixture.engineDecision.record);
    expect(decision).toEqual(fixture.engineDecision.record);
    expect(decision.requestDigestSha256).toBe(fixture.engineRequest.bindingDigest);
    const request = approvalRequestSchema.parse(fixture.engineRequest.record);
    const quorum = evaluateApprovalQuorum({ request, decisions: [approvalDecisionSchema.parse(fixture.engineDecision.record)], now: request.createdTs + 1 });
    expect(quorum).toMatchObject({ status: "PENDING", received: 1, approverUserIds: ["approver-1"] });
  });
});

describe("a request that records its initiator (P1-78)", () => {
  const withInitiator = { ...fixture.engineRequest.record, initiator: "LOCAL_USER:requester-1" };
  const decision = (userId: string, kind: "APPROVE_EXECUTE" | "DENY") =>
    approvalDecisionSchema.parse({ ...fixture.engineDecision.record, approvalDecisionId: `apprdec_${userId}`, userId, username: userId, decision: kind });

  it("parses under the strict schema and digests exactly as it would without an initiator (constraint 4)", () => {
    const parsed = strictRequest.parse(withInitiator);
    expect(parsed.initiator).toBe("LOCAL_USER:requester-1");
    expect(approvalRequestBindingDigest(parsed)).toBe(fixture.engineRequest.bindingDigest);
  });

  it("does not count the initiator's approval, matched by the user id an A4 key names (constraint 5); its DENY still denies", () => {
    const request = approvalRequestSchema.parse(withInitiator);
    const now = request.createdTs + 1;
    const counted = evaluateApprovalQuorum({ request, now, decisions: [decision("requester-1", "APPROVE_EXECUTE"), decision("approver-2", "APPROVE_EXECUTE")] });
    expect(counted).toMatchObject({ status: "PENDING", received: 1, approverUserIds: ["approver-2"] });
    const bare = evaluateApprovalQuorum({ request: { ...request, initiator: "requester-1" }, now, decisions: [decision("requester-1", "APPROVE_EXECUTE")] });
    expect(bare.received, "an unprefixed initiator is a user id").toBe(0);
    expect(evaluateApprovalQuorum({ request, now, decisions: [decision("requester-1", "DENY")] }).status).toBe("DENIED");
  });
});

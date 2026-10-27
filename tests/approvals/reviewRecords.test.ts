import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fileReviewRecord, requestReviewRecord, reviewStatusFor, verifiedReviewRecords, type ReviewRecordV1 } from "../../src/approvals/reviewRecords.js";
import { signArtifactFile, verifyArtifactFileSignature } from "../../src/lifecycle/artifactSignature.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AGENT, AUDITOR, cleanupGovernanceFixtures, decideBound, governanceFixture, loginAs, OWNER } from "../governor/governanceFixture.js";

/**
 * P2-24 review records on real signed records and approval requests with bound decisions: a review counts only for the
 * exact digest it reviewed. Reviewer and requester ids are fixture data.
 */
afterEach(() => { reviewers.clear(); cleanupGovernanceFixtures(); });

const reviewers = new Map<string, ReturnType<typeof loginAs>>();
/** The reviewer: a real users.yaml AUDITOR with a tracked login, one per workspace. */
const reviewer = (workspace: string) => {
  if (!reviewers.has(workspace)) reviewers.set(workspace, loginAs(workspace, "fixture-reviewer", ["AUDITOR"]));
  return reviewers.get(workspace)!;
};

async function review(workspace: string, sha256: string, decision: ReviewRecordV1["decision"], options: {
  findings?: ReviewRecordV1["findings"]; expiresAt?: string | null } = {}): Promise<ReviewRecordV1> {
  const { draft, approval } = await requestReviewRecord(workspace, AGENT, { subject: { kind: "agent-output", id: "summary-001", sha256 },
    decision, sessionTokenFile: reviewer(workspace).tokenFile, requesterId: "fixture-requester", findings: options.findings ?? [], expiresAt: options.expiresAt ?? null });
  decideBound(workspace, approval, [OWNER, AUDITOR]);
  return fileReviewRecord(workspace, draft, approval);
}

const status = (workspace: string, sha256: string) => reviewStatusFor(workspace, { kind: "agent-output", id: "summary-001", currentSha256: sha256 });

describe("P2-24 review records bind to the exact digest", () => {
  test("a valid signed receipt for an agent summary, rejected with material_fact_omitted, is rejected and never passes (decisive L346)", async () => {
    const f = governanceFixture();
    const path = join(f.workspace, "summary.json");
    writeFileSync(path, JSON.stringify({ summary: "Q3 refunds were within limits." }));
    signArtifactFile({ workspace: f.workspace, path, artifactKind: "lifecycle-artifact" });
    expect(verifyArtifactFileSignature({ workspace: f.workspace, path, artifactKind: "lifecycle-artifact" }).valid).toBe(true);
    const digest = sha256Hex(readFileSync(path));
    expect(status(f.workspace, digest)).toBe("pending");
    await review(f.workspace, digest, "rejected", { findings: [{ code: "material_fact_omitted", severity: "major", note: "omits the chargeback spike" }] });
    expect(status(f.workspace, digest)).toBe("rejected");
  });

  test("a review of digest A does not count after the artifact changed to B (decisive L348: stale)", async () => {
    const f = governanceFixture();
    const a = sha256Hex("version A"), b = sha256Hex("version B");
    await review(f.workspace, a, "approved");
    expect(status(f.workspace, a)).toBe("approved");
    expect(status(f.workspace, b)).toBe("pending");
  });

  test("approved and rejected reviews of the same digest give rejected (contradictory gives no pass)", async () => {
    const f = governanceFixture();
    const digest = sha256Hex("contested");
    await review(f.workspace, digest, "approved");
    await review(f.workspace, digest, "rejected");
    expect(status(f.workspace, digest)).toBe("rejected");
  });

  test("changes_requested alone stays pending, and a lapsed approval is expired", async () => {
    const f = governanceFixture();
    const digest = sha256Hex("needs work");
    await review(f.workspace, digest, "changes_requested");
    expect(status(f.workspace, digest)).toBe("pending");
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await review(f.workspace, digest, "approved", { expiresAt });
    expect(status(f.workspace, digest)).toBe("approved");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(expiresAt) + 1);
    expect(status(f.workspace, digest)).toBe("expired");
  });

  test("a reviewer equal to the requester is refused at creation", async () => {
    const f = governanceFixture();
    await expect(requestReviewRecord(f.workspace, AGENT, { subject: { kind: "agent-output", id: "summary-001", sha256: sha256Hex("x") },
      decision: "approved", sessionTokenFile: reviewer(f.workspace).tokenFile, requesterId: reviewer(f.workspace).userId, findings: [], expiresAt: null }))
      .rejects.toThrow(/reviewer_is_requester/);
  });

  test("the reviewer comes from the authenticated session, and no session refuses", async () => {
    const f = governanceFixture();
    const filed = await review(f.workspace, sha256Hex("who reviewed"), "approved");
    expect(filed.reviewer).toEqual({ userId: reviewer(f.workspace).userId, roles: ["AUDITOR"] });
    await expect(requestReviewRecord(f.workspace, AGENT, { subject: { kind: "agent-output", id: "summary-001", sha256: sha256Hex("x") },
      decision: "approved", sessionTokenFile: join(f.workspace, "missing.token"), requesterId: "fixture-requester", findings: [], expiresAt: null }))
      .rejects.toThrow(/principal_unresolved/);
  });

  test("a tampered review record is never counted", async () => {
    const f = governanceFixture();
    const digest = sha256Hex("tamper target");
    const filed = await review(f.workspace, digest, "rejected");
    const dir = join(f.workspace, ".amc", "governor", "reviews");
    expect(readdirSync(dir)).toEqual([`${filed.reviewId}.json`, `${filed.reviewId}.json.sig`]);
    writeFileSync(join(dir, `${filed.reviewId}.json`), `${JSON.stringify({ ...filed, decision: "approved" }, null, 2)}\n`);
    expect(verifiedReviewRecords(f.workspace)).toEqual([]);
    expect(status(f.workspace, digest)).toBe("pending");
  });
});

/**
 * P2-35 · design §17 "Tampered record". Reason codes: A4_SIDE_ROW_MISMATCH (a deleted or altered side row is detected
 * from the transition body although no transition was touched), A4_CHAIN_INVALID, and readiness reading BLOCKED.
 * P2-41: every integrity failure the API answers is 409 A4_INTEGRITY_FAILED with the fixed verdict as its detail and no
 * row named; the problems are in GET …/verify, for a verified member (or a workspace OWNER or AUDITOR) only. The
 * append-only triggers are dropped first: the attacker here has the database file.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { verifyA4Chain } from "../../src/a4/a4Verify.js";
import { addUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

async function project() {
  const ws = a4Workspace();
  const p = await A4Project.create(ws.workspace, ws.alice);
  await p.addMember(ws.alice, ws.bob);
  await p.proposeAspire();
  return { ...ws, p };
}

/** Drops `table`'s triggers and runs `sql` on it, as someone holding the database file could. */
function tamper(workspace: string, table: string, sql: string, ...args: unknown[]): void {
  const store = openA4Store(workspace);
  try {
    const db = store.ledger.db;
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").all(table) as Array<{ name: string }>) {
      db.exec(`DROP TRIGGER "${name}"`);
    }
    expect(db.prepare(sql).run(...args).changes).toBe(1);
  } finally {
    store.close();
  }
}

function report(workspace: string, projectId: string) {
  const store = openA4Store(workspace);
  try {
    return verifyA4Chain(store.ledger, projectId);
  } finally {
    store.close();
  }
}
const codesOf = (value: unknown): string => JSON.stringify(value);
const VERDICT = { status: "BLOCKED", reasonCodes: ["A4_INTEGRITY_FAILED"] };
/** The fixed integrity refusal: 409, the verdict as detail, and nothing of the failed rows. */
function blocked(reply: Awaited<ReturnType<A4Project["get"]>>): void {
  expect(refusal(reply)).toEqual([409, "A4_INTEGRITY_FAILED"]);
  expect(reply.body.detail).toEqual(VERDICT);
  expect(JSON.stringify(reply.body)).not.toMatch(/a4_|LOCAL_USER|SIDE_ROW|CHAIN_INVALID|spec/);
}

describe("scenario: tampered record", () => {
  test("the untouched chain verifies", async () => {
    const { workspace, p } = await project();
    expect(codesOf(report(workspace, p.projectId))).not.toMatch(/A4_SIDE_ROW_MISMATCH|A4_CHAIN_INVALID/);
  });

  test.each([
    ["a deleted member row", "a4_members", "DELETE FROM a4_members WHERE principal_key LIKE 'LOCAL_USER:%' AND event = 'added' AND seq = 1"],
    ["an altered member role", "a4_members", "UPDATE a4_members SET roles_json = '[\"owner\"]' WHERE seq = 1"],
    ["a deleted evidence ref", "a4_evidence_refs", "DELETE FROM a4_evidence_refs WHERE rowid = (SELECT max(rowid) FROM a4_evidence_refs)"],
    ["an altered evidence ref digest", "a4_evidence_refs", `UPDATE a4_evidence_refs SET sha256 = '${"e".repeat(64)}' WHERE rowid = (SELECT max(rowid) FROM a4_evidence_refs)`],
    ["an altered revision spec", "a4_revisions", "UPDATE a4_revisions SET spec_json = '{}' WHERE revision_no = (SELECT max(revision_no) FROM a4_revisions)"]
  ])("%s fails verification and blocks readiness and the API", async (_name, table, sql) => {
    const { workspace, p, alice } = await project();
    tamper(workspace, table, sql);
    expect(codesOf(report(workspace, p.projectId))).toMatch(/A4_SIDE_ROW_MISMATCH|A4_CHAIN_INVALID/);
    const verify = await p.get(alice, "/verify");
    expect(verify.status).toBe(200);
    expect(codesOf(verify.body.data!.report)).toMatch(/A4_SIDE_ROW_MISMATCH|A4_CHAIN_INVALID/);
    // Readiness is not evaluated over rows that fail verification: it reads BLOCKED, as a refusal naming no row.
    blocked(await p.get(alice, "/readiness"));
    // Every other route that loads the project, read or write, answers the same verdict and nothing more.
    blocked(await p.get(alice));
    blocked(await p.get(alice, "/transitions"));
    blocked(await p.post(alice, "/hold", { reason: "on tampered rows" }));
  });

  test("a head row that no longer parses answers the verdict and a fixed message, never its parse issue", async () => {
    const { workspace, p, alice } = await project();
    tamper(workspace, "a4_projects", "UPDATE a4_projects SET head_digest = 'leaked-stored-value' WHERE project_id = ?", p.projectId);
    for (const reply of [await p.get(alice), await p.get(alice, "/readiness"), await p.post(alice, "/hold", { reason: "x" })]) {
      blocked(reply);
      expect(reply.body.error).toBe("A stored A4 record does not parse.");
      expect(JSON.stringify(reply.body)).not.toMatch(/leaked-stored-value|head_digest/);
    }
  });

  /** A workspace VIEWER who is a project member, and one who is not; neither is a workspace OWNER or AUDITOR. */
  async function viewers() {
    const ws = await project();
    const member = addUser({ workspace: ws.workspace, username: "carol", roles: ["VIEWER"], password: "p241-carol-password" });
    const outsider = addUser({ workspace: ws.workspace, username: "dave", roles: ["VIEWER"], password: "p241-dave-password" });
    expect((await ws.p.post(ws.alice, "/members", { principalKey: `LOCAL_USER:${member.userId}`, projectRoles: ["viewer"] })).status).toBe(200);
    return { ...ws, carol: { userId: member.userId }, dave: { userId: outsider.userId } };
  }

  test("GET …/verify reports the problems to a verified member only; a non-member is 403", async () => {
    const { workspace, p, carol, dave } = await viewers();
    tamper(workspace, "a4_evidence_refs", "DELETE FROM a4_evidence_refs WHERE rowid = (SELECT max(rowid) FROM a4_evidence_refs)");
    const report = await p.get(carol, "/verify");
    expect(report.status).toBe(200);
    expect(codesOf(report.body.data!.report)).toMatch(/A4_SIDE_ROW_MISMATCH|A4_CHAIN_INVALID/);
    blocked(await p.get(carol, "/readiness"));
    expect(refusal(await p.get(dave, "/verify"))).toEqual([403, "A4_NOT_A_MEMBER"]);
    blocked(await p.get(dave));
  });

  test("when the member rows fail, GET …/verify refuses a non-privileged reader with the fixed verdict", async () => {
    const { workspace, p, alice, carol, dave } = await viewers();
    tamper(workspace, "a4_members", "UPDATE a4_members SET roles_json = '[\"owner\"]' WHERE seq = 1");
    blocked(await p.get(carol, "/verify"));
    blocked(await p.get(dave, "/verify"));
    // A workspace OWNER still reads the report: it exists to show a failing chain.
    expect((await p.get(alice, "/verify")).status).toBe(200);
  });
});

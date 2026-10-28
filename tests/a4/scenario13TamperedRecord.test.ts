/**
 * P2-35 · design §17 "Tampered record". Reason codes: A4_SIDE_ROW_MISMATCH (a deleted or altered side row is detected
 * from the transition body although no transition was touched), A4_CHAIN_INVALID, and the readiness read
 * refused (409 A4_INTEGRITY_FAILED). The append-only triggers are dropped first: the attacker here has the database file.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { verifyA4Chain } from "../../src/a4/a4Verify.js";
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
    // Readiness is not evaluated over rows that fail verification: the read itself answers the integrity failure.
    expect(refusal(await p.get(alice, "/readiness"))).toEqual([409, "A4_INTEGRITY_FAILED"]);
    // A write against the tampered project is refused rather than built on it.
    const write = await p.post(alice, "/hold", { reason: "on tampered rows" });
    expect(write.status).toBeGreaterThanOrEqual(400);
    expect(write.status).toBeLessThan(500);
  });
});

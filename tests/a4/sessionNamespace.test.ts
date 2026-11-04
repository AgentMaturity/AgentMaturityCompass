/**
 * The reserved `a4-` session namespace (src/ledger/ledgerSessionTransactions.ts): binary_path is a plain string any
 * session start may name, so a caller that chooses `binaryPath: "a4-store"` must still be refused; only the A4 store's
 * capability opens an `a4-` session.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { openLedger } from "../../src/ledger/ledger.js";
import { A4_STORE_BINARY } from "../../src/ledger/ledgerSessionTransactions.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("the a4- session namespace", () => {
  test("a caller-chosen binaryPath \"a4-store\" cannot open an a4- session; the store still can", async () => {
    const { workspace, alice } = a4Workspace();
    const ledger = openLedger(workspace);
    try {
      expect(() => ledger.startSession({ sessionId: `a4-a4p_${"0".repeat(32)}-0`, runtime: "unknown", binaryPath: A4_STORE_BINARY, binarySha256: A4_STORE_BINARY }))
        .toThrow(/A4_SESSION_RESERVED/);
      expect(ledger.db.prepare("SELECT count(*) AS n FROM sessions WHERE session_id LIKE 'a4-%'").get()).toEqual({ n: 0 });
    } finally {
      ledger.close();
    }
    const p = await A4Project.create(workspace, alice);
    const check = openLedger(workspace);
    try {
      expect(check.db.prepare("SELECT binary_path FROM sessions WHERE session_id = ?").get(`a4-${p.projectId}-0`)).toEqual({ binary_path: A4_STORE_BINARY });
    } finally {
      check.close();
    }
  });
});

import { describe, expect, test } from "vitest";
import { withOracleFixture, type OracleOutput } from "../helpers/financeOracleQualification.js";

// Independently authored required IDs; never imported from the verifier being tested.
const CHECKS = ["inputs", "txlog-chain", "post-count", "commit-count", "no-duplicate", "no-dispatch-on-deny",
  "payload-bound", "payload-minimal", "receipt-state", "unauthorized-effects", "action-evidence-coverage",
  "control-result", "cold-ledger-verifier", "snapshot-stable", "action-chain", "authorization"];
function checked(output: OracleOutput, id: string): boolean {
  const rows = output.checks.filter(row => row.id === id);
  expect(rows).toHaveLength(1); expect(typeof rows[0].passed).toBe("boolean");
  expect(typeof rows[0].evidence).toBe("string"); expect(rows[0].evidence.length).toBeGreaterThan(0);
  return rows[0].passed;
}
function protocol(output: OracleOutput): void {
  expect(output.schemaVersion).toBe("2026-09-08");
  expect(output.checks.map(row => row.id).sort()).toEqual([...CHECKS].sort());
  for (const id of CHECKS) checked(output, id);
}
function refused(output: OracleOutput, ids: string[]): void {
  protocol(output); expect(output.verdict).toBe("fail");
  for (const id of ids) expect(checked(output, id), id).toBe(false);
}
function positive(output: OracleOutput): void {
  protocol(output); expect(output.verdict).toBe("pass");
  for (const id of CHECKS) expect(checked(output, id), id).toBe(true);
}

describe("P1-19 finite independent oracle with genuine signed action producers", () => {
  test("a real completed journaled payment passes every mandatory oracle check", async () => {
    await withOracleFixture("completed", async f => positive(await f.runOracle()));
  });
  test("a second real payment under another key and the same reference specifically fails no-duplicate", async () => {
    await withOracleFixture("duplicate", async f => {
      const output = await f.runOracle(); refused(output, ["no-duplicate"]);
      expect(checked(output, "txlog-chain")).toBe(true); expect(checked(output, "post-count")).toBe(true); expect(checked(output, "commit-count")).toBe(true);
    });
  });
  test("an actual post-authorization amount corruption specifically fails payload-bound", async () => {
    await withOracleFixture("body-mismatch", async f => {
      const output = await f.runOracle(); refused(output, ["payload-bound"]);
      expect(checked(output, "txlog-chain")).toBe(true); expect(checked(output, "post-count")).toBe(true); expect(checked(output, "commit-count")).toBe(true);
    });
  });
  test("a genuine provider-only commit has no matching completed AMC receipt", async () => {
    await withOracleFixture("provider-only", async f => {
      const output = await f.runOracle(); refused(output, ["receipt-state", "unauthorized-effects"]);
      for (const id of ["inputs", "txlog-chain", "post-count", "commit-count", "payload-minimal"]) expect(checked(output, id), id).toBe(true);
    });
  });
  test("a copied closed log with its final newline removed specifically fails txlog-chain", async () => {
    await withOracleFixture("completed", async f => {
      positive(await f.runOracle()); f.truncateLog(); refused(await f.runOracle(), ["txlog-chain"]);
    });
  });
  test("adapter stdout pass and verified flags cannot manufacture a receipt or trust anchor", async () => {
    await withOracleFixture("provider-only", async f => {
      const output = await f.runOracle({ adapterStdout: JSON.stringify({ verdict: "pass", verified: true,
        receipt: { state: "completed", approved: true }, monitor: "untrusted-adapter-key", unauthorizedEffects: 0 }) });
      refused(output, ["receipt-state", "unauthorized-effects"]);
      for (const id of ["inputs", "txlog-chain", "post-count", "commit-count", "payload-minimal"]) expect(checked(output, id), id).toBe(true);
    });
  });
  test("changing a genuine pre-dispatch argument preimage cannot preserve authorization", async () => {
    await withOracleFixture("completed", async f => {
      positive(await f.runOracle()); f.tamperPreimage(); refused(await f.runOracle(), ["authorization", "payload-bound"]);
    });
  });
  test("a corrupted genuine decision signature is refused without re-signing authority", async () => {
    await withOracleFixture("completed", async f => {
      positive(await f.runOracle()); f.tamperApprovalSignature(); refused(await f.runOracle(), ["authorization"]);
    });
  });
  test("a genuine signed one-decision policy cannot weaken the external two-decision oracle profile", async () => {
    await withOracleFixture("weaker-policy", async f => {
      const output = await f.runOracle(); refused(output, ["authorization"]);
      for (const id of ["inputs", "txlog-chain", "post-count", "commit-count", "payload-minimal", "cold-ledger-verifier", "action-chain"]) {
        expect(checked(output, id), id).toBe(true);
      }
    });
  });
  test("unsupported case expectations fail inputs instead of being silently ignored", async () => {
    await withOracleFixture("unsupported-expectation", async f => {
      const output = await f.runOracle(); refused(output, ["inputs"]);
      expect(output.checks.find(row => row.id === "inputs")!.evidence).toContain("unsupported expected fields");
      // Other checks are deliberately not reached after this explicit input-contract refusal.
    });
  });
});

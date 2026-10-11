/**
 * Shared reader for the Layer 0 fixtures (P1-14). Tests key off the fixture files: each executed harness runs every
 * fixture whose `setup.harness` names it, so content and test cannot drift apart. `evidence` fixtures run through
 * P1-11's evaluateControl (evidenceFixtures.test.ts); every other harness drives a real enforcement point.
 */
import { loadCatalog } from "../../../src/catalog/loader.js";
import type { ControlRecord, FixtureEnvelope } from "../../../src/catalog/types.js";

export const catalog = loadCatalog();
export const layer0 = [...catalog.controls.values()].filter((c) => c.layer === 0).sort((a, b) => (a.id < b.id ? -1 : 1));

/** Each executed harness and the test file that runs it. A control is "executed" when one of its fixtures names one. */
export const EXECUTED_HARNESSES: Readonly<Record<string, string>> = {
  agent_config: "inventory.test.ts",
  compiled_identity: "identity.test.ts",
  lease: "identity.test.ts",
  lease_revocation_drill: "identity.test.ts",
  tool_allowlist: "tools.test.ts",
  egress_guard: "tools.test.ts",
  data_admission: "data.test.ts",
  residency_egress: "data.test.ts",
  bound_approval: "oversight.test.ts",
  approval_quorum: "oversight.test.ts",
  ledger_trace: "logging.test.ts",
  ledger_tamper: "logging.test.ts",
  deletion_gate: "logging.test.ts",
  drift: "monitoring.test.ts",
  incident_clocks: "monitoring.test.ts"
};

export interface L0Fixture {
  readonly ref: string;
  readonly control: ControlRecord;
  readonly envelope: FixtureEnvelope;
}

export function allFixtures(): L0Fixture[] {
  return layer0.flatMap((control) => control.tests.flatMap((t) => [...t.fixtures.positive, ...t.fixtures.negative].map((ref) => {
    const envelope = catalog.fixtures.get(ref)?.envelope;
    if (!envelope) throw new Error(`fixture ${ref} did not load`);
    return { ref, control, envelope };
  })));
}

export const harnessOf = (f: L0Fixture): string => String(f.envelope.setup.harness);

/** The fixtures one harness runs, optionally for one control. */
export function fixturesFor(harness: string, controlId?: string): L0Fixture[] {
  return allFixtures().filter((f) => harnessOf(f) === harness && (controlId === undefined || f.control.id === controlId));
}

/** The control ids that have at least one executed-harness fixture. */
export function executedControlIds(): string[] {
  return [...new Set(allFixtures().filter((f) => harnessOf(f) in EXECUTED_HARNESSES).map((f) => f.control.id))].sort();
}

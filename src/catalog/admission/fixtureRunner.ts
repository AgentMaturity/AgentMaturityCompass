/**
 * Runs a pack's fixtures for admission criteria 6 and 8 (P1-33), in process and offline. An evidence fixture
 * (`setup.harness: "evidence"`) runs through P1-11's evaluateControl as tests/catalog/l0/evidenceFixtures.test.ts runs
 * it. Any other fixture runs only through a guard harness the caller registered under its `setup.harness` name; the
 * executed harnesses live in the test suite (tests/catalog/l0/harness.ts), so `amc catalog check` registers none and
 * reports those fixtures as not run, never as passed. Guard harnesses are asynchronous, so runGuardHarnesses runs them
 * first and runFixtures (synchronous, so the loader's gate can recompute admission) reads their results. A negative
 * fixture that yields pass or allow is a false mandatory pass. Fixture content is untrusted: a setup that does not fit or a harness that throws is a failure, never a pass.
 */
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { evaluateControl } from "../evidence/evaluate.js";
import type { ControlPlan, EvaluationContext, EvidenceItem } from "../evidence/types.js";
import type { LoadedCatalog } from "../loader.js";
import type { ControlRecord, FixtureEnvelope } from "../types.js";
import type { FixtureRun } from "./types.js";

/** Drives one guard fixture against its real enforcement point and resolves to what that point decided. */
export type GuardHarness = (envelope: FixtureEnvelope, control: ControlRecord) => Promise<{ result: string; reasonCode: string | null }>;

export interface FixtureOutcome {
  controlId: string;
  /** The ref under catalog/fixtures/. */
  fixture: string;
  envelope: FixtureEnvelope;
  harness: string;
  /** What the run gave; null when no harness ran it. */
  actual: string | null;
  /** The result and reason code match `expected`. */
  matches: boolean;
}

interface EvidenceSetup {
  window: EvaluationContext["window"];
  subject: EvaluationContext["subject"];
  plan: { applicability: string; policyDigest: string; mode: ControlPlan["mode"] };
  items: Array<Omit<EvidenceItem, "claimedAt" | "ref"> & { ref: Omit<EvidenceItem["ref"], "sha256"> }>;
  priorUses: NonNullable<EvaluationContext["priorUses"]>;
}

const applicabilityOf = (state: string): ControlPlan["applicability"] =>
  state === "applicable" ? { state: "applicable" }
    : state === "not_applicable" ? { state: "not_applicable", rationale: "the fixture's plan excludes the control" }
      : { state: "unresolved", reason: `the fixture's plan leaves applicability ${state}` };

function runEvidence(envelope: FixtureEnvelope, control: ControlRecord, cat: LoadedCatalog): { result: string; reasons: string[] } {
  const setup = envelope.setup as unknown as EvidenceSetup;
  const items: EvidenceItem[] = setup.items.map((row) => ({ ...row, claimedAt: null, ref: { ...row.ref, sha256: sha256Hex(canonicalize(row)) } }));
  const result = evaluateControl(control, items, {
    subject: setup.subject, window: setup.window, invalidations: [], reviews: [], producers: cat.producers, priorUses: setup.priorUses,
    plan: { digest: "sha256:fixture-plan", policyDigest: setup.plan.policyDigest, applicability: applicabilityOf(String(setup.plan.applicability)), mode: setup.plan.mode }
  });
  return { result: result.dimensions.result, reasons: [...result.rejected.map((r) => r.reason), result.dimensions.evidence] };
}

/** What each registered guard harness gave, by fixture ref; a harness that threw is recorded as an error. */
export type GuardResults = ReadonlyMap<string, { result: string; reasonCode: string | null } | { error: string }>;

const fixtureRefs = (controls: readonly ControlRecord[]) =>
  controls.flatMap((control) => control.tests.flatMap((t) => [...t.fixtures.positive, ...t.fixtures.negative]).map((ref) => ({ control, ref })));

/** Runs the guard fixtures whose `setup.harness` is registered; the only asynchronous part of a check. */
export async function runGuardHarnesses(cat: LoadedCatalog, controls: readonly ControlRecord[],
  harnesses: Readonly<Record<string, GuardHarness>> = {}): Promise<GuardResults> {
  const out = new Map<string, { result: string; reasonCode: string | null } | { error: string }>();
  for (const { control, ref } of fixtureRefs(controls)) {
    const envelope = cat.fixtures.get(ref)?.envelope;
    const harness = String(envelope?.setup.harness ?? "");
    const guard = envelope && harness !== "evidence" && Object.hasOwn(harnesses, harness) ? harnesses[harness] : undefined;
    if (!guard || !envelope) continue;
    try {
      out.set(ref, await guard(envelope, control));
    } catch (error) {
      out.set(ref, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return out;
}

function runOne(envelope: FixtureEnvelope, control: ControlRecord, cat: LoadedCatalog, harness: string, ref: string,
  guards: GuardResults): { actual: string | null; matches: boolean } {
  const { result: expected, reasonCode } = envelope.expected;
  try {
    if (harness === "evidence") {
      const run = runEvidence(envelope, control, cat);
      return { actual: run.result, matches: run.result === expected && (reasonCode === null || run.reasons.includes(reasonCode)) };
    }
    const run = guards.get(ref);
    if (!run) return { actual: null, matches: false };
    if ("error" in run) return { actual: `error: ${run.error}`, matches: false };
    return { actual: run.result, matches: run.result === expected && (reasonCode === null || run.reasonCode === reasonCode) };
  } catch (error) {
    return { actual: `error: ${error instanceof Error ? error.message : String(error)}`, matches: false };
  }
}

/**
 * Every fixture of `controls`' tests, in test order: evidence fixtures run here, guard fixtures take what
 * runGuardHarnesses recorded (none, in the loader's gate and in `amc catalog check`). A ref the catalog does not hold is
 * a failure. `mandatoryControls` counts the mandatory ones among `controls`.
 */
export function runFixtures(cat: LoadedCatalog, controls: readonly ControlRecord[], guards: GuardResults = new Map()): { run: FixtureRun; outcomes: FixtureOutcome[] } {
  const outcomes: FixtureOutcome[] = [];
  const failures: FixtureRun["failures"] = [];
  for (const { control, ref } of fixtureRefs(controls)) {
    const envelope = cat.fixtures.get(ref)?.envelope;
    if (!envelope) {
      failures.push({ controlId: control.id, fixture: ref, expected: "a fixture envelope", actual: "missing or unparsable" });
      continue;
    }
    const harness = String(envelope.setup.harness ?? "");
    const { actual, matches } = runOne(envelope, control, cat, harness, ref, guards);
    outcomes.push({ controlId: control.id, fixture: ref, envelope, harness, actual, matches });
    const { result, reasonCode } = envelope.expected;
    if (actual !== null && !matches) failures.push({ controlId: control.id, fixture: ref, expected: `${result}${reasonCode ? ` (${reasonCode})` : ""}`, actual });
  }
  return {
    outcomes,
    run: {
      mandatoryControls: controls.filter((c) => c.mandatory).length,
      fixtures: outcomes.filter((o) => o.actual !== null).length,
      falseMandatoryPasses: outcomes.filter(isFalsePass).length,
      failures
    }
  };
}

/** A negative fixture that passed or was allowed. */
export const isFalsePass = (o: FixtureOutcome): boolean => o.envelope.polarity === "negative" && (o.actual === "pass" || o.actual === "allow");

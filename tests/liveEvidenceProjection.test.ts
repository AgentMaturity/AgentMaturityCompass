import { describe, expect, it } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { evaluateGate, parseEvidenceEvent, type ParsedEvidenceEvent } from "../src/diagnostic/gates.js";
import {
  LIVE_PROJECTION_VERSION,
  LIVE_PROJECTION_RULES,
  HARNESS_EMITTED_EVIDENCE_TYPES,
  projectQuestionIds,
  ruleMatches,
  DEFERRED_PROJECTIONS
} from "../src/diagnostic/liveEvidenceProjection.js";
import { toolEvidenceFor } from "../src/tools/toolEvidence.js";
import type { ToolExecution, ToolOutcome } from "../src/tools/toolTypes.js";

/**
 * P5.2a — which harness facts evidence which questions.
 *
 * The r224 correction made evidence count only toward the question it is
 * tagged to. A governed run writes signed `audit`/`metric` rows and tags none
 * of them, so measured end-to-end it scores 0 of 244 questions. This module is
 * the binding that makes harness evidence scoreable — and the binding is a
 * METHODOLOGICAL claim, not an observed fact, so it is declared, versioned,
 * and tested rather than inferred.
 */
const execution = (over: Partial<ToolExecution> = {}): ToolExecution => ({
  token: "tok_1",
  callId: "c1",
  rootCallId: "c1",
  name: "fs.read",
  agentId: "a",
  workspace: "/w",
  actionClass: "READ_ONLY",
  requestedMode: "EXECUTE",
  effectiveMode: "EXECUTE",
  arguments: {},
  parentToken: null,
  ...over
} as ToolExecution);

const outcome = (over: Partial<ToolOutcome> = {}): ToolOutcome => ({
  ok: true,
  exitCode: null,
  timedOut: false,
  denied: null,
  output: "",
  bytes: 0,
  ...over
} as ToolOutcome);

const denial = (guardLabel: string): Partial<ToolOutcome> => ({
  ok: false,
  denied: { stage: "guard", reason: "refused", guardLabel }
});

describe("the projection only names questions that exist", () => {
  it("binds no unknown question id", () => {
    // A rule naming a question that was renamed or retired binds evidence to
    // nothing and reads as coverage. The bank is the authority.
    const known = new Set(questionBank.map((q) => q.id));
    const unknown = LIVE_PROJECTION_RULES
      .flatMap((rule) => rule.questionIds)
      .filter((id) => !known.has(id));

    expect(unknown, "every projected question must exist in the bank").toEqual([]);
  });
});

describe("the projection is not decoration", () => {
  it("every rule's OWN evidence can clear a gate of every question it binds", () => {
    // The invariant that matters, and the one an earlier version got wrong.
    //
    // Asking "does this question have SOME gate the harness could reach"
    // passes even when the evidence THIS RULE produces cannot reach it. That
    // is exactly what happened: rules bound on denial only, denied calls emit
    // no `stdout`, and every question's L1 gate requires `stdout` — so those
    // bindings read as coverage and could never move a score. Measured
    // end-to-end, AMC-5.21 and AMC-5.29 sat at L0 holding six refs each.
    //
    // So this asks the real emitter what a matching call actually writes.
    const dead: string[] = [];

    for (const rule of LIVE_PROJECTION_RULES) {
      const call = execution({ appliedGuards: rule.guardLabel ? [rule.guardLabel] : [] });
      const result = outcome({ output: "produced", bytes: 8 });
      expect(ruleMatches(rule, call, result), `${rule.id} must match its own representative call`).toBe(true);

      const emitted = new Set(toolEvidenceFor(call, result).map((row) => row.eventType));
      for (const id of rule.questionIds) {
        const question = questionBank.find((q) => q.id === id)!;
        const clears = question.gates.some(
          (gate) => gate.level > 0 && gate.requiredEvidenceTypes.every((t) => emitted.has(t))
        );
        if (!clears) dead.push(`${rule.id} -> ${id}`);
      }
    }

    expect(dead, "a binding whose own evidence clears no gate is decoration").toEqual([]);
    expect(new Set(HARNESS_EMITTED_EVIDENCE_TYPES).has("stdout"), "L1 needs it").toBe(true);
  });

  it("cannot reach L4 or L5 on harness evidence alone", () => {
    // L4 adds `artifact` and L5 adds `test` for essentially the whole bank.
    // Those are red-team pack and build artifacts, not tool-call receipts. If
    // a projected question could reach L5 from tool calls, the projection
    // would be manufacturing "Optimizing" out of routine traffic.
    const emitted = new Set<string>(HARNESS_EMITTED_EVIDENCE_TYPES);
    const overreaching: string[] = [];

    for (const id of new Set(LIVE_PROJECTION_RULES.flatMap((r) => r.questionIds))) {
      const question = questionBank.find((q) => q.id === id)!;
      for (const gate of question.gates.filter((g) => g.level >= 4)) {
        if (gate.requiredEvidenceTypes.every((t) => emitted.has(t))) overreaching.push(`${id}@L${gate.level}`);
      }
    }

    expect(overreaching, "harness evidence must not be able to gate L4/L5").toEqual([]);
  });
});

describe("what a governed call evidences", () => {
  it("binds an allowed call to the audit-trail and efficiency questions", () => {
    // Both are evidenced by a complete, audited call regardless of outcome.
    // The bank asks for exactly this: AMC-SCI-2 wants "complete tool-call
    // audit logs", AMC-OPDISC-6 wants "tool-call cost/latency".
    const ids = projectQuestionIds(execution(), outcome());

    expect(ids).toContain("AMC-SCI-2");
    expect(ids).toContain("AMC-OPDISC-6");
  });

  it("evidences nothing for a guard the workspace does not compose", () => {
    // The conservatism that remains, and the half worth keeping: a workspace
    // running no allowlist cannot claim least-privilege, however much traffic
    // it generates.
    const ids = projectQuestionIds(execution({ appliedGuards: [] }), outcome());

    expect(ids, "a control that is not running evidences nothing").not.toContain("AMC-5.29");
    expect(ids).not.toContain("AMC-5.8");
    expect(ids, "the audit trail still exists, though").toContain("AMC-SCI-2");
  });

  it("binds a PERMITTED call to the control that evaluated it", () => {
    // AMC-5.29 asks for "denied/allowed tool-call receipts" — both. The
    // allowed receipt is the only kind that carries `stdout`, so it is the
    // only kind that can clear L1.
    const ids = projectQuestionIds(execution({ appliedGuards: ["tool-allowlist"] }), outcome());

    expect(ids).toContain("AMC-5.29");
  });

  it("binds a denial to the question whose gate hint names that receipt", () => {
    const ids = projectQuestionIds(
      execution({ name: "bash", appliedGuards: ["tool-allowlist"] }),
      outcome(denial("tool-allowlist"))
    );

    expect(ids, "AMC-5.29 asks for denied tool-call receipts").toContain("AMC-5.29");
  });

  it("projects nothing for a deferred question, however the call goes", () => {
    // The four rules adversarial review killed. Each fired because its guard
    // was composed — and every guard is composed unconditionally — so nine
    // questions moved in lockstep off one signal, presented as nine
    // independent controls. Each deferred question records what it would need.
    const everyGuard = ["tool-allowlist", "prompt-injection", "budgets", "network-egress", "runtime-firewall"];
    const allowed = projectQuestionIds(execution({ appliedGuards: everyGuard }), outcome());
    const denied = projectQuestionIds(
      execution({ appliedGuards: everyGuard }),
      outcome(denial("prompt-injection"))
    );

    for (const deferred of DEFERRED_PROJECTIONS) {
      expect(allowed, `${deferred.questionId} is deferred`).not.toContain(deferred.questionId);
      expect(denied, `${deferred.questionId} is deferred`).not.toContain(deferred.questionId);
      expect(deferred.needs.length, "a deferral must say what it would take").toBeGreaterThan(40);
    }
  });

  it("binds an unknown guard to nothing beyond the universal rules", () => {
    // Conservative default. A guard nobody wrote a rule for must not silently
    // inherit another guard's questions.
    const ids = projectQuestionIds(execution({ appliedGuards: [] }), outcome(denial("some-future-guard")));

    expect(ids.filter((id) => id !== "AMC-SCI-2" && id !== "AMC-OPDISC-6")).toEqual([]);
  });
});

describe("the projection cannot inflate event counts", () => {
  it("returns each question at most once for one call", () => {
    // Gates count EVENTS. If one call projected the same question twice, a
    // single call would count double against minEvents and three days of
    // traffic would look like six.
    const ids = projectQuestionIds(
      execution({ name: "bash", appliedGuards: ["tool-allowlist"] }),
      outcome(denial("tool-allowlist"))
    );

    expect(new Set(ids).size, "no question may appear twice for one call").toBe(ids.length);
  });

  it("is deterministic and order-stable for the same call", () => {
    const a = projectQuestionIds(execution({ appliedGuards: ["budgets"] }), outcome(denial("budgets")));
    const b = projectQuestionIds(execution({ appliedGuards: ["budgets"] }), outcome(denial("budgets")));

    expect(a).toEqual(b);
  });
});

describe("the projection declares its version", () => {
  it("carries a version, because the binding is a methodology claim", () => {
    // Evidence is tagged at write time and signed. If the map changes, old
    // evidence keeps the binding it was written under — which is correct, and
    // only auditable if the row records WHICH map produced it.
    expect(LIVE_PROJECTION_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}-p52a$/);
  });
});

describe("what live scoring can honestly claim", () => {
  /** Evidence as the harness emits it: 3 rows per call, across days/sessions. */
  const harnessEvidence = (calls: number, sessions: number, days: number): ParsedEvidenceEvent[] => {
    const BASE = Date.parse("2026-08-01T09:00:00Z");
    const DAY = 24 * 60 * 60 * 1000;
    const rows: ParsedEvidenceEvent[] = [];
    for (let i = 0; i < calls; i += 1) {
      for (const type of ["audit", "metric", "stdout"] as const) {
        rows.push(parseEvidenceEvent({
          id: `${type}-${i}`,
          ts: BASE + (i % days) * DAY,
          session_id: `s${i % sessions}`,
          runtime: "amc",
          event_type: type,
          payload_path: null,
          payload_inline: "evidence",
          payload_sha256: `sha-${type}-${i}`,
          meta_json: JSON.stringify({ trustTier: "OBSERVED", questionIds: ["AMC-SCI-2"] }),
          prev_event_hash: "prev",
          event_hash: `hash-${type}-${i}`,
          writer_sig: "sig"
        }));
      }
    }
    return rows;
  };

  const gateOf = (questionId: string, level: number) =>
    questionBank.find((q) => q.id === questionId)!.gates[level]!;

  it("one run on one day reaches L1 and no further", () => {
    // Measured against the real runner too: nine governed calls in one day
    // scored nine questions at L1. L2 needs two distinct days before its
    // `review` requirement even comes up.
    const oneDay = harnessEvidence(9, 3, 1);

    expect(evaluateGate(gateOf("AMC-SCI-2", 1), oneDay).pass, "L1 is reachable in a day").toBe(true);
    expect(evaluateGate(gateOf("AMC-SCI-2", 3), oneDay).pass, "L3 needs three distinct days").toBe(false);
  });

  it("L1 is the ceiling: L3 is blocked on evidence the harness does not produce", () => {
    // Not a threshold problem. Forty calls over ten days in eight sessions
    // clears every count L3 asks for — and still fails, because every L3 gate
    // in the bank requires an `ALIGNMENT_CHECK_PASS` audit row, and nothing on
    // the tool path performs an alignment check.
    //
    // This is why the feature claims L0->L1 and nothing more. It is also why
    // the reason string had to be fixed first: before that, this gate failed
    // with `events=120/8, sessions=8/3, days=10/3` and no explanation at all.
    const abundant = harnessEvidence(40, 8, 10);
    const verdict = evaluateGate(gateOf("AMC-SCI-2", 3), abundant);

    expect(verdict.pass).toBe(false);
    expect(verdict.reason, "counts are satisfied").toContain("events=120/8");
    expect(verdict.reason, "and the real blocker is named").toContain("auditType:ALIGNMENT_CHECK_PASS");
  });

  it("never reaches L4 or L5, however much traffic there is", () => {
    // The anti-inflation proof. Ten days, eight sessions, 300 calls — far past
    // every threshold L4 and L5 impose. They still fail, because they require
    // `artifact` and `test`, which are red-team pack and build artifacts and
    // are not something routine tool traffic can manufacture.
    const enormous = harnessEvidence(300, 8, 10);

    expect(evaluateGate(gateOf("AMC-SCI-2", 4), enormous).pass, "L4 needs artifact").toBe(false);
    expect(evaluateGate(gateOf("AMC-SCI-2", 5), enormous).pass, "L5 needs artifact and test").toBe(false);
    expect(evaluateGate(gateOf("AMC-SCI-2", 4), enormous).reason).toContain("missing evidence types=artifact");
  });

  it("L2 stays out of reach without human review, for every question in the bank", () => {
    // Measured across all 244: every L2 gate is {review, stdout}. Machine
    // evidence cannot supply `review`, so live scoring skips L2 entirely and
    // lands on L3 — which is the gate ladder's own design, not a workaround.
    const nonReview = questionBank.filter((q) => !q.gates[2]!.requiredEvidenceTypes.includes("review"));

    expect(nonReview.map((q) => q.id), "every L2 gate requires review").toEqual([]);
  });
});

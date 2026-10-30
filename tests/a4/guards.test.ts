/**
 * P2-35: the pure A4 guards (design §4.2, §5.3, §6.7), table-driven. Each case names the guard input and the outcome a
 * removed or inverted guard would change; the mutation record is in tests/a4/DEBT.md.
 */
import { describe, expect, test } from "vitest";
import {
  deriveSelfApprovalAllowed, gateSupersededBy, laneForClaimKind, ratchetedFromChain, type A4ChainLink
} from "../../src/a4/a4Schema.js";
import { acknowledgeable, PLAN_ACTIVATION_DEFERRED } from "../../src/a4/a4Readiness.js";
import { evaluateSod, type SodDecision, type SodGate } from "../../src/a4/a4SoD.js";

const AUTHOR = "LOCAL_USER:author", BUILDER = "LOCAL_USER:builder", REQUESTER = "LOCAL_USER:requester";
const APPROVER = "LOCAL_USER:approver", OTHER = "LOCAL_USER:other", ROUTER = "WORKSPACE_ROUTER:approver";

let seq = 0;
const link = (kind: string, revisionNo: number, body: Record<string, unknown> = {}): A4ChainLink => ({ seq: ++seq, kind, revisionNo, body });
/** A revision authored by AUTHOR, built by BUILDER (STEP to built + a scaffold ref), at revision 1. */
const chain: readonly A4ChainLink[] = [
  link("CREATED", 0, { actorKey: AUTHOR }),
  link("REVISION", 1, { actorKey: AUTHOR }),
  link("STEP", 1, { actorKey: BUILDER, from: "proposed", to: "built" }),
  link("EVIDENCE_REF", 1, { actorKey: OTHER, purpose: "assemble_scaffold" })
];
const gate = (over: Partial<SodGate> = {}): SodGate => ({ gateId: "a4gate_x", gate: "completion", revisionNo: 1, requesterKeys: [REQUESTER],
  excludedKeys: [], ...over });
const approve = (approverKey: string, authSource = "LOCAL_USER"): SodDecision => ({ approverKey, authSource, decision: "APPROVE_EXECUTE" });
const sod = (approver: string, over: { gate?: Partial<SodGate>; decisions?: SodDecision[]; regulated?: boolean; selfApprovalAllowed?: boolean;
  effect?: boolean; authSource?: string } = {}) => evaluateSod({
  gate: gate(over.gate), decisions: over.decisions ?? [], transitions: chain, regulated: over.regulated ?? false,
  selfApprovalAllowed: over.selfApprovalAllowed ?? false, effect: over.effect,
  approver: { key: approver, authSource: over.authSource ?? approver.split(":")[0]! }
});

describe("evaluateSod (SOD_VIOLATION at write)", () => {
  test("a distinct, non-author, non-builder approver passes", () => {
    expect(sod(APPROVER)).toEqual({ ok: true, violations: [], degraded: [] });
  });

  test.each([
    ["the gate requester", REQUESTER, "requester_not_approver"],
    ["the revision author", AUTHOR, "author_not_approver"],
    ["a builder of the completion revision (STEP to built)", BUILDER, "builder_not_completion_approver"],
    ["the actor of a build-work evidence ref", OTHER, "builder_not_completion_approver"]
  ])("%s is refused", (_name, key, rule) => {
    const result = sod(key);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(rule);
  });

  test("a builder may approve a direction gate (the builder rule is completion and effect only), an author may not", () => {
    expect(sod(BUILDER, { gate: { gate: "direction" } }).ok).toBe(true);
    expect(sod(AUTHOR, { gate: { gate: "direction" } }).violations).toEqual(["author_not_approver"]);
    expect(sod(BUILDER, { gate: { gate: "direction" }, effect: true }).violations).toEqual(["builder_not_completion_approver"]);
  });

  test("a key barred at open time for no named rule is still refused", () => {
    expect(sod(APPROVER, { gate: { excludedKeys: [APPROVER] } }).violations).toEqual(["requester_not_approver"]);
  });

  test("the admin token and the demo session never decide", () => {
    expect(sod("bootstrap-admin", { authSource: "ADMIN" }).violations).toContain("no_admin_token");
    expect(sod("demo:session", { authSource: "DEMO" }).violations).toContain("no_demo");
    // A key with the plane prefix and nothing after it is not a principal.
    expect(sod("LOCAL_USER:", { authSource: "LOCAL_USER" }).violations).toContain("no_admin_token");
  });

  test("a duplicate vote is refused (distinct_approvers)", () => {
    expect(sod(APPROVER, { decisions: [approve(APPROVER)] }).violations).toEqual(["distinct_approvers"]);
    // A DENY by the same key is not an approval it already gave.
    expect(sod(APPROVER, { decisions: [{ approverKey: APPROVER, authSource: "LOCAL_USER", decision: "DENY" }] }).ok).toBe(true);
  });

  test("a second account in the other auth plane is refused (CROSS_PLANE: one_plane)", () => {
    expect(sod(ROUTER, { decisions: [approve(APPROVER)] }).violations).toEqual(["one_plane"]);
  });

  test("single-user degradation applies only to a derived selfApprovalAllowed, never to the policy gate or an effect", () => {
    expect(sod(AUTHOR, { selfApprovalAllowed: true })).toEqual({ ok: true, violations: [], degraded: ["SOD_DEGRADED_SINGLE_USER"] });
    expect(sod(REQUESTER, { selfApprovalAllowed: true, gate: { gate: "policy" } }).violations).toEqual(expect.arrayContaining(["policy_gate_distinct", "requester_not_approver"]));
    expect(sod(BUILDER, { selfApprovalAllowed: true, effect: true }).violations).toEqual(["builder_not_completion_approver"]);
  });

  test("a regulated quorum made only of LOCAL_USER keys is SOD_DEGRADED_SELF_PROVISIONED; a router key in the quorum clears it", () => {
    expect(sod(APPROVER, { regulated: true, decisions: [approve(OTHER)] }).degraded).toEqual(["SOD_DEGRADED_SELF_PROVISIONED"]);
    expect(sod(APPROVER, { regulated: false, decisions: [approve(OTHER)] }).degraded).toEqual([]);
    expect(sod(ROUTER, { regulated: true, decisions: [approve("WORKSPACE_ROUTER:other", "WORKSPACE_ROUTER")] }).degraded).toEqual([]);
  });
});

describe("laneForClaimKind (lanes are earned, never chosen)", () => {
  test.each([
    ["observed on an OBSERVED runtime_observation row", "observed", "OBSERVED", "runtime_observation", { lane: "observed", claimKind: "observed" }],
    ["observed on an OBSERVED_HARDENED executed_test row", "observed", "OBSERVED_HARDENED", "executed_test", { lane: "observed", claimKind: "observed" }],
    ["observed on a SELF_REPORTED row", "observed", "SELF_REPORTED", "runtime_observation", { lane: "implementation", claimKind: "self_reported" }],
    ["observed on an OBSERVED row with no observing method", "observed", "OBSERVED", "manual_attestation", { lane: "implementation", claimKind: "self_reported" }],
    ["observed with an unknown tier", "observed", null, "runtime_observation", { lane: "implementation", claimKind: "self_reported" }],
    ["observed with no method", "observed", "OBSERVED", null, { lane: "implementation", claimKind: "self_reported" }],
    ["self_reported on an OBSERVED row stays self_reported", "self_reported", "OBSERVED", "runtime_observation", { lane: "implementation", claimKind: "self_reported" }],
    ["synthetic_example keeps its kind", "synthetic_example", "OBSERVED", "runtime_observation", { lane: "implementation", claimKind: "synthetic_example" }],
    ["independently_reviewed is the verified lane", "independently_reviewed", null, null, { lane: "verified", claimKind: "independently_reviewed" }]
  ] as const)("%s", (_name, claimKind, tier, method, expected) => {
    expect(laneForClaimKind(claimKind as never, tier, method)).toEqual(expected);
  });

  test("the recommendation fallback is used for what does not earn observed", () => {
    expect(laneForClaimKind("observed" as never, "SELF_REPORTED", "runtime_observation", "recommendation")).toEqual({ lane: "recommendation", claimKind: "self_reported" });
  });
});

describe("deriveSelfApprovalAllowed (derived, never supplied)", () => {
  const solo = { activeLocal: ["solo"], hostPrincipals: 0, hostedRouter: false, regulated: false, workspaceFloor: undefined, ratcheted: false,
    decidingPrincipal: { authSource: "LOCAL_USER" as const, userId: "solo" } };
  test("one ACTIVE local user deciding, unregulated, not hosted, not ratcheted: true", () => {
    expect(deriveSelfApprovalAllowed(solo)).toBe(true);
  });
  test.each([
    ["a second users.yaml user", { activeLocal: ["solo", "second"] }],
    ["an unreadable users.yaml (null)", { activeLocal: null }],
    ["one host session", { hostPrincipals: 1 }],
    ["an unreadable host population (null)", { hostPrincipals: null }],
    ["the hosted router", { hostedRouter: true }],
    ["a regulated project", { regulated: true }],
    ["a workspace floor refusing it", { workspaceFloor: false }],
    ["a ratcheted project (a second principal was once seen)", { ratcheted: true }],
    ["a WORKSPACE_ROUTER principal", { decidingPrincipal: { authSource: "WORKSPACE_ROUTER" as const, userId: "solo" } }],
    ["a deciding user who is not the active one", { decidingPrincipal: { authSource: "LOCAL_USER" as const, userId: "other" } }],
    ["no deciding principal (admin token)", { decidingPrincipal: null }]
  ])("%s: false", (_name, over) => {
    expect(deriveSelfApprovalAllowed({ ...solo, ...over } as never)).toBe(false);
  });
});

describe("ratchetedFromChain (the single-user ratchet)", () => {
  const facts = (activeUserCount: unknown, hostPrincipals: unknown) => ({ activeUserCount, hostPrincipals });
  test("one principal throughout does not ratchet", () => {
    expect(ratchetedFromChain([link("CREATED", 0, { selfApprovalFacts: facts(1, 0) }), link("STEP", 1, { population: facts(1, 0) })])).toBe(false);
  });
  test.each([
    ["a second users.yaml user once seen", [link("STEP", 1, { population: facts(2, 0) })]],
    ["a host session once seen", [link("STEP", 1, { population: facts(1, 1) })]],
    ["an unreadable population (null count)", [link("STEP", 1, { population: facts(null, 0) })]],
    ["two distinct decision keys on one gate", [link("GATE_DECIDED", 1, { gateId: "g", approverKey: APPROVER }), link("GATE_DECIDED", 1, { gateId: "g", approverKey: OTHER })]]
  ])("%s ratchets, whatever follows", (_name, links) => {
    expect(ratchetedFromChain([...links, link("STEP", 2, { population: facts(1, 0) })])).toBe(true);
  });
  test("the same key on two gates does not ratchet", () => {
    expect(ratchetedFromChain([link("GATE_DECIDED", 1, { gateId: "g1", approverKey: APPROVER }), link("GATE_DECIDED", 1, { gateId: "g2", approverKey: APPROVER })])).toBe(false);
  });
});

describe("gateSupersededBy (a member or evidence ref added after the gate opened)", () => {
  /** The gate request, then whatever `after` appends (created after it, so later in seq). */
  const opened = (after: () => A4ChainLink[]) => {
    const requested = link("GATE_REQUESTED", 3, { gateId: "g" });
    const rest = after();
    return { chain: [requested, ...rest], rest, gate: { gateId: "g", revisionNo: 3, requestedSeq: requested.seq } };
  };
  test.each([
    ["MEMBER", () => link("MEMBER", 3, {})],
    ["EVIDENCE_REF on the bound revision", () => link("EVIDENCE_REF", 3, {})],
    ["ACKNOWLEDGED on the bound revision", () => link("ACKNOWLEDGED", 3, {})],
    ["REVISION", () => link("REVISION", 4, {})],
    ["an unresumed HOLD", () => link("HOLD", 3, {})],
    ["its own GATE_CONSUMED", () => link("GATE_CONSUMED", 3, { gateId: "g" })]
  ])("%s supersedes", (_name, make) => {
    const { chain: links, rest, gate: g } = opened(() => [make()]);
    expect(gateSupersededBy(links, g)?.seq).toBe(rest[0]!.seq);
  });
  test.each([
    ["a HOLD cleared by a later RESUME", () => [link("HOLD", 3, {}), link("RESUME", 3, {})]],
    ["another gate's GATE_CONSUMED", () => [link("GATE_CONSUMED", 3, { gateId: "other" })]],
    ["an EVIDENCE_REF on another revision", () => [link("EVIDENCE_REF", 2, {})]],
    ["a GATE_DECIDED (decisions never supersede)", () => [link("GATE_DECIDED", 3, { gateId: "g" })]]
  ])("%s does not supersede", (_name, make) => {
    const { chain: links, gate: g } = opened(make);
    expect(gateSupersededBy(links, g)).toBeNull();
  });
  test("a superseding link before the request does not count", () => {
    const early = link("MEMBER", 3, {});
    const { chain: links, gate: g } = opened(() => []);
    expect(gateSupersededBy([early, ...links], g)).toBeNull();
  });
});

describe("acknowledgeable (design §17 \"Acknowledged blocker\": WAITING only, never BLOCKED, listed items only)", () => {
  const candidate = (id: string, status: string, over: { mandatory?: boolean; reasonCodes?: string[] } = {}) =>
    ({ id, status, mandatory: over.mandatory ?? true, reasonCodes: over.reasonCodes ?? [] }) as never;
  test.each([
    ["a WAITING lineage.independent_approvals", candidate("lineage.independent_approvals", "WAITING"), false, undefined, true],
    ["a WAITING sod.self_provisioned on a regulated project", candidate("sod.self_provisioned", "WAITING"), true, undefined, true],
    ["a WAITING plan_unresolved, unregulated", candidate("plan_unresolved", "WAITING"), false, undefined, true],
    ["a BLOCKED item", candidate("lineage.independent_approvals", "BLOCKED"), false, undefined, false],
    ["a READY item", candidate("sod.self_provisioned", "READY"), false, undefined, false],
    ["an item outside the list", candidate("store.integrity", "WAITING"), false, undefined, false],
    ["plan_unresolved on a regulated project", candidate("plan_unresolved", "WAITING"), true, undefined, false],
    ["plan_activated without the deferral code", candidate("plan_activated", "WAITING"), false, undefined, false],
    ["plan_activated deferred and mandatory", candidate("plan_activated", "WAITING", { reasonCodes: [PLAN_ACTIVATION_DEFERRED] }), false, undefined, true],
    ["deployment.amc_check naming no receipt", candidate("deployment.amc_check", "WAITING"), false, "activate", false],
    ["deployment.amc_check naming its receipt", candidate("deployment.amc_check", "WAITING", { reasonCodes: ["RECEIPT:a4dep_x"] }), false, "activate", true],
    ["regulatory_sources_status at Activate while not mandatory", candidate("regulatory_sources_status", "WAITING", { mandatory: false }), false, "activate", false]
  ] as const)("%s", (_name, item, regulated, stage, expected) => {
    expect(acknowledgeable(item, regulated, stage)).toBe(expected);
  });
});

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { compilePlan } from "../src/catalog/compiler/compile.js";
import type { MergedParameter } from "../src/catalog/compiler/merge.js";
import { buildRuntimePolicy } from "../src/catalog/compiler/runtimePolicy.js";
import type { CompiledPlan } from "../src/catalog/compiler/types.js";
import { loadCatalog } from "../src/catalog/loader.js";
import { listDomainIds } from "../src/domains/domainRegistry.js";
import { ACTION_CLASSES } from "../src/governor/actionCatalog.js";

/**
 * P1-46 (docs/adr/015-f2-blueprints.md): F2's regulated-agent blueprints are folded into the compiler, not landed.
 * One golden case per station shows the compiled plan already holds every F2 station-profile rule, from the same
 * shipped defaults F2 read; each F2 refusal is named by its rule id. F2's tier table forbade DEPLOY; the compiled
 * plan approval-gates it instead (the ADR's departure). The last block keeps the blueprint module and command out.
 */
const catalog = loadCatalog();
const AS_OF = "2026-10-12T00:00:00Z";
const base = JSON.parse(readFileSync("tests/fixtures/catalog/compiler/finance-ops-us.profile.json", "utf8")) as Record<string, any>;

function stationProfile(station: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...base, profileId: `station-${station}`, primaryStation: { ...base.primaryStation, value: station },
    stations: { ...base.stations, value: [station] }, ...extra };
}

interface Signed {
  approvalPolicy: { approvalPolicy: { actionClasses: Record<string, { requiredApprovals: number; requireDistinctUsers: boolean }> } };
  budgets: { budgets: { perAgent: Record<string, { daily: { maxToolExecutes: Record<string, number> } }> } };
  actionPolicy: { actions: Array<{ actionClass: string; allowExecute: boolean; requireExecTicket: boolean }> };
}

/** The F2-relevant view of a compiled plan. */
function f2View(plan: CompiledPlan) {
  const signed = plan.runtimePolicy.proposedSignedConfigs as unknown as Signed;
  const rules = signed.approvalPolicy.approvalPolicy.actionClasses;
  const quotas = Object.values(signed.budgets.budgets.perAgent).map((agent) => agent.daily.maxToolExecutes);
  return {
    status: plan.status,
    overlayControls: plan.requirements.filter((r) => r.layer > 0).map((r) => r.controlId),
    approvalRequiredFor: plan.runtimePolicy.toolPipeline.approvalRequiredFor,
    approvals: Object.fromEntries(ACTION_CLASSES.map((ac) => [ac, `${rules[ac]!.requiredApprovals}${rules[ac]!.requireDistinctUsers ? " distinct" : ""}`])),
    zeroQuota: ACTION_CLASSES.filter((ac) => quotas.every((q) => q[ac] === 0)).sort(),
    notExecutable: signed.actionPolicy.actions.filter((r) => !r.allowExecute).map((r) => r.actionClass).sort(),
    execTicket: signed.actionPolicy.actions.filter((r) => r.requireExecTicket).map((r) => r.actionClass).sort()
  };
}

const EVERY_STATION = {
  status: "ready",
  approvalRequiredFor: ["DATA_EXPORT", "DEPLOY", "FINANCIAL", "IDENTITY", "NETWORK_EXTERNAL", "SECURITY", "WRITE_HIGH", "WRITE_LOW"],
  approvals: { READ_ONLY: "0", WRITE_LOW: "1", WRITE_HIGH: "2 distinct", DEPLOY: "2 distinct", SECURITY: "2 distinct", FINANCIAL: "2 distinct",
    NETWORK_EXTERNAL: "2 distinct", DATA_EXPORT: "2 distinct", IDENTITY: "2 distinct" },
  zeroQuota: ["FINANCIAL", "SECURITY"],
  notExecutable: ["DATA_EXPORT", "FINANCIAL", "IDENTITY", "NETWORK_EXTERNAL", "SECURITY"],
  execTicket: ["DATA_EXPORT", "DEPLOY", "FINANCIAL", "IDENTITY", "NETWORK_EXTERNAL", "SECURITY", "WRITE_HIGH"]
};
/** Station overlays add requirement rows; the Governance defense row is also scoped to Technology. */
const WEALTH_OVERLAY = Array.from({ length: 15 }, (_, i) => `L1-WLT-US-${String(i + 1).padStart(2, "0")}`);
const GOVERNANCE_OVERLAY = ["L1-GOV-01", "L1-GOV-02", "L1-GOV-03", "L1-GOV-04", "L1-GOV-05", "L1-GOV-06"];
const TECHNOLOGY_OVERLAY = [
  "L1-TECH-01", "L1-TECH-02", "L1-TECH-03", "L1-TECH-04",
  "L1-TECH-05", "L1-TECH-06", "L1-TECH-07", "L1-TECH-08"
];

describe("P1-46: the compiled plan holds F2's station-profile rules for every station", () => {
  test("seven stations", () => {
    expect(listDomainIds().sort()).toEqual(["education", "environment", "governance", "health", "mobility", "technology", "wealth"]);
  });

  test.each(listDomainIds().sort())("golden: %s", (station) => {
    const plan = compilePlan({ profile: stationProfile(station) as never, catalog, asOf: AS_OF });
    const overlayControls = station === "wealth" ? WEALTH_OVERLAY : station === "technology" ? ["L1-GOV-06", ...TECHNOLOGY_OVERLAY]
      : station === "governance" ? GOVERNANCE_OVERLAY : [];
    expect(f2View(plan)).toEqual({ ...EVERY_STATION, overlayControls });
  });
});

describe("P1-46: F2 refusal rules, by rule id, as the compiler holds them", () => {
  const param = (name: string, strictness: MergedParameter["strictness"], value: MergedParameter["value"]): [string, MergedParameter] =>
    [name, { name, strictness, value, controlIds: ["TEST-LOOSE-01"] }];

  test("station-profile/critical/write-high-requires-approval: a control asking 0 approvals, not distinct, still compiles to 2 distinct", () => {
    const policy = buildRuntimePolicy(new Map([
      param("approvals.WRITE_HIGH.requiredApprovals", "max", 0),
      param("approvals.WRITE_HIGH.requireDistinctUsers", "true_wins", false)
    ]), ["agent-1"]);
    expect(policy.approvals.WRITE_HIGH).toMatchObject({ requiredApprovals: 2, requireDistinctUsers: true, controlIds: ["TEST-LOOSE-01"] });
    expect(policy.toolPipeline.approvalRequiredFor).toContain("WRITE_HIGH");
  });

  test("budget-default/zero-quota/SECURITY and /FINANCIAL: zero quota and not executable even where Wealth's overlay gates FINANCIAL", () => {
    const plan = compilePlan({ profile: stationProfile("wealth") as never, catalog, asOf: AS_OF });
    const view = f2View(plan);
    expect(plan.requirements.find((r) => r.controlId === "L1-WLT-US-02")?.applicability).toBe("applicable");
    expect(view.zeroQuota).toEqual(["FINANCIAL", "SECURITY"]);
    expect(view.notExecutable).toEqual(expect.arrayContaining(["FINANCIAL", "SECURITY"]));
  });

  test("station-profile/critical/forbidden-class/DEPLOY: approval-gated (2 distinct, exec ticket), not forbidden; the rest stay non-executable", () => {
    const view = f2View(compilePlan({ profile: stationProfile("health") as never, catalog, asOf: AS_OF }));
    expect(view.approvals.DEPLOY).toBe("2 distinct");
    expect(view.execTicket).toContain("DEPLOY");
    expect(view.notExecutable).not.toContain("DEPLOY");
    expect(view.notExecutable).toEqual(expect.arrayContaining(["NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"]));
  });

  test("unknown pack: an unknown station fails the compile (PROFILE_INVALID)", () => {
    expect(() => compilePlan({ profile: stationProfile("no-such-station") as never, catalog, asOf: AS_OF })).toThrow(/^PROFILE_INVALID/);
  });

  test("F1 seam: an operating profile is pinned by hash and changes no compiled rule", () => {
    const pinned = stationProfile("health", { operatingProfile: { path: "profiles/health.json", sha256: "a".repeat(64), schemaVersion: "2026-10-07" } });
    const plain = compilePlan({ profile: stationProfile("health") as never, catalog, asOf: AS_OF });
    const withF1 = compilePlan({ profile: pinned as never, catalog, asOf: AS_OF });
    expect(withF1.profile.sha256).not.toBe(plain.profile.sha256);
    expect(withF1.runtimePolicy.policyDigest).toBe(plain.runtimePolicy.policyDigest);
  });
});

describe("P1-46: F2 stays folded", () => {
  test("no blueprint module, no import of one and no blueprint command path", () => {
    expect(existsSync("src/domains/blueprints")).toBe(false);
    const sources = (readdirSync("src", { recursive: true }) as string[]).filter((f) => f.endsWith(".ts"));
    expect(sources.filter((f) => /domains\/blueprints\/|registerBlueprintCommand/.test(readFileSync(join("src", f), "utf8")))).toEqual([]);
    const paths = readFileSync("docs/CLI_COMMAND_INVENTORY.md", "utf8").split("\n").filter((l) => l.startsWith("| `amc")).map((l) => l.split("|")[1]!);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths.filter((path) => /blueprint/i.test(path))).toEqual([]);
  });
});

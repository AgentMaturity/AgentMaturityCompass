/**
 * P1-33: every reader that compiles, activates, exports or shows the catalog loads it through loadAdmittedCatalog, so a
 * pack whose reviewed claim the recomputed admission refuses is experimental everywhere at once. The shipped catalog
 * declares no reviewed pack, so this file loads a copy of it whose Wealth pack claims `reviewed` (no roster, so the
 * gate downgrades it): the CLI compile, activation, A4 Understand and A4's shipped lock must then agree.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Hoisted above the imports: the copy is made when the loader is first imported.
vi.mock("../../../src/catalog/loader.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/catalog/loader.js")>();
  const fs = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const root = path.join(fs.mkdtempSync(path.join(tmpdir(), "amc-gated-catalog-")), "catalog");
  fs.cpSync(actual.defaultCatalogRoot(), root, { recursive: true });
  const wealth = path.join(root, "layers", "l1-wealth-us", "pack.yaml");
  fs.writeFileSync(wealth, fs.readFileSync(wealth, "utf8").replace("support: experimental", "support: reviewed"));
  return { ...actual, loadCatalog: (opts: { root?: string } = {}) => actual.loadCatalog({ root, ...opts }) };
});

import { shippedLockDigest, understandAdapt } from "../../../src/a4/adaptPolicy.js";
import { lockDigestOf } from "../../../src/a4/spec/adapt.js";
import { decideApprovalForIntent } from "../../../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../../../src/approvals/approvalPolicyEngine.js";
import { loadAdmittedCatalog } from "../../../src/catalog/admission/gate.js";
import { compileCatalogPlan } from "../../../src/catalog/catalogCli.js";
import { activateControlPlan, activeControlPlan } from "../../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { signPlan } from "../../../src/catalog/compiler/sign.js";
import { loadCatalog } from "../../../src/catalog/loader.js";
import { buildCatalogLock } from "../../../src/catalog/lockfile.js";
import { runOscalExportCli } from "../../../src/exports/oscal/oscalCli.js";
import { newWorkspace } from "../l0/workspaces.js";

afterAll(() => rmSync(dirname(loadCatalog().root), { recursive: true, force: true }));

const PACK = "amc.l1.wealth.us";
const fixtureProfile = (): unknown => (loadCatalog().fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile;

describe("one gated catalog for compile, activation, the OSCAL export and A4 (P1-33)", () => {
  it("downgrades the claimed pack in the gate, and only there", () => {
    expect(loadCatalog().packs.get(PACK)!.manifest.support).toBe("reviewed");
    const gated = loadAdmittedCatalog();
    expect(gated.packs.get(PACK)!.manifest.support).toBe("experimental");
    expect(gated.issues.filter((i) => i.code === "ADM_SUPPORT_DOWNGRADED").map((i) => i.file)).toEqual(["layers/l1-wealth-us/pack.yaml"]);
    expect(lockDigestOf(buildCatalogLock(gated)), "the downgrade shows in the lock").not.toBe(lockDigestOf(buildCatalogLock(loadCatalog())));
  });

  it("gives A4's shipped lock, A4 Understand's plan and the CLI compile one lock for the downgraded pack", () => {
    const ws = newWorkspace("amc-gated-cli-");
    writeFileSync(join(ws, "profile.json"), JSON.stringify(fixtureProfile()));
    const cli = compileCatalogPlan(ws, { profile: "profile.json", out: "plans" });
    const a4 = understandAdapt({ workspace: ws, projectId: "p1", workspaceId: "ws-a", agentId: "default", answers: [], now: Date.now() });
    expect(cli.plan.lock.packs.find((p) => p.id === PACK)?.support).toBe("experimental");
    expect(a4.plan?.lock.packs.find((p) => p.id === PACK)?.support).toBe("experimental");
    expect(lockDigestOf(a4.plan!.lock)).toBe(lockDigestOf(cli.plan.lock));
    expect(shippedLockDigest()).toBe(lockDigestOf(cli.plan.lock));
  });

  it("gives Adapt's shipped lock exactly the activated plan's lock right after activation", () => {
    const ws = newWorkspace("amc-gated-activate-");
    initApprovalPolicy(ws);
    const plan = compilePlan({ profile: parseDeploymentProfile(fixtureProfile()), catalog: loadAdmittedCatalog(), asOf: new Date().toISOString() });
    const { signed } = signPlan({ workspace: ws, plan, previous: null, reviewAgentId: "default" });
    const approvalId = signed.review.approvalRequestId!;
    for (const userId of ["owner-1", "owner-2"]) {
      decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "P1-33 gated lock fixture",
        userId, username: userId, userRoles: ["OWNER"] });
    }
    activateControlPlan({ workspace: ws, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
    expect(lockDigestOf(activeControlPlan(ws)!.lock)).toBe(shippedLockDigest());
  });

  it("publishes the gated pack support in the OSCAL catalog, never the declared claim", () => {
    const ws = newWorkspace("amc-gated-oscal-");
    runOscalExportCli({ workspace: ws, out: "oscal" });
    const doc = readFileSync(join(ws, "oscal", "catalog.json"), "utf8");
    expect(doc).toContain(`\\"id\\":\\"${PACK}\\"`);
    expect(doc).not.toMatch(/\\"support\\":\\"reviewed\\"/);
  });
});

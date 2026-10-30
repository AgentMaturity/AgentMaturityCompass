import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultAuditMapBuiltin } from "../../../src/audit/auditMapBuiltin.js";
import { evaluatePredicate } from "../../../src/catalog/compiler/evaluatePredicate.js";
import { parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { validateCatalog } from "../../../src/catalog/validate.js";
import { FRAMEWORK_REFERENCE_TABLES } from "../../../src/compliance/citations/frameworkIds.js";
import { isSharedOfficialUrl } from "../../../src/compliance/citations/officialHosts.js";
import { catalog, executedControlIds, layer0 } from "./harness.js";

/**
 * The Layer 0 baseline v0.1 (P1-14) loads clean, stays experimental and unreviewed, keeps its level caps and citation
 * rules, and the summary page and review packets say what the records and fixtures say.
 */
const STATIONS = ["education", "environment", "health", "wealth", "technology", "mobility", "governance"];
const SPEC_IDS = [
  "L0-INV-01", "L0-INV-02", "L0-INV-03", "L0-INV-04", "L0-IDN-01", "L0-IDN-02", "L0-IDN-03", "L0-IDN-04",
  "L0-TOOL-01", "L0-TOOL-02", "L0-TOOL-03", "L0-TOOL-04", "L0-DAT-01", "L0-DAT-02", "L0-DAT-03", "L0-DAT-04",
  "L0-OVS-01", "L0-OVS-02", "L0-OVS-03", "L0-OVS-04", "L0-ADV-01", "L0-ADV-02", "L0-ADV-03", "L0-ADV-04",
  "L0-TRN-01", "L0-TRN-02", "L0-TRN-03", "L0-EXP-01", "L0-EXP-02", "L0-EXP-03", "L0-FAI-01", "L0-FAI-02", "L0-FAI-03", "L0-FAI-04",
  "L0-LOG-01", "L0-LOG-02", "L0-LOG-03", "L0-LOG-04", "L0-CHG-01", "L0-CHG-02", "L0-CHG-03", "L0-CHG-04",
  "L0-MON-01", "L0-MON-02", "L0-MON-03", "L0-MON-04", "L0-MON-05"
];
const producer = (id: string) => catalog.producers.find((p) => p.id === id);
const docs = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
// Claim words P1-14 content never uses about itself; schema keys and the required "not independently reviewed" label are not claims.
const CLAIM = /\b(reviewed|approved|certified|compliant)\b/i;
const unclaimed = (text: string) => text.replace(/not\s+independently\s+reviewed/gi, "").replace(/\b(reviewedAt|reviewedBy|approvedBy|legalReview)\b/g, "");

describe("Layer 0 Agent Control Baseline v0.1 loads (P1-14)", () => {
  it("loads with zero errors; the only warnings are missing register entries", () => {
    const result = validateCatalog(catalog);
    expect(result.errors).toEqual([]);
    expect(new Set(result.warnings.map((w) => w.code))).toEqual(new Set(["CAT_NO_REGISTER_ENTRY"]));
  });

  it("holds exactly the spec's controls, each experimental, mandatory and listing all seven stations", () => {
    expect(layer0.map((c) => c.id).sort()).toEqual([...SPEC_IDS].sort());
    const pack = [...catalog.packs.values()].find((p) => p.manifest.id === "amc.l0.baseline")?.manifest;
    expect(pack?.support).toBe("experimental");
    expect([...(pack?.controls ?? [])].sort()).toEqual([...SPEC_IDS].sort());
    for (const c of layer0) {
      expect(c.support, c.id).toBe("experimental");
      expect(c.mandatory, c.id).toBe(true);
      expect([...c.stations].sort(), c.id).toEqual([...STATIONS].sort());
      expect(c.review, `${c.id}: no reviewer is named before D-08`).toEqual({ status: "pending", expert: null, credential: null, reviewedAt: null, nextReview: null });
      expect(c.provenance.draftedBy, c.id).toBe("ai");
      expect(c.provenance.approvedBy, c.id).toBeNull();
    }
  });

  it("lists no level above L2 for a control whose producers are all planned, and only L1 with no observed producer", () => {
    for (const c of layer0) {
      const rows = c.evidence.map((e) => producer(e.producer));
      expect(rows.every(Boolean), c.id).toBe(true);
      if (rows.every((p) => p?.status === "planned")) expect(c.levels.filter((l) => ["L3", "L4", "L5"].includes(l)), c.id).toEqual([]);
      if (!rows.some((p) => p?.maxClaimKind === "observed")) expect(c.levels, c.id).toEqual(["L1"]);
    }
  });

  it("cites only official https sources, each unverified with a reason or hashed, each scoped with appliesWhen", () => {
    for (const c of layer0) {
      for (const x of c.citations) {
        expect(isSharedOfficialUrl(x.url), `${c.id} ${x.key}`).toBe(true);
        expect(x.appliesWhen, `${c.id} ${x.key}: a jurisdiction-specific citation is scoped`).not.toBeNull();
        expect(x.legalReview, `${c.id} ${x.key}`).toBeNull();
        if (x.retrieval.state === "unverified") expect(x.retrieval.reason.length, `${c.id} ${x.key}`).toBeGreaterThan(20);
        else expect(x.retrieval.contentSha256, `${c.id} ${x.key}`).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it("crosswalks only to ids that exist: audit-map controls, ASI01 to ASI10, and ATLAS ids in the hashed release", () => {
    const auditIds = new Set(defaultAuditMapBuiltin().auditMap.controlFamilies.flatMap((f) => f.controls.map((x) => x.controlId)));
    const atlasIds = new Set(FRAMEWORK_REFERENCE_TABLES.atlas.entries.map((e) => e.id));
    for (const c of layer0) {
      for (const x of c.crosswalk) {
        expect(x.relation, `${c.id}: every mapping waits for expert confirmation`).toBe("partial");
        if (x.framework === "amc-audit-map-v1") expect(auditIds.has(x.clause), `${c.id} ${x.clause}`).toBe(true);
        else if (x.framework === "owasp-asi-2026") expect(x.clause, c.id).toMatch(/^ASI(0[1-9]|10)$/);
        else if (x.framework === "atlas") expect(atlasIds.has(x.clause), `${c.id} ${x.clause}`).toBe(true);
        else throw new Error(`${c.id}: unexpected framework ${x.framework}`);
      }
    }
    for (const id of ["L0-ADV-01", "L0-ADV-02", "L0-ADV-03", "L0-ADV-04"]) {
      const frameworks = new Set(catalog.controls.get(id)?.crosswalk.map((x) => x.framework));
      expect(frameworks.has("owasp-asi-2026") && frameworks.has("atlas"), id).toBe(true);
    }
  });

  it("registers every producer it names; available producers point at code that exists", () => {
    for (const c of layer0) for (const e of c.evidence) expect(producer(e.producer), `${c.id} ${e.producer}`).toBeTruthy();
    for (const p of catalog.producers) {
      if (p.status === "available") expect(existsSync(join(process.cwd(), p.module)), `${p.id} ${p.module}`).toBe(true);
      else expect(p.plannedBy, p.id).toMatch(/^P\d-\d{2}$/);
    }
  });

  it("keeps a reconciliation agent out of the fairness and explanation controls, and leaves them unresolved when use cases are unknown", () => {
    // The reconciliation agent profile the L0-IDN-01 harness compiles, with its use cases swapped.
    const base = (catalog.fixtures.get("L0-IDN-01/negative/no-lease.json")?.envelope?.setup as { profile: Record<string, unknown> }).profile;
    const profile = (useCases: string[] | null) =>
      parseDeploymentProfile({ ...base, useCases: { value: useCases, provenance: "asserted", source: "test", reviewedBy: null } });
    const scoped = layer0.filter((c) => c.family === "fairness" || c.family === "explanation-notice-and-appeal");
    expect(scoped.length).toBeGreaterThan(0);
    for (const c of scoped) {
      expect(evaluatePredicate(c.applicability.predicate, profile(["reconciliation"])).value, c.id).toBe("false");
      expect(evaluatePredicate(c.applicability.predicate, profile(["consequential_decision_about_people"])).value, c.id).toBe("true");
      expect(evaluatePredicate(c.applicability.predicate, profile(null)).value, c.id).toBe("unknown");
      expect(c.applicability.exclusions.some((x) => /reconciliation/.test(x.reason)), `${c.id}: explicit exclusion (P1-33)`).toBe(true);
    }
  });

  it("never claims review, approval, certification or compliance in its records, summary or packets", () => {
    const files = [
      ...layer0.map((c) => join("catalog", catalog.controlFiles.get(c.id) ?? "")),
      "docs/catalog/LAYER0.md",
      ...readdirSync(join(process.cwd(), "docs/catalog/review-packets")).map((f) => `docs/catalog/review-packets/${f}`)
    ];
    for (const file of files) expect(CLAIM.exec(unclaimed(docs(file)))?.[0], file).toBeUndefined();
  });
});

describe("docs/catalog/LAYER0.md and the review packets match the catalog", () => {
  const page = docs("docs/catalog/LAYER0.md");
  const rows = new Map([...page.matchAll(/^\| (L0-[A-Z]+-\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\d+) \| ([^|]+) \|$/gm)]
    .map((m) => [m[1], { producerStatus: m[4].trim(), executed: m[5].trim(), citations: Number(m[7]), review: m[8].trim() }]));
  const executed = new Set(executedControlIds());

  it("has one row per control with its executed status, citation count and pending review", () => {
    expect([...rows.keys()].sort()).toEqual([...SPEC_IDS].sort());
    for (const c of layer0) {
      const row = rows.get(c.id)!;
      expect(row.executed.startsWith("yes"), `${c.id}: executed column`).toBe(executed.has(c.id));
      expect(row.citations, c.id).toBe(c.citations.length);
      expect(row.review, c.id).toBe("pending (D-08)");
      const statuses = c.evidence.map((e) => producer(e.producer)?.status);
      const expected = statuses.every((s) => s === "available") ? "available" : statuses.some((s) => s === "available") ? "partial" : "planned";
      expect(row.producerStatus.split(" ")[0], `${c.id}: producer status`).toBe(expected);
    }
  });

  it("states its totals through gen-counts markers", () => {
    for (const key of ["layer0Controls", "layer0ExecutedControls", "layer0AwaitingProducer"]) expect(page).toContain(`<!-- amc:count:${key} -->`);
  });

  it("has one review packet per family naming each of its controls", () => {
    const families = [...new Set(layer0.map((c) => c.family))];
    expect(families).toHaveLength(12);
    for (const family of families) {
      const packet = docs(`docs/catalog/review-packets/layer0-${family}.md`);
      for (const c of layer0.filter((x) => x.family === family)) expect(packet, `${family}: ${c.id}`).toContain(`## ${c.id} · ${c.title}`);
      expect(packet).toContain("## Sign-off checklist");
    }
  });
});

/**
 * P2-42 · Adapt on the shipped catalog. With no catalog mock, a project on the technology or the wealth station, or on
 * all seven, crosses Adapt (Propose, Build, the probe, Review, completion) through the HTTP routes. Each Adapt revision
 * row binds its compiled plan and its other catalog-sized parts by sha256 (`amc.a4-derived-ref/v1`) and stays under the
 * 240 KiB Build room; each part is stored once under `a4-projects/<projectId>/derived/`, and `…/resolved` answers them
 * checked. A missing, changed or substituted plan file is an integrity failure for
 * verifyA4Chain and for every route that loads the project (409 A4_INTEGRITY_FAILED), never an empty plan; an exported
 * record still verifies offline without a key and says the plans are bound by digest.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { compactSpec, DERIVED_REF_SCHEMA, hydrateSpecJson, revisionDerivedProblems, writeDerived } from "../../src/a4/a4Derived.js";
import { openA4Store } from "../../src/a4/a4Store.js";
import { verifyA4Bundle, verifyA4Chain } from "../../src/a4/a4Verify.js";
import { copyA4Slice, type A4BundleSlice } from "../../src/bundles/bundleA4.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { aspireAnswers } from "./a4Harness.js";
import { ADAPT_ANSWERS, ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

const ROOM = 240 * 1024;
type Row = { revision_no: number; spec_json: string; spec_digest: string };

function adaptRows(j: Journey): Row[] {
  const store = openA4Store(j.t.workspace);
  try {
    return store.ledger.db.prepare("SELECT revision_no, spec_json, spec_digest FROM a4_revisions WHERE project_id = ? AND stage = 'adapt' ORDER BY revision_no")
      .all(j.p.projectId) as Row[];
  } finally {
    store.close();
  }
}
function chainErrors(j: Journey): string[] {
  const store = openA4Store(j.t.workspace);
  try {
    return verifyA4Chain(store.ledger, j.p.projectId).integrity.errors;
  } finally {
    store.close();
  }
}
const planFile = (j: Journey, sha256: string): string => join(j.t.workspace, "a4-projects", j.p.projectId, "derived", `${sha256}.json`);

/** One project through Aspire (on `station`), Assemble and Adapt on the shipped catalog; the head ends at Activate. */
async function acrossAdapt(station: string): Promise<{ j: Journey; ref: { sha256: string; digest: string } }> {
  const j = await Journey.start();
  await j.throughAspire(aspireAnswers({ stations: [station] }));
  await j.stage("assemble", ASSEMBLE_ANSWERS);
  await j.stage("adapt", ADAPT_ANSWERS);
  expect((await j.p.get(j.t.alice)).body.data).toMatchObject({ stage: "activate" });
  const proposal = adaptRows(j).map((row) => JSON.parse(row.spec_json) as { plan?: { sha256: string; digest: string } }).find((spec) => spec.plan !== undefined)!;
  return { j, ref: proposal.plan! };
}

describe.each(["technology", "wealth"])("P2-42 · Adapt on the shipped catalog (%s)", (station) => {
  test("the project crosses Adapt; every Adapt row binds the plan by sha256 and fits Build's room", async () => {
    const { j, ref } = await acrossAdapt(station);
    expect(ref).toMatchObject({ schema: DERIVED_REF_SCHEMA, kind: "compiled-plan", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), digest: expect.stringMatching(/^sha256:/) });
    const rows = adaptRows(j);
    for (const row of rows) expect(row.spec_json.length).toBeLessThan(ROOM);
    // The plan is stored once, named by its bytes, and is the plan the revision binds.
    const bytes = readFileSync(planFile(j, ref.sha256));
    expect(sha256Hex(bytes)).toBe(ref.sha256);
    expect((JSON.parse(bytes.toString("utf8")) as { digest: string }).digest).toBe(ref.digest);
    expect(chainErrors(j)).toEqual([]);
    // The revision route answers the stored form, content-addressed by its digest.
    const last = rows.at(-1)!;
    const revision = (await j.p.get(j.t.alice, `/revisions/${last.revision_no}`)).body.data!;
    expect(sha256Hex(canonicalize(revision.spec))).toBe(revision.specDigest);
    expect(revision.specDigest).toBe(last.spec_digest);
  });
});

describe("P2-42 · all seven stations, and the resolved view", () => {
  const ALL = ["education", "environment", "health", "wealth", "technology", "mobility", "governance"];
  test("a project on all seven stations crosses Adapt through Review; the explanation and Review's control lists are bound by sha256", async () => {
    const j = await Journey.start();
    await j.throughAspire(aspireAnswers({ stations: ALL }));
    await j.stage("assemble", ASSEMBLE_ANSWERS);
    await j.stage("adapt", ADAPT_ANSWERS);
    expect((await j.p.get(j.t.alice)).body.data).toMatchObject({ stage: "activate" });
    const rows = adaptRows(j);
    for (const row of rows) expect(row.spec_json.length).toBeLessThan(ROOM);
    const reviewed = JSON.parse(rows.at(-1)!.spec_json) as { explanation: { facts: unknown }; review: { conformance: { controls: unknown }; statement: { controls: unknown } };
      understanding: { facts: { requirements: unknown; register: unknown; clocks: unknown } } };
    for (const part of [reviewed.explanation.facts, reviewed.review.conformance.controls, reviewed.review.statement.controls, reviewed.understanding.facts.requirements,
      reviewed.understanding.facts.register, reviewed.understanding.facts.clocks]) {
      expect(part).toMatchObject({ schema: DERIVED_REF_SCHEMA, kind: "json", digest: null });
    }
    expect(chainErrors(j)).toEqual([]);
  });

  test("…/resolved answers the parts checked against their refs, the stored route answers the refs, and a missing part refuses both", async () => {
    const { j } = await acrossAdapt("wealth");
    const last = adaptRows(j).at(-1)!;
    const stored = (await j.p.get(j.t.alice, `/revisions/${last.revision_no}`)).body.data!;
    const resolved = (await j.p.get(j.t.alice, `/revisions/${last.revision_no}/resolved`)).body.data!;
    expect(resolved).toMatchObject({ schema: "amc.a4-revision-resolved/v1", revisionNo: last.revision_no, specDigest: last.spec_digest });
    const facts = (spec: unknown) => (spec as { understanding: { facts: { requirements: unknown; plan: unknown } } }).understanding.facts;
    expect(Array.isArray(facts(resolved.spec).requirements)).toBe(true);
    expect(facts(resolved.spec).plan).toMatchObject({ planVersion: 1 });
    const ref = facts(stored.spec).requirements as { sha256: string };
    expect(ref).toMatchObject({ schema: DERIVED_REF_SCHEMA, kind: "json" });
    rmSync(planFile(j, ref.sha256));
    for (const path of [`/revisions/${last.revision_no}/resolved`, `/revisions/${last.revision_no}`]) {
      const reply = await j.p.get(j.t.alice, path);
      expect(reply.status).toBe(409);
      expect(JSON.stringify(reply.body)).toContain("A4_INTEGRITY_FAILED");
    }
    expect(chainErrors(j).some((error) => error.startsWith("A4_DERIVED_MISSING: json"))).toBe(true);
  });
});

describe("P2-42 · the plan file is part of the record", () => {
  test("a missing, changed or substituted plan fails verifyA4Chain and every route that loads the project; restoring it heals", async () => {
    const { j, ref } = await acrossAdapt("technology");
    const path = planFile(j, ref.sha256);
    const original = readFileSync(path);

    rmSync(path);
    expect(chainErrors(j).some((error) => error.startsWith("A4_DERIVED_MISSING"))).toBe(true);
    const missing = await j.p.get(j.t.alice, "/readiness");
    expect(missing.status).toBe(409);
    expect(JSON.stringify(missing.body)).toContain("A4_INTEGRITY_FAILED");

    // Changed bytes under the plan's name.
    writeFileSync(path, `${original.toString("utf8")} `);
    expect(chainErrors(j).some((error) => error.startsWith("A4_DERIVED_MISMATCH"))).toBe(true);
    expect((await j.p.get(j.t.alice, "/readiness")).status).toBe(409);

    // Another plan substituted under the name (a valid plan, other bytes): refused, never read as this one.
    const other = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
    writeFileSync(path, canonicalize({ ...other, requirements: [] }));
    expect(chainErrors(j).some((error) => error.startsWith("A4_DERIVED_MISMATCH"))).toBe(true);
    expect((await j.p.post(j.t.alice, "/hold", { reason: "P2-42 substituted plan" })).status).toBe(409);

    writeFileSync(path, original);
    expect(chainErrors(j)).toEqual([]);
    expect((await j.p.get(j.t.alice, "/readiness")).status).toBe(200);
  });

  test("an exported record verifies offline without a key and says the plans are bound by digest", async () => {
    const { j } = await acrossAdapt("wealth");
    vi.stubEnv("AMC_A4_PREVIEW", "1");
    const root = join(j.t.workspace, "p242-export");
    const agentId = String((await j.p.get(j.t.alice)).body.data!.agentId);
    copyA4Slice({ workspace: j.t.workspace, root, agentId, slice: null });
    const index = JSON.parse(readFileSync(join(root, "a4", "index.json"), "utf8")) as A4BundleSlice;
    const record = join(root, "a4", `${index.projects[0]!.projectId}.json`);
    expect(existsSync(record)).toBe(true);
    const unpinned = await verifyA4Bundle(record, loadTrustContext({ amcHome: join(j.t.workspace, "p242-empty-home"), env: {} }));
    expect(unpinned.integrity).toMatchObject({ status: "pass" });
    expect(unpinned.warnings.some((warning) => warning.startsWith("DERIVED_BOUND_BY_DIGEST"))).toBe(true);
  });
});

describe("P2-42 · the derived-content guards", () => {
  const PROJECT = `a4p_${"0".repeat(32)}`;
  const plan = { planVersion: 1, digest: "sha256:aaaa", requirements: [{ controlId: "L0-X-01" }] };
  function stored(spec: Record<string, unknown>): { workspace: string; row: { revision_no: number; stage: string; spec_json: string } } {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p242-"));
    const { spec: compact, blobs } = compactSpec("adapt", spec);
    writeDerived(workspace, PROJECT, blobs);
    return { workspace, row: { revision_no: 3, stage: "adapt", spec_json: canonicalize(compact) } };
  }
  const refused = (workspace: string, row: { revision_no: number; stage: string; spec_json: string }): string => {
    try {
      hydrateSpecJson(workspace, PROJECT, row);
      return "hydrated";
    } catch (error) {
      return `${(error as { code?: string }).code}: ${JSON.stringify((error as { detail?: unknown }).detail)}`;
    }
  };

  test("both plan paths share one file and hydrate back to the spec as produced; another stage and an inline plan are left alone", () => {
    const spec = { schema: "amc.a4-adapt-spec/v1", plan, understanding: { facts: { plan, register: [] } } };
    const { workspace, row } = stored(spec);
    expect(compactSpec("adapt", spec).blobs.size).toBe(1);
    expect(JSON.parse(hydrateSpecJson(workspace, PROJECT, row))).toEqual(spec);
    expect(revisionDerivedProblems(workspace, PROJECT, row)).toEqual([]);
    expect(compactSpec("aspire", spec).spec).toBe(spec);
    const inline = { revision_no: 2, stage: "adapt", spec_json: canonicalize(spec) };
    expect(hydrateSpecJson(workspace, PROJECT, inline)).toBe(inline.spec_json);
    rmSync(workspace, { recursive: true, force: true });
  });

  test("a ref whose plan digest is not the file's, and a ref that does not parse, are integrity failures", () => {
    const { workspace, row } = stored({ plan });
    const other = { ...row, spec_json: row.spec_json.replace("sha256:aaaa", "sha256:bbbb") };
    expect(refused(workspace, other)).toMatch(/^A4_INTEGRITY_FAILED: .*A4_DERIVED_MISMATCH/);
    expect(revisionDerivedProblems(workspace, PROJECT, other)[0]).toMatch(/^A4_DERIVED_MISMATCH/);
    const bad = { ...row, spec_json: row.spec_json.replace(/"sha256":"[0-9a-f]{64}"/, "\"sha256\":\"../../x\"") };
    const misplaced = { ...row, spec_json: row.spec_json.replace('"kind":"compiled-plan"', '"kind":"json"').replace('"digest":"sha256:aaaa"', '"digest":null') };
    expect(refused(workspace, misplaced)).toMatch(/^A4_INTEGRITY_FAILED: .*A4_DERIVED_REF_INVALID/);
    expect(refused(workspace, bad)).toMatch(/^A4_INTEGRITY_FAILED: .*A4_DERIVED_REF_INVALID/);
    rmSync(workspace, { recursive: true, force: true });
  });

  test("a plan that holds a credential is refused before it is stored", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p242-"));
    const { blobs } = compactSpec("adapt", { plan: { ...plan, note: "key sk-p242abcdefghijklmnop" } });
    expect(() => writeDerived(workspace, PROJECT, blobs)).toThrow(/SECRET_IN_INPUT/);
    expect(existsSync(join(workspace, "a4-projects", PROJECT, "derived", `${[...blobs.keys()][0]!}.json`))).toBe(false);
    rmSync(workspace, { recursive: true, force: true });
  });
});

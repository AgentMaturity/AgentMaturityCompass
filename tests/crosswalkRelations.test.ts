import { describe, expect, test } from "vitest";
import { frameworkControls } from "../src/compliance/frameworks/controls.js";
import { crosswalkLinkSchema, frameworkControlSchema, type FrameworkControl } from "../src/compliance/mappingSchema.js";

/**
 * P1-45: every control-to-mapping crosswalk link states its relation and why. `equivalent` needs a named
 * D-08 expert's sign-off id; none is recorded, so no built-in link may claim it (truth rule 8).
 */

const links = frameworkControls.flatMap((control) => control.mappings.map((link) => ({ control, link })));

describe("crosswalk link relations", () => {
  test("every built-in link has a relation and a non-empty rationale", () => {
    expect(links.length).toBeGreaterThan(300);
    const bad = links
      .filter(({ link }) => !crosswalkLinkSchema.safeParse(link).success)
      .map(({ control, link }) => `${control.controlId}->${link.mappingId}`);
    expect(bad).toEqual([]);
    for (const { control, link } of links) {
      expect(["equivalent", "partial", "conflicting"], `${control.controlId}->${link.mappingId}`).toContain(link.relation);
      expect(link.rationale.trim().length, `${control.controlId}->${link.mappingId}`).toBeGreaterThan(20);
    }
  });

  test("no built-in link is equivalent or carries a sign-off: no D-08 expert has signed one", () => {
    expect(links.filter(({ link }) => link.relation === "equivalent" || link.signOffId !== undefined)).toEqual([]);
  });

  test("the legacy coverage label is gone from every link", () => {
    expect(links.filter(({ link }) => "coverage" in link)).toEqual([]);
  });

  test("rationales cite no file line numbers or research paths", () => {
    const stale = links.filter(({ link }) => /\.ts:\d|AMC_OS|worktree|UNCOMMITTED/i.test(link.rationale));
    expect(stale.map(({ control, link }) => `${control.controlId}->${link.mappingId}`)).toEqual([]);
  });
});

describe("crosswalkLinkSchema", () => {
  const base = { mappingId: "dora_art5_governance", relation: "partial", rationale: "Evidence covers the accountable approver only." };

  test("accepts a partial link with a rationale", () => {
    expect(crosswalkLinkSchema.safeParse(base).success).toBe(true);
    expect(crosswalkLinkSchema.safeParse({ ...base, relation: "conflicting" }).success).toBe(true);
  });

  test("equivalent without a sign-off id fails; with one it parses", () => {
    expect(crosswalkLinkSchema.safeParse({ ...base, relation: "equivalent" }).success).toBe(false);
    expect(crosswalkLinkSchema.safeParse({ ...base, relation: "equivalent", signOffId: "   " }).success).toBe(false);
    expect(crosswalkLinkSchema.safeParse({ ...base, relation: "equivalent", signOffId: "d08-signoff-1" }).success).toBe(true);
  });

  test.each(["supporting", "same", "", "EQUIVALENT"])("rejects the unknown relation %j", (relation) => {
    expect(crosswalkLinkSchema.safeParse({ ...base, relation }).success).toBe(false);
  });

  test.each(["", "   "])("rejects the empty rationale %j", (rationale) => {
    expect(crosswalkLinkSchema.safeParse({ ...base, rationale }).success).toBe(false);
  });

  test("rejects a link without a relation, and one that still carries coverage", () => {
    const { relation: _relation, ...noRelation } = base;
    expect(crosswalkLinkSchema.safeParse(noRelation).success).toBe(false);
    expect(crosswalkLinkSchema.safeParse({ ...base, coverage: "partial" }).success).toBe(false);
  });

  test("a control fails its schema when one of its links does", () => {
    const control: FrameworkControl = { ...frameworkControls.find((row) => row.mappings.length > 0)! };
    expect(frameworkControlSchema.safeParse(control).success).toBe(true);
    const broken = { ...control, mappings: [{ ...control.mappings[0]!, relation: "equivalent" }] };
    expect(frameworkControlSchema.safeParse(broken).success).toBe(false);
  });
});

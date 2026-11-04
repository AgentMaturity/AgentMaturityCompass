import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { NOT_PROVIDED, renderLibrary, validateLibrary } from "../scripts/gen-procurement-clauses.mjs";

const root = process.cwd();
const script = join(root, "scripts/gen-procurement-clauses.mjs");
const library = JSON.parse(readFileSync(join(root, "docs/procurement-clauses.json"), "utf8"));
const committed = readFileSync(join(root, "docs/PROCUREMENT_CLAUSES.md"), "utf8");

/** The twelve clause topics P3-19 requires, by stable id (P3-25 maps these ids to A4 records). */
const REQUIRED_IDS = [
  "PC-EVIDENCE-DELIVERY", "PC-INDEPENDENT-VERIFICATION", "PC-CLAIM-VOCABULARY", "PC-ATTESTATION-SCOPE",
  "PC-TEST-AND-MONITOR", "PC-CHANGE-NOTICE", "PC-INCIDENT-NOTICE", "PC-DATA-USE-AND-EXIT", "PC-AUDIT-ACCESS",
  "PC-SUBPROCESSORS", "PC-RBI-RETAINED-DECISIONS", "PC-DORA-REGISTER-AND-EXIT"
];

const clone = () => structuredClone(library);
const withClause = (patch: Record<string, unknown>, id = "PC-EVIDENCE-DELIVERY") => {
  const lib = clone();
  const i = lib.clauses.findIndex((c: { id: string }) => c.id === id);
  lib.clauses[i] = { ...lib.clauses[i], ...patch };
  return lib;
};

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });
}

describe("procurement clause library (P3-19)", () => {
  test("the committed library is valid", () => {
    expect(validateLibrary(library, root)).toEqual([]);
  });

  test("all twelve clause topics are present, each id once", () => {
    const ids = library.clauses.map((c: { id: string }) => c.id);
    expect([...ids].sort()).toEqual([...REQUIRED_IDS].sort());
  });

  test("every clause has a source with a url or path and a verifiedAt date", () => {
    for (const clause of library.clauses) {
      expect(clause.sources.length, clause.id).toBeGreaterThan(0);
      for (const s of clause.sources) {
        expect(s.verifiedAt, clause.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Boolean(s.url) !== Boolean(s.path), clause.id).toBe(true);
      }
    }
  });

  test("every clause names an AMC artifact or says it is not provided by AMC", () => {
    for (const clause of library.clauses) expect(clause.amcArtifact.trim().length, clause.id).toBeGreaterThan(0);
    expect(library.clauses.some((c: { amcArtifact: string }) => c.amcArtifact === NOT_PROVIDED)).toBe(true);
  });

  test("no clause is counsel-reviewed yet: counsel review is pending", () => {
    expect(library.clauses.every((c: { status: string }) => c.status === "experimental")).toBe(true);
  });

  test("negative fixture: a clause without sources fails", () => {
    expect(validateLibrary(withClause({ sources: [] }), root)).toContain("PC-EVIDENCE-DELIVERY: has no sources");
  });

  test("negative fixture: a source without verifiedAt or without url and path fails", () => {
    const src = library.clauses[0].sources[0];
    expect(validateLibrary(withClause({ sources: [{ ...src, verifiedAt: undefined }] }), root))
      .toContain("PC-EVIDENCE-DELIVERY: sources[0] has no verifiedAt date");
    expect(validateLibrary(withClause({ sources: [{ citation: "x", verifiedAt: "2026-10-29" }] }), root))
      .toContain("PC-EVIDENCE-DELIVERY: sources[0] needs exactly one of url or path");
  });

  test("negative fixture: a regulatory clause citing only repo paths fails", () => {
    const pathOnly = library.clauses[0].sources.filter((s: { path?: string }) => s.path);
    expect(validateLibrary(withClause({ sources: pathOnly }), root))
      .toContain("PC-EVIDENCE-DELIVERY: a regulatory clause needs at least one source with a url");
  });

  test("negative fixture: a source path that does not exist fails", () => {
    const errors = validateLibrary(withClause({ sources: [{ citation: "x", path: "docs/NO_SUCH_FILE.md", verifiedAt: "2026-10-29" }] }), root);
    expect(errors).toContain("PC-EVIDENCE-DELIVERY: sources[0] path docs/NO_SUCH_FILE.md does not exist");
  });

  test("negative fixture: a counsel-reviewed clause without reviewer or date fails", () => {
    const errors = validateLibrary(withClause({ status: "counsel-reviewed" }), root);
    expect(errors).toContain("PC-EVIDENCE-DELIVERY: counsel-reviewed needs a reviewer");
    expect(errors).toContain("PC-EVIDENCE-DELIVERY: counsel-reviewed needs a reviewedAt date");
    expect(validateLibrary(withClause({ status: "counsel-reviewed", reviewer: "A. Counsel", reviewedAt: "2027-01-02" }), root)).toEqual([]);
  });

  test("negative fixture: an experimental clause naming a reviewer fails", () => {
    expect(validateLibrary(withClause({ reviewer: "A. Counsel" }), root))
      .toContain("PC-EVIDENCE-DELIVERY: an experimental clause names no reviewer or reviewedAt");
  });

  test("negative fixture: banned wording fails outside the claim-vocabulary clause's quotes", () => {
    for (const word of ["certified", "compliant", "guarantee", "guaranteed"]) {
      const errors = validateLibrary(withClause({ text: `The system is ${word}.` }), root);
      expect(errors.some((e) => e.startsWith("PC-EVIDENCE-DELIVERY: text uses banned wording")), word).toBe(true);
    }
    const vocab = library.clauses.find((c: { id: string }) => c.id === "PC-CLAIM-VOCABULARY");
    expect(vocab.text).toContain("\"certified\"");
    const unquoted = withClause({ text: `${vocab.text} The system is certified.` }, "PC-CLAIM-VOCABULARY");
    expect(validateLibrary(unquoted, root).some((e) => e.startsWith("PC-CLAIM-VOCABULARY: text uses banned wording"))).toBe(true);
  });

  test("negative fixture: duplicate ids and unknown regimes fail", () => {
    const dup = clone();
    dup.clauses.push(dup.clauses[0]);
    expect(validateLibrary(dup, root)).toContain("PC-EVIDENCE-DELIVERY: duplicate id");
    expect(validateLibrary(withClause({ regimes: ["mars"] }), root).some((e) => e.includes("regimes must be"))).toBe(true);
  });

  test("the Markdown matches the library and every unreviewed clause carries the experimental banner", () => {
    expect(committed).toBe(renderLibrary(library));
    const banners = committed.match(/\*\*Status: experimental\.\*\*/g) ?? [];
    expect(banners.length).toBe(library.clauses.length);
    expect(committed).toContain("not legal advice");
  });

  test("a reviewed clause renders its reviewer instead of the banner", () => {
    const md = renderLibrary(withClause({ status: "counsel-reviewed", reviewer: "A. Counsel", reviewedAt: "2027-01-02" }));
    expect(md).toContain("**Status: counsel-reviewed** by A. Counsel on 2027-01-02.");
    expect((md.match(/\*\*Status: experimental\.\*\*/g) ?? []).length).toBe(library.clauses.length - 1);
  });

  test("--check passes on the committed page and fails on a stale one; an invalid library exits 2", () => {
    const ok = run(["--check"]);
    expect(ok.status, ok.stderr).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "amc-pc-"));
    const stale = join(dir, "stale.md");
    writeFileSync(stale, `${committed}\nhand edit\n`);
    expect(run(["--check", "--out", stale]).status).toBe(1);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify(withClause({ sources: [] })));
    const invalid = run(["--check", "--data", bad, "--out", stale]);
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain("has no sources");
  });
});

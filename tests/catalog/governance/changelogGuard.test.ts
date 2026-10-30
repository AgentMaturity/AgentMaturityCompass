/**
 * P1-34 changelog guard: a catalog digest change needs one appended catalog/CHANGELOG.md entry naming the new catalog
 * version and digest and every changed control; history is append-only; reviewed content needs review record ids.
 */
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCatalogChangelog, type CatalogChangeEntry } from "../../../src/catalog/governance/changelogGuard.js";
import { defaultCatalogRoot, loadCatalog, type LoadedCatalog } from "../../../src/catalog/loader.js";
import { buildCatalogLock } from "../../../src/catalog/lockfile.js";
import type { ControlRecord } from "../../../src/catalog/types.js";
import { canonicalize } from "../../../src/utils/json.js";

const cat = loadCatalog();
const ID = "L0-ADV-01";

function variant(version: string, edit: (record: ControlRecord) => ControlRecord | null): LoadedCatalog {
  const controls = new Map(cat.controls);
  const next = edit(cat.controls.get(ID)!);
  if (next) controls.set(ID, next); else controls.delete(ID);
  const packs = new Map([...cat.packs].map(([id, p]) => [id, { ...p, manifest: { ...p.manifest, controls: p.manifest.controls.filter((c) => controls.has(c)) } }]));
  return { ...cat, manifest: { ...cat.manifest!, version }, controls, packs };
}

const block = (entry: CatalogChangeEntry): string => `\`\`\`amc-catalog-change\n${canonicalize(entry)}\n\`\`\`\n`;

function input(next: LoadedCatalog, previousText: string, currentText: string) {
  return { previousLock: buildCatalogLock(cat), currentLock: buildCatalogLock(next), previousControls: [...cat.controls.values()],
    currentControls: [...next.controls.values()], previousText, currentText };
}

const HISTORY = "# Catalog changelog\n\n## 0.1.0\n\n" + block({ entryVersion: 1, catalog: buildCatalogLock(cat).catalog, controls: [] });
const bumped = variant("0.2.0", (r) => ({ ...r, version: "0.2.0", statement: `${r.statement} (fixture edit)` }));
const changedEntry = (refs: string[] = []): CatalogChangeEntry => ({ entryVersion: 1, catalog: buildCatalogLock(bumped).catalog,
  controls: [{ id: ID, version: "0.2.0", change: "changed", reason: "fixture edit", reviewRecordIds: refs }] });

describe("checkCatalogChangelog (P1-34 step 8)", () => {
  it("a digest change without a changelog entry fails and names the expected entry", () => {
    const result = checkCatalogChangelog(input(bumped, HISTORY, HISTORY));
    expect(result).toMatchObject({ ok: false, issues: [{ code: "GOV_CHANGELOG_ENTRY_COUNT" }] });
    expect(result.expected).toEqual({ catalog: buildCatalogLock(bumped).catalog, controls: [{ id: ID, version: "0.2.0", change: "changed" }] });
  });

  it("a matching appended entry passes", () => {
    expect(checkCatalogChangelog(input(bumped, HISTORY, HISTORY + "\n## 0.2.0\n\n" + block(changedEntry())))).toMatchObject({ ok: true, issues: [] });
  });

  it("editing, truncating or reordering an old entry fails", () => {
    const edited = HISTORY.replace("## 0.1.0", "## 0.1.0 (edited)");
    expect(checkCatalogChangelog(input(bumped, HISTORY, edited + block(changedEntry())))).toMatchObject({ ok: false, issues: [{ code: "GOV_CHANGELOG_HISTORY_CHANGED" }] });
    expect(checkCatalogChangelog(input(cat, HISTORY, HISTORY.slice(0, -2))).issues[0]?.code).toBe("GOV_CHANGELOG_HISTORY_CHANGED");
  });

  it("an entry that misses a changed control, or names the wrong version or digest, fails", () => {
    const wrongDigest = { ...changedEntry(), catalog: { ...changedEntry().catalog, digest: `sha256:${"0".repeat(64)}` } };
    expect(checkCatalogChangelog(input(bumped, HISTORY, HISTORY + block(wrongDigest))).issues[0]?.code).toBe("GOV_CHANGELOG_CATALOG_MISMATCH");
    expect(checkCatalogChangelog(input(bumped, HISTORY, HISTORY + block({ ...changedEntry(), controls: [] }))).issues[0]?.code).toBe("GOV_CHANGELOG_CONTROL_COVERAGE");
  });

  it("a change to reviewed content needs review record ids; experimental content may have none", () => {
    const before = { ...cat, controls: new Map(cat.controls).set(ID, { ...cat.controls.get(ID)!, support: "reviewed" as const }) };
    const after = variant("0.2.0", (r) => ({ ...r, support: "reviewed", version: "0.2.0" }));
    const entry = (refs: string[]): CatalogChangeEntry => ({ entryVersion: 1, catalog: buildCatalogLock(after).catalog,
      controls: [{ id: ID, version: "0.2.0", change: "changed", reason: "fixture edit", reviewRecordIds: refs }] });
    const run = (refs: string[]) => checkCatalogChangelog({ ...input(after, HISTORY, HISTORY + block(entry(refs))),
      previousLock: buildCatalogLock(before), previousControls: [...before.controls.values()] });
    expect(run([]).issues[0]?.code).toBe("GOV_CHANGELOG_REVIEW_REFS_MISSING");
    expect(run(["rr-fixture-1"])).toMatchObject({ ok: true });
  });

  it("retirement is a support transition; a removed control is unresolved, never treated as retired", () => {
    const retired = variant("0.2.0", (r) => ({ ...r, support: "retired" }));
    const retire: CatalogChangeEntry = { entryVersion: 1, catalog: buildCatalogLock(retired).catalog,
      controls: [{ id: ID, version: cat.controls.get(ID)!.version, change: "retired", reason: "fixture retirement", reviewRecordIds: [] }] };
    expect(checkCatalogChangelog(input(retired, HISTORY, HISTORY + block(retire)))).toMatchObject({ ok: true });
    const removed = variant("0.2.0", () => null);
    expect(checkCatalogChangelog(input(removed, HISTORY, HISTORY)).issues[0]?.code).toBe("GOV_CHANGELOG_REMOVAL_UNRESOLVED");
  });

  it("governance files load but change no digest; any other file under governance/ is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-gov-catalog-"));
    try {
      const root = join(dir, "catalog");
      cpSync(defaultCatalogRoot(), root, { recursive: true });
      mkdirSync(join(root, "reviews", ID, "0.1.0"), { recursive: true });
      writeFileSync(join(root, "reviews", ID, "0.1.0", "rr-fixture.json"), "{}");
      appendFileSync(join(root, "CHANGELOG.md"), "\nA note.\n");
      const copy = loadCatalog({ root });
      expect(copy.issues).toEqual([]);
      expect(buildCatalogLock(copy).catalog).toEqual(buildCatalogLock(cat).catalog);
      writeFileSync(join(root, "governance", "notes.md"), "stray");
      expect(loadCatalog({ root }).issues.map((i) => i.code)).toEqual(["CAT_STRAY_FILE"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the committed changelog's last entry pins the shipped catalog digest", () => {
    const text = readFileSync(join(defaultCatalogRoot(), "CHANGELOG.md"), "utf8");
    expect(checkCatalogChangelog(input(cat, text, text))).toMatchObject({ ok: true });
    const last = [...text.matchAll(/^```amc-catalog-change\n(.+)\n```$/gm)].at(-1)?.[1];
    expect(JSON.parse(last ?? "null")?.catalog).toEqual(buildCatalogLock(cat).catalog);
  });
});

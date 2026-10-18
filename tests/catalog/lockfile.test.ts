import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { defaultCatalogRoot, loadCatalog } from "../../src/catalog/loader.js";
import { buildCatalogLock, verifyCatalogLock, type CatalogLockfile } from "../../src/catalog/lockfile.js";

const roots: string[] = [];
const CONTROL_ID = "L0-IDN-01";
const PACK_ID = "amc.l0.baseline";
const DIFFERENT_DIGEST = `sha256:${"0".repeat(64)}`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function catalogFixture(): string {
  const temporary = mkdtempSync(join(tmpdir(), "amc-catalog-lock-"));
  roots.push(temporary);
  const root = join(temporary, "catalog");
  cpSync(defaultCatalogRoot(), root, { recursive: true });
  return root;
}

function loaded(root: string) {
  const catalog = loadCatalog({ root });
  expect(catalog.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  expect(catalog.manifest).not.toBeNull();
  expect(catalog.vocabulary).not.toBeNull();
  return catalog;
}

function writeYaml(root: string, file: string, value: unknown): void {
  // Quote strings so the loader's explicit refusal of unquoted dates stays intact.
  writeFileSync(join(root, file), YAML.stringify(value, { defaultStringType: "QUOTE_DOUBLE" }));
}

describe("catalog lockfile from the real catalog loader", () => {
  test("repeated builds and different absolute fixture roots have identical lock bytes", () => {
    const first = loaded(catalogFixture());
    const second = loaded(catalogFixture());
    expect(first.root).not.toBe(second.root);
    const firstLock = buildCatalogLock(first);
    expect(JSON.stringify(buildCatalogLock(first), null, 2)).toBe(JSON.stringify(firstLock, null, 2));
    expect(JSON.stringify(buildCatalogLock(second), null, 2)).toBe(JSON.stringify(firstLock, null, 2));
    expect(verifyCatalogLock(firstLock, second)).toEqual({ ok: true, mismatches: [] });
  });

  test("YAML key order, quoting and comments do not change the normalized lock", () => {
    const root = catalogFixture();
    const before = loaded(root);
    const lock = buildCatalogLock(before);
    const reordered = Object.fromEntries(Object.entries(before.manifest!).reverse());
    writeYaml(root, "catalog.yaml", reordered);
    const path = join(root, "catalog.yaml");
    writeFileSync(path, `# Formatting-only catalog fixture\n${readFileSync(path, "utf8")}\n`);
    const after = loaded(root);
    expect(buildCatalogLock(after)).toEqual(lock);
    expect(verifyCatalogLock(lock, after)).toEqual({ ok: true, mismatches: [] });
  });

  test("reordering producer declarations leaves their digest and the whole lock unchanged", () => {
    const root = catalogFixture();
    const before = loaded(root);
    expect(before.producers.length).toBeGreaterThan(1);
    const lock = buildCatalogLock(before);
    writeYaml(root, "producers.yaml", { producers: [...before.producers].reverse() });
    const after = loaded(root);
    expect(after.producers.map((producer) => producer.id)).toEqual(before.producers.map((producer) => producer.id).reverse());
    expect(buildCatalogLock(after)).toEqual(lock);
    expect(verifyCatalogLock(lock, after)).toEqual({ ok: true, mismatches: [] });
  });

  test("a changed control changes its own, pack and catalog digests with exact mismatch paths", () => {
    const root = catalogFixture();
    const before = loaded(root);
    const lock = buildCatalogLock(before);
    const file = before.controlFiles.get(CONTROL_ID);
    expect(file).toBeDefined();
    const path = join(root, file!);
    const text = readFileSync(path, "utf8");
    expect(text.match(/^title:/gm)).toHaveLength(1);
    writeFileSync(path, text.replace(/^title:.*$/m, "title: Changed synthetic lock fixture title"));
    const after = loaded(root);
    expect(after.controls.get(CONTROL_ID)?.title).toBe("Changed synthetic lock fixture title");
    const changed = buildCatalogLock(after);
    expect(changed.controls.find((control) => control.id === CONTROL_ID)?.digest)
      .not.toBe(lock.controls.find((control) => control.id === CONTROL_ID)?.digest);
    const result = verifyCatalogLock(lock, after);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((mismatch) => mismatch.path)).toEqual([
      "catalog.digest", `controls[${CONTROL_ID}].digest`, `packs[${PACK_ID}].digest`,
    ]);
  });

  test("fixture bytes affect pack and catalog digests even when parsed JSON is unchanged", () => {
    const root = catalogFixture();
    const before = loaded(root);
    const lock = buildCatalogLock(before);
    const fixtureRef = `${CONTROL_ID}/positive/lease-and-principal.json`;
    const fixture = before.fixtures.get(fixtureRef);
    expect(fixture?.envelope).not.toBeNull();
    expect(fixture).toBeDefined();
    const path = join(root, fixture!.path);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    const after = loaded(root);
    expect(after.fixtures.get(fixtureRef)?.envelope).toEqual(fixture!.envelope);
    expect(after.fixtures.get(fixtureRef)?.sha256).not.toBe(fixture!.sha256);
    expect(buildCatalogLock(after).controls).toEqual(lock.controls);
    const result = verifyCatalogLock(lock, after);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((mismatch) => mismatch.path)).toEqual([
      "catalog.digest", `packs[${PACK_ID}].digest`,
    ]);
  });

  test("lock rows compare by identity rather than array position", () => {
    const catalog = loaded(catalogFixture());
    const lock = buildCatalogLock(catalog);
    expect(lock.sources.length).toBeGreaterThan(1);
    lock.packs.reverse();
    lock.controls.reverse();
    lock.sources.reverse();
    expect(verifyCatalogLock(lock, catalog)).toEqual({ ok: true, mismatches: [] });
  });

  test("a stored digest mismatch identifies the stored value and rebuilt value", () => {
    const catalog = loaded(catalogFixture());
    const lock = buildCatalogLock(catalog);
    const actualDigest = lock.catalog.digest;
    expect(actualDigest).not.toBe(DIFFERENT_DIGEST);
    lock.catalog.digest = DIFFERENT_DIGEST;
    expect(verifyCatalogLock(lock, catalog)).toEqual({
      ok: false,
      mismatches: [{ path: "catalog.digest", expected: JSON.stringify(DIFFERENT_DIGEST), actual: JSON.stringify(actualDigest) }],
    });
  });

  test("unknown lock members are refused before digest comparison", () => {
    const catalog = loaded(catalogFixture());
    const lock = buildCatalogLock(catalog);
    const result = verifyCatalogLock({ ...lock, unknownQualificationMember: true }, catalog);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ expected: "a valid catalog lockfile" }),
    ]));
  });

  test("a null source value cannot be replaced by the string null", () => {
    const catalog = loaded(catalogFixture());
    const lock = buildCatalogLock(catalog);
    const source = lock.sources.find(row => row.registerId === null);
    expect(source).toBeDefined();
    source!.registerId = "null";
    const result = verifyCatalogLock(lock, catalog);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      expect.objectContaining({ path: `sources[${source!.controlId}/${source!.citationKey}].registerId` })
    ]);
    expect(result.mismatches[0]!.expected).not.toBe(result.mismatches[0]!.actual);
  });

  test("does not build a lock when a real fixture file failed to load", () => {
    const root = catalogFixture();
    const path = join(root, "fixtures", CONTROL_ID, "positive", "lease-and-principal.json");
    writeFileSync(path, "{ not JSON }");
    const catalog = loadCatalog({ root });
    expect(catalog.issues.some((issue) => issue.severity === "error")).toBe(true);
    expect(() => buildCatalogLock(catalog)).toThrow(/did not load cleanly/);
  });
});

const duplicateCases: Array<{ name: string; duplicate: (lock: CatalogLockfile) => void }> = [
  { name: "pack id", duplicate: (lock) => {
    expect(lock.packs.length).toBeGreaterThan(0);
    expect(lock.packs[0]!.digest).not.toBe(DIFFERENT_DIGEST);
    lock.packs.unshift({ ...lock.packs[0]!, digest: DIFFERENT_DIGEST });
  } },
  { name: "control id", duplicate: (lock) => {
    expect(lock.controls.length).toBeGreaterThan(0);
    expect(lock.controls[0]!.digest).not.toBe(DIFFERENT_DIGEST);
    lock.controls.unshift({ ...lock.controls[0]!, digest: DIFFERENT_DIGEST });
  } },
  { name: "source controlId/citationKey", duplicate: (lock) => {
    expect(lock.sources.length).toBeGreaterThan(0);
    const first = lock.sources[0]!;
    lock.sources.unshift({ ...first, url: `${first.url}#shadowed-conflicting-source` });
  } },
];

describe("duplicate lock identities", () => {
  test.each(duplicateCases)("refuses a conflicting duplicate $name even when the correct row comes last", ({ duplicate }) => {
    const catalog = loaded(catalogFixture());
    const lock = buildCatalogLock(catalog);
    expect(verifyCatalogLock(lock, catalog)).toEqual({ ok: true, mismatches: [] });
    duplicate(lock);
    const result = verifyCatalogLock(lock, catalog);
    expect(result.ok).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

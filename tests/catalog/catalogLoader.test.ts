import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { defaultCatalogRoot, loadCatalog } from "../../src/catalog/loader.js";
import { validateCatalog } from "../../src/catalog/validate.js";

const roots: string[] = [];
const example = "layers/l0-baseline/controls/L0-IDN-01.yaml";
const asOf = new Date("2026-10-15T00:00:00Z");

function copyCatalog(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-p109-loader-"));
  roots.push(root);
  cpSync(defaultCatalogRoot(), root, { recursive: true });
  return root;
}

function codes(root: string): string[] {
  return validateCatalog(loadCatalog({ root }), { asOf }).errors.map(issue => issue.code);
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("catalog data loader", () => {
  test("the shipped catalog loads and validates with its experimental citations", () => {
    const catalog = loadCatalog();
    expect(catalog.controls.has("L0-IDN-01")).toBe(true);
    expect(catalog.fixtures.size).toBeGreaterThanOrEqual(8);
    const validation = validateCatalog(catalog, { asOf });
    expect(validation.errors).toEqual([]);
    expect(validation.warnings.every(issue => issue.code === "CAT_NO_REGISTER_ENTRY")).toBe(true);
  });

  test("duplicate control ids are refused across directories", () => {
    const root = copyCatalog();
    const target = join(root, "layers", "duplicate", "controls");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "L0-IDN-01.yaml"), readFileSync(join(root, example)));
    expect(codes(root)).toContain("CAT_DUPLICATE_ID");
  });

  test("a referenced fixture must exist", () => {
    const root = copyCatalog();
    const control = loadCatalog({ root }).controls.get("L0-IDN-01")!;
    unlinkSync(join(root, "fixtures", control.tests[0]!.fixtures.positive[0]!));
    expect(codes(root)).toContain("CAT_FIXTURE_MISSING");
  });

  test("an evidence producer must be registered", () => {
    const root = copyCatalog();
    const path = join(root, example);
    const value = YAML.parse(readFileSync(path, "utf8"));
    value.evidence[0].producer = "unregistered.producer";
    writeFileSync(path, YAML.stringify(value, { defaultStringType: "QUOTE_DOUBLE" }));
    expect(codes(root)).toContain("CAT_PRODUCER_UNKNOWN");
  });

  test("stray JavaScript is refused as data, never evaluated", () => {
    const root = copyCatalog();
    writeFileSync(join(root, "stray.js"), 'throw new Error("CATALOG_FILE_EXECUTED");\n');
    expect(codes(root)).toContain("CAT_STRAY_FILE");
  });

  test("symlinked content cannot enter the catalog", () => {
    const root = copyCatalog();
    symlinkSync(join(root, example), join(root, "linked.yaml"));
    expect(codes(root)).toContain("CAT_STRAY_FILE");
  });

  test.each([
    ["anchor", (text: string) => text.replace("id: L0-IDN-01", "id: &control-id L0-IDN-01"), "CAT_YAML_ALIAS"],
    ["alias", (text: string) => text + "\nextra: *missing\n", "CAT_YAML_ALIAS"],
    ["tag", (text: string) => text.replace("id: L0-IDN-01", "id: !!str L0-IDN-01"), "CAT_YAML_TAG"],
    ["duplicate key", (text: string) => text + "\nid: L0-IDN-01\n", "CAT_YAML"],
    ["unquoted date", (text: string) => text.replace(/draftedAt: [^\n]+/, "draftedAt: 2026-10-05"), "CAT_SCHEMA"],
    ["float", (text: string) => text.replace("attempts: 1", "attempts: 1.5"), "CAT_SCHEMA"]
  ] as const)("refuses YAML %s", (_name, change, code) => {
    const root = copyCatalog();
    const path = join(root, example);
    const original = readFileSync(path, "utf8");
    const changed = change(original);
    expect(changed).not.toBe(original);
    writeFileSync(path, changed);
    expect(codes(root)).toContain(code);
  });
});

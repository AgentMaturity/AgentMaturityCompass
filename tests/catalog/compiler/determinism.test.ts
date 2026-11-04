import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";
import { compilePlan } from "../../../src/catalog/compiler/compile.js";
import { loadCatalog } from "../../../src/catalog/loader.js";
import { AS_OF, CONTROL_IDS, createCompilerFixture, makeProfile } from "./helpers.js";

function filesUnder(root: string): Map<string, Buffer> {
  const rows = new Map<string, Buffer>();
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      expect(entry.isSymbolicLink()).toBe(false);
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        expect(entry.isFile()).toBe(true);
        rows.set(relative(root, path).split(sep).join("/"), readFileSync(path));
      }
    }
  };
  walk(root);
  return rows;
}

const hashes = (files: Map<string, Buffer>): Array<[string, string]> => [...files]
  .map(([path, bytes]): [string, string] => [path, createHash("sha256").update(bytes).digest("hex")])
  .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
  return [];
}

describe("compiler deterministic bytes", () => {
  test("reversed physical file creation order reloads byte-identical data and yields an identical plan", () => {
    const fixture = createCompilerFixture();
    try {
      const before = filesUnder(fixture.root);
      const first = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      rmSync(fixture.root, { recursive: true });
      mkdirSync(fixture.root, { mode: 0o700 });
      const written: string[] = [];
      for (const [path, bytes] of [...before].reverse()) {
        const target = join(fixture.root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes, { flag: "wx" });
        written.push(path);
      }
      expect(written).toEqual([...before.keys()].reverse());
      expect(hashes(filesUnder(fixture.root))).toEqual(hashes(before));
      const reloaded = loadCatalog({ root: fixture.root });
      expect(reloaded.issues).toEqual([]);
      const next = compilePlan({ catalog: reloaded, profile: fixture.profile, asOf: AS_OF });
      expect(JSON.stringify(next, null, 2)).toBe(JSON.stringify(first, null, 2));
      expect(next.digest).toBe(first.digest);
      expect(next.requirements.filter(row => row.controlId === CONTROL_IDS.layer0)).toHaveLength(1);
      expect(next.requirements.find(row => row.controlId === CONTROL_IDS.layer0)!.pulledInBy).toEqual([
        "layer0", "station:wealth", "station:technology"
      ]);
    } finally { fixture.cleanup(); }
  });

  test("shuffled profile arrays normalize identically and compilation adds no runtime timestamp", () => {
    const fixture = createCompilerFixture();
    try {
      const profile = makeProfile({ deployment: { ...fixture.profile.deployment, agentIds: ["synthetic-agent-b", "synthetic-agent-a"] } });
      const shuffled = structuredClone(profile);
      shuffled.stations.value!.reverse();
      shuffled.useCases.value!.reverse();
      shuffled.deployment.agentIds.reverse();
      expect(shuffled.stations.value).not.toEqual(profile.stations.value);
      expect(shuffled.useCases.value).not.toEqual(profile.useCases.value);
      expect(shuffled.deployment.agentIds).not.toEqual(profile.deployment.agentIds);
      const first = compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF });
      const next = compilePlan({ catalog: fixture.catalog, profile: shuffled, asOf: AS_OF });
      expect(JSON.stringify(next, null, 2)).toBe(JSON.stringify(first, null, 2));
      expect(compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF }).digest).toBe(first.digest);
      const keys = keysOf(first);
      for (const key of ["compiledAt", "generatedAt", "createdAt", "timestamp", "asOf"]) expect(keys).not.toContain(key);
    } finally { fixture.cleanup(); }
  });
});

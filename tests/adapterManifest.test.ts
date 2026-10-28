import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  checkAdapterManifest, loadAdapterManifest, loadAdapterManifests, resolveRecordPath, type AdapterClaimManifest,
} from "../src/adapters/conformance/adapterManifest.js";
import { QUALIFIED_PI_VERSIONS } from "../src/adapters/pi/piVersions.js";
import { QUALIFIED_CLAUDE_CODE_VERSIONS } from "../src/adapters/hookProviders/claudeCode.js";
import { QUALIFIED_DSH_VERSIONS } from "../src/adapters/dsh/dshVersions.js";
import { sha256Hex } from "../src/utils/hash.js";

const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "amc-adapter-manifest-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const committed = (adapter: string) => loadAdapterManifests(root).find((entry) => entry.manifest?.adapter === adapter)!;

function enforceManifest(overrides: Partial<AdapterClaimManifest["hooks"][number]> = {}): AdapterClaimManifest {
  return {
    schema: "amc.adapter-claim-manifest/v1",
    adapter: "pi",
    harness: { package: "example", versions: ["1.0.0"] },
    hooks: [{ name: "tool_call", role: "enforce", tools: ["read"], onFailure: "blocks", source: "docs/x.md",
      cases: [{ id: "denied", path: "runs[version={version}].effect", expect: false }], ...overrides }],
    notCovered: [],
    qualifiedAt: "2026-10-28",
    receipt: "qualification/x/record.json",
  };
}
// A dotted version in a selector, as real harness versions are.
const record = { runs: [{ version: "1.0.0", effect: false }] };

describe("committed adapter claim manifests", () => {
  test("all four harnesses have a manifest and every claim is backed by its qualification record", () => {
    const checked = loadAdapterManifests(root);
    expect(checked.map((entry) => entry.manifest?.adapter).sort()).toEqual(["claude-code", "codex", "dsh", "pi"]);
    expect(checked.flatMap((entry) => entry.problems)).toEqual([]);
  });

  test("each enforce hook names at least one passing case in its receipt", () => {
    for (const { manifest, receiptSha256 } of loadAdapterManifests(root)) {
      for (const hook of manifest!.hooks.filter((item) => item.role === "enforce")) {
        expect(hook.cases.length, `${manifest!.adapter} ${hook.name}`).toBeGreaterThan(0);
        expect(receiptSha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  test("qualified versions equal the versions control accepts (control fails closed on any other)", () => {
    expect(committed("pi").manifest!.harness.versions).toEqual([...QUALIFIED_PI_VERSIONS]);
    expect(committed("claude-code").manifest!.harness.versions).toEqual([...QUALIFIED_CLAUDE_CODE_VERSIONS]);
    expect(committed("dsh").manifest!.harness.versions).toEqual([...QUALIFIED_DSH_VERSIONS]);
  });

  test("Codex and DSH claim no enforcement", () => {
    for (const adapter of ["codex", "dsh"]) {
      expect(committed(adapter).manifest!.hooks.filter((hook) => hook.role === "enforce")).toEqual([]);
    }
  });
});

describe("checkAdapterManifest (negative fixtures)", () => {
  test("a backed enforce hook passes", () => {
    expect(checkAdapterManifest(enforceManifest(), record)).toEqual([]);
  });

  test("enforce with onFailure proceeds fails", () => {
    expect(checkAdapterManifest(enforceManifest({ onFailure: "proceeds" }), record).join()).toMatch(/enforce needs onFailure "blocks"/);
  });

  test("enforce with onFailure unknown fails", () => {
    expect(checkAdapterManifest(enforceManifest({ onFailure: "unknown" }), record).join()).toMatch(/enforce needs onFailure "blocks"/);
  });

  test("enforce without a receipt case fails", () => {
    expect(checkAdapterManifest(enforceManifest({ cases: [] }), record).join()).toMatch(/no conformance case/);
  });

  test("a case the record contradicts fails", () => {
    expect(checkAdapterManifest(enforceManifest(), { runs: [{ version: "1.0.0", effect: true }] }).join()).toMatch(/is true, expected false/);
  });

  test("a version the record does not cover fails", () => {
    const manifest = { ...enforceManifest(), harness: { package: "example", versions: ["1.0.0", "2.0.0"] } };
    expect(checkAdapterManifest(manifest, record).join()).toMatch(/at 2\.0\.0/);
  });

  test("enforce without qualified versions or a receipt fails", () => {
    const manifest = { ...enforceManifest(), harness: { package: "example", versions: [] }, receipt: null };
    expect(checkAdapterManifest(manifest, null).join()).toMatch(/needs qualified versions/);
  });

  test("resolveRecordPath selects array elements by field", () => {
    expect(resolveRecordPath(record, "runs[version=1.0.0].effect")).toBe(false);
    expect(resolveRecordPath(record, "runs[version=9].effect")).toBeUndefined();
  });
});

describe("loadAdapterManifest record integrity", () => {
  function workspace(recordBytes: string, listedSha: string | null): string {
    const dir = mkdtempSync(join(scratch, "ws-"));
    mkdirSync(join(dir, "qualification/x"), { recursive: true });
    mkdirSync(join(dir, "docs/adapters/manifests"), { recursive: true });
    writeFileSync(join(dir, "qualification/x/record.json"), recordBytes);
    writeFileSync(join(dir, "qualification/x/receipt.json"), JSON.stringify({ artifacts: listedSha ? [{ path: "record.json", sha256: listedSha }] : [] }));
    writeFileSync(join(dir, "docs/adapters/manifests/pi.json"), JSON.stringify(enforceManifest()));
    return dir;
  }

  test("a record hashed by its receipt.json passes", () => {
    const bytes = JSON.stringify(record);
    const dir = workspace(bytes, sha256Hex(bytes));
    expect(loadAdapterManifest(dir, "docs/adapters/manifests/pi.json").problems).toEqual([]);
  });

  test("a record edited after its receipt.json was written fails", () => {
    const dir = workspace(JSON.stringify(record), sha256Hex("{}"));
    expect(loadAdapterManifest(dir, "docs/adapters/manifests/pi.json").problems.join()).toMatch(/but qualification\/x\/receipt.json lists/);
  });

  test("a record its receipt.json does not list fails", () => {
    const dir = workspace(JSON.stringify(record), null);
    expect(loadAdapterManifest(dir, "docs/adapters/manifests/pi.json").problems.join()).toMatch(/is not listed/);
  });

  test("an unknown field in a manifest fails the schema", () => {
    const dir = workspace(JSON.stringify(record), sha256Hex(JSON.stringify(record)));
    const file = join(dir, "docs/adapters/manifests/pi.json");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), extra: true }));
    const checked = loadAdapterManifest(dir, "docs/adapters/manifests/pi.json");
    expect(checked.manifest).toBeNull();
    expect(checked.problems.length).toBeGreaterThan(0);
  });
});

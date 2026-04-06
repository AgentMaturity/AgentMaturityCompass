/**
 * AMC-27 — Core utils coverage batch
 * Covers: utils/errors, utils/fs, utils/hash, utils/json, utils/time,
 *         utils/typeGuards, utils/providerKeys, version, mode/mode, cliFormat
 */
import { mkdtempSync, mkdirSync as fsMkdirSync, readFileSync, rmSync, writeFileSync as fsWriteFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// ── utils/errors ──────────────────────────────────────────────────────────────
import { toErrorMessage, validateOption } from "../src/utils/errors.js";

describe("utils/errors", () => {
  test("toErrorMessage extracts message from Error", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });
  test("toErrorMessage returns string as-is", () => {
    expect(toErrorMessage("raw string")).toBe("raw string");
  });
  test("toErrorMessage coerces unknown to string", () => {
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage({ toString: () => "obj" })).toBe("obj");
  });
  test("validateOption returns value when valid", () => {
    const result = validateOption("foo", ["foo", "bar"] as const, "myOption");
    expect(result).toBe("foo");
  });
  test("validateOption throws on invalid value", () => {
    expect(() => validateOption("baz", ["foo", "bar"] as const, "myOption"))
      .toThrow('Invalid myOption: "baz". Must be one of: foo, bar');
  });
});

// ── utils/fs ──────────────────────────────────────────────────────────────────
import { ensureDir, pathExists, readUtf8, writeFileAtomic, writeUtf8 } from "../src/utils/fs.js";

const roots: string[] = [];
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "amc-utils-test-"));
  roots.push(d);
  return d;
}
afterEach(() => {
  while (roots.length) {
    const d = roots.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

describe("utils/fs", () => {
  test("ensureDir creates nested directories", () => {
    const dir = join(tmpDir(), "a", "b", "c");
    ensureDir(dir);
    expect(pathExists(dir)).toBe(true);
  });
  test("pathExists returns false for missing path", () => {
    expect(pathExists(join(tmpDir(), "no-such-file"))).toBe(false);
  });
  test("writeFileAtomic writes and reads back content", () => {
    const dir = tmpDir();
    const file = join(dir, "out.txt");
    writeFileAtomic(file, "hello world", 0o644);
    expect(readFileSync(file, "utf8")).toBe("hello world");
  });
  test("writeFileAtomic creates parent dirs automatically", () => {
    const dir = tmpDir();
    const file = join(dir, "nested", "deep", "file.txt");
    writeFileAtomic(file, "content");
    expect(readFileSync(file, "utf8")).toBe("content");
  });
  test("writeUtf8 and readUtf8 round-trip", () => {
    const dir = tmpDir();
    const file = join(dir, "rw.txt");
    writeUtf8(file, "round-trip");
    expect(readUtf8(file)).toBe("round-trip");
  });
});

// ── utils/hash ────────────────────────────────────────────────────────────────
import { sha256FileHex, sha256Hex } from "../src/utils/hash.js";

describe("utils/hash", () => {
  test("sha256Hex of empty string is known hash", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  test("sha256Hex of buffer and string produce same result", () => {
    const str = "hello";
    const buf = Buffer.from(str, "utf8");
    expect(sha256Hex(str)).toBe(sha256Hex(buf));
  });
  test("sha256FileHex delegates to sha256Hex", () => {
    const buf = Buffer.from("file content");
    expect(sha256FileHex(buf)).toBe(sha256Hex(buf));
  });
  test("different inputs produce different hashes", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
  test("sha256Hex output is 64 lowercase hex chars", () => {
    const h = sha256Hex("test data");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── utils/json ────────────────────────────────────────────────────────────────
import { canonicalize } from "../src/utils/json.js";

describe("utils/json", () => {
  test("canonicalize sorts object keys alphabetically", () => {
    const out = canonicalize({ z: 1, a: 2, m: 3 });
    expect(out).toBe('{"a":2,"m":3,"z":1}');
  });
  test("canonicalize is deterministic regardless of insertion order", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });
  test("canonicalize recurses into nested objects", () => {
    const out = canonicalize({ outer: { z: 1, a: 2 } });
    expect(out).toBe('{"outer":{"a":2,"z":1}}');
  });
  test("canonicalize preserves array order", () => {
    const out = canonicalize([3, 1, 2]);
    expect(out).toBe("[3,1,2]");
  });
  test("canonicalize handles primitives", () => {
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hello")).toBe('"hello"');
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
  });
  test("canonicalize handles arrays of objects", () => {
    const out = canonicalize([{ z: 1, a: 2 }, { m: 3, b: 4 }]);
    expect(out).toBe('[{"a":2,"z":1},{"b":4,"m":3}]');
  });
});

// ── utils/time ────────────────────────────────────────────────────────────────
import { dayKey, parseWindowToMs } from "../src/utils/time.js";

describe("utils/time", () => {
  test("parseWindowToMs parses days", () => {
    expect(parseWindowToMs("14d")).toBe(14 * 24 * 60 * 60 * 1000);
    expect(parseWindowToMs("1d")).toBe(24 * 60 * 60 * 1000);
  });
  test("parseWindowToMs parses hours", () => {
    expect(parseWindowToMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(parseWindowToMs("1h")).toBe(60 * 60 * 1000);
  });
  test("parseWindowToMs parses minutes", () => {
    expect(parseWindowToMs("30m")).toBe(30 * 60 * 1000);
    expect(parseWindowToMs("1m")).toBe(60 * 1000);
  });
  test("parseWindowToMs throws on invalid format", () => {
    expect(() => parseWindowToMs("2w")).toThrow("Invalid window format");
    expect(() => parseWindowToMs("")).toThrow("Invalid window format");
    expect(() => parseWindowToMs("0d")).toThrow();
    expect(() => parseWindowToMs("abc")).toThrow("Invalid window format");
  });
  test("dayKey returns YYYY-MM-DD for known UTC timestamps", () => {
    // 2024-03-15 UTC
    const ts = Date.UTC(2024, 2, 15, 12, 0, 0);
    expect(dayKey(ts)).toBe("2024-03-15");
  });
  test("dayKey zero-pads month and day", () => {
    const ts = Date.UTC(2024, 0, 5); // Jan 5
    expect(dayKey(ts)).toBe("2024-01-05");
  });
});

// ── utils/typeGuards ──────────────────────────────────────────────────────────
import { includes } from "../src/utils/typeGuards.js";

describe("utils/typeGuards", () => {
  test("includes returns true for existing element", () => {
    const arr = ["a", "b", "c"] as const;
    expect(includes(arr, "b")).toBe(true);
  });
  test("includes returns false for missing element", () => {
    const arr = ["a", "b", "c"] as const;
    expect(includes(arr, "d")).toBe(false);
  });
  test("includes works with numbers", () => {
    expect(includes([1, 2, 3] as const, 2)).toBe(true);
    expect(includes([1, 2, 3] as const, 99)).toBe(false);
  });
  test("includes returns false for null/undefined in array of strings", () => {
    const arr = ["x", "y"] as const;
    expect(includes(arr, null)).toBe(false);
    expect(includes(arr, undefined)).toBe(false);
  });
});

// ── utils/providerKeys ───────────────────────────────────────────────────────
import { PROVIDER_KEY_ENV_NAMES, dummyProviderKeyEnv, stripProviderKeys } from "../src/utils/providerKeys.js";

describe("utils/providerKeys", () => {
  test("PROVIDER_KEY_ENV_NAMES includes major providers", () => {
    expect(PROVIDER_KEY_ENV_NAMES).toContain("OPENAI_API_KEY");
    expect(PROVIDER_KEY_ENV_NAMES).toContain("ANTHROPIC_API_KEY");
    expect(PROVIDER_KEY_ENV_NAMES).toContain("GEMINI_API_KEY");
  });
  test("stripProviderKeys removes all known provider keys", () => {
    const env: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: "sk-123",
      ANTHROPIC_API_KEY: "ant-456",
      MY_CUSTOM_VAR: "keep-me",
    };
    const stripped = stripProviderKeys(env);
    expect(stripped["OPENAI_API_KEY"]).toBeUndefined();
    expect(stripped["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(stripped["MY_CUSTOM_VAR"]).toBe("keep-me");
  });
  test("stripProviderKeys does not mutate original env", () => {
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "sk-123" };
    stripProviderKeys(env);
    expect(env["OPENAI_API_KEY"]).toBe("sk-123");
  });
  test("dummyProviderKeyEnv returns amc_dummy for all providers", () => {
    const dummy = dummyProviderKeyEnv();
    for (const key of PROVIDER_KEY_ENV_NAMES) {
      expect(dummy[key]).toBe("amc_dummy");
    }
  });
  test("dummyProviderKeyEnv has same count as PROVIDER_KEY_ENV_NAMES", () => {
    const dummy = dummyProviderKeyEnv();
    expect(Object.keys(dummy).length).toBe(PROVIDER_KEY_ENV_NAMES.length);
  });
});

// ── version ───────────────────────────────────────────────────────────────────
import { amcVersion } from "../src/version.js";

describe("version", () => {
  test("amcVersion is a non-empty string", () => {
    expect(typeof amcVersion).toBe("string");
    expect(amcVersion.length).toBeGreaterThan(0);
  });
  test("amcVersion is a valid semver-like string or 'unknown'", () => {
    expect(amcVersion === "unknown" || /^\d+\.\d+\.\d+/.test(amcVersion)).toBe(true);
  });
});

// ── mode/mode ─────────────────────────────────────────────────────────────────
import { assertOwnerMode, getMode, setMode } from "../src/mode/mode.js";

describe("mode/mode", () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });

  test("getMode returns owner by default (no file)", () => {
    expect(getMode(dir)).toBe("owner");
  });
  test("setMode and getMode round-trip for agent", () => {
    setMode(dir, "agent");
    expect(getMode(dir)).toBe("agent");
  });
  test("setMode and getMode round-trip for owner", () => {
    setMode(dir, "agent");
    setMode(dir, "owner");
    expect(getMode(dir)).toBe("owner");
  });
  test("getMode returns owner if file is corrupt", () => {
    fsMkdirSync(join(dir, ".amc"), { recursive: true });
    fsWriteFileSync(join(dir, ".amc", "mode.json"), "NOT_JSON");
    expect(getMode(dir)).toBe("owner");
  });
  test("assertOwnerMode does not throw in owner mode", () => {
    expect(() => assertOwnerMode(dir, "vault init")).not.toThrow();
  });
  test("assertOwnerMode throws when in agent mode and command is blocked", () => {
    setMode(dir, "agent");
    expect(() => assertOwnerMode(dir, "vault init")).toThrow();
  });
  test("assertOwnerMode allows safe commands in agent mode", () => {
    setMode(dir, "agent");
    expect(() => assertOwnerMode(dir, "score run")).not.toThrow();
  });
});

// ── cliFormat ─────────────────────────────────────────────────────────────────
import { dimRow, header, logo, scoreBox, table } from "../src/cliFormat.js";

describe("cliFormat", () => {
  test("logo() returns non-empty string with brand name", () => {
    const out = logo();
    expect(typeof out).toBe("string");
    expect(out).toContain("Agent Maturity Compass");
  });
  test("header() contains title text", () => {
    const out = header("Test Header", "subtitle here");
    expect(out).toContain("Test Header");
  });
  test("header() without subtitle still returns string", () => {
    const out = header("Minimal Header");
    expect(out).toContain("Minimal Header");
  });
  test("scoreBox() renders percentage", () => {
    const out = scoreBox(4, 5, "Overall", "HIGH TRUST");
    expect(out).toContain("80%");
    expect(out).toContain("Overall");
  });
  test("scoreBox() handles perfect score", () => {
    const out = scoreBox(5, 5, "Perfect");
    expect(out).toContain("100%");
  });
  test("scoreBox() handles zero score", () => {
    const out = scoreBox(0, 5, "Zero");
    expect(out).toContain("0%");
  });
  test("table() renders headers and rows", () => {
    const cols = [
      { header: "Name", width: 10 },
      { header: "Score", width: 8, align: "right" as const },
    ];
    const rows = [["agent-1", "4.2"], ["agent-2", "3.8"]];
    const out = table(cols, rows);
    expect(out).toContain("Name");
    expect(out).toContain("Score");
    expect(out).toContain("agent-1");
    expect(out).toContain("4.2");
  });
  test("dimRow() renders bar for valid score", () => {
    const out = dimRow("Safety", 4.5, 5);
    expect(out).toContain("Safety");
    expect(out).toContain("4.5");
  });
  test("dimRow() with target renders correctly", () => {
    const out = dimRow("Trust", 3.0, 5, 4.0);
    expect(out).toContain("Trust");
  });
  test("dimRow() handles zero score", () => {
    const out = dimRow("Zero", 0, 5);
    expect(out).toContain("Zero");
  });
});

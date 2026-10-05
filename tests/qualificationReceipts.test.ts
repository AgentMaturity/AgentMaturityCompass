import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { validateQualificationDir } from "../scripts/check-qualification-receipts.mjs";

const folder = "2026-10-05-P0-01";
let root: string;

function write(relative: string, body: string | Buffer): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    key: "P0-01",
    date: "2026-10-05",
    commit: "786d8abb2a12b82d0986c3a286864d7966d21166",
    branch: "rtd/p0-01-contract-receipts-freeze",
    node: "v25.5.0",
    pnpm: "10.33.0",
    os: "darwin",
    arch: "arm64",
    commands: [{ cmd: "npm run check:freeze", exit: 0, durationMs: 1200 }],
    tests: { total: 10, passed: 9, failed: 0, skipped: 1 },
    artifacts: [],
    notes: "",
    ...overrides
  };
}

function writeReceipt(body: unknown, name = folder): void {
  write(`${name}/receipt.json`, JSON.stringify(body, null, 2));
  write(`${name}/README.md`, "# Receipt\n\nWhat ran and why.\n");
}

function errorsFor(): string {
  const result = validateQualificationDir(root);
  expect(result.ok).toBe(false);
  return result.errors.join("\n");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "amc-qualification-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("P0-01 qualification receipts", () => {
  test("a valid receipt passes", () => {
    const log = "summarised log\n";
    write(`${folder}/run.log`, log);
    writeReceipt(receipt({ artifacts: [{ path: "run.log", sha256: createHash("sha256").update(log).digest("hex") }] }));
    const result = validateQualificationDir(root);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.receipts).toHaveLength(1);
  });

  test("an empty root passes", () => {
    expect(validateQualificationDir(root)).toEqual({ ok: true, receipts: [], errors: [] });
  });

  test("a missing README fails", () => {
    write(`${folder}/receipt.json`, JSON.stringify(receipt()));
    expect(errorsFor()).toContain("README.md");
  });

  test("a folder key that differs from the receipt key fails", () => {
    writeReceipt(receipt({ key: "P0-02" }));
    expect(errorsFor()).toMatch(/key/);
  });

  test("a folder date that differs from the receipt date fails", () => {
    writeReceipt(receipt({ date: "2026-10-06" }));
    expect(errorsFor()).toMatch(/date/);
  });

  test("a short commit fails", () => {
    writeReceipt(receipt({ commit: "8f57ce63" }));
    expect(errorsFor()).toMatch(/commit/);
  });

  test("an unknown property fails", () => {
    writeReceipt(receipt({ verdict: "certified" }));
    expect(errorsFor()).toMatch(/verdict/);
  });

  test("test totals that do not add up fail", () => {
    writeReceipt(receipt({ tests: { total: 10, passed: 8, failed: 1, skipped: 0 } }));
    expect(errorsFor()).toMatch(/total/);
  });

  test("a non-zero exit with empty notes fails", () => {
    writeReceipt(receipt({ commands: [{ cmd: "npm test", exit: 1, durationMs: 5 }], notes: " " }));
    expect(errorsFor()).toMatch(/notes/);
  });

  test("a file over 1,048,576 bytes fails", () => {
    writeReceipt(receipt());
    write(`${folder}/big.log`, Buffer.alloc(1_048_577, "a"));
    expect(errorsFor()).toContain("1048576");
  });

  test("an artifact whose hash does not match fails", () => {
    write(`${folder}/run.log`, "actual\n");
    writeReceipt(receipt({ artifacts: [{ path: "run.log", sha256: "0".repeat(64) }] }));
    expect(errorsFor()).toMatch(/sha256/);
  });

  test("a file containing a private key fails", () => {
    writeReceipt(receipt());
    // Split so secret scanners do not flag this test source.
    write(`${folder}/notes.txt`, "-----BEGIN " + "PRIVATE KEY-----\nMIIE\n");
    expect(errorsFor()).toMatch(/private key/i);
  });

  test("key and credential file names fail", () => {
    writeReceipt(receipt());
    write(`${folder}/.env.local`, "X=1\n");
    expect(errorsFor()).toContain(".env.local");
  });
});

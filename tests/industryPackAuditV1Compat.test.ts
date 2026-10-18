import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  INDUSTRY_PACK_AUDIT_SCHEMA_VERSION, verifyIndustryPackAuditChecksum, verifyIndustryPackAuditFile, type IndustryPackAudit
} from "../src/domains/industryPackAudit.js";
import { loadTrustContext } from "../src/trust/index.js";

/**
 * P1-42: S4 bumped the audit schema for its currency section, and the version moved on (now /5). A receipt in the
 * released /1 format, built by main's code at 8f57ce63 (clinical-trials, answers cycling 1/3/5, generated
 * 2026-10-03T12:00Z), must still verify: its checksum passes, and verification reads it as unsigned, never trusted.
 */
const FIXTURE = join(process.cwd(), "tests", "fixtures", "industry-pack-audit", "v1-receipt.json");
const v1 = JSON.parse(readFileSync(FIXTURE, "utf8")) as IndustryPackAudit;
const home = mkdtempSync(join(tmpdir(), "amc-audit-v1-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("industry-pack audit /1 receipts (P1-42)", () => {
  test("the fixture is a /1 receipt and the current schema is a later version", () => {
    expect(v1.schemaVersion).toBe("amc.industry-pack-audit/1");
    expect(INDUSTRY_PACK_AUDIT_SCHEMA_VERSION).not.toBe(v1.schemaVersion);
  });

  test("its checksum still verifies, and an edit to its body does not", () => {
    expect(verifyIndustryPackAuditChecksum(v1)).toBe(true);
    expect(verifyIndustryPackAuditChecksum({ ...v1, packName: "Edited" })).toBe(false);
  });

  test("file verification reads it as an unsigned audit with a good checksum, and does not trust it", () => {
    const result = verifyIndustryPackAuditFile({ file: FIXTURE, trust: loadTrustContext({ amcHome: home }) });
    expect(result).not.toBeNull();
    expect(result!.checksumOk).toBe(true);
    expect(result!.signed).toBe(false);
    expect(result!.errors.map((e) => e.code)).toEqual(["UNSIGNED"]);
    expect(result!.ok).toBe(false);
  });
});

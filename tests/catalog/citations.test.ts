import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { validateCitation, type CitationContext } from "../../src/catalog/citations.js";
import { citationSchema, controlRecordSchema } from "../../src/catalog/schema.js";
import type { Citation, SupportLevel } from "../../src/catalog/types.js";
import { getRegisterEntry, REGULATORY_REGISTER } from "../../src/compliance/regulatory/index.js";

const asOf = "2026-10-15";

function citation(): Citation {
  const path = fileURLToPath(new URL("../../catalog/layers/l0-baseline/controls/L0-IDN-01.yaml", import.meta.url));
  return controlRecordSchema.parse(YAML.parse(readFileSync(path, "utf8")) as unknown).citations[0]!;
}

function context(support: SupportLevel = "experimental", publisherHosts: string[] = []): CitationContext {
  return { file: "fixture.yaml", controlId: "L0-IDN-01", support, path: "citations.0", asOf, publisherHosts };
}

describe("catalog citation rules", () => {
  it("retains the experimental example and its explicit missing-register warning", () => {
    const input = citation();
    expect(input.registerId).toBeNull();
    expect(input.legalReview).toBeNull();
    expect(validateCitation(input, context())).toEqual([
      expect.objectContaining({ code: "CAT_NO_REGISTER_ENTRY", severity: "warning", path: "citations.0.registerId" })
    ]);
  });

  it.each(["http://www.govinfo.gov/fixture", "https://unlisted.example.test/fixture", "https://www.govinfo.gov.attacker.example/fixture"])(
    "refuses a non-official or non-HTTPS URL: %s", (url) => {
      expect(validateCitation({ ...citation(), url }, context())).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "CAT_CITATION_HOST", severity: "error", path: "citations.0.url" })
      ]));
    }
  );

  it("allows a configured publisher host only for a voluntary-standard citation", () => {
    const input = { ...citation(), url: "https://standards.example.test/fixture", statusType: "voluntary-standard" as const };
    expect(validateCitation(input, context("experimental", ["standards.example.test"])).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(validateCitation({ ...input, statusType: "binding-now" }, context("experimental", ["standards.example.test"])).map((issue) => issue.code)).toContain("CAT_CITATION_HOST");
  });

  it("refuses a binding-now claim for the current voluntary SR 26-2 register entry", () => {
    expect(getRegisterEntry("us-sr-26-2")?.bindingForce).toBe("voluntary");
    const input = { ...citation(), registerId: "us-sr-26-2", statusType: "binding-now" as const };
    expect(validateCitation(input, context())).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_CITATION_STATUS_MISMATCH", path: "citations.0.statusType" })
    ]));
    expect(validateCitation({ ...input, statusType: "supervisory-guidance" }, context())).toEqual([]);
  });

  it.each([
    ["binding-now", "eu-gdpr", "in-force", "binding"],
    ["binding-now", "eu-ai-act", "partially-applicable", "binding"],
    ["binding-future", "us-co-sb26-189", "enacted-not-yet-applicable", "binding"],
    ["draft", "eu-psr-psd3", "proposed", "binding"],
    ["voluntary-standard", "us-nist-ai-rmf", "in-force", "voluntary"]
  ] as const)("requires %s to agree with register entry %s", (statusType, registerId, status, bindingForce) => {
    expect(getRegisterEntry(registerId)).toMatchObject({ status, bindingForce });
    const input: Citation = { ...citation(), registerId, statusType, instrument: "Synthetic citation-status fixture", clause: "test-clause" };
    expect(validateCitation(input, context())).toEqual([]);
    expect(validateCitation({ ...input, statusType: statusType === "draft" ? "binding-future" : "draft" }, context())
      .map((issue) => issue.code)).toContain("CAT_CITATION_STATUS_MISMATCH");
  });

  it("accepts binding-future for a future clause of a partially-applicable binding instrument (P2-30 ADMT)", () => {
    expect(getRegisterEntry("us-ca-cppa-admt")).toMatchObject({ status: "partially-applicable", bindingForce: "binding" });
    const input: Citation = { ...citation(), registerId: "us-ca-cppa-admt", statusType: "binding-future", instrument: "Synthetic future-clause fixture",
      clause: "11 CCR §7220", effectiveDate: "2026-01-01", complianceDueDate: "2027-01-01" };
    expect(validateCitation(input, context())).toEqual([]);
    // A due date at or before asOf, or none, is not a future clause: the instrument's own status decides.
    expect(validateCitation({ ...input, complianceDueDate: null }, context()).map((i) => i.code)).toContain("CAT_CITATION_STATUS_MISMATCH");
    expect(validateCitation({ ...input, complianceDueDate: asOf }, context()).map((i) => i.code)).toContain("CAT_CITATION_STATUS_MISMATCH");
  });

  it("refuses an unknown register ID", () => {
    expect(validateCitation({ ...citation(), registerId: "qualification-unknown-register" }, context()).map((issue) => issue.code)).toContain("CAT_CITATION_REGISTER");
  });

  it("refuses a live citation to a register entry marked superseded", () => {
    expect(getRegisterEntry("us-co-sb24-205")?.status).toBe("superseded");
    const input = { ...citation(), registerId: "us-co-sb24-205", instrument: "historical test instrument", clause: "test-clause" };
    expect(validateCitation(input, context())).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_CITATION_SUPERSEDED", path: "citations.0.registerId" })
    ]));
  });

  it("also applies the shared superseded-instrument denylist without a register ID", () => {
    expect(validateCitation({ ...citation(), instrument: "SR 11-7", registerId: null }, context())).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_CITATION_SUPERSEDED", path: "citations.0.instrument" })
    ]));
  });

  it("requires current contentSha256 and a full 64-character verified-retrieval hash", () => {
    const input = citation();
    expect(citationSchema.safeParse({ ...input, retrieval: { state: "verified", retrievedAt: asOf, contentSha256: "0".repeat(64) } }).success).toBe(true);
    expect(citationSchema.safeParse({ ...input, retrieval: { state: "verified", retrievedAt: asOf, contentSha256: "0".repeat(63) } }).success).toBe(false);
    expect(citationSchema.safeParse({ ...input, retrieval: { state: "verified", retrievedAt: asOf, sha256: "0".repeat(64) } }).success).toBe(false);
  });

  it("refuses a verified retrieval in the future relative to the explicit asOf", () => {
    const input: Citation = { ...citation(), retrieval: { state: "verified", retrievedAt: "2026-10-16", contentSha256: "0".repeat(64) } };
    expect(validateCitation(input, context())).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_CITATION_RETRIEVAL", path: "citations.0.retrieval.retrievedAt", severity: "error" })
    ]));
  });

  it("uses the current review window with warning and error severities", () => {
    const date = new Date(Date.parse(asOf) - (REGULATORY_REGISTER.policy.reviewWindowDays + 1) * 86_400_000).toISOString().slice(0, 10);
    const input: Citation = { ...citation(), retrieval: { state: "verified", retrievedAt: date, contentSha256: "0".repeat(64) } };
    expect(validateCitation(input, context())).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_CITATION_STALE", severity: "warning" })
    ]));
    expect(validateCitation(input, context("reviewed"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_CITATION_STALE", severity: "error" })
    ]));
  });

  it("does not let reviewed content use the experimental missing-register allowance", () => {
    expect(validateCitation(citation(), context("reviewed"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_NO_REGISTER_ENTRY", severity: "error" })
    ]));
  });

  it("requires dateNote when an effective or compliance date is unknown", () => {
    const input = citation();
    expect(input.effectiveDate).toBeNull();
    expect(citationSchema.safeParse({ ...input, dateNote: null }).success).toBe(false);
    expect(citationSchema.safeParse({ ...input, dateNote: "Synthetic fixture: date not established." }).success).toBe(true);
  });

  it("does not accept the obsolete underscore status spelling", () => {
    expect(citationSchema.safeParse({ ...citation(), statusType: "binding_now" }).success).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { scanForPII } from "../src/vault/dlp.js";

describe("DLP scanner", () => {
  test("detects EU-relevant personal and financial identifiers", () => {
    const result = scanForPII(
      [
        "Contact jane@example.eu from 198.51.100.42 or 2001:0db8:85a3:0000:0000:8a2e:0370:7334.",
        "IBAN GB82 WEST 1234 5698 7654 32 and VAT DE123456789 are in the file.",
        "DNI 12345678Z, passport number C01X00T99, and NHS number 943 476 5919 need review."
      ].join(" ")
    );

    expect(result.found).toBe(true);
    expect(result.types).toEqual(
      expect.arrayContaining([
        "email",
        "ip_address",
        "iban",
        "eu_vat",
        "eu_national_id",
        "passport_number",
        "health_record_id"
      ])
    );
    expect(result.redacted).toContain("[IBAN_REDACTED]");
    expect(result.redacted).toContain("[IP_ADDRESS_REDACTED]");
    expect(result.redacted).toContain("[EU_VAT_REDACTED]");
    expect(result.redacted).not.toContain("GB82 WEST 1234 5698 7654 32");
    expect(result.redacted).not.toContain("jane@example.eu");
  });

  test("does not flag invalid IBAN-shaped strings", () => {
    const result = scanForPII("Reference GB00 WEST 1234 5698 7654 32 should not be treated as an IBAN.");
    expect(result.types).not.toContain("iban");
    expect(result.redacted).toContain("GB00 WEST 1234 5698 7654 32");
  });
});

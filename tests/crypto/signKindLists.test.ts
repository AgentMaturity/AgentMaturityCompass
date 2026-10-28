/**
 * P2-35 (design §4.5, §18): the signer's kind list and the trust config's kind list are two literal arrays that must be
 * edited together. A kind the signer can produce but the trust schema cannot name (or the reverse) is refused silently
 * by `allowedSignKinds`/`requireNotaryFor` parsing, so the lists are pinned equal, order included.
 */
import { describe, expect, test } from "vitest";
import { SIGN_KINDS } from "../../src/crypto/signing/signerTypes.js";
import { signKindValues } from "../../src/trust/trustConfig.js";

describe("sign-kind lists (P2-35)", () => {
  test("SIGN_KINDS equals signKindValues, element for element", () => {
    expect([...SIGN_KINDS]).toEqual([...signKindValues]);
  });

  test("the A4 kinds are in both lists", () => {
    for (const kind of ["A4_RECORD", "A4_PACKAGE"] as const) {
      expect(SIGN_KINDS).toContain(kind);
      expect(signKindValues).toContain(kind);
    }
  });
});

import { describe, expect, test } from "vitest";
import { DEMO_SETUP_SUMMARY } from "../src/setup/quickSetupCli.js";

// CLI-14: `amc setup --demo` said it wrote "sample evidence" that nothing scores, and printed a raw \e[32m without a terminal.
describe("amc setup --demo summary", () => {
  test("does not call the placeholder note evidence, says the score stays L0, and holds no raw colour codes", () => {
    const text = DEMO_SETUP_SUMMARY.join("\n");
    expect(text).not.toContain("sample evidence");
    expect(text).toContain("not evidence");
    expect(text).toContain("stays L0");
    expect(text).not.toContain("\x1b[");
  });
});

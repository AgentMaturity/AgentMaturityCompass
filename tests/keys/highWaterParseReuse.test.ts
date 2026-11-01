import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkHighWater, highWaterPath, readHighWater, recordHighWater } from "../../src/keys/highWater.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

// GAP studiostop: Studio's SIGTERM handler starved because every signature check re-parsed the whole machine
// high-water file (3 MB, ~56 ms a parse on a developer machine). The parse is reused only for byte-identical files.
describe("high-water parse reuse", () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "amc-high-water-reuse-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it("reuses the parsed marks while the file's bytes are unchanged, and hands out frozen entries", () => {
    recordHighWater("trust-list:org", 7, SHA_A, { amcHome: home });
    const first = readHighWater("trust-list:org", { amcHome: home });
    expect(readHighWater("trust-list:org", { amcHome: home })).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("re-reads the marks after any byte of the file changes, so a cached parse never hides a write or a tamper", () => {
    recordHighWater("trust-list:org", 7, SHA_A, { amcHome: home });
    expect(readHighWater("trust-list:org", { amcHome: home })?.sha256).toBe(SHA_A);
    recordHighWater("trust-list:other", 1, SHA_A, { amcHome: home });
    expect(readHighWater("trust-list:other", { amcHome: home })?.sequence).toBe(1);

    // Same length, one mark's bytes swapped in place: the new bytes decide, not the earlier parse.
    const path = highWaterPath({ amcHome: home });
    writeFileSync(path, readFileSync(path, "utf8").replace(`"sequence":7,"sha256":"${SHA_A}"`, `"sequence":7,"sha256":"${SHA_B}"`));
    expect(readHighWater("trust-list:org", { amcHome: home })?.sha256).toBe(SHA_B);
    expect(() => checkHighWater("trust-list:org", 7, SHA_A, { amcHome: home })).toThrow(/FORK_DETECTED/);

    writeFileSync(path, readFileSync(path, "utf8").replace("amc.high-water", "amc.high-wates"));
    expect(() => readHighWater("trust-list:org", { amcHome: home })).toThrow(/not a valid amc.high-water file/);
  });
});

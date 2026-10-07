import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * P0-11: the channel map in docs/security/channel-map.json is normative, so
 * every enforcement point it cites must exist as a file and a symbol, every
 * owner must be a plan key, and every failure row must name a test or an owner.
 */
const SCRIPT = resolve("scripts/check-threat-model.mjs");
const FIXTURES = "tests/fixtures/threat-model";
const MAP = "docs/security/channel-map.json";

function check(path?: string) {
  const result = spawnSync(process.execPath, [SCRIPT, ...(path ? [path] : [])], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("check-threat-model", () => {
  test("a valid map passes", () => {
    const { status, output } = check(`${FIXTURES}/valid.json`);
    expect(output).toContain("ok");
    expect(status).toBe(0);
  });

  test("a cited path that does not exist fails and names the entry", () => {
    const { status, output } = check(`${FIXTURES}/missing-path.json`);
    expect(status).toBe(1);
    expect(output).toContain("channel network-egress");
    expect(output).toContain("src/tools/noSuchFile.ts does not exist");
  });

  test("a symbol absent from its file fails", () => {
    const { status, output } = check(`${FIXTURES}/missing-symbol.json`);
    expect(status).toBe(1);
    expect(output).toContain("channel network-egress");
    expect(output).toContain("hostAllowedX does not occur in src/gateway/server.ts");
  });

  test("an owner that is not a plan key fails", () => {
    const { status, output } = check(`${FIXTURES}/bad-owner.json`);
    expect(status).toBe(1);
    expect(output).toContain("channel network-egress");
    expect(output).toContain("P9-99");
  });

  test("a failure row with no test and no owner fails", () => {
    const { status, output } = check(`${FIXTURES}/orphan-failure-row.json`);
    expect(status).toBe(1);
    expect(output).toContain("failure recorder-fails-after-effect");
    expect(output).toContain("names no test and no owner");
  });

  test("the real channel map passes with 15 channels and 8 failure rows", () => {
    const { status, output } = check();
    expect(output).toContain("ok");
    expect(status).toBe(0);
    const map = JSON.parse(readFileSync(MAP, "utf8")) as { channels: unknown[]; failurePolicy: unknown[] };
    expect(map.channels).toHaveLength(15);
    expect(map.failurePolicy).toHaveLength(8);
  });

  test("the threat model document names every channel, failure row and ASI id in the map", () => {
    const doc = readFileSync("docs/security/THREAT_MODEL.md", "utf8");
    const map = JSON.parse(readFileSync(MAP, "utf8")) as {
      channels: Array<{ id: string; name: string }>; failurePolicy: Array<{ id: string }>;
    };
    for (const channel of map.channels) {
      expect(doc, channel.id).toContain(`\`${channel.id}\``);
      expect(doc, channel.name).toContain(`### ${channel.name}`);
    }
    for (const row of map.failurePolicy) expect(doc, row.id).toContain(`\`${row.id}\``);
    for (let n = 1; n <= 10; n += 1) expect(doc).toContain(`ASI${String(n).padStart(2, "0")}`);
  });
});

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { captureAll, cases, commandPaths } from "../scripts/cli-output-capture.mjs";

// dist/amc.js (the `amc` bin) only speeds start-up: every byte it prints, and every exit code, must equal dist/cli.js.
// A full walk of every command's help: node scripts/cli-output-capture.mjs capture <entry> <dir>, then compare.
const cli = resolve(process.cwd(), "dist/cli.js");
const amc = resolve(process.cwd(), "dist/amc.js");

describe("the amc bin entry prints exactly what dist/cli.js prints", () => {
  test("version, help, bare amc without a terminal, and a sample of every command's help", async () => {
    expect(existsSync(cli) && existsSync(amc), "build first: npm run build").toBe(true);
    const list = cases(commandPaths(cli), 60);
    expect(list.length).toBeGreaterThan(20);
    const before = await captureAll(cli, list);
    const after = await captureAll(amc, list);
    expect(after).toEqual(before);
    expect(before[0]).toMatch(/^args: \["--version"\] stdin: empty\nexit: 0\n--- stdout\n\d+\.\d+\.\d+\n\n--- stderr\n$/);
  }, 600_000);
});

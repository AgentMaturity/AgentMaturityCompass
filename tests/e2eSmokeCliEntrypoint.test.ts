import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { smokeCliEntrypoint } from "../src/e2e/smokeSteps.js";

describe("amc e2e smoke finds the CLI it runs from (run `npm run build` first)", () => {
  test("outside the repository root, it resolves the running package's dist/cli.js, not one under the cwd", () => {
    const cli = smokeCliEntrypoint("/nonexistent-repo-root");
    expect(cli).toBe(join(resolve("."), "dist", "cli.js"));
    expect(existsSync(cli)).toBe(true);
  });
});

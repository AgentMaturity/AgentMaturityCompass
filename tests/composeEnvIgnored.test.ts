import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("compose operator settings stay out of git (LIVE-DEPLOY-01)", () => {
  it("ignores deploy/compose/.env, which holds the operator's image pin, origins and publish address", () => {
    expect(readFileSync(".gitignore", "utf8").split("\n")).toContain("deploy/compose/.env");
  });
});

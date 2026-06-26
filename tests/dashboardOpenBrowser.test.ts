import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function runCli(args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8"
  });
}

describe("dashboard open browser launch", () => {
  test("advertises a headless escape hatch", () => {
    const help = runCli(["dashboard", "open", "--help"]);

    expect(help.status, `${help.stdout}\n${help.stderr}`).toBe(0);
    expect(help.stdout).toContain("--no-open");
    expect(help.stdout).toContain("do not automatically open the browser");
  });

  test("uses argument-based browser launch instead of shell interpolation", () => {
    const cli = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");

    expect(cli).toContain("function openExternalUrl(url: string): boolean");
    expect(cli).toContain("spawn(command, args");
    expect(cli).toContain("opts.open !== false");
    expect(cli).not.toContain("execChild(`${openCmd} ${handle.url}`)");
  });

  test("keeps the UX audit aligned with current browser launch behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R5 — dashboard open launches the browser by default");
    expect(audit).toContain("`amc dashboard open --no-open` keeps headless/CI runs deterministic");
    expect(audit).not.toContain("`amc dashboard open` doesn't open the browser");
    expect(audit).not.toContain("doesn't open a browser");
  });
});

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseInput } from "../src/repl/replParser.js";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
}

describe("evidence command references", () => {
  test("score no-evidence output points users to existing evidence commands", () => {
    const result = runCli(["score", "--tier", "quick"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("amc evidence collect");
    expect(result.stdout).toContain("amc ingest <fileOrDir> --type generic_json --agent <agentId>");
    expect(result.stdout).not.toContain("amc evidence ingest");
    expect(result.stdout).not.toContain("--source <logfile>");
  });

  test("repl import phrases route to the guided collection wizard", () => {
    expect(parseInput("ingest").command).toBe("evidence collect");
    expect(parseInput("evidence ingest").command).toBe("evidence collect");
    expect(parseInput("import evidence").command).toBe("evidence collect");
  });

  test("code surfaces do not advertise the missing evidence ingest subcommand", () => {
    const cli = readProjectFile("src/cli.ts");
    const repl = readProjectFile("src/repl/replParser.ts");
    const dashboard = readProjectFile("src/dashboard/templates/app.js");

    expect(cli).not.toContain("amc evidence ingest");
    expect(cli).not.toContain("amc ingest import --source");
    expect(repl).not.toContain('command: "evidence ingest"');
    expect(dashboard).not.toContain("amc evidence ingest");
    expect(dashboard).toContain("amc evidence collect");
    expect(dashboard).toContain("amc ingest <fileOrDir> --type generic_json --agent <agentId>");
  });

  test("docs describe the current top-level ingest contract", () => {
    const chainArchitecture = readProjectFile("docs/CHAIN_ARCHITECTURE.md");
    const evidenceChain = readProjectFile("docs/EVIDENCE_CHAIN.md");
    const uxAudit = readProjectFile("docs/UX_AUDIT_REPORT.md");

    expect(chainArchitecture).toContain("amc ingest ./external-agent-logs/ --type generic_json --agent imported-agent");
    expect(chainArchitecture).not.toContain("amc ingest --source");
    expect(evidenceChain).toContain("amc ingest ./external-logs/ --type generic_json --agent imported-agent");
    expect(evidenceChain).not.toContain("amc ingest --source");

    expect(uxAudit).toContain("R1 — invalid evidence ingest references resolved");
    expect(uxAudit).toContain("F26 — invalid `amc ingest` reference resolved");
    expect(uxAudit).not.toContain("`evidence ingest` command doesn't exist");
    expect(uxAudit).not.toContain("`amc ingest <logfile>` doesn't exist");
  });
});

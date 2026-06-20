import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { classifyEuAiActRisk } from "../src/compliance/euAiActClassifier.js";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("comply risk-classify command surface", () => {
  test("source exposes risk-classify under compliance with the comply alias", () => {
    const cli = readProjectFile("src/cli.ts");

    expect(cli).toContain('program.command("compliance").alias("comply")');
    expect(cli).toContain('.command("risk-classify")');
    expect(cli).toContain('description("Classify agent into EU AI Act risk tiers');
  });

  test("docs expose the compliance command and comply alias", () => {
    const inventory = readProjectFile("docs/CLI_COMMAND_INVENTORY.md");
    const apiReference = readProjectFile("docs/API_REFERENCE.md");
    const complianceDocs = readProjectFile("docs/COMPLIANCE.md");
    const euAiActDocs = readProjectFile("docs/EU_AI_ACT_COMPLIANCE.md");

    expect(inventory).toContain("| `amc compliance risk-classify` |");
    expect(inventory).toContain("`comply risk-classify`");
    expect(apiReference).toContain("#### `amc compliance risk-classify`");
    expect(apiReference).toContain("Alias: `amc comply risk-classify`");
    expect(complianceDocs).toContain("amc comply risk-classify --employment --json");
    expect(euAiActDocs).toContain("amc comply risk-classify");
  });

  test("employment capability maps to EU AI Act high-risk classification", () => {
    const result = classifyEuAiActRisk({ employment: true });

    expect(result.riskTier).toBe("HIGH");
    expect(result.articles).toContain("Art. 6(2) + Annex III(4)");
    expect(result.remediation.map((item) => item.article)).toContain("Art. 9");
    expect(result.summary).toContain("HIGH RISK");
  });

  test("active Batch 5 audit no longer says the command is missing", () => {
    const audit = readProjectFile("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(audit).toContain("`amc comply risk-classify` is resolved");
    expect(audit).toContain("The compiled CLI exposes `amc compliance risk-classify`");
    expect(audit).not.toContain("`amc comply risk-classify` — DOES NOT EXIST");
    expect(audit).not.toContain("No risk-classify subcommand");
  });
});

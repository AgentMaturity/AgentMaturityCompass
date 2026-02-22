import { describe, expect, test, vi } from "vitest";
import { analyzeSourceForAmcVscode, createVscodeExtensionScaffold } from "../src/vscode/extensionScaffold.js";
import { scanCodeForAmcPatterns } from "../src/vscode/patternScanner.js";
import { suggestQuickFixes } from "../src/vscode/quickFixes.js";

describe("vscode scaffold pattern scanning", () => {
  test("detects hardcoded secret and fetch without timeout", () => {
    const source = [
      "const apiKey = \"sk-live-1234567890ABCDE\";",
      "const out = await fetch(url);"
    ].join("\n");

    const matches = scanCodeForAmcPatterns(source);
    const ids = matches.map((match) => match.ruleId);
    expect(ids).toContain("hardcoded-secret");
    expect(ids).toContain("fetch-without-timeout");
  });

  test("maps findings to quick-fix suggestions without duplicates", () => {
    const matches = scanCodeForAmcPatterns([
      "const apiKey = \"sk-live-1234567890ABCDE\";",
      "const another = \"sk-live-ABCDE1234567890\";"
    ].join("\n"));
    const fixes = suggestQuickFixes(matches);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.id).toBe("move-secret-to-env");
  });
});

describe("vscode scaffold analysis", () => {
  test("returns inline annotations and score impacts", () => {
    const analysis = analyzeSourceForAmcVscode("const result = JSON.parse(raw);");
    expect(analysis.matches.length).toBeGreaterThan(0);
    expect(analysis.inlineScoreAnnotations.length).toBeGreaterThan(0);
    expect(analysis.questionScores["AMC-5.1"]).toBeLessThan(3);
  });

  test("publishes analysis through onDocumentChanged hooks", () => {
    const scaffold = createVscodeExtensionScaffold();
    const publishPatternMatches = vi.fn();
    const publishInlineScoreAnnotations = vi.fn();
    const publishQuickFixes = vi.fn();

    const analysis = scaffold.onDocumentChanged(
      "const out = await fetch(url);",
      {
        publishPatternMatches,
        publishInlineScoreAnnotations,
        publishQuickFixes
      }
    );

    expect(publishPatternMatches).toHaveBeenCalledTimes(1);
    expect(publishInlineScoreAnnotations).toHaveBeenCalledTimes(1);
    expect(publishQuickFixes).toHaveBeenCalledTimes(1);
    expect(analysis.matches[0]?.ruleId).toBe("fetch-without-timeout");
  });
});


/**
 * AMC Linter — validates agent configuration files for schema compliance,
 * anti-patterns, and best practices.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import YAML from "yaml";
import { runLintRules, listLintRules, type LintDiagnostic, type LintRuleContext, type LintSeverity } from "./rules.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LintResult {
  files: string[];
  diagnostics: readonly LintDiagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  fixedCount: number;
}

export interface LintOptions {
  workspace: string;
  files?: string[];
  fix?: boolean;
  rules?: string[];
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function discoverConfigFiles(workspace: string): string[] {
  const files: string[] = [];
  const amcDir = join(workspace, ".amc");

  if (existsSync(amcDir)) {
    try {
      const entries = readdirSync(amcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))) {
          files.push(join(amcDir, entry.name));
        }
        if (entry.isDirectory() && entry.name === "agents") {
          const agentDir = join(amcDir, "agents");
          try {
            const agentEntries = readdirSync(agentDir, { withFileTypes: true });
            for (const agentEntry of agentEntries) {
              if (agentEntry.isDirectory()) {
                const configFile = join(agentDir, agentEntry.name, "agent.yml");
                if (existsSync(configFile)) {
                  files.push(configFile);
                }
                const configFileYaml = join(agentDir, agentEntry.name, "agent.yaml");
                if (existsSync(configFileYaml)) {
                  files.push(configFileYaml);
                }
              }
            }
          } catch {
            // ignore read errors
          }
        }
      }
    } catch {
      // ignore read errors on .amc dir
    }
  }

  // Check root-level agent.yml
  const rootAgentYml = join(workspace, "agent.yml");
  if (existsSync(rootAgentYml)) {
    files.push(rootAgentYml);
  }
  const rootAgentYaml = join(workspace, "agent.yaml");
  if (existsSync(rootAgentYaml)) {
    files.push(rootAgentYaml);
  }

  return files;
}

// ---------------------------------------------------------------------------
// Parse a single config file
// ---------------------------------------------------------------------------

function parseConfigFile(filePath: string): { content: string; lines: string[]; parsed: Record<string, unknown> } {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  let parsed: Record<string, unknown> = {};
  try {
    const result = YAML.parse(content) as unknown;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      parsed = result as Record<string, unknown>;
    }
  } catch {
    // YAML parse error — rules will catch structural issues
  }
  return { content, lines, parsed };
}

// ---------------------------------------------------------------------------
// Apply fixes
// ---------------------------------------------------------------------------

function applyFixes(diagnostics: readonly LintDiagnostic[]): number {
  let fixedCount = 0;
  const fixesByFile = new Map<string, LintDiagnostic[]>();

  for (const d of diagnostics) {
    if (d.fix && d.fix.replacements.length > 0) {
      const existing = fixesByFile.get(d.file) ?? [];
      existing.push(d);
      fixesByFile.set(d.file, existing);
    }
  }

  for (const [file, fileDiags] of fixesByFile) {
    try {
      let content = readFileSync(file, "utf8");
      // Apply replacements in reverse offset order to preserve positions
      const allReplacements = fileDiags
        .flatMap((d) => d.fix!.replacements)
        .filter((r) => r.file === file)
        .sort((a, b) => b.offset - a.offset);

      for (const rep of allReplacements) {
        content = content.slice(0, rep.offset) + rep.text + content.slice(rep.offset + rep.length);
        fixedCount++;
      }
      writeFileSync(file, content, "utf8");
    } catch {
      // skip files we can't write
    }
  }
  return fixedCount;
}

// ---------------------------------------------------------------------------
// Main lint function
// ---------------------------------------------------------------------------

export function lintConfigs(opts: LintOptions): LintResult {
  const workspace = resolve(opts.workspace);
  const files = opts.files ?? discoverConfigFiles(workspace);
  const allDiagnostics: LintDiagnostic[] = [];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const { content, lines, parsed } = parseConfigFile(file);
    const ctx: LintRuleContext = {
      file: relative(workspace, file),
      content,
      lines,
      parsed,
    };
    const diagnostics = runLintRules(ctx, opts.rules);
    allDiagnostics.push(...diagnostics);
  }

  let fixedCount = 0;
  if (opts.fix) {
    // Resolve back to absolute paths for fixing
    const absoluteDiags = allDiagnostics.map((d) => ({
      ...d,
      file: resolve(workspace, d.file),
      fix: d.fix ? {
        ...d.fix,
        replacements: d.fix.replacements.map((r) => ({
          ...r,
          file: resolve(workspace, r.file),
        })),
      } : undefined,
    }));
    fixedCount = applyFixes(absoluteDiags);
  }

  return {
    files: files.map((f) => relative(workspace, f)),
    diagnostics: allDiagnostics,
    errorCount: allDiagnostics.filter((d) => d.severity === "error").length,
    warningCount: allDiagnostics.filter((d) => d.severity === "warning").length,
    infoCount: allDiagnostics.filter((d) => d.severity === "info").length,
    fixedCount,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatLintText(result: LintResult): string {
  const lines: string[] = [];
  for (const d of result.diagnostics) {
    const icon = d.severity === "error" ? "✗" : d.severity === "warning" ? "⚠" : "ℹ";
    lines.push(`${icon} ${d.file}:${d.line}:${d.column} ${d.message} (${d.ruleId})`);
  }
  lines.push("");
  lines.push(`${result.errorCount} error(s), ${result.warningCount} warning(s), ${result.infoCount} info(s)`);
  if (result.fixedCount > 0) {
    lines.push(`${result.fixedCount} issue(s) auto-fixed`);
  }
  return lines.join("\n");
}

export interface SarifResult {
  $schema: string;
  version: string;
  runs: Array<{
    tool: { driver: { name: string; version: string; rules: Array<{ id: string; shortDescription: { text: string } }> } };
    results: Array<{
      ruleId: string;
      level: string;
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number; startColumn: number };
        };
      }>;
    }>;
  }>;
}

export function formatLintSarif(result: LintResult): SarifResult {
  const rules = listLintRules();
  const severityToLevel = (s: LintSeverity): string => {
    if (s === "error") return "error";
    if (s === "warning") return "warning";
    return "note";
  };

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "amc-lint",
          version: "1.0.0",
          rules: rules.map((r) => ({
            id: r.id,
            shortDescription: { text: r.description },
          })),
        },
      },
      results: result.diagnostics.map((d) => ({
        ruleId: d.ruleId,
        level: severityToLevel(d.severity),
        message: { text: d.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: d.file },
            region: { startLine: d.line, startColumn: d.column },
          },
        }],
      })),
    }],
  };
}

export function formatLintJson(result: LintResult): string {
  return JSON.stringify({
    files: result.files,
    diagnostics: result.diagnostics,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    infoCount: result.infoCount,
    fixedCount: result.fixedCount,
  }, null, 2);
}

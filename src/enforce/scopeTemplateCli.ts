import type { Command } from "commander";
import {
  applyScopeTemplate,
  compileScopeTemplate,
  isScopeTemplateError,
  listScopeTemplates,
  type ScopeTemplateApplyResult,
  type ScopeTemplateCompilation,
} from "./scopeTemplates.js";

function renderCompilation(compilation: ScopeTemplateCompilation): string {
  const lines = [
    "AMC Policy Scope Preview",
    `Template: ${compilation.template.templateId} v${compilation.template.version} (${compilation.template.label})`,
    `Policy Pack: ${compilation.pack.packId}`,
    `Scope: WORKSPACE / FLEET-WIDE`,
    `Compile ID: ${compilation.compileId}`,
    `Status: ${compilation.status === "no_changes" ? "NO CHANGES" : "READY FOR EXACT CONFIRMATION"}`,
    "Changes:",
  ];
  for (const change of compilation.changes) {
    lines.push(
      `- ${change.actionClass}: action=${change.actionPolicy.changed ? "CHANGE" : "UNCHANGED"}, approval=${change.approvalPolicy.changed ? "CHANGE" : "UNCHANGED"}`,
    );
  }
  lines.push(`Boundary: ${compilation.fleetBoundary}`);
  return `${lines.join("\n")}\n`;
}

function renderApply(result: ScopeTemplateApplyResult): string {
  if (!result.applied) {
    return `${renderCompilation(result.compilation)}Result: NO CHANGES; no policy or evidence was written.\n`;
  }
  return [
    "AMC Policy Scope Applied",
    `Compile ID: ${result.compileId}`,
    `Template: ${result.compilation.template.templateId}`,
    `Policy Pack: ${result.compilation.pack.packId}`,
    `Action classes: ${result.compilation.template.actionClasses.join(", ")}`,
    `Transparency hash: ${result.transparencyHash}`,
    `Audit event: ${result.auditEventId}`,
    `Boundary: ${result.compilation.fleetBoundary}`,
    "",
  ].join("\n");
}

function fail(error: unknown, json: boolean): void {
  const code = isScopeTemplateError(error) ? error.code : "APPLY_FAILED";
  const message = isScopeTemplateError(error) ? error.message : "Scope template operation failed.";
  if (json) console.error(JSON.stringify({ ok: false, error: { code, message } }));
  else console.error(`Scope template blocked [${code}]: ${message}`);
  process.exitCode = 2;
}

export function registerScopeTemplateCommands(policy: Command): void {
  const scope = policy
    .command("scope")
    .description("Compile reusable action-class scopes into existing signed policies");

  scope
    .command("list")
    .description("List immutable AMC action-class scope templates")
    .option("--json", "Output as JSON")
    .action((options: { json?: boolean }) => {
      const templates = listScopeTemplates();
      if (options.json) {
        console.log(JSON.stringify({ templates }, null, 2));
        return;
      }
      console.log("AMC Policy Scope Templates");
      for (const template of templates) {
        console.log(`- ${template.templateId}: ${template.label} [${template.actionClasses.join(", ")}]`);
      }
    });

  scope
    .command("compile")
    .description("Preview a deterministic selected-rule merge without writing")
    .argument("<templateId>", "Scope template ID from `amc policy scope list`")
    .requiredOption("--pack <packId>", "Existing built-in Policy Pack ID")
    .option("--json", "Output as JSON")
    .action((templateId: string, options: { pack: string; json?: boolean }) => {
      try {
        const compilation = compileScopeTemplate({
          workspace: process.cwd(),
          templateId,
          packId: options.pack,
        });
        if (options.json) console.log(JSON.stringify(compilation, null, 2));
        else process.stdout.write(renderCompilation(compilation));
      } catch (error) {
        fail(error, options.json === true);
      }
    });

  scope
    .command("apply")
    .description("Apply a scope preview after exact compile-ID confirmation")
    .argument("<templateId>", "Scope template ID from `amc policy scope list`")
    .requiredOption("--pack <packId>", "Existing built-in Policy Pack ID")
    .requiredOption("--confirm <compileId>", "Exact compile ID returned by a fresh preview")
    .option("--json", "Output as JSON")
    .action((templateId: string, options: { pack: string; confirm: string; json?: boolean }) => {
      try {
        const result = applyScopeTemplate({
          workspace: process.cwd(),
          templateId,
          packId: options.pack,
          confirmCompileId: options.confirm,
        });
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else process.stdout.write(renderApply(result));
      } catch (error) {
        fail(error, options.json === true);
      }
    });
}

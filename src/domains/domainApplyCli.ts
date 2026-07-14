import chalk from "chalk";
import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { toErrorMessage } from "../utils/errors.js";
import { applyDomainToAgent } from "./domainApply.js";
import { getPackById } from "./industryPacks.js";
import { assertIndustryPackAccess } from "./industryPackEntitlement.js";
import {
  buildIndustryPackAudit,
  renderIndustryPackAuditMarkdown,
  normalizeAuditFramework,
} from "./industryPackAudit.js";

function collectComplianceFrameworks(value: string, previous: string[] = []): string[] {
  const next = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...previous, ...next];
}

function loadResponses(path: string): Record<string, number> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--responses file must be a JSON object of { questionId: level }");
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const level = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(level)) out[key] = level;
  }
  return out;
}

export function registerDomainApplyCommand(domainCmd: Command): void {
  domainCmd
    .command("apply")
    .description("Apply domain-specific guardrails and industry pack rules to an agent")
    .requiredOption("--agent <id>", "Agent ID")
    .option("--domain <domain>", "Domain ID (health|education|environment|mobility|governance|technology|wealth)")
    .option("--pack <packId>", "Specific industry pack ID (for example: clinical-trials)")
    .option("--dry-run", "Preview changes without writing files", false)
    .option(
      "--compliance <frameworks>",
      "Compliance frameworks (comma-separated or repeated, e.g. EU_AI_ACT,ISO_42001)",
      collectComplianceFrameworks,
      []
    )
    .option("--file <path>", "Explicit agent config file to update")
    .option("--audit", "Produce a signed, auditor-ready Industry Pack audit for --pack (paid Industry Packs feature)", false)
    .option("--responses <path>", "JSON file of { questionId: level } responses for the audit (default: L1 baseline)")
    .option("--framework <id>", "Limit the audit crosswalk to one framework (eu_ai_act|nist|iso42001|soc2|sector)")
    .option("--audit-bundle <path>", "Write the signed audit bundle JSON to this path")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      agent: string;
      domain?: string;
      pack?: string;
      dryRun?: boolean;
      compliance: string[];
      file?: string;
      audit?: boolean;
      responses?: string;
      framework?: string;
      auditBundle?: string;
      json?: boolean;
    }) => {
      try {
        if (opts.audit) {
          if (!opts.pack) {
            console.error(chalk.red("--audit requires --pack <packId>. List packs with `amc domain packs`."));
            process.exit(1);
            return;
          }
          // Paid Industry Packs entitlement gate (throws a paywall message if inactive).
          assertIndustryPackAccess(process.cwd());
          const pack = getPackById(opts.pack);
          if (!pack) {
            console.error(chalk.red(`Unknown industry pack: ${opts.pack}`));
            process.exit(1);
            return;
          }
          let framework;
          if (opts.framework) {
            framework = normalizeAuditFramework(opts.framework);
            if (!framework) {
              console.error(chalk.red(`Unknown framework: ${opts.framework} (use eu_ai_act|nist|iso42001|soc2|sector)`));
              process.exit(1);
              return;
            }
          }
          const responses = opts.responses ? loadResponses(opts.responses) : {};
          const auditReport = buildIndustryPackAudit({ pack, responses, now: Date.now(), frameworkFilter: framework });
          if (opts.auditBundle) {
            writeFileSync(opts.auditBundle, JSON.stringify(auditReport, null, 2));
          }
          if (opts.json) {
            console.log(JSON.stringify(auditReport, null, 2));
            return;
          }
          console.log(renderIndustryPackAuditMarkdown(auditReport));
          if (opts.auditBundle) {
            console.log(chalk.green(`\nSigned audit bundle written: ${opts.auditBundle}`));
          }
          return;
        }

        const result = await applyDomainToAgent({
          agentId: opts.agent,
          domain: opts.domain,
          packId: opts.pack,
          dryRun: opts.dryRun,
          compliance: opts.compliance.length > 0 ? opts.compliance : undefined,
          targetFile: opts.file,
          workspacePath: process.cwd()
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const header = result.dryRun ? "🧭  Domain Apply (dry-run)" : "🧭  Domain Apply";
        console.log(chalk.bold.cyan(`\n${header}`));
        console.log(chalk.gray("Agent:"), result.agentId);
        console.log(chalk.gray("Domain:"), result.domain);
        console.log(chalk.gray("Packs Applied:"), result.packsApplied.join(", "));
        console.log(chalk.gray("Guardrails Generated:"), result.guardrailsGenerated);
        console.log(chalk.gray("Guardrails Enabled:"), result.guardrailsEnabled.length);
        console.log(
          chalk.gray("Assessment:"),
          `composite=${result.assessmentScore.composite} level=${result.assessmentScore.level} gaps=${result.assessmentScore.gaps}`
        );
        if (result.complianceFrameworks.length > 0) {
          console.log(chalk.gray("Compliance Frameworks:"), result.complianceFrameworks.join(", "));
        }
        if (result.configFileUpdated) {
          console.log(
            chalk.gray(result.dryRun ? "Config File (would update):" : "Config File Updated:"),
            result.configFileUpdated
          );
        }
      } catch (error: unknown) {
        console.error(chalk.red(toErrorMessage(error)));
        process.exit(1);
      }
    });
}

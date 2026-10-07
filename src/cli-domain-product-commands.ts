import chalk from "chalk";
import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { finishVerify, trustFromFlags, withTrustFlags, type TrustFlags } from "./cli-trust-flags.js";
import { toErrorMessage } from "./utils/errors.js";

type DomainProductCliDeps = {
  product: Command;
  productGlossary: Command;
  domainCmd: Command;
};

export function registerDomainProductCliCommands({ product, productGlossary, domainCmd }: DomainProductCliDeps): void {
  // ── Blocker #13: sector-pack CLI commands for industry packs ──────────────
  const sectorPack = domainCmd.command("pack").description("Industry sector packs — 41 packs across 7 domains");

  sectorPack
    .command("access")
    .alias("subscribe")
    .description("Show Industry Packs entitlement and public-checkout readiness")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const { getIndustryPackEntitlement, formatIndustryPackPaywallMessage } = await import("./domains/industryPackEntitlement.js");
      const entitlement = getIndustryPackEntitlement(process.cwd());
      if (opts.json) {
        console.log(JSON.stringify(entitlement, null, 2));
        return;
      }
      console.log(chalk.bold.hex('#4AEF79')("\n🏭  Industry Packs Access"));
      console.log(chalk.gray("Plan:"), entitlement.planId);
      console.log(chalk.gray("Planned price:"), `$${entitlement.priceUsdMonthly}/month`);
      console.log(chalk.gray("Status:"), entitlement.active ? chalk.green("active") : chalk.yellow("locked"));
      console.log(chalk.gray("Public checkout:"), entitlement.checkoutAvailable ? chalk.green("available") : chalk.yellow("not live"));
      console.log(chalk.gray("Source:"), entitlement.source);
      if (!entitlement.active) {
        console.log("");
        console.log(formatIndustryPackPaywallMessage(entitlement));
      }
      console.log("");
    });

  sectorPack
    .command("checkout")
    .description("Create a checkout link only when a verified provider is configured")
    .option("--success-url <url>", "Return URL after successful payment")
    .option("--cancel-url <url>", "Return URL if checkout is cancelled")
    .option("--email <email>", "Customer email to prefill at checkout")
    .option("--reference <id>", "Client reference ID for the checkout provider")
    .option("--json", "Output as JSON")
    .action(async (opts: { successUrl?: string; cancelUrl?: string; email?: string; reference?: string; json?: boolean }) => {
      const { buildIndustryPackCheckoutUrl, getIndustryPackEntitlement } = await import("./domains/industryPackEntitlement.js");
      const entitlement = getIndustryPackEntitlement(process.cwd());
      const checkoutUrl = buildIndustryPackCheckoutUrl({
        successUrl: opts.successUrl,
        cancelUrl: opts.cancelUrl,
        customerEmail: opts.email,
        clientReferenceId: opts.reference
      });
      const payload = { checkoutUrl, entitlement };
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(chalk.bold.hex('#4AEF79')("\n🏭  Industry Packs Checkout"));
      console.log(chalk.gray("Price:"), `$${entitlement.priceUsdMonthly}/month for all 41 packs`);
      console.log(checkoutUrl);
      console.log(chalk.gray("\nAfter payment, activate the license: amc domain pack activate --key <license-key>"));
    });

  sectorPack
    .command("activate")
    .description("Activate Industry Packs with a valid issued license key")
    .requiredOption("--key <licenseKey>", "License key from checkout")
    .option("--expires-at <isoDate>", "Optional entitlement expiry timestamp")
    .option("--json", "Output as JSON")
    .action(async (opts: { key: string; expiresAt?: string; json?: boolean }) => {
      try {
        const { activateIndustryPackAccessOnline } = await import("./domains/industryPackEntitlement.js");
        const entitlement = await activateIndustryPackAccessOnline({
          workspace: process.cwd(),
          licenseKey: opts.key,
          expiresAt: opts.expiresAt ?? null
        });
        if (opts.json) {
          console.log(JSON.stringify(entitlement, null, 2));
          return;
        }
        console.log(chalk.green("Industry Packs activated."));
        console.log(chalk.gray(`Access: all 41 Industry Domain Packs at $${entitlement.priceUsdMonthly}/month`));
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  withTrustFlags(sectorPack
    .command("verify")
    .description("Verify an Industry Packs license key")
    .requiredOption("--key <licenseKey>", "License key from checkout"),
  { pubkey: "pin the Ed25519 license public key (artifact-seal)", json: true })
    .action(async (opts: { key: string } & TrustFlags) => {
      const { verifyIndustryPackLicenseReport } = await import("./domains/industryPackEntitlement.js");
      const result = verifyIndustryPackLicenseReport(opts.key, trustFromFlags(opts, ["artifact-seal"]),
        opts.pubkey ? readFileSync(resolve(opts.pubkey), "utf8") : null);
      finishVerify("Industry Packs license", result.report, { json: opts.json, result,
        details: result.payload?.expiresAt ? [`Expires: ${result.payload.expiresAt}`] : [] });
    });

  sectorPack
    .command("list")
    .description("List all available industry sector packs")
    .option("--domain <d>", "Filter by domain: health|education|environment|mobility|governance|technology|wealth")
    .option("--json", "Output as JSON")
    .action(async (opts: { domain?: string; json?: boolean }) => {
      const { listIndustryPackIds, getIndustryPack, getIndustryPacksByStation } = await import("./domains/industryPacks.js");
      const { parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
      const { getIndustryPackEntitlement, toIndustryPackCatalogItem } = await import("./domains/industryPackEntitlement.js");
      const entitlement = getIndustryPackEntitlement(process.cwd());

      let packs: Array<{ packId: string; name: string; domain: string; questionCount: number; riskLevel: string; locked: boolean }>;

      if (opts.domain) {
        const domain = parseDomainOrThrow(opts.domain);
        const domainPacks = getIndustryPacksByStation(domain);
        packs = domainPacks.map(p => toIndustryPackCatalogItem(p, entitlement));
      } else {
        const allIds = listIndustryPackIds();
        packs = allIds.map(id => {
          const p = getIndustryPack(id);
          return toIndustryPackCatalogItem(p, entitlement);
        });
      }

      if (opts.json) {
        console.log(JSON.stringify({ entitlement, packs }, null, 2));
        return;
      }

      console.log(chalk.bold.hex('#4AEF79')(`\n🏭  Industry Sector Packs (${packs.length} packs)\n`));
      const maxName = Math.max(...packs.map(p => p.name.length), 10);
      console.log(`  ${"Pack ID".padEnd(30)} ${"Name".padEnd(maxName + 2)} ${"Domain".padEnd(14)} ${"Questions".padEnd(12)} ${"Access".padEnd(10)} Risk`);
      console.log(chalk.gray(`  ${"─".repeat(30)} ${"─".repeat(maxName + 2)} ${"─".repeat(14)} ${"─".repeat(12)} ${"─".repeat(10)} ${"─".repeat(10)}`));
      for (const p of packs) {
        console.log(`  ${chalk.cyan(p.packId.padEnd(30))} ${p.name.padEnd(maxName + 2)} ${p.domain.padEnd(14)} ${String(p.questionCount).padEnd(12)} ${(p.locked ? "locked" : "active").padEnd(10)} ${p.riskLevel}`);
      }
      console.log(chalk.gray(`\n  Total: ${packs.length} packs, ${packs.reduce((s, p) => s + p.questionCount, 0)} questions`));
      if (!entitlement.active) {
        console.log(chalk.yellow(`\n  Locked: $${entitlement.priceUsdMonthly}/month unlocks all 41 Industry Domain Packs.`));
        console.log(chalk.gray(`  Subscribe: ${entitlement.checkoutUrl}`));
        console.log(chalk.gray(`  Activate:  amc domain pack activate --key <license-key>`));
      } else {
        console.log(chalk.gray(`\n  Run a pack: amc domain pack run --pack <packId> --agent <agentId>`));
        console.log(chalk.gray(`  Describe:   amc domain pack describe --pack <packId>`));
      }
    });

  sectorPack
    .command("describe")
    .description("Show details of a specific industry sector pack")
    .requiredOption("--pack <packId>", "Pack ID (from 'amc domain pack list')")
    .option("--json", "Output as JSON")
    .action(async (opts: { pack: string; json?: boolean }) => {
      const { getPackById } = await import("./domains/industryPacks.js");
      const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
      const pack = getPackById(opts.pack);
      if (!pack) {
        console.error(chalk.red(`Pack not found: ${opts.pack}`));
        console.log(chalk.gray("List available packs: amc domain pack list"));
        process.exit(1); return;
      }
      try {
        assertIndustryPackAccess(process.cwd());
      } catch (e: unknown) {
        if (opts.json && e instanceof Error && "entitlement" in e) {
          console.log(JSON.stringify({ error: "industry_packs_locked", message: e.message }, null, 2));
        } else {
          console.error(chalk.yellow(toErrorMessage(e)));
        }
        process.exit(1); return;
      }
      if (opts.json) { console.log(JSON.stringify(pack, null, 2)); return; }

      console.log(chalk.bold.hex('#4AEF79')(`\n🏭  ${pack.name}`));
      console.log(chalk.gray(`  Pack ID:    ${pack.id}`));
      console.log(chalk.gray(`  Station:    ${pack.stationId}`));
      console.log(chalk.gray(`  Risk level: ${pack.riskTier}`));
      console.log(chalk.gray(`  Questions:  ${pack.questions.length}`));
      if (pack.description) console.log(`\n  ${pack.description}`);
      if (pack.regulatoryBasis?.length) {
        console.log(chalk.bold("\n  Regulatory basis:"));
        for (const r of pack.regulatoryBasis) console.log(`    • ${r}`);
      }
      if (pack.complianceFrameworks?.length) {
        console.log(chalk.bold("\n  Compliance frameworks:"));
        for (const f of pack.complianceFrameworks) console.log(`    • ${f}`);
      }
      if (pack.certificationPath) {
        console.log(chalk.bold("\n  Certification path:"));
        console.log(`    ${pack.certificationPath}`);
      }
      console.log(chalk.bold(`\n  Questions (${pack.questions.length}):`));
      for (const q of pack.questions) {
        console.log(`    ${chalk.cyan(q.id)} [${q.dimension}] ${q.text.slice(0, 100)}${q.text.length > 100 ? "..." : ""}`);
      }
      console.log("");
    });

  sectorPack
    .command("run")
    .description("Run an industry sector pack — interactive assessment or baseline score")
    .requiredOption("--pack <packId>", "Pack ID")
    .option("--baseline", "Score with L1 defaults (no interaction needed)", false)
    .option("--json", "Output as JSON")
    .action(async (opts: { pack: string; baseline: boolean; json?: boolean }) => {
      const { getPackById, scoreIndustryPack } = await import("./domains/industryPacks.js");
      const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
      type PackIdType = Parameters<typeof scoreIndustryPack>[0];
      const pack = getPackById(opts.pack);
      if (!pack) {
        console.error(chalk.red(`Pack not found: ${opts.pack}`));
        console.log(chalk.gray("List available packs: amc domain pack list"));
        process.exit(1); return;
      }
      try {
        assertIndustryPackAccess(process.cwd());
      } catch (e: unknown) {
        if (opts.json && e instanceof Error && "entitlement" in e) {
          console.log(JSON.stringify({ error: "industry_packs_locked", message: e.message }, null, 2));
        } else {
          console.error(chalk.yellow(toErrorMessage(e)));
        }
        process.exit(1); return;
      }
      if (!opts.json) {
        console.log(chalk.bold.hex('#4AEF79')(`\n🏭  Running: ${pack.name}`));
        console.log(chalk.gray(`  Questions: ${pack.questions.length}\n`));
      }

      // Baseline and non-interactive runs answer nothing: unanswered questions count as 1 and the
      // self-assessment reads incomplete, so a default is never reported as an answer.
      const responses: Record<string, number> = {};

      if (!opts.baseline && process.stdin.isTTY) {
        // Interactive assessment
        const inq = await import("inquirer");
        for (const q of pack.questions) {
          const { level } = await inq.default.prompt([{
            type: "select",
            name: "level",
            message: `${q.id} [${q.dimension}]: ${q.text.slice(0, 120)}`,
            choices: [
              { name: "L1 — " + q.l1.slice(0, 80), value: 1 },
              { name: "L3 — " + q.l3.slice(0, 80), value: 3 },
              { name: "L5 — " + q.l5.slice(0, 80), value: 5 },
            ]
          }]);
          responses[q.id] = level;
        }
      }

      const result = scoreIndustryPack(opts.pack as PackIdType, responses);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

      console.log(chalk.bold("  Results:"));
      console.log(`    Pack:       ${result.packId}`);
      console.log(`    Self-reported score: ${result.percentage.toFixed(1)} / 100 (L${result.level})`);
      const { complete, answered, total } = result.selfAssessment;
      console.log(`    Self-assessment:     ${complete ? "complete" : "incomplete"} (${answered}/${total} answered; self-reported; not a certification)`);
      console.log(`    Eligible level:      ${result.eligibleLevel === null ? "none" : `L${result.eligibleLevel}`} (self-reported answers cap at L1)`);
      console.log(`    Questions:  ${result.questionResults.length}`);
      const lowScoring = result.questionResults.filter(q => q.percentage < 50);
      if (lowScoring.length > 0) {
        console.log(chalk.yellow(`\n  Gaps (${lowScoring.length} below 50%):`));
        for (const g of lowScoring.slice(0, 10)) {
          console.log(`    ${chalk.cyan(g.id)} ${g.dimension} — ${g.percentage.toFixed(0)}% (score: ${g.score.toFixed(1)}/${g.weight})`);
        }
        if (lowScoring.length > 10) console.log(chalk.gray(`    ... and ${lowScoring.length - 10} more`));
      }
      if (result.complianceGaps.length > 0) {
        console.log(chalk.yellow(`\n  Compliance gaps (${result.complianceGaps.length}):`));
        for (const gap of result.complianceGaps.slice(0, 5)) {
          console.log(`    • ${gap}`);
        }
      }
      console.log("");
    });

  product
    .command("features")
    .description("List product features")
    .option("--relevance <level>", "Filter by relevance: high, medium, low")
    .option("--lane <lane>", "Filter by lane")
    .option("--amc-fit", "Only AMC-fit features")
    .option("--json", "Output as JSON")
    .action(async (opts: { relevance?: string; lane?: string; amcFit?: boolean; json?: boolean }) => {
      try {
        const { listFeatures } = await import("./product/featureCatalog.js");
        const filter: { relevance?: string; lane?: string; amcFit?: boolean } = {};
        if (opts.relevance) filter.relevance = opts.relevance;
        if (opts.lane) filter.lane = opts.lane;
        if (opts.amcFit) filter.amcFit = true;
        const features = listFeatures(filter);
        if (opts.json) { console.log(JSON.stringify(features, null, 2)); return; }
        console.log(chalk.bold.yellow(`\n📦  Product Features (${features.length})`));
        for (const f of features) {
          console.log(`  ${chalk.hex('#4AEF79')(f.id)} ${f.name} [${f.relevance}] ${f.amcFit ? chalk.green("✓ AMC") : ""}`);
        }
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  product
    .command("features-recommended")
    .description("Show top recommended product features")
    .option("--limit <n>", "Max features to show", "10")
    .option("--json", "Output as JSON")
    .action(async (opts: { limit?: string; json?: boolean }) => {
      try {
        const { getRecommended } = await import("./product/featureCatalog.js");
        const features = getRecommended(parseInt(opts.limit ?? "10", 10));
        if (opts.json) { console.log(JSON.stringify(features, null, 2)); return; }
        console.log(chalk.bold.yellow(`\n📦  Recommended Features (${features.length})`));
        for (const f of features) console.log(`  ${chalk.hex('#4AEF79')(f.id)} ${f.name} — ${f.pricingRange}`);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  productGlossary
    .command("define <term> <definition>")
    .description("Define a glossary term")
    .option("--domain <domain>", "Domain category", "general")
    .option("--json", "Output as JSON")
    .action(async (term: string, definition: string, opts: { domain?: string; json?: boolean }) => {
      try {
        const { GlossaryManager } = await import("./product/glossary.js");
        const mgr = new GlossaryManager();
        const id = mgr.define(term, definition, opts.domain);
        if (opts.json) { console.log(JSON.stringify({ id, term, definition }, null, 2)); return; }
        console.log(chalk.bold.yellow("\n📖  Term Defined"));
        console.log(chalk.gray("ID:"), id);
        console.log(chalk.gray("Term:"), term);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  productGlossary
    .command("lookup <term>")
    .description("Look up a glossary term")
    .option("--json", "Output as JSON")
    .action(async (term: string, opts: { json?: boolean }) => {
      try {
        const { GlossaryManager } = await import("./product/glossary.js");
        const mgr = new GlossaryManager();
        const entry = mgr.lookup(term);
        if (!entry) { console.log(chalk.yellow("Term not found.")); return; }
        if (opts.json) { console.log(JSON.stringify(entry, null, 2)); return; }
        console.log(chalk.bold.yellow("\n📖  Glossary Entry"));
        console.log(chalk.gray("Term:"), entry.term);
        console.log(chalk.gray("Definition:"), entry.definition);
        console.log(chalk.gray("Domain:"), entry.domain);
        if (entry.aliases.length) console.log(chalk.gray("Aliases:"), entry.aliases.join(", "));
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("list")
    .description("List all 7 domains with metadata")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const { listDomainMetadataCli } = await import("./domains/domainCliIntegration.js");
        const domains = listDomainMetadataCli();
        if (opts.json) { console.log(JSON.stringify(domains, null, 2)); return; }
        const domainDescriptions: Record<string, string> = {
          health: "AI agents handling patient data, clinical decisions, medical devices, and drug development",
          education: "AI in classrooms, student assessment, learning platforms, and accessibility",
          environment: "AI managing energy grids, water systems, agriculture, and supply chains",
          mobility: "Autonomous vehicles, smart buildings, transit systems, and connected infrastructure",
          governance: "AI in public services, elections, legislation, civic identity, and anti-corruption",
          technology: "General AI services, content platforms, IP management, and data ecosystems",
          wealth: "AI in payments, trading, lending, insurance, and blockchain/crypto",
        };
        console.log(chalk.bold.cyan(`\n🧭  Domain Catalog (${domains.length})`));
        for (const domain of domains) {
          const desc = domainDescriptions[domain.id] ?? "";
          console.log(`  ${chalk.hex('#4AEF79')(domain.id)}  ${domain.name}`);
          if (desc) console.log(`    ${chalk.gray(desc)}`);
          console.log(`    Risk: ${domain.riskLevel} | EU AI Act: ${domain.euAIActCategory} | Questions: ${domain.questionCount}`);
          console.log(`    Regulatory: ${domain.regulatoryBasis.join(", ")}`);
          console.log(`    Aliases: ${domain.aliases.join(", ")}`);
          console.log(`    Sector tags: ${domain.sectorTags.join(", ")}`);
          console.log(`    Suggested packs: ${domain.recommendedIndustryPacks.join(", ")}`);
        }
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("assess")
    .description("Run full domain assessment (not evaluated without evidence; --example shows labelled synthetic output)")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--example", "Print labelled synthetic example output; never evidence, never written to .amc/")
    .option("--json", "Output as JSON")
    .action(async (opts: DomainCommandOpts) => {
      try {
        const assessment = await assessForCli(opts);
        if (opts.json) { console.log(JSON.stringify(assessment, null, 2)); return; }
        const result = assessment.result;
        printDomainHeader("Domain Assessment", assessment);
        if (!result) { printNotEvaluated(assessment); return; }
        console.log(chalk.gray("Base Score:"), result.baseScore);
        console.log(chalk.gray("Domain Score:"), result.domainScore);
        console.log(chalk.gray("Composite Score:"), result.compositeScore);
        console.log(chalk.gray("Level:"), result.level);
        console.log(chalk.gray("Compliance Gaps:"), result.complianceGaps.length);
        console.log(chalk.gray("Regulatory Warnings:"), result.regulatoryWarnings.length);
        printExampleFooter(assessment);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("modules")
    .description("Show module activation map for domain")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--json", "Output as JSON")
    .action(async (opts: { domain: string; json?: boolean }) => {
      try {
        const { getDomainModules, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const modules = getDomainModules(domain);
        if (opts.json) { console.log(JSON.stringify(modules, null, 2)); return; }
        console.log(chalk.bold.cyan(`\n🧭  Module Activation Map (${domain})`));
        console.log(chalk.gray(`Total modules: ${modules.length}`));
        for (const module of modules) {
          console.log(`  ${chalk.hex('#4AEF79')(module.moduleId)} ${module.moduleName} [${module.relevance}]`);
        }
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("gaps")
    .description("Show compliance gaps for an agent and domain (not evaluated without evidence)")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--example", "Print labelled synthetic example output; never evidence, never written to .amc/")
    .option("--json", "Output as JSON")
    .action(async (opts: DomainCommandOpts) => {
      try {
        const assessment = await assessForCli(opts);
        const gaps = assessment.result?.complianceGaps ?? null;
        if (opts.json) { console.log(JSON.stringify({ ...claimFields(assessment), gaps }, null, 2)); return; }
        printDomainHeader(`Compliance Gaps (${assessment.domain})`, assessment);
        if (!gaps) { printNotEvaluated(assessment); return; }
        for (const gap of gaps) {
          console.log(`  ${chalk.yellow(gap.questionId)} ${gap.dimension} L${gap.currentLevel}->L${gap.requiredLevel}`);
          console.log(`    ${gap.regulatoryRef}`);
        }
        printExampleFooter(assessment);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("report")
    .description("Build full domain report and write it to a file (not evaluated without evidence)")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .requiredOption("--output <file>", "Output report path")
    .option("--example", "Write labelled synthetic example output; never evidence, never written to .amc/")
    .option("--json", "Output as JSON")
    .action(async (opts: DomainCommandOpts & { output: string }) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { buildDomainReportForAgent, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const report = buildDomainReportForAgent({ agentId: opts.agent, domain, outputPath: opts.output, example: opts.example === true });
        const assessment = report.assessment;
        if (opts.json) {
          console.log(JSON.stringify({ ...claimFields(assessment), outputPath: report.outputPath, assessment, report: report.reportObject ?? null }, null, 2));
          return;
        }
        printDomainHeader("Domain Report Generated", assessment);
        console.log(chalk.gray("Output:"), report.outputPath ?? opts.output);
        if (!assessment.result) { printNotEvaluated(assessment); return; }
        console.log(chalk.gray("Composite Score:"), assessment.result.compositeScore);
        console.log(chalk.gray("Level:"), assessment.result.level);
        printExampleFooter(assessment);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("assurance")
    .description("Run domain-specific assurance packs (no agent is invoked; --example grades a canned reply)")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--example", "Grade a labelled canned reply; never evidence, never written to .amc/")
    .option("--json", "Output as JSON")
    .action(async (opts: DomainCommandOpts) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { parseDomainOrThrow, runDomainAssurance } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const run = runDomainAssurance(opts.agent, domain, { example: opts.example === true });
        if (opts.json) { console.log(JSON.stringify(run, null, 2)); return; }
        printDomainHeader(`Domain Assurance (${run.domain})`, { ...run, domainName: run.domainMetadata.name });
        for (const pack of run.packRuns) {
          console.log(`  ${chalk.hex('#4AEF79')(pack.packId)} ${pack.title}`);
          const graded = pack.status === "graded" ? ` passed=${pack.passed} failed=${pack.failed} passRate=${pack.passRate}%` : "";
          console.log(`    scenarios=${pack.scenarioCount} notEvaluated=${pack.notEvaluated}${graded}${pack.reason ? ` (${pack.reason})` : ""}`);
        }
        console.log(chalk.gray("Totals:"), `scenarios=${run.totalScenarios} passed=${run.passed} failed=${run.failed} notEvaluated=${run.notEvaluated}`);
        printNotEvaluated(run);
        printExampleFooter(run);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("roadmap")
    .description("Generate 30/60/90-day roadmap for this domain (not evaluated without evidence)")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--example", "Print labelled synthetic example output; never evidence, never written to .amc/")
    .option("--json", "Output as JSON")
    .action(async (opts: DomainCommandOpts) => {
      try {
        const assessment = await assessForCli(opts);
        const roadmap = assessment.result?.roadmap ?? null;
        if (opts.json) { console.log(JSON.stringify({ ...claimFields(assessment), roadmap }, null, 2)); return; }
        printDomainHeader(`Domain Roadmap (${assessment.domain})`, assessment);
        if (!roadmap) { printNotEvaluated(assessment); return; }
        for (const item of roadmap) {
          console.log(`  [P${item.priority}] ${item.timeframe} ${item.action}`);
          if (item.moduleId) console.log(`    module: ${item.moduleId}`);
          console.log(`    regulatory: ${item.regulatoryImpact}`);
        }
        printExampleFooter(assessment);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });
}

type DomainCommandOpts = { agent: string; domain: string; example?: boolean; json?: boolean };
type ClaimOutcome = { status: string; reasons: string[]; claimKind: string; statusDimensions: unknown; banner?: string };

async function assessForCli(opts: DomainCommandOpts) {
  const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
  assertIndustryPackAccess(process.cwd());
  const { assessDomainForAgent, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
  return assessDomainForAgent({ agentId: opts.agent, domain: parseDomainOrThrow(opts.domain), example: opts.example === true });
}

function claimFields(outcome: ClaimOutcome): ClaimOutcome {
  const { status, reasons, claimKind, statusDimensions, banner } = outcome;
  return { ...(banner ? { banner } : {}), status, reasons, claimKind, statusDimensions };
}

/** Example output starts and ends with the banner, so a cropped screenshot still carries it. */
function printDomainHeader(title: string, outcome: ClaimOutcome & { agentId: string; domain: string; domainName: string }): void {
  if (outcome.banner) console.log(chalk.bold.yellow(outcome.banner));
  console.log(chalk.bold.cyan(`\n🧭  ${title}`));
  console.log(chalk.gray("Agent:"), outcome.agentId);
  console.log(chalk.gray("Domain:"), `${outcome.domainName} (${outcome.domain})`);
  console.log(chalk.gray("Claim kind:"), outcome.claimKind);
}

function printNotEvaluated(outcome: ClaimOutcome): void {
  console.log(chalk.gray("Result:"), chalk.yellow("not evaluated"));
  for (const reason of outcome.reasons) console.log(chalk.gray(`  - ${reason}`));
  if (!outcome.banner) {
    console.log(chalk.gray("Next step: run `amc quickscore` for the base part; add --example for labelled synthetic output."));
  }
}

function printExampleFooter(outcome: ClaimOutcome): void {
  if (outcome.banner) console.log(chalk.bold.yellow(outcome.banner));
}

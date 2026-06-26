import chalk from "chalk";
import type { Command } from "commander";
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
    .description("Show Industry Packs subscription status and unlock instructions")
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
      console.log(chalk.gray("Price:"), `$${entitlement.priceUsdMonthly}/month`);
      console.log(chalk.gray("Status:"), entitlement.active ? chalk.green("active") : chalk.yellow("locked"));
      console.log(chalk.gray("Source:"), entitlement.source);
      if (!entitlement.active) {
        console.log("");
        console.log(formatIndustryPackPaywallMessage(entitlement));
      }
      console.log("");
    });

  sectorPack
    .command("checkout")
    .description("Create an Industry Packs checkout link")
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
    .description("Activate Industry Packs after purchase")
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

  sectorPack
    .command("verify")
    .description("Verify an Industry Packs license key")
    .requiredOption("--key <licenseKey>", "License key from checkout")
    .option("--json", "Output as JSON")
    .action(async (opts: { key: string; json?: boolean }) => {
      const { verifyIndustryPackLicenseKey } = await import("./domains/industryPackEntitlement.js");
      const result = verifyIndustryPackLicenseKey(opts.key);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.valid) {
        console.log(chalk.green("Industry Packs license is valid."));
        if (result.payload?.expiresAt) {
          console.log(chalk.gray(`Expires: ${result.payload.expiresAt}`));
        }
        return;
      }
      console.error(chalk.red(`Industry Packs license is invalid: ${result.reason ?? "verification failed"}`));
      process.exit(1);
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

      let responses: Record<string, number> = {};

      if (opts.baseline) {
        // Score all questions at L1 to show gap surface
        for (const q of pack.questions) { responses[q.id] = 1; }
      } else if (process.stdin.isTTY) {
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
      } else {
        // Non-interactive: default to L1 baseline
        for (const q of pack.questions) { responses[q.id] = 1; }
      }

      const result = scoreIndustryPack(opts.pack as PackIdType, responses);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

      console.log(chalk.bold("  Results:"));
      console.log(`    Pack:       ${result.packId}`);
      console.log(`    Score:      ${result.percentage.toFixed(1)} / 100`);
      console.log(`    Level:      L${result.level}`);
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
    .description("Run full domain assessment")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { assessDomainForAgent, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const assessment = assessDomainForAgent({ agentId: opts.agent, domain });
        if (opts.json) { console.log(JSON.stringify(assessment.result, null, 2)); return; }
        const result = assessment.result;
        console.log(chalk.bold.cyan("\n🧭  Domain Assessment"));
        console.log(chalk.gray("Agent:"), opts.agent);
        console.log(chalk.gray("Domain:"), `${result.domainMetadata.name} (${result.domain})`);
        console.log(chalk.gray("Base Score:"), result.baseScore);
        console.log(chalk.gray("Domain Score:"), result.domainScore);
        console.log(chalk.gray("Composite Score:"), result.compositeScore);
        console.log(chalk.gray("Level:"), result.level);
        console.log(chalk.gray("Certification Readiness:"), result.certificationReadiness ? chalk.green("ready") : chalk.red("not ready"));
        console.log(chalk.gray("Compliance Gaps:"), result.complianceGaps.length);
        console.log(chalk.gray("Regulatory Warnings:"), result.regulatoryWarnings.length);
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
    .description("Show compliance gaps for an agent and domain")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { getDomainGaps, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const gaps = getDomainGaps(opts.agent, domain);
        if (opts.json) { console.log(JSON.stringify(gaps, null, 2)); return; }
        console.log(chalk.bold.cyan(`\n🧭  Compliance Gaps (${domain})`));
        if (gaps.length === 0) {
          console.log(chalk.green("No compliance gaps detected."));
          return;
        }
        for (const gap of gaps) {
          console.log(`  ${chalk.yellow(gap.questionId)} ${gap.dimension} L${gap.currentLevel}->L${gap.requiredLevel}`);
          console.log(`    ${gap.regulatoryRef}`);
        }
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("report")
    .description("Build full domain report and write it to a file")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .requiredOption("--output <file>", "Output report path")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent: string; domain: string; output: string; json?: boolean }) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { buildDomainReportForAgent, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const report = buildDomainReportForAgent({ agentId: opts.agent, domain, outputPath: opts.output });
        if (opts.json) {
          console.log(JSON.stringify({
            outputPath: report.outputPath,
            assessment: report.assessment,
            report: report.reportObject
          }, null, 2));
          return;
        }
        console.log(chalk.bold.cyan("\n🧭  Domain Report Generated"));
        console.log(chalk.gray("Agent:"), opts.agent);
        console.log(chalk.gray("Domain:"), domain);
        console.log(chalk.gray("Output:"), report.outputPath ?? opts.output);
        console.log(chalk.gray("Composite Score:"), report.assessment.compositeScore);
        console.log(chalk.gray("Level:"), report.assessment.level);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("assurance")
    .description("Run domain-specific assurance packs")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { parseDomainOrThrow, runDomainAssurance } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const run = runDomainAssurance(opts.agent, domain);
        if (opts.json) { console.log(JSON.stringify(run, null, 2)); return; }
        console.log(chalk.bold.cyan(`\n🧭  Domain Assurance (${run.domain})`));
        console.log(chalk.gray("Agent:"), run.agentId);
        for (const pack of run.packRuns) {
          console.log(`  ${chalk.hex('#4AEF79')(pack.packId)} ${pack.title}`);
          console.log(`    scenarios=${pack.scenarioCount} passed=${pack.passed} failed=${pack.failed} passRate=${pack.passRate}%`);
        }
        console.log(chalk.gray("Totals:"), `scenarios=${run.totalScenarios} passed=${run.passed} failed=${run.failed}`);
        console.log(chalk.gray("Overall:"), run.allPassed ? chalk.green("all checks passed") : chalk.yellow("review required"));
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  domainCmd
    .command("roadmap")
    .description("Generate 30/60/90-day roadmap for this domain")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--domain <d>", "Domain or alias, e.g. health|environment|mobility|supply-chain|logistics")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
      try {
        const { assertIndustryPackAccess } = await import("./domains/industryPackEntitlement.js");
        assertIndustryPackAccess(process.cwd());
        const { getDomainRoadmap, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
        const domain = parseDomainOrThrow(opts.domain);
        const roadmap = getDomainRoadmap(opts.agent, domain);
        if (opts.json) { console.log(JSON.stringify(roadmap, null, 2)); return; }
        console.log(chalk.bold.cyan(`\n🧭  Domain Roadmap (${domain})`));
        for (const item of roadmap) {
          console.log(`  [P${item.priority}] ${item.timeframe} ${item.action}`);
          if (item.moduleId) console.log(`    module: ${item.moduleId}`);
          console.log(`    regulatory: ${item.regulatoryImpact}`);
        }
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });
}

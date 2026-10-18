import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser } from "@playwright/test";
import { z } from "zod";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { contextFor, invalidInput, outcome, type OracleOutcome } from "./protocol.js";

const schema = z.object({ context: contextFor("L1-EDU-04"), checkerEnabled: z.boolean(),
  html: z.string().min(1).max(200000).refine(value => value.trim().length > 0) }).strict();
const countsSchema = z.object({ violations: z.number().int().nonnegative(), incomplete: z.number().int().nonnegative(),
  executedRules: z.number().int().nonnegative() }).strict();

/** Pure summary unit only. Caller-supplied counts are never a browser observation or admitted control evidence. */
export function classifyAccessibilityFindings(input: unknown): Pick<OracleOutcome, "result" | "reasonCode"> {
  const parsed = countsSchema.safeParse(input);
  if (!parsed.success) return { result: "not_evaluated", reasonCode: "automated_wcag_incomplete" };
  if (parsed.data.violations > 0) return { result: "fail", reasonCode: "automated_wcag_violation" };
  if (parsed.data.incomplete > 0 || parsed.data.executedRules === 0) return { result: "not_evaluated", reasonCode: "automated_wcag_incomplete" };
  return { result: "pass", reasonCode: "automated_wcag_no_violations" };
}

function installedVersion(name: "@axe-core/playwright" | "@playwright/test"): string {
  const metadata: unknown = JSON.parse(readFileSync(join(process.cwd(), "node_modules", name, "package.json"), "utf8"));
  return z.object({ version: z.string().regex(/^\d+\.\d+\.\d+/) }).parse(metadata).version;
}

/** Executes installed Axe in an offline browser on the actual fixture HTML. No rules are disabled and no publication occurs. */
export async function runAccessibilityCheck(input: unknown): Promise<OracleOutcome> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  const manualReview = { result: "not_evaluated", performed: false, assessor: null, dutyId: "L1-EDU-04-manual-accessibility",
    remaining: ["meaningful reading order", "keyboard and task flow", "accurate text alternatives and captions", "assistive-technology usability"] };
  const observations: Record<string, unknown> = { scope: "automatable_wcag_2.1_a_aa_only", manualReview,
    documentSha256: sha256Hex(value.html), publicationPerformed: false };
  if (!value.checkerEnabled) return outcome("not_evaluated", "checker_unavailable", observations);
  let browser: Browser | undefined;
  try {
    const adapterVersion = installedVersion("@axe-core/playwright");
    const playwrightVersion = installedVersion("@playwright/test");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
    const blockedRequests: string[] = [];
    await context.route("**/*", async route => {
      blockedRequests.push(route.request().url());
      await route.abort();
    });
    const page = await context.newPage();
    await page.setContent(value.html, { waitUntil: "load" });
    // Input evidence guard only: an absent lesson is not an accessibility observation.
    if ((await page.locator("body").innerText()).trim().length === 0) return outcome("not_evaluated", "generated_lesson_missing", observations);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const executedRuleIds = [...new Set([...results.passes, ...results.violations, ...results.incomplete].map(rule => rule.id))].sort();
    const findings = (rules: typeof results.violations) => rules.map(rule => ({ id: rule.id, impact: rule.impact,
      tags: rule.tags, targets: rule.nodes.map(node => node.target) }));
    Object.assign(observations, { checker: { library: results.testEngine.name, version: results.testEngine.version, adapterVersion,
      playwrightVersion, browserVersion: browser.version() }, executedRuleIds, violations: findings(results.violations),
      incomplete: findings(results.incomplete), passedRuleIds: results.passes.map(rule => rule.id).sort(),
      inapplicableRuleIds: results.inapplicable.map(rule => rule.id).sort(), blockedRequests,
      serializedDomSha256: sha256Hex(await page.content()) });
    if (blockedRequests.length > 0) return outcome("not_evaluated", "external_resource_refused", observations);
    const summary = classifyAccessibilityFindings({ violations: results.violations.length,
      incomplete: results.incomplete.length, executedRules: executedRuleIds.length });
    return outcome(summary.result, summary.reasonCode, observations);
  } catch (error) {
    return outcome("not_evaluated", "checker_unavailable", { ...observations, errorClass: error instanceof Error ? error.name : "UnknownCheckerError" });
  } finally {
    await browser?.close();
  }
}

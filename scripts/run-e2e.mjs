#!/usr/bin/env node
/**
 * Runs the Playwright website suite, explaining what is missing when it cannot.
 *
 * The twelve specs under tests/e2e are real tests of the public site
 * (accessibility, brand, i18n, routing, theme), but @playwright/test was never
 * declared as a dependency — despite @axe-core/playwright requiring it as a
 * peer — so `npm run test:e2e` failed with an opaque npx error and no workflow
 * ran them. The dependency is now declared; browsers still need installing
 * once, which this reports rather than failing cryptically.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

if (!existsSync(join(root, "node_modules", "@playwright", "test"))) {
  console.error(
    "@playwright/test is not installed.\n" +
      "  npm install            # picks up the declared devDependency\n" +
      "  npx playwright install # one-time browser download"
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "--config", "tests/e2e/playwright.config.ts", ...process.argv.slice(2)],
  { stdio: "inherit" }
);

if (result.error) {
  console.error(`Failed to start Playwright: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

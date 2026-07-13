#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const checkedRoots = [
  "README.md",
  "docs/GETTING_STARTED.md",
  "docs/QUICKSTART.md",
  "docs/START_HERE.md",
  "docs/INSTALL_PACKAGES.md",
  "docs/RECIPES.md",
  "docs/USE_CASES.md",
  "docs/SOLO_DEV_QUICKSTART.md",
  "docs/TROUBLESHOOTING.md",
  "website",
  "src/console",
  "AMC_OS"
];

const forbiddenSourceNames = [
  /AgentScope/i,
  /agentscope/i,
  /future-agi/i,
  /EverOS/i,
  /CORAL/,
  /deer-flow/i,
  /optillm/i,
  /FantasyLab/i,
  /aurora/i,
  /HALO/,
  /Lucien/i,
  /thewisecrab/i,
  /wisecrab/i,
  /multica/i,
  /andrej/i,
  /Karpathy/
];

const stalePrimaryCommands = [
  /npx\s+agent-maturity-compass\s+quickscore/i,
  /npm\s+install\s+-g\s+agent-maturity-compass\s+&&\s+amc\s+quickscore/i,
  /Run `amc quickscore` to begin/i,
  /amc\s+quickscore\s+--eu-ai-act/i,
  /amc\s+quickscore\s+--share/i,
  /(?:\$|`|<code>)\s*amc\s+full\s+score/i
];

const prohibitedPublicCapabilityClaims = [
  /hidden\s+(?:coordination|collaboration)\s+runtime/i,
  /latent[-\s]?state\s+(?:coordination|collaboration|runtime|training)/i,
  /model[-\s]?internal\s+collaboration/i,
  /model[-\s]?training\s+(?:runtime|coordination|loop)/i
];

const allowedQuickscoreOptional = new Set([
  "README.md",
  "docs/GETTING_STARTED.md",
  "docs/QUICKSTART.md",
  "docs/CLI_COMMAND_INVENTORY.md",
  "website/docs/getting-started.html",
  "website/docs/cli.html",
  "website/openapi.yaml"
]);

const internalClaimScopes = [
  "AMC_OS/"
];

function filesUnder(entry) {
  const full = join(root, entry);
  if (!existsSync(full)) return [];
  const stat = statSync(full);
  if (stat.isFile()) return [entry];
  const out = [];
  const walk = (dir) => {
    for (const child of readdirSync(dir)) {
      if (child === "node_modules" || child === "dist" || child === ".git") continue;
      const childFull = join(dir, child);
      const childStat = statSync(childFull);
      if (childStat.isDirectory()) {
        walk(childFull);
      } else if (/\.(md|html|js|yaml|yml|txt)$/.test(child)) {
        out.push(relative(root, childFull).replaceAll("\\", "/"));
      }
    }
  };
  walk(full);
  return out;
}

const files = [...new Set(checkedRoots.flatMap(filesUnder))];
const failures = [];

for (const file of files) {
  const body = readFileSync(join(root, file), "utf8");
  for (const pattern of forbiddenSourceNames) {
    if (pattern.test(body)) {
      failures.push(`${file}: forbidden source/reference name matched ${pattern}`);
    }
  }
  for (const pattern of stalePrimaryCommands) {
    if (pattern.test(body)) {
      failures.push(`${file}: stale primary command matched ${pattern}`);
    }
  }
  if (!internalClaimScopes.some((prefix) => file.startsWith(prefix))) {
    for (const pattern of prohibitedPublicCapabilityClaims) {
      if (pattern.test(body)) {
        failures.push(`${file}: prohibited public capability claim matched ${pattern}`);
      }
    }
  }
  if (!allowedQuickscoreOptional.has(file) && /quickscore/i.test(body) && !/AUDIT|historical|legacy/i.test(body)) {
    failures.push(`${file}: quickscore mention is outside the optional/legacy allowlist`);
  }
}

if (failures.length > 0) {
  console.error("Docs drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Docs drift check passed (${files.length} files scanned).`);

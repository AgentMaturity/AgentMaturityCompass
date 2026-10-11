#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { isEntrypoint } from "./lib/entrypoint.mjs";

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

// P0-28: D-03 claim vocabulary. These words fail when used as a status in README, promoted docs, whitepaper/ and
// website/. A negation in the same sentence ("does not certify", "is not compliant", "non-compliant"), a quoted word
// ("the phrase \"certification ready\"") and code pass. Everything else that must stay is a logged exception below.
export const prohibitedTruthClaims = [
  /\bcertified\b/i,
  /\bcertification[\s-]+read(?:y|iness)\b/i,
  /\bcompliant\b/i,
  /\bguaranteed\b/i,
  /\b10\s?[×x]\s+better\b/i,
  /\bexactly-once\b|\bexactly once\s+(?:delivery|semantics|execution|processing|guarantees?)\b/i
];

const NEGATION = /\b(?:not|never|no|nor|without|cannot|non)\b|n't\b/i;

/** Exact phrases that are not AMC status claims, each with its reason. Matched against the claim's surrounding text. */
export const TRUTH_CLAIM_EXCEPTIONS = [
  { file: "website/blog/amc-philosophy.html", phrase: "Aircraft get certified through observed performance",
    reason: "an analogy about aircraft, not a claim about AMC or an agent" },
  { file: "website/blog/amc-philosophy.html", phrase: "Its documentation says it's compliant",
    reason: "describes what an agent's own documentation claims, which the post argues against trusting" },
  { file: "docs/API_REFERENCE.md", phrase: "standard-compliant content credentials",
    reason: "generated from a question's text (src/assurance/packs), which asks whether content credentials follow a standard" }
];

/** Commands a promoted doc may name although the inventory lacks them, each with its reason. */
export const COMMAND_EXCEPTIONS = [
  { file: "docs/A4_FORGE.md", command: "amc a4",
    reason: "owned by the A4 session; the doc names it as the planned entry point (P1-65) and says it is a library function for now" }
];

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const blank = (match) => match.replace(/[^\n]/g, " ");
const decodeEntities = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Prose with code, comments and markup blanked out; newlines are kept so line numbers still match the file. */
export function proseOf(file, body) {
  if (file.endsWith(".md")) {
    return body.replace(/<!--[\s\S]*?-->/g, blank).replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
      .replace(/`[^`\n]+`/g, blank);
  }
  if (file.endsWith(".html")) {
    return decodeEntities(body.replace(/<!--[\s\S]*?-->/g, blank)
      .replace(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, blank).replace(/<[^>]*>/g, blank));
  }
  return body;
}

function insideQuotes(line, column) {
  const before = line.slice(0, column);
  const straight = (before.match(/"/g) ?? []).length % 2 === 1 && line.indexOf('"', column) >= 0;
  const curly = before.lastIndexOf("\u201c") > before.lastIndexOf("\u201d") && line.indexOf("\u201d", column) >= 0;
  return straight || curly;
}

/** Banned claim words used as a status: not negated in their sentence, not quoted, not a logged exception. */
export function findTruthClaims(file, body) {
  const prose = proseOf(file, body);
  const found = [];
  for (const pattern of prohibitedTruthClaims) {
    for (const match of prose.matchAll(new RegExp(pattern.source, "gi"))) {
      const lineStart = prose.lastIndexOf("\n", match.index) + 1;
      const lineEnd = prose.indexOf("\n", match.index);
      const line = prose.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      const sentence = prose.slice(Math.max(0, match.index - 160), match.index).split(/[.!?:;](?=\s)|\n\s*\n|\|/).pop();
      if (NEGATION.test(sentence) || insideQuotes(line, match.index - lineStart)) continue;
      const context = prose.slice(Math.max(0, match.index - 80), match.index + 80).replace(/\s+/g, " ");
      if (TRUTH_CLAIM_EXCEPTIONS.some((e) => e.file === file && context.includes(e.phrase))) continue;
      found.push({ line: lineOf(prose, match.index), match: match[0], context: context.trim() });
    }
  }
  return found;
}

/** Every command path and alias in docs/CLI_COMMAND_INVENTORY.md (generated by `amc commands --markdown`). */
export function loadKnownCommands(inventory) {
  const known = new Set();
  for (const row of inventory.matchAll(/^\| `(amc [^`]+)` \|.*\| ([^|]*) \|$/gm)) {
    const path = row[1];
    known.add(path);
    for (const alias of row[2].matchAll(/`([^`]+)`/g)) {
      // A one-word alias renames the last segment; a multi-word alias is a full path under an aliased parent.
      known.add(alias[1].includes(" ") ? `amc ${alias[1]}` : [...path.split(" ").slice(0, -1), alias[1]].join(" "));
    }
  }
  if (known.size === 0) throw new Error("docs/CLI_COMMAND_INVENTORY.md lists no command paths");
  return known;
}

/** Code spans and blocks with the prose line each came from (inline spans only, for negation context). */
function codeOf(file, body) {
  const out = [];
  if (file.endsWith(".html")) {
    for (const m of body.matchAll(/<(code|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      out.push({ code: decodeEntities(m[2].replace(/<[^>]*>/g, "")), index: m.index, prose: "" });
    }
    return out;
  }
  for (const m of body.matchAll(/^(```|~~~)[^\n]*\n([\s\S]*?)^\1/gm)) out.push({ code: m[2], index: m.index, prose: "" });
  const inline = body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank);
  for (const m of inline.matchAll(/`([^`\n]+)`/g)) {
    const start = inline.lastIndexOf("\n", m.index) + 1;
    const end = inline.indexOf("\n", m.index);
    out.push({ code: m[1], index: m.index, prose: inline.slice(start, end < 0 ? undefined : end) });
  }
  return out;
}

const COMMAND_START = /(?:^|&&|\|\||[|;(]|\$\s|\bnpx\s+(?:-y\s+)?)\s*amc((?:[ \t]+[a-z][a-z0-9-]*)*)/gm;
const SAYS_ABSENT = /there (?:is|are) no(?:ne)?\b|never (?:been )?registered|does not exist|is not registered|no such command/i;

/**
 * `amc …` commands in code that the inventory does not register: an unknown first word, or an unknown word after a
 * command that has subcommands (`amc trust decay` fails because `amc trust` has subcommands and `decay` is not one).
 * A span on a line that says the command does not exist passes.
 */
export function findUnknownCommands(file, body, known) {
  const hasChildren = (path) => [...known].some((k) => k.startsWith(`${path} `));
  const found = [];
  for (const span of codeOf(file, body)) {
    if (SAYS_ABSENT.test(span.prose)) continue;
    for (const match of span.code.matchAll(COMMAND_START)) {
      const words = match[1].trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      let path = "amc";
      let i = 0;
      while (i < words.length && known.has(`${path} ${words[i]}`)) path = `${path} ${words[i++]}`;
      if (path !== "amc" && !(i < words.length && hasChildren(path))) continue;
      const command = `amc ${words.slice(0, i + 1).join(" ")}`;
      if (COMMAND_EXCEPTIONS.some((e) => e.file === file && e.command === command)) continue;
      found.push({ line: lineOf(body, span.index), command });
    }
  }
  return found;
}

/** README, the guides website/docs/docs.js promotes, whitepaper/ and website/; never docs/archive/. */
async function truthSurfaces() {
  delete globalThis.AMC_DOCS_BUILD_MANIFEST;
  await import(pathToFileURL(join(root, "website/docs/docs.js")).href);
  const manifest = globalThis.AMC_DOCS_BUILD_MANIFEST;
  delete globalThis.AMC_DOCS_BUILD_MANIFEST;
  if (!manifest || !Array.isArray(manifest.publicDocs)) throw new Error("website/docs/docs.js did not expose AMC_DOCS_BUILD_MANIFEST");
  const surfaces = ["README.md", ...manifest.publicDocs.map((id) => `docs/${id}.md`), ...filesUnder("whitepaper"), ...filesUnder("website")];
  return [...new Set(surfaces)].filter((file) => !file.startsWith("docs/archive/") && existsSync(join(root, file)));
}

function legacyFailures(files) {
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
  return failures;
}

async function main() {
  const files = [...new Set(checkedRoots.flatMap(filesUnder))];
  const failures = legacyFailures(files);
  const known = loadKnownCommands(readFileSync(join(root, "docs/CLI_COMMAND_INVENTORY.md"), "utf8"));
  const surfaces = await truthSurfaces();
  for (const file of surfaces) {
    const body = readFileSync(join(root, file), "utf8");
    for (const claim of findTruthClaims(file, body)) {
      failures.push(`${file}:${claim.line}: prohibited truth claim "${claim.match}" (D-03 vocabulary): ${claim.context}`);
    }
    if (!/\.(md|html)$/.test(file)) continue;
    for (const command of findUnknownCommands(file, body, known)) {
      failures.push(`${file}:${command.line}: \`${command.command}\` is not in docs/CLI_COMMAND_INVENTORY.md`);
    }
  }

  if (failures.length > 0) {
    console.error("Docs drift check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Docs drift check passed (${files.length} files scanned; truth claims and commands checked in ${surfaces.length} public files; ${TRUTH_CLAIM_EXCEPTIONS.length + COMMAND_EXCEPTIONS.length} logged exceptions).`);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(`Docs drift check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

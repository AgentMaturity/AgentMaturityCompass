#!/usr/bin/env node
/**
 * Credentials presence check (brief Phase B, step B1).
 *
 * For each credential a release or deploy action needs, reports whether it is
 * present, what needs it and where it is configured. PRESENCE ONLY: a value is
 * compared to blank and never printed, hashed, measured or written anywhere.
 * NPMRC_AUTH_TOKEN_LINE is whether a non-comment line of $HOME/.npmrc contains
 * `_authToken`; the line itself is never returned.
 *
 * This reads the environment of the shell it runs in. GitHub Actions secrets
 * live in the repository settings; `gh secret list` shows their names (GitHub
 * never returns secret values).
 *
 *   node scripts/credentials-presence-check.mjs [--for <action>[,<action>...]] [--json]
 *
 * --json prints { NAME: { present, requiredFor, configureAt } } and nothing else.
 * Exit: 0 when every required credential is present, 1 when one is absent,
 * 2 on a usage error. Without --for, every listed credential is required.
 * Node built-ins only.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GH_SECRET = "GitHub repo secret (Settings > Secrets and variables > Actions, or `gh secret set NAME`)";

export const CREDENTIALS = {
  NPM_TOKEN: {
    actions: ["publish"],
    requiredFor: "B3 publish: npm-publish.yml and release.yml pass it as NODE_AUTH_TOKEN to the npm registry publish step",
    configureAt: `${GH_SECRET}; an npm granular access token with publish rights from npmjs.com`
  },
  CHANGESETS_GITHUB_TOKEN: {
    actions: ["publish"],
    requiredFor: "B3 publish: npm-publish.yml gives it to changesets/action as GITHUB_TOKEN (opens the version PR)",
    configureAt: `${GH_SECRET}; a GitHub token allowed to push branches and open pull requests`
  },
  NPMRC_AUTH_TOKEN_LINE: {
    actions: ["publish-local"],
    requiredFor: "B3 publish from this shell: `pnpm release` (changeset publish) authenticates to npm through ~/.npmrc",
    configureAt: "$HOME/.npmrc line `//registry.npmjs.org/:_authToken=...` (written by `npm login`)",
    source: "npmrc"
  },
  AMC_RELEASE_SIGNING_KEY: {
    actions: ["sign-release"],
    requiredFor: "B2 signed artifact: release.yml signs the .amcrelease bundle (skipped when absent)",
    configureAt: GH_SECRET
  },
  HOMEBREW_TAP_TOKEN: {
    actions: ["homebrew"],
    requiredFor: "B3 Homebrew tap update in release.yml (skipped when absent)",
    configureAt: `${GH_SECRET}; a GitHub token with write access to the tap repository`
  },
  GHCR_TOKEN: {
    actions: ["push-image"],
    requiredFor: "B4 image push from this shell: `docker login ghcr.io` (in Actions, release.yml and docker-runner.yml use the provisioned GITHUB_TOKEN)",
    configureAt: "shell env: a GitHub personal access token (classic) with write:packages; `echo $GHCR_TOKEN | docker login ghcr.io -u USER --password-stdin`"
  },
  RAILWAY_TOKEN: {
    actions: ["deploy-railway"],
    requiredFor: "B4 Railway deploy via the Railway CLI (railway.json target); no workflow references it",
    configureAt: "shell env: a Railway project token (Railway project Settings > Tokens)"
  },
  VERCEL_TOKEN: {
    actions: ["deploy-vercel"],
    requiredFor: "B4 deployment to Vercel via the Vercel CLI (vercel.json target); no workflow references it",
    configureAt: "shell env: a Vercel access token (Vercel Account Settings > Tokens)"
  },
  AMC_DEPLOY_VERIFY_LEASE: {
    actions: ["deploy-verify"],
    requiredFor: "post-deploy governed turn: scripts/deploy-verify.mjs (or pass --lease-file)",
    configureAt: "shell env: a short AMC gateway lease issued on the target workspace (`amc lease issue`)"
  }
};

export const ACTIONS = [...new Set(Object.values(CREDENTIALS).flatMap((c) => c.actions))];

/** Presence only. The value is compared to blank and never leaves this function. */
export function envPresent(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "";
}

/** Whether a non-comment line of $HOME/.npmrc contains `_authToken`. Unreadable counts as absent. */
export function npmrcAuthTokenLinePresent(env) {
  if (!envPresent(env, "HOME")) return false;
  let text;
  try {
    text = readFileSync(join(env.HOME, ".npmrc"), "utf8");
  } catch {
    return false;
  }
  return text.split(/\r?\n/).some((line) => !/^\s*[;#]/.test(line) && line.includes("_authToken"));
}

function parseArgs(argv) {
  const opts = { actions: [], json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") opts.json = true;
    else if (argv[i] === "--for" && argv[i + 1] !== undefined) opts.actions.push(...argv[++i].split(",").filter(Boolean));
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  for (const action of opts.actions) {
    if (action !== "all" && !ACTIONS.includes(action)) throw new Error(`unknown action: ${action} (known: ${ACTIONS.join(", ")}, all)`);
  }
  const all = opts.actions.length === 0 || opts.actions.includes("all");
  return { json: opts.json, actions: all ? ACTIONS : [...new Set(opts.actions)] };
}

/** { NAME: { present, requiredFor, configureAt } } — booleans and fixed prose only. */
export function buildReport(env) {
  return Object.fromEntries(Object.entries(CREDENTIALS).map(([name, spec]) => [name, {
    present: spec.source === "npmrc" ? npmrcAuthTokenLinePresent(env) : envPresent(env, name),
    requiredFor: spec.requiredFor,
    configureAt: spec.configureAt
  }]));
}

export function missingFor(report, actions) {
  return actions
    .map((action) => ({ action, names: Object.keys(CREDENTIALS).filter((n) => CREDENTIALS[n].actions.includes(action) && !report[n].present) }))
    .filter((entry) => entry.names.length > 0);
}

function renderText(report, missing) {
  const lines = ["AMC credentials presence check (presence only; no value is ever printed)"];
  for (const [name, entry] of Object.entries(report)) {
    lines.push(`${name}: ${entry.present ? "present" : "absent"}`, `  required for: ${entry.requiredFor}`, `  configure at: ${entry.configureAt}`);
  }
  for (const m of missing) lines.push(`missing for ${m.action}: ${m.names.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`credentials-presence-check: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  const report = buildReport(process.env);
  const missing = missingFor(report, opts.actions);
  process.stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report, missing));
  process.exitCode = missing.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

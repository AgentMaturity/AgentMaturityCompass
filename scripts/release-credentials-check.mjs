#!/usr/bin/env node
/**
 * Release credentials presence check (brief Phase B, step B1).
 *
 * Reports SET or UNSET for each credential an action needs, plus every
 * `secrets.NAME` the workflows under .github/workflows reference. It reports
 * PRESENCE ONLY: a value is tested for being non-blank and is never printed,
 * hashed, measured or written anywhere.
 *
 * This reads the environment of the shell it runs in. GitHub Actions secrets
 * live in the repository settings, not here; `gh secret list` shows their
 * names (GitHub never returns secret values).
 *
 *   node scripts/release-credentials-check.mjs [--for <action>[,<action>...]] [--json]
 *
 * Exit: 0 when every credential the requested actions require is SET (or no
 * action was requested), 1 when one is UNSET, 2 on a usage error.
 * Node built-ins only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** What each action needs, and where each credential is consumed. */
export const ACTIONS = {
  publish: ["NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN"],
  "sign-release": ["AMC_RELEASE_SIGNING_KEY"],
  "push-image": ["GITHUB_TOKEN"],
  "deploy-railway": ["RAILWAY_TOKEN"],
  "deploy-vercel": ["VERCEL_TOKEN"],
  homebrew: ["HOMEBREW_TAP_TOKEN"],
  "deploy-verify": ["AMC_DEPLOY_VERIFY_LEASE"]
};

export const WHERE = {
  NPM_TOKEN: "repo secret; npm-publish.yml and release.yml pass it as NODE_AUTH_TOKEN to npm/changeset publish",
  CHANGESETS_GITHUB_TOKEN: "repo secret; npm-publish.yml uses it as GITHUB_TOKEN for changesets/action (must be allowed to open PRs)",
  AMC_RELEASE_SIGNING_KEY: "repo secret; release.yml signs the .amcrelease bundle with it (bundle is skipped when unset)",
  GITHUB_TOKEN: "provisioned by GitHub Actions for GHCR login in release.yml/docker-runner.yml; set locally only for a local push",
  RAILWAY_TOKEN: "Railway project token for the Railway CLI (railway.json target); no workflow references it",
  VERCEL_TOKEN: "Vercel token for the Vercel CLI (vercel.json target); no workflow references it",
  HOMEBREW_TAP_TOKEN: "repo secret; release.yml updates the Homebrew tap with it (skipped when unset)",
  AMC_DEPLOY_VERIFY_LEASE: "an AMC gateway lease for scripts/deploy-verify.mjs (amc lease issue on the target workspace)"
};

/** Presence only. The value is compared to blank and never leaves this function. */
export function presence(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "" ? "SET" : "UNSET";
}

/** Secret NAMES referenced by the workflows, with the files that reference them. */
export function workflowSecretNames(root = repoRoot) {
  const dir = join(root, ".github", "workflows");
  const found = new Map();
  let files = [];
  try {
    files = readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).sort();
  } catch {
    return [];
  }
  for (const file of files) {
    for (const match of readFileSync(join(dir, file), "utf8").matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      found.set(match[1], new Set([...(found.get(match[1]) ?? []), file]));
    }
  }
  return [...found.keys()].sort().map((name) => ({ name, files: [...found.get(name)].sort() }));
}

function parseArgs(argv) {
  const opts = { actions: [], json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") opts.json = true;
    else if (argv[i] === "--for" && argv[i + 1] !== undefined) opts.actions.push(...argv[++i].split(",").filter(Boolean));
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  const expanded = opts.actions.includes("all") ? Object.keys(ACTIONS) : opts.actions;
  for (const action of expanded) {
    if (!ACTIONS[action]) throw new Error(`unknown action: ${action} (known: ${Object.keys(ACTIONS).join(", ")}, all)`);
  }
  return { ...opts, actions: [...new Set(expanded)] };
}

export function buildReport(actions, env, root = repoRoot) {
  const required = actions.map((action) => ({
    action,
    credentials: ACTIONS[action].map((name) => ({ name, status: presence(env, name), where: WHERE[name] ?? "" }))
  }));
  const missing = required
    .map(({ action, credentials }) => ({ action, names: credentials.filter((c) => c.status === "UNSET").map((c) => c.name) }))
    .filter((entry) => entry.names.length > 0);
  const workflowReferenced = workflowSecretNames(root).map(({ name, files }) => ({ name, status: presence(env, name), files }));
  return { schema: "amc-release-credentials/v1", source: "process environment", required, missing, workflowReferenced, ok: missing.length === 0 };
}

function renderText(report) {
  const lines = ["AMC release credentials check (presence only; no value is ever printed)", `source: ${report.source}`];
  if (report.required.length === 0) lines.push("no action requested (--for <action>); nothing is required");
  for (const { action, credentials } of report.required) {
    lines.push(`action ${action}:`);
    for (const c of credentials) lines.push(`  ${c.name}: ${c.status}  - ${c.where}`);
  }
  lines.push("referenced by .github/workflows:");
  for (const w of report.workflowReferenced) lines.push(`  ${w.name}: ${w.status}  (${w.files.join(", ")})`);
  for (const m of report.missing) lines.push(`missing for ${m.action}: ${m.names.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`release-credentials-check: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  const report = buildReport(opts.actions, process.env);
  process.stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report));
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

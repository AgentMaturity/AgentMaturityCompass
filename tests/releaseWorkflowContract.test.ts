import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

/** P0-34: release.yml is the only publisher and fails loudly; npm-publish.yml only opens version PRs. */
type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { environment?: string | { name: string }; "timeout-minutes"?: number; steps: Step[] };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const read = (name: string) => readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");
const parse = (text: string) => YAML.parse(text) as Workflow;

/** Every `exit 0` in a script must sit in a branch whose `if` asks npm whether the version is already published. */
export function credentialSkips(script: string): string[] {
  const lines = script.split("\n");
  return lines.flatMap((line, index) => {
    if (!/\bexit 0\b/.test(line)) return [];
    const guard = lines.slice(0, index + 1).reverse().find(candidate => /^\s*if\b/.test(candidate)) ?? "(no if)";
    return /npm view/.test(guard) ? [] : [`exit 0 under: ${guard.trim()}`];
  });
}

function releaseContract(text: string): string[] {
  const failures: string[] = [];
  const release = parse(text).jobs.release;
  const environment = typeof release.environment === "string" ? release.environment : release.environment?.name;
  if (environment !== "release") failures.push(`release job environment is ${String(environment)}`);
  if (!((release["timeout-minutes"] ?? 0) > 45)) failures.push("release job timeout does not cover the prepack gate");
  const runs = release.steps.map(step => step.run ?? "");
  const publish = runs.filter(run => /\bnpm publish\b/.test(run));
  if (publish.length !== 1) failures.push(`expected one npm publish step, found ${publish.length}`);
  for (const run of publish) {
    failures.push(...credentialSkips(run));
    if (!run.includes("npm --version")) failures.push("publish step does not log npm --version");
    if (/--dry-run/.test(run)) failures.push("publish step is a dry run");
  }
  for (const run of runs) {
    for (const call of run.match(/release verify[^\n]*/g) ?? []) {
      if (!/--pubkey trust\/amc-release-signing\.pub\b/.test(call)) failures.push(`release verify without the pinned key: ${call}`);
    }
  }
  const signing = runs.find(run => run.includes("AMC_RELEASE_SIGNING_KEY")) ?? "";
  if (!/-z "\$AMC_RELEASE_SIGNING_KEY"[\s\S]*?exit 1/.test(signing)) failures.push("a missing signing key does not fail the release");
  if (credentialSkips(signing).length) failures.push("the signing step can exit 0");
  const candidate = runs.findIndex(run => run.includes("scripts/check-release-candidate.mjs"));
  const publishAt = runs.findIndex(run => /\bnpm publish\b/.test(run));
  if (candidate < 0 || candidate > publishAt) failures.push("check-release-candidate does not run before publishing");
  if (!runs.some(run => run.includes("scripts/check-pack-contents.mjs"))) failures.push("check-pack-contents does not run");
  const upload = release.steps.find(step => step.uses?.startsWith("softprops/action-gh-release"));
  if (upload?.with?.fail_on_unmatched_files !== true) failures.push("release assets may be silently missing");
  for (const asset of ["dist/sbom.cdx.json", "dist/licenses.json"]) {
    if (!String(upload?.with?.files ?? "").includes(asset)) failures.push(`${asset} is not attached`);
  }
  return failures;
}

function versionPrContract(text: string): string[] {
  const failures: string[] = [];
  const workflow = parse(text);
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.uses?.startsWith("changesets/action") && step.with && "publish" in step.with) failures.push(`${id}: changesets publish input`);
      if (/\bnpm publish\b|changeset publish|npm run release(?![:\w-])/.test(step.run ?? "")) failures.push(`${id}: publishes`);
      if (step.env && ("NODE_AUTH_TOKEN" in step.env || "NPM_TOKEN" in step.env)) failures.push(`${id}: npm credential in env`);
    }
  }
  if (/createRef|createRelease/.test(text)) failures.push("creates a tag or a release");
  return failures;
}

describe("release workflow contract (P0-34)", () => {
  test("release.yml publishes only from the release environment and fails loudly without credentials", () => {
    expect(releaseContract(read("release.yml"))).toEqual([]);
  });

  test("npm-publish.yml opens version PRs and never publishes, tags or releases", () => {
    expect(versionPrContract(read("npm-publish.yml"))).toEqual([]);
  });

  test("mutation: a silent credential skip, an unpinned verify or a publish input is caught", () => {
    const release = read("release.yml");
    const skip = release.replace(/(\n(\s+)npm publish --provenance)/,
      '\n$2if [ -z "$NODE_AUTH_TOKEN" ]; then\n$2  echo "Skipping npm publish"\n$2  exit 0\n$2fi$1');
    expect(skip).not.toBe(release);
    expect(releaseContract(skip)).toContain('exit 0 under: if [ -z "$NODE_AUTH_TOKEN" ]; then');
    const unpinned = release.replace("--pubkey trust/amc-release-signing.pub", "");
    expect(releaseContract(unpinned).some(failure => failure.startsWith("release verify without the pinned key"))).toBe(true);
    expect(releaseContract(release.replace("environment: release", "environment: staging"))).toContain("release job environment is staging");
    const publishing = read("npm-publish.yml").replace(/(version: node scripts\/release-prepare\.mjs[^\n]*\n)/, "$1          publish: npm run release\n");
    expect(versionPrContract(publishing)).toContain("release: changesets publish input");
  });
});

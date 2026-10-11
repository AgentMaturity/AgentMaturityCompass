import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

/** P0-34: release.yml is the only publisher and fails loudly; npm-publish.yml only opens version PRs. */
type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { environment?: string | { name: string }; "timeout-minutes"?: number; needs?: string | string[]; env?: Record<string, string>;
  outputs?: Record<string, string>; steps: Step[] };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const read = (name: string) => readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");
const parse = (text: string) => YAML.parse(text) as Workflow;
const GATED_COMMIT = "${{ needs.gate.outputs.commit }}";
const REBUILD = /\b(?:pnpm install|npm ci|npm run build|pnpm run build|npm pack|npm test|build:sea|release:gate|npm run package:desktop)\b/;

/** Every `exit 0` in a script must sit in a branch whose `if` asks npm whether the version is already published. */
export function credentialSkips(script: string): string[] {
  const lines = script.split("\n");
  return lines.flatMap((line, index) => {
    if (!/\bexit 0\b/.test(line)) return [];
    const guard = lines.slice(0, index + 1).reverse().find(candidate => /^\s*if\b/.test(candidate)) ?? "(no if)";
    return /npm view/.test(guard) ? [] : [`exit 0 under: ${guard.trim()}`];
  });
}

/** The gate packs once at the tagged commit and gates that file; it records the files the later jobs may use. */
function gateContract(gate: Job | undefined): string[] {
  if (!gate) return ["no gate job"];
  const failures: string[] = [];
  const runs = gate.steps.map(step => step.run ?? "");
  const all = runs.join("\n");
  if (!((gate["timeout-minutes"] ?? 0) > 45)) failures.push("gate timeout does not cover the release gate");
  if (gate.outputs?.commit !== "${{ steps.commit.outputs.sha }}") failures.push("gate does not output the commit it gated");
  if ((all.match(/\bnpm pack\b/g) ?? []).length !== 1) failures.push("gate does not pack exactly once");
  const gateStep = gate.steps.find(step => /release:gate/.test(step.run ?? ""));
  if (!gateStep?.env?.AMC_PACKED_INSTALL_TARBALL?.startsWith("tmp/npm-release/")) failures.push("release gate does not run on the packed tarball");
  if (!/check-pack-contents\.mjs --tarball "\$TARBALL"/.test(all)) failures.push("pack contents are not checked on the packed tarball");
  if (!/npm publish "\$TARBALL" --dry-run/.test(all)) failures.push("the dry run does not publish the packed tarball");
  for (const command of ["check-release-candidate.mjs", "release-record.mjs tag", "release-record.mjs write", "release-record.mjs verify"]) {
    if (!all.includes(command)) failures.push(`gate does not run ${command}`);
  }
  const upload = gate.steps.find(step => step.uses?.startsWith("actions/upload-artifact") && step.with?.name === "amc-gated-release");
  if (upload?.with?.path !== "tmp/npm-release/") failures.push("gate does not upload the gated files");
  return failures;
}

function releaseContract(text: string): string[] {
  const workflow = parse(text);
  const failures = gateContract(workflow.jobs.gate);
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if (id === "gate") continue;
    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    const checkout = job.steps.find(step => step.uses?.startsWith("actions/checkout"));
    if (!needs.includes("gate") || checkout?.with?.ref !== GATED_COMMIT) failures.push(`${id} does not check out the gated commit`);
    if (!job.steps.some(step => /release-record\.mjs tag/.test(step.run ?? ""))) failures.push(`${id} does not refuse a moved tag`);
  }
  const release = workflow.jobs.release;
  const environment = typeof release.environment === "string" ? release.environment : release.environment?.name;
  if (environment !== "release") failures.push(`release job environment is ${String(environment)}`);
  if (release.env?.AMC_NPM_TARBALL !== "tmp/npm-release/${{ needs.gate.outputs.tarball }}") failures.push("release job does not name the gated tarball");
  const runs = release.steps.map(step => step.run ?? "");
  for (const run of runs) if (REBUILD.test(run)) failures.push(`release job rebuilds: ${run.match(REBUILD)?.[0]}`);
  const publish = runs.filter(run => /\bnpm publish\b/.test(run));
  if (publish.length !== 1) failures.push(`expected one npm publish step, found ${publish.length}`);
  for (const run of publish) {
    failures.push(...credentialSkips(run));
    if (!run.includes("npm --version")) failures.push("publish step does not log npm --version");
    if (/--dry-run/.test(run)) failures.push("publish step is a dry run");
    const at = run.search(/\bnpm publish\b/);
    if (!/npm publish "\$AMC_NPM_TARBALL"/.test(run)) failures.push("publish does not use the gated tarball");
    for (const check of ["release-record.mjs tag", "release-record.mjs verify"]) {
      if (!(run.indexOf(check) >= 0 && run.indexOf(check) < at)) failures.push(`publish does not run ${check} first`);
    }
  }
  for (const run of Object.values(workflow.jobs).flatMap(job => job.steps.map(step => step.run ?? ""))) {
    for (const call of run.match(/release verify[^\n]*/g) ?? []) {
      if (!/--pubkey trust\/amc-release-signing\.pub\b/.test(call)) failures.push(`release verify without the pinned key: ${call}`);
    }
  }
  const signing = runs.find(run => run.includes("AMC_RELEASE_SIGNING_KEY")) ?? "";
  if (!/-z "\$AMC_RELEASE_SIGNING_KEY"[\s\S]*?exit 1/.test(signing)) failures.push("a missing signing key does not fail the release");
  if (credentialSkips(signing).length) failures.push("the signing step can exit 0");
  if (!/release pack --npm-tarball "\$AMC_NPM_TARBALL" --sbom tmp\/npm-release\/sbom\.cdx\.json --licenses tmp\/npm-release\/licenses\.json/.test(signing)) {
    failures.push("the signed bundle does not embed the gated tarball, SBOM and licences");
  }
  if (!/imagetools create[\s\S]*?@\$AMD64"\s+"[^"\n]*@\$ARM64"/.test(runs.join("\n"))) failures.push("image tags are not made from the qualified digests");
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

  test("mutation: a silent skip, a rebuild, an unverified or ungated publish, a moving checkout or an unpinned verify is caught", () => {
    const release = read("release.yml");
    const mutate = (from: string | RegExp, to: string) => {
      const changed = release.replace(from, to);
      expect(changed).not.toBe(release);
      return releaseContract(changed);
    };
    expect(mutate(/(\n(\s+)npm publish "\$AMC_NPM_TARBALL")/, '\n$2if [ -z "$NODE_AUTH_TOKEN" ]; then\n$2  echo "Skipping npm publish"\n$2  exit 0\n$2fi$1'))
      .toContain('exit 0 under: if [ -z "$NODE_AUTH_TOKEN" ]; then');
    expect(mutate('npm publish "$AMC_NPM_TARBALL" --provenance', "npm publish --provenance")).toContain("publish does not use the gated tarball");
    expect(mutate("          npm install -g npm@11.10.1\n", "          npm install -g npm@11.10.1\n          pnpm install --frozen-lockfile && npm run build\n"))
      .toContain("release job rebuilds: pnpm install");
    expect(mutate(/\n\s+node scripts\/release-record\.mjs verify tmp\/npm-release[^\n]*\n(\s+PACKAGE_NAME)/, "\n$1"))
      .toContain("publish does not run release-record.mjs verify first");
    expect(mutate(/(release:\n[\s\S]*?ref: )\$\{\{ needs\.gate\.outputs\.commit \}\}/, "$1${{ env.AMC_RELEASE_TAG }}"))
      .toContain("release does not check out the gated commit");
    expect(mutate("--npm-tarball \"$AMC_NPM_TARBALL\" ", "")).toContain("the signed bundle does not embed the gated tarball, SBOM and licences");
    expect(mutate(/npm pack --ignore-scripts/, "npm pack --ignore-scripts --pack-destination tmp && npm pack --ignore-scripts")).toContain("gate does not pack exactly once");
    expect(mutate("--pubkey trust/amc-release-signing.pub", "").some(failure => failure.startsWith("release verify without the pinned key"))).toBe(true);
    expect(mutate("environment: release", "environment: staging")).toContain("release job environment is staging");
    expect(mutate(/AMC_PACKED_INSTALL_TARBALL: [^\n]+/, "AMC_PACKED_INSTALL_TARBALL: \"\"")).toContain("release gate does not run on the packed tarball");
    const publishing = read("npm-publish.yml").replace(/(version: node scripts\/release-prepare\.mjs[^\n]*\n)/, "$1          publish: npm run release\n");
    expect(versionPrContract(publishing)).toContain("release: changesets publish input");
  });
});

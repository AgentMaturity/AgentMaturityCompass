import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

/**
 * P0-34: release.yml is the only publisher. It publishes exactly the tarball that passed the gate, from a job that
 * installs and builds nothing and is the only one holding id-token: write; npm-publish.yml only opens version PRs.
 */
type Step = { name?: string; id?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { environment?: string | { name: string }; "timeout-minutes"?: number; needs?: string | string[]; env?: Record<string, string>;
  permissions?: Record<string, string>; outputs?: Record<string, string>; steps: Step[] };
type Workflow = { on: Record<string, unknown>; env?: Record<string, string>; permissions?: Record<string, string>; jobs: Record<string, Job> };

const read = (name: string) => readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");
const parse = (text: string) => YAML.parse(text) as Workflow;
const GATED_COMMIT = "${{ needs.gate.outputs.commit }}";
const GATED_TARBALL = "tmp/npm-release/${{ needs.gate.outputs.tarball }}";
/** Anything that resolves, installs, fetches or builds code. */
const INSTALL = /\b(?:npm|pnpm|yarn)\s+(?:install|i|ci|add)\b|\bnpx\b|\bpnpx\b|\bcorepack\b|\bcurl\b|\bwget\b|\b(?:npm|pnpm)\s+run\s+build\b|\bnpm\s+pack\b/;
const PRIVILEGED_ACTIONS = ["actions/checkout@", "actions/download-artifact@"];

/** Every `exit 0` in a script must sit in a branch whose `if` asks npm whether the version is already published. */
export function credentialSkips(script: string): string[] {
  const lines = script.split("\n");
  return lines.flatMap((line, index) => {
    if (!/\bexit 0\b/.test(line)) return [];
    const guard = lines.slice(0, index + 1).reverse().find(candidate => /^\s*if\b/.test(candidate)) ?? "(no if)";
    return /npm(?:_cli)? view/.test(guard) ? [] : [`exit 0 under: ${guard.trim()}`];
  });
}

const runsOf = (job: Job) => job.steps.map(step => step.run ?? "");
const usesSecret = (job: Job, name: string) => JSON.stringify(job).includes(`secrets.${name}`);
const environmentOf = (job: Job) => (typeof job.environment === "string" ? job.environment : job.environment?.name);

/** The gate packs once at the tagged commit and gates that file; it records the files the later jobs may use. */
function gateContract(gate: Job | undefined): string[] {
  if (!gate) return ["no gate job"];
  const failures: string[] = [];
  const all = runsOf(gate).join("\n");
  if (!((gate["timeout-minutes"] ?? 0) > 45)) failures.push("gate timeout does not cover the release gate");
  if (gate.outputs?.commit !== "${{ steps.commit.outputs.sha }}") failures.push("gate does not output the commit it gated");
  if ((all.match(/\bnpm pack\b/g) ?? []).length !== 1) failures.push("gate does not pack exactly once");
  const gateStep = gate.steps.find(step => /release:gate/.test(step.run ?? ""));
  if (!gateStep?.env?.AMC_PACKED_INSTALL_TARBALL?.startsWith("tmp/npm-release/")) failures.push("release gate does not run on the packed tarball");
  if (!/check-pack-contents\.mjs --tarball "\$TARBALL"/.test(all)) failures.push("pack contents are not checked on the packed tarball");
  if (!/npm publish "\$TARBALL" --dry-run/.test(all)) failures.push("the dry run does not publish the packed tarball");
  if (!/pnpm install --frozen-lockfile/.test(all)) failures.push("gate does not install from the committed lockfile");
  for (const command of ["check-release-candidate.mjs", "release-record.mjs tag", "release-record.mjs write", "release-record.mjs verify"]) {
    if (!all.includes(command)) failures.push(`gate does not run ${command}`);
  }
  const upload = gate.steps.find(step => step.uses?.startsWith("actions/upload-artifact") && step.with?.name === "amc-gated-release");
  if (upload?.with?.path !== "tmp/npm-release/") failures.push("gate does not upload the gated files");
  return failures;
}

/** A job with id-token: write or an npm credential installs, builds and fetches nothing and uses no other action. */
function privilegedContract(id: string, job: Job): string[] {
  const failures: string[] = [];
  for (const step of job.steps) {
    const match = (step.run ?? "").match(INSTALL);
    if (match) failures.push(`${id} installs or builds: ${match[0]}`);
    if (step.uses && !PRIVILEGED_ACTIONS.some(prefix => step.uses!.startsWith(prefix))) failures.push(`${id} uses ${step.uses}`);
  }
  return failures;
}

function publishContract(release: Job): string[] {
  const failures: string[] = [];
  if (environmentOf(release) !== "release") failures.push(`release job environment is ${String(environmentOf(release))}`);
  if (release.env?.AMC_NPM_TARBALL !== GATED_TARBALL) failures.push("release job does not name the gated tarball");
  const publish = runsOf(release).filter(run => /\bnpm(?:_cli)? publish\b/.test(run));
  if (publish.length !== 1) failures.push(`expected one npm publish step, found ${publish.length}`);
  for (const run of publish) {
    failures.push(...credentialSkips(run));
    if (!/npm(?:_cli)? --version/.test(run)) failures.push("publish step does not log the npm version");
    if (/--dry-run/.test(run)) failures.push("publish step is a dry run");
    if (!/npm_cli publish "\$AMC_NPM_TARBALL"/.test(run)) failures.push("publish does not use the gated tarball with the pinned npm CLI");
    const at = run.search(/npm(?:_cli)? publish/);
    for (const check of ['"$NPM_CLI_INTEGRITY"', "release-record.mjs tag", "release-record.mjs verify"]) {
      if (!(run.indexOf(check) >= 0 && run.indexOf(check) < at)) failures.push(`publish does not check ${check} first`);
    }
  }
  return failures;
}

function signContract(sign: Job | undefined): string[] {
  const failures: string[] = [];
  const signing = (sign ? runsOf(sign) : []).find(run => run.includes("AMC_RELEASE_SIGNING_KEY")) ?? "";
  if (!sign || environmentOf(sign) !== "release") failures.push("signing does not run in the release environment");
  if (sign?.env && "AMC_RELEASE_SIGNING_KEY" in sign.env) failures.push("the signing key is in the sign job's env, not only its signing step");
  if (!/-z "\$AMC_RELEASE_SIGNING_KEY"[\s\S]*?exit 1/.test(signing)) failures.push("a missing signing key does not fail the release");
  if (credentialSkips(signing).length) failures.push("the signing step can exit 0");
  if (!/release pack --npm-tarball "\$AMC_NPM_TARBALL" --sbom tmp\/npm-release\/sbom\.cdx\.json --licenses tmp\/npm-release\/licenses\.json/.test(signing)) {
    failures.push("the signed bundle does not embed the gated tarball, SBOM and licences");
  }
  return failures;
}

function jobContract(id: string, job: Job): string[] {
  const failures: string[] = [];
  const permissions = job.permissions ?? {};
  if (!job.permissions) failures.push(`${id} has no permissions block`);
  if (permissions["id-token"] && id !== "release") failures.push(`${id} has id-token`);
  if (permissions.packages && !["image", "image-tags"].includes(id)) failures.push(`${id} has packages`);
  if (permissions.contents === "write" && id !== "github-release") failures.push(`${id} can write contents`);
  if (usesSecret(job, "NPM_TOKEN") && id !== "release") failures.push(`${id} sees NPM_TOKEN`);
  if (usesSecret(job, "AMC_RELEASE_SIGNING_KEY") && id !== "sign") failures.push(`${id} sees the signing key`);
  if (permissions["id-token"] === "write" || usesSecret(job, "NPM_TOKEN")) failures.push(...privilegedContract(id, job));
  if (id === "gate" || id === "npm-cli") return failures;
  const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
  const checkout = job.steps.find(step => step.uses?.startsWith("actions/checkout"));
  if (!needs.includes("gate") || checkout?.with?.ref !== GATED_COMMIT) failures.push(`${id} does not check out the gated commit`);
  if (!runsOf(job).some(run => /release-record\.mjs tag/.test(run))) failures.push(`${id} does not refuse a moved tag`);
  return failures;
}

function releaseContract(text: string): string[] {
  const workflow = parse(text);
  const failures = gateContract(workflow.jobs.gate);
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: "read" })) failures.push("workflow default permissions are not contents: read");
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(workflow.env?.NPM_CLI_INTEGRITY ?? "") || !/^\d+\.\d+\.\d+$/.test(workflow.env?.NPM_CLI_VERSION ?? "")) {
    failures.push("the npm CLI is not pinned by exact version and integrity");
  }
  for (const [id, job] of Object.entries(workflow.jobs)) failures.push(...jobContract(id, job));
  failures.push(...(workflow.jobs.release ? publishContract(workflow.jobs.release) : ["no release job"]), ...signContract(workflow.jobs.sign));
  for (const run of Object.values(workflow.jobs).flatMap(runsOf)) {
    for (const call of run.match(/release verify[^\n]*/g) ?? []) {
      if (!/--pubkey trust\/amc-release-signing\.pub\b/.test(call)) failures.push(`release verify without the pinned key: ${call}`);
    }
  }
  const tags = workflow.jobs["image-tags"] ? runsOf(workflow.jobs["image-tags"]).join("\n") : "";
  if (!/imagetools create[\s\S]*?@\$AMD64"\s+"[^"\n]*@\$ARM64"/.test(tags)) failures.push("image tags are not made from the qualified digests");
  const upload = workflow.jobs["github-release"]?.steps.find(step => step.uses?.startsWith("softprops/action-gh-release"));
  if (upload?.with?.fail_on_unmatched_files !== true) failures.push("release assets may be silently missing");
  for (const asset of ["tmp/signed/sbom.cdx.json", "tmp/signed/licenses.json"]) {
    if (!String(upload?.with?.files ?? "").includes(asset)) failures.push(`${asset} is not attached`);
  }
  for (const line of text.split("\n").filter(candidate => /^\s+(?:- )?uses: /.test(candidate))) {
    if (!/@[0-9a-f]{40}\b/.test(line) && !/# TODO\(P0-34 follow-up\): pin \S+ by full commit SHA/.test(line)) failures.push(`unpinned action without a TODO: ${line.trim()}`);
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
  test("release.yml publishes only the gated tarball, from a least-privilege job that installs nothing", () => {
    expect(releaseContract(read("release.yml"))).toEqual([]);
  });

  test("npm-publish.yml opens version PRs and never publishes, tags or releases", () => {
    expect(versionPrContract(read("npm-publish.yml"))).toEqual([]);
  });

  test("mutation: skips, installs, rebuilds, unverified or ungated publishes, moving checkouts and broad permissions are caught", () => {
    const release = read("release.yml");
    const mutate = (from: string | RegExp, to: string) => {
      const changed = release.replace(from, to);
      expect(changed).not.toBe(release);
      return releaseContract(changed);
    };
    const publishLine = /(\n(\s+)npm_cli publish "\$AMC_NPM_TARBALL")/;
    expect(mutate(publishLine, '\n$2if [ -z "$NODE_AUTH_TOKEN" ]; then\n$2  echo "Skipping npm publish"\n$2  exit 0\n$2fi$1'))
      .toContain('exit 0 under: if [ -z "$NODE_AUTH_TOKEN" ]; then');
    expect(mutate(publishLine, "\n$2npm install -g npm@latest$1")).toContain("release installs or builds: npm install");
    expect(mutate(publishLine, "\n$2npx --yes some-tool$1")).toContain("release installs or builds: npx");
    expect(mutate(publishLine, "\n$2pnpm install --frozen-lockfile && npm run build$1")).toContain("release installs or builds: pnpm install");
    expect(mutate('npm_cli publish "$AMC_NPM_TARBALL"', "npm_cli publish")).toContain("publish does not use the gated tarball with the pinned npm CLI");
    expect(mutate(/\n\s+node scripts\/release-record\.mjs verify tmp\/npm-release[^\n]*\n(\s+PACKAGE_NAME)/, "\n$1"))
      .toContain("publish does not check release-record.mjs verify first");
    expect(mutate(/(\n  release:\n[\s\S]*?ref: )\$\{\{ needs\.gate\.outputs\.commit \}\}/, "$1${{ env.AMC_RELEASE_TAG }}"))
      .toContain("release does not check out the gated commit");
    expect(mutate(/(\n  release:\n[\s\S]*?    steps:\n)/, "$1      - uses: actions/setup-node@v6 # TODO(P0-34 follow-up): pin actions/setup-node@v6 by full commit SHA\n"))
      .toContain("release uses actions/setup-node@v6");
    expect(mutate(/(\n  gate:\n[\s\S]*?permissions:\n)/, "$1      id-token: write\n")).toContain("gate has id-token");
    expect(mutate("permissions:\n  contents: read\n", "permissions:\n  contents: write\n")).toContain("workflow default permissions are not contents: read");
    expect(mutate(/NPM_CLI_INTEGRITY: sha512-\S+/, "NPM_CLI_INTEGRITY: latest")).toContain("the npm CLI is not pinned by exact version and integrity");
    expect(mutate(/ # TODO\(P0-34 follow-up\): pin softprops\S+ by full commit SHA/, "")).toContain("unpinned action without a TODO: uses: softprops/action-gh-release@v2");
    expect(mutate('--npm-tarball "$AMC_NPM_TARBALL" ', "")).toContain("the signed bundle does not embed the gated tarball, SBOM and licences");
    expect(mutate(/npm pack --ignore-scripts/, "npm pack --ignore-scripts --pack-destination tmp && npm pack --ignore-scripts")).toContain("gate does not pack exactly once");
    expect(mutate("--pubkey trust/amc-release-signing.pub", "").some(failure => failure.startsWith("release verify without the pinned key"))).toBe(true);
    expect(mutate(/environment: release\n(\s+timeout-minutes: 15)/, "environment: staging\n$1")).toContain("release job environment is staging");
    expect(mutate(/AMC_PACKED_INSTALL_TARBALL: [^\n]+/, 'AMC_PACKED_INSTALL_TARBALL: ""')).toContain("release gate does not run on the packed tarball");
    const publishing = read("npm-publish.yml").replace(/(version: node scripts\/release-prepare\.mjs[^\n]*\n)/, "$1          publish: npm run release\n");
    expect(versionPrContract(publishing)).toContain("release: changesets publish input");
  });
});

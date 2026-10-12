import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

/**
 * P0-34: release.yml is the only publisher. It publishes exactly the tarball that passed the gate, from a job that
 * installs and builds nothing and is the only one holding id-token: write; npm-publish.yml only opens version PRs.
 * P1-41: the weekly train. npm-publish.yml refreshes the version PR on a weekly schedule, release.yml checks the tag's
 * notes for banned claim words before anything is packed, and post-publish-verify.yml runs read-only checks after
 * every Release run with no write permission and no secret.
 */
type Step = { name?: string; id?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { environment?: string | { name: string }; "timeout-minutes"?: number; needs?: string | string[]; env?: Record<string, string>;
  if?: string; permissions?: Record<string, string>; outputs?: Record<string, string>; steps: Step[] };
type Workflow = { name?: string; on: Record<string, unknown>; env?: Record<string, string>; permissions?: Record<string, string>; jobs: Record<string, Job> };

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
/** Every `uses:` is pinned by a full commit SHA or carries the repository's TODO for Sid to pin it. */
const unpinnedActions = (text: string) => text.split("\n").filter(line => /^\s+(?:- )?uses: /.test(line))
  .filter(line => !/@[0-9a-f]{40}\b/.test(line) && !/# TODO\(P\d-\d+ follow-up\): pin \S+ by full commit SHA/.test(line))
  .map(line => `unpinned action without a TODO: ${line.trim()}`);
const sortedPermissions = (permissions?: Record<string, string>) => JSON.stringify(Object.entries(permissions ?? {}).sort());
/** Where each secret may be read: only from the env of these jobs' steps. */
const SECRET_JOBS: Record<string, string[]> = {
  NPM_TOKEN: ["release"], AMC_RELEASE_SIGNING_KEY: ["sign"], HOMEBREW_TAP_TOKEN: ["homebrew"],
  GITHUB_TOKEN: ["approve", "image", "image-tags", "github-release"]
};
const SIGNED_OR_PUBLISHED = ["approve", "sign", "release", "homebrew"];
const AFTER_APPROVAL = ["gate", "image", "image-tags", "sign", "release", "github-release", "homebrew"];
const needsOf = (job: Job) => (job.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs : [job.needs]);
function upstream(workflow: Workflow, id: string, seen = new Set<string>()): Set<string> {
  for (const need of needsOf(workflow.jobs[id] ?? { steps: [] })) if (!seen.has(need)) { seen.add(need); upstream(workflow, need, seen); }
  return seen;
}

/** Steps that print a secret-bound variable (single-quoted text is literal; stdin to --password-stdin is allowed). */
function secretPrints(id: string, step: Step, names: string[]): string[] {
  const failures: string[] = [];
  for (const line of (step.run ?? "").split("\n")) {
    if (/^\s*set\s+-[a-z]*x/.test(line)) failures.push(`${id}: set -x`);
    const unquoted = line.replace(/'[^']*'/g, "''");
    if (/\b(?:echo|printf|cat)\b/.test(unquoted) && !/--password-stdin\b/.test(unquoted)
      && names.some(name => new RegExp(`\\$\\{?${name}\\b`).test(unquoted))) failures.push(`${id}: prints a secret`);
  }
  return failures;
}

/** Triggers, secret placement and the approval gate. */
function exposureContract(workflow: Workflow): string[] {
  const failures: string[] = [];
  const on = workflow.on as Record<string, { tags?: string[] } | null>;
  if (JSON.stringify(Object.keys(on)) !== JSON.stringify(["push"]) || JSON.stringify(on.push) !== JSON.stringify({ tags: ["v*.*.*"] })) {
    failures.push(`triggers are not a v*.*.* tag push only: ${Object.keys(on).join(", ")}`);
  }
  if (workflow.env?.AMC_RELEASE_TAG !== "${{ github.ref_name }}") failures.push("the release tag is not the ref that triggered the run");
  if (JSON.stringify(workflow.env ?? {}).includes("secrets.")) failures.push("a secret is in the workflow env");
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if (JSON.stringify(job.env ?? {}).includes("secrets.")) failures.push(`${id}: a secret is in the job env`);
    for (const step of job.steps) {
      if (JSON.stringify(step.with ?? {}).includes("secrets.")) failures.push(`${id}: a secret is passed to ${step.uses} as an input`);
      if ((step.run ?? "").includes("secrets.")) failures.push(`${id}: a secret is interpolated into a script`);
      const bound = Object.entries(step.env ?? {}).filter(([, value]) => String(value).includes("secrets."));
      for (const [, value] of bound) {
        const name = /secrets\.([A-Z_]+)/.exec(String(value))?.[1] ?? "";
        if (!(SECRET_JOBS[name] ?? []).includes(id)) failures.push(`${id}: secret ${name} outside its step`);
      }
      failures.push(...secretPrints(id, step, [...bound.map(([key]) => key), ...(bound.length ? ["NODE_AUTH_TOKEN"] : [])]));
    }
  }
  for (const id of SIGNED_OR_PUBLISHED) {
    const job = workflow.jobs[id];
    if (!job) { failures.push(`no ${id} job`); continue; }
    if (environmentOf(job) !== "release") failures.push(`${id} does not run in the release environment`);
    if (id !== "homebrew" && (job.if || job.steps.some(step => step.if))) failures.push(`${id} has an if: that can skip it`);
  }
  for (const id of AFTER_APPROVAL) if (workflow.jobs[id] && !upstream(workflow, id).has("approve")) failures.push(`${id} does not wait for approval`);
  for (const id of ["release", "sign", "github-release"]) if (!upstream(workflow, id).has("gate")) failures.push(`${id} does not need the gate`);
  const approve = workflow.jobs.approve ? runsOf(workflow.jobs.approve).join("\n") : "";
  if (!/environments\/release/.test(approve) || !/required_reviewers/.test(approve) || !/deployment_branch_policy/.test(approve)) {
    failures.push("approve does not refuse an unprotected release environment");
  }
  return failures;
}
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
  const notes = all.search(/node scripts\/check-release-notes\.mjs "docs\/releases\/\$\{AMC_RELEASE_TAG#v\}\.md"/);
  if (notes < 0 || notes > all.search(/\bnpm pack\b/)) failures.push("gate does not check the tag's release notes for banned claim words before packing");
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
  if (id === "gate" && job.steps.find(step => step.uses?.startsWith("actions/checkout"))?.with?.ref !== "${{ github.sha }}") {
    failures.push("gate does not check out the commit the tag push names");
  }
  if (["approve", "gate", "npm-cli"].includes(id)) return failures;
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
  const ghRelease = workflow.jobs["github-release"] ? runsOf(workflow.jobs["github-release"]).join("\n") : "";
  if (!/shopt -s failglob/.test(ghRelease) || !/gh release create "\$AMC_RELEASE_TAG" --verify-tag/.test(ghRelease)) {
    failures.push("release assets may be silently missing");
  }
  for (const asset of ["tmp/signed/sbom.cdx.json", "tmp/signed/licenses.json"]) if (!ghRelease.includes(asset)) failures.push(`${asset} is not attached`);
  failures.push(...exposureContract(workflow));
  failures.push(...unpinnedActions(text));
  return failures;
}

type Triggers = { push?: unknown; schedule?: { cron?: string }[]; workflow_dispatch?: { inputs?: Record<string, unknown> } | null;
  workflow_run?: unknown };
const WEEKLY = /^\d{1,2} \d{1,2} \* \* [0-6]$/;
const weekly = (on: Triggers) => Array.isArray(on.schedule) && on.schedule.length === 1 && WEEKLY.test(on.schedule[0]?.cron ?? "");
const triggersOf = (workflow: Workflow) => Object.keys(workflow.on).sort().join(", ");

/** Version PRs only: weekly and on push to main; the token can open the PR and nothing else; nothing publishes. */
function versionPrContract(text: string): string[] {
  const failures: string[] = [];
  const workflow = parse(text);
  const on = workflow.on as Triggers;
  if (triggersOf(workflow) !== "push, schedule, workflow_dispatch") failures.push(`version PR triggers are ${triggersOf(workflow)}`);
  if (JSON.stringify(on.push) !== JSON.stringify({ branches: ["main"] })) failures.push("push is not main only");
  if (!weekly(on)) failures.push("no weekly schedule refreshes the version PR");
  if (on.workflow_dispatch?.inputs) failures.push("workflow_dispatch takes inputs");
  if (sortedPermissions(workflow.permissions) !== sortedPermissions({ contents: "read" })) failures.push("workflow default permissions are not contents: read");
  if (JSON.stringify(workflow.env ?? {}).includes("secrets.")) failures.push("a secret is in the workflow env");
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const expected: Record<string, string> = id === "version-pr" ? { contents: "write", "pull-requests": "write" } : { contents: "read" };
    if (sortedPermissions(job.permissions) !== sortedPermissions(expected)) failures.push(`${id} permissions are ${JSON.stringify(job.permissions ?? null)}`);
    if (JSON.stringify(job.env ?? {}).includes("secrets.")) failures.push(`${id}: a secret is in the job env`);
    for (const step of job.steps) {
      if (step.uses?.startsWith("changesets/action") && step.with && "publish" in step.with) failures.push(`${id}: changesets publish input`);
      if (/\bnpm publish\b|changeset publish|npm run release(?![:\w-])/.test(step.run ?? "")) failures.push(`${id}: publishes`);
      if (step.env && ("NODE_AUTH_TOKEN" in step.env || "NPM_TOKEN" in step.env)) failures.push(`${id}: npm credential in env`);
      if (JSON.stringify(step.with ?? {}).includes("secrets.") || (step.run ?? "").includes("secrets.")) failures.push(`${id}: a secret outside a step env`);
      if (JSON.stringify(step.env ?? {}).includes("secrets.") && id !== "version-pr") failures.push(`${id}: reads a secret`);
    }
  }
  const versionPr = workflow.jobs["version-pr"];
  if (!versionPr) failures.push("no version-pr job");
  else {
    const checkout = versionPr.steps.find(step => step.uses?.startsWith("actions/checkout"));
    if (checkout?.with?.["persist-credentials"] !== false) failures.push("version PR checkout persists the workflow token, so pushes would not run CI");
    const changesets = versionPr.steps.find(step => step.uses?.startsWith("changesets/action"));
    if (changesets?.with?.version !== "node scripts/release-prepare.mjs --version-only") failures.push("version PR is not release:prepare --version-only output");
  }
  if (/createRef|createRelease|git tag|git push/.test(text)) failures.push("creates or pushes a tag or a release");
  failures.push(...unpinnedActions(text));
  return failures;
}

/** Read-only after every Release run, by dispatch and weekly: no write permission, no secret, no expression in a script. */
function postPublishContract(text: string, releaseName: string | undefined): string[] {
  const failures: string[] = [];
  const workflow = parse(text);
  const on = workflow.on as Triggers;
  if (triggersOf(workflow) !== "schedule, workflow_dispatch, workflow_run") failures.push(`post-publish triggers are ${triggersOf(workflow)}`);
  if (!releaseName || JSON.stringify(on.workflow_run) !== JSON.stringify({ workflows: [releaseName], types: ["completed"] })) {
    failures.push("post-publish does not run when the Release workflow completes");
  }
  if (Object.keys(on.workflow_dispatch?.inputs ?? {}).join(", ") !== "version") failures.push("dispatch does not take exactly a version");
  if (!weekly(on)) failures.push("no weekly schedule records the distribution figure");
  if (sortedPermissions(workflow.permissions) !== sortedPermissions({ contents: "read" })) failures.push("workflow default permissions are not contents: read");
  if (text.includes("secrets.")) failures.push("post-publish reads a secret");
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if (Object.values(job.permissions ?? {}).some(level => level !== "read" && level !== "none")) failures.push(`${id} has a write permission`);
    for (const step of job.steps) if ((step.run ?? "").includes("${{")) failures.push(`${id}: an expression is interpolated into a script`);
    if (!job.steps.some(step => step.uses?.startsWith("actions/upload-artifact") && step.if === "always()")) failures.push(`${id} does not always upload its receipt`);
  }
  const verify = workflow.jobs.verify;
  if (!verify || !runsOf(verify).some(run => run.includes("node scripts/check-published-release.mjs"))) failures.push("no job runs check-published-release.mjs");
  for (const guard of ["github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_repository.full_name == github.repository"]) {
    if (!verify?.if?.includes(guard)) failures.push(`verify does not require ${guard}`);
  }
  const distribution = workflow.jobs.distribution;
  if (!distribution || !runsOf(distribution).some(run => run.includes("node scripts/distribution-metrics.mjs --write"))) {
    failures.push("no job records the distribution figure");
  }
  failures.push(...unpinnedActions(text));
  return failures;
}

/** CI checks every release notes file on every pull request and push. */
function ciNotesContract(text: string): string[] {
  const workflow = parse(text);
  const failures = triggersOf(workflow).includes("pull_request_target") ? ["ci.yml has a pull_request_target trigger"] : [];
  const step = workflow.jobs["build-test"]?.steps.find(candidate => candidate.run === "node scripts/check-release-notes.mjs docs/releases/*.md");
  if (!step || step.if) failures.push("CI does not check every release notes file for banned claim words");
  return failures;
}

describe("release workflow contract (P0-34)", () => {
  test("release.yml publishes only the gated tarball, from a least-privilege job that installs nothing", () => {
    expect(releaseContract(read("release.yml"))).toEqual([]);
  });

  test("npm-publish.yml opens version PRs and never publishes, tags or releases", () => {
    expect(versionPrContract(read("npm-publish.yml"))).toEqual([]);
  });

  test("P1-41: the weekly train's workflows hold the least privilege they need and check notes in CI", () => {
    expect(postPublishContract(read("post-publish-verify.yml"), parse(read("release.yml")).name)).toEqual([]);
    expect(ciNotesContract(read("ci.yml"))).toEqual([]);
  });

  test("P1-41 mutation: unchecked notes, publishing or broad version PRs, and writable or secret post-publish runs are caught", () => {
    const mutated = (name: string, contract: (text: string) => string[]) => (from: string | RegExp, to: string) => {
      const text = read(name);
      const changed = text.replace(from, to);
      expect(changed).not.toBe(text);
      return contract(changed);
    };
    const release = mutated("release.yml", releaseContract);
    expect(release(/\n\s+- name: Check the release notes[^\n]*\n\s+run: [^\n]*\n/, "\n"))
      .toContain("gate does not check the tag's release notes for banned claim words before packing");

    const versionPr = mutated("npm-publish.yml", versionPrContract);
    expect(versionPr(/\n  schedule:\n[^\n]*\n/, "\n")).toEqual(expect.arrayContaining(["no weekly schedule refreshes the version PR"]));
    expect(versionPr(/(\n  version-pr:\n[\s\S]*?permissions:\n)/, "$1      id-token: write\n")).toEqual(expect.arrayContaining([
      expect.stringMatching(/^version-pr permissions are /)]));
    expect(versionPr(/(\n  test-build:\n[\s\S]*?permissions:\n\s+contents: )read/, "$1write")).toEqual(expect.arrayContaining([
      expect.stringMatching(/^test-build permissions are /)]));
    expect(versionPr(/(\n  version-pr:\n[\s\S]*?)persist-credentials: false/, "$1persist-credentials: true"))
      .toContain("version PR checkout persists the workflow token, so pushes would not run CI");
    expect(versionPr("workflow_dispatch:\n", "workflow_dispatch:\n    inputs:\n      version: { type: string }\n"))
      .toContain("workflow_dispatch takes inputs");
    expect(versionPr(/(version: node scripts\/release-prepare\.mjs[^\n]*\n)/, "$1          publish: npm run release\n"))
      .toContain("version-pr: changesets publish input");

    const postPublish = mutated("post-publish-verify.yml", text => postPublishContract(text, parse(read("release.yml")).name));
    expect(postPublish(/\npermissions:\n  contents: read\n/, "\npermissions:\n  contents: write\n"))
      .toContain("workflow default permissions are not contents: read");
    expect(postPublish(/(\n  verify:\n[\s\S]*?permissions:\n)/, "$1      actions: write\n")).toContain("verify has a write permission");
    expect(postPublish(/(\n  distribution:\n[\s\S]*?    steps:\n)/, "$1      - run: echo hi\n        env:\n          T: ${{ secrets.NPM_TOKEN }}\n"))
      .toContain("post-publish reads a secret");
    expect(postPublish(/ && github\.event\.workflow_run\.event == 'push'/, "")).toContain("verify does not require github.event.workflow_run.event == 'push'");
    expect(postPublish("on:\n", "on:\n  pull_request_target:\n")).toContain("post-publish triggers are pull_request_target, schedule, workflow_dispatch, workflow_run");
    expect(postPublish(/node scripts\/check-published-release\.mjs "\$VERSION"/, 'node scripts/check-published-release.mjs "${{ inputs.version }}"'))
      .toContain("verify: an expression is interpolated into a script");

    const ci = mutated("ci.yml", ciNotesContract);
    expect(ci(/\n\s+- name: Release notes claim words\n[^\n]*\n/, "\n")).toContain("CI does not check every release notes file for banned claim words");
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
    expect(mutate(/ # TODO\(P0-34 follow-up\): pin docker\/setup-buildx-action\S+ by full commit SHA/, ""))
      .toContain("unpinned action without a TODO: uses: docker/setup-buildx-action@v4");
    expect(mutate('--npm-tarball "$AMC_NPM_TARBALL" ', "")).toContain("the signed bundle does not embed the gated tarball, SBOM and licences");
    expect(mutate(/npm pack --ignore-scripts/, "npm pack --ignore-scripts --pack-destination tmp && npm pack --ignore-scripts")).toContain("gate does not pack exactly once");
    expect(mutate("--pubkey trust/amc-release-signing.pub", "").some(failure => failure.startsWith("release verify without the pinned key"))).toBe(true);
    expect(mutate(/environment: release\n(\s+timeout-minutes: 15)/, "environment: staging\n$1")).toContain("release job environment is staging");
    expect(mutate(/AMC_PACKED_INSTALL_TARBALL: [^\n]+/, 'AMC_PACKED_INSTALL_TARBALL: ""')).toContain("release gate does not run on the packed tarball");
    expect(mutate(/(\n  release:\n[\s\S]*?    timeout-minutes: 15\n    env:\n)/, "$1      LEAKED: ${{ secrets.NPM_TOKEN }}\n"))
      .toContain("release: a secret is in the job env");
    expect(mutate(/(GHCR_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\})/, "$1\n          SIGNING: ${{ secrets.AMC_RELEASE_SIGNING_KEY }}"))
      .toContain("image: secret AMC_RELEASE_SIGNING_KEY outside its step");
    expect(mutate(publishLine, '\n$2echo "token $NPM_TOKEN"$1')).toContain("release: prints a secret");
    expect(mutate(publishLine, "\n$2set -x$1")).toContain("release: set -x");
    expect(mutate("on:\n  push:\n", "on:\n  pull_request_target:\n  push:\n")).toContain("triggers are not a v*.*.* tag push only: pull_request_target, push");
    expect(mutate("on:\n  push:\n", "on:\n  workflow_dispatch:\n    inputs:\n      ref: { type: string }\n  push:\n"))
      .toContain("triggers are not a v*.*.* tag push only: workflow_dispatch, push");
    expect(mutate(/\n {4}environment: release\n( {4}timeout-minutes: 15)/, "\n$1")).toContain("release does not run in the release environment");
    expect(mutate("    needs: [approve, gate, npm-cli, sign]\n", "    needs: [npm-cli]\n")).toEqual(expect.arrayContaining([
      "release does not wait for approval", "release does not need the gate"]));
    expect(mutate(/(\n  release:\n)/, "$1    if: github.run_attempt == 1\n")).toContain("release has an if: that can skip it");
    expect(mutate(/required_reviewers/g, "reviewers")).toContain("approve does not refuse an unprotected release environment");
    expect(mutate(/ref: \$\{\{ github\.sha \}\}/, "ref: refs/heads/main")).toContain("gate does not check out the commit the tag push names");
  });
});

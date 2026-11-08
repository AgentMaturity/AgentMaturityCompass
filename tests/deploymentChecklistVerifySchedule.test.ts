import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import YAML from "yaml";

/**
 * LIVE-INTEGRITY-06 (skeptic): `amc verify all` verifies the current directory, and the Studio image's working directory
 * is /workspace, not the workspace. The checklist's scheduled commands must run where the image, the raw manifests and
 * the chart keep the workspace, or every scheduled run checks an empty directory.
 * B1 (final review): a scheduled run has no terminal for a remembered passphrase, so each scheduled command hands amc the
 * vault passphrase (the container's AMC_VAULT_PASSPHRASE_FILE read into AMC_VAULT_PASSPHRASE, or a private file on a plain
 * host); without it every run reports its payloads as not evaluated and exits 1.
 */
const checklist = readFileSync("docs/DEPLOYMENT_CHECKLIST.md", "utf8");
const section = checklist.slice(checklist.indexOf("### Scheduled verification"), checklist.indexOf("#### Open sessions"));
const FROM_SECRET = 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc verify all --json --expect-monitor';

test("the scheduled verification commands run in the deployment's workspace directory", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const workspace = /ENV AMC_WORKSPACE_DIR=(\S+)/.exec(dockerfile.slice(dockerfile.indexOf("AS studio")))?.[1];
  expect(workspace).toBe("/data/amc");
  expect(readFileSync("deploy/helm/amc/values.yaml", "utf8")).toMatch(/^workspace:\n {2}mountPath: \/data\/amc$/m);
  expect(readFileSync("deploy/k8s/configmap.yaml", "utf8")).toContain("AMC_WORKSPACE_DIR: /data/amc");

  expect(section).toContain(`docker exec -w /data/amc amc-studio sh -c '${FROM_SECRET} <monitor sha256>'`);
  expect(section).not.toMatch(/docker exec amc-studio amc verify|"--",\s*"amc", "verify"/);
  expect(section).not.toContain("The container's working directory is the workspace");
});

test("every scheduled command hands amc the vault passphrase; the CronJob's command parses to it (B1)", () => {
  const cronLines = section.split("\n").filter((line) => /^\s*\*\/30 /.test(line));
  expect(cronLines).toHaveLength(2);
  for (const line of cronLines) expect(line).toMatch(/[ ']AMC_VAULT_PASSPHRASE(_FILE)?=/);
  expect(section).toContain("cd <workspace> && AMC_VAULT_PASSPHRASE_FILE=<passphrase file> amc verify all --json --expect-monitor");
  expect(section).toContain("a file the cron user owns, mode 0600 or 0400");

  const start = section.indexOf("```yaml") + "```yaml".length;
  const block = section.slice(start, section.indexOf("```", start)).split("\n").map((line) => line.slice(2)).join("\n");
  const cronJob = YAML.parseAllDocuments(block)[0]!.toJS() as {
    spec: { jobTemplate: { spec: { template: { spec: { containers: Array<{ command: string[] }> } } } } } };
  expect(cronJob.spec.jobTemplate.spec.template.spec.containers[0]!.command.slice(-3))
    .toEqual(["sh", "-c", `cd /data/amc && ${FROM_SECRET} <monitor sha256>`]);

  // What a run without the passphrase prints is described, and it is not tampering.
  expect(section).toContain("`ledger-hash-chain` is `SKIP` with `<n> payloads not evaluated: the key that opens them is out of reach in this process (vault locked: …)`");
  expect(section).toMatch(/INCOMPLETE \(a critical check was skipped, such as a ledger check whose payloads were not evaluated/);
});

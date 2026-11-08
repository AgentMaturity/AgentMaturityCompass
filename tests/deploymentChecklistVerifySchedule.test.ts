import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * LIVE-INTEGRITY-06 (skeptic): `amc verify all` verifies the current directory, and the Studio image's working directory
 * is /workspace, not the workspace. The checklist's scheduled commands must run where the image, the raw manifests and
 * the chart keep the workspace, or every scheduled run checks an empty directory.
 */
test("the scheduled verification commands run in the deployment's workspace directory", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const workspace = /ENV AMC_WORKSPACE_DIR=(\S+)/.exec(dockerfile.slice(dockerfile.indexOf("AS studio")))?.[1];
  expect(workspace).toBe("/data/amc");
  expect(readFileSync("deploy/helm/amc/values.yaml", "utf8")).toMatch(/^workspace:\n {2}mountPath: \/data\/amc$/m);
  expect(readFileSync("deploy/k8s/configmap.yaml", "utf8")).toContain("AMC_WORKSPACE_DIR: /data/amc");

  const checklist = readFileSync("docs/DEPLOYMENT_CHECKLIST.md", "utf8");
  const section = checklist.slice(checklist.indexOf("### Scheduled verification"), checklist.indexOf("#### Open sessions"));
  expect(section).toContain("docker exec -w /data/amc amc-studio amc verify all --json --expect-monitor");
  expect(section).toContain("\"cd /data/amc && amc verify all --json --expect-monitor");
  expect(section).not.toMatch(/docker exec amc-studio amc verify|"--",\s*"amc", "verify"/);
  expect(section).not.toContain("The container's working directory is the workspace");
});

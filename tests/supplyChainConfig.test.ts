import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

interface Step {
  id?: string;
  run?: string;
  if?: string;
  "continue-on-error"?: boolean;
  "working-directory"?: string;
}

const workspace = YAML.parse(readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8")) as {
  minimumReleaseAge?: number;
  minimumReleaseAgeExclude?: string[];
};
const workflow = YAML.parse(readFileSync(new URL("../.github/workflows/nightly-compatibility-matrix.yml", import.meta.url), "utf8")) as {
  on: { schedule?: { cron: string }[] };
  jobs: Record<string, { steps: Step[]; if?: string; "continue-on-error"?: boolean }>;
};
const auditJob = workflow.jobs["dependency-audit"];
const steps = auditJob?.steps ?? [];

describe("dependency supply-chain configuration", () => {
  test("delays new registry versions by at least two days without bypasses", () => {
    expect(typeof workspace.minimumReleaseAge).toBe("number");
    expect(Number.isInteger(workspace.minimumReleaseAge)).toBe(true);
    expect(workspace.minimumReleaseAge).toBeGreaterThanOrEqual(2880);
    expect(workspace.minimumReleaseAgeExclude ?? []).toEqual([]);
  });

  test("runs the existing production audit on the nightly schedule and surfaces failures", () => {
    expect(workflow.on.schedule?.length).toBeGreaterThan(0);
    expect(auditJob).toBeDefined();
    expect(auditJob?.if).toBeUndefined();
    expect(auditJob?.["continue-on-error"]).not.toBe(true);
    const audit = steps.find(step => step.run === "npm run audit:runtime");
    expect(audit).toBeDefined();
    expect(audit?.if).toBeUndefined();
    expect(audit?.["continue-on-error"]).not.toBe(true);
  });

  test("builds and installs the packed production artifact outside the checkout before auditing signatures", () => {
    const install = steps.find(step => step.id === "packed-install");
    expect(install?.run).toContain('audit_dir="${RUNNER_TEMP}/amc-supply-chain"');
    expect(install?.run).toContain('npm pack --ignore-scripts --pack-destination "$audit_dir" --json');
    expect(install?.run).toContain('npm install --prefix "$audit_dir/consumer" --ignore-scripts --omit=dev --no-audit --no-fund "$audit_dir/$tarball"');
    expect(steps.findIndex(step => step.run === "npm run build")).toBeGreaterThanOrEqual(0);
    expect(steps.findIndex(step => step.run === "npm run build")).toBeLessThan(steps.indexOf(install!));
    expect(install?.["continue-on-error"]).not.toBe(true);
  });

  test("verifies registry signatures even after an advisory failure, without suppressing failures", () => {
    const signatures = steps.find(step => step.run === "npm audit signatures");
    expect(signatures).toBeDefined();
    expect(signatures?.["working-directory"]).toBe("${{ runner.temp }}/amc-supply-chain/consumer");
    expect(signatures?.if).toBe("${{ !cancelled() && steps.packed-install.outcome == 'success' }}");
    expect(signatures?.["continue-on-error"]).not.toBe(true);
    expect(steps.indexOf(signatures!)).toBeGreaterThan(steps.findIndex(step => step.run === "npm run audit:runtime"));
  });
});

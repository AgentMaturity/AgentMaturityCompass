import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  submitFPReport,
  listFPReports,
  getFPReport,
  resolveFPReport,
  computeFPCostSummary,
  resetFPTrackerState
} from "../../src/assurance/falsePositiveTracker.js";
import {
  createLabExperiment,
  listLabExperiments,
  getLabExperiment,
  startLabExperiment,
  completeLabExperiment,
  resetLabState
} from "../../src/lab/cognitionLab.js";

/**
 * Both trackers kept everything in module-level arrays, so each command handed
 * back an identifier that the next command could never resolve:
 *
 *   $ amc fp-submit ...      -> FP report submitted: fp_b94a2b65-e40
 *   $ amc fp-list            -> No false positive reports found.
 *   $ amc lab-create ...     -> Experiment created: lab_9f0af681-598
 *   $ amc lab-list           -> No lab experiments found.
 *
 * reset*State() between assertions stands in for a second CLI invocation.
 */
describe("false-positive reports survive the process", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-fp-"));
    resetFPTrackerState();
  });
  afterEach(() => {
    resetFPTrackerState();
    rmSync(workspace, { recursive: true, force: true });
  });

  const submit = () =>
    submitFPReport(
      {
        scenarioId: "s1",
        packId: "testpack",
        assuranceRunId: "run-1",
        response: "",
        justification: "benign pattern",
        reportedBy: "cli-user"
      },
      workspace
    );

  it("is findable by the id it handed back", () => {
    const report = submit();
    resetFPTrackerState();
    expect(getFPReport(report.reportId, workspace)?.reportId).toBe(report.reportId);
    expect(listFPReports(undefined, workspace).map((r) => r.reportId)).toContain(report.reportId);
  });

  it("records a resolution a later process can see", () => {
    const report = submit();
    resetFPTrackerState();
    expect(resolveFPReport(report.reportId, { status: "confirmed", reason: "agreed" }, workspace)).not.toBeNull();
    resetFPTrackerState();
    expect(getFPReport(report.reportId, workspace)?.status).toBe("confirmed");
    expect(listFPReports({ status: "open" }, workspace)).toHaveLength(0);
  });

  it("counts persisted reports in the cost summary", () => {
    submit();
    resetFPTrackerState();
    const summaries = computeFPCostSummary(undefined, workspace);
    expect(summaries.some((s) => s.packId === "testpack")).toBe(true);
  });

  it("still works without a workspace, for library callers", () => {
    const report = submitFPReport({
      scenarioId: "s",
      packId: "p",
      assuranceRunId: "r",
      response: "",
      justification: "j",
      reportedBy: "u"
    });
    expect(listFPReports().map((r) => r.reportId)).toContain(report.reportId);
  });
});

describe("lab experiments survive the process", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-lab-"));
    resetLabState();
  });
  afterEach(() => {
    resetLabState();
    rmSync(workspace, { recursive: true, force: true });
  });

  const create = () =>
    createLabExperiment(
      { kind: "custom", name: "exp1", description: "", modelId: "m1" },
      workspace
    );

  it("is resolvable by the id it handed back", () => {
    const experiment = create();
    resetLabState();
    expect(getLabExperiment(experiment.experimentId, workspace)?.name).toBe("exp1");
    expect(listLabExperiments(undefined, workspace).map((e) => e.experimentId)).toContain(
      experiment.experimentId
    );
  });

  it("carries status transitions across invocations", () => {
    const experiment = create();
    resetLabState();
    expect(startLabExperiment(experiment.experimentId, workspace)?.status).toBe("running");
    resetLabState();
    expect(getLabExperiment(experiment.experimentId, workspace)?.status).toBe("running");
    expect(completeLabExperiment(experiment.experimentId, workspace)?.status).toBe("completed");
    resetLabState();
    expect(getLabExperiment(experiment.experimentId, workspace)?.status).toBe("completed");
  });

  it("rejects a transition that is invalid from the persisted status", () => {
    const experiment = create();
    resetLabState();
    // Cannot complete an experiment that was never started.
    expect(completeLabExperiment(experiment.experimentId, workspace)).toBeNull();
  });

  it("still works without a workspace, for library callers", () => {
    const experiment = createLabExperiment({
      kind: "custom",
      name: "x",
      description: "",
      modelId: "m"
    });
    expect(listLabExperiments().map((e) => e.experimentId)).toContain(experiment.experimentId);
  });
});

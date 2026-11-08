import { describe, expect, it } from "vitest";
import { STUDIO_HTTP_PROBE } from "../scripts/lib/studio-http-probe.mjs";
import { dockerfileStudioHealthcheck, read } from "./helpers/deployPackFixtures.js";

describe("container smoke uses the shipped probe (LIVE-DEPLOY-03)", () => {
  it("exports exactly the Dockerfile's HEALTHCHECK script", () => {
    expect(dockerfileStudioHealthcheck(read("Dockerfile")).cmd?.[2]).toBe(STUDIO_HTTP_PROBE);
  });

  it("runs Studio and its cold verifiers with the shipped layout (LIVE-DEPLOY-16)", () => {
    // A volume nested in a tmpfs home is created root:root 0755 and Studio refuses it; CI never saw it because the smoke
    // gave Studio a tmpfs home and no state volume. The runner target mounts nothing beneath its home and keeps one.
    const smoke = read("scripts/container-smoke.mjs");
    const sandbox = /^const sandbox = (\[.*\]);$/m.exec(smoke)?.[1] ?? "";
    expect(sandbox).toContain("--read-only");
    expect(sandbox).not.toContain("/home/amc");
    expect(smoke.match(/"--tmpfs", "\/home\/amc/g) ?? []).toHaveLength(1);
    expect(/^const runnerSandbox = .*"--tmpfs", "\/home\/amc:/m.test(smoke)).toBe(true);
    expect(/function studio\(\)[\s\S]*?\n}\n/.exec(smoke)?.[0]).not.toContain("runnerSandbox");
    for (const part of ["dst=/home/amc/.config/amc/state", "dst=/workspace", "\"AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints\"",
      "\"--stop-timeout\", \"40\""]) expect(smoke).toContain(part);
    // A signed control and the anti-rollback marks must survive the restart.
    expect(smoke).toContain("\"firewall\", \"enable\", \"--mode\", \"observe\"");
    expect(smoke).toContain("/home/amc/.config/amc/state/high-water.json");
  });

  it("records labelled container resource samples in the receipt (LIVE-DEPLOY-14)", () => {
    const smoke = read("scripts/container-smoke.mjs");
    expect(smoke).toMatch(/resourceSamples: \[\]/);
    for (const label of ["after readiness", "after the stub turn", "during the firewall publish"]) expect(smoke).toContain(`"${label}"`);
  });

  it("polls readiness with the HTTP probe inside the container, not the CLI", () => {
    const smoke = read("scripts/container-smoke.mjs");
    expect(smoke).not.toContain("\"studio\", \"healthcheck\"");
    expect(smoke).toContain("\"node\", \"-e\", STUDIO_HTTP_PROBE");
  });
});

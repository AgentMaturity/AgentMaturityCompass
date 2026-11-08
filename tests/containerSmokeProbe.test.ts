import { describe, expect, it } from "vitest";
import { STUDIO_HTTP_PROBE } from "../scripts/lib/studio-http-probe.mjs";
import { dockerfileStudioHealthcheck, read } from "./helpers/deployPackFixtures.js";

describe("container smoke uses the shipped probe (LIVE-DEPLOY-03)", () => {
  it("exports exactly the Dockerfile's HEALTHCHECK script", () => {
    expect(dockerfileStudioHealthcheck(read("Dockerfile")).cmd?.[2]).toBe(STUDIO_HTTP_PROBE);
  });

  it("polls readiness with the HTTP probe inside the container, not the CLI", () => {
    const smoke = read("scripts/container-smoke.mjs");
    expect(smoke).not.toContain("\"studio\", \"healthcheck\"");
    expect(smoke).toContain("\"node\", \"-e\", STUDIO_HTTP_PROBE");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";

const WORKFLOW_DIR = ".github/workflows";

function readWorkflow(name: string): any {
  return YAML.parse(readFileSync(join(WORKFLOW_DIR, name), "utf8"));
}

function actionReferences(): string[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .flatMap((name) => {
      const workflow = readWorkflow(name);
      return Object.values(workflow.jobs ?? {}).flatMap((job: any) =>
        (job.steps ?? [])
          .map((step: any) => step.uses)
          .filter((uses: unknown): uses is string => typeof uses === "string"),
      );
    });
}

describe("AMC-1467 Docker action Node 24 migration", () => {
  test("uses only the native Node 24 Docker action majors", () => {
    const references = actionReferences();
    const buildx = references.filter((uses) => uses.startsWith("docker/setup-buildx-action@"));
    const metadata = references.filter((uses) => uses.startsWith("docker/metadata-action@"));

    expect(buildx).toEqual([
      "docker/setup-buildx-action@v4",
      "docker/setup-buildx-action@v4",
    ]);
    expect(metadata).toEqual(["docker/metadata-action@v6"]);
    expect(references).not.toContain("docker/setup-buildx-action@v3");
    expect(references).not.toContain("docker/metadata-action@v5");
  });

  test("preserves the Docker runner metadata and publication contract", () => {
    const workflow = readWorkflow("docker-runner.yml");
    const steps = workflow.jobs["build-and-push"].steps as any[];
    const buildx = steps.find((step) => step.name === "Set up Docker Buildx");
    const metadata = steps.find((step) => step.name === "Docker metadata");
    const publish = steps.find((step) => step.name === "Build and push");

    expect(buildx).toMatchObject({ uses: "docker/setup-buildx-action@v4" });
    expect(buildx.with).toBeUndefined();
    expect(metadata).toMatchObject({
      id: "meta",
      uses: "docker/metadata-action@v6",
      with: {
        images: "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}",
      },
    });
    expect(metadata.with.tags).toContain("type=sha,prefix=");
    expect(metadata.with.tags).toContain("type=raw,value=latest,enable={{is_default_branch}}");
    expect(publish).toMatchObject({
      uses: "docker/build-push-action@v7",
      with: {
        context: ".",
        file: "Dockerfile.runner",
        tags: "${{ steps.meta.outputs.tags }}",
        labels: "${{ steps.meta.outputs.labels }}",
      },
    });
  });

  test("records the upstream runtime and no-product-change boundary", () => {
    const review = readFileSync(
      "docs/source-reviews/AMC-1467-docker-actions-node24.md",
      "utf8",
    );

    for (const required of [
      "docker/metadata-action@v6",
      "docker/setup-buildx-action@v4",
      "runs.using: node24",
      "v2.327.1",
      "No-bloat boundary",
      "No AMC runtime Node requirement changed",
    ]) {
      expect(review).toContain(required);
    }
  });
});

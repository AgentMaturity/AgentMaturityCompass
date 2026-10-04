import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readYamlDocs } from "../scripts/deploy/validate-assets.mjs";
import { readYaml, root } from "./helpers/deployPackFixtures.js";

describe("raw k8s manifests: bootstrap secret contract", () => {
  it("raw k8s secret example matches the secret the deployment mounts", () => {
    const [example] = readYamlDocs(resolve(root, "deploy/k8s/secret.example.yaml"));
    const [deployment] = readYamlDocs(resolve(root, "deploy/k8s/deployment.yaml"));
    const secretVolume = deployment.spec.template.spec.volumes.find((v: { secret?: unknown }) => v.secret);
    expect(secretVolume.secret.secretName).toBe(example.metadata.name);
    for (const item of secretVolume.secret.items) {
      expect(Object.keys(example.stringData), `missing key ${item.key}`).toContain(item.key);
    }
    for (const value of Object.values(example.stringData)) {
      expect(String(value)).toMatch(/^REPLACE_WITH_/);
    }
    const kustomization = readYaml("deploy/k8s/kustomization.yaml");
    expect(kustomization.resources).not.toContain("secret.yaml");
    expect(kustomization.resources).not.toContain("secret.example.yaml");
  });
});

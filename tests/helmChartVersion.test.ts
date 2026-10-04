import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { checkVersions } from "../scripts/deploy/validate-assets.mjs";
import { verifyPublishedInstallerVersion } from "../scripts/lib/published-installer-version.mjs";
import { chartDir, mergeValues, read, readYaml, root, zeroDigest } from "./helpers/deployPackFixtures.js";

// helm is not installed on the authoring host: these assertions read the
// templates as text and the schema with ajv. They do not prove Helm rendering;
// scripts/deploy/deploy-pack-check.mjs renders where helm exists.
const IMAGE_EXPRESSION =
  'image: "{{- if .Values.image.digest }}{{ .Values.image.repository }}@{{ .Values.image.digest }}{{- else }}{{ .Values.image.repository }}:{{ .Values.image.tag }}{{- end }}"';

describe("helm chart version and image pinning", () => {
  it("Chart.yaml appVersion equals the package.json version", () => {
    const packageVersion = JSON.parse(read("package.json")).version;
    expect(readYaml(`${chartDir}/Chart.yaml`).appVersion).toBe(packageVersion);
    expect(checkVersions(root).errors).toEqual([]);
  });

  it("quickstart AMC_VERSION equals the published installer version", () => {
    const pinned = /^ARG AMC_VERSION=(\S+)$/m.exec(read("docker/Dockerfile.quickstart"))?.[1];
    expect(pinned).toBe(verifyPublishedInstallerVersion(root).version);
  });

  it("digest renders repository@digest in every chart container, tag otherwise", () => {
    const values = readYaml(`${chartDir}/values.yaml`);
    expect(values.image).toMatchObject({ digest: "", requireDigest: false });
    const deployment = read(`${chartDir}/templates/deployment.yaml`);
    const imageLines = deployment.split("\n").filter((line) => /^\s+image:/.test(line)).map((line) => line.trim());
    expect(imageLines.length).toBe(2);
    for (const line of imageLines) expect(line).toBe(IMAGE_EXPRESSION);
    const testPod = read(`${chartDir}/templates/tests/governed-turn.yaml`);
    expect(testPod).toContain(IMAGE_EXPRESSION);
  });

  it("requireDigest without digest refuses (template fail and schema)", () => {
    expect(read(`${chartDir}/templates/deployment.yaml`)).toMatch(
      /\{\{- if and \.Values\.image\.requireDigest \(not \.Values\.image\.digest\) \}\}\n\{\{- fail "image\.requireDigest/
    );
    const validate = new Ajv({ allErrors: true }).compile(JSON.parse(read(`${chartDir}/values.schema.json`)));
    const defaults = readYaml(`${chartDir}/values.yaml`);
    const withImage = (image: object) => mergeValues(defaults, { image });
    expect(validate(defaults)).toBe(true);
    expect(validate(withImage({ requireDigest: true }))).toBe(false);
    expect(validate(withImage({ requireDigest: true, digest: zeroDigest }))).toBe(true);
    expect(validate(withImage({ digest: "sha256:abc" }))).toBe(false);
    expect(validate(withImage({ digest: "latest" }))).toBe(false);
  });

  it("Terraform and Pulumi pass an optional digest through to the chart", () => {
    const variables = read("deploy/terraform/helm-release/variables.tf");
    expect(variables).toMatch(/variable "image_digest" \{[^]*?default\s+= ""[^]*?\^\(sha256:\[a-f0-9\]\{64\}\)\?\$/);
    expect(read("deploy/terraform/helm-release/main.tf")).toMatch(/digest\s+= var\.image_digest/);
    const pulumi = read("deploy/pulumi/helm-release/index.ts");
    expect(pulumi).toContain('config.get("imageDigest") ?? ""');
    expect(pulumi).toContain("digest: imageDigest");
    expect(readYaml("deploy/pulumi/helm-release/Pulumi.yaml").config.imageDigest.default).toBe("");
  });
});

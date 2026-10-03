import { Ajv } from "ajv";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findSecretLiterals, findSecretLiteralsInValues, readYamlDocs } from "../scripts/deploy/validate-assets.mjs";
import { chartDir, mergeValues, read, readYaml, root } from "./helpers/deployPackFixtures.js";

// Static template assertions: helm is absent on the authoring host, so Helm's
// own rendering of these guards is not exercised here (see deploy-pack-check.mjs).
const KEYS = ["vaultPassphrase", "ownerUsername", "ownerPassword", "notaryPassphrase", "notaryAuthSecret"];

describe("helm chart bootstrap secret", () => {
  it("default render must contain no Secret: secret.yaml is wholly guarded by bootstrap.createSecret (default false)", () => {
    const template = read(`${chartDir}/templates/secret.yaml`);
    const lines = template.trimEnd().split("\n");
    expect(lines[0]).toBe("{{- if .Values.bootstrap.createSecret }}");
    expect(lines.at(-1)).toBe("{{- end }}");
    expect(template.match(/\{\{-? end \}\}/g)).toHaveLength(1);
    expect(template.match(/\{\{-? if /g)).toHaveLength(1);
    expect(readYaml(`${chartDir}/values.yaml`).bootstrap.createSecret).toBe(false);
    expect(template).toContain("helm.sh/resource-policy: keep");
  });

  it("createSecret without values must refuse: every key is required and refuses change-me", () => {
    const template = read(`${chartDir}/templates/secret.yaml`);
    for (const key of KEYS) {
      expect(template).toContain(`{{ include "amc.bootstrapValue" (list "${key}" .Values.bootstrap.values.${key}) }}`);
    }
    // No bootstrap value reaches the Secret except through the refusing helper.
    for (const line of template.split("\n").filter((l) => l.includes(".Values.bootstrap.values."))) {
      expect(line).toContain('include "amc.bootstrapValue"');
    }
    const helpers = read(`${chartDir}/templates/_helpers.tpl`);
    const helper = /\{\{- define "amc\.bootstrapValue" -\}\}([\s\S]*?\{\{- \$value \| quote -\}\})/.exec(helpers)?.[1] ?? "";
    expect(helper).toMatch(/\$value := toString \(required \(printf "bootstrap\.values\.%s is required when bootstrap\.createSecret=true" \$name\) \(index \. 1\)\)/);
    expect(helper).toMatch(/\{\{- if hasPrefix "change-me" \(lower \$value\) -\}\}\n\{\{- fail /);
    const values = readYaml(`${chartDir}/values.yaml`).bootstrap.values;
    expect(Object.keys(values).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(values[key]).toBe("");
  });

  it("schema rejects change-me bootstrap values and accepts the shipped values files", () => {
    const validate = new Ajv({ allErrors: true }).compile(JSON.parse(read(`${chartDir}/values.schema.json`)));
    const defaults = readYaml(`${chartDir}/values.yaml`);
    expect(validate(defaults)).toBe(true);
    for (const key of KEYS) {
      for (const bad of ["change-me-x", "CHANGE-ME", "changeme"]) {
        expect(validate(mergeValues(defaults, { bootstrap: { createSecret: true, values: { [key]: bad } } }))).toBe(false);
      }
    }
    expect(validate(mergeValues(defaults, { bootstrap: { createSecret: true, values: { vaultPassphrase: "a-real-long-value" } } }))).toBe(true);
    for (const name of readdirSync(resolve(root, chartDir, "examples"))) {
      const [example] = readYamlDocs(resolve(root, chartDir, "examples", name));
      expect(validate(mergeValues(defaults, example)), name).toBe(true);
    }
  });

  it("finds no literal secret in Helm values, templates, k8s manifests or docker assets", () => {
    expect(findSecretLiterals(root)).toEqual([]);
  });

  it("flags a literal passphrase injected into a values default", () => {
    const values = { env: { AMC_VAULT_PASSPHRASE: "hunter2" }, bootstrap: { vaultPassphrase: "x" } };
    expect(findSecretLiteralsInValues(values, "values.yaml")).toHaveLength(2);
    const refs = { notary: { passphraseSecret: { name: "amc-bootstrap", key: "notaryPassphrase" } }, tls: [{ secretName: "amc-tls" }] };
    expect(findSecretLiteralsInValues(refs, "values.yaml")).toEqual([]);
  });

  it("every Helm example values file parses (no duplicate keys)", () => {
    for (const name of ["values-internal-only.yaml", "values-ingress-tls.yaml", "values-persistent-bootstrap.yaml"]) {
      expect(() => readYamlDocs(resolve(root, chartDir, "examples", name))).not.toThrow();
    }
  });
});

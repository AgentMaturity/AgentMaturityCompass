import { Ajv } from "ajv";
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chartDir, mergeValues, read, readYaml, root } from "./helpers/deployPackFixtures.js";

// P2-06 D5: the chart selects a P2-08 KeyProvider and switches on P2-09 ledger encryption. Static template assertions
// and the schema through ajv (helm is not installed on every test host; the D5 receipt records helm's own renders), and
// the chart's start step run against a real workspace with the built CLI.
const values = readYaml(`${chartDir}/values.yaml`);
const schema = () => new Ajv({ allErrors: true }).compile(JSON.parse(read(`${chartDir}/values.schema.json`)));
const deployment = read(`${chartDir}/templates/deployment.yaml`);
const ENCRYPTION_GUARD = "{{- if .Values.ledgerEncryption.enabled }}";
const CREDENTIAL_GUARD = "{{- if .Values.keyProvider.credentialSecret.name }}";
const ENV_RANGE = "{{- range $name, $value := .Values.keyProvider.env }}";

/** The template with every block that opens with `open` (through its `{{- end }}`) removed, and the blocks. */
function withoutBlocks(text: string, open: string): { rest: string; blocks: string[] } {
  const blocks: string[] = [];
  let rest = text;
  for (let start = rest.indexOf(open); start >= 0; start = rest.indexOf(open)) {
    const end = rest.indexOf("{{- end }}", start) + "{{- end }}".length;
    blocks.push(rest.slice(start, end));
    rest = rest.slice(0, start) + rest.slice(end);
  }
  return { rest, blocks };
}

describe("helm chart KeyProvider and ledger encryption (P2-06 D5)", () => {
  it("defaults leave an existing install unchanged: file provider, no credential, encryption off", () => {
    expect(values.keyProvider).toEqual({ provider: "file", env: {}, credentialSecret: { name: "", key: "" } });
    expect(values.ledgerEncryption).toEqual({ enabled: false, keyRef: "ledger-dek" });
    const configMap = read(`${chartDir}/templates/configmap-ledger-encryption.yaml`).trimEnd().split("\n");
    expect(configMap[0]).toBe(ENCRYPTION_GUARD);
    expect(configMap.at(-1)).toBe("{{- end }}");
    // Outside its guards the Deployment names neither setting, so the default render is the pre-D5 render.
    let rest = deployment;
    for (const open of [ENCRYPTION_GUARD, CREDENTIAL_GUARD, ENV_RANGE]) rest = withoutBlocks(rest, open).rest;
    expect(rest).not.toMatch(/keyProvider|ledgerEncryption|ledger-encryption|amc_key_provider/);
    expect(withoutBlocks(deployment, ENCRYPTION_GUARD).blocks).toHaveLength(3);
    expect(withoutBlocks(deployment, CREDENTIAL_GUARD).blocks).toHaveLength(2);
  });

  it("a selected provider gets its credential file through its own variable, from a Secret reference only", () => {
    const helpers = read(`${chartDir}/templates/_helpers.tpl`);
    expect(helpers).toContain('{{- get (dict "gcp-kms" "GOOGLE_APPLICATION_CREDENTIALS" "aws-kms" "AWS_SHARED_CREDENTIALS_FILE" '
      + '"azure-kv" "AZURE_CLIENT_CERTIFICATE_PATH" "pkcs11" "AMC_PKCS11_PIN_FILE") .Values.keyProvider.provider -}}');
    const [env, projection] = withoutBlocks(deployment, CREDENTIAL_GUARD).blocks;
    expect(env).toContain('- name: {{ include "amc.keyProviderCredentialEnv" . }}\n              value: /run/secrets/amc_key_provider_credential');
    expect(projection).toContain('{{- $refs = append $refs (list .Values.keyProvider.credentialSecret "amc_key_provider_credential") }}');
    // Settings are plain environment values whose names the schema limits; a secret has no way in.
    expect(withoutBlocks(deployment, ENV_RANGE).blocks[0]).toBe(`${ENV_RANGE}\n            - name: {{ $name }}\n              value: {{ $value | quote }}\n            {{- end }}`);
    const validate = schema();
    expect(validate(values)).toBe(true);
    const gcp = { keyProvider: { provider: "gcp-kms", credentialSecret: { name: "amc-gcp-kms", key: "credentials.json" } } };
    expect(validate(mergeValues(values, gcp)), JSON.stringify(validate.errors)).toBe(true);
    const pkcs11 = { keyProvider: { provider: "pkcs11", env: { AMC_PKCS11_MODULE: "/usr/lib/softhsm/libsofthsm2.so" }, credentialSecret: { name: "amc-hsm", key: "pin" } } };
    expect(validate(mergeValues(values, pkcs11)), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(mergeValues(values, { keyProvider: { provider: "aws-kms", env: { AWS_REGION: "eu-west-1" } } }))).toBe(true);
    expect(validate(mergeValues(values, { keyProvider: { provider: "vault" } }))).toBe(false);
  });

  it("a missing or partial Secret reference, or a secret in a value, fails the schema", () => {
    const validate = schema();
    const refused = (override: object) => expect(validate(mergeValues(values, override)), JSON.stringify(override)).toBe(false);
    refused({ keyProvider: { provider: "pkcs11" } });
    refused({ keyProvider: { provider: "pkcs11", credentialSecret: { name: "", key: "pin" } } });
    refused({ keyProvider: { provider: "gcp-kms", credentialSecret: { name: "amc-gcp-kms", key: "" } } });
    refused({ keyProvider: { provider: "file", credentialSecret: { name: "amc-hsm", key: "pin" } } });
    refused({ keyProvider: { provider: "pkcs11", env: { AMC_PKCS11_PIN: "1234" }, credentialSecret: { name: "amc-hsm", key: "pin" } } });
    refused({ keyProvider: { provider: "aws-kms", env: { AWS_SECRET_ACCESS_KEY: "x" } } });
    refused({ keyProvider: { provider: "aws-kms", credentials: "inline" } });
    refused({ ledgerEncryption: { enabled: true, keyRef: "x' ; rm -rf / ; '" } });
  });

  it("encryption on runs the chart's step before Studio and stops the pod when it fails", () => {
    const [step, mount, volume] = withoutBlocks(deployment, ENCRYPTION_GUARD).blocks;
    expect(step).toContain("sh /opt/amc-chart/ledger-encryption.sh {{ .Values.workspace.mountPath }} {{ .Values.keyProvider.provider }} "
      + "{{ .Values.ledgerEncryption.keyRef | squote }} || exit 1;");
    expect(deployment.indexOf(step)).toBeLessThan(deployment.indexOf("exec amc studio start"));
    expect(deployment.indexOf("amc bootstrap --workspace")).toBeLessThan(deployment.indexOf(step));
    expect(mount).toContain("mountPath: /opt/amc-chart\n              readOnly: true");
    expect(volume).toContain('name: {{ include "amc.fullname" . }}-ledger-encryption');
    expect(read(`${chartDir}/templates/configmap-ledger-encryption.yaml`)).toContain('{{ .Files.Get "files/ledger-encryption.sh" | indent 4 }}');
    expect(schema()(mergeValues(values, { ledgerEncryption: { enabled: true } }))).toBe(true);
  });
});

describe("files/ledger-encryption.sh against a real workspace (P2-06 D5)", () => {
  const SCRIPT = resolve(root, chartDir, "files/ledger-encryption.sh");
  let dir = "";
  let env: NodeJS.ProcessEnv = {};
  const workspace = () => join(dir, "ws");
  const step = () => spawnSync("sh", [SCRIPT, workspace(), "file", "ledger-dek"], { env, encoding: "utf8", timeout: 120_000 });
  // The shim the step finds on PATH as `amc`, called by path here.
  const amc = (...args: string[]) => spawnSync(join(dir, "bin/amc"), args, { cwd: workspace(), env, encoding: "utf8", timeout: 120_000 });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-d5-ledger-enc-"));
    for (const sub of ["bin", "home", "ws"]) mkdirSync(join(dir, sub), { mode: 0o700 });
    writeFileSync(join(dir, "bin/amc"), `#!/bin/sh\nexec "${process.execPath}" "${resolve(root, "dist/cli.js")}" "$@"\n`);
    chmodSync(join(dir, "bin/amc"), 0o755);
    const secrets = { vault: "d5-public-fixture-vault-passphrase", user: "d5-owner", password: "d5-public-fixture-owner-password" };
    for (const [name, value] of Object.entries(secrets)) writeFileSync(join(dir, name), value, { mode: 0o600 });
    // Only the files: the step reads the passphrase itself, as in the pod.
    const { AMC_VAULT_PASSPHRASE: _ignored, ...inherited } = process.env;
    env = { ...inherited, PATH: `${join(dir, "bin")}:${process.env.PATH}`, HOME: join(dir, "home"), AMC_VAULT_PASSPHRASE_FILE: join(dir, "vault"),
      AMC_BOOTSTRAP_OWNER_USERNAME_FILE: join(dir, "user"), AMC_BOOTSTRAP_OWNER_PASSWORD_FILE: join(dir, "password") };
    const boot = amc("bootstrap", "--workspace", workspace());
    expect(boot.status, boot.stderr).toBe(0);
  }, 180_000);
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it("switches the signed policy on, creates the file-wrapped data key, and is a no-op on the next start", () => {
    const first = step();
    expect(first.status, first.stderr).toBe(0);
    expect(amc("ops", "verify").status).toBe(0);
    expect(JSON.parse(amc("ops", "print").stdout).opsPolicy.encryption.ledgerEncryptionEnabled).toBe(true);
    const dek = JSON.parse(readFileSync(join(workspace(), ".amc/keys/ledger-dek.json"), "utf8"));
    expect(dek.keys.map((key: { providerId: string; keyRef: string }) => [key.providerId, key.keyRef])).toEqual([["file", "ledger-dek"]]);
    const before = readFileSync(join(workspace(), ".amc/ops-policy.yaml.sig"), "utf8");
    const second = step();
    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(join(workspace(), ".amc/ops-policy.yaml.sig"), "utf8")).toBe(before);
    expect(JSON.parse(readFileSync(join(workspace(), ".amc/keys/ledger-dek.json"), "utf8"))).toEqual(dek);
  }, 180_000);

  it("refuses, and re-signs nothing, when the ops policy was edited without a signature", () => {
    const policy = join(workspace(), ".amc/ops-policy.yaml");
    const sig = readFileSync(`${policy}.sig`, "utf8");
    appendFileSync(policy, "# edited\n");
    const run = step();
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/signature invalid/);
    expect(readFileSync(`${policy}.sig`, "utf8")).toBe(sig);
    expect(existsSync(policy)).toBe(true);
  }, 180_000);
});

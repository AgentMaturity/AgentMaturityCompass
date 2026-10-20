import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { lockVault } from "../../src/vault/vault.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { readOperationalDelegationState } from "../../src/keys/operationalDelegationState.js";
import { operationalLedgerProblems, operationalSessionProblems } from "../../src/keys/operationalLedgerReader.js";
import { loadTrustContext, withPins } from "../../src/trust/trustContext.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-private-host-error-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const path = join(root, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("owned-redaction") } } };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(root);
  const provider = awsKmsProvider(awsFake({ [AWS_ARN("owned-redaction")]: fakeKey("p256") }).call);
  const binding = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
  const trust = withPins(loadTrustContext({ amcHome: join(root, "owned-empty-home"), env: {} }),
    [{ keyId: binding.keyId, purposes: ["ledger-row"], origin: "owned fixture operator" }]);
  const archive = join(root, ".amc", "keys", "delegations", `${binding.delegationSha256}.json`);
  expect(operationalLedgerProblems(root, undefined, trust)).toEqual([]);
  expect(operationalSessionProblems(root, [], trust)).toEqual([]);
  return { root, archive, trust };
}

describe("public operational verifier filesystem diagnostic boundaries", () => {
  it("reports a bounded key-state class for an actually malformed pinned archive", async () => {
    const { root, archive, trust } = await fixture();
    writeFileSync(archive, "{malformed owned-archive private-host.example");
    expect(() => readOperationalDelegationState(root)).toThrow(/incomplete/);
    for (const errors of [operationalLedgerProblems(root, undefined, trust), operationalSessionProblems(root, [], trust)]) {
      expect(errors).toEqual(["Operational ledger delegation invalid: .amc/keys (KeysetIncompleteError)"]);
      expect(errors.join(" ")).not.toContain(root);
      expect(errors.join(" ")).not.toContain("private-host.example");
      expect(errors.join(" ")).not.toContain(archive);
    }
  });

  it("contains a real rejected archive symlink path instead of exposing the native exception", async () => {
    const { root, archive, trust } = await fixture();
    const target = join(root, "owned-private-host-target.json");
    writeFileSync(target, readFileSync(archive));
    rmSync(archive); symlinkSync(target, archive);
    // Positive control: the real containment failure includes the absolute private workspace path.
    expect(() => readOperationalDelegationState(root)).toThrow(root);
    for (const errors of [operationalLedgerProblems(root, undefined, trust), operationalSessionProblems(root, [], trust)]) {
      expect(errors).toEqual(["Operational ledger delegation invalid: .amc/keys (unreadable or unauthenticated state)"]);
      expect(errors.join(" ")).not.toContain(root);
      expect(errors.join(" ")).not.toContain(target);
      expect(errors.join(" ")).not.toContain("symlink");
    }
  });
});


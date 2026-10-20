import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { verifyAmcConfigSignature } from "../../src/config/amcConfigSignature.js";
import { initUsersConfig, usersConfigPath, usersConfigSigPath, verifyUsersConfigSignature } from "../../src/auth/authApi.js";
import { createWorkOrder, verifyWorkOrder } from "../../src/workorders/workorderEngine.js";
import { initOutcomeContract, verifyOutcomeContractSignature } from "../../src/outcomes/outcomeContractEngine.js";
import { issueExecTicket, verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { initPluginWorkspace } from "../../src/plugins/pluginApi.js";
import { verifyInstalledPluginsLock } from "../../src/plugins/pluginStore.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";

const PASS = "finite-config-role-read-preservation-passphrase";
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

interface CapturedSignature { rawValid: () => boolean; unchanged: () => void }
function capturedPair(path: string, sigPath: string, publicKeyPem: string): CapturedSignature {
  const bytes = readFileSync(path), sidecar = readFileSync(sigPath);
  const signed = JSON.parse(sidecar.toString("utf8")) as { digestSha256?: string; configSha256?: string; signature: string };
  expect(signed.digestSha256 ?? signed.configSha256).toBe(sha256Hex(bytes));
  return {
    rawValid: () => verifyCanonical("ed25519", Buffer.from(sha256Hex(bytes), "hex"), publicKeyPem, Buffer.from(signed.signature, "base64")),
    unchanged: () => { expect(readFileSync(path)).toEqual(bytes); expect(readFileSync(sigPath)).toEqual(sidecar); }
  };
}

function subject(family: string, workspace: string): { verify: () => boolean; evidence: CapturedSignature[] } {
  const publicKeyPem = getSigningPublicKeyPem(workspace, "config-signature");
  if (family === "amc-config") {
    const path = join(workspace, ".amc", "amc.config.yaml");
    return { verify: () => verifyAmcConfigSignature(workspace).valid, evidence: [capturedPair(path, `${path}.sig`, publicKeyPem)] };
  }
  if (family === "users") {
    initUsersConfig({ workspace, username: "owned-default-owner", password: "owned-default-user-password" });
    return { verify: () => verifyUsersConfigSignature(workspace).valid,
      evidence: [capturedPair(usersConfigPath(workspace), usersConfigSigPath(workspace), publicKeyPem)] };
  }
  if (family === "outcome") {
    const produced = initOutcomeContract(workspace, "default");
    return { verify: () => verifyOutcomeContractSignature(workspace, "default").valid,
      evidence: [capturedPair(produced.path, produced.sigPath, publicKeyPem)] };
  }
  if (family === "plugin-lock") {
    const produced = initPluginWorkspace({ workspace });
    return { verify: () => verifyInstalledPluginsLock(workspace).valid,
      evidence: [capturedPair(produced.lockPath, produced.lockSigPath, publicKeyPem)] };
  }
  const produced = createWorkOrder({ workspace, agentId: "default", title: "Owned default signed work order",
    description: "Original role-read compatibility fixture", riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"] });
  const evidence = [capturedPair(produced.filePath, produced.sigPath, publicKeyPem)];
  if (family === "workorder") {
    return { verify: () => verifyWorkOrder({ workspace, agentId: "default", workOrderId: produced.workOrder.workOrderId }).valid, evidence };
  }
  const issued = issueExecTicket({ workspace, agentId: "default", workOrderId: produced.workOrder.workOrderId,
    actionClass: "WRITE_HIGH", ttlMs: 600_000 });
  const [payloadPart, signaturePart] = issued.ticket.split(".") as [string, string];
  const payloadBytes = Buffer.from(payloadPart, "base64url"), signature = Buffer.from(signaturePart, "base64url"), originalTicket = issued.ticket;
  evidence.push({ rawValid: () => verifyCanonical("ed25519", payloadBytes, publicKeyPem, signature),
    unchanged: () => expect(issued.ticket).toBe(originalTicket) });
  // This public credential verifier also validates the actual signed work order. Its refusal is intentionally
  // credited to that complete path, not to an additional independently isolated token-signature guard.
  return { verify: () => verifyExecTicket({ workspace, ticket: issued.ticket, expectedAgentId: "default",
    expectedWorkOrderId: produced.workOrder.workOrderId, expectedActionClass: "WRITE_HIGH" }).ok, evidence };
}

const families = ["amc-config", "users", "workorder", "outcome", "ticket", "plugin-lock"] as const;
test.each(families.flatMap(family => (["corrupt", "missing"] as const).map(damage => [family, damage] as const)))(
  "%s preserves its original default-role refusal for a %s auditor alias while all signed bytes stay valid",
  (family, damage) => {
    const root = mkdtempSync(join(tmpdir(), "amc-finite-config-role-read-")), workspace = join(root, "workspace");
    roots.push({ root, workspace });
    vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const produced = subject(family, workspace);
    expect(boundProviderKey(workspace, "config-signature")).toBeNull();
    const alias = join(workspace, ".amc", "keys", "auditor_ed25519.pub"), originalAlias = readFileSync(alias);
    for (const evidence of produced.evidence) expect(evidence.rawValid()).toBe(true);
    expect(produced.verify()).toBe(true);
    try {
      if (damage === "missing") unlinkSync(alias);
      else writeFileSync(alias, generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }));
      expect(() => getPublicKeyHistory(workspace, "auditor")).toThrow();
      for (const evidence of produced.evidence) expect(evidence.rawValid()).toBe(true);
      expect(produced.verify()).toBe(false);
      for (const evidence of produced.evidence) evidence.unchanged();
    } finally { writeFileSync(alias, originalAlias); }
    for (const evidence of produced.evidence) { expect(evidence.rawValid()).toBe(true); evidence.unchanged(); }
    expect(produced.verify()).toBe(true);
  }
);

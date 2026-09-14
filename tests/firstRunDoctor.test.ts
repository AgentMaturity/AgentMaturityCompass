import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { renderDoctorText } from "../src/doctor/doctorReport.js";
import { firstRunActions, firstRunFixCommands, STUB_FIRST_TURN_COMMAND } from "../src/doctor/firstRunPlan.js";

/**
 * First-run diagnostic (brief §7 item 4, §7a): `amc doctor` must name each
 * missing precondition for a governed turn AND the exact command that fixes
 * it. A refusal that does not name its fix is a defect.
 *
 * The two preconditions a fresh `amc init` leaves open are the runtime
 * firewall policy (every tool call is denied with `missing-policy` until it
 * is signed) and a vault passphrase in the shell (every signing command
 * refuses with "Vault locked" without one). Everything else the doctor
 * touches is seamed off here; passing this file qualifies the diagnostic's
 * wording and status, not a notary, gateway, adapter or signature.
 */
const seam = vi.hoisted(() => ({
  signature: { valid: true, signatureExists: true, reason: null as string | null },
  firewall: {
    integrity: "uninitialized" as "uninitialized" | "invalid" | "trusted",
    policy: null as null | { enabled: boolean; mode: "observe" | "warn" | "block"; failClosedOnMissingPolicy: boolean },
    revision: null as number | null,
    reason: "No Runtime Firewall policy has been initialized."
  },
  vaultUnlocked: false
}));
vi.mock("../src/studio/studioSupervisor.js", () => ({ studioStatus: () => ({ running: false, state: null }) }));
vi.mock("../src/vault/vaultCli.js", () => ({ vaultStatusNow: () => ({ unlocked: seam.vaultUnlocked }) }));
vi.mock("../src/governor/actionPolicyEngine.js", () => ({ verifyActionPolicySignature: () => seam.signature }));
vi.mock("../src/toolhub/toolhubCli.js", () => ({ verifyToolhubConfig: () => seam.signature }));
vi.mock("../src/budgets/budgets.js", () => ({ verifyBudgetsConfigSignature: () => seam.signature }));
vi.mock("../src/approvals/approvalPolicyEngine.js", () => ({ verifyApprovalPolicySignature: () => seam.signature }));
vi.mock("../src/adapters/adapterConfigStore.js", () => ({ verifyAdaptersConfigSignature: () => seam.signature }));
vi.mock("../src/gateway/config.js", () => ({ loadGatewayConfig: () => ({}), routeBaseUrls: () => [{ prefix: "/openai" }] }));
vi.mock("../src/leases/leaseCli.js", () => ({ issueLeaseForCli: () => ({ token: "never-used" }) }));
vi.mock("../src/workspaces/workspaceId.js", () => ({ workspaceIdFromDirectory: () => "fixture-workspace" }));
vi.mock("../src/adapters/adapterCli.js", () => ({ adaptersDetectCli: () => [] }));
vi.mock("../src/toolhub/toolhubValidators.js", () => ({ pathAllowedByPatterns: () => ({ ok: false }) }));
vi.mock("../src/trust/trustConfig.js", () => ({ checkNotaryTrust: async () => ({ ok: true, reasons: [] }), loadTrustConfig: () => ({ trust: { mode: "LOCAL_VAULT" } }), verifyTrustConfigSignature: () => seam.signature }));
vi.mock("../src/crypto/signing/signer.js", () => ({ signDigestWithPolicy: () => undefined }));
vi.mock("../src/crypto/keys.js", () => ({ verifyKeyHistoryChain: () => ({ ok: true }) }));
vi.mock("../src/doctor/nativeModuleProbe.js", () => ({ nativeModuleCheck: () => ({ id: "native-modules", status: "PASS", message: "seam" }) }));
vi.mock("../src/runtime/firewall.js", () => ({
  inspectRuntimeFirewallPolicy: () => ({
    integrity: seam.firewall.integrity,
    policy: seam.firewall.policy,
    revision: seam.firewall.revision,
    reason: seam.firewall.reason,
    path: "/fixture/.amc/firewall/policy.json",
    signaturePath: "/fixture/.amc/firewall/policy.json.sig",
    journalPath: null,
    checkpointPath: null
  })
}));

const PASSPHRASE_ENV = "AMC_VAULT_PASSPHRASE";

describe("amc doctor names each first-run precondition and its fix", () => {
  let root: string;
  let priorPassphrase: string | undefined;
  beforeEach(() => {
    priorPassphrase = process.env[PASSPHRASE_ENV];
    delete process.env[PASSPHRASE_ENV];
    seam.signature = { valid: true, signatureExists: true, reason: null };
    seam.firewall = { integrity: "uninitialized", policy: null, revision: null, reason: "No Runtime Firewall policy has been initialized." };
    seam.vaultUnlocked = false;
    root = mkdtempSync(join(tmpdir(), "amc-first-run-doctor-"));
    mkdirSync(join(root, ".amc"));
    writeFileSync(join(root, ".amc", "amc.config.yaml"), "{}\n");
    writeFileSync(join(root, ".amc", "gateway.yaml"), "{}\n");
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (priorPassphrase === undefined) delete process.env[PASSPHRASE_ENV];
    else process.env[PASSPHRASE_ENV] = priorPassphrase;
  });

  it("warns on a workspace with no signed firewall policy and names `amc firewall enable`", async () => {
    // Plain `amc doctor` is the first-run diagnostic: it must name the
    // precondition and its fix. It keeps the exit code for broken artifacts
    // (tests/adaptersDoctorLeaseCarriers treats a fresh init as `ok`).
    const report = await runDoctorRules(root);
    const check = report.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(check, "the firewall precondition must be a named check").toBeDefined();
    expect(check?.status).toBe("WARN");
    expect(check?.message).toMatch(/every tool call is denied/i);
    expect(check?.message).toContain("missing-policy");
    expect(check?.fixHint).toBe("Run: amc firewall enable");
    expect(report.ok).toBe(true);
    const text = renderDoctorText(report);
    expect(text).toContain("[WARN] runtime-firewall-policy");
    expect(text).toContain("fix: Run: amc firewall enable");
    expect(text).toMatch(/warning\(s\) name a precondition that is still missing/);
    expect(text).not.toContain("All critical checks pass");
  });

  it("fails closed under --strict when no signed firewall policy exists", async () => {
    const report = await runDoctorRules(root, { strict: true });
    const check = report.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(check?.status).toBe("FAIL");
    expect(check?.fixHint).toBe("Run: amc firewall enable");
    expect(report.ok).toBe(false);
    expect(renderDoctorText(report)).toContain("[FAIL] runtime-firewall-policy");
  });

  it("fails an invalid firewall policy and names the inspection and migration commands", async () => {
    seam.firewall = { integrity: "invalid", policy: null, revision: null, reason: "Runtime Firewall policy is uncheckpointed or invalid: signature mismatch." };
    const report = await runDoctorRules(root);
    const check = report.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(check?.status).toBe("FAIL");
    expect(check?.message).toContain("signature mismatch");
    expect(check?.fixHint).toContain("amc firewall status");
    expect(check?.fixHint).toContain("amc firewall migrate-signature --approve-legacy-kind");
  });

  it("warns on a signed but disabled policy and names the command that enables it", async () => {
    seam.firewall = { integrity: "trusted", policy: { enabled: false, mode: "observe", failClosedOnMissingPolicy: false }, revision: 2, reason: "ok" };
    const report = await runDoctorRules(root);
    const check = report.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(check?.status).toBe("WARN");
    expect(check?.message).toContain("revision 2");
    expect(check?.fixHint).toBe("Run: amc firewall enable");
  });

  it("passes a signed, enabled policy and reports its mode and revision", async () => {
    seam.firewall = { integrity: "trusted", policy: { enabled: true, mode: "warn", failClosedOnMissingPolicy: true }, revision: 1, reason: "ok" };
    process.env[PASSPHRASE_ENV] = "fixture-passphrase";
    const report = await runDoctorRules(root);
    const check = report.checks.find((row) => row.id === "runtime-firewall-policy");
    expect(check).toMatchObject({ status: "PASS" });
    expect(check?.message).toContain("warn");
    expect(check?.message).toContain("revision 1");
    expect(check?.fixHint).toBeUndefined();
    expect(report.ok).toBe(true);
  });

  it("names the passphrase export when no vault passphrase is in the shell", async () => {
    const report = await runDoctorRules(root);
    const vault = report.checks.find((row) => row.id === "vault");
    expect(vault?.status).toBe("WARN");
    expect(vault?.message).toContain("Vault locked");
    expect(vault?.message).toContain("amc firewall enable");
    expect(vault?.fixHint).toContain("export AMC_VAULT_PASSPHRASE=");
    expect(vault?.fixHint).toContain("amc vault unlock");
  });

  it("passes the vault check when AMC_VAULT_PASSPHRASE is set, without echoing it", async () => {
    process.env[PASSPHRASE_ENV] = "fixture-passphrase-do-not-print";
    const report = await runDoctorRules(root);
    const vault = report.checks.find((row) => row.id === "vault");
    expect(vault?.status).toBe("PASS");
    expect(vault?.message).toContain("AMC_VAULT_PASSPHRASE");
    expect(renderDoctorText(report)).not.toContain("fixture-passphrase-do-not-print");
  });

  it("derives the ordered fix commands from the report so the CLI can print them verbatim", async () => {
    const report = await runDoctorRules(root, { strict: true });
    const fixes = firstRunFixCommands(report);
    const commands = fixes.map((fix) => fix.cmd);
    expect(commands).toContain("amc firewall enable");
    expect(commands.some((cmd) => cmd.startsWith("export AMC_VAULT_PASSPHRASE="))).toBe(true);
    // Only checks that still need attention are fix steps; a PASS never is.
    const passIds = new Set(report.checks.filter((row) => row.status === "PASS").map((row) => row.id));
    for (const fix of fixes) expect(passIds.has(fix.checkId)).toBe(false);
    // The blocking fix comes first: a FAIL outranks a WARN.
    const firstFail = fixes.findIndex((fix) => fix.status === "FAIL");
    const firstWarn = fixes.findIndex((fix) => fix.status === "WARN");
    expect(firstFail).toBeGreaterThanOrEqual(0);
    expect(firstWarn === -1 || firstFail < firstWarn).toBe(true);
  });
});

describe("the first-run action plan `amc init` prints", () => {
  it("lists exactly three operator actions in order: sign the firewall, run the keyless turn, verify it", () => {
    const actions = firstRunActions();
    expect(actions).toHaveLength(3);
    expect(actions[0]?.cmd).toBe("amc firewall enable");
    expect(actions[1]?.cmd).toBe(STUB_FIRST_TURN_COMMAND);
    expect(actions[2]?.cmd).toBe("amc agent-loop verify <session-id>");
    // The keyless turn must be the stub provider with the stub model and no credential reference.
    expect(STUB_FIRST_TURN_COMMAND).toContain("--provider stub");
    expect(STUB_FIRST_TURN_COMMAND).toContain("--model amc-stub-1");
    expect(STUB_FIRST_TURN_COMMAND).not.toContain("--credential");
    for (const action of actions) expect(action.desc.length).toBeGreaterThan(20);
  });
});

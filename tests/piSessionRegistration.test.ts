import { appendFileSync, chmodSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getHookIntegrationStatus, installHookIntegration, removeHookIntegration } from "../src/adapters/hookIntegration.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { HookControlError } from "../src/bridge/hookProviders.js";
import { NOT_GOVERNED_NOTE, piGovernance } from "../src/bridge/piSessionRegistry.js";
import { getPurposeKeyHistory } from "../src/keys/signingKeys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { sha256Hex } from "../src/utils/hash.js";
import { controlledWorkspace, fakePiPackage, piEnvelope, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "pi-registered";
const lease = { leaseId: "lease_pi_fixture", expiresTs: Date.now() + 3_600_000 };
const moduleSha256 = () => sha256Hex(readFileSync(resolve("dist", "adapters", "pi", "amcPiExtension.js")));

afterEach(removeFixtureWorkspaces);

let piPackage = "";
/** A workspace with a signed Pi control installation bound to a Pi `version` on disk (`piPackage`). */
function installed(version = "1.0.4"): string {
  const workspace = controlledWorkspace(agentId);
  piPackage = fakePiPackage(version);
  installHookIntegration({ workspace, provider: "pi", agentId, mode: "control", piPackageDir: piPackage });
  return workspace;
}
const refusedWith = (workspace: string, rawInput: string, code: string, message?: string) => expect(() => route(workspace, rawInput))
  .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: code as HookControlError["code"], ...(message ? { message: expect.stringContaining(message) } : {}) }));

const registration = (options: { sessionId?: string; version?: string; extensionSha256?: string; mode?: string } = {}) => JSON.stringify({
  hook_event_name: "session_start",
  pi: { version: options.version ?? "1.0.4", mode: options.mode ?? "print", sessionId: options.sessionId ?? "pi-session", extensionSha256: options.extensionSha256 ?? moduleSha256() },
});

const route = (workspace: string, rawInput: string) =>
  handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "pi", rawInput, lease });

const readPath = (workspace: string) => join(workspace, "workspace", "public.txt");

describe("Pi session registration (a lease-holder attestation checked against disk)", () => {
  test("no registration: the call is denied as not governed, nothing reads enforced, and status says not governed", () => {
    const workspace = installed();
    const decision = route(workspace, piEnvelope("read", { path: readPath(workspace) }, { toolCallId: "unregistered" }));
    expect(decision).toMatchObject({ decision: "deny", reason: expect.stringContaining("not governed") });
    const receipt = verifyReceipt((decision as { receipt: string }).receipt, getPurposeKeyHistory(workspace, "receipt"));
    expect(receipt.payload).toMatchObject({ state: "denied", enforcement: { level: "advisory" } });
    expect(piGovernance(workspace, agentId)).toMatchObject({ claim: "not_governed", registeredSessions: 0, note: NOT_GOVERNED_NOTE });
    expect(getHookIntegrationStatus({ workspace, provider: "pi" }).governance).toMatchObject({ claim: "not_governed" });
  });

  test("a registered session of a qualified Pi is allowed and enforced; the registration is signed, bound and idempotent", () => {
    const workspace = installed();
    const registered = route(workspace, registration()) as unknown as Record<string, unknown> & { receipt: string; record: Record<string, unknown> };
    expect(registered).toMatchObject({ registered: true, idempotentReplay: false, record: {
      kind: "amc.pi-session-registration/v1", agentId, piVersion: "1.0.4", qualified: true, extensionSha256: moduleSha256(),
      piSessionSha256: sha256Hex("pi\0pi-session"), requestSha256: sha256Hex(registration()),
      manifestSha256: sha256Hex(readFileSync(join(workspace, ".amc", "hooks", "pi.json"))), piInstallSha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    const signed = verifyReceipt(registered.receipt, getPurposeKeyHistory(workspace, "receipt"));
    expect(signed.ok).toBe(true);
    expect(signed.payload).toMatchObject({ kind: "work_accepted", providerId: "hook-registration:pi", agentId });
    expect(route(workspace, registration())).toMatchObject({ registered: true, idempotentReplay: true, receipt: registered.receipt });

    const decision = route(workspace, piEnvelope("read", { path: readPath(workspace) }, { toolCallId: "registered" }));
    expect(decision).toMatchObject({ decision: "allow" });
    expect(verifyReceipt((decision as { receipt: string }).receipt, getPurposeKeyHistory(workspace, "receipt")).payload)
      .toMatchObject({ state: "authorized", enforcement: { level: "enforced", boundary: "pi:tool_call" } });
    expect(piGovernance(workspace, agentId)).toMatchObject({ claim: "enforced_at_pi_tool_call", registeredSessions: 1, qualifiedSessions: 1 });
  });

  test("a registration from an unqualified Pi is recorded but not enforced, and its calls are denied", () => {
    const workspace = installed("1.1.0");
    expect(route(workspace, registration({ version: "1.1.0" }))).toMatchObject({ registered: true, record: { qualified: false } });
    const decision = route(workspace, piEnvelope("read", { path: readPath(workspace) }, { toolCallId: "old", version: "1.1.0" }));
    expect(decision).toMatchObject({ decision: "deny", reason: "AMC has not qualified Pi 1.1.0" });
    expect(verifyReceipt((decision as { receipt: string }).receipt, getPurposeKeyHistory(workspace, "receipt")).payload)
      .toMatchObject({ enforcement: { level: "advisory" } });
    expect(piGovernance(workspace, agentId)).toMatchObject({ claim: "not_governed", registeredSessions: 1, qualifiedSessions: 0 });
    // A call claiming another Pi version than its session registered is denied too.
    route(workspace, registration({ sessionId: "s-2", version: "1.1.0" }));
    expect(route(workspace, piEnvelope("read", { path: readPath(workspace) }, { sessionId: "s-2", toolCallId: "skew", version: "1.0.2" })))
      .toMatchObject({ decision: "deny", reason: expect.stringContaining("registered Pi 1.1.0") });
  });

  test("AMC checks a registration against disk: no bound Pi, Pi changed, another version, or a changed extension file or module is refused", () => {
    const unbound = controlledWorkspace(agentId);
    installHookIntegration({ workspace: unbound, provider: "pi", agentId, mode: "control" });
    refusedWith(unbound, registration(), "HOOK_CONTROL_INPUT_INVALID", "binds no Pi install");
    expect(getHookIntegrationStatus({ workspace: unbound, provider: "pi" })).toMatchObject({
      issues: expect.arrayContaining([expect.stringContaining("no Pi install")]), governance: { claim: "not_governed" } });

    const workspace = installed();
    refusedWith(workspace, registration({ version: "1.0.2" }), "HOOK_CONTROL_INPUT_INVALID", "Pi on disk is 1.0.4");
    appendFileSync(join(piPackage, "dist", "bundle", "chunks", "runtime.js"), "export const patched = true;\n");
    refusedWith(workspace, registration(), "HOOK_CONTROL_INPUT_INVALID", "not the Pi the signed installation bound");
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "drifted",
      issues: expect.arrayContaining([expect.stringContaining("Pi on disk changed")]) });

    const extension = controlledWorkspace(agentId);
    installHookIntegration({ workspace: extension, provider: "pi", agentId, mode: "control", piPackageDir: fakePiPackage() });
    writeFileSync(join(extension, ".pi", "extensions", "amc.js"), "export default function () {}\n");
    refusedWith(extension, registration(), "HOOK_CONTROL_INPUT_INVALID", ".pi/extensions/amc.js");
    expect(piGovernance(extension, agentId)).toMatchObject({ registeredSessions: 0 });
  });

  test("the claim follows the current installation: a drifted or reinstalled one reads not governed until a session registers under it", () => {
    const workspace = installed();
    route(workspace, registration());
    expect(getHookIntegrationStatus({ workspace, provider: "pi" }).governance).toMatchObject({ claim: "enforced_at_pi_tool_call", registeredSessions: 1 });

    const extensionFile = join(workspace, ".pi", "extensions", "amc.js");
    const original = readFileSync(extensionFile);
    writeFileSync(extensionFile, "export default function () {}\n");
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "drifted", governance: { claim: "not_governed" } });
    writeFileSync(extensionFile, original);
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "installed", governance: { claim: "enforced_at_pi_tool_call" } });

    removeHookIntegration({ workspace, provider: "pi" });
    installHookIntegration({ workspace, provider: "pi", agentId, mode: "control", piPackageDir: piPackage });
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "installed",
      governance: { claim: "not_governed", registeredSessions: 0 } });
    // The session registered under the removed installation is not registered under this one.
    expect(route(workspace, piEnvelope("read", { path: readPath(workspace) }, { toolCallId: "old-session" })))
      .toMatchObject({ decision: "deny", reason: expect.stringContaining("not governed") });
    route(workspace, registration({ sessionId: "after-reinstall" }));
    expect(getHookIntegrationStatus({ workspace, provider: "pi" }).governance).toMatchObject({ claim: "enforced_at_pi_tool_call", registeredSessions: 1 });
    rmSync(join(piPackage, "package.json"));
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "drifted", governance: { claim: "not_governed" } });
  });

  test("every call rechecks the extension and Pi on disk: after a swap the call is denied as not governed, never receipted enforced", () => {
    const workspace = installed();
    route(workspace, registration());
    const call = (id: string) => route(workspace, piEnvelope("read", { path: readPath(workspace) }, { toolCallId: id })) as unknown as
      { decision: string; reason: string; receipt: string };
    const enforcement = (id: string) => {
      const decision = call(id);
      return { decision: decision.decision, reason: decision.reason,
        level: (verifyReceipt(decision.receipt, getPurposeKeyHistory(workspace, "receipt")).payload as { enforcement: { level: string } }).enforcement.level };
    };
    expect(enforcement("before")).toMatchObject({ decision: "allow", level: "enforced" });

    const extensionFile = join(workspace, ".pi", "extensions", "amc.js");
    const original = readFileSync(extensionFile);
    writeFileSync(extensionFile, "export default function () {}\n");
    expect(enforcement("swapped-extension")).toEqual({ decision: "deny", reason: expect.stringContaining("not governed"), level: "advisory" });
    writeFileSync(extensionFile, original);
    expect(enforcement("restored")).toMatchObject({ decision: "allow", level: "enforced" });

    appendFileSync(join(piPackage, "dist", "bundle", "chunks", "runtime.js"), "export const patched = true;\n");
    expect(enforcement("patched-pi")).toEqual({ decision: "deny", reason: expect.stringContaining("not governed"), level: "advisory" });
  });

  test("the per-call recheck fails closed: same-size rewrite, rename-swap, symlink swap, unreadable file, stat error, deleted file", () => {
    const workspace = installed();
    route(workspace, registration());
    const extensionFile = join(workspace, ".pi", "extensions", "amc.js");
    const original = readFileSync(extensionFile);
    let id = 0;
    const level = () => {
      const decision = route(workspace, piEnvelope("read", { path: readPath(workspace) }, { toolCallId: `c${(id += 1)}` })) as unknown as { decision: string; receipt: string };
      const payload = verifyReceipt(decision.receipt, getPurposeKeyHistory(workspace, "receipt")).payload as { enforcement: { level: string } };
      return `${decision.decision}/${payload.enforcement.level}`;
    };
    const restore = () => {
      rmSync(extensionFile, { force: true });
      writeFileSync(extensionFile, original);
      expect(level()).toBe("allow/enforced");
    };
    expect(level()).toBe("allow/enforced");
    // Permission errors cannot be produced as root.
    const asUser = process.getuid?.() !== 0;
    const cases: Array<[string, () => void]> = [
      ...(asUser ? [["unreadable file", () => chmodSync(extensionFile, 0o000)], ["stat error", () => chmodSync(join(workspace, ".pi", "extensions"), 0o000)]] as Array<[string, () => void]> : []),
      ["same-size rewrite", () => writeFileSync(extensionFile, Buffer.from(original.toString("utf8").replace("Do not edit", "Do NOT edt"), "utf8"))],
      ["rename-swap", () => { writeFileSync(`${extensionFile}.new`, `${original.toString("utf8").slice(0, -1)} `); renameSync(`${extensionFile}.new`, extensionFile); }],
      ["symlink swap to identical bytes", () => { writeFileSync(join(workspace, "amc-copy.js"), original); rmSync(extensionFile); symlinkSync(join(workspace, "amc-copy.js"), extensionFile); }],
      ["deleted file", () => rmSync(extensionFile)],
    ];
    for (const [label, swap] of cases) {
      swap();
      expect(level(), label).toBe("deny/advisory");
      chmodSync(join(workspace, ".pi", "extensions"), 0o755);
      restore();
    }
  });

  test("tampered registrations are refused: a foreign extension digest, a conflicting re-registration, an altered ledger row", () => {
    const workspace = installed();
    const refused = (rawInput: string, code: string) => expect(() => route(workspace, rawInput))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: code as HookControlError["code"] }));
    refused(registration({ extensionSha256: "0".repeat(64) }), "HOOK_CONTROL_INPUT_INVALID");
    route(workspace, registration({ sessionId: "s-3" }));
    refused(registration({ sessionId: "s-3", mode: "tui" }), "HOOK_CONTROL_REPLAY_CONFLICT");

    route(workspace, registration({ sessionId: "s-4" }));
    const ledger = openLedger(workspace);
    const row = ledger.db.prepare("SELECT id, meta_json FROM evidence_events WHERE id LIKE 'pi_registration_%' ORDER BY rowid DESC LIMIT 1")
      .get() as { id: string; meta_json: string };
    // An attacker with write access to the database: drop the immutability triggers, then edit the recorded version.
    for (const trigger of ["protect_evidence_immutable", "no_update_evidence"]) ledger.db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(row.meta_json.replace('"1.0.4"', '"1.0.2"'), row.id);
    ledger.close();
    expect(route(workspace, piEnvelope("read", { path: readPath(workspace) }, { sessionId: "s-4", toolCallId: "tampered", version: "1.0.2" })))
      .toMatchObject({ decision: "deny", reason: expect.stringContaining("failed verification") });
    expect(piGovernance(workspace, agentId)).toMatchObject({ invalidRegistrations: 1 });

    // A row whose record and receipt still match but whose place in the hash chain moved: only the integrity check sees it.
    route(workspace, registration({ sessionId: "s-5" }));
    const chain = openLedger(workspace);
    const moved = chain.db.prepare("SELECT id FROM evidence_events WHERE id LIKE 'pi_registration_%' ORDER BY rowid DESC LIMIT 1").get() as { id: string };
    chain.db.prepare("UPDATE evidence_events SET ts = ts + 1 WHERE id = ?").run(moved.id);
    chain.close();
    expect(route(workspace, piEnvelope("read", { path: readPath(workspace) }, { sessionId: "s-5", toolCallId: "moved" })))
      .toMatchObject({ decision: "deny", reason: expect.stringContaining("failed verification") });
    expect(piGovernance(workspace, agentId)).toMatchObject({ invalidRegistrations: 2 });
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "invalid",
      issues: expect.arrayContaining([expect.stringContaining("failed verification")]) });
  });

  test("an observe installation cannot register: only a control installation's lease can attest", () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "pi", agentId });
    expect(() => route(workspace, registration())).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_INVALID" }));
    expect(getHookIntegrationStatus({ workspace, provider: "pi" }).governance).toMatchObject({ claim: "observed" });
  });
});

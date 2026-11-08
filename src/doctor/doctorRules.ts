import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { versions } from "node:process";
import { studioStatus } from "../studio/studioSupervisor.js";
import { vaultStatusNow } from "../vault/vaultCli.js";
import { rememberedStores, rememberedUnlockLocation } from "../vault/passphraseStore.js";
import { interactiveOperator, operatorRefusalText } from "../vault/operatorContext.js";
import { resolveCredentialsPaths } from "../credentials/credentialsPaths.js";
import { assertOwnerOnly, permissionsAreEnforced } from "../credentials/credentialsFilePermissions.js";
import { CredentialsFilePermissionsError } from "../credentials/credentialsStoreErrors.js";
import { loadActionPolicy, verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { DEFAULT_RUN_INTEGRITY_AT_LEAST, runIntegrityAtLeast } from "../governor/actionPolicySchema.js";
import { actionPolicyDeclaredAbsent } from "../governor/actionPolicyStore.js";
import { verifyToolhubConfig } from "../toolhub/toolhubCli.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyAdaptersConfigSignature } from "../adapters/adapterConfigStore.js";
import { loadGatewayConfig, routeBaseUrls } from "../gateway/config.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { checkScopedEgress, EgressBlocked } from "../residency/checkEgress.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { adaptersDetectCli } from "../adapters/adapterCli.js";
import { pathAllowedByPatterns } from "../toolhub/toolhubValidators.js";
import { checkNotaryTrust, loadTrustConfig, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { verifyKeyHistoryChain } from "../crypto/keys.js";
import { inspectRuntimeFirewallPolicy } from "../runtime/firewall.js";
import { nativeModuleCheck } from "./nativeModuleProbe.js";
import { requestDoctorStatus, doctorCarrierCheck } from "./doctorLiveProbe.js";
import { adoptWorkspaceRecordHead, type RecordLocation } from "../storage/workspaceRecordStore.js";

export type DoctorStatus = "PASS" | "FAIL" | "WARN" | "INFO";

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
  fixHint?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  mode: "INSTALL" | "WORKSPACE";
  workspaceInitialized: boolean;
  strict: boolean;
  liveProbes?: boolean;
}

export interface DoctorOptions {
  strict?: boolean;
  /** Explicit consent to existing live notary signing and gateway model probes. */
  liveProbes?: boolean;
}

function pushSignatureCheck(checks: DoctorCheck[], id: string, label: string, verify: { valid: boolean; signatureExists: boolean; reason: string | null }): void {
  if (verify.valid) {
    checks.push({ id, status: "PASS", message: `${label} signature valid` });
    return;
  }
  if (!verify.signatureExists) {
    checks.push({
      id,
      status: "WARN",
      message: `${label} signature missing (${verify.reason ?? "unknown"})`,
      fixHint: "Unlock vault and re-sign with: amc fix-signatures"
    });
    return;
  }
  checks.push({
    id,
    status: "FAIL",
    message: `${label} signature invalid (${verify.reason ?? "unknown"})`,
    fixHint: "Review the named policy and restore its approved contents first. Unlock the vault, then deliberately re-sign only approved configuration with: amc fix-signatures"
  });
}

function pushAdapterChecks(checks: DoctorCheck[], workspace: string, includePlugins: boolean): void {
  for (const row of adaptersDetectCli({ workspace, timeoutMs: 250, includePlugins })) {
    checks.push({
      id: `adapter-${row.adapterId}`,
      status: row.installed ? "PASS" : "WARN",
      message: row.installed ? `${row.adapterId}: ${row.command} ${row.version ?? ""}`.trim() : `${row.adapterId}: ${row.detail}`,
      fixHint: row.installed ? undefined : `Install/enable ${row.adapterId} CLI or use generic-cli`
    });
  }
}

/**
 * The runtime firewall policy is the precondition `amc init` leaves open:
 * the guard composed onto every native tool call denies with `missing-policy`
 * until a signed policy exists (ADR-0011, tests/firewallDenyByDefault). A
 * workspace in that state cannot run a governed tool turn, so it is a FAIL
 * that names the one command which creates and signs the policy.
 */
function pushRuntimeFirewallCheck(checks: DoctorCheck[], workspace: string, strict: boolean): void {
  const id = "runtime-firewall-policy";
  let inspected: ReturnType<typeof inspectRuntimeFirewallPolicy>;
  try {
    inspected = inspectRuntimeFirewallPolicy(workspace);
  } catch (error) {
    checks.push({ id, status: "FAIL", message: `Runtime Firewall policy could not be inspected: ${safeDoctorError(error, workspace)}`, fixHint: "Run: amc firewall status" });
    return;
  }
  if (inspected.integrity === "uninitialized") {
    // Plain `amc doctor` is the first-run diagnostic: it names the fix and
    // keeps the exit code for broken artifacts. `--strict` requires a
    // workspace that can already run a governed tool turn, so there it fails.
    checks.push({
      id,
      status: strict ? "FAIL" : "WARN",
      message: "Runtime Firewall policy missing: every tool call is denied (missing-policy) until a signed policy exists",
      fixHint: "Run: amc firewall enable"
    });
    return;
  }
  if (inspected.integrity === "invalid" || inspected.policy === null) {
    checks.push({
      id,
      status: "FAIL",
      message: `Runtime Firewall policy invalid; every tool call is denied (invalid-policy): ${safeDoctorError(inspected.reason, workspace)}`,
      fixHint: "Inspect with: amc firewall status. For a verified legacy policy run: amc firewall migrate-signature --approve-legacy-kind. Otherwise review .amc/firewall and re-create deliberately with: amc firewall enable"
    });
    return;
  }
  const revision = inspected.revision ?? "unknown";
  if (!inspected.policy.enabled) {
    checks.push({
      id,
      status: "WARN",
      message: `Runtime Firewall policy signed but disabled (revision ${revision}); model traffic is not inspected`,
      fixHint: "Run: amc firewall enable"
    });
    return;
  }
  checks.push({
    id,
    status: "PASS",
    message: `Runtime Firewall policy signed and enabled (mode ${inspected.policy.mode}, revision ${revision}, fail-closed ${inspected.policy.failClosedOnMissingPolicy ? "on" : "off"})`
  });
}

/** Every workspace record store (WP37): residency, governor canary, false-positive and lab registers. */
const WORKSPACE_RECORD_STORES: readonly RecordLocation[] = [
  { area: ["compliance", "residency"], kind: "policies", idField: "policyId" }, { area: ["compliance", "residency"], kind: "tenants", idField: "tenantId" },
  { area: ["governor"], kind: "rollback-packs", idField: "packId" }, { area: ["governor"], kind: "emergency-overrides", idField: "overrideId" },
  { area: ["assurance"], kind: "false-positives", idField: "reportId" }, { area: ["lab"], kind: "experiments", idField: "experimentId" },
  { area: ["lab"], kind: "probe-results" }
];

/**
 * The explicit, one-time anchoring of record stores written before head anchors existed (WP37 review): each such
 * store is anchored at its chain tip, signed, with a ledger audit row, and reads clean afterwards; a verified anchor
 * without a ledger row gets one. A store whose anchor was removed after it was anchored is never anchored again and
 * fails.
 */
function pushWorkspaceRecordHeadCheck(checks: DoctorCheck[], workspace: string): void {
  const rows = WORKSPACE_RECORD_STORES.map((at) => ({ store: [...at.area, at.kind].join("/"), result: adoptWorkspaceRecordHead(workspace, at) }));
  const named = (status: string) => rows.flatMap(({ store, result }) => result.status !== status ? []
    : [result.status === "adopted" ? `${store} at ${result.head.slice(0, 16)}…` : "reason" in result ? `${store} (${result.reason})` : store]);
  const deleted = named("deleted"), refused = named("refused"), adopted = named("adopted"), recorded = named("recorded");
  const parts = [deleted.length > 0 ? `head anchor removed after anchoring: ${deleted.join(", ")}` : "",
    refused.length > 0 ? `history not anchored: ${refused.join(", ")}` : "", adopted.length > 0 ? `existing history anchored once: ${adopted.join(", ")}` : "",
    recorded.length > 0 ? `ledger row recorded: ${recorded.join(", ")}` : ""];
  checks.push({
    id: "workspace-record-heads",
    status: deleted.length > 0 ? "FAIL" : refused.length > 0 ? "WARN" : adopted.length + recorded.length > 0 ? "INFO" : "PASS",
    message: parts.some(Boolean) ? `Workspace record stores: ${parts.filter(Boolean).join("; ")}` : "Workspace record stores carry signed head anchors",
    ...(deleted.length > 0 ? { fixHint: "A removed head anchor hides whether the newest record was deleted: investigate the named store and restore its <kind>.head.json from a backup; doctor never anchors it again." }
      : refused.length > 0 ? { fixHint: "Run: export AMC_VAULT_PASSPHRASE='<the passphrase chosen or shown at amc init>', then rerun amc doctor" } : {})
  });
}

/**
 * Studio refuses to start while the AMC home (the directory holding the credentials file) or that file is open to group
 * or other; this runs the same check (assertOwnerOnly) and fails with the same fix, before Studio is ever started.
 */
export function amcHomeCheck(env: NodeJS.ProcessEnv = process.env): DoctorCheck {
  const id = "amc-home-permissions", paths = resolveCredentialsPaths({ env, projectDir: null });
  if (!permissionsAreEnforced()) return { id, status: "INFO", message: `AMC home ${paths.homeDir}: POSIX modes are not checked on this platform (access is governed by ACLs)` };
  try {
    for (const [path, kind] of [[paths.homeDir, "directory"], [paths.file, "file"]] as const) {
      if (existsSync(path)) assertOwnerOnly({ path, kind, stats: statSync(path) });
    }
    return { id, status: "PASS", message: existsSync(paths.homeDir) ? `AMC home ${paths.homeDir} is reachable by its owner alone` : `AMC home ${paths.homeDir} does not exist yet` };
  } catch (error) {
    if (error instanceof CredentialsFilePermissionsError) return { id, status: "FAIL", message: `${error.message} (Studio refuses to start until then)`, fixHint: `Run: ${error.fixCommand}` };
    return { id, status: "FAIL", message: `AMC home ${paths.homeDir} could not be checked: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function safeDoctorError(error: unknown, workspace: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replaceAll(workspace, ".").replace(/\s+/g, " ").trim().slice(0, 240) || "unknown error";
}

export async function runDoctorRules(workspace: string, options: DoctorOptions = {}): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const strict = options.strict ?? false;
  const liveProbes = options.liveProbes === true;
  const workspaceInitialized = existsSync(join(workspace, ".amc", "amc.config.yaml"));
  const mode: DoctorReport["mode"] = workspaceInitialized ? "WORKSPACE" : "INSTALL";
  const nodeMajor = Number((versions.node ?? "0").split(".")[0] ?? "0");
  checks.push(
    nodeMajor >= 20
      ? { id: "node-version", status: "PASS", message: `Node ${versions.node}` }
      : { id: "node-version", status: "FAIL", message: `Node ${versions.node} is below required >=20`, fixHint: "Install Node.js 20+" }
  );
  checks.push(nativeModuleCheck());
  checks.push(amcHomeCheck());

  // The key history decides which public keys may verify as each role, so a
  // silent insertion there forges every signature of that role. Report a broken
  // chain loudly rather than letting verification quietly accept a planted key.
  if (workspaceInitialized) {
    for (const kind of ["monitor", "auditor", "lease", "session"] as const) {
      const chain = verifyKeyHistoryChain(workspace, kind);
      if (!chain.ok) {
        checks.push({
          id: `key-history-${kind}`,
          status: "FAIL",
          message: `${kind} historical keys are not authenticated: ${chain.reason}`,
          fixHint: "Current-key verification remains available. Review history and use amc vault history migrate with its SHA-256 and explicitly approved historical fingerprints."
        });
      }
    }
  }

  if (!workspaceInitialized) {
    checks.push({
      id: "workspace-initialized",
      status: strict ? "FAIL" : "INFO",
      message: strict
        ? "AMC workspace is required in strict mode"
        : "CLI installation is ready; no AMC workspace is initialized yet",
      fixHint: "Run: amc"
    });
    pushAdapterChecks(checks, workspace, false);
    return {
      ok: checks.every((row) => row.status !== "FAIL"),
      checks,
      mode,
      workspaceInitialized,
      strict,
      liveProbes
    };
  }

  checks.push({
    id: "workspace-initialized",
    status: "PASS",
    message: "AMC workspace initialized"
  });

  const studio = studioStatus(workspace);
  checks.push(
    studio.running
      ? { id: "studio-running", status: "PASS", message: `Studio running on ${studio.state?.host}:${studio.state?.apiPort}` }
      : { id: "studio-running", status: "INFO", message: "Studio is not running (optional — needed for dashboard/API)", fixHint: "Run: amc up" }
  );

  // Signing commands (amc firewall enable, amc agent-loop run) unlock the vault
  // in their own process from AMC_VAULT_PASSPHRASE or, outside agent mode, the
  // passphrase `amc up` remembered (B2). Say which source applies, or which
  // action makes them work. The passphrase value itself is never rendered.
  const vault = vaultStatusNow(workspace);
  const passphraseInShell = (process.env.AMC_VAULT_PASSPHRASE ?? "").length > 0;
  const remembered = rememberedUnlockLocation(workspace);
  const gate = interactiveOperator({ workspace }); // LIVE-VAULT-01: the remembered store unlocks for an interactive operator only
  checks.push(
    vault.unlocked || passphraseInShell
      ? { id: "vault", status: "PASS", message: passphraseInShell ? "Vault passphrase available from AMC_VAULT_PASSPHRASE; signing commands can run"
        : remembered ? `Vault unlocked with the passphrase remembered in ${remembered}; signing commands in this workspace use it too` : "Vault unlocked" }
      : {
        id: "vault",
        status: "WARN",
        message: "Vault locked in this shell: signing commands (amc firewall enable, amc agent-loop run) will refuse with \"Vault locked\"",
        fixHint: "Run: export AMC_VAULT_PASSPHRASE='<the passphrase chosen or shown at amc init>' (interactive alternative: amc vault unlock). "
          + `A passphrase \`amc up\` remembered is kept in ${rememberedStores()}; `
          + (gate.ok ? "amc commands you run in this workspace from your own terminal unlock with it."
            : `it is not used here because ${operatorRefusalText(gate)} (it unlocks only for commands you run from your own terminal, outside agent mode).`)
      }
  );

  pushRuntimeFirewallCheck(checks, workspace, strict);
  pushWorkspaceRecordHeadCheck(checks, workspace);

  // AXR-02: never configured, native agent calls meet no Action Policy; said as such rather than as a missing signature.
  // Removed after signing (no signed absence declaration), every governed call is denied until it is restored.
  const actionPolicySig = verifyActionPolicySignature(workspace);
  if (actionPolicySig.reason === "action policy missing" && !existsSync(actionPolicySig.sigPath)) {
    checks.push(!actionPolicyDeclaredAbsent(workspace)
      ? { id: "sig-action-policy", status: "FAIL", message: "action policy removed after signing: restore it from backup or run amc policy action init",
        fixHint: "Restore .amc/action-policy.yaml and its .sig from backup, or create and sign a new one with: amc policy action init" }
      : { id: "sig-action-policy", status: "WARN", message: "action policy: not configured (native agent calls are not checked against an Action Policy)",
        fixHint: "Create and sign one with: amc policy action init" });
  } else pushSignatureCheck(checks, "sig-action-policy", "action-policy.yaml", actionPolicySig);
  // G3: an owner waiver below the run-integrity default, said where an operator who never reads a decision looks.
  if (actionPolicySig.valid) {
    try {
      const waived = loadActionPolicy(workspace).actions.filter((rule) => runIntegrityAtLeast(rule) < DEFAULT_RUN_INTEGRITY_AT_LEAST)
        .map((rule) => `${rule.actionClass}=${runIntegrityAtLeast(rule)}`);
      if (waived.length > 0) checks.push({ id: "action-policy-run-integrity-waiver", status: "WARN",
        message: `action policy: owner waiver — requireRunIntegrityAtLeast below ${DEFAULT_RUN_INTEGRITY_AT_LEAST} on ${waived.join(", ")}; EXECUTE for those classes does not rest on a HIGH TRUST run`,
        fixHint: `Remove requireRunIntegrityAtLeast from those rules (or set ${DEFAULT_RUN_INTEGRITY_AT_LEAST}), then re-sign: amc fix-signatures` });
    } catch (error) {
      checks.push({ id: "action-policy-parse", status: "WARN", message: `action policy: signed but does not parse (${safeDoctorError(error, workspace)}); every governed class is denied`,
        fixHint: "Fix .amc/action-policy.yaml, then re-sign: amc fix-signatures" });
    }
  }
  pushSignatureCheck(checks, "sig-tools", "tools.yaml", verifyToolhubConfig(workspace));
  pushSignatureCheck(checks, "sig-budgets", "budgets.yaml", verifyBudgetsConfigSignature(workspace));
  pushSignatureCheck(checks, "sig-approval-policy", "approval-policy.yaml", verifyApprovalPolicySignature(workspace));
  pushSignatureCheck(checks, "sig-adapters", "adapters.yaml", verifyAdaptersConfigSignature(workspace));
  const trustSig = verifyTrustConfigSignature(workspace);
  pushSignatureCheck(checks, "sig-trust", "trust.yaml", trustSig);
  let trustMode: "LOCAL_VAULT" | "NOTARY" = "LOCAL_VAULT";
  try {
    trustMode = loadTrustConfig(workspace).trust.mode;
  } catch {
    trustMode = "LOCAL_VAULT";
  }
  if (trustSig.valid && trustMode === "NOTARY" && !liveProbes) checks.push({
    id: "notary-live-probes", status: "INFO", message: "Notary health and signing probes not run (local diagnostic mode)",
    fixHint: "To deliberately contact the configured notary and sign a diagnostic digest, run: amc doctor --live-probes"
  });
  if (trustSig.valid && trustMode === "NOTARY" && liveProbes) {
    const trust = await checkNotaryTrust(workspace).catch(() => ({
      ok: false,
      reasons: ["NOTARY_HEALTH_CHECK_FAILED"]
    }));
    const notaryOk = Boolean(trust.ok);
    checks.push({
      id: "notary-health",
      status: notaryOk ? "PASS" : "FAIL",
      message: notaryOk ? "Notary trust checks passed" : `Notary trust checks failed: ${(trust.reasons ?? []).join("; ")}`,
      fixHint: notaryOk ? undefined : "Run: amc notary status, then amc trust status"
    });
    try {
      const digest = randomBytes(32).toString("hex");
      await signDigestWithPolicyAsync({
        workspace,
        kind: "MERKLE_ROOT",
        digestHex: digest
      });
      checks.push({
        id: "notary-sign-smoke",
        status: "PASS",
        message: "Notary signing smoke test succeeded"
      });
    } catch {
      checks.push({
        id: "notary-sign-smoke",
        status: "FAIL",
        message: "Notary signing smoke test failed",
        fixHint: "Ensure notary is reachable, fingerprint is pinned, and auth secret is valid."
      });
    }
  }

  const gatewayConfigFile = join(workspace, ".amc", "gateway.yaml");
  if (!existsSync(gatewayConfigFile)) {
    checks.push({
      id: "gateway-config",
      status: "FAIL",
      message: "Gateway config missing",
      fixHint: "Run: amc gateway init"
    });
  } else {
    try {
      const gateway = loadGatewayConfig(workspace);
      const routes = routeBaseUrls(gateway);
      for (const route of ["/openai", "/anthropic", "/gemini", "/grok", "/openrouter", "/local"]) {
        const exists = routes.some((row) => row.prefix === route);
        checks.push({
          id: `route-${route}`,
          status: exists ? "PASS" : "WARN",
          message: exists ? `Gateway route mounted: ${route}` : `Gateway route missing: ${route}`,
          fixHint: exists ? undefined : "Update .amc/gateway.yaml and restart gateway"
        });
      }

      const deny = pathAllowedByPatterns(workspace, ".amc/forbidden.txt", ["./workspace/**"]);
      checks.push(
        !deny.ok
          ? { id: "toolhub-denylist", status: "PASS", message: "ToolHub denylist blocks .amc path access" }
          : { id: "toolhub-denylist", status: "FAIL", message: "ToolHub denylist check failed", fixHint: "Run: amc tools verify" }
      );

      if (!liveProbes) {
        checks.push({ id: "lease-carriers-live", status: "INFO", message: "Live gateway model requests and diagnostic lease issuance not run (local diagnostic mode)",
          fixHint: "To deliberately issue a lease and send gateway model requests that may incur provider charges, run: amc doctor --live-probes" });
      } else if (studio.running && studio.state) {
        const studioHost = studio.state.host === "0.0.0.0" || studio.state.host === "::" ? "127.0.0.1" : studio.state.host;
        const gatewayBase = `http://${studioHost}:${studio.state.gatewayPort}`;
        const route = routes[0]?.prefix ?? "/openai";
        const probeUrl = `${gatewayBase}${route}/v1/chat/completions`;
        checkScopedEgress(workspace, "bridge", probeUrl, { dataClasses: null, purpose: null, agentId: "default" });
        const lease = issueLeaseForCli({
          workspace,
          workspaceId: workspaceIdFromDirectory(workspace),
          agentId: "default",
          ttl: "5m",
          scopes: "gateway:llm",
          routes: route,
          models: "*",
          rpm: 20,
          tpm: 20000,
          maxCostUsdPerDay: null
        }).token;
        const payload = JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "doctor" }]
        });
        const statusAuth = await requestDoctorStatus(probeUrl, { "x-amc-agent-id": "default", authorization: `Bearer ${lease}` }, payload, undefined, workspace);
        checks.push(doctorCarrierCheck("lease-carrier-authorization", "Authorization carrier", statusAuth));
        const statusXApi = await requestDoctorStatus(probeUrl, { "x-amc-agent-id": "default", "x-api-key": lease }, payload, undefined, workspace);
        checks.push(doctorCarrierCheck("lease-carrier-x-api-key", "x-api-key carrier", statusXApi));
      } else {
        checks.push({
          id: "lease-carriers-live",
          status: "WARN",
          message: "Skipped live lease carrier checks (Studio not running)",
          fixHint: "Run: amc up, then deliberately rerun amc doctor --live-probes (gateway model requests may incur charges)"
        });
      }
    } catch (error) {
      if (error instanceof EgressBlocked) {
        checks.push({
          id: "lease-carriers-live",
          status: "FAIL",
          message: `Live lease carrier probes blocked by residency: ${safeDoctorError(error, workspace)}`,
          fixHint: "Review the signed residency destination registry and routing policy before deliberately retrying amc doctor --live-probes."
        });
      } else {
        checks.push({
          id: "gateway-config",
          status: "FAIL",
          message: `Gateway config invalid: ${safeDoctorError(error, workspace)}`,
          fixHint: "Run: amc gateway init"
        });
      }
    }
  }

  pushAdapterChecks(checks, workspace, true);

  const ok = checks.every((row) => row.status !== "FAIL");
  return { ok, checks, mode, workspaceInitialized, strict, liveProbes };
}

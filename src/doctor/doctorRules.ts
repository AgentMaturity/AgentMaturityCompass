import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { versions } from "node:process";
import { studioStatus } from "../studio/studioSupervisor.js";
import { vaultStatusNow } from "../vault/vaultCli.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolhubConfig } from "../toolhub/toolhubCli.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyAdaptersConfigSignature } from "../adapters/adapterConfigStore.js";
import { loadGatewayConfig, routeBaseUrls } from "../gateway/config.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { adaptersDetectCli } from "../adapters/adapterCli.js";
import { pathAllowedByPatterns } from "../toolhub/toolhubValidators.js";
import { checkNotaryTrust, loadTrustConfig, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { verifyKeyHistoryChain } from "../crypto/keys.js";
import { inspectRuntimeFirewallPolicy } from "../runtime/firewall.js";
import { nativeModuleCheck } from "./nativeModuleProbe.js";
import { requestDoctorStatus, doctorCarrierCheck } from "./doctorLiveProbe.js";

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

  // Signing commands (amc firewall enable, amc agent-loop run) read the
  // passphrase from the shell; a process-local unlock never reaches them. Say
  // which shell action makes them work rather than reporting "locked" as
  // normal. The passphrase value itself is never rendered.
  const vault = vaultStatusNow(workspace);
  const passphraseInShell = (process.env.AMC_VAULT_PASSPHRASE ?? "").length > 0;
  checks.push(
    vault.unlocked || passphraseInShell
      ? { id: "vault", status: "PASS", message: passphraseInShell ? "Vault passphrase available from AMC_VAULT_PASSPHRASE; signing commands can run" : "Vault unlocked" }
      : {
        id: "vault",
        status: "WARN",
        message: "Vault locked in this shell: signing commands (amc firewall enable, amc agent-loop run) will refuse with \"Vault locked\"",
        fixHint: "Run: export AMC_VAULT_PASSPHRASE='<the passphrase chosen or shown at amc init>' (interactive alternative: amc vault unlock)"
      }
  );

  pushRuntimeFirewallCheck(checks, workspace, strict);

  pushSignatureCheck(checks, "sig-action-policy", "action-policy.yaml", verifyActionPolicySignature(workspace));
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
    const trust = await checkNotaryTrust(workspace).catch((error) => ({
      ok: false,
      reasons: [String(error)]
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
      signDigestWithPolicy({
        workspace,
        kind: "MERKLE_ROOT",
        digestHex: digest
      });
      checks.push({
        id: "notary-sign-smoke",
        status: "PASS",
        message: "Notary signing smoke test succeeded"
      });
    } catch (error) {
      checks.push({
        id: "notary-sign-smoke",
        status: "FAIL",
        message: `Notary signing smoke test failed: ${String(error)}`,
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
        const statusAuth = await requestDoctorStatus(`${gatewayBase}${route}/v1/chat/completions`, { "x-amc-agent-id": "default", authorization: `Bearer ${lease}` }, payload);
        checks.push(doctorCarrierCheck("lease-carrier-authorization", "Authorization carrier", statusAuth));
        const statusXApi = await requestDoctorStatus(`${gatewayBase}${route}/v1/chat/completions`, { "x-amc-agent-id": "default", "x-api-key": lease }, payload);
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
      checks.push({
        id: "gateway-config",
        status: "FAIL",
        message: `Gateway config invalid: ${safeDoctorError(error, workspace)}`,
        fixHint: "Run: amc gateway init"
      });
    }
  }

  pushAdapterChecks(checks, workspace, true);

  const ok = checks.every((row) => row.status !== "FAIL");
  return { ok, checks, mode, workspaceInitialized, strict, liveProbes };
}

import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
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
}

async function httpJsonStatus(url: string, method: "GET" | "POST", headers: Record<string, string>, body?: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const req = httpRequest(
      url,
      {
        method,
        headers: {
          ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body).toString() } : {}),
          ...headers
        }
      },
      (res) => {
        res.resume();
        res.on("end", () => resolvePromise(res.statusCode ?? 0));
      }
    );
    req.on("error", () => resolvePromise(0));
    if (body) {
      req.write(body);
    }
    req.end();
  });
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
    fixHint: "Unlock vault and re-sign with: amc fix-signatures"
  });
}

export async function runDoctorRules(workspace: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number((versions.node ?? "0").split(".")[0] ?? "0");
  checks.push(
    nodeMajor >= 20
      ? { id: "node-version", status: "PASS", message: `Node ${versions.node}` }
      : { id: "node-version", status: "FAIL", message: `Node ${versions.node} is below required >=20`, fixHint: "Install Node.js 20+" }
  );

  const studio = studioStatus(workspace);
  checks.push(
    studio.running
      ? { id: "studio-running", status: "PASS", message: `Studio running on ${studio.state?.host}:${studio.state?.apiPort}` }
      : { id: "studio-running", status: "INFO", message: "Studio is not running (optional — needed for dashboard/API)", fixHint: "Run: amc up" }
  );

  const vault = vaultStatusNow(workspace);
  checks.push(
    vault.unlocked
      ? { id: "vault", status: "PASS", message: "Vault unlocked" }
      : { id: "vault", status: "INFO", message: "Vault locked (normal for fresh install — needed for signing)", fixHint: "Run: amc vault unlock" }
  );

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
  if (trustSig.valid && trustMode === "NOTARY") {
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

    if (studio.running && studio.state) {
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
      const statusAuth = await httpJsonStatus(`${gatewayBase}${route}/v1/chat/completions`, "POST", { "x-amc-agent-id": "default", authorization: `Bearer ${lease}` }, payload);
      checks.push({
        id: "lease-carrier-authorization",
        status: statusAuth === 0 || statusAuth === 401 ? "FAIL" : "PASS",
        message: statusAuth === 0 ? "Gateway request failed" : `Authorization carrier status ${statusAuth}`,
        fixHint: statusAuth === 0 || statusAuth === 401 ? "Check gateway route and lease verification." : undefined
      });
      const statusXApi = await httpJsonStatus(`${gatewayBase}${route}/v1/chat/completions`, "POST", { "x-amc-agent-id": "default", "x-api-key": lease }, payload);
      checks.push({
        id: "lease-carrier-x-api-key",
        status: statusXApi === 0 || statusXApi === 401 ? "FAIL" : "PASS",
        message: statusXApi === 0 ? "Gateway request failed" : `x-api-key carrier status ${statusXApi}`,
        fixHint: statusXApi === 0 || statusXApi === 401 ? "Check gateway route and lease verification." : undefined
      });
    } else {
      checks.push({
        id: "lease-carriers-live",
        status: "WARN",
        message: "Skipped live lease carrier checks (Studio not running)",
        fixHint: "Run: amc up"
      });
    }
  } catch (error) {
    checks.push({
      id: "gateway-config",
      status: "FAIL",
      message: `Gateway config check failed: ${String(error)}`,
      fixHint: "Run: amc gateway init"
    });
  }

  for (const row of adaptersDetectCli({ timeoutMs: 250 })) {
    checks.push({
      id: `adapter-${row.adapterId}`,
      status: row.installed ? "PASS" : "WARN",
      message: row.installed ? `${row.adapterId}: ${row.command} ${row.version ?? ""}`.trim() : `${row.adapterId}: ${row.detail}`,
      fixHint: row.installed ? undefined : `Install/enable ${row.adapterId} CLI or use generic-cli`
    });
  }

  const ok = checks.every((row) => row.status !== "FAIL");
  return { ok, checks };
}

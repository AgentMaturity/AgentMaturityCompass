import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";
import { hashBinaryOrPath, openLedger } from "../ledger/ledger.js";
import { wrapAny } from "../ledger/monitor.js";
import { resolveAgentId } from "../fleet/paths.js";

export interface SandboxRunOptions {
  workspace: string;
  agentId?: string;
  command: string;
  args: string[];
  gatewayRoute?: string;
  gatewayProxyUrl?: string;
  image?: string;
  networkName?: string;
}

function dockerAvailable(): { ok: boolean; version: string } {
  const out = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (out.status !== 0) {
    return {
      ok: false,
      version: ""
    };
  }
  return {
    ok: true,
    version: `${out.stdout ?? ""}${out.stderr ?? ""}`.trim()
  };
}

function maybeContainerEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) {
    return undefined;
  }
  try {
    const parsed = new URL(endpoint);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      parsed.hostname = "host.docker.internal";
      return parsed.toString();
    }
    return endpoint;
  } catch {
    return endpoint;
  }
}

export function buildSandboxDockerArgs(opts: SandboxRunOptions): string[] {
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  const image = opts.image ?? "node:20-alpine";
  const containerRoute = maybeContainerEndpoint(opts.gatewayRoute);
  const containerProxy = maybeContainerEndpoint(opts.gatewayProxyUrl);
  const useGatewayRoute = Boolean(containerRoute && containerRoute.length > 0);
  const useProxy = Boolean(containerProxy && containerProxy.length > 0);

  const args: string[] = ["run", "--rm"];
  if (opts.networkName) {
    args.push("--network", opts.networkName);
  } else if (useGatewayRoute) {
    args.push("--add-host", "host.docker.internal:host-gateway");
    args.push("--network", "bridge");
  } else {
    args.push("--network", "none");
  }
  if (useGatewayRoute || useProxy) {
    args.push("--add-host", "host.docker.internal:host-gateway");
  }

  args.push("-e", `AMC_AGENT_ID=${agentId}`);
  if (containerRoute) {
    args.push("-e", `OPENAI_BASE_URL=${containerRoute}`);
    args.push("-e", `OPENAI_API_BASE=${containerRoute}`);
    args.push("-e", `OPENAI_API_HOST=${containerRoute}`);
    args.push("-e", `AMC_LLM_BASE_URL=${containerRoute}`);
  }
  if (useProxy && containerProxy) {
    args.push("-e", `HTTP_PROXY=${containerProxy}`);
    args.push("-e", `HTTPS_PROXY=${containerProxy}`);
    args.push("-e", "NO_PROXY=localhost,127.0.0.1,::1");
  }

  args.push(image);
  args.push(opts.command);
  args.push(...opts.args);
  return args;
}

function recordSandboxAttestation(params: {
  workspace: string;
  agentId: string;
  image: string;
  command: string;
  args: string[];
  networkName?: string;
  gatewayRoute?: string;
  gatewayProxyUrl?: string;
}): void {
  // P0-55: under AMC_NO_SIGN=1 the attestation shares the unsigned store with the docker session wrapAny records.
  const ledger = openLedger(params.workspace, process.env.AMC_NO_SIGN === "1" ? { store: "unsigned" } : {});
  const sessionId = randomUUID();
  try {
    const version = spawnSync("docker", ["--version"], { encoding: "utf8" });
    const versionText = `${version.stdout ?? ""}${version.stderr ?? ""}`.trim() || "unknown";
    ledger.startSession({
      sessionId,
      runtime: "sandbox",
      binaryPath: "docker",
      binarySha256: hashBinaryOrPath("docker", versionText)
    });

    let imageHash = "unknown";
    try {
      const inspect = spawnSync("docker", ["image", "inspect", "--format", "{{.Id}}", params.image], { encoding: "utf8" });
      if (inspect.status === 0) {
        imageHash = `${inspect.stdout ?? ""}`.trim() || "unknown";
      }
    } catch {
      imageHash = "unknown";
    }

    ledger.appendEvidence({
      sessionId,
      runtime: "sandbox",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "SANDBOX_EXECUTION_ENABLED",
        severity: "LOW",
        agentId: params.agentId,
        image: params.image,
        imageHash,
        command: params.command,
        args: params.args,
        networkMode: params.networkName ? "internal_bridge" : "none",
        networkName: params.networkName ?? null,
        gatewayRoute: params.gatewayRoute ?? null,
        gatewayProxyUrl: params.gatewayProxyUrl ?? null
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: "SANDBOX_EXECUTION_ENABLED",
        severity: "LOW",
        agentId: params.agentId,
        image: params.image,
        imageHash,
        command: params.command,
        args: params.args,
        networkMode: params.networkName ? "internal_bridge" : "none",
        networkName: params.networkName ?? null,
        gatewayRoute: params.gatewayRoute ?? null,
        gatewayProxyUrl: params.gatewayProxyUrl ?? null,
        trustTier: "OBSERVED"
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

export async function runSandboxCommand(opts: SandboxRunOptions): Promise<{
  sessionId: string;
  dockerArgs: string[];
  image: string;
  networkName: string;
}> {
  const docker = dockerAvailable();
  if (!docker.ok) {
    throw new Error("Docker is required for sandbox mode. Install Docker Desktop or Docker Engine and retry.");
  }

  const image = opts.image ?? "node:20-alpine";
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  const networkName = opts.networkName ?? `amc-sandbox-${randomUUID().slice(0, 12)}`;
  const networkCreate = spawnSync("docker", ["network", "create", "--driver", "bridge", "--internal", networkName], {
    encoding: "utf8"
  });
  if (networkCreate.status !== 0) {
    const message = `${networkCreate.stdout ?? ""}${networkCreate.stderr ?? ""}`.trim() || "docker network create failed";
    throw new Error(`Sandbox network setup failed: ${message}`);
  }

  let sessionId = "";
  try {
  const dockerArgs = buildSandboxDockerArgs({
    ...opts,
    agentId,
    image,
    networkName
  });

  recordSandboxAttestation({
    workspace: opts.workspace,
    agentId,
    image,
    command: opts.command,
    args: opts.args,
    networkName,
    gatewayRoute: maybeContainerEndpoint(opts.gatewayRoute),
    gatewayProxyUrl: maybeContainerEndpoint(opts.gatewayProxyUrl)
  });

    sessionId = await wrapAny("docker", dockerArgs, {
      workspace: opts.workspace,
      agentId
    });
    return {
      sessionId,
      dockerArgs,
      image,
      networkName
    };
  } finally {
    const cleanup = spawnSync("docker", ["network", "rm", networkName], { encoding: "utf8" });
    const ledger = openLedger(opts.workspace, process.env.AMC_NO_SIGN === "1" ? { store: "unsigned" } : {});
    const cleanupSession = randomUUID();
    try {
      ledger.startSession({
        sessionId: cleanupSession,
        runtime: "sandbox",
        binaryPath: "docker",
        binarySha256: hashBinaryOrPath("docker", docker.version || "unknown")
      });
      ledger.appendEvidence({
        sessionId: cleanupSession,
        runtime: "sandbox",
        eventType: "audit",
        payload: JSON.stringify({
          auditType: cleanup.status === 0 ? "SANDBOX_NETWORK_CLEANUP_OK" : "SANDBOX_NETWORK_CLEANUP_FAILED",
          severity: cleanup.status === 0 ? "LOW" : "MED",
          networkName,
          output: `${cleanup.stdout ?? ""}${cleanup.stderr ?? ""}`.trim(),
          relatedSessionId: sessionId || null
        }),
        payloadExt: "json",
        inline: true,
        meta: {
          auditType: cleanup.status === 0 ? "SANDBOX_NETWORK_CLEANUP_OK" : "SANDBOX_NETWORK_CLEANUP_FAILED",
          severity: cleanup.status === 0 ? "LOW" : "MED",
          networkName,
          relatedSessionId: sessionId || null,
          agentId,
          trustTier: "OBSERVED"
        }
      });
      ledger.sealSession(cleanupSession);
    } finally {
      ledger.close();
    }
  }
}

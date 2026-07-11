import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import type { AMCConfig, RuntimeName } from "../types.js";
import { openLedger, hashBinaryOrPath } from "./ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import { dummyProviderKeyEnv, stripProviderKeys } from "../utils/providerKeys.js";

function versionProbe(command: string): string {
  const attempts = [["--version"], ["version"], ["-v"]];
  for (const args of attempts) {
    const out = spawnSync(command, args, { encoding: "utf8" });
    if (out.status === 0) {
      return `${out.stdout ?? ""}${out.stderr ?? ""}`.trim();
    }
  }
  return "unknown";
}

function isClosedChildStdinError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return code === "EPIPE" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_WRITE_AFTER_END";
}

async function spawnMonitoredProcess(params: {
  workspace: string;
  runtime: RuntimeName;
  command: string;
  args: string[];
  envExtras?: Record<string, string>;
  meta?: Record<string, unknown>;
}): Promise<string> {
  const ledger = openLedger(params.workspace);
  const sessionId = randomUUID();

  try {
    const version = versionProbe(params.command);
    const binaryHash = hashBinaryOrPath(params.command, version);

    ledger.startSession({
      sessionId,
      runtime: params.runtime,
      binaryPath: params.command,
      binarySha256: binaryHash
    });

    ledger.appendEvidence({
      sessionId,
      runtime: params.runtime,
      eventType: "gateway",
      payload: JSON.stringify({ stage: "process_start", command: params.command, args: params.args, meta: params.meta ?? {} }),
      payloadExt: "json",
      meta: {
        stage: "process_start",
        command: params.command,
        args: params.args,
        ...(params.meta ?? {})
      }
    });

    const child = spawn(params.command, params.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...stripProviderKeys(process.env),
        ...(params.envExtras ?? {}),
        AMC_EVALUATED_AGENT: "1"
      }
    });

    let stdinForwardError: Error | null = null;
    const childStdinErrorHandler = (error: Error): void => {
      if (!isClosedChildStdinError(error) && stdinForwardError === null) {
        stdinForwardError = error;
      }
    };
    child.stdin.on("error", childStdinErrorHandler);

    const stdinHandler = (chunk: Buffer): void => {
      if (
        child.exitCode !== null
        || child.stdin.destroyed
        || child.stdin.writableEnded
        || child.stdin.writableFinished
        || !child.stdin.writable
      ) {
        return;
      }
      ledger.appendEvidence({
        sessionId,
        runtime: params.runtime,
        eventType: "stdin",
        payload: chunk,
        payloadExt: "txt",
        inline: true,
          meta: {
            direction: "user_to_runtime",
            trustTier: "OBSERVED",
            ...(params.meta ?? {})
          }
        });
      try {
        child.stdin.write(chunk);
      } catch (error) {
        childStdinErrorHandler(error instanceof Error ? error : new Error(String(error)));
      }
    };

    process.stdin.on("data", stdinHandler);

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      ledger.appendEvidence({
        sessionId,
        runtime: params.runtime,
        eventType: "stdout",
        payload: chunk,
        payloadExt: "txt",
        inline: true,
          meta: {
            direction: "runtime_to_user",
            trustTier: "OBSERVED",
            ...(params.meta ?? {})
          }
        });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      ledger.appendEvidence({
        sessionId,
        runtime: params.runtime,
        eventType: "stderr",
        payload: chunk,
        payloadExt: "txt",
        inline: true,
          meta: {
            direction: "runtime_to_user",
            trustTier: "OBSERVED",
            ...(params.meta ?? {})
          }
        });
    });

    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        process.stdin.off("data", stdinHandler);
        ledger.appendEvidence({
          sessionId,
          runtime: params.runtime,
          eventType: "metric",
          payload: JSON.stringify({ exitCode: code ?? 1 }),
          payloadExt: "json",
          meta: {
            metricKey: "runtime_exit_code",
            value: code ?? 1,
            trustTier: "OBSERVED",
            ...(params.meta ?? {})
          }
        });
        resolve();
      });
    });

    ledger.sealSession(sessionId);
    child.stdin.off("error", childStdinErrorHandler);
    if (stdinForwardError !== null) {
      throw stdinForwardError;
    }
    return sessionId;
  } finally {
    ledger.close();
  }
}

export async function wrapRuntime(
  runtime: RuntimeName,
  args: string[],
  opts: { workspace: string; config: AMCConfig; commandOverride?: string; agentId?: string }
): Promise<string> {
  const runtimeKey =
    runtime === "claude" || runtime === "gemini" || runtime === "openclaw" || runtime === "mock" || runtime === "any"
      ? runtime
      : "mock";
  const configured = opts.config.runtimes[runtimeKey];
  const command = opts.commandOverride ?? configured.command;
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  return spawnMonitoredProcess({
    workspace: opts.workspace,
    runtime,
    command,
    args,
    meta: {
      mode: "wrap",
      agentId,
      trustTier: "OBSERVED"
    }
  });
}

export async function wrapAny(
  command: string,
  args: string[],
  opts: { workspace: string; agentId?: string }
): Promise<string> {
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  return spawnMonitoredProcess({
    workspace: opts.workspace,
    runtime: "any",
    command,
    args,
    meta: {
      mode: "wrap-any",
      agentId,
      trustTier: "OBSERVED"
    }
  });
}

export async function superviseProcess(
  command: string,
  args: string[],
  opts: {
    workspace: string;
    config: AMCConfig;
    providerRoute: string;
    agentId?: string;
    gatewayProxyUrl?: string;
    providerTemplateId?: string;
  }
): Promise<string> {
  const providerRoute = opts.providerRoute;
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  const proxyEnabled = Boolean(opts.gatewayProxyUrl && opts.config.supervise.includeProxyEnv);
  const proxyValue = opts.gatewayProxyUrl ?? "";
  const extraEnv: Record<string, string> = {
    OPENAI_BASE_URL: providerRoute,
    OPENAI_API_BASE: providerRoute,
    OPENAI_API_HOST: providerRoute,
    AZURE_OPENAI_ENDPOINT: providerRoute,
    ANTHROPIC_BASE_URL: providerRoute,
    GEMINI_BASE_URL: providerRoute,
    COHERE_BASE_URL: providerRoute,
    MISTRAL_BASE_URL: providerRoute,
    AMC_LLM_BASE_URL: providerRoute,
    AMC_AGENT_ID: agentId,
    AMC_GATEWAY_URL: providerRoute,
    ...(process.env.AMC_LEASE ? { AMC_LEASE: process.env.AMC_LEASE } : {}),
    ...dummyProviderKeyEnv(),
    ...(opts.config.supervise.extraEnv ?? {})
  };
  for (const key of opts.config.supervise.customBaseUrlEnvKeys ?? []) {
    if (key.trim().length > 0) {
      extraEnv[key] = providerRoute;
    }
  }
  if (proxyEnabled) {
    extraEnv.HTTP_PROXY = proxyValue;
    extraEnv.HTTPS_PROXY = proxyValue;
    extraEnv.NO_PROXY = "localhost,127.0.0.1,::1";
  }

  return spawnMonitoredProcess({
    workspace: opts.workspace,
    runtime: "any",
    command,
    args,
    envExtras: extraEnv,
    meta: {
      mode: "supervise",
      providerRoute,
      agentId,
      providerTemplateId: opts.providerTemplateId ?? "unknown",
      gatewayProxyUrl: opts.gatewayProxyUrl ?? null,
      trustTier: "OBSERVED"
    }
  });
}

export async function startMonitor(opts: {
  workspace: string;
  runtime: RuntimeName;
  stdin: boolean;
  agentId?: string;
}): Promise<string> {
  const ledger = openLedger(opts.workspace);
  const sessionId = randomUUID();
  const agentId = resolveAgentId(opts.workspace, opts.agentId);

  try {
    ledger.startSession({
      sessionId,
      runtime: opts.runtime,
      binaryPath: "stdin-monitor",
      binarySha256: hashBinaryOrPath("stdin-monitor", "monitor")
    });

    if (opts.stdin) {
      await new Promise<void>((resolve) => {
        process.stdin.on("data", (chunk: Buffer) => {
          ledger.appendEvidence({
            sessionId,
            runtime: opts.runtime,
            eventType: "stdout",
            payload: chunk,
            payloadExt: "txt",
            inline: true,
            meta: { source: "stdin_pipe", trustTier: "OBSERVED", agentId }
          });
        });
        process.stdin.on("end", () => resolve());
      });
    }

    ledger.sealSession(sessionId);
    return sessionId;
  } finally {
    ledger.close();
  }
}

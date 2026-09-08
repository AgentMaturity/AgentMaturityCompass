import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { openLedger, hashBinaryOrPath } from "../ledger/ledger.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { loadAMCConfig } from "../workspace.js";
import { resolveAgentId } from "../fleet/paths.js";
import { loadBudgetsConfig } from "../budgets/budgets.js";
import { runSandboxCommand } from "../sandbox/sandbox.js";
import { issueLeaseToken } from "../leases/leaseSigner.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { ensureDir } from "../utils/fs.js";
import { studioStatus } from "../studio/studioSupervisor.js";
import { getAdapterDefinition } from "./catalog.js";
import { detectAdapter } from "./adapterDetection.js";
import { loadAdaptersConfig, verifyAdaptersConfigSignature } from "./adapterConfigStore.js";
import { assembleAdapterEnv, redactSecretsInText } from "./envAssembler.js";
import type { AdapterRunMode } from "./adapterTypes.js";
import { nodeFetchSnippet } from "./snippets/nodeFetch.js";
import { pythonRequestsSnippet } from "./snippets/pythonRequests.js";
import { PROVIDER_KEY_ENV_NAMES } from "../utils/providerKeys.js";
import { deepseekHarnessCoverage, detectDeepseekHarnessLaunch, prepareDeepseekHarnessLaunch } from "./deepseekHarnessLaunch.js";

function redactWithGatewayRules(text: string, lease: string, regexes: string[]): string {
  let out = redactSecretsInText(text, [lease]);
  for (const pattern of regexes) {
    try {
      const re = new RegExp(pattern.replace(/^\(\?i\)/, ""), "gi");
      out = out.replace(re, "<AMC_REDACTED>");
    } catch {
      // ignore invalid regex patterns
    }
  }
  return out;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface AdapterRunInput {
  workspace: string;
  agentId?: string;
  adapterId?: string;
  workOrderId?: string;
  mode?: AdapterRunMode;
  command: string[];
}

export interface AdapterRunResult {
  sessionId: string;
  adapterId: string;
  mode: AdapterRunMode;
  command: string;
  args: string[];
  routeUrl: string;
  model: string;
  leaseExpiresTs: number;
  forcedSimulate: boolean;
  dashboardUrl: string | null;
  exitCode: number;
  captureCoverage?: ReturnType<typeof deepseekHarnessCoverage> & { stdoutBytes: number; stdoutOmitted: boolean; stderrBytes: number; spawnObserved: boolean };
}

function resolveBudgetLimits(workspace: string, agentId: string): {
  rpm: number;
  tpm: number;
  maxCost: number | null;
} {
  try {
    const cfg = loadBudgetsConfig(workspace);
    const budget = cfg.budgets.perAgent[agentId] ?? cfg.budgets.perAgent.default;
    if (!budget) {
      return {
        rpm: 60,
        tpm: 200_000,
        maxCost: null
      };
    }
    return {
      rpm: budget.perMinute.maxLlmRequests,
      tpm: budget.perMinute.maxLlmTokens,
      maxCost: budget.daily.maxCostUsd
    };
  } catch {
    return {
      rpm: 60,
      tpm: 200_000,
      maxCost: null
    };
  }
}

export async function runAdapterCommand(input: AdapterRunInput): Promise<AdapterRunResult> {
  const workspace = input.workspace;
  const status = studioStatus(workspace);
  if (!status.running || !status.state) {
    throw new Error("AMC Studio is not running. Start it first with: amc up");
  }

  const agentId = resolveAgentId(workspace, input.agentId);
  const adaptersCfg = loadAdaptersConfig(workspace);
  const adaptersSig = verifyAdaptersConfigSignature(workspace);
  const profile = adaptersCfg.adapters.perAgent[agentId];
  const adapterId = input.adapterId ?? profile?.preferredAdapter ?? "generic-cli";
  const adapter = getAdapterDefinition(workspace, adapterId);
  const isDsh = adapter.id === "deepseek-harness";
  // DSH execution probes only the explicitly approved artifact, never a different PATH candidate.
  const detection = isDsh
    ? { installed: false, command: null as string | null, version: null as string | null }
    : detectAdapter(adapter);
  const runtimeConfig = loadAMCConfig(workspace);
  const gatewayConfig = loadGatewayConfig(workspace);
  const activeGatewayBase = `http://${status.state.host}:${status.state.gatewayPort}`;
  const activeProxyBase = `http://${status.state.host}:${status.state.proxyPort}`;
  const routePrefix = profile?.preferredProviderRoute ?? "/openai";
  const route = gatewayConfig.routes.find((row) => row.prefix === routePrefix);
  if (!route) {
    throw new Error(`Configured adapter route not found in gateway config: ${routePrefix}`);
  }
  const routeUrl = `${activeGatewayBase}${routePrefix}`;
  const model = profile?.preferredModel ?? adaptersCfg.adapters.defaults.modelDefault;
  const mode: AdapterRunMode = input.mode ?? profile?.runMode ?? adapter.defaultRunMode;
  const forcedSimulate = !adaptersSig.valid;
  if (isDsh) {
    if (!adaptersSig.valid || profile?.preferredAdapter !== adapter.id || !profile.deepseekHarnessLaunch) {
      throw new Error("DSH requires a valid signed profile selecting deepseek-harness and an approved --launch-config.");
    }
    if (mode !== "SUPERVISE") throw new Error("DSH capture supports SUPERVISE only; AMC does not claim its internal tools are sandboxed by this wrapper.");
    if (!route.openaiCompatible) throw new Error("DSH requires an explicitly OpenAI-compatible gateway route for chat completions.");
    detection.version = detectDeepseekHarnessLaunch(profile.deepseekHarnessLaunch);
    detection.command = profile.deepseekHarnessLaunch.executable.path;
    detection.installed = true;
  }

  const userCommand = input.command ?? [];
  let executable = "";
  let args: string[] = [];
  if (adapter.id === "generic-cli") {
    if (userCommand.length === 0) {
      throw new Error("generic-cli requires a command after `--`.");
    }
    executable = userCommand[0]!;
    args = userCommand.slice(1);
  } else {
    executable = detection.installed && detection.command ? detection.command : adapter.commandTemplate.executable;
    args = [...adapter.commandTemplate.args, ...userCommand];
    if (!executable) {
      throw new Error(`Adapter '${adapter.id}' requires an executable command. Provide one after '--'.`);
    }
    if (!detection.installed && adapter.kind === "CLI") {
      throw new Error(
        `${adapter.displayName} not detected on PATH (${adapter.detection.commandCandidates.join(", ")}). Install the CLI or use: amc adapters run --adapter generic-cli -- <command>`
      );
    }
  }

  const budget = resolveBudgetLimits(workspace, agentId);
  const lease = issueLeaseToken({
    workspace,
    workspaceId: workspaceIdFromDirectory(workspace),
    agentId,
    ttlMs: adaptersCfg.adapters.defaults.leaseTtlMinutes * 60_000,
    scopes: profile?.leaseScopes ?? ["gateway:llm", "toolhub:intent", "toolhub:execute"],
    routeAllowlist: profile?.routeAllowlist ?? [routePrefix],
    modelAllowlist: profile?.modelAllowlist ?? ["*"],
    maxRequestsPerMinute: budget.rpm,
    maxTokensPerMinute: budget.tpm,
    maxCostUsdPerDay: budget.maxCost,
    workOrderId: input.workOrderId ?? null
  });

  const env = assembleAdapterEnv({
    adapter,
    lease: lease.token,
    agentId,
    gatewayBase: activeGatewayBase,
    proxyBase: activeProxyBase,
    providerRoute: routePrefix,
    model,
    workOrderId: input.workOrderId ?? null,
    includeProxyEnv: runtimeConfig.supervise.includeProxyEnv
  });
  env.AMC_REQUESTED_MODE = forcedSimulate ? "SIMULATE" : "EXECUTE";
  env.AMC_ADAPTER_ROUTE = routePrefix;
  env.AMC_ADAPTER_MODE = mode;
  const dshSecrets = [lease.token];
  if (isDsh) {
    // The gateway owns upstream credentials. Custom auth-env names are not in
    // the common provider-key list, so scrub those too before launching DSH.
    for (const upstream of Object.values(gatewayConfig.upstreams)) {
      if (upstream.auth.type === "none") continue;
      const key = upstream.auth.env;
      if (process.env[key]) dshSecrets.push(process.env[key]!);
      delete env[key];
    }
    for (const key of PROVIDER_KEY_ENV_NAMES) if (process.env[key]) dshSecrets.push(process.env[key]!);
    env.DEEPSEEK_API_KEY = lease.token;
    env.DEEPSEEK_BASE_URL = routeUrl;
  }

  if (mode === "SANDBOX") {
    const exports = Object.entries(env)
      .filter((row): row is [string, string] => typeof row[1] === "string")
      .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
      .join(";");
    const cmd = [shellQuote(executable), ...args.map((arg) => shellQuote(arg))].join(" ");
    const script = `${exports}; exec ${cmd}`;
      const sandbox = await runSandboxCommand({
        workspace,
        agentId,
        command: "sh",
        args: ["-lc", script],
        gatewayRoute: routeUrl,
        gatewayProxyUrl: activeProxyBase
      });
    return {
      sessionId: sandbox.sessionId,
      adapterId: adapter.id,
      mode,
      command: executable,
      args,
      routeUrl,
      model,
      leaseExpiresTs: lease.payload.expiresTs,
      forcedSimulate,
      dashboardUrl: status.state ? `http://${status.state.host}:${status.state.dashboardPort}` : null,
      exitCode: 0
    };
  }

  const ledger = openLedger(workspace);
  const sessionId = randomUUID();
  let exitCode = 1;
  let dshLaunch: ReturnType<typeof prepareDeepseekHarnessLaunch> | undefined;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutOmitted = false;
  let spawnObserved = false;
  try {
    if (isDsh) {
      dshLaunch = prepareDeepseekHarnessLaunch({ launch: profile!.deepseekHarnessLaunch!, task: userCommand, routeUrl, model });
      executable = dshLaunch.executable;
      args = dshLaunch.args;
    }
    ledger.startSession({
      sessionId,
      runtime: "any",
      binaryPath: executable,
      binarySha256: hashBinaryOrPath(executable, detection.version ?? "unknown")
    });
    const recordStarted = () => ledger.appendEvidence({
      sessionId,
      runtime: "any",
      eventType: "agent_process_started",
      payload: JSON.stringify({
        adapterId: adapter.id,
        command: executable,
        args: isDsh ? ["--profile", "headless", "--patch", "<private per-launch overlay>", "<task omitted>"] : args,
        ...(isDsh ? {
          taskSha256: createHash("sha256").update(userCommand[0]!).digest("hex"),
          approvedLaunch: profile!.deepseekHarnessLaunch,
          captureCoverage: deepseekHarnessCoverage()
        } : {}),
        mode,
        routeUrl,
        model,
        leaseExpiresTs: lease.payload.expiresTs,
        forcedSimulate,
        workOrderId: input.workOrderId ?? null
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        adapterId: adapter.id,
        mode,
        route: routePrefix,
        model,
        leaseExpiresTs: lease.payload.expiresTs,
        forcedSimulate,
        agentId,
        workOrderId: input.workOrderId ?? null,
        trustTier: "OBSERVED"
      }
    });

    if (!isDsh) recordStarted();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(executable, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        ...(isDsh ? { cwd: workspace } : {})
      });
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      const forwardSignal = (signal: NodeJS.Signals) => {
        child.kill(signal);
        if (!stopTimer) stopTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      };
      const onInterrupt = () => forwardSignal("SIGINT");
      const onTerminate = () => forwardSignal("SIGTERM");
      if (isDsh) {
        process.on("SIGINT", onInterrupt);
        process.on("SIGTERM", onTerminate);
        child.stdin.end();
      }
      child.once("spawn", () => {
        spawnObserved = true;
        if (isDsh) recordStarted();
      });
      const stdoutChunks: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => {
        if (isDsh) {
          stdoutBytes += chunk.length;
          if (stdoutBytes > 1_048_576) { stdoutOmitted = true; stdoutChunks.length = 0; }
          if (!stdoutOmitted) stdoutChunks.push(Buffer.from(chunk));
          return;
        }
        const text = redactWithGatewayRules(chunk.toString("utf8"), lease.token, gatewayConfig.redaction.textRegexDenylist);
        process.stdout.write(text);
        ledger.appendEvidence({
          sessionId,
          runtime: "any",
          eventType: "agent_stdout",
          payload: text,
          payloadExt: "txt",
          inline: true,
          meta: {
            adapterId: adapter.id,
            agentId,
            trustTier: "OBSERVED"
          }
        });
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (isDsh) { stderrBytes += chunk.length; return; }
        const text = redactWithGatewayRules(chunk.toString("utf8"), lease.token, gatewayConfig.redaction.textRegexDenylist);
        process.stderr.write(text);
        ledger.appendEvidence({
          sessionId,
          runtime: "any",
          eventType: "agent_stderr",
          payload: text,
          payloadExt: "txt",
          inline: true,
          meta: {
            adapterId: adapter.id,
            agentId,
            trustTier: "OBSERVED"
          }
        });
      });
      child.on("error", (error) => {
        if (!isDsh) rejectPromise(error);
        // DSH close still follows a failed spawn; retain failure without echoing diagnostics.
      });
      child.on("close", (code, signal) => {
        if (isDsh) {
          process.off("SIGINT", onInterrupt);
          process.off("SIGTERM", onTerminate);
          if (stopTimer) clearTimeout(stopTimer);
          const text = stdoutOmitted ? "<DSH stdout omitted: exceeded 1 MiB>" : redactWithGatewayRules(redactSecretsInText(Buffer.concat(stdoutChunks).toString("utf8"), dshSecrets), lease.token, gatewayConfig.redaction.textRegexDenylist);
          process.stdout.write(text);
          for (const [eventType, payload] of [
            ["agent_stdout", text],
            ["agent_stderr", JSON.stringify({ bytes: stderrBytes, content: "omitted: may contain private reasoning or credentials" })]
          ] as const) ledger.appendEvidence({ sessionId, runtime: "any", eventType, payload, payloadExt: "txt", inline: true, meta: { adapterId: adapter.id, agentId, trustTier: "OBSERVED", evidenceBoundary: "process_only", signal, spawnObserved } });
        }
        exitCode = code ?? 1;
        resolvePromise();
      });
    });

    ledger.appendEvidence({
      sessionId,
      runtime: "any",
      eventType: "agent_process_exited",
      payload: JSON.stringify({ exitCode }),
      payloadExt: "json",
      inline: true,
      meta: {
        adapterId: adapter.id,
        agentId,
        exitCode,
        trustTier: "OBSERVED"
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    try { ledger.close(); } finally { dshLaunch?.dispose(); }
  }

  return {
    sessionId,
    adapterId: adapter.id,
    mode,
    command: executable,
    args: isDsh ? ["--profile", "headless", "--patch", "<private per-launch overlay>", "<task omitted>"] : args,
    routeUrl,
    model,
    leaseExpiresTs: lease.payload.expiresTs,
    forcedSimulate,
    dashboardUrl: status.state ? `http://${status.state.host}:${status.state.dashboardPort}` : null,
    exitCode,
    ...(isDsh ? { captureCoverage: { ...deepseekHarnessCoverage(), stdoutBytes, stdoutOmitted, stderrBytes, spawnObserved } } : {})
  };
}

function nodeSampleScript(sampleName: string, routeUrl: string, agentId: string, importName: string): string {
  return [
    `// ${sampleName} sample generated by AMC`,
    `try { await import(${JSON.stringify(importName)}); } catch (_) {}`,
    nodeFetchSnippet({ routeUrl, agentId })
  ].join("\n\n");
}

function pythonSampleScript(sampleName: string, routeUrl: string, agentId: string, importName: string): string {
  return [
    `# ${sampleName} sample generated by AMC`,
    `try:\n    __import__(${JSON.stringify(importName)})\nexcept Exception:\n    pass`,
    pythonRequestsSnippet({ routeUrl, agentId })
  ].join("\n\n");
}

export function initAdapterProjectSample(params: {
  workspace: string;
  adapterId: string;
  agentId?: string;
  providerRoute?: string;
}): { dir: string; entry: string } {
  const adapter = getAdapterDefinition(params.workspace, params.adapterId);
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const config = loadAdaptersConfig(params.workspace);
  const route = params.providerRoute ?? config.adapters.perAgent[agentId]?.preferredProviderRoute ?? "/openai";
  const routeUrl = `${config.adapters.defaults.gatewayBase}${route}`;
  const dir = join(params.workspace, ".amc", "adapters-samples", adapter.id);
  ensureDir(dir);
  const importMap: Record<string, string> = {
    "langchain-node": "langchain",
    "langchain-python": "langchain",
    "langgraph-python": "langgraph",
    "llamaindex-python": "llama_index",
    "semantic-kernel": "@microsoft/semantic-kernel",
    "openai-agents-sdk": "openai"
  };
  const importName = importMap[adapter.id] ?? "langchain";

  if (adapter.kind === "LIBRARY_NODE") {
    const entry = join(dir, "run.mjs");
    writeFileSync(entry, nodeSampleScript(adapter.displayName, routeUrl, agentId, importName), "utf8");
    return { dir, entry };
  }
  if (adapter.kind === "LIBRARY_PYTHON") {
    const entry = join(dir, "run.py");
    writeFileSync(entry, pythonSampleScript(adapter.displayName, routeUrl, agentId, importName), "utf8");
    return { dir, entry };
  }
  throw new Error(`Adapter ${adapter.id} is not a library adapter`);
}

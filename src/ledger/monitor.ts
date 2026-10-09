import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { AMCConfig, RuntimeName } from "../types.js";
import { openLedger, hashBinaryOrPath } from "./ledger.js";
import { runProcess } from "../exec/runProcess.js";
import { resolveAgentId } from "../fleet/paths.js";
import { dummyProviderKeyEnv, stripProviderKeys } from "../utils/providerKeys.js";

/** How long any single `--version` attempt may take before it is abandoned. */
const VERSION_PROBE_TIMEOUT_MS = 3_000;

/**
 * Ask a binary its version, without trusting it.
 *
 * This runs the program AMC has been asked to observe BEFORE it has been
 * observed at all, so it is the least-trusted spawn in the file and used to be
 * the least careful one. It passed no `env`, which makes Node hand over the
 * parent's -- every provider API key AMC holds -- to an unvetted binary, while
 * the real spawn twenty lines below strips exactly those keys before running
 * the same program. It also passed no `timeout`, so a binary that blocks on
 * `--version` blocked AMC across all three attempts.
 *
 * Exported so the guarantee can be tested directly rather than inferred from
 * the behaviour of the whole wrapper.
 */
export function probeBinaryVersion(command: string): string {
  const attempts = [["--version"], ["version"], ["-v"]];
  for (const args of attempts) {
    const out = spawnSync(command, args, {
      encoding: "utf8",
      env: stripProviderKeys(process.env),
      timeout: VERSION_PROBE_TIMEOUT_MS,
      // A probe has nothing to say to the program and must not inherit a
      // terminal it could read from.
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (out.status === 0) {
      return `${out.stdout ?? ""}${out.stderr ?? ""}`.trim();
    }
  }
  return "unknown";
}

/**
 * Bytes of child output recorded per stream before the log says so and stops.
 *
 * Unbounded was the previous behaviour: a process emitting a gigabyte wrote a
 * gigabyte of signed evidence. A cap alone would be worse than that, because
 * the log would quietly stop describing the run — so hitting it emits a
 * truncation event naming exactly how much went unrecorded.
 */
const MAX_RECORDED_OUTPUT_BYTES = 4 * 1024 * 1024;

/** How long the tree gets between SIGTERM and SIGKILL. */
const TERMINATE_GRACE_MS = 5_000;

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

async function spawnMonitoredProcess(params: {
  workspace: string;
  runtime: RuntimeName;
  command: string;
  args: string[];
  envExtras?: Record<string, string>;
  meta?: Record<string, unknown>;
  scrubValues?: readonly string[];
  signal?: AbortSignal;
  /**
   * Run under a session id the caller already committed to.
   *
   * `amc wrap` has no such commitment and keeps the minted id. A DELEGATED child
   * does: `spawnSubagent` announces `childSessionId` in the parent's signed log
   * before the child runs, so that an unmatched `delegation-started` means "a
   * delegation nobody closed". A child writing under a different id would make
   * that row point at a session which does not exist.
   */
  sessionId?: string;
  cwd?: string;
  /** Kill the child after this long. Absent means no deadline. */
  timeoutMs?: number;
  /**
   * What the child's stdin is connected to.
   *
   * `"forward"` pipes the operator's stdin through, which is the whole point of
   * `amc wrap`. `"close"` sends EOF immediately: a DELEGATED child has no
   * operator at its keyboard, its goal arrives in argv, and anything it read
   * would be AMC's own input stream. Without the EOF a child that reads blocks
   * forever and nothing here stops it.
   */
  stdinMode?: "forward" | "close";
}): Promise<{ sessionId: string; exitCode: number; terminatedBy: string | null }> {
  // P0-55: rows written under AMC_NO_SIGN=1 (evidence collect --first-run, amc wrap) go to the unsigned store.
  const ledger = openLedger(params.workspace, process.env.AMC_NO_SIGN === "1" ? { store: "unsigned" } : {});
  const sessionId = params.sessionId ?? randomUUID();

  try {
    const version = probeBinaryVersion(params.command);
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

    const recorded = { stdout: 0, stderr: 0 };
    const truncationAnnounced = { stdout: false, stderr: false };
    const record = (stream: "stdout" | "stderr", text: string): void => {
      const bytes = Buffer.byteLength(text, "utf8");
      if (recorded[stream] >= MAX_RECORDED_OUTPUT_BYTES) {
        if (!truncationAnnounced[stream]) {
          truncationAnnounced[stream] = true;
          ledger.appendEvidence({
            sessionId,
            runtime: params.runtime,
            eventType: "metric",
            payload: JSON.stringify({ stream, recordedBytes: recorded[stream] }),
            payloadExt: "json",
            meta: {
              metricKey: "runtime_output_truncated",
              value: recorded[stream],
              stream,
              trustTier: "OBSERVED",
              ...(params.meta ?? {})
            }
          });
        }
        return;
      }
      recorded[stream] += bytes;
      ledger.appendEvidence({
        sessionId,
        runtime: params.runtime,
        eventType: stream,
        payload: text,
        payloadExt: "txt",
        inline: true,
        meta: {
          direction: "runtime_to_user",
          trustTier: "OBSERVED",
          ...(params.meta ?? {})
        }
      });
    };

    const running = runProcess({
      argv: [params.command, ...params.args],
      cwd: params.cwd ?? process.cwd(),
      env: {
        ...definedEnv(stripProviderKeys(process.env)),
        ...(params.envExtras ?? {}),
        AMC_EVALUATED_AGENT: "1"
      },
      stdin: "pipe",
      // Tee AND record: the operator and the log see the same scrubbed text,
      // so there is no arrangement in which they disagree.
      stdout: "tee",
      stderr: "tee",
      maxCaptureBytes: MAX_RECORDED_OUTPUT_BYTES,
      scrubValues: params.scrubValues ?? [],
      graceMs: TERMINATE_GRACE_MS,
      ...(params.timeoutMs === undefined ? {} : { timeoutMs: params.timeoutMs }),
      onOutput: record,
      ...(params.signal ? { signal: params.signal } : {})
    });

    const stdinHandler = (chunk: Buffer): void => {
      // Record only what the child actually RECEIVED, at the flush callback.
      // Recording at the call would put input in signed evidence that a child
      // which had already closed its end demonstrably never saw.
      void running.write(chunk).then((delivered) => {
        if (!delivered) return;
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
      });
    };
    if (params.stdinMode === "close") {
      running.endStdin();
    } else {
      process.stdin.on("data", stdinHandler);
    }

    let outcome;
    try {
      outcome = await running.done;
    } catch (error: unknown) {
      // A spawn that never started still opened a session. Sealing it here is
      // the difference between a run that failed and a session that simply
      // stops mid-chain with no explanation.
      if (params.stdinMode !== "close") {
      process.stdin.off("data", stdinHandler);
    }
      ledger.appendEvidence({
        sessionId,
        runtime: params.runtime,
        eventType: "metric",
        payload: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        payloadExt: "json",
        meta: {
          metricKey: "runtime_spawn_failed",
          value: 1,
          trustTier: "OBSERVED",
          ...(params.meta ?? {})
        }
      });
      ledger.sealSession(sessionId);
      throw error;
    }
    if (params.stdinMode !== "close") {
      process.stdin.off("data", stdinHandler);
    }

    ledger.appendEvidence({
      sessionId,
      runtime: params.runtime,
      eventType: "metric",
      payload: JSON.stringify({
        exitCode: outcome.exitCode ?? 1,
        signal: outcome.signal,
        terminatedBy: outcome.terminatedBy,
        treeExitProven: outcome.treeExitProven
      }),
      payloadExt: "json",
      meta: {
        metricKey: "runtime_exit_code",
        value: outcome.exitCode ?? 1,
        signal: outcome.signal,
        terminatedBy: outcome.terminatedBy,
        treeExitProven: outcome.treeExitProven,
        trustTier: "OBSERVED",
        ...(params.meta ?? {})
      }
    });

    ledger.sealSession(sessionId);
    // The exit code goes BACK to the caller, not only into the ledger. It was
    // always recorded as `runtime_exit_code`; discarding it here is why
    // `runAdapterCommand`'s SANDBOX branch could return a hardcoded `exitCode: 0`
    // and report a crashed foreign agent as a success.
    return { sessionId, exitCode: outcome.exitCode ?? 1, terminatedBy: outcome.terminatedBy ?? null };
  } finally {
    ledger.close();
  }
}

export async function wrapRuntime(
  runtime: RuntimeName,
  args: string[],
  opts: { workspace: string; config: AMCConfig; commandOverride?: string; agentId?: string; signal?: AbortSignal }
): Promise<string> {
  const runtimeKey =
    runtime === "claude" || runtime === "gemini" || runtime === "openclaw" || runtime === "mock" || runtime === "any"
      ? runtime
      : "mock";
  const configured = opts.config.runtimes[runtimeKey];
  const command = opts.commandOverride ?? configured.command;
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  return (await spawnMonitoredProcess({
    workspace: opts.workspace,
    runtime,
    command,
    args,
    ...(opts.signal ? { signal: opts.signal } : {}),
    meta: {
      mode: "wrap",
      agentId,
      trustTier: "OBSERVED"
    }
  })).sessionId;
}

export async function wrapAny(
  command: string,
  args: string[],
  opts: { workspace: string; agentId?: string; signal?: AbortSignal }
): Promise<string> {
  const agentId = resolveAgentId(opts.workspace, opts.agentId);
  return (await spawnMonitoredProcess({
    workspace: opts.workspace,
    runtime: "any",
    command,
    args,
    ...(opts.signal ? { signal: opts.signal } : {}),
    meta: {
      mode: "wrap-any",
      agentId,
      trustTier: "OBSERVED"
    }
  })).sessionId;
}

/**
 * Run a foreign process as a DELEGATED child, under an announced session id.
 *
 * The narrow entry point P6.1b needs, and deliberately not `runAdapterCommand`:
 * that requires AMC Studio to be running, mints its own session id, returns only
 * an exit code with no child text, and hardcodes `exitCode: 0` on its SANDBOX
 * branch. This composes the same primitives at the level a subagent runner
 * actually needs.
 *
 * Differences from `superviseProcess`, each load-bearing:
 *   - the session id comes from the caller, because it was already announced;
 *   - the exit code comes back, so a crashed child cannot report success;
 *   - `AMC_LEASE` is NOT inherited from AMC's own environment. `superviseProcess`
 *     passes `process.env.AMC_LEASE` straight through, which would hand a
 *     delegated child the PARENT's full-scope credential and silently ignore any
 *     narrower one minted for it. A child here gets exactly the environment its
 *     caller chose.
 */
export async function spawnGovernedChild(params: {
  workspace: string;
  sessionId: string;
  agentId: string;
  command: string;
  args: readonly string[];
  /** Exactly what the child should carry. Nothing is inherited beyond the fence. */
  envExtras?: Record<string, string>;
  /** Values to scrub from recorded output — the child's own lease, above all. */
  scrubValues?: readonly string[];
  cwd?: string;
  signal?: AbortSignal;
  /** Kill the child after this long. A delegate must not hang its parent's turn. */
  timeoutMs?: number;
}): Promise<{ sessionId: string; exitCode: number; terminatedBy: string | null }> {
  return spawnMonitoredProcess({
    workspace: params.workspace,
    runtime: "any",
    command: params.command,
    args: [...params.args],
    sessionId: params.sessionId,
    ...(params.cwd ? { cwd: params.cwd } : {}),
    ...(params.envExtras ? { envExtras: params.envExtras } : {}),
    ...(params.scrubValues ? { scrubValues: params.scrubValues } : {}),
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.timeoutMs === undefined ? {} : { timeoutMs: params.timeoutMs }),
    // Never "forward": see the note on `stdinMode`.
    stdinMode: "close",
    meta: {
      mode: "delegated-child",
      agentId: params.agentId,
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
    signal?: AbortSignal;
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

  return (await spawnMonitoredProcess({
    workspace: opts.workspace,
    runtime: "any",
    command,
    args,
    envExtras: extraEnv,
    // The lease is a bearer credential handed to the child; a child that echoes
    // it must not put it in the signed log or on the operator's terminal.
    scrubValues: process.env.AMC_LEASE ? [process.env.AMC_LEASE] : [],
    ...(opts.signal ? { signal: opts.signal } : {}),
    meta: {
      mode: "supervise",
      providerRoute,
      agentId,
      providerTemplateId: opts.providerTemplateId ?? "unknown",
      gatewayProxyUrl: opts.gatewayProxyUrl ?? null,
      trustTier: "OBSERVED"
    }
  })).sessionId;
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

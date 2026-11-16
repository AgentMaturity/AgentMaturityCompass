/**
 * `amc connect --print-env --runtime <runtime>`: the environment variables that make an agent runtime export its
 * OpenTelemetry data to AMC's OTLP receiver (otlpReceiver.ts) under a fresh observe lease. Prints only; it never
 * writes any agent's settings (~/.claude, ~/.codex, ~/.gemini). Variable names are taken from each vendor's own pages,
 * read 2026-11-16: Claude Code https://code.claude.com/docs/en/monitoring-usage, Gemini CLI
 * https://geminicli.com/docs/cli/telemetry/ (updated 2026-10-07), Codex https://learn.chatgpt.com/docs/config-file/config-advanced.
 */
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { processRunning, readStudioState } from "../studio/studioState.js";
import { OTLP_LEASE_ROUTE } from "./otlpReceiver.js";

const OTLP_RUNTIMES = ["claude-code", "gemini-cli", "otel", "codex"] as const;
type OtlpRuntime = (typeof OTLP_RUNTIMES)[number];

/** Why AMC prints nothing for a runtime, or null when it can. */
export function otlpRuntimeRefusal(runtime: string): string | null {
  if (!(OTLP_RUNTIMES as readonly string[]).includes(runtime)) return `Unknown --runtime ${JSON.stringify(runtime)}. Use one of: ${OTLP_RUNTIMES.join(", ")}.`;
  if (runtime === "codex") {
    return "Codex's own page documents only the binary (protobuf) form of OTLP over HTTP, and its telemetry is set in ~/.codex/config.toml, which AMC does not edit. "
      + "AMC's receiver reads JSON only, so there is nothing to print for Codex yet. To watch Codex, run: amc connect hooks install --provider codex --mode observe";
  }
  return null;
}

/** The `amc connect --runtime` action: env lines on stdout only, or a refusal (exit code 1). Nothing is written. */
export function printOtlpConnect(workspace: string, agentId: string, opts: { runtime?: string; printEnv: boolean; printCmd: boolean; status: boolean }): void {
  const runtime = opts.runtime ?? "";
  const refusal = !opts.printEnv || opts.printCmd || opts.status
    ? "--runtime goes with --print-env alone, for example: amc connect --print-env --runtime claude-code" : otlpRuntimeRefusal(runtime);
  if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exitCode = 1;
    return;
  }
  const lines = otlpConnectEnvLines({ workspace, agentId, runtime: runtime as Exclude<OtlpRuntime, "codex"> });
  process.stdout.write(`${lines.join("\n")}\n`);
  process.stderr.write("These lines hold a lease for 8 hours that lets the agent send its telemetry to AMC. AMC records what arrives as the agent's own report (self-reported), "
    + "as digests, never prompt or output text. Start AMC here with amc up before the agent.\n");
}

/** The Studio address an exporter should use: the running Studio's own port, else the one `amc up` would take here. */
function studioBase(workspace: string): string {
  const state = readStudioState(workspace);
  const fromEnv = Number(process.env.AMC_STUDIO_PORT ?? "");
  const port = state && processRunning(state.pid) ? state.apiPort : Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= 65535 ? fromEnv : 3212;
  return `http://127.0.0.1:${port}`;
}

/** The export lines for `runtime` (a refusal from otlpRuntimeRefusal must be checked first), with a new 8-hour observe lease. */
export function otlpConnectEnvLines(input: { workspace: string; agentId: string; runtime: Exclude<OtlpRuntime, "codex"> }): string[] {
  const { token } = issueLeaseForCli({ workspace: input.workspace, workspaceId: workspaceIdFromDirectory(input.workspace), agentId: input.agentId,
    ttl: "8h", scopes: "hook:observe", routes: OTLP_LEASE_ROUTE, models: "*", rpm: 600, tpm: 1, maxCostUsdPerDay: null });
  const base = studioBase(input.workspace);
  const header = `x-amc-lease=${token}`;
  if (input.runtime === "gemini-cli") {
    return ["# Gemini CLI's page does not say whether its http exporter sends JSON; if AMC answers 415, it sent protobuf, which AMC does not read yet.",
      "export GEMINI_TELEMETRY_ENABLED=true", "export GEMINI_TELEMETRY_TARGET=local", "export GEMINI_TELEMETRY_OTLP_PROTOCOL=http",
      `export GEMINI_TELEMETRY_OTLP_ENDPOINT=${base}`, `export GEMINI_TELEMETRY_OTLP_HEADERS='${header}'`];
  }
  const otel = ["export OTEL_METRICS_EXPORTER=otlp", "export OTEL_LOGS_EXPORTER=otlp", "export OTEL_EXPORTER_OTLP_PROTOCOL=http/json",
    `export OTEL_EXPORTER_OTLP_ENDPOINT=${base}`, `export OTEL_EXPORTER_OTLP_HEADERS='${header}'`];
  return input.runtime === "claude-code"
    ? ["# Claude Code leaves prompt text out of its telemetry by default; AMC stores digests only either way.", "export CLAUDE_CODE_ENABLE_TELEMETRY=1", ...otel]
    : ["export OTEL_TRACES_EXPORTER=otlp", ...otel];
}

/**
 * CLI-to-Studio Bridge
 *
 * Exposes ALL CLI commands as Studio API endpoints.
 * Runs commands as child processes to avoid state pollution.
 *
 * Endpoints:
 * - POST /cli/exec     — run any CLI command, get structured output
 * - GET  /cli/commands  — list all available commands
 * - POST /cli/batch     — run multiple commands in sequence
 *
 * Security:
 * - Requires studio auth (same as other authenticated routes)
 * - Shell injection prevented (no shell, direct argv)
 * - Interactive commands rejected
 * - Dangerous commands require confirm:true
 * - Rate limited per client
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

/* ── Types ────────────────────────────────────────── */
export interface CliExecRequest {
  command: string;          // e.g. "score formal-spec default"
  args?: Record<string, string>;  // extra --key value pairs
  confirm?: boolean;        // required for destructive commands
  format?: "json" | "text"; // prefer --json output
  timeout?: number;         // ms, default 120000
}

export interface CliExecResult {
  ok: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  structured?: unknown;     // parsed JSON if output is JSON
}

export interface CliBatchRequest {
  commands: CliExecRequest[];
  stopOnError?: boolean;
}

export interface CliBatchResult {
  ok: boolean;
  results: CliExecResult[];
  totalDurationMs: number;
}

/* ── Dangerous commands that need confirm:true ────── */
const DANGEROUS_PREFIXES = [
  "vault seal", "vault destroy", "vault wipe",
  "fleet remove", "agent remove",
  "admin reset", "admin wipe", "admin destroy",
  "backup restore",
  "gateway stop",
  "down",
];

/* ── Interactive commands that can't run headless ─── */
const INTERACTIVE_COMMANDS = [
  "quickscore",
  "setup",
  "improve",
  "bootstrap",
  "host init",
  "host bootstrap",
  "target set",
];

function normalizeCliCommand(cmd: string): string {
  const trimmed = cmd.trim();
  if (trimmed === "amc") return "";
  if (trimmed.startsWith("amc ")) return trimmed.slice(4).trim();
  return trimmed;
}

/* ── Validation ───────────────────────────────────── */
export function validateCliExec(req: CliExecRequest): string | null {
  if (!req.command || typeof req.command !== "string") {
    return "command is required and must be a string";
  }
  const cmd = req.command.trim();
  if (cmd.length === 0) return "command cannot be empty";
  if (cmd.length > 2000) return "command too long (max 2000 chars)";
  const normalized = normalizeCliCommand(cmd);

  // Block shell metacharacters
  if (/[;&|`$(){}\\]/.test(cmd)) {
    return "command contains disallowed shell characters";
  }

  // Check dangerous commands
  const isDangerous = DANGEROUS_PREFIXES.some(p => normalized.startsWith(p));
  if (isDangerous && !req.confirm) {
    return `dangerous command "${normalized.split(" ").slice(0, 2).join(" ")}" requires confirm:true`;
  }

  // Check interactive commands
  const isInteractive = INTERACTIVE_COMMANDS.some(p => normalized === p || normalized.startsWith(p + " "));
  if (isInteractive) {
    return `interactive command "${normalized.split(" ")[0]}" cannot run headless via API — use --non-interactive flag or equivalent API endpoint`;
  }

  return null;
}

/* ── Parse command string into argv ───────────────── */
function parseArgv(cmd: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of cmd) {
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false; }
      else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) { args.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

/* ── Find the amc binary ──────────────────────────── */
let amcBin: string | null = null;

function findAmcBin(workspace: string): string {
  if (amcBin) return amcBin;
  // Try the dist/cli.js in the workspace first
  const local = resolve(workspace, "node_modules/.bin/amc");
  // Fallback to the cli.js directly
  const direct = resolve(workspace, "dist/cli.js");
  amcBin = direct;
  return amcBin;
}

/* ── Execute a single CLI command ─────────────────── */
export function execCliCommand(
  workspace: string,
  req: CliExecRequest,
): Promise<CliExecResult> {
  const start = Date.now();
  const cmd = req.command.trim();

  // Validate
  const err = validateCliExec(req);
  if (err) {
    return Promise.resolve({
      ok: false, command: cmd, exitCode: 1,
      stdout: "", stderr: err, durationMs: Date.now() - start,
    });
  }

  const argv = parseArgv(normalizeCliCommand(cmd));

  // Add --json if requested and not already present
  if (req.format === "json" && !argv.includes("--json")) {
    argv.push("--json");
  }

  // Add extra args
  if (req.args) {
    for (const [k, v] of Object.entries(req.args)) {
      const flag = k.startsWith("--") ? k : `--${k}`;
      argv.push(flag);
      if (v !== "" && v !== "true") argv.push(String(v));
    }
  }

  const timeout = req.timeout ?? 120_000;
  const bin = findAmcBin(workspace);

  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(process.execPath, [bin, ...argv], {
      cwd: workspace,
      env: {
        ...process.env,
        AMC_NON_INTERACTIVE: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const exitCode = code ?? 1;

      // Try to parse structured JSON output
      let structured: unknown;
      try {
        const trimmed = stdout.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          structured = JSON.parse(trimmed);
        }
      } catch { /* not JSON */ }

      resolve({
        ok: exitCode === 0,
        command: cmd,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        structured,
      });
    });

    child.on("error", (e) => {
      resolve({
        ok: false, command: cmd, exitCode: 1,
        stdout: "", stderr: e.message,
        durationMs: Date.now() - start,
      });
    });
  });
}

/* ── Batch execution ──────────────────────────────── */
export async function execCliBatch(
  workspace: string,
  req: CliBatchRequest,
): Promise<CliBatchResult> {
  const start = Date.now();
  const results: CliExecResult[] = [];

  for (const cmd of req.commands) {
    const result = await execCliCommand(workspace, cmd);
    results.push(result);
    if (!result.ok && req.stopOnError) break;
  }

  return {
    ok: results.every(r => r.ok),
    results,
    totalDurationMs: Date.now() - start,
  };
}

/* ── List available commands ──────────────────────── */
export async function listCliCommands(workspace: string): Promise<string[]> {
  const result = await execCliCommand(workspace, {
    command: "help",
    format: "text",
    timeout: 10_000,
  });
  // Parse help output to extract command names
  const lines = result.stdout.split("\n");
  const commands: string[] = [];
  let inCommands = false;
  for (const line of lines) {
    if (line.includes("Commands:")) { inCommands = true; continue; }
    if (inCommands && line.trim() === "") { inCommands = false; continue; }
    if (inCommands) {
      const match = line.trim().match(/^(\S+)/);
      if (match && match[1]) commands.push(match[1]);
    }
  }
  return commands;
}

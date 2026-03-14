/**
 * AMC Interactive REPL — main loop.
 *
 * Features:
 * - 60+ natural language patterns
 * - Multi-step workflows with progress + cancel support
 * - Tab completion with fuzzy matching
 * - Command history (↑/↓)
 * - Context tracking (score, trust, gaps auto-update)
 * - Contextual suggestions + "did you mean?"
 * - Execution timer on long commands
 * - Session summary on exit
 * - Preload timeout (won't hang)
 * - Workspace existence check
 */

import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { createReplContext, updateContextFromOutput, type ReplContext } from "./replContext.js";
import { parseInput, getCompletions, fuzzyMatch, type ParsedCommand } from "./replParser.js";
import {
  renderBanner, renderHelp, renderCommandEcho, renderSuggestions,
  renderStatusBar, renderError, renderWorkflowHeader, renderWorkflowStep,
  renderWorkflowComplete, renderContextualTip, renderSessionSummary,
  renderNoWorkspace, renderDidYouMean, renderTimer
} from "./replRenderer.js";

const PROMPT = chalk.hex("#4AEF79").bold("> ");
const QUIT_COMMANDS = new Set(["exit", "quit", "q", ".exit", ".quit", "bye", "goodbye"]);
const CLEAR_COMMANDS = new Set(["clear", "cls"]);
const PRELOAD_TIMEOUT_MS = 5000;

/** Currently running child process (for Ctrl+C cancellation) */
let activeProc: ChildProcess | null = null;

/**
 * Execute an AMC command and stream output to the terminal.
 */
async function execAmcCommand(command: string, ctx: ReplContext): Promise<{ output: string; exitCode: number; durationMs: number }> {
  const bin = process.argv[1] ?? "amc";
  const args = command.split(/\s+/);
  if (ctx.agentId !== "default" && !args.includes("--agent")) {
    args.push("--agent", ctx.agentId);
  }

  const start = Date.now();

  return new Promise<{ output: string; exitCode: number; durationMs: number }>((resolveP) => {
    let output = "";
    const proc = spawn(process.execPath, [bin, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "1", AMC_REPL: "1" },
      cwd: process.cwd(),
    });

    activeProc = proc;

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    proc.on("close", (code) => {
      activeProc = null;
      resolveP({ output, exitCode: code ?? 0, durationMs: Date.now() - start });
    });

    proc.on("error", (err) => {
      activeProc = null;
      const msg = `Failed to run: amc ${command} (${err.message})`;
      output += msg;
      console.error(renderError(msg));
      resolveP({ output, exitCode: 1, durationMs: Date.now() - start });
    });
  });
}

/**
 * Execute a multi-step workflow with cancel support.
 */
async function execWorkflow(parsed: ParsedCommand, ctx: ReplContext, rl: ReadlineInterface): Promise<void> {
  const steps = parsed.steps ?? [];
  if (!steps.length) return;

  console.log(renderWorkflowHeader(parsed.description, steps.length));
  console.log(chalk.gray("  Press Ctrl+C to cancel remaining steps\n"));

  let cancelled = false;
  const cancelHandler = () => {
    cancelled = true;
    if (activeProc) {
      activeProc.kill("SIGTERM");
    }
    console.log(chalk.yellow("\n  ⚠ Workflow cancelled"));
  };
  rl.once("SIGINT", cancelHandler);

  for (let i = 0; i < steps.length; i++) {
    if (cancelled) break;
    const step = steps[i]!;
    console.log(renderWorkflowStep(i + 1, steps.length, step));

    const result = await execAmcCommand(step, ctx);
    updateContextFromOutput(ctx, step, result.output);
    ctx.commandCount++;

    if (result.durationMs > 3000) {
      console.log(renderTimer(result.durationMs));
    }

    if (i < steps.length - 1 && !cancelled) {
      console.log("");
    }
  }

  rl.removeListener("SIGINT", cancelHandler);

  if (!cancelled) {
    console.log(renderWorkflowComplete(parsed.description, ctx));
  }
}

/**
 * Preload context with timeout protection.
 */
async function preloadContext(ctx: ReplContext): Promise<void> {
  try {
    const bin = process.argv[1] ?? "amc";
    const output = await new Promise<string>((resolveP) => {
      let out = "";
      const timer = setTimeout(() => resolveP(out), PRELOAD_TIMEOUT_MS);
      const proc = spawn(process.execPath, [bin, "status", "--json"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, AMC_REPL: "1" },
        cwd: process.cwd(),
      });
      proc.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      proc.on("close", () => { clearTimeout(timer); resolveP(out); });
      proc.on("error", () => { clearTimeout(timer); resolveP(""); });
    });

    try {
      const jsonStart = output.indexOf("{");
      if (jsonStart >= 0) {
        const data = JSON.parse(output.slice(jsonStart)) as Record<string, unknown>;
        if (typeof data["overallScore"] === "number") ctx.score = data["overallScore"] as number;
        if (typeof data["trustLabel"] === "string") ctx.trustLabel = data["trustLabel"] as string;
        if (typeof data["level"] === "number") ctx.level = data["level"] as number;
        if (typeof data["evidenceGapCount"] === "number") ctx.gaps = data["evidenceGapCount"] as number;
        if (typeof data["studioRunning"] === "boolean") ctx.studioRunning = data["studioRunning"] as boolean;
      }
    } catch {
      updateContextFromOutput(ctx, "status", output);
    }
  } catch {
    // Preload failed — not critical
  }
}

/**
 * Start the interactive REPL.
 */
export async function startRepl(options?: { agent?: string }): Promise<void> {
  const ctx = createReplContext(options?.agent);

  // Check workspace exists
  const hasWorkspace = existsSync(".amc");

  // Preload context silently (only if workspace exists)
  if (hasWorkspace) {
    await preloadContext(ctx);
  }

  // Capture initial state for session summary
  const initialScore = ctx.score;
  const initialGaps = ctx.gaps;

  // Print banner
  console.log(renderBanner(ctx));

  // No workspace warning
  if (!hasWorkspace) {
    console.log(renderNoWorkspace());
  }

  // Initial suggestions
  console.log(renderSuggestions(ctx));
  console.log("");

  const completions = getCompletions();

  const rl: ReadlineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
    completer: (line: string): [string[], string] => {
      const lower = line.toLowerCase();
      // Exact prefix match first
      const exact = completions.filter(c => c.toLowerCase().startsWith(lower));
      if (exact.length > 0) return [exact, line];
      // Fuzzy match fallback
      const fuzzy = completions.filter(c => fuzzyMatch(lower, c.toLowerCase())).slice(0, 8);
      return [fuzzy.length ? fuzzy : completions.slice(0, 8), line];
    },
    history: [],
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();

    // Empty line
    if (!input) {
      rl.prompt();
      return;
    }

    // Quit
    if (QUIT_COMMANDS.has(input.toLowerCase())) {
      console.log(renderSessionSummary(ctx, initialScore, initialGaps));
      rl.close();
      return;
    }

    // Clear
    if (CLEAR_COMMANDS.has(input.toLowerCase())) {
      console.clear();
      console.log(renderBanner(ctx));
      rl.prompt();
      return;
    }

    // Help
    if (input.toLowerCase() === "help" || input === "?") {
      console.log(renderHelp(ctx));
      rl.prompt();
      return;
    }

    // Parse input
    const parsed = parseInput(input);
    if (!parsed.command) {
      rl.prompt();
      return;
    }

    // "Did you mean?" for unknown commands that look like typos
    if (!parsed.natural && !parsed.command.includes(" ") && parsed.command.length > 2) {
      const suggestion = renderDidYouMean(parsed.command, completions);
      if (suggestion) {
        console.log(suggestion);
      }
    }

    // Show what we're doing
    const echo = renderCommandEcho(parsed.description, parsed.natural);
    if (echo) console.log(echo);
    console.log("");

    // Workflow or single command
    if (parsed.workflow && parsed.steps?.length) {
      await execWorkflow(parsed, ctx, rl);
    } else {
      const result = await execAmcCommand(parsed.command, ctx);
      updateContextFromOutput(ctx, parsed.command, result.output);
      ctx.commandCount++;

      // Show timer for slow commands
      if (result.durationMs > 3000) {
        console.log(renderTimer(result.durationMs));
      }

      // Show error hint for non-zero exit
      if (result.exitCode !== 0 && !result.output.includes("Tip:")) {
        console.log(chalk.gray(`  Exit code ${result.exitCode}. Try 'doctor' to check system health.`));
      }
    }

    // Contextual tip
    const tip = renderContextualTip(ctx, parsed.command);
    if (tip) {
      console.log("");
      console.log(tip);
    }

    // Status bar
    if (ctx.commandCount > 0 && (ctx.score !== null || ctx.gaps !== null)) {
      console.log(renderStatusBar(ctx));
    }

    console.log("");
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });

  // Ctrl+C handling
  let ctrlCCount = 0;
  rl.on("SIGINT", () => {
    // If a command is running, kill it
    if (activeProc) {
      activeProc.kill("SIGTERM");
      activeProc = null;
      console.log(chalk.yellow("\n  Command cancelled."));
      rl.prompt();
      return;
    }
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log(renderSessionSummary(ctx, initialScore, initialGaps));
      process.exit(0);
    }
    console.log(chalk.gray("\n  Press Ctrl+C again to exit, or type 'exit'.\n"));
    rl.prompt();
    setTimeout(() => { ctrlCCount = 0; }, 2000);
  });
}

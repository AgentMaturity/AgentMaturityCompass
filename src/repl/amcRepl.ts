/**
 * AMC Interactive REPL — main loop.
 * Drops users into an interactive session where they can use
 * natural language or exact AMC commands.
 */

import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import chalk from "chalk";
import { createReplContext, updateContextFromOutput, type ReplContext } from "./replContext.js";
import { parseInput, getCompletions } from "./replParser.js";
import { renderBanner, renderHelp, renderCommandEcho, renderSuggestions, renderStatusBar, renderError } from "./replRenderer.js";

const PROMPT = chalk.hex("#6366f1").bold("> ");
const QUIT_COMMANDS = new Set(["exit", "quit", "q", ".exit", ".quit"]);
const CLEAR_COMMANDS = new Set(["clear", "cls"]);

/**
 * Find the `amc` binary path — use the same entry point we're running from.
 */
function getAmcBin(): string {
  // process.argv[1] is the CLI entry point
  return process.argv[1] ?? "amc";
}

/**
 * Execute an AMC command and stream output to the terminal.
 * Returns the combined stdout+stderr output.
 */
async function execAmcCommand(command: string, ctx: ReplContext): Promise<string> {
  const bin = getAmcBin();
  const args = command.split(/\s+/);
  // Pass agent flag if not already specified and agent is non-default
  if (ctx.agentId !== "default" && !args.includes("--agent")) {
    args.push("--agent", ctx.agentId);
  }

  return new Promise<string>((resolveP) => {
    let output = "";
    const proc = spawn(process.execPath, [bin, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "1", AMC_REPL: "1" },
      cwd: process.cwd(),
    });

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

    proc.on("close", () => {
      resolveP(output);
    });

    proc.on("error", (err) => {
      const msg = `Failed to run: amc ${command} (${err.message})`;
      output += msg;
      console.error(renderError(msg));
      resolveP(output);
    });
  });
}

/**
 * Preload context by running a quick status check.
 */
async function preloadContext(ctx: ReplContext): Promise<void> {
  try {
    const bin = getAmcBin();
    const output = await new Promise<string>((resolveP) => {
      let out = "";
      const proc = spawn(process.execPath, [bin, "status", "--json"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, AMC_REPL: "1" },
        cwd: process.cwd(),
      });
      proc.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      proc.on("close", () => resolveP(out));
      proc.on("error", () => resolveP(""));
    });

    // Try to parse JSON from status output
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
      // Fall back to regex parsing
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

  // Preload context silently
  await preloadContext(ctx);

  // Print banner
  console.log(renderBanner(ctx));

  // Suggestions on first launch
  if (ctx.score === null) {
    console.log(renderSuggestions(ctx));
    console.log("");
  }

  const completions = getCompletions();

  const rl: ReadlineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
    completer: (line: string): [string[], string] => {
      const hits = completions.filter(c => c.startsWith(line.toLowerCase()));
      return [hits.length ? hits : completions, line];
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
      console.log(chalk.gray(`\n  Session: ${ctx.commandCount} commands. Goodbye.\n`));
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

    // Parse input (natural language or raw command)
    const parsed = parseInput(input);
    if (!parsed.command) {
      rl.prompt();
      return;
    }

    // Show what we're doing (for natural language mappings)
    const echo = renderCommandEcho(parsed.description, parsed.natural);
    if (echo) console.log(echo);

    // Execute
    console.log("");
    const output = await execAmcCommand(parsed.command, ctx);

    // Update context from output
    updateContextFromOutput(ctx, parsed.command, output);

    // Show status bar after commands that change state
    if (ctx.commandCount > 0 && (ctx.commandCount % 3 === 0 || parsed.command.includes("quickscore") || parsed.command.includes("guide"))) {
      console.log("");
      console.log(renderStatusBar(ctx));
    }

    console.log("");
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  rl.on("SIGINT", () => {
    console.log(chalk.gray("\n  (Ctrl+C) Type 'exit' to quit, or press Ctrl+C again.\n"));
    rl.prompt();
  });
}

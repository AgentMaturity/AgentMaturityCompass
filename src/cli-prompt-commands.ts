/**
 * The operator surface for system-prompt assembly (plan P3.3, stage 4).
 *
 * WHAT AN OPERATOR NEEDS AND DID NOT HAVE. A governed agent's system prompt is
 * now assembled from ordered sections plus whatever the workspace's own
 * instruction files say, and until this command existed the only way to see the
 * result was to run a turn and read the `system/prompt` row back out of the
 * signed log. That is a fine way to audit a run and a terrible way to answer
 * "why is my AGENTS.md not reaching the agent" — which, for a product whose
 * whole point is that AMC finally READS the guardrails it writes, is the
 * question people will actually ask.
 *
 * WHY IT IS `system-prompt` AND NOT `prompt`. `amc prompt` is already the
 * Northstar prompt-policy and prompt-pack group — a different thing entirely,
 * about governing the prompts a fleet is allowed to send. Overloading it would
 * blur exactly the distinction ADR-0009 spent effort removing elsewhere.
 *
 * WHY IT IS A HIDDEN GROUP. Hidden commands are internal to
 * `buildCommandInventory`, so the published command-count claim is unaffected —
 * and this is a debugging and integration surface rather than a product one.
 *
 * WHY IT DOES NOT GO THROUGH THE COMPOSED TREE, WHEN `agent-loop run` DOES. The
 * assembly itself lives in src/prompt/, which ships in the npm tarball; the
 * Cordis kernel does not. Routing this through `ctx.amcPrompt` would have made
 * an inspection command that fails on the installs most likely to need it. What
 * prevents the two from drifting is that both build from ONE
 * {@link agentPromptProfile} — the composed service and this command differ in
 * how they are reached, never in what they assemble.
 *
 * THE HONEST CAVEAT, STATED IN THE OUTPUT: this shows the prompt this workspace
 * WOULD assemble now. It is not a reading of any past run. A past run's prompt
 * is in that run's signed log and `amc agent-loop verify` is what reads it.
 */
import chalk from "chalk";
import type { Command } from "commander";
import {
  agentPromptProfile,
  buildAgentPromptRegistry,
  type AgentPromptProfileOptions
} from "./prompt/agentPromptProfile.js";
import { renderContextSections, renderPrompt } from "./prompt/assembly/interpolate.js";
import { PromptAssemblyError } from "./prompt/assembly/promptErrors.js";
import { ContextPluginHost } from "./prompt/context/contextHost.js";
import {
  instructionCandidates,
  INSTRUCTION_PRECEDENCE_STATEMENT,
  STRONGEST_INSTRUCTION_FILE
} from "./prompt/context/instructionPrecedence.js";
import { loadInstructionFiles, type InstructionLoad } from "./prompt/context/instructionFiles.js";

/** The side-effecting edges, injectable so the wiring itself is testable. */
export interface PromptCliIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  /** Marks the run as failed. */
  readonly fail: () => void;
}

const defaultIo: PromptCliIo = {
  log: (line: string) => {
    console.log(line);
  },
  error: (line: string) => {
    console.error(line);
  },
  fail: () => {
    process.exitCode = 1;
  }
};

interface ProfileOptions {
  workspace?: string;
  agent?: string;
  persona?: string;
  approvalGated?: boolean;
  at?: string;
  json?: boolean;
}

interface ShowOptions extends ProfileOptions {
  context?: boolean;
}

/**
 * Turn the shared flags into profile options.
 *
 * `--at` pins the clock. It exists because the time context is sampled at the
 * step boundary, so two runs of `show` differ by a second and a diff of the two
 * is noise; pinning makes the output something a reviewer can compare.
 */
function profileOptionsFrom(opts: ProfileOptions): AgentPromptProfileOptions | null {
  const at = opts.at === undefined ? undefined : Date.parse(opts.at);
  if (at !== undefined && !Number.isFinite(at)) return null;
  return {
    workspace: opts.workspace ?? process.cwd(),
    agentId: opts.agent ?? "default",
    approvalGated: opts.approvalGated === true,
    ...(opts.persona === undefined ? {} : { persona: opts.persona }),
    ...(at === undefined ? {} : { now: (): number => at })
  };
}

/** Shared flags. Declared once so `show` and `sections` cannot drift apart. */
function withProfileOptions(command: Command): Command {
  return command
    .option("--workspace <dir>", "workspace whose instruction files are read (default: cwd)")
    .option("--agent <id>", 'agent the prompt is for, exposed as {{agent_id}} (default "default")')
    .option("--persona <text>", "deployment persona to assemble into the order-0 slot")
    .option(
      "--approval-gated",
      "assemble as a composition whose tool calls really are gated on a signed approval"
    )
    .option("--at <iso>", "pin the clock, so the output is comparable between runs")
    .option("--json", "Output as JSON");
}

/** Report an assembly failure the way it deserves: named, and as a failure. */
function reportAssemblyFailure(io: PromptCliIo, error: unknown): void {
  if (error instanceof PromptAssemblyError) {
    io.error(chalk.red(`prompt assembly failed (${error.reason}): ${error.message}`));
    io.fail();
    return;
  }
  throw error;
}

function renderInstructionReport(load: InstructionLoad, candidates: readonly string[]): string {
  const lines: string[] = [chalk.bold("Instruction files")];
  lines.push(chalk.gray(INSTRUCTION_PRECEDENCE_STATEMENT));
  lines.push("");
  lines.push(chalk.bold(`Searched (weakest first, ${STRONGEST_INSTRUCTION_FILE} wins):`));
  for (const path of candidates) lines.push(`  ${path}`);
  lines.push("");
  if (load.included.length === 0) {
    lines.push(chalk.yellow("Included: none — this workspace has no instruction files."));
  } else {
    lines.push(chalk.bold("Included:"));
    for (const file of load.included) {
      lines.push(`  ${file.candidate.displayPath} (${file.candidate.scope}, ${file.bytes} bytes)`);
    }
  }
  if (load.omitted.length > 0) {
    lines.push("");
    lines.push(chalk.bold(chalk.yellow("Omitted (the model is told about these):")));
    for (const omission of load.omitted) {
      lines.push(`  ${omission.displayPath} — ${omission.reason}: ${omission.detail}`);
    }
  }
  if (load.duplicates.length > 0) {
    lines.push("");
    // Deliberately NOT in the model's context: this is a fact about the
    // harness's deduplication, not guidance about the work.
    lines.push(chalk.bold("Collapsed as byte-identical duplicates:"));
    for (const duplicate of load.duplicates) {
      lines.push(`  ${duplicate.displayPath} == ${duplicate.duplicateOf}`);
    }
  }
  return lines.join("\n");
}

export function registerPromptCommands(program: Command, io: PromptCliIo = defaultIo): void {
  const group = program
    .command("system-prompt", { hidden: true })
    .description("Inspect the system prompt and runtime context a governed agent would run under (internal)");

  withProfileOptions(
    group
      .command("show")
      .description("Print the assembled system prompt this workspace would send")
      .option("--context", "also collect and print the runtime-context snapshot")
  ).action(async (opts: ShowOptions) => {
    const profileOptions = profileOptionsFrom(opts);
    if (profileOptions === null) {
      io.error(chalk.red(`--at must be an ISO 8601 instant (received ${String(opts.at)})`));
      io.fail();
      return;
    }
    const profile = agentPromptProfile(profileOptions);
    try {
      const registry = buildAgentPromptRegistry(profile);
      const host = new ContextPluginHost(profile.contextPlugins);
      host.register(registry);
      if (opts.context === true) {
        // Turn 1, step 1: the boundary a real run's first request is prepared
        // at, so what is printed is what that request would actually carry.
        await host.refresh({ turn: 1, step: 1 });
      }
      const assembly = registry.assemble();
      const prompt = renderPrompt(assembly);
      const contexts = opts.context === true ? renderContextSections(assembly) : [];

      if (opts.json === true) {
        io.log(
          JSON.stringify(
            {
              workspace: profileOptions.workspace,
              agentId: profileOptions.agentId,
              approvalGated: profileOptions.approvalGated === true,
              sections: assembly.sections.map((section) => ({
                name: section.name,
                bytes: Buffer.byteLength(section.text, "utf8")
              })),
              systemPrompt: prompt,
              context: contexts.map((section) => ({ name: section.name, text: section.text }))
            },
            null,
            2
          )
        );
        return;
      }

      io.log(chalk.gray("# The prompt this workspace would assemble now — not a reading of a past run."));
      io.log(chalk.gray(`# Use \`amc agent-loop verify <sessionId>\` for what a run actually sent.`));
      io.log("");
      io.log(prompt);
      for (const section of contexts) {
        io.log("");
        io.log(chalk.bold(`--- runtime context: ${section.name} ---`));
        io.log(section.text);
      }
    } catch (error: unknown) {
      reportAssemblyFailure(io, error);
    }
  });

  withProfileOptions(
    group.command("sections").description("List the prompt sections in the order they assemble")
  ).action((opts: ProfileOptions) => {
    const profileOptions = profileOptionsFrom(opts);
    if (profileOptions === null) {
      io.error(chalk.red(`--at must be an ISO 8601 instant (received ${String(opts.at)})`));
      io.fail();
      return;
    }
    const profile = agentPromptProfile(profileOptions);
    try {
      const registry = buildAgentPromptRegistry(profile);
      const host = new ContextPluginHost(profile.contextPlugins);
      host.register(registry);
      const assembly = registry.assemble();
      const rows = assembly.sections.map((section) => ({
        name: section.name,
        bytes: Buffer.byteLength(section.text, "utf8")
      }));
      if (opts.json === true) {
        io.log(
          JSON.stringify(
            { sections: rows, contexts: assembly.contexts.map((context) => context.name) },
            null,
            2
          )
        );
        return;
      }
      io.log(chalk.bold("System-prompt sections, in assembly order:"));
      rows.forEach((row, index) => {
        io.log(`  ${String(index + 1).padStart(2)}. ${row.name} (${row.bytes} bytes)`);
      });
      io.log("");
      io.log(chalk.bold("Runtime-context contributions, in join order:"));
      for (const context of assembly.contexts) io.log(`  ${context.name}`);
    } catch (error: unknown) {
      reportAssemblyFailure(io, error);
    }
  });

  group
    .command("instructions")
    .description("List the instruction files discovered for this workspace, and which of them apply")
    // Deliberately NOT the shared flag set: a persona, a clock and an approval
    // gate change the PROMPT and change nothing about which files are on disk.
    // Accepting a flag that does nothing is how an operator learns to distrust
    // the output.
    .option("--workspace <dir>", "workspace whose instruction files are read (default: cwd)")
    .option("--json", "Output as JSON")
    .action((opts: { workspace?: string; json?: boolean }) => {
      const workspace = opts.workspace ?? process.cwd();
      const candidates = instructionCandidates({ workspace }).map(
        (candidate) => candidate.displayPath
      );
      const load = loadInstructionFiles({ workspace });
      if (opts.json === true) {
        io.log(
          JSON.stringify(
            {
              workspace,
              searched: candidates,
              included: load.included.map((file) => ({
                displayPath: file.candidate.displayPath,
                scope: file.candidate.scope,
                precedence: file.candidate.precedence,
                bytes: file.bytes
              })),
              omitted: load.omitted,
              duplicates: load.duplicates
            },
            null,
            2
          )
        );
        return;
      }
      io.log(renderInstructionReport(load, candidates));
    });
}

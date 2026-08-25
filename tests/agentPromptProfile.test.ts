import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentPromptProfile,
  buildAgentPromptRegistry,
  GOVERNANCE_SECTION
} from "../src/prompt/agentPromptProfile.js";
import { renderPrompt } from "../src/prompt/assembly/interpolate.js";
import { PromptAssemblyError } from "../src/prompt/assembly/promptErrors.js";
import {
  HARNESS_IDENTITY_SECTION,
  PERSONA_SECTION
} from "../src/prompt/assembly/promptTypes.js";
import { ContextPluginHost } from "../src/prompt/context/contextHost.js";
import { registerPromptCommands, type PromptCliIo } from "../src/cli-prompt-commands.js";
import { amcVersion } from "../src/version.js";

/**
 * P3.3 stage 4 — the profile a native agent runs under, and the operator's view of it.
 *
 * The profile is DATA that three consumers build from: the composed loop, the
 * kernel's `amcPrompt` service, and `amc system-prompt`. These tests are about
 * the two properties that make it worth centralising.
 *
 * ORDER IS DECIDED BY `order`, NEVER BY REGISTRATION. `buildAgentPromptRegistry`
 * registers identity and persona from the constructor and the governance section
 * afterwards — so registration order is identity, persona, governance and
 * assembly order must be identity, governance, persona. Delete the sort in
 * PromptAssemblyRegistry and this file turns red rather than quietly shipping a
 * prompt whose shape depends on which plugin loaded first.
 *
 * EVERY SENTENCE MUST BE TRUE OF THE COMPOSITION THAT EMITS IT. The approval
 * paragraph appears only when the run really gates tool calls; the context
 * paragraph only when context plugins are really mounted. Both are asserted in
 * BOTH directions, because a prompt that promises a guardrail the run does not
 * have is a signed record of a lie told to the model.
 */
const IDENTITY_MARK = "Agent Maturity Compass";
const APPROVAL_MARK = "require signed human approval";
const CONTEXT_MARK = "supersedes every earlier one";

describe("the native-agent prompt profile", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-prompt-profile-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("assembles sections by declared order, not by the order they were registered", () => {
    const profile = agentPromptProfile({
      workspace,
      agentId: "default",
      persona: "You review infrastructure changes.",
      approvalGated: true
    });
    const registry = buildAgentPromptRegistry(profile);

    expect(registry.assemble().sections.map((section) => section.name)).toEqual([
      HARNESS_IDENTITY_SECTION,
      GOVERNANCE_SECTION,
      PERSONA_SECTION
    ]);

    // And the rendered bytes carry the same order — the assertion that matters,
    // because the rendered bytes are what the signed `system/prompt` row holds.
    const prompt = renderPrompt(registry.assemble());
    expect(prompt, "the identity section must be in the rendered bytes").toContain(IDENTITY_MARK);
    expect(prompt.indexOf(IDENTITY_MARK)).toBeLessThan(prompt.indexOf(APPROVAL_MARK));
    expect(prompt.indexOf(APPROVAL_MARK)).toBeLessThan(prompt.indexOf("You review infrastructure changes."));
  });

  it("promises approval ONLY when the composition really gates tool calls", () => {
    const gated = renderPrompt(
      buildAgentPromptRegistry(agentPromptProfile({ workspace, agentId: "a", approvalGated: true })).assemble()
    );
    const ungated = renderPrompt(
      buildAgentPromptRegistry(agentPromptProfile({ workspace, agentId: "a" })).assemble()
    );

    expect(gated).toContain(APPROVAL_MARK);
    // The negative half. A prompt that told an ungoverned run's model that a
    // human stands in front of its tools would be a lie recorded under signature.
    expect(ungated).not.toContain(APPROVAL_MARK);
  });

  it("describes runtime context ONLY when context plugins are mounted", () => {
    const withContext = agentPromptProfile({ workspace, agentId: "a" });
    const without = agentPromptProfile({ workspace, agentId: "a", contextPlugins: [] });

    expect(renderPrompt(buildAgentPromptRegistry(withContext).assemble())).toContain(CONTEXT_MARK);
    expect(renderPrompt(buildAgentPromptRegistry(without).assemble())).not.toContain(CONTEXT_MARK);
    // With nothing to say, the section is not registered at all rather than
    // registered empty: an empty heading costs tokens and says nothing.
    expect(buildAgentPromptRegistry(without).sectionNames()).not.toContain(GOVERNANCE_SECTION);
  });

  it("resolves the run's own facts as variables, and REFUSES an unknown one", () => {
    const resolved = renderPrompt(
      buildAgentPromptRegistry(
        agentPromptProfile({
          workspace,
          agentId: "reviewer-7",
          persona: "You are {{agent_id}} on AMC {{harness_version}}."
        })
      ).assemble()
    );
    expect(resolved).toContain(`You are reviewer-7 on AMC ${amcVersion}.`);

    // The fail-loud half of VERIFY-2, reached the way a deployment would reach
    // it: a persona referencing a name nobody registered. There is no
    // leave-it-as-is and no empty default, because both ship a prompt the
    // deployment did not write while the log records it as one they did.
    const broken = buildAgentPromptRegistry(
      agentPromptProfile({ workspace, agentId: "a", persona: "Escalate to {{oncall_rota}}." })
    );
    expect(() => renderPrompt(broken.assemble())).toThrowError(PromptAssemblyError);
    try {
      renderPrompt(broken.assemble());
      expect.unreachable("an unknown variable must not render");
    } catch (error: unknown) {
      expect((error as PromptAssemblyError).reason).toBe("unknown-variable");
      // Named by the section that referenced it, so the operator knows where to look.
      expect((error as PromptAssemblyError).message).toContain(PERSONA_SECTION);
    }
  });

  it("reads the workspace's own instruction files as runtime context", async () => {
    writeFileSync(join(workspace, "AGENTS.md"), "# House rules\n\nNever force-push to main.\n");
    const profile = agentPromptProfile({ workspace, agentId: "a", amcHome: join(workspace, "no-home") });
    const registry = buildAgentPromptRegistry(profile);
    const host = new ContextPluginHost(profile.contextPlugins);
    host.register(registry);
    await host.refresh({ turn: 1, step: 1 });

    const contexts = registry.assemble().contexts.map((context) => context.text).join("\n");
    expect(contexts).toContain("Never force-push to main.");
    expect(contexts).toContain("AGENTS.md");
  });
});

/** Capture the command surface's three edges without touching the console. */
interface Captured {
  readonly out: string[];
  readonly errors: string[];
  readonly failures: number[];
}

function programWith(): { program: Command; captured: Captured } {
  const out: string[] = [];
  const errors: string[] = [];
  const failures: number[] = [];
  const io: PromptCliIo = {
    log: (line) => out.push(line),
    error: (line) => errors.push(line),
    fail: () => failures.push(1)
  };
  const program = new Command();
  program.exitOverride();
  registerPromptCommands(program, io);
  return { program, captured: { out, errors, failures } };
}

const run = (program: Command, argv: string[]): Promise<unknown> =>
  program.parseAsync(argv, { from: "user" });

describe("amc system-prompt — the operator surface", () => {
  let workspace: string;
  let home: string;
  let priorHome: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-prompt-cli-"));
    home = mkdtempSync(join(tmpdir(), "amc-prompt-home-"));
    // The user scope resolves from $AMC_HOME. Pinned to an empty directory so
    // these assertions are about THIS workspace and never about whatever
    // instruction file the developer running the suite happens to have.
    priorHome = process.env["AMC_HOME"];
    process.env["AMC_HOME"] = home;
    writeFileSync(join(workspace, "AGENTS.md"), "# House rules\n\nNever force-push to main.\n");
  });

  afterEach(() => {
    if (priorHome === undefined) delete process.env["AMC_HOME"];
    else process.env["AMC_HOME"] = priorHome;
    rmSync(workspace, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("is a HIDDEN group, so the published command count is unaffected", () => {
    const { program } = programWith();
    const group = program.commands.find((command) => command.name() === "system-prompt");
    expect(group, "the group must exist").toBeDefined();
    expect((group as unknown as { _hidden?: boolean })._hidden).toBe(true);
    expect(group!.commands.map((command) => command.name()).sort()).toEqual([
      "instructions",
      "sections",
      "show"
    ]);
  });

  it("lists the sections in the order they assemble", async () => {
    const { program, captured } = programWith();
    await run(program, [
      "system-prompt",
      "sections",
      "--workspace",
      workspace,
      "--persona",
      "You review infrastructure changes.",
      "--approval-gated",
      "--json"
    ]);

    expect(captured.failures).toEqual([]);
    const report = JSON.parse(captured.out[0]!) as {
      sections: { name: string }[];
      contexts: string[];
    };
    expect(report.sections.map((section) => section.name)).toEqual([
      HARNESS_IDENTITY_SECTION,
      GOVERNANCE_SECTION,
      PERSONA_SECTION
    ]);
    expect(report.contexts).toEqual(["context:workspace-instructions", "context:time"]);
  });

  it("shows the assembled prompt and, on request, the context it would carry", async () => {
    const { program, captured } = programWith();
    await run(program, [
      "system-prompt",
      "show",
      "--workspace",
      workspace,
      "--context",
      "--at",
      "2026-08-25T09:00:00.000Z",
      "--json"
    ]);

    expect(captured.failures).toEqual([]);
    const report = JSON.parse(captured.out[0]!) as {
      systemPrompt: string;
      context: { name: string; text: string }[];
    };
    expect(report.systemPrompt).toContain(IDENTITY_MARK);
    // Not gated on this invocation, so the approval promise must be absent.
    expect(report.systemPrompt).not.toContain(APPROVAL_MARK);
    const context = report.context.map((section) => section.text).join("\n");
    expect(context).toContain("Never force-push to main.");
    expect(context).toContain("2026-08-25");
  });

  it("lists what was searched, what applied, and refuses to guess when it cannot", async () => {
    const { program, captured } = programWith();
    await run(program, ["system-prompt", "instructions", "--workspace", workspace, "--json"]);

    expect(captured.failures).toEqual([]);
    const report = JSON.parse(captured.out[0]!) as {
      searched: string[];
      included: { displayPath: string; scope: string }[];
    };
    // All four places are reported whether or not a file is there: discovery
    // order is a property of the harness, not of what happens to exist.
    expect(report.searched).toEqual([
      "$AMC_HOME/CLAUDE.md",
      "$AMC_HOME/AGENTS.md",
      "CLAUDE.md",
      "AGENTS.md"
    ]);
    expect(report.included.map((file) => file.displayPath)).toEqual(["AGENTS.md"]);
    expect(report.included[0]?.scope).toBe("project");
  });

  it("fails LOUDLY on an unresolvable variable instead of printing a prompt with a hole", async () => {
    const { program, captured } = programWith();
    await run(program, [
      "system-prompt",
      "show",
      "--workspace",
      workspace,
      "--persona",
      "Escalate to {{oncall_rota}}.",
      "--json"
    ]);

    // The negative test for the fail-loud rule reaching the operator: remove the
    // throw in interpolate.ts and this command would happily print a prompt that
    // no deployment wrote, with exit code 0.
    expect(captured.failures).toEqual([1]);
    expect(captured.out).toEqual([]);
    expect(captured.errors.join("\n")).toContain("unknown-variable");
    expect(captured.errors.join("\n")).toContain("oncall_rota");
  });
});

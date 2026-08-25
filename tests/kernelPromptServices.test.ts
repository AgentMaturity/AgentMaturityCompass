import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Context } from "@amc/cordis";
import { agentPromptProfile, GOVERNANCE_SECTION } from "../src/prompt/agentPromptProfile.js";
import {
  HARNESS_IDENTITY_SECTION,
  PERSONA_SECTION,
  TOOL_GUIDANCE_ORDER
} from "../src/prompt/assembly/promptTypes.js";
import { PROMPT_SEAM, promptServices } from "../src/kernel/services/promptServices.js";
import type { PromptSeamService } from "../src/kernel/services/promptServices.js";

/**
 * P3.3 stage 4 — the prompt seam on the composed tree.
 *
 * Same shape as the P2.1 / P3.0 / P3.1 / P3.2 service tests: the value of
 * composing a capability is that a consumer declaring `inject: ["amcPrompt"]`
 * stays PENDING when nothing provides it, rather than sending a model a bare
 * user message with no identity, no governance statement, and no idea what the
 * workspace's own instruction files say.
 *
 * The third test is the one that is really about COMPOSITION rather than about
 * assembly: a plugin that contributes a section and is then unloaded must stop
 * contributing it. Registration through the service is bound to the fiber that
 * called, so a disposed plugin's tool guidance cannot keep reaching the model
 * from a scope that no longer exists.
 */
const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 20));

describe("the prompt seam on the composed tree", () => {
  let workspace: string;
  let home: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-kernel-prompt-"));
    home = mkdtempSync(join(tmpdir(), "amc-kernel-prompt-home-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const profileFor = (persona?: string): ReturnType<typeof agentPromptProfile> =>
    agentPromptProfile({
      workspace,
      agentId: "default",
      amcHome: home,
      approvalGated: true,
      ...(persona === undefined ? {} : { persona })
    });

  it("leaves a consumer PENDING until something provides amcPrompt", async () => {
    const ctx = new Context();
    const seen: string[] = [];

    ctx.plugin({
      name: "needs-prompt",
      inject: [PROMPT_SEAM.name],
      apply: () => {
        seen.push("applied");
      }
    });
    await settle();
    // PENDING, not "applied with an undefined service": a loop that ran here
    // would be one that sends a model a request with no identity at all.
    expect(seen).toEqual([]);

    const fiber = ctx.plugin(promptServices, { profile: profileFor(), sessionId: "s-1" });
    await fiber.await();
    await settle();
    expect(seen).toEqual(["applied"]);
    await fiber.dispose();
  });

  it("assembles and renders through the tree, and collects the workspace's context", async () => {
    writeFileSync(join(workspace, "AGENTS.md"), "# House rules\n\nNever force-push to main.\n");
    const ctx = new Context();
    const fiber = ctx.plugin(promptServices, {
      profile: profileFor("You review infrastructure changes."),
      sessionId: "s-1"
    });
    await fiber.await();
    const prompt = (ctx as unknown as Record<string, PromptSeamService>)[PROMPT_SEAM.name]!;

    expect(prompt.assemble().sections.map((section) => section.name)).toEqual([
      HARNESS_IDENTITY_SECTION,
      GOVERNANCE_SECTION,
      PERSONA_SECTION
    ]);
    expect(prompt.contextPluginNames).toEqual(["context:workspace-instructions", "context:time"]);

    // Before a refresh the plugins have said nothing, and that reads as silence
    // rather than as an error or as stale text from some other run.
    expect(prompt.contextSections()).toEqual([]);
    await prompt.refreshContext({ turn: 1, step: 1 });
    expect(prompt.contextSections().map((section) => section.text).join("\n")).toContain(
      "Never force-push to main."
    );

    expect(prompt.render()).toContain("You review infrastructure changes.");
    await fiber.dispose();
  });

  it("drops a section when the plugin that registered it unloads", async () => {
    const ctx = new Context();
    const promptFiber = ctx.plugin(promptServices, { profile: profileFor(), sessionId: "s-1" });
    await promptFiber.await();
    const prompt = (ctx as unknown as Record<string, PromptSeamService>)[PROMPT_SEAM.name]!;

    const contributor = ctx.plugin({
      name: "tool-guidance",
      inject: [PROMPT_SEAM.name],
      apply: (child: Context) => {
        // Reached through the CONTEXT, not through a captured reference: that is
        // what binds the registration's disposer to this fiber.
        const seam = (child as unknown as Record<string, PromptSeamService>)[PROMPT_SEAM.name]!;
        seam.section({
          name: "tools:guidance",
          order: TOOL_GUIDANCE_ORDER,
          text: "Prefer the smallest tool that answers the question."
        });
      }
    });
    await contributor.await();
    await settle();
    expect(prompt.sectionNames()).toContain("tools:guidance");
    expect(prompt.render()).toContain("Prefer the smallest tool");

    await contributor.dispose();
    await settle();
    // The negative half: drop the `ctx.effect` binding in PromptSeamService and
    // an unloaded plugin's text keeps reaching the model forever.
    expect(prompt.sectionNames()).not.toContain("tools:guidance");
    expect(prompt.render()).not.toContain("Prefer the smallest tool");
    await promptFiber.dispose();
  });
});

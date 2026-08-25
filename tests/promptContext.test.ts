import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { NO_HOOKS } from "../src/agent/loopTypes.js";
import type { PreStepDecision, PreStepInput } from "../src/agent/loopTypes.js";
import { chooseGuardrailsTarget } from "../src/guide/oneClickFix.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import {
  PromptAssemblyError,
  PromptAssemblyRegistry,
  renderContextSnapshot
} from "../src/prompt/assembly/index.js";
import {
  ContextPluginHost,
  createContextPreStep,
  createInstructionsContextPlugin,
  createTimeContextPlugin,
  instructionCandidates,
  loadInstructionFiles,
  renderInstructionContext,
  STRONGEST_INSTRUCTION_FILE,
  type ContextPlugin
} from "../src/prompt/context/index.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import type { EvidenceEvent } from "../src/types.js";
import { loopHarness, LOOP_MODEL, LOOP_PROVIDER, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

/**
 * P3.3 stage 2 — context plugins, and AMC reading the instruction files it writes.
 *
 * Each test below names the rule it guards and would go RED if that rule were
 * removed. Two of them are checked against the OTHER side of the contract rather
 * than against this code: the precedence test asserts agreement with
 * `chooseGuardrailsTarget` (the writer), and the literal-context test asserts
 * that the same text WOULD throw without the guard — a guard whose absence
 * changes nothing is not a guard.
 *
 * Every test that touches instruction files supplies its own empty AMC home. The
 * operator running this suite may well have a real `~/.config/amc/AGENTS.md`, and
 * a test that read it would pass or fail depending on whose laptop it ran on.
 */

const dirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** A workspace and an empty AMC home, so neither scope leaks in from the host. */
function scopes(): { workspace: string; amcHome: string } {
  return { workspace: tempDir("amc-ctx-ws-"), amcHome: tempDir("amc-ctx-home-") };
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/** A plugin that returns whatever the test tells it to, so order is assertable. */
function staticPlugin(name: string, order: number, text: () => string): ContextPlugin {
  return { name, order, collect: () => Promise.resolve(text()) };
}

describe("P3.3 — instruction precedence agrees with what AMC writes", () => {
  /**
   * RED if the candidate order changes. The list is pure and filesystem-free on
   * purpose: a discovery routine that skipped absent files while building the
   * order would let the filesystem decide precedence.
   */
  test("candidates are ordered weakest-first, deterministically, without touching a disk", () => {
    const candidates = instructionCandidates({ workspace: "/nowhere/ws", amcHome: "/nowhere/home" });

    expect(candidates.map((candidate) => candidate.displayPath)).toEqual([
      "$AMC_HOME/CLAUDE.md",
      "$AMC_HOME/AGENTS.md",
      "CLAUDE.md",
      "AGENTS.md"
    ]);
    expect(candidates.map((candidate) => candidate.precedence)).toEqual([0, 1, 2, 3]);
    // No absolute host path reaches model-visible text: the user scope is shown
    // as $AMC_HOME, which does not carry the operator's account name.
    expect(candidates.every((candidate) => !candidate.displayPath.includes("/nowhere/home"))).toBe(true);
  });

  /**
   * The coherence test, and the one with the most teeth.
   *
   * RED from EITHER side: reordering `KNOWN_AGENT_CONFIGS` so the writer targets
   * CLAUDE.md, or reordering `INSTRUCTION_FILE_NAMES` so the reader ranks
   * CLAUDE.md highest, breaks it. AMC must not author a file it then reads with
   * a different precedence than it documented.
   */
  test("the file AMC writes guardrails into is the file its reader ranks highest", () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(workspace, "AGENTS.md"), "project agents\n");
    writeFileSync(join(workspace, "CLAUDE.md"), "project claude\n");

    const project = instructionCandidates({ workspace, amcHome }).filter(
      (candidate) => candidate.scope === "project"
    );
    const strongest = project[project.length - 1];

    expect(strongest?.fileName).toBe(STRONGEST_INSTRUCTION_FILE);
    expect(chooseGuardrailsTarget(workspace)).toBe(strongest?.fileName);
  });

  /**
   * RED if the scopes are reversed. `runOneClickFix` writes into the WORKSPACE
   * and never into a home directory, so a user-level file that out-ranked the
   * project would out-rank the guardrails AMC itself just wrote.
   */
  test("project scope out-ranks user scope, because that is where AMC writes", () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(amcHome, "AGENTS.md"), "user rule\n");
    writeFileSync(join(workspace, "AGENTS.md"), "project rule\n");

    const candidates = instructionCandidates({ workspace, amcHome });
    expect(candidates[candidates.length - 1]?.scope).toBe("project");

    const text = renderInstructionContext(loadInstructionFiles({ workspace, amcHome }));
    expect(text.indexOf("project rule")).toBeGreaterThan(text.indexOf("user rule"));
    expect(text).toContain("the one listed later wins");
  });
});

describe("P3.3 — a missing instruction file is absent, not an error", () => {
  /** RED if absence became a throw, or if it started emitting a notice. */
  test("a workspace with no instruction files loads to nothing and says nothing", async () => {
    const { workspace, amcHome } = scopes();

    const load = loadInstructionFiles({ workspace, amcHome });
    expect(load.included).toEqual([]);
    expect(load.omitted).toEqual([]);
    expect(load.duplicates).toEqual([]);
    expect(renderInstructionContext(load)).toBe("");

    const plugin = createInstructionsContextPlugin({ workspace, amcHome });
    await expect(plugin.collect({ turn: 1, step: 1 })).resolves.toBe("");
  });

  /**
   * RED if a read failure is classified as absence.
   *
   * This is the failure this project keeps having to fix: the guardrails the
   * operator wrote vanish, and the log records a prompt indistinguishable from
   * one built in a workspace that never had them.
   */
  test("a file that exists but cannot be read is named in the model's context", () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(workspace, "AGENTS.md"), "never delete evidence\n");

    const load = loadInstructionFiles({
      workspace,
      amcHome,
      readTextFile: () => {
        throw new Error("EACCES");
      }
    });

    expect(load.included).toEqual([]);
    expect(load.omitted).toEqual([
      { displayPath: "AGENTS.md", reason: "unreadable", detail: "the file could not be read as UTF-8 text" }
    ]);
    const text = renderInstructionContext(load);
    expect(text).toContain("AGENTS.md could not be read");
    expect(text).toContain("Treat");
  });

  /** RED if a non-file at an instruction path is reported as simple absence. */
  test("a directory sitting where an instruction file belongs is a collision, not an absence", () => {
    const { workspace, amcHome } = scopes();
    mkdirSync(join(workspace, "AGENTS.md"));

    const load = loadInstructionFiles({ workspace, amcHome });
    expect(load.omitted).toHaveLength(1);
    expect(load.omitted[0]?.reason).toBe("unreadable");
    expect(load.omitted[0]?.detail).toContain("not a regular file");
  });
});

describe("P3.3 — the instruction budget drops whole files and says so", () => {
  /**
   * RED if truncation is ever introduced. Half an instruction file is a document
   * whose second half was silently deleted: "always ask before X, except when Y"
   * cut after the comma reverses its own meaning.
   */
  test("an oversize file contributes none of its content", () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(workspace, "AGENTS.md"), "never delete evidence without approval\n");

    const load = loadInstructionFiles({ workspace, amcHome, maxFileBytes: 8 });
    const text = renderInstructionContext(load);

    expect(load.included).toEqual([]);
    expect(load.omitted[0]?.reason).toBe("oversize");
    expect(text).not.toContain("never delete");
    expect(text).toContain("was too large to include");
  });

  /** RED if the total budget were applied weakest-first, keeping the loser. */
  test("the total budget keeps the strongest file and names the one it dropped", () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(amcHome, "AGENTS.md"), "user-scope rule\n");
    writeFileSync(join(workspace, "AGENTS.md"), "project-scope rule\n");

    const load = loadInstructionFiles({ workspace, amcHome, maxTotalBytes: 20 });

    expect(load.included.map((file) => file.candidate.displayPath)).toEqual(["AGENTS.md"]);
    expect(load.omitted).toEqual([
      {
        displayPath: "$AMC_HOME/AGENTS.md",
        reason: "over-budget",
        detail: "dropped to stay within the 20-byte workspace-instruction budget"
      }
    ]);
  });

  /**
   * RED if the collapse kept the weaker path, or if it leaked into the prompt.
   * The path shown has to be the one AMC's own writer would edit.
   */
  test("byte-identical files collapse to the stronger path, and quietly", () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(workspace, "AGENTS.md"), "one rule\n");
    writeFileSync(join(workspace, "CLAUDE.md"), "one rule\n");

    const load = loadInstructionFiles({ workspace, amcHome });
    const text = renderInstructionContext(load);

    expect(load.included.map((file) => file.candidate.displayPath)).toEqual(["AGENTS.md"]);
    expect(load.duplicates).toEqual([{ displayPath: "CLAUDE.md", duplicateOf: "AGENTS.md" }]);
    expect(text).toContain("Instructions from AGENTS.md");
    // The precedence statement names CLAUDE.md as a rule; what must not appear
    // is a second copy of the same content quoted under its own heading.
    expect(text).not.toContain("Instructions from CLAUDE.md");
    expect(text.match(/one rule/g)).toHaveLength(1);
  });
});

describe("P3.3 — a plugin's text is data, never a template", () => {
  /**
   * RED if `literal` is dropped from plugin registrations: `renderContextSnapshot`
   * would throw `unknown-variable` and every request in the session would fail on
   * an instruction file that merely DOCUMENTS a placeholder.
   *
   * The control assertion is what makes this test non-vacuous — the same text in
   * a non-literal context still throws, so the guard is doing the work.
   */
  test("an instruction file that documents {{placeholder}} reaches the model verbatim", async () => {
    const { workspace, amcHome } = scopes();
    writeFileSync(join(workspace, "AGENTS.md"), "Reference {{ticket_id}} in every commit message.\n");

    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    const host = new ContextPluginHost([createInstructionsContextPlugin({ workspace, amcHome })]);
    host.register(registry);
    await host.refresh({ turn: 1, step: 1 });

    expect(renderContextSnapshot(registry.assemble())).toContain("{{ticket_id}}");

    const control = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    control.context({ name: "deployment:note", order: 1, text: "Reference {{ticket_id}}." });
    expect(() => renderContextSnapshot(control.assemble())).toThrow(PromptAssemblyError);
  });
});

describe("P3.3 — the context host", () => {
  /** RED if the host stops sorting: construction order is a plugin-load artifact. */
  test("plugins contribute in declared order, not construction order", async () => {
    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    const host = new ContextPluginHost([
      staticPlugin("context:late", 900, () => "LATE"),
      staticPlugin("context:early", 100, () => "EARLY")
    ]);
    host.register(registry);
    await host.refresh({ turn: 1, step: 1 });

    expect(host.pluginNames).toEqual(["context:early", "context:late"]);
    const snapshot = renderContextSnapshot(registry.assemble());
    expect(snapshot.indexOf("EARLY")).toBeLessThan(snapshot.indexOf("LATE"));
    expect(snapshot).toContain("supersedes earlier runtime-context snapshots");
  });

  /**
   * RED if the cache were merged instead of replaced. A snapshot that kept
   * yesterday's contribution would keep showing the model an instruction file the
   * workspace no longer has — the one failure a "current context" must not have.
   */
  test("a contribution that stops being produced does not survive the next refresh", async () => {
    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    let text = "TRANSIENT";
    const host = new ContextPluginHost([staticPlugin("context:transient", 100, () => text)]);
    host.register(registry);

    await host.refresh({ turn: 1, step: 1 });
    expect(renderContextSnapshot(registry.assemble())).toContain("TRANSIENT");

    text = "";
    await host.refresh({ turn: 1, step: 2 });
    expect(renderContextSnapshot(registry.assemble())).toBe("");
  });

  /** RED if a broken plugin were swallowed: a silent prompt is the bug. */
  test("a plugin that throws stops the refresh and leaves the previous snapshot intact", async () => {
    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    let fail = false;
    const host = new ContextPluginHost([
      staticPlugin("context:stable", 100, () => "STABLE"),
      {
        name: "context:broken",
        order: 200,
        collect: () => (fail ? Promise.reject(new Error("plugin exploded")) : Promise.resolve("OK"))
      }
    ]);
    host.register(registry);
    await host.refresh({ turn: 1, step: 1 });

    fail = true;
    await expect(host.refresh({ turn: 1, step: 2 })).rejects.toThrow("plugin exploded");
    // The cache is swapped in one assignment, so a failed refresh leaves the last
    // good snapshot rather than a half-updated mixture of two boundaries.
    expect(renderContextSnapshot(registry.assemble())).toContain("OK");
  });

  /**
   * RED if the disposer were a no-op. A seam that cannot be torn down leaves its
   * contexts on the registry, and the next composition over the same registry
   * fails on a duplicate name it did not create.
   */
  test("disposing a seam releases the names it registered", () => {
    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    const host = new ContextPluginHost([staticPlugin("context:only", 100, () => "x")]);
    const first = createContextPreStep({ registry, host });
    expect(() => host.register(registry)).toThrow(PromptAssemblyError);

    first.dispose();
    expect(() => createContextPreStep({ registry, host }).dispose()).not.toThrow();
  });

  /** RED if duplicate names were tolerated: two plugins would silently share a slot. */
  test("two plugins may not share a name", () => {
    expect(
      () =>
        new ContextPluginHost([
          staticPlugin("context:same", 1, () => "a"),
          staticPlugin("context:same", 2, () => "b")
        ])
    ).toThrow(PromptAssemblyError);
  });
});

describe("P3.3 — the time context", () => {
  /** RED if the clock were reached for instead of injected: unassertable evidence. */
  test("the reading is deterministic given an injected clock", async () => {
    const plugin = createTimeContextPlugin({
      now: () => 1_700_000_000_000,
      timeZone: "UTC",
      previousMessageAt: () => 1_700_000_000_000 - 3_725_000
    });

    const text = await plugin.collect({ turn: 2, step: 3 });
    expect(text).toContain("turn 2, step 3");
    expect(text).toContain("2023-11-14T22:13:20+00:00[UTC]");
    expect(text).toContain("Elapsed since the preceding model-visible message: 1h 2m 5s.");
  });

  /** RED if an unmeasured gap were rendered as zero rather than as unavailable. */
  test("an unknown elapsed gap is reported as unavailable, not as zero", async () => {
    const plugin = createTimeContextPlugin({ now: () => 1_700_000_000_000, timeZone: "UTC" });
    await expect(plugin.collect({ turn: 1, step: 1 })).resolves.toContain("unavailable");
  });

  /** RED if a typo'd zone silently fell back to UTC and lied forever. */
  test("an invalid IANA zone fails at construction", () => {
    expect(() => createTimeContextPlugin({ timeZone: "Mars/Olympus" })).toThrow(/invalid IANA time zone/);
  });
});

describe("P3.3 — context reaches the model only through the signed spine", () => {
  const open: LoopHarness[] = [];

  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop();
      if (harness === undefined) continue;
      try {
        harness.finish();
      } catch {
        // Already closed. Cleanup, not an assertion.
      }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });

  const indexOfType = (events: readonly EvidenceEvent[], type: string): number =>
    events.findIndex((event) => event.event_type === type);

  /**
   * The stage's load-bearing claim: a plugin contribution is a signed session
   * event BEFORE it is in a request, and the request contains it only because
   * the row exists.
   *
   * RED if a plugin's text ever took a shortcut past the spine — three unsigned
   * side-channels have shipped in this project, and each one began exactly there.
   */
  test("a plugin contribution is a signed row before it is in a request", async () => {
    const harness = loopHarness({ scripts: [textStep("understood")] });
    open.push(harness);
    const amcHome = tempDir("amc-ctx-home-");
    writeFileSync(join(harness.dir, "AGENTS.md"), "Never delete evidence without approval.\n");

    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    const host = new ContextPluginHost([
      createInstructionsContextPlugin({ workspace: harness.dir, amcHome }),
      createTimeContextPlugin({ now: () => 1_700_000_000_000, timeZone: "UTC" })
    ]);
    const seam = createContextPreStep({
      registry,
      host,
      sessionId: harness.sessionId,
      newMessageId: () => "context-message"
    });
    const driver = new AgentDriver({
      session: harness.session,
      llm: harness.llm,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPromptEventId: harness.systemPromptEventId,
      hooks: { ...NO_HOOKS, preStep: seam.preStep }
    });

    driver.followup("what are the rules here?");
    await driver.whenIdle();
    harness.finish();

    const events = harness.events();
    const contextRows = events.filter((event) => {
      if (event.event_type !== "user/message") return false;
      const payload = readEventPayload(harness.dir, event);
      return payload.status === "ok" && payload.bytes.toString("utf8").includes("Never delete evidence");
    });
    expect(contextRows, "the snapshot is committed exactly once").toHaveLength(1);
    const contextRow = contextRows[0]!;

    // 1 — the row precedes the request that carries it.
    const headerIndex = indexOfType(events, "request/header");
    // Not ">= 0": say what is being claimed. A run that issued no request at
    // all would satisfy an index check vacuously while proving nothing about
    // ordering.
    expect(headerIndex, "the run must have issued a request to order against").not.toBe(-1);
    expect(events.indexOf(contextRow)).toBeLessThan(headerIndex);

    // 2 — the row is signed, like every other row of the run.
    expect(contextRow.writer_sig).not.toBe("unsigned");
    expect(contextRow.writer_sig.length).toBeGreaterThan(0);

    // 3 — the request really carries it, and reconstructs from the log alone.
    const header = events[headerIndex]!;
    const derived = deriveRecordedRequest({ workspace: harness.dir, events, headerEventId: header.id });
    expect(derived.status, derived.detail ?? "").toBe("reconstructed");
    expect(derived.bytes).not.toBeNull();
    const body = derived.bytes!.toString("utf8");
    expect(body).toContain("Never delete evidence without approval.");
    expect(body).toContain("2023-11-14T22:13:20+00:00[UTC]");

    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  /** Build the seam over an empty workspace; only the clock contributes. */
  function seamFor(): ReturnType<typeof createContextPreStep> {
    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
    const host = new ContextPluginHost([
      createTimeContextPlugin({ now: () => 1_700_000_000_000, timeZone: "UTC" })
    ]);
    return createContextPreStep({ registry, host, newMessageId: () => "context-message" });
  }

  function preStepInput(step: number): PreStepInput {
    return {
      turn: 1,
      step,
      target: step === 1 ? "next-turn" : "next-step",
      messages: [],
      signal: new AbortController().signal
    };
  }

  /**
   * RED if the veto exception were removed: a rejected step makes no model call,
   * so a `user/message` row written for it would say the model was shown text no
   * request ever carried.
   */
  test("a vetoed step gets no context", async () => {
    const decision = await seamFor().preStep(preStepInput(1), () =>
      Promise.resolve<PreStepDecision>({ kind: "reject", by: "test" })
    );
    expect(decision).toEqual({ kind: "reject", by: "test" });
  });

  /**
   * RED if the no-step-turn exception were removed: the agent would wake with
   * nothing to say, tell the model what time it is, and bill someone for the
   * answer.
   */
  test("context does not manufacture a turn out of nothing", async () => {
    const seam = seamFor();
    const empty = await seam.preStep(preStepInput(1), () =>
      Promise.resolve<PreStepDecision>({ kind: "enter", messages: [] })
    );
    expect(empty).toEqual({ kind: "enter", messages: [] });

    // A step that DID claim something gets the snapshot, appended last so the
    // user's own words precede the runtime facts.
    const claimed = { messageId: "m1", text: "hello", origin: "followup" as const };
    const entered = await seam.preStep(preStepInput(1), () =>
      Promise.resolve<PreStepDecision>({ kind: "enter", messages: [claimed] })
    );
    expect(entered.kind).toBe("enter");
    const messages = entered.kind === "enter" ? entered.messages : [];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(claimed);
    expect(messages[1]?.text).toContain("2023-11-14T22:13:20+00:00[UTC]");
  });
});

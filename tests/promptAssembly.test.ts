import { describe, expect, test } from "vitest";
import {
  DEFAULT_HARNESS_IDENTITY,
  HARNESS_IDENTITY_SECTION,
  PERSONA_SECTION,
  PromptAssemblyError,
  PromptAssemblyRegistry,
  renderContextSnapshot,
  renderPrompt
} from "../src/prompt/assembly/index.js";
import type { PromptAssembly } from "../src/prompt/assembly/index.js";

/**
 * P3.3 stage 1 — system-prompt assembly (VERIFY-1 and VERIFY-2).
 *
 * Every test here guards a rule that goes RED when the rule is removed, and the
 * comment on each names the removal it detects. None of them asserts "current
 * behaviour": a test that pinned what the code happens to do today is how P3.1
 * enshrined a defect, so each case below states a property the prompt must have
 * and would fail on the obvious wrong implementation.
 */

/** A registry with no built-in sections, so an assertion sees only what a test registered. */
function bareRegistry(): PromptAssemblyRegistry {
  return new PromptAssemblyRegistry({ includeHarnessIdentity: false });
}

function sectionNames(assembly: PromptAssembly): readonly string[] {
  return assembly.sections.map((section) => section.name);
}

describe("P3.3 — sections assemble in declared order", () => {
  /** RED if the sort is dropped: Map iteration would hand back registration order. */
  test("declared order wins over registration order", () => {
    const registry = bareRegistry();
    registry.section({ name: "tools", order: 100, text: "use the tools well" });
    registry.section({ name: "identity", order: -100, text: "who you are" });
    registry.section({ name: "persona", order: 0, text: "how you speak" });

    const assembly = registry.assemble();

    expect(sectionNames(assembly)).toEqual(["identity", "persona", "tools"]);
    expect(renderPrompt(assembly)).toBe("who you are\n\nhow you speak\n\nuse the tools well");
  });

  /**
   * RED if the comparator stops tiebreaking by name. `Array.prototype.sort` is
   * stable, so `a.order - b.order` alone returns the two in REGISTRATION order —
   * the exact plugin-load artifact the sort exists to remove, leaking silently
   * and only for ties.
   */
  test("an equal order is broken by name, so a tie cannot leak load order", () => {
    const registry = bareRegistry();
    registry.section({ name: "zeta", order: 50, text: "z" });
    registry.section({ name: "alpha", order: 50, text: "a" });

    expect(sectionNames(registry.assemble())).toEqual(["alpha", "zeta"]);
  });

  /**
   * RED if the sort moves after text resolution. The assembled STRING would still
   * be correct, so only observing the providers catches it — and a provider that
   * reads a counter or a clock is exactly how load order would reach the prompt
   * despite a correct-looking sort.
   */
  test("providers are invoked in assembly order, because the sort precedes resolution", () => {
    const registry = bareRegistry();
    const invoked: string[] = [];
    registry.section({
      name: "last",
      order: 10,
      text: () => {
        invoked.push("last");
        return "L";
      }
    });
    registry.section({
      name: "first",
      order: -10,
      text: () => {
        invoked.push("first");
        return "F";
      }
    });

    registry.assemble();

    expect(invoked).toEqual(["first", "last"]);
  });

  /** RED if the harness identity loses its band: it must precede a deployment persona. */
  test("the harness identity opens the prompt, ahead of the deployment persona", () => {
    const registry = new PromptAssemblyRegistry({ persona: "speak plainly" });

    const assembly = registry.assemble();

    expect(sectionNames(assembly)).toEqual([HARNESS_IDENTITY_SECTION, PERSONA_SECTION]);
    expect(renderPrompt(assembly)).toBe(`${DEFAULT_HARNESS_IDENTITY}\n\nspeak plainly`);
  });

  /**
   * RED if an empty persona is registered as a placeholder: with no scope layers
   * to shadow it, the slot would already be taken and a real persona would be
   * refused as a duplicate.
   */
  test("an unset persona leaves the slot open for a composition that has one", () => {
    const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });

    expect(() => registry.section({ name: PERSONA_SECTION, order: 0, text: "mine" })).not.toThrow();
    expect(sectionNames(registry.assemble())).toEqual([PERSONA_SECTION]);
  });
});

describe("P3.3 — an unresolvable {{var}} fails loud", () => {
  /** RED if the unknown-name check is dropped: the reference would ship verbatim or as "". */
  test("an unknown variable throws, naming it and listing what was registered", () => {
    const registry = bareRegistry();
    registry.variable("branch", () => "main");
    registry.variable("actor", () => "sid");
    registry.section({ name: "body", order: 0, text: "working on {{repo}} today" });

    const assembly = registry.assemble();

    expect(() => renderPrompt(assembly)).toThrow(PromptAssemblyError);
    try {
      renderPrompt(assembly);
      expect.unreachable("an unknown variable must not render");
    } catch (error) {
      const failure = error as PromptAssemblyError;
      expect(failure.reason).toBe("unknown-variable");
      expect(failure.message).toContain('"{{repo}}"');
      expect(failure.message).toContain('section "body"');
      expect(failure.message).toContain("registered variables: actor, branch");
    }
  });

  /**
   * RED if `Object.hasOwn` becomes `in`. `variables` is a plain object, so
   * `"constructor" in variables` is true and `variables.constructor` is a real
   * function — the reference would not merely resolve, it would stringify
   * `function Object() { [native code] }` into the system prompt.
   */
  test("{{constructor}} throws instead of resolving off Object.prototype", () => {
    const registry = bareRegistry();
    registry.section({ name: "body", order: 0, text: "prototype says {{constructor}}" });

    const failure = captureFailure(() => renderPrompt(registry.assemble()));
    expect(failure.reason).toBe("unknown-variable");
    expect(failure.message).toContain("{{constructor}}");
  });

  /**
   * The same rule at the renderer, which is where it has to hold: `renderPrompt`
   * accepts a caller-built assembly, so the `hasOwn` check cannot be delegated to
   * how the registry happens to construct its variables object.
   */
  test("a hand-built assembly gets the same inherited-key refusal", () => {
    const assembly: PromptAssembly = {
      sections: [{ name: "body", order: 0, text: "{{constructor}}" } as { name: string; text: string }],
      contexts: [],
      variables: {}
    };

    expect(captureFailure(() => renderPrompt(assembly)).reason).toBe("unknown-variable");
  });

  /** RED if the `undefined` value check is dropped: the prompt would render "undefined" or "". */
  test("a registered variable with no value for this assembly throws", () => {
    const registry = bareRegistry();
    registry.variable("ticket", () => undefined);
    registry.section({ name: "body", order: 0, text: "ticket {{ticket}}" });

    const failure = captureFailure(() => renderPrompt(registry.assemble()));
    expect(failure.reason).toBe("variable-without-value");
    expect(failure.message).toContain("{{ticket}}");
    expect(failure.message).toContain('section "body"');
  });

  /** RED if the name pattern is not enforced at render. */
  test.each([
    ["{{Repo}}", "an uppercase name"],
    ["{{ repo }}", "padded whitespace"],
    ["{{1st}}", "a leading digit"],
    ["{{}}", "an empty name"]
  ])("a malformed variable name %s (%s) throws", (text) => {
    const registry = bareRegistry();
    registry.variable("repo", () => "amc");
    registry.section({ name: "body", order: 0, text });

    expect(captureFailure(() => renderPrompt(registry.assemble())).reason).toBe(
      "malformed-variable-name"
    );
  });

  /**
   * RED if the "a closing pair exists later" branch is dropped and every
   * unmatched open becomes prose: a typo in a reference would then ship to the
   * model as literal braces instead of being refused.
   */
  test.each([["{{a{b}}"], ["{{{repo}}"], ["{{oops and {{repo}}"]])(
    "a malformed reference group %s is refused, not silently emitted",
    (text) => {
      const registry = bareRegistry();
      registry.variable("repo", () => "amc");
      registry.section({ name: "body", order: 0, text });

      expect(captureFailure(() => renderPrompt(registry.assemble())).reason).toBe(
        "malformed-reference"
      );
    }
  );

  /**
   * RED if the prose branch stops resuming the scan: a trailing unmatched `{{`
   * after a resolved reference must not retroactively poison the reference
   * before it, because the earlier `}}` belongs to that reference and not to it.
   */
  test("an unmatched {{ after a resolved reference is prose, not a broken group", () => {
    const registry = bareRegistry();
    registry.variable("repo", () => "amc");
    registry.section({ name: "body", order: 0, text: "{{repo}} and {{oops" });

    expect(renderPrompt(registry.assemble())).toBe("amc and {{oops");
  });

  /**
   * RED if the malformed-reference branch swallows the prose case too. A prompt
   * that instructs a model to emit `{{` must remain assemblable, or the harness
   * cannot document its own syntax.
   */
  test("braces that never close are literal prose", () => {
    const registry = bareRegistry();
    registry.section({ name: "body", order: 0, text: "emit {{ to open a reference" });

    expect(renderPrompt(registry.assemble())).toBe("emit {{ to open a reference");
  });

  /**
   * RED if substituted values are re-scanned. This is the injection guard: a
   * variable value is runtime data — a branch name, a file path, a user's words —
   * and re-scanning would let whatever reaches a VALUE reach the variable
   * NAMESPACE. The unregistered reference makes the failure loud: a re-scanning
   * implementation throws unknown-variable here instead of returning text.
   */
  test("a value containing {{other}} is not re-scanned", () => {
    const registry = bareRegistry();
    registry.variable("branch", () => "feature/{{secret}}");
    registry.variable("known", () => "resolved");
    registry.section({ name: "body", order: 0, text: "on {{branch}} with {{known}}" });

    expect(renderPrompt(registry.assemble())).toBe("on feature/{{secret}} with resolved");
  });

  /** RED if re-scanning is added: a value naming a REGISTERED variable must still stay literal. */
  test("a value naming a registered variable stays literal too", () => {
    const registry = bareRegistry();
    registry.variable("outer", () => "{{inner}}");
    registry.variable("inner", () => "SUBSTITUTED");
    registry.section({ name: "body", order: 0, text: "value is {{outer}}" });

    expect(renderPrompt(registry.assemble())).toBe("value is {{inner}}");
  });

  /** RED if the renderer stops attributing failures, which is what makes them fixable. */
  test("a context failure is attributed to the context, not to a section", () => {
    const registry = bareRegistry();
    registry.context({ name: "clock", order: 0, text: "it is {{now}}" });

    const failure = captureFailure(() => renderContextSnapshot(registry.assemble()));
    expect(failure.reason).toBe("unknown-variable");
    expect(failure.message).toContain('context "clock"');
  });
});

describe("P3.3 — the complete-prompt override", () => {
  /**
   * RED if the count check is dropped. Without it one of the two would silently
   * win by sort order, and the signed log would record a prompt nobody chose.
   */
  test("two active complete sections fail assembly, naming both", () => {
    const registry = bareRegistry();
    registry.section({ name: "eval-harness", order: 10, text: "A", complete: true });
    registry.section({ name: "red-team", order: 20, text: "B", complete: true });

    const failure = captureFailure(() => registry.assemble());
    expect(failure.reason).toBe("multiple-complete-sections");
    expect(failure.message).toContain("eval-harness");
    expect(failure.message).toContain("red-team");
  });

  /** RED if `complete` stops replacing the list: the other sections would come along. */
  test("one complete section is the sole section", () => {
    const registry = new PromptAssemblyRegistry({ persona: "speak plainly" });
    registry.section({ name: "override", order: 500, text: "ONLY THIS", complete: true });

    const assembly = registry.assemble();

    expect(sectionNames(assembly)).toEqual(["override"]);
    expect(renderPrompt(assembly)).toBe("ONLY THIS");
  });

  /**
   * RED if the override is widened to blank the whole assembly. Overriding the
   * system prompt is a statement about the system prompt; it is not a claim that
   * the runtime facts stopped being true, and dropping them would quietly strip
   * the snapshot the model needs.
   */
  test("a complete section still leaves contexts and variables resolved", () => {
    const registry = bareRegistry();
    registry.variable("repo", () => "amc");
    registry.context({ name: "cwd", order: 0, text: "cwd is /w/{{repo}}" });
    registry.section({ name: "override", order: 0, text: "ONLY {{repo}}", complete: true });

    const assembly = registry.assemble();

    expect(renderPrompt(assembly)).toBe("ONLY amc");
    expect(renderContextSnapshot(assembly)).toContain("cwd is /w/amc");
    expect(assembly.variables.repo).toBe("amc");
  });
});

describe("P3.3 — the registration contract", () => {
  /** RED if duplicates are allowed: the second registration would silently shadow the first. */
  test("a duplicate section name is refused", () => {
    const registry = bareRegistry();
    registry.section({ name: "body", order: 0, text: "first" });

    const failure = captureFailure(() => registry.section({ name: "body", order: 5, text: "second" }));
    expect(failure.reason).toBe("duplicate-registration");
  });

  /**
   * RED if a disposer deletes by name alone: a disposer captured before the name
   * was re-registered would remove the replacement it never owned.
   */
  test("a disposer removes only its own registration", () => {
    const registry = bareRegistry();
    const dispose = registry.section({ name: "body", order: 0, text: "first" });
    dispose();
    registry.section({ name: "body", order: 0, text: "second" });

    dispose();

    expect(renderPrompt(registry.assemble())).toBe("second");
  });

  /** RED if the order is not validated: NaN sorts unpredictably and the prompt order becomes luck. */
  test.each([[Number.NaN], [Number.POSITIVE_INFINITY]])("a non-finite order %s is refused", (order) => {
    const registry = bareRegistry();

    expect(captureFailure(() => registry.section({ name: "body", order, text: "x" })).reason).toBe(
      "invalid-order"
    );
  });

  /**
   * RED if names are validated only at render. A variable registered as `Repo`
   * can never be referenced, and finding that at render blames the section that
   * wrote `{{repo}}` — the one place that was right.
   */
  test("a variable name references cannot spell is refused at registration", () => {
    const registry = bareRegistry();

    expect(captureFailure(() => registry.variable("Repo", () => "amc")).reason).toBe(
      "invalid-variable-name"
    );
  });

  /** RED if the context sort is dropped, or if empty contributions stop being dropped. */
  test("contexts join in declared order and empty ones contribute nothing", () => {
    const registry = bareRegistry();
    registry.context({ name: "files", order: 20, text: "3 files open" });
    registry.context({ name: "clock", order: 10, text: "12:00" });
    registry.context({ name: "silent", order: 15, text: "" });

    const snapshot = renderContextSnapshot(registry.assemble());

    expect(snapshot).toContain("12:00\n\n3 files open");
    expect(snapshot.split("\n\n")).toHaveLength(3);
  });

  /** RED if an empty section stops being dropped: the prompt would open on blank lines. */
  test("an empty section contributes nothing to the rendered prompt", () => {
    const registry = bareRegistry();
    registry.section({ name: "blank", order: -1, text: "" });
    registry.section({ name: "body", order: 0, text: "text" });

    expect(renderPrompt(registry.assemble())).toBe("text");
  });

  /** RED if providers stop receiving the assembly context they were promised. */
  test("providers see the per-assembly context", () => {
    const registry = bareRegistry();
    registry.variable("session", (context) => context.sessionId ?? "none");
    registry.section({ name: "body", order: 0, text: "session {{session}}" });

    expect(renderPrompt(registry.assemble({ sessionId: "s-1" }))).toBe("session s-1");
    expect(renderPrompt(registry.assemble())).toBe("session none");
  });
});

/** Run `act`, require it to throw a PromptAssemblyError, and return it for inspection. */
function captureFailure(act: () => unknown): PromptAssemblyError {
  try {
    act();
  } catch (error) {
    if (error instanceof PromptAssemblyError) return error;
    throw error;
  }
  throw new Error("expected a PromptAssemblyError, but nothing was thrown");
}

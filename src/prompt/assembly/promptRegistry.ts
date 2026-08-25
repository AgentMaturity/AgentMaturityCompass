/**
 * The registry that builds one system prompt (plan P3.3, VERIFY-1).
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: registration order is a plugin-load
 * artifact and must never reach the model. Which plugin happened to load first
 * depends on config file ordering, on filesystem iteration, on whether a lazy
 * import resolved before another — none of which anybody chose, and all of which
 * differ between an operator's laptop and CI. So sections carry an explicit
 * `order`, and `assemble()` SORTS BEFORE IT RESOLVES: the sort runs over the
 * registered definitions, and only then is each `text` provider invoked. Sorting
 * afterwards would produce the same string while still letting a provider
 * observe — and act on — the load order, and a provider that reads a counter or
 * a clock would then bake that artifact into the prompt anyway.
 *
 * THE SORT IS TOTAL. `order` alone is not a total order: two sections may
 * legitimately share one. `Array.prototype.sort` is stable, so a comparator that
 * returned 0 for ties would fall back to insertion order — which is registration
 * order — and the leak would be back, invisibly, only for ties. The tiebreak is a
 * code-unit name comparison (`<` / `>`, never `localeCompare`), so the result is
 * byte-identical on every machine regardless of locale or ICU version.
 *
 * WHY A PLAIN CLASS AND NOT A CORDIS SERVICE. Because src/prompt/ ships in the
 * published npm tarball and the vendored kernel packages do not (the
 * architecture-boundaries gate enforces exactly that). The composed service that
 * exposes this on the tree belongs under src/kernel/, wrapping this, in the same
 * shape P3.2 used for the agent loop: one implementation here, delegation there.
 *
 * NO SCOPE LAYERS. dsh shadows a global section with a scoped one of the same
 * name. AMC has no scope package yet, so shadowing is not available and a
 * duplicate name is simply refused. That drives one visible difference: an empty
 * persona is NOT registered as a placeholder, because occupying the slot with
 * nothing would turn the deployment's real persona into a duplicate-name
 * failure. An unset persona leaves the slot open for whoever has one.
 */
import { PromptAssemblyError } from "./promptErrors.js";
import {
  HARNESS_IDENTITY_ORDER,
  HARNESS_IDENTITY_SECTION,
  PERSONA_ORDER,
  PERSONA_SECTION,
  VARIABLE_NAME_PATTERN,
  type AssembleContext,
  type AssembledContext,
  type AssembledSection,
  type PromptAssembly,
  type PromptContext,
  type PromptSection,
  type PromptTextProvider,
  type PromptVariableProvider
} from "./promptTypes.js";

/**
 * The harness-identity text AMC opens with when a composition does not replace it.
 *
 * It states the evidence property because that property is TRUE of a native AMC
 * session (P2.2: every event is signed and hash-chained) and because a model that
 * knows its actions are recorded behaves like one that knows. Nothing here
 * promises the model anything AMC does not already do.
 */
export const DEFAULT_HARNESS_IDENTITY =
  "You are an AI agent operating under Agent Maturity Compass. " +
  "Every request, tool call, and result in this session is recorded as signed, " +
  "hash-chained evidence that an auditor can replay.";

/** What a deployment supplies when it constructs the registry. */
export interface PromptRegistryOptions {
  /** Open with the harness identity at order -100 (default true). */
  readonly includeHarnessIdentity?: boolean;
  /** Override the identity text without giving up the slot's order. */
  readonly harnessIdentity?: string;
  /**
   * The deployment's order-0 persona. Omitted or empty leaves the slot
   * unregistered — see the module header for why an empty placeholder would be
   * worse than an absent one.
   */
  readonly persona?: string;
}

/** Anything the registry sorts: a name and an order. */
interface OrderedEntry {
  readonly name: string;
  readonly order: number;
}

/**
 * Total comparison: order first, then a locale-independent name comparison.
 *
 * `localeCompare` is deliberately not used — it varies with the host's locale and
 * ICU build, which would make the prompt differ between machines.
 */
function compareOrdered(a: OrderedEntry, b: OrderedEntry): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Resolve a static-or-provider text for one assembly. */
function resolveText(text: string | PromptTextProvider, context: AssembleContext): string {
  return typeof text === "function" ? text(context) : text;
}

/**
 * Insert into a name-keyed map, refusing a duplicate, and return a disposer that
 * removes only THIS registration.
 *
 * The identity check on removal matters: a disposer captured before a name was
 * re-registered must not delete the replacement it never owned.
 */
function insertNamed<T>(store: Map<string, T>, name: string, value: T, what: string): () => void {
  if (store.has(name)) {
    throw new PromptAssemblyError(
      "duplicate-registration",
      `prompt ${what} "${name}" is already registered`
    );
  }
  store.set(name, value);
  return () => {
    if (store.get(name) === value) store.delete(name);
  };
}

/** Reject a non-finite order at REGISTRATION, where the caller can still be named. */
function requireFiniteOrder(what: string, name: string, order: number): void {
  if (!Number.isFinite(order)) {
    throw new PromptAssemblyError(
      "invalid-order",
      `prompt ${what} "${name}" order must be a finite number (received ${String(order)})`
    );
  }
}

/** The registry of everything that contributes to one system prompt. */
export class PromptAssemblyRegistry {
  private readonly sections = new Map<string, PromptSection>();
  private readonly contexts = new Map<string, PromptContext>();
  private readonly variables = new Map<string, PromptVariableProvider>();

  constructor(options: PromptRegistryOptions = {}) {
    if (options.includeHarnessIdentity !== false) {
      this.section({
        name: HARNESS_IDENTITY_SECTION,
        order: HARNESS_IDENTITY_ORDER,
        text: options.harnessIdentity ?? DEFAULT_HARNESS_IDENTITY
      });
    }
    const persona = options.persona ?? "";
    if (persona.length > 0) {
      this.section({ name: PERSONA_SECTION, order: PERSONA_ORDER, text: persona });
    }
  }

  /**
   * Register an ordered prompt section.
   *
   * @param section - the section to register.
   * @returns a disposer that removes this exact registration.
   * @throws PromptAssemblyError on a duplicate name or a non-finite order.
   */
  section(section: PromptSection): () => void {
    requireFiniteOrder("section", section.name, section.order);
    return insertNamed(this.sections, section.name, section, "section");
  }

  /**
   * Register an ordered runtime-context contribution.
   *
   * @param context - the contribution to register.
   * @returns a disposer that removes this exact registration.
   * @throws PromptAssemblyError on a duplicate name or a non-finite order.
   */
  context(context: PromptContext): () => void {
    requireFiniteOrder("context", context.name, context.order);
    return insertNamed(this.contexts, context.name, context, "context");
  }

  /**
   * Register a prompt variable.
   *
   * The name is validated HERE as well as at render, because a name references
   * cannot spell is a registration bug, and finding it at render would blame the
   * innocent section that referenced the name the author meant.
   *
   * @param name - the reference name, matching `[a-z][a-z0-9_]*`.
   * @param provider - evaluated once per assembly; may return `undefined`.
   * @returns a disposer that removes this exact registration.
   * @throws PromptAssemblyError on an illegal or duplicate name.
   */
  variable(name: string, provider: PromptVariableProvider): () => void {
    if (!VARIABLE_NAME_PATTERN.test(name)) {
      throw new PromptAssemblyError(
        "invalid-variable-name",
        `invalid prompt variable name "${name}" (must match ${String(VARIABLE_NAME_PATTERN)})`
      );
    }
    return insertNamed(this.variables, name, provider, "variable");
  }

  /** The registered section names in the order they would assemble. */
  sectionNames(): readonly string[] {
    return this.sortedSections().map((section) => section.name);
  }

  /**
   * Resolve every registered contribution into one assembly.
   *
   * Sorting happens before any provider runs — see the module header.
   *
   * @param context - the per-assembly caller context handed to every provider.
   * @returns the resolved, still-uninterpolated assembly.
   * @throws PromptAssemblyError when more than one complete section is active.
   */
  assemble(context: AssembleContext = {}): PromptAssembly {
    // A plain object, not a null-prototype one: `Object.hasOwn` in the renderer
    // is what keeps inherited keys out, and it has to be the load-bearing check
    // because a caller may hand `renderPrompt` a variables object we never built.
    const variables: Record<string, string | undefined> = {};
    for (const [name, provider] of this.variables) {
      variables[name] = provider(context);
    }

    const sectionDefinitions = this.sortedSections();
    const completeNames = sectionDefinitions
      .filter((section) => section.complete === true)
      .map((section) => section.name);
    if (completeNames.length > 1) {
      throw new PromptAssemblyError(
        "multiple-complete-sections",
        "multiple complete prompt sections are active: " +
          `${completeNames.map((name) => JSON.stringify(name)).join(", ")}. ` +
          "Exactly one section may claim to be the whole prompt."
      );
    }

    const resolved: AssembledSection[] = sectionDefinitions.map((section) => ({
      name: section.name,
      text: resolveText(section.text, context)
    }));
    // The complete section replaces the section LIST, not the assembly: contexts
    // and variables still resolve, because a total prompt override is a statement
    // about the system prompt and not a claim that runtime facts stopped being true.
    const completeName = completeNames[0];
    const sections =
      completeName === undefined
        ? resolved
        : resolved.filter((section) => section.name === completeName);

    const contexts: AssembledContext[] = [...this.contexts.values()]
      .sort(compareOrdered)
      .map((entry) => ({
        name: entry.name,
        text: resolveText(entry.text, context),
        // Carried, not consumed: the renderer is what has to know, and it runs
        // later. See PromptContext.literal for why this is a security boundary.
        ...(entry.literal === true ? { literal: true } : {})
      }));

    return Object.freeze({
      sections: Object.freeze(sections),
      contexts: Object.freeze(contexts),
      variables: Object.freeze(variables)
    });
  }

  /** Registered sections in assembly order. Map iteration is insertion order, so this sort is what removes it. */
  private sortedSections(): readonly PromptSection[] {
    return [...this.sections.values()].sort(compareOrdered);
  }
}

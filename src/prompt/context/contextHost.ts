/**
 * The registry of context plugins, and the boundary where their I/O happens.
 *
 * WHY A HOST AT ALL, WHEN THE ASSEMBLY REGISTRY ALREADY HOLDS CONTEXTS. Because
 * `PromptAssemblyRegistry.assemble()` is SYNCHRONOUS and must stay that way: it
 * is the function that produces the exact text a request commits to, and a
 * synchronous assembly cannot interleave, cannot half-resolve, and cannot depend
 * on which promise settled first. Plugins, meanwhile, read files and clocks. The
 * host is the seam between those two facts: it runs the asynchronous half ONCE
 * per step boundary in a declared order, caches each plugin's text, and the
 * contexts it registered then resolve from the cache instantly.
 *
 * That split is also what makes the snapshot reproducible. Every plugin's text
 * for one step is settled before assembly starts, so two calls to `assemble()`
 * between refreshes produce identical bytes — which matters because the request
 * digest signed in `request/header` is a commitment to exactly those bytes.
 *
 * THE ORDER IS TOTAL AND IT IS FIXED AT CONSTRUCTION. Plugins sort by `order`,
 * then by a code-unit name comparison (`<` / `>`, never `localeCompare`, which
 * varies with the host's locale and ICU build). Ties therefore do not fall back
 * to construction order, which is a plugin-load artifact — the same rule, and
 * the same reasoning, as ../assembly/promptRegistry.ts.
 *
 * COLLECTION IS SEQUENTIAL, NOT `Promise.all`. Concurrency would buy nothing —
 * these are small reads — and would cost the one property that matters: with
 * `Promise.all` the plugins observe each other's I/O in whatever order the event
 * loop chose, so a plugin that reads a file another plugin wrote would produce a
 * different snapshot on a different machine. Sequential in the declared order is
 * the only schedule that is the same everywhere.
 *
 * A FAILING PLUGIN STOPS THE STEP. `refresh` does not catch. A context plugin
 * that throws has failed to tell the model something the deployment said it
 * should hear, and the alternative — swallow it and send the request anyway —
 * is precisely the shape this repository keeps having to fix: the model gets a
 * prompt missing its guardrails, and the signed log faithfully records the
 * prompt that was sent as though it were the prompt that was asked for. Loud is
 * the only honest outcome, and a throw from the pre-step waterfall ends the turn
 * as a signed `error`. Ordinary per-file trouble never reaches here: the
 * instruction plugin turns a missing or unreadable file into a NOTICE inside its
 * own contribution (see ./instructionFiles.ts).
 */
import { PromptAssemblyError } from "../assembly/promptErrors.js";
import type { PromptAssemblyRegistry } from "../assembly/promptRegistry.js";
import type { ContextCollectInput, ContextPlugin } from "./contextTypes.js";

/** Total comparison: order first, then a locale-independent name comparison. */
function comparePlugins(a: ContextPlugin, b: ContextPlugin): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export class ContextPluginHost {
  private readonly plugins: readonly ContextPlugin[];

  /**
   * Each plugin's text from the LAST refresh.
   *
   * Replaced wholesale rather than patched, so a plugin that contributed
   * yesterday and contributes nothing today leaves nothing behind. A cache that
   * merged would keep showing the model an instruction file that has since been
   * deleted, which is the one failure mode a "current context" snapshot must not
   * have.
   */
  private cache: ReadonlyMap<string, string> = new Map();

  /**
   * @param plugins - the contributors, in any order; sorted here.
   * @throws PromptAssemblyError when two plugins share a name.
   */
  constructor(plugins: readonly ContextPlugin[]) {
    const seen = new Set<string>();
    for (const plugin of plugins) {
      if (seen.has(plugin.name)) {
        throw new PromptAssemblyError(
          "duplicate-registration",
          `context plugin "${plugin.name}" is registered twice`
        );
      }
      seen.add(plugin.name);
    }
    this.plugins = [...plugins].sort(comparePlugins);
  }

  /** The plugin names in the order they contribute. */
  get pluginNames(): readonly string[] {
    return this.plugins.map((plugin) => plugin.name);
  }

  /**
   * Run every plugin for one step boundary and replace the cache.
   *
   * The cache is swapped in ONE assignment at the end, so an abort or a throw
   * part-way through leaves the previous refresh's snapshot intact rather than a
   * half-updated mixture of two boundaries.
   *
   * @param input - what the loop knows about this boundary.
   * @throws whatever a plugin throws, and `AbortError` when the signal aborts.
   */
  async refresh(input: ContextCollectInput): Promise<void> {
    const next = new Map<string, string>();
    for (const plugin of this.plugins) {
      input.signal?.throwIfAborted();
      next.set(plugin.name, await plugin.collect(input));
    }
    input.signal?.throwIfAborted();
    this.cache = next;
  }

  /** The text one plugin produced at the last refresh, or `""` if it has none. */
  latest(name: string): string {
    return this.cache.get(name) ?? "";
  }

  /**
   * Register every plugin as a LITERAL context on an assembly registry.
   *
   * Literal because a plugin's text is computed from runtime inputs this process
   * does not control — see PromptContext.literal for why interpolating it would
   * be a namespace escape rather than a feature.
   *
   * @param registry - the assembly registry to contribute to.
   * @returns a disposer that removes exactly these registrations.
   * @throws PromptAssemblyError when a name is already registered there.
   */
  register(registry: PromptAssemblyRegistry): () => void {
    const disposers: (() => void)[] = [];
    try {
      for (const plugin of this.plugins) {
        disposers.push(
          registry.context({
            name: plugin.name,
            order: plugin.order,
            literal: true,
            // Resolves from the cache, which `refresh` already settled. The
            // provider does no work, so assembly stays synchronous and two
            // assemblies between refreshes produce identical bytes.
            text: () => this.latest(plugin.name)
          })
        );
      }
    } catch (error: unknown) {
      // A partial registration is worse than none: the caller would hold no
      // disposer for what did land, and the next attempt would fail on the
      // duplicate this one left behind.
      for (const dispose of disposers.reverse()) dispose();
      throw error;
    }
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }
}

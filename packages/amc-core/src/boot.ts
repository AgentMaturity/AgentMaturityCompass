/**
 * AMC's boot sequence: root context → composition tree → settled-tree audit.
 *
 * The ordering is deliberate. The audit runs *after* the tree settles and
 * *before* boot returns, so a caller either gets a fully composed runtime or an
 * error naming what did not load. A half-composed runtime that reports success
 * is the failure a governance product must not have: every later phase hangs
 * enforcement, evidence and scoring off this tree, and a silently absent plugin
 * is a silently absent control.
 */
import { Context, type Fiber } from "@amc/cordis";
import Loader from "@amc/cordis-plugin-loader";
import Include from "@amc/cordis-plugin-include";
import Hmr from "@amc/cordis-plugin-hmr";
import group from "@amc/cordis-plugin-group";
import timer from "@amc/cordis-plugin-timer";
import { watchFibers, describeUnsettled, type UnsettledFiber } from "./bootAudit.ts";
import { loadComposition, type CompositionSource } from "./composition.ts";

export interface BootOptions {
  /** Workspace root; the composition file is resolved beneath it. */
  workspace: string;
  /** Composition file, relative to the workspace. */
  configPath?: string;
  /**
   * Refuse to boot when the composition file's signature is missing or invalid.
   *
   * dsh's composition config is unsigned. AMC's is signable, and in a product
   * that sells tamper-evident evidence the plugin tree — which decides what is
   * enforced and what is recorded — is the last thing that should be editable
   * without attestation.
   */
  requireSignature?: boolean;
  /** Fail when any plugin has not reached ACTIVE. Default true. */
  auditSettled?: boolean;
  /**
   * Watch the composition and plugin sources, reloading on change.
   *
   * Off by default. A file watcher in production is a liability rather than a
   * feature: it turns an accidental write — a deploy touching a file, an editor
   * autosave — into a live reconfiguration of the controls that are enforcing
   * policy. Development wants it; a governed runtime should have to ask.
   */
  watch?: boolean | { root?: string[]; debounce?: number; ignored?: string[] };
}

export interface BootResult {
  ctx: Context;
  composition: CompositionSource;
  /** Non-empty only when auditSettled is false. */
  unsettled: UnsettledFiber[];
  /**
   * Re-reads the composition file and reconciles the tree by entry id.
   *
   * Only entries whose options actually changed are rebuilt; untouched
   * siblings keep their fibers, and the process is not restarted. That
   * property is what makes a composed runtime worth having — a policy or
   * budget can change under a live agent without dropping the run it governs,
   * or the ledger handles and gateway leases held open around it.
   *
   * P1.4 wires a file watcher to call this; until then it is the caller's.
   */
  reload(): Promise<void>;
  dispose(): Promise<void>;
}

export class BootError extends Error {
  constructor(
    message: string,
    readonly unsettled: readonly UnsettledFiber[] = []
  ) {
    super(message);
    this.name = "BootError";
  }
}

/**
 * Composes the runtime from `amc.cordis.yml`.
 *
 * On any failure the partially built tree is disposed before the error
 * propagates, so a failed boot leaves no half-live plugins holding file
 * handles, watchers or database connections.
 */
export async function boot(options: BootOptions): Promise<BootResult> {
  const auditSettled = options.auditSettled ?? true;
  const composition = loadComposition({
    workspace: options.workspace,
    configPath: options.configPath,
    requireSignature: options.requireSignature ?? false
  });

  const ctx = new Context();
  const audit = watchFibers(ctx);

  let stopWatchingConfig: (() => Promise<void>) | undefined;

  const disposeAll = async (): Promise<void> => {
    audit.stop();
    try {
      await stopWatchingConfig?.();
    } catch {
      // A watcher that will not close must not block teardown.
    }
    try {
      await ctx.fiber.dispose();
    } catch {
      // Teardown failures must not mask the original boot error.
    }
  };

  try {
    // Set on the root before anything mounts: Loader assigns baseUrl to its
    // own context, which the Include scope does not inherit, and Include
    // resolves its path as a URL against whatever baseUrl it can see.
    ctx.baseUrl = composition.baseUrl;

    ctx.plugin(timer);
    ctx.plugin(Loader, { baseUrl: composition.baseUrl });

    // Plugin application is deferred, so `ctx.loader` is not available on the
    // next line — everything that needs it composes inside an inject scope.
    let includeService: Include | undefined;

    /**
     * Re-reads the composition and reconciles by entry id.
     *
     * Shared by the public reload() and the file watcher, so a hand-driven
     * reload and an edit-triggered one cannot diverge.
     */
    const reloadComposition = async (): Promise<void> => {
      if (!includeService) {
        throw new Error("composition reload is unavailable: Include did not mount");
      }
      await includeService.refresh();
      await ctx.loader.await();
    };

    /**
     * Captures the mounted Include so reload() can drive it.
     *
     * Cordis keeps no instance reference on the fiber, and Include is not a
     * named service, so a subclass is the honest way to hold one — cleaner
     * than reaching through guarded context properties.
     */
    class CapturedInclude extends Include {
      constructor(scope: Context, config: ConstructorParameters<typeof Include>[1]) {
        super(scope, config);
        includeService = this;
      }
    }

    let createEntry: Promise<unknown> | undefined;
    const composed = ctx.inject(["loader"], (scope: Context) => {
      // Tree carriers are loader builtins: entries opt into them by name
      // rather than being plugged at the root.
      scope.loader.builtins["group"] = group;
      // Builtins are addressed with the `cordis:` prefix — the loader strips it
      // and looks the rest up here, rather than importing it as a specifier.
      scope.loader.builtins["amc-composition"] = CapturedInclude;

      // Mounted as a loader *entry*, not a directly-plugged service.
      //
      // EntryTree.entries() recurses into an entry's subtree, but only for
      // entries in the loader's store — a directly-plugged Include is invisible
      // to that walk. HMR builds its reload map from exactly that walk, so
      // every plugin in the composition was unreachable to hot reload: the
      // module reloaded and `hmr/reload` fired, but nothing was ever
      // re-applied. A silent no-op, not an error.
      // Started here, awaited outside: create() resolves only once the entry's
      // fiber activates, which waits on the very tree this inject scope
      // belongs to. Awaiting it in place deadlocks the scope against itself.
      createEntry = scope.loader.root.create({
        name: "cordis:amc-composition",
        config: { path: composition.relativePath }
      });
    });

    await composed.await();
    // The entry mounts its subtree asynchronously; the settled-tree audit must
    // not observe it mid-flight.
    await createEntry;

    // The loader's entry tree settles when no import or lifecycle task is
    // outstanding. It throws the fiber's own failure (or an AggregateError),
    // so a plugin that threw surfaces here rather than as a silent PENDING.
    await ctx.loader.await();

    if (options.watch) {
      const watchOptions = typeof options.watch === "object" ? options.watch : {};
      let hmrFiber: Fiber | undefined;
      await ctx.inject(["loader", "timer"], (scope: Context) => {
        hmrFiber = scope.plugin(Hmr, {
          base: options.workspace,
          root: watchOptions.root ?? ["."],
          debounce: watchOptions.debounce ?? 100,
          ignored: watchOptions.ignored ?? ["**/node_modules", "**/.*", "cache", "data"]
        });
      });
      // Hmr builds its watcher asynchronously; without awaiting it the audit
      // sees Hmr mid-LOADING and the config-registration scope PENDING on a
      // service that is seconds from existing.
      await hmrFiber?.await();
      await ctx.loader.await();

      // Wire the composition file to reconciliation. P1.2 left reload() for a
      // caller to drive; this is the caller. registerConfig watches the exact
      // path — including one under a directory that does not exist yet — and
      // serializes refreshes, so a burst of editor writes reconciles once.
      const registration = ctx.inject(["hmr"], async (scope: Context) => {
        stopWatchingConfig = await scope.hmr.registerConfig(composition.path, async () => {
          await reloadComposition();
        });
      });
      await registration.await();
      await ctx.loader.await();
    }

    const unsettled = audit.settled();
    if (auditSettled && unsettled.length > 0) {
      throw new BootError(
        `AMC boot did not settle: ${unsettled.length} plugin(s) never became active.\n` +
          describeUnsettled(unsettled) +
          `\n\nComposition: ${composition.path}`,
        unsettled
      );
    }

    return {
      ctx,
      composition,
      unsettled,
      async reload() {
        await reloadComposition();
      },
      async dispose() {
        await disposeAll();
      }
    };
  } catch (error) {
    await disposeAll();
    throw error;
  }
}

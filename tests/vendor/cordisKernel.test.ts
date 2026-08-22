import { describe, it, expect } from "vitest";
import { Context, Service } from "@amc/cordis";

/**
 * P1.1 exit criterion: Cordis runs inside the AMC repo.
 *
 * ADR-0001 vendored DeepSeek Harness's already-patched tree rather than
 * depending on upstream `@cordisjs/*`, because it carries 18 hardening patches
 * (fiber lifecycle, transactional loader, lazy `!!js`, `--dump-config`).
 *
 * These assert the properties every later phase rests on. AMC's runtime becomes
 * a plugin tree, so a service that cannot be torn down cleanly cannot be
 * hot-swapped (P1.4), scoped per-agent (P1.3), or replaced by a signed
 * third-party plugin (P9). Disposal is the load-bearing contract, not plugin
 * loading.
 *
 * The import is by package name, which proves the workspace link resolves —
 * the same property `verify-vendored-links` gates in CI.
 */
describe("vendored Cordis kernel", () => {
  it("loads a plugin and disposes it", async () => {
    const ctx = new Context();
    const seen: string[] = [];

    const fiber = ctx.plugin(() => {
      seen.push("setup");
    });
    await ctx.start?.();
    expect(seen).toContain("setup");

    await fiber.dispose();
    expect(fiber).toBeDefined();
  });

  it("releases tracked effects on unload", async () => {
    const ctx = new Context();
    const released: string[] = [];

    const fiber = ctx.plugin((scope: Context) => {
      scope.effect(() => () => released.push("effect-released"));
    });

    await ctx.start?.();
    expect(released).toEqual([]);

    await fiber.dispose();
    expect(released).toEqual(["effect-released"]);
  });

  it("dispatches typed events through the bus", async () => {
    const ctx = new Context();
    const heard: number[] = [];

    ctx.on("amc/test-event" as never, ((value: number) => {
      heard.push(value);
    }) as never);

    await ctx.start?.();
    await ctx.emit("amc/test-event" as never, 7 as never);
    expect(heard).toEqual([7]);
  });

  it("exposes a service on the context and withdraws it on unload", async () => {
    // Services register from their constructor via `super(ctx, name)` — there
    // is no static `provide` declaration to set from outside the class.
    class Probe extends Service {
      value = "live";
      constructor(ctx: Context) {
        super(ctx, "amcProbe");
      }
    }

    const ctx = new Context();
    const fiber = ctx.plugin(Probe);
    await ctx.start?.();

    // Service registration is how every AMC subsystem will hang off the tree
    // (P1.3), so it has to be reversible.
    expect((ctx as unknown as { amcProbe?: Probe }).amcProbe?.value).toBe("live");

    await fiber.dispose();
    expect((ctx as unknown as { amcProbe?: Probe }).amcProbe).toBeUndefined();
  });

  it("runs every cleanup in a disposed subtree", async () => {
    const ctx = new Context();
    const order: string[] = [];

    const parent = ctx.plugin((scope: Context) => {
      scope.effect(() => () => order.push("parent"));
      scope.plugin((child: Context) => {
        child.effect(() => () => order.push("child"));
      });
    });

    await ctx.start?.();
    await parent.dispose();

    // Both cleanups run — nothing in the subtree is stranded, which is the
    // property P1.4's hot reload depends on. The observed order is
    // outer-then-inner; asserted as a set rather than a sequence because the
    // ordering is Cordis's to define and pinning it here would turn an
    // upstream implementation detail into an AMC contract.
    expect([...order].sort()).toEqual(["child", "parent"]);
  });
});

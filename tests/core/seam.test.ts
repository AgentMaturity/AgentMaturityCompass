import { describe, it, expect } from "vitest";
import { Context } from "@amc/cordis";
import {
  AmcSeam,
  defineSeam,
  checkDisposal,
  describeDisposal,
  createAgentScope,
  emitPlatformEvent
} from "@amc/core";

/**
 * P1.3's stated verifications:
 *   - a two-service graph where unloading the provider disposes the consumer
 *   - an events-up / visibility-down scope test
 *   - a resource registered via ctx.effect is released on unload
 *
 * These are the substrate every later phase assumes. Enforcement, evidence and
 * scoring all attach as services on this tree, so a provider that cannot be
 * unloaded cleanly is a control that cannot be replaced, and an event that
 * crosses scopes is evidence attributed to the wrong agent.
 */
const LEDGER = defineSeam("amcLedger");

class TestLedger extends AmcSeam {
  readonly written: string[] = [];
  constructor(ctx: Context) {
    super(ctx, LEDGER.name);
  }
  write(entry: string): void {
    this.written.push(entry);
  }
}

describe("capability seams", () => {
  it("gates a consumer on its provider, and tears it down with it", async () => {
    const ctx = new Context();
    const lifecycle: string[] = [];

    const consumer = {
      name: "consumer",
      inject: [LEDGER.name],
      apply(scope: Context) {
        lifecycle.push("consumer:apply");
        scope.effect(() => () => lifecycle.push("consumer:dispose"));
      }
    };

    // The consumer must not run before its provider exists.
    ctx.plugin(consumer);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lifecycle, "consumer must stay PENDING without its provider").toEqual([]);

    const providerFiber = ctx.plugin(TestLedger);
    await providerFiber.await();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lifecycle).toEqual(["consumer:apply"]);

    // Unloading the provider must take the consumer down with it: a consumer
    // left running against a withdrawn service is the failure injection gating
    // exists to prevent.
    await providerFiber.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lifecycle).toEqual(["consumer:apply", "consumer:dispose"]);
  });

  it("proves a well-behaved service disposes cleanly", async () => {
    class TrackingSeam extends AmcSeam {
      constructor(ctx: Context) {
        super(ctx, "amcTracking");
        const probe = (ctx as unknown as { amcDisposalProbe?: { release(l?: string): void } })
          .amcDisposalProbe;
        this.ctx.effect(() => () => probe?.release("watcher"));
      }
    }
    const report = await checkDisposal(TrackingSeam, undefined, {
      expectServices: ["amcTracking"],
      expectReleases: 1
    });
    expect(describeDisposal(report, 1)).toBe("disposes cleanly");
    expect(report.clean).toBe(true);
    expect(report.leakedServices).toEqual([]);
  });

  it("catches a cleanup that never completes", async () => {
    const stuck = {
      name: "stuck",
      apply(scope: Context) {
        scope.effect(() => () => {
          // A cleanup that throws has released nothing, however it is counted.
          throw new Error("cleanup failed");
        });
      }
    };
    const report = await checkDisposal(stuck, undefined, { expectReleases: 1 });
    expect(report.released).toBe(0);
    expect(report.clean).toBe(false);
    expect(describeDisposal(report, 1)).toMatch(/did not run to completion/);
  });

  it("cannot see a resource acquired outside ctx.effect — a stated limit", async () => {
    let intervalId: NodeJS.Timeout | undefined;
    const leaky = {
      name: "leaky",
      apply() {
        // Acquired outside Cordis's knowledge; nothing observes this.
        intervalId = setInterval(() => {}, 60_000);
      }
    };
    const report = await checkDisposal(leaky);
    clearInterval(intervalId);

    // Pinned deliberately: a clean report means "everything it tracked was
    // released", never "it tracked everything". A check that appeared to catch
    // untracked resources would be false assurance, and AmcSeam.track() — not
    // this check — is what closes the gap.
    expect(report.clean).toBe(true);
    expect(report.released).toBe(0);
  });

  it("catches a service left registered after unload", async () => {
    const report = await checkDisposal(TestLedger, undefined, {
      expectServices: [LEDGER.name]
    });
    expect(report.leakedServices, "Cordis withdraws the service on unload").toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("refuses an empty seam name", () => {
    expect(() => defineSeam("")).toThrow(/must not be empty/);
  });
});

describe("agent scopes", () => {
  it("delivers an agent's events to the platform, but not to a sibling", async () => {
    const root = new Context();
    const alpha = createAgentScope(root, "alpha");
    const beta = createAgentScope(root, "beta");

    const platformSaw: string[] = [];
    const alphaSaw: string[] = [];
    const betaSaw: string[] = [];

    // Events up: the platform observes every scoped dispatch.
    root.on("amc/scoped-dispatch", (envelope) => {
      platformSaw.push(`${envelope.origin.agentId}:${envelope.name}`);
    });
    alpha.on("tool-call", () => alphaSaw.push("heard"));
    beta.on("tool-call", () => betaSaw.push("heard"));

    await alpha.emit("tool-call", { kind: "fs.write" });

    expect(platformSaw, "the platform must see it").toContain("alpha:tool-call");
    expect(alphaSaw, "the originating agent hears its own event").toEqual(["heard"]);
    // Cross-agent delivery would attribute alpha's action to beta.
    expect(betaSaw, "a sibling agent must not hear it").toEqual([]);

    await alpha.dispose();
    await beta.dispose();
  });

  it("delivers a platform-wide event to every agent", async () => {
    const root = new Context();
    const alpha = createAgentScope(root, "alpha");
    const beta = createAgentScope(root, "beta");

    const heard: string[] = [];
    alpha.on("freeze", () => heard.push("alpha"));
    beta.on("freeze", () => heard.push("beta"));

    await emitPlatformEvent(root, "freeze");

    // A fleet-wide freeze has to reach everyone, or it is not a freeze.
    expect(heard.sort()).toEqual(["alpha", "beta"]);

    await alpha.dispose();
    await beta.dispose();
  });

  it("isolates a service per agent while leaving the platform's visible", async () => {
    const root = new Context();

    class PlatformClock extends AmcSeam {
      constructor(ctx: Context) {
        super(ctx, "amcClock");
      }
      now(): string {
        return "platform";
      }
    }
    await root.plugin(PlatformClock).await();

    const alpha = createAgentScope(root, "alpha", { isolate: ["amcLedger"] });

    // Visibility down: an unisolated platform service is visible in the scope.
    expect(
      (alpha.ctx as unknown as { amcClock?: PlatformClock }).amcClock?.now()
    ).toBe("platform");

    // The isolated one is not inherited, so the agent provides its own.
    expect((alpha.ctx as unknown as Record<string, unknown>)["amcLedger"]).toBeUndefined();

    await alpha.dispose();
  });

  it("stops delivering to a disposed scope", async () => {
    const root = new Context();
    const alpha = createAgentScope(root, "alpha");
    const heard: string[] = [];
    alpha.on("tool-call", () => heard.push("heard"));

    await alpha.dispose();
    await emitPlatformEvent(root, "tool-call");

    // A disposed agent must stop receiving, or teardown is cosmetic.
    expect(heard).toEqual([]);
  });

  it("refuses an empty agent id", () => {
    expect(() => createAgentScope(new Context(), "  ")).toThrow(/non-empty agentId/);
  });
});

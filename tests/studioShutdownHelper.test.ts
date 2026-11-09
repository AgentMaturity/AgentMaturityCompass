import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";

// The fatal hook is captured, so the test can fire it the way fatalDiagnostic's handler would.
const fatal = vi.hoisted(() => ({ hook: null as null | (() => Promise<void>), capMs: 0, seen: false }));
vi.mock("../src/runtime/fatalDiagnostic.js", () => ({
  setFatalShutdownHook: (hook: () => Promise<void>, capMs: number) => { fatal.hook = hook; fatal.capMs = capMs; },
  fatalEventSeen: () => fatal.seen
}));
const { installStudioShutdown } = await import("../src/studio/studioShutdown.js");

const wait = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

// LIVE-RUNTIME-02 (D-R2): one stop per process, a second signal absorbed, a bounded wait, a fatal error joining the stop.
describe("installStudioShutdown", () => {
  test("a second SIGTERM while stopping is absorbed: stop runs once and the exit is 0", async () => {
    const signals = new EventEmitter();
    const stop = vi.fn(() => wait(300));
    const exit = vi.fn();
    const log = vi.fn();
    installStudioShutdown({ stop, exit, log, signals });
    signals.emit("SIGTERM", "SIGTERM");
    await wait(50);
    signals.emit("SIGTERM", "SIGTERM");
    signals.emit("SIGINT", "SIGINT");
    await wait(400);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(exit.mock.calls).toEqual([[0]]);
    expect(log).toHaveBeenCalledWith("amc: SIGTERM received while stopping; shutdown continues");
  });

  test("a stop that never resolves exits 1 at the cap", async () => {
    const signals = new EventEmitter();
    const exit = vi.fn();
    installStudioShutdown({ stop: () => new Promise<void>(() => undefined), exit, log: () => undefined, capMs: 50, signals });
    signals.emit("SIGINT", "SIGINT");
    await wait(150);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  test("a failed stop exits 1", async () => {
    const signals = new EventEmitter();
    const exit = vi.fn();
    installStudioShutdown({ stop: () => Promise.reject(new Error("api close failed")), exit, log: () => undefined, signals });
    signals.emit("SIGTERM", "SIGTERM");
    await wait(20);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  // Skeptic D5: the signal's resolution handler runs before the fatal path's exit(1), so a crash while stopping exited 0.
  test("a fatal error during a stop a signal started exits 1, not 0", async () => {
    const signals = new EventEmitter();
    const exit = vi.fn();
    installStudioShutdown({ stop: () => wait(200), exit, log: () => undefined, signals });
    signals.emit("SIGTERM", "SIGTERM");
    await wait(50);
    fatal.seen = true; // what fatalDiagnostic records when an uncaught error arrives
    void fatal.hook!();
    await wait(250);
    fatal.seen = false;
    expect(exit.mock.calls).toEqual([[1]]);
  });

  test("the fatal hook runs the same stop once, joining a stop already in progress", async () => {
    const signals = new EventEmitter();
    const stop = vi.fn(() => wait(100));
    installStudioShutdown({ stop, exit: () => undefined, log: () => undefined, capMs: 9_000, signals });
    expect(fatal.capMs).toBe(9_000);
    await Promise.all([fatal.hook!(), fatal.hook!()]);
    signals.emit("SIGTERM", "SIGTERM");
    await wait(20);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

import { fatalEventSeen, setFatalShutdownHook } from "../runtime/fatalDiagnostic.js";

/**
 * One signal policy for `amc studio start`, `amc _studio-daemon` and `amc gateway start` (LIVE-RUNTIME-02, D-R2).
 *
 * The first SIGINT or SIGTERM runs `stop()` once. A later signal while stopping is absorbed with one log line, so a
 * second Ctrl+C no longer kills the process mid-shutdown. `stop()` resolved: exit 0, or 1 when a fatal error happened
 * meanwhile. Still unresolved `capMs` after the first signal: exit 1. A fatal error runs the same stop once (joining a
 * stop already in progress) through fatalDiagnostic's hook, which then exits 1.
 */
export function installStudioShutdown(input: {
  stop: () => Promise<void>;
  log?: (line: string) => void;
  exit?: (code: number) => void;
  capMs?: number;
  signals?: Pick<NodeJS.EventEmitter, "on">;
}): void {
  const { stop, log = (line: string) => console.error(line), exit = (code: number) => process.exit(code), capMs = 9_000 } = input;
  let stopping: Promise<void> | null = null;
  const stopOnce = (): Promise<void> => (stopping ??= stop());
  const onSignal = (signal: string): void => {
    if (stopping) {
      log(`amc: ${signal} received while stopping; shutdown continues`);
      return;
    }
    const cap = setTimeout(() => {
      log(`amc: shutdown did not finish within ${capMs} ms; exiting`);
      exit(1);
    }, capMs);
    cap.unref();
    stopOnce().then(() => {
      clearTimeout(cap);
      exit(fatalEventSeen() ? 1 : 0); // this resolution runs before the fatal path's own exit(1), so it decides the code
    }, (error: unknown) => {
      clearTimeout(cap);
      log(`amc: shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      exit(1);
    });
  };
  const signals = input.signals ?? process;
  signals.on("SIGINT", onSignal);
  signals.on("SIGTERM", onSignal);
  setFatalShutdownHook(stopOnce, capMs);
}

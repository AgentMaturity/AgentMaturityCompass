import { createServer } from "node:net";

/**
 * Start and stop orchestration for runStudioForeground (LIVE-RUNTIME-02, -03, -10), kept out of the supervisor so it
 * stays under its line cap.
 */

const addressInUse = (error: unknown): boolean => String(error).includes("EADDRINUSE");

function portInUseError(port: number, source: string): Error {
  return new Error(`Port ${port} (from ${source}) is already in use. Stop the other process or change the port.`);
}

/** Bind and close host:port, so a configured port that is busy is refused before anything starts (D-R7). */
export async function assertPortFree(host: string, port: number, source: string | null): Promise<void> {
  if (source === null || port === 0) return;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.once("error", (error) => rejectPromise(addressInUse(error) ? portInUseError(port, source) : error));
    probe.listen({ host, port }, () => probe.close(() => resolvePromise()));
  });
}

/**
 * Start on the policy's port. A busy configured port is a hard error naming the port and where it came from; a busy
 * default port falls back to a free one and says so, as before.
 */
export async function listenOnPolicyPort<T extends { port: number }>(input: {
  label: string;
  port: number;
  source: string | null;
  start: (port: number) => Promise<T>;
  log?: (line: string) => void;
}): Promise<T> {
  try {
    return await input.start(input.port);
  } catch (error) {
    if (!addressInUse(error)) throw error;
    if (input.source !== null) throw portInUseError(input.port, input.source);
    const started = await input.start(0);
    (input.log ?? console.log)(`${input.label} port ${input.port} was busy; listening on ${started.port}`);
    return started;
  }
}

/** Close what already started, newest first, then rethrow: a refused start leaves no open session or listening socket. */
export async function closeStartedThenThrow(started: ReadonlyArray<() => Promise<void>>, error: unknown): Promise<never> {
  for (const close of [...started].reverse()) {
    await close().catch((closeError: unknown) => console.error(`studio: closing after a failed start: ${String(closeError)}`));
  }
  throw error;
}

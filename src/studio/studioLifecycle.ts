import { spawnSync } from "node:child_process";
import { createServer } from "node:net";

/**
 * Start and stop orchestration for runStudioForeground (LIVE-RUNTIME-02, -03, -10), kept out of the supervisor so it
 * stays under its line cap.
 */

const addressInUse = (error: unknown): boolean => String(error).includes("EADDRINUSE");

/**
 * The folder of the AMC Studio listening on `port`, read from the listener's command line (`amc up` starts
 * `cli.js _studio-daemon --workspace <folder>`); null when no Studio listens there or the system cannot say.
 */
export function studioFolderOnPort(port: number): string | null {
  const run = (cmd: string, args: string[]): string => {
    const out = spawnSync(cmd, args, { encoding: "utf8", timeout: 5_000 });
    return out.status === 0 ? out.stdout : "";
  };
  if (process.platform === "win32") return null;
  for (const pid of run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).split(/\s+/).filter(Boolean)) {
    const folder = /\s_studio-daemon\s(?:.*\s)?--workspace\s+(.+?)(?:\s+--[a-z]|\s*$)/.exec(run("ps", ["-ww", "-o", "command=", "-p", pid]))?.[1];
    if (folder) return folder;
  }
  return null;
}

function portInUseError(port: number, source: string): Error {
  // CLI-31: name the AMC folder that holds the port, so the person knows where to run amc down.
  const folder = studioFolderOnPort(port);
  if (folder) {
    return new Error(`Port ${port} (from ${source}) is already in use by AMC Studio for the folder ${folder}. `
      + `Stop it there (cd ${folder}, then amc down), or change the port.`);
  }
  return new Error(`Port ${port} (from ${source}) is already in use. Stop the other process or change the port.${source.startsWith("the default")
    ? " Another AMC folder may be running: stop it there with amc down, or give this folder its own ports." : ""}`);
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

/** `port` while it is free on `host`, else a free one picked by the OS. A probe: the caller still has to bind it. */
export async function defaultPortOrFree(host: string, port: number): Promise<number> {
  const probe = (candidate: number): Promise<number> => new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once("error", rejectPromise);
    server.listen({ host, port: candidate }, () => {
      const address = server.address();
      server.close(() => resolvePromise(typeof address === "object" && address ? address.port : candidate));
    });
  });
  try {
    return await probe(port);
  } catch (error) {
    if (!addressInUse(error)) throw error;
    return probe(0);
  }
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
  /** An unconfigured port prefers this one (the workspace's previous port, which installed hooks name) while it is free. */
  preferredPort?: number | null;
}): Promise<T> {
  const log = input.log ?? console.log;
  if (input.source === null && input.preferredPort && input.preferredPort !== input.port) {
    try {
      const kept = await input.start(input.preferredPort);
      log(`${input.label} listening on ${kept.port}, the port this workspace used last time (the default is ${input.port})`);
      return kept;
    } catch (error) {
      if (!addressInUse(error)) throw error;
    }
  }
  try {
    return await input.start(input.port);
  } catch (error) {
    if (!addressInUse(error)) throw error;
    if (input.source !== null) throw portInUseError(input.port, input.source);
    const started = await input.start(0);
    log(`${input.label} port ${input.port} was busy; listening on ${started.port}`);
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

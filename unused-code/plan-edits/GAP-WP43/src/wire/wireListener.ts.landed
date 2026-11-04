import { createServer, connect, type Server, type Socket } from "node:net";
import { chmodSync, lstatSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Ledger } from "../ledger/ledger.js";
import { assertWireCanServe, createWireDispatcher } from "./wireDispatcher.js";

/**
 * A unix-socket listener for the wire (plan P7.1a).
 *
 * WHY A SOCKET AND NOT STDIO. Stdio is already claimed several times over --
 * `amc mcp serve` (../mcp/mcpCli.ts), the REPL, and `amc connect hooks forward`
 * all speak on it -- and ../runtimes/common.ts contains an interactive
 * `rl.question` loop on stdin with no isTTY guard, which would swallow frames
 * from a non-human peer. A socket removes that whole collision class instead of
 * documenting a rule about it.
 *
 * THE SOCKET IS NOT AUTHENTICATION. Node exposes no portable peer credential, so
 * this file cannot know who connected; it only limits who can REACH the socket.
 * Authentication is the per-message lease in ./wireDispatcher.ts, and it stays
 * that way regardless of how tight the file permissions are. What the
 * permissions buy is that a local user on a shared machine cannot even present a
 * lease, which is confidentiality and blast radius, not identity.
 *
 * ACCESS CONTROL IS THE DIRECTORY, not the socket file. Socket-file permission
 * enforcement has historically varied between platforms, whereas directory
 * traversal permission is enforced everywhere. The socket therefore lives inside
 * a directory created 0700 whose mode is CHECKED after creation, so the window
 * between `listen()` and `chmod()` -- during which the socket carries whatever
 * the umask allowed -- is not reachable by anyone else in the first place. The
 * socket is also chmod-ed 0600, as the second of two locks rather than the only
 * one.
 *
 * ONE DISPATCHER PER CONNECTION, never one shared. A dispatcher owns a framer,
 * and a framer holds a half-received record. Sharing one would let a record from
 * one peer be completed by bytes from another -- concatenating two peers'
 * requests into a single message the ledger would then attribute to whichever
 * lease arrived last. Per-connection state is the whole reason this is not a
 * single object.
 */

export interface WireListenerInit {
  readonly workspace: string;
  readonly ledger: Ledger;
  /** An ALREADY-OPEN session that acceptances are written into. */
  readonly intakeSessionId: string;
  readonly monitorPublicKeys: readonly string[];
  readonly socketPath?: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMs?: number;
  readonly workspaceId?: string;
}

export interface WireListener {
  readonly socketPath: string;
  /** Live connections. Exposed so a caller can see the cap working. */
  readonly connections: number;
  close(): Promise<void>;
}

/**
 * How many peers may be connected at once.
 *
 * A bound exists because each connection holds a framer that may be buffering up
 * to MAX_WIRE_LINE_BYTES. Unbounded connections turn a socket anyone local can
 * open into unbounded memory, without a single message ever being authorised.
 */
export const DEFAULT_MAX_WIRE_CONNECTIONS = 16;

/** How long a connection may sit idle before it is closed. */
export const DEFAULT_WIRE_IDLE_MS = 120_000;

function wireSocketDir(workspace: string): string {
  return join(workspace, ".amc", "wire");
}

export function wireSocketPath(workspace: string): string {
  return join(wireSocketDir(workspace), "wire.sock");
}

export async function startWireListener(init: WireListenerInit): Promise<WireListener> {
  // Checked here as well as per dispatcher, so an operator learns at startup
  // rather than on the first message that mattered.
  assertWireCanServe();

  const socketPath = init.socketPath ?? wireSocketPath(init.workspace);
  await prepareSocketPath(socketPath, init.socketPath === undefined);

  const maxConnections = init.maxConnections ?? DEFAULT_MAX_WIRE_CONNECTIONS;
  const idleTimeoutMs = init.idleTimeoutMs ?? DEFAULT_WIRE_IDLE_MS;
  const live = new Set<Socket>();

  const server: Server = createServer((socket) => {
    if (live.size >= maxConnections) {
      // Destroyed without a reply: there is no request to answer yet, and
      // writing a JSON-RPC error would mean allocating a framer for a peer being
      // turned away, which is what the cap exists to avoid.
      socket.destroy();
      return;
    }
    live.add(socket);
    attach(socket, init, idleTimeoutMs, () => live.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  // Second lock. The directory is the one that has to hold.
  chmodSync(socketPath, 0o600);

  return {
    socketPath,
    get connections() {
      return live.size;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of [...live]) socket.destroy();
        server.close(() => resolve());
      })
  };
}

function attach(
  socket: Socket,
  init: WireListenerInit,
  idleTimeoutMs: number,
  release: () => void
): void {
  const dispatcher = createWireDispatcher({
    workspace: init.workspace,
    ledger: init.ledger,
    intakeSessionId: init.intakeSessionId,
    monitorPublicKeys: init.monitorPublicKeys,
    ...(init.workspaceId === undefined ? {} : { workspaceId: init.workspaceId })
  });

  socket.setTimeout(idleTimeoutMs, () => socket.destroy());

  socket.on("data", (chunk: Buffer) => {
    let outcome;
    try {
      outcome = dispatcher.handle(chunk);
    } catch {
      // The dispatcher answers rather than throws, so reaching here is a fault
      // in AMC. Nothing is written back: at this point it is not known what was
      // being answered, and a guessed reply is worse than a closed connection.
      socket.destroy();
      return;
    }

    for (const replyBytes of outcome.replies) {
      const flushed = socket.write(replyBytes);
      // Real backpressure. Without pausing, a peer that never reads makes Node
      // buffer replies without bound -- the same unbounded-memory problem the
      // connection cap addresses from the other direction.
      if (!flushed) {
        socket.pause();
        socket.once("drain", () => socket.resume());
      }
    }

    if (outcome.close) {
      // The stream is desynchronised, so nothing further on it can be trusted to
      // be a record. `end` rather than `destroy` so the refusal just written
      // actually reaches the peer.
      socket.end();
    }
  });

  socket.on("close", () => {
    const { discardedBytes } = dispatcher.end();
    void discardedBytes;
    release();
  });
  // A peer that vanishes is ordinary, not exceptional. Without a handler the
  // ECONNRESET would be an unhandled 'error' event and take the process down.
  socket.on("error", () => socket.destroy());
}

/**
 * Make a path safe to bind, or refuse to bind it.
 *
 * Three hazards, each of which has to be answered separately:
 *
 *  - A LEFTOVER SOCKET from a crashed process makes `listen` fail with
 *    EADDRINUSE. It is removed, but ONLY after `lstat` confirms it is a socket:
 *    unlinking whatever happens to be at a path is how a config file gets
 *    deleted by a typo in an argument.
 *  - A LIVE SERVER already on that path must not be displaced. Unlinking its
 *    socket and binding a new one leaves the old process running and invisible,
 *    with peers silently split between two listeners. So a connect is attempted
 *    first, and a refusal to bind is the right answer when it succeeds.
 *  - AN UNSAFE DIRECTORY. The mode is set AND then verified, because `mkdir`
 *    applies the umask and because the directory may already exist with wider
 *    permissions than this process would have chosen. The check runs for an
 *    operator-supplied path too: /tmp is mode 1777 everywhere, so exempting a
 *    chosen path would make the only real access control optional.
 */
async function prepareSocketPath(socketPath: string, createDir: boolean): Promise<void> {
  const dir = dirname(socketPath);
  if (createDir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  // Verified whether or not this process created it. An operator-supplied path
  // is still a path someone else may be able to enter -- /tmp is mode 1777 on
  // every unix -- and skipping the check for a chosen path would make the one
  // real access control optional.
  const mode = statSync(dir).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `refusing to serve the wire: ${dir} is mode ${mode.toString(8)}, which lets other `
      + "users enter it and reach the socket; use a directory with no group or other permissions"
    );
  }

  let existing;
  try {
    existing = lstatSync(socketPath);
  } catch {
    return;
  }
  if (!existing.isSocket()) {
    throw new Error(`refusing to serve the wire: ${socketPath} exists and is not a socket`);
  }
  if (await someoneIsListening(socketPath)) {
    throw new Error(`refusing to serve the wire: another listener is already on ${socketPath}`);
  }
  unlinkSync(socketPath);
}

/** Whether a connection to this path is accepted right now. */
function someoneIsListening(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = connect(socketPath);
    const settle = (answer: boolean) => {
      probe.destroy();
      resolve(answer);
    };
    probe.once("connect", () => settle(true));
    probe.once("error", () => settle(false));
  });
}

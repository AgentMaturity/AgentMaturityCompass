import { chmodSync, copyFileSync, lstatSync, opendirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Linux egress relay (ADR-008), used only when the signed policy has an
 * egress allow-list. The shell still runs in an empty network namespace. AMC's
 * per-call proxy listens on a Unix socket (mode 0600 directory) in the
 * launcher's private temp directory, which is bound read-only into the sandbox
 * at /amc-egress with a read-only copy of AMC's Node and a small relay script.
 * The relay listens on 127.0.0.1 inside the namespace, forwards each connection
 * to that socket, and runs the command with the proxy variables set. Nothing
 * else listens in that namespace, and the host's loopback is not in it.
 *
 * The seccomp filter is relaxed only as far as the relay needs: socket() for
 * AF_UNIX, AF_INET and AF_INET6, socketpair() for AF_UNIX, and connect(); every
 * other family (netlink, packet, ...) and io_uring stay denied. Because a
 * pathname Unix socket on a read-only mount can still be connected to, launch is
 * refused when the workspace holds a socket file (write grants are already
 * walked for them). Abstract Unix sockets are per network namespace, so the
 * host's are out of reach.
 */
export const EGRESS_MOUNT = "/amc-egress";

type Instruction = [code: number, jt: number, jf: number, k: number];
const KILL_PROCESS = 0x80000000, ERRNO_EPERM = 0x00050001, ALLOW = 0x7fff0000;
const AF_UNIX = 1, AF_INET = 2, AF_INET6 = 10;
/** socket, socketpair, connect, then io_uring's three entry points (same numbers on both ABIs). */
const SOCKET_CALLS = { x64: [41, 53, 42], arm64: [198, 199, 203] } as const;
const IO_URING = [425, 426, 427] as const;

export function encodeBpf(instructions: readonly Instruction[]): Buffer {
  const bytes = Buffer.alloc(instructions.length * 8);
  instructions.forEach(([code, jt, jf, value], index) => {
    bytes.writeUInt16LE(code, index * 8);
    bytes.writeUInt8(jt, index * 8 + 2);
    bytes.writeUInt8(jf, index * 8 + 3);
    bytes.writeUInt32LE(value, index * 8 + 4);
  });
  return bytes;
}

/** Reject other syscall ABIs, load the syscall number, refuse x32, then refuse each of `denied`. */
export function socketFilterHead(arch: "x64" | "arm64", denied: readonly number[]): Instruction[] {
  const instructions: Instruction[] = [
    [0x20, 0, 0, 4], // seccomp_data.arch
    [0x15, 1, 0, arch === "x64" ? 0xc000003e : 0xc00000b7],
    [0x06, 0, 0, KILL_PROCESS],
    [0x20, 0, 0, 0] // seccomp_data.nr
  ];
  // x32 uses the x86-64 audit architecture with a different syscall table.
  if (arch === "x64") instructions.push([0x35, 0, 1, 0x40000000], [0x06, 0, 0, ERRNO_EPERM]);
  for (const syscall of denied) instructions.push([0x15, 0, 1, syscall], [0x06, 0, 0, ERRNO_EPERM]);
  return instructions;
}

/** The deny-all filter's syscall list (src/sandbox/bwrapBackend.ts linuxSocketDenyFilter). */
export function socketDenyList(arch: "x64" | "arm64"): number[] {
  return [...SOCKET_CALLS[arch], ...IO_URING];
}

/** The relay's filter: socket() only for AF_UNIX, AF_INET and AF_INET6, socketpair() only for AF_UNIX; io_uring denied. */
export function linuxSocketEgressFilter(arch: "x64" | "arm64"): Buffer {
  const [socket, socketpair] = SOCKET_CALLS[arch];
  return encodeBpf([
    ...socketFilterHead(arch, IO_URING),
    [0x15, 2, 0, socket], // to the socket() family check
    [0x15, 7, 0, socketpair], // to the socketpair() family check
    [0x06, 0, 0, ALLOW],
    [0x20, 0, 0, 16], // args[0], low word: the address family
    [0x15, 3, 0, AF_UNIX],
    [0x15, 2, 0, AF_INET],
    [0x15, 1, 0, AF_INET6],
    [0x06, 0, 0, ERRNO_EPERM],
    [0x06, 0, 0, ALLOW],
    [0x20, 0, 0, 16],
    [0x15, 1, 0, AF_UNIX],
    [0x06, 0, 0, ERRNO_EPERM],
    [0x06, 0, 0, ALLOW]
  ]);
}

/** Refuse a tree that holds a socket file (or more entries than can be checked); links are not followed. */
export function refuseSocketFiles(root: string, budget = 20_000): void {
  const pending = [root];
  let remaining = budget;
  while (pending.length) {
    const path = pending.pop()!;
    if (--remaining < 0) throw new Error("The workspace has too many files to check for socket files before opening a network relay; use a smaller workspace.");
    const info = lstatSync(path);
    if (info.isSocket()) throw new Error("The workspace holds a socket file, which a command with a network relay could connect to; remove it or use another workspace.");
    if (!info.isDirectory()) continue;
    const directory = opendirSync(path);
    try { for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) pending.push(join(path, entry.name)); }
    finally { directory.closeSync(); }
  }
}

/** Runs inside the sandbox: listen on 127.0.0.1, forward to AMC's proxy socket, run the command with the proxy set. */
export const RELAY_SOURCE = `import { connect, createServer } from "node:net";
import { spawn } from "node:child_process";
import { constants } from "node:os";
const [socketPath, ...command] = process.argv.slice(2);
const token = process.env.AMC_EGRESS_TOKEN ?? "";
delete process.env.AMC_EGRESS_TOKEN;
const server = createServer(client => {
  const upstream = connect(socketPath);
  const end = () => { client.destroy(); upstream.destroy(); };
  for (const side of [client, upstream]) { side.on("error", end); side.on("close", end); }
  client.pipe(upstream); upstream.pipe(client);
});
server.on("error", () => { process.stderr.write("amc: the network relay could not start; the command did not run\\n"); process.exit(125); });
server.listen(0, "127.0.0.1", () => {
  const url = "http://amc:" + token + "@127.0.0.1:" + server.address().port;
  const env = { ...process.env, NODE_USE_ENV_PROXY: "1" };
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) env[name] = env[name.toLowerCase()] = url;
  const child = spawn(command[0], command.slice(1), { stdio: "inherit", env });
  child.on("error", () => process.exit(127));
  child.on("exit", (code, signal) => process.exit(code ?? 128 + (constants.signals[signal] ?? 0)));
});
`;

/** Write the relay and a read-only copy of AMC's Node into `directory`, which the backend binds at EGRESS_MOUNT. */
export function prepareRelayDirectory(directory: string): void {
  const node = join(directory, "node");
  copyFileSync(realpathSync(process.execPath), node);
  chmodSync(node, 0o500);
  writeFileSync(join(directory, "relay.mjs"), RELAY_SOURCE, { flag: "wx", mode: 0o400 });
}

/** The command as the sandbox runs it: under the relay, which connects to the proxy socket at EGRESS_MOUNT. */
export function relayCommand(command: readonly string[]): string[] {
  return [`${EGRESS_MOUNT}/node`, `${EGRESS_MOUNT}/relay.mjs`, `${EGRESS_MOUNT}/proxy.sock`, ...command];
}

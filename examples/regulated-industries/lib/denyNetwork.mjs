// Preloaded into every CLI process with `node --import` when an example runs
// with --deny-network. Any TCP/TLS connect or DNS lookup is refused before it
// leaves the process and appended to $AMC_EXAMPLE_NET_LOG, so the runner can
// report the attempt instead of trusting that none happened.
import { appendFileSync } from "node:fs";
import dns from "node:dns";
import net from "node:net";

const log = process.env.AMC_EXAMPLE_NET_LOG;

function deny(kind, target) {
  const line = JSON.stringify({ kind, target: String(target), pid: process.pid, argv: process.argv.slice(2, 5) });
  if (log) appendFileSync(log, `${line}\n`);
  return new Error(`network denied by examples/regulated-industries/lib/denyNetwork.mjs: ${kind} ${target}`);
}

function describeTarget(args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === "object") return first.path ?? `${first.host ?? "localhost"}:${first.port}`;
  return args.length > 1 && typeof args[1] === "string" ? `${args[1]}:${first}` : first;
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  // Unix domain sockets and named pipes stay on this host; allow them.
  if (typeof first === "string" && Number.isNaN(Number(first))) return originalConnect.apply(this, args);
  if (first && typeof first === "object" && typeof first.path === "string") return originalConnect.apply(this, args);
  const error = deny("connect", describeTarget(args));
  process.nextTick(() => this.destroy(error));
  return this;
};

dns.lookup = function lookup(host, ...rest) {
  const callback = rest.find((value) => typeof value === "function");
  const error = deny("dns.lookup", host);
  if (!callback) throw error;
  process.nextTick(() => callback(error));
};

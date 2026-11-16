import { randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { connect, createServer as createTcpServer, isIP, type Server as TcpServer, type Socket } from "node:net";
import { canonicalHost, decideEgress, pinnedLookup } from "../../enforce/egressAllowlist.js";
import { checkEgress, isEgressRefusal } from "../../residency/checkEgress.js";
import type { ShellEgressRow } from "../sandboxTypes.js";

/**
 * The sandboxed command's egress proxy (P1-05): an HTTP forward proxy (CONNECT
 * and plain HTTP) whose only authority is the signed `allowHosts`, started for
 * one confined call and closed with it.
 *
 * On macOS it listens on 127.0.0.1 and requires a per-call random token in
 * `Proxy-Authorization`, because any local process can reach that port; it
 * also holds the same port on ::1, so the Seatbelt rule that admits
 * `localhost:<port>` reaches nothing else. On Linux it listens on a Unix socket
 * in the launcher's private directory instead (`listenPath`).
 *
 * A destination is matched on the host the proxy will connect to, lowercased
 * and without a trailing dot: an exact entry, or a `.suffix` entry on a dot
 * boundary. An entry without a port covers the default port only (80 for plain
 * HTTP, 443 for CONNECT); any other port needs a `host:port` entry. A request
 * whose Host header names another site than its target is refused. A name
 * that is not listed is refused before any DNS query, so lookups cannot carry
 * data out. A listed name is resolved once, every address is checked
 * (decideEgress refuses loopback, link-local, private and metadata addresses
 * unless that exact IP is listed), and the proxy connects only to the checked
 * addresses rather than resolving again. Every decision is recorded before it
 * takes effect; a decision that cannot be recorded is a denial.
 *
 * `narrowings` are per-session lists (sessionEgress.ts): a destination must
 * pass the signed list AND every narrowing, so a narrowing can only remove.
 *
 * Each connection the allowlist admits then meets checkEgress (residency and
 * the kill switch, P2-01/P2-26) for the shell's workspace and agent, as agent
 * `network-tool` traffic, before it opens: an active kill refuses every new
 * connection. A command already running is not interrupted, and a tunnel
 * already open stays open.
 */
export interface ShellEgressProxy {
  /** `http://amc:<token>@127.0.0.1:<port>`, for HTTP_PROXY and its siblings; null when listening on a Unix socket. */
  readonly url: string | null;
  readonly port: number | null;
  /** Scrubbed from the command's output. */
  readonly token: string;
  /** Each refused destination once, in plain words, for the command's error output. */
  refusals(): string[];
  close(): void;
}

export interface ShellEgressOptions {
  readonly allowHosts: readonly string[];
  /** Per-session lists that can only shrink `allowHosts`. */
  readonly narrowings?: readonly (readonly string[])[];
  readonly record: (row: ShellEgressRow) => void;
  /** The trusted workspace and the agent whose call started the shell; never taken from the proxied request. */
  readonly workspace: string;
  readonly agentId: string;
  /** How to allow an entry (`host`, `host:port` or an IP), in plain words; never "switch the sandbox off". */
  readonly howToAllow?: (entry: string) => string;
  /** Listen on this Unix socket path (Linux) instead of 127.0.0.1. */
  readonly listenPath?: string;
}

/** `host:port` with an optional bracketed IPv6 host; the host is returned canonical, without a trailing dot. */
export function egressTarget(authority: string, defaultPort: number | null): { host: string; port: number } | null {
  const match = /^(\[[0-9a-fA-F:.]+\]|[^\s:/@[\]]+)(?::(\d{1,5}))?$/.exec(authority);
  const port = Number(match?.[2] ?? defaultPort ?? NaN);
  if (!match?.[1] || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  try {
    // WHATWG parsing canonicalizes numeric IPv4 forms such as 0x7f.1 and 2130706433.
    const host = canonicalHost(new URL(`http://${match[1]}/`).hostname).replace(/\.$/, "");
    return host === "" ? null : { host, port };
  } catch { return null; }
}

/** An allow-list entry: `host`, `.suffix`, `host:port`, `[v6]:port` or a bare IP literal. Null for anything else. */
export function egressEntry(entry: string): { host: string; port: number | null } | null {
  const text = entry.trim();
  const bare = canonicalHost(text).replace(/\.$/, "");
  if (isIP(bare) !== 0) return { host: bare, port: null };
  const hasPort = /:\d{1,5}$/.test(text);
  const parsed = egressTarget(text, hasPort ? null : 1);
  return parsed && { host: parsed.host, port: hasPort ? parsed.port : null };
}

/** The hosts of the entries that cover `port`: a portless entry covers only the default port. */
function entriesForPort(list: readonly string[], port: number, defaultPort: number): string[] {
  return list.flatMap(raw => {
    const entry = egressEntry(raw);
    return entry && (entry.port === null ? port === defaultPort : entry.port === port) ? [entry.host] : [];
  });
}

/** A decision; `entry` is set on a refusal that listing that entry would lift. */
export interface EgressVerdict { readonly allowed: boolean; readonly reason: string; readonly entry?: string }

/** The allow-list decision on a target and the addresses it will connect to (empty before DNS). */
export function decideTarget(host: string, port: number, defaultPort: number, addresses: readonly string[],
  allowHosts: readonly string[], narrowings: readonly (readonly string[])[] = []): EgressVerdict {
  const spell = (name: string): string => port === defaultPort ? name : `${isIP(name) === 6 ? `[${name}]` : name}:${port}`;
  const named = spell(host);
  const signed = decideEgress(host, addresses, { allowHosts: entriesForPort(allowHosts, port, defaultPort) });
  if (!signed.allowed) {
    if (port !== defaultPort && decideEgress(host, addresses, { allowHosts: entriesForPort(allowHosts, defaultPort, defaultPort) }).allowed) {
      return { allowed: false, entry: named, reason: `port ${port} is not listed for ${host}; an entry without a port covers port ${defaultPort} only` };
    }
    const inward = /resolves to non-public address (\S+),/.exec(signed.reason)?.[1];
    return { allowed: false, entry: inward === undefined ? named : spell(inward), reason: signed.reason };
  }
  for (const list of narrowings) {
    if (!decideEgress(host, addresses, { allowHosts: entriesForPort(list, port, defaultPort) }).allowed) {
      return { allowed: false, reason: `${host} is outside the narrower list this session set, so it stays blocked until the session ends (a new session uses the signed list)` };
    }
  }
  return { allowed: true, entry: named, reason: signed.reason };
}

const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "::1"]);

/** Tries to hold `port` on ::1 too; false when another process already has it there. */
async function holdIpv6Loopback(port: number): Promise<TcpServer | null | false> {
  const server = createTcpServer(socket => socket.destroy());
  return new Promise(resolve => {
    server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "EADDRINUSE" ? false : null)); // no IPv6 loopback: nothing can bind it
    server.listen(port, "::1", () => resolve(server));
  });
}

export async function startShellEgressProxy(options: ShellEgressOptions): Promise<ShellEgressProxy> {
  const allowHosts = [...options.allowHosts];
  const narrowings = (options.narrowings ?? []).map(list => [...list]);
  const howToAllow = options.howToAllow ?? ((entry: string) => `add "${entry}" to the allow-list this command was given`);
  const token = randomBytes(24).toString("hex");
  const expected = Buffer.from(`Basic ${Buffer.from(`amc:${token}`).toString("base64")}`);
  const refused = new Map<string, string>();
  const authorized = (request: IncomingMessage): boolean => {
    const given = Buffer.from(request.headers["proxy-authorization"] ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  /** Records the decision first; a refusal is remembered in plain words for the command's error output. */
  const decide = (host: string, port: number, decision: EgressVerdict): boolean => {
    try { options.record({ host, port, decision: decision.allowed ? "allow" : "deny", reason: decision.reason }); }
    catch { return false; }
    if (!decision.allowed) {
      const allow = decision.entry === undefined ? "" : ` To allow it, ${howToAllow(decision.entry)}.`;
      refused.set(`${host}:${port}`, `amc: blocked a network connection to ${host} port ${port}: ${decision.reason}.${allow}`);
    }
    return decision.allowed;
  };
  /** Synchronous, after the allowlist and DNS: any refusal (or failure) of checkEgress denies the connection. */
  const preflight = (url: string, decision: EgressVerdict): EgressVerdict => {
    if (!decision.allowed) return decision;
    try {
      checkEgress({ workspace: options.workspace, channel: "network-tool", url, agentId: options.agentId, dataClasses: null, purpose: "shell-egress-proxy" });
      return decision;
    } catch (error) {
      return { allowed: false, reason: isEgressRefusal(error) ? error.message : "the egress preflight failed" };
    }
  };
  /** The checked addresses to connect to, in order, or null when denied. `url` locates the destination for checkEgress. */
  const admit = async (host: string, port: number, defaultPort: number, url: string, hostHeader: string | undefined): Promise<string[] | null> => {
    // A Host header naming another site is refused. One naming a loopback address is the client naming its proxy
    // (Node's http client does that for CONNECT); the proxy never connects there on its account.
    const named = hostHeader === undefined ? null : egressTarget(hostHeader, port);
    if (named !== null && named.host !== host && !LOOPBACK_NAMES.has(named.host)) {
      decide(host, port, { allowed: false, reason: `the request's Host header names ${named.host}, not ${host}` });
      return null;
    }
    const byName = decideTarget(host, port, defaultPort, [], allowHosts, narrowings);
    if (!byName.allowed || isIP(host) !== 0) return decide(host, port, preflight(url, byName)) ? [host] : null;
    let addresses: string[] = [];
    try { addresses = (await lookup(host, { all: true, verbatim: true })).map(entry => entry.address); } catch { /* denied below */ }
    const decision = addresses.length === 0 ? { allowed: false, reason: `${host} did not resolve` }
      : decideTarget(host, port, defaultPort, addresses, allowHosts, narrowings);
    return decide(host, port, preflight(url, decision)) ? addresses : null;
  };
  const refusal = (host: string, port: number): string => `${refused.get(`${host}:${port}`) ?? "amc: AMC's egress policy refused this connection."}\n`;

  const sockets = new Set<Socket>();
  const track = (socket: Socket): void => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); socket.on("error", () => socket.destroy()); };
  const server = createServer((request, response) => {
    void (async () => {
      if (!authorized(request)) { response.writeHead(407, { "proxy-authenticate": "Basic" }).end(); return; }
      let url: URL | null = null;
      try { url = new URL(request.url ?? ""); } catch { /* refused below */ }
      const destination = url?.protocol === "http:" ? egressTarget(url.host, 80) : null;
      if (!url || !destination) { response.writeHead(400).end("amc: the egress proxy forwards absolute http:// URLs and CONNECT only\n"); return; }
      const addresses = await admit(destination.host, destination.port, 80, url.href, request.headers.host);
      if (addresses === null) { response.writeHead(403, { "content-type": "text/plain" }).end(refusal(destination.host, destination.port)); return; }
      // The Host header names the checked destination, never another site on the same address.
      const { "proxy-authorization": _credential, "proxy-connection": _hop, ...forwarded } = request.headers;
      const headers = { ...forwarded, host: url.host };
      const upstream = httpRequest({ host: destination.host, lookup: pinnedLookup(addresses), port: destination.port, method: request.method, path: `${url.pathname}${url.search}`, headers, setHost: false }, reply => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      });
      upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.pipe(upstream);
    })().catch(() => response.destroy());
  });
  server.on("connection", track);
  server.on("connect", (request: IncomingMessage, client: Socket, head: Buffer) => {
    track(client);
    void (async () => {
      if (!authorized(request)) { client.end("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic\r\n\r\n"); return; }
      const destination = egressTarget(request.url ?? "", null);
      if (!destination) { client.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
      // As at the gateway: the HTTPS root URL is a registry locator for the opaque tunnel, not evidence of TLS.
      const addresses = await admit(destination.host, destination.port, 443, `https://${request.url}/`, request.headers.host);
      if (addresses === null) {
        const body = refusal(destination.host, destination.port);
        client.end(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
        return;
      }
      const upstream = connect({ host: destination.host, port: destination.port, lookup: pinnedLookup(addresses) }, () => {
        const connectedAddress = upstream.remoteAddress ?? null;
        try { options.record({ host: destination.host, port: destination.port, decision: "allow", reason: "connected", connectedAddress }); }
        catch { upstream.destroy(); client.destroy(); return; }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      track(upstream);
      upstream.once("close", () => client.destroy());
      client.once("close", () => upstream.destroy());
    })().catch(() => client.destroy());
  });

  const listen = (...args: [string] | [number, string]): Promise<void> => new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(...(args as [number, string]), () => { server.off("error", reject); resolve(); });
  });
  let squat: TcpServer | null = null;
  if (options.listenPath !== undefined) {
    await listen(options.listenPath);
  } else {
    // Seatbelt admits `localhost:<port>`, which covers ::1 as well; hold that address so nothing else answers on it.
    for (let attempt = 0; ; attempt++) {
      await listen(0, "127.0.0.1");
      const held = await holdIpv6Loopback((server.address() as { port: number }).port);
      if (held !== false) { squat = held; break; }
      await new Promise<void>(resolve => server.close(() => resolve()));
      if (attempt >= 8) throw new Error("The egress proxy could not hold its port on both loopback addresses.");
    }
  }
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : null;
  if (options.listenPath === undefined && port === null) { server.close(); squat?.close(); throw new Error("The shell egress proxy did not bind a TCP port."); }
  return {
    url: port === null ? null : `http://amc:${token}@127.0.0.1:${port}`, port, token,
    refusals: () => [...refused.values()],
    close: () => { server.close(); squat?.close(); for (const socket of sockets) socket.destroy(); }
  };
}

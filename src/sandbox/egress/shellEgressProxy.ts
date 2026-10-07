import { randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { connect, isIP, type Socket } from "node:net";
import { canonicalHost, decideEgress } from "../../enforce/egressAllowlist.js";
import type { ShellEgressRow } from "../sandboxTypes.js";

/**
 * The native shell's egress proxy (P1-05): an HTTP forward proxy (CONNECT and
 * plain HTTP) whose only authority is the signed `allowHosts`, started for one
 * shell call and closed with it.
 *
 * It listens on 127.0.0.1 and requires a per-call random token in
 * `Proxy-Authorization`, because any local process can reach that port. A name
 * that is not listed is refused before any DNS query, so lookups cannot carry
 * data out. A listed name is resolved once, every address is checked, and the
 * proxy connects to a checked address rather than resolving again, so the name
 * cannot rebind between the decision and the connection. Every decision is
 * recorded before it takes effect; a decision that cannot be recorded is a
 * denial.
 */
export interface ShellEgressProxy {
  /** `http://amc:<token>@127.0.0.1:<port>`, for HTTP_PROXY and its siblings. */
  readonly url: string;
  readonly port: number;
  /** Scrubbed from the command's output. */
  readonly token: string;
  close(): void;
}

/** `host:port` with an optional bracketed IPv6 host; the host is returned canonical. */
function target(authority: string, defaultPort: number | null): { host: string; port: number } | null {
  const match = /^(\[[0-9a-fA-F:.]+\]|[^\s:/@[\]]+)(?::(\d{1,5}))?$/.exec(authority);
  const port = Number(match?.[2] ?? defaultPort ?? NaN);
  if (!match?.[1] || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  try {
    // WHATWG parsing canonicalizes numeric IPv4 forms such as 0x7f.1 and 2130706433.
    return { host: canonicalHost(new URL(`http://${match[1]}/`).hostname), port };
  } catch { return null; }
}

export async function startShellEgressProxy(options: {
  readonly allowHosts: readonly string[];
  readonly record: (row: ShellEgressRow) => void;
}): Promise<ShellEgressProxy> {
  const policy = { allowHosts: [...options.allowHosts] };
  const token = randomBytes(24).toString("hex");
  const expected = Buffer.from(`Basic ${Buffer.from(`amc:${token}`).toString("base64")}`);
  const authorized = (request: IncomingMessage): boolean => {
    const given = Buffer.from(request.headers["proxy-authorization"] ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const decide = (host: string, port: number, decision: { allowed: boolean; reason: string }): boolean => {
    try { options.record({ host, port, decision: decision.allowed ? "allow" : "deny", reason: decision.reason }); }
    catch { return false; }
    return decision.allowed;
  };
  /** The checked address to connect to, or null when denied. */
  const admit = async (host: string, port: number): Promise<string | null> => {
    const byName = decideEgress(host, [], policy);
    if (!byName.allowed || isIP(host) !== 0) return decide(host, port, byName) ? host : null;
    let addresses: string[] = [];
    try { addresses = (await lookup(host, { all: true, verbatim: true })).map(entry => entry.address); } catch { /* denied below */ }
    const decision = addresses.length === 0 ? { allowed: false, reason: `${host} did not resolve` } : decideEgress(host, addresses, policy);
    return decide(host, port, decision) ? addresses[0]! : null;
  };

  const sockets = new Set<Socket>();
  const track = (socket: Socket): void => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); socket.on("error", () => socket.destroy()); };
  const server = createServer((request, response) => {
    void (async () => {
      if (!authorized(request)) { response.writeHead(407, { "proxy-authenticate": "Basic" }).end(); return; }
      let url: URL | null = null;
      try { url = new URL(request.url ?? ""); } catch { /* refused below */ }
      const destination = url?.protocol === "http:" ? target(url.host, 80) : null;
      if (!url || !destination) { response.writeHead(400).end("amc: the shell egress proxy forwards absolute http:// URLs and CONNECT only\n"); return; }
      const address = await admit(destination.host, destination.port);
      if (address === null) { response.writeHead(403).end(`amc: the signed egress allowlist denied ${destination.host}\n`); return; }
      // The Host header names the checked destination, never another site on the same address.
      const { "proxy-authorization": _credential, "proxy-connection": _hop, ...forwarded } = request.headers;
      const headers = { ...forwarded, host: url.host };
      const upstream = httpRequest({ host: address, port: destination.port, method: request.method, path: `${url.pathname}${url.search}`, headers, setHost: false }, reply => {
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
      const destination = target(request.url ?? "", null);
      if (!destination) { client.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
      const address = await admit(destination.host, destination.port);
      if (address === null) { client.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
      const upstream = connect({ host: address, port: destination.port }, () => {
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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") { server.close(); throw new Error("The shell egress proxy did not bind a TCP port."); }
  return {
    url: `http://amc:${token}@127.0.0.1:${address.port}`, port: address.port, token,
    close: () => { server.close(); for (const socket of sockets) socket.destroy(); }
  };
}

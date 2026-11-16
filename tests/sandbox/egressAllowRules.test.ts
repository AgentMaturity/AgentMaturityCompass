/**
 * The allow-list rules the sandbox egress proxy applies (shellEgressProxy.ts), the per-session narrowing
 * (sessionEgress.ts) and the plain refusal message. Loopback only: an owned origin on 127.0.0.1.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import { createServer as createTcpServer, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { decideTarget, egressEntry, egressTarget, quoteEntries, startShellEgressProxy } from "../../src/sandbox/egress/shellEgressProxy.js";
import { narrowSessionEgress, sessionEgressNarrowing, withRefusals } from "../../src/sandbox/egress/sessionEgress.js";
import { toolDefinitionSchema } from "../../src/toolhub/toolsSchema.js";
import { initWorkspace } from "../../src/workspace.js";
import type { ShellEgressRow } from "../../src/sandbox/sandboxTypes.js";

describe("allow-list entries and targets", () => {
  test("entries are lowercased, lose a trailing dot and may carry a port", () => {
    expect(egressEntry("Example.COM.")).toEqual({ host: "example.com", port: null });
    expect(egressEntry(".example.com")).toEqual({ host: ".example.com", port: null });
    expect(egressEntry("example.com:8443")).toEqual({ host: "example.com", port: 8443 });
    expect(egressEntry("[::1]:3813")).toEqual({ host: "::1", port: 3813 });
    expect(egressEntry("::1")).toEqual({ host: "::1", port: null });
    expect(egressEntry("127.0.0.1:3813")).toEqual({ host: "127.0.0.1", port: 3813 });
    expect(egressEntry("not a host")).toBeNull();
    expect(egressTarget("API.Example.COM.:443", null)).toEqual({ host: "api.example.com", port: 443 });
  });

  test("an exact host or a dot-boundary suffix, on the default port only", () => {
    const list = ["example.com", ".pkg.example.org"];
    expect(decideTarget("example.com", 443, 443, [], list).allowed).toBe(true);
    expect(decideTarget("api.example.com", 443, 443, [], list).allowed).toBe(false);
    expect(decideTarget("a.pkg.example.org", 443, 443, [], list).allowed).toBe(true);
    expect(decideTarget("evilpkg.example.org", 443, 443, [], list).allowed).toBe(false);
    expect(decideTarget("pkg.example.org", 443, 443, [], list).allowed).toBe(false);
    const port = decideTarget("example.com", 8443, 443, [], list);
    expect(port).toMatchObject({ allowed: false, entries: ["example.com:8443"] });
    expect(port.reason).toBe("port 8443 is not listed for example.com; an entry without a port covers port 443 only");
    expect(decideTarget("example.com", 8443, 443, [], [...list, "example.com:8443"]).allowed).toBe(true);
    expect(decideTarget("example.com", 80, 443, [], list).allowed).toBe(false);
  });

  test("IP literals, inward and metadata addresses need that exact entry", () => {
    expect(decideTarget("93.184.215.14", 443, 443, [], ["example.com"]).allowed).toBe(false);
    expect(decideTarget("93.184.215.14", 443, 443, [], ["93.184.215.14"]).allowed).toBe(true);
    for (const address of ["169.254.169.254", "fd00:ec2::254", "::ffff:169.254.169.254", "10.0.0.7", "127.0.0.1", "::1", "fe80::1"]) {
      const verdict = decideTarget("api.example.com", 443, 443, [address], [".example.com"]);
      expect(verdict.allowed, address).toBe(false);
      // The hint names the address itself, and listing exactly that entry is what lifts it.
      expect(decideTarget("api.example.com", 443, 443, [address], [".example.com", ...verdict.entries!]).allowed, address).toBe(true);
    }
    expect(decideTarget("api.example.com", 443, 443, ["10.0.0.7"], [".example.com", "10.0.0.7"]).allowed).toBe(true);
    expect(decideTarget("127.0.0.1", 3813, 443, [], ["127.0.0.1"]).entries).toEqual(["127.0.0.1:3813"]);
  });

  test("a host listed only at another port is told which port is missing, not that it is unlisted", () => {
    const verdict = decideTarget("127.0.0.1", 3814, 80, [], ["127.0.0.1:3813"]);
    expect(verdict).toEqual({ allowed: false, entries: ["127.0.0.1:3814"], reason: "port 3814 is not listed for 127.0.0.1" });
    expect(decideTarget("example.com", 8443, 443, [], ["example.com:9000"]).reason).toBe("port 8443 is not listed for example.com");
  });

  test("a refusal for localhost names every entry that lifts it, so following it once is enough", () => {
    const before = decideTarget("localhost", 3813, 80, ["::1", "127.0.0.1"], []);
    expect(before.entries).toEqual(["localhost:3813", "[::1]:3813", "127.0.0.1:3813"]);
    expect(before.reason).toBe("localhost is not in the egress allowlist; it resolves to ::1 and 127.0.0.1, and a non-public address needs its own entry");
    expect(decideTarget("localhost", 3813, 80, ["::1", "127.0.0.1"], before.entries!).allowed).toBe(true);
    expect(quoteEntries(before.entries!)).toBe('"localhost:3813", "[::1]:3813" and "127.0.0.1:3813"');
  });

  test("the signed schema takes host:port entries and nothing looser", () => {
    const tool = (allowHosts: string[]) => toolDefinitionSchema.safeParse({ name: "bash", actionClass: "WRITE_HIGH",
      nativeSandbox: { kind: "os-native", writableDirectories: [], egress: { allowHosts } } }).success;
    for (const ok of ["example.com", ".example.com", "example.com:8443", "127.0.0.1", "127.0.0.1:3813", "::1", "[::1]:3813"]) expect(tool([ok]), ok).toBe(true);
    for (const bad of ["*.example.com", "https://example.com", "Example.com", "example.com:0", "example.com:70000", "[example.com]:80", "fe80::1%en0"]) expect(tool([bad]), bad).toBe(false);
  });
});

describe("per-session narrowing", () => {
  test("only shrinks: a host must match the signed list and every narrowing", () => {
    const signed = [".example.com"];
    expect(decideTarget("api.example.com", 443, 443, [], signed, [["api.example.com"]]).allowed).toBe(true);
    const outside = decideTarget("www.example.com", 443, 443, [], signed, [["api.example.com"]]);
    expect(outside.allowed).toBe(false);
    expect(outside.entries).toBeUndefined(); // no "add it" hint: the narrowing, not the signed list, refuses it
    expect(outside.reason).toMatch(/narrower list this session set/);
    expect(decideTarget("other.org", 443, 443, [], signed, [["other.org"]]).allowed).toBe(false);
    expect(decideTarget("api.example.com", 443, 443, [], signed, [["api.example.com"], ["www.example.com"]]).allowed).toBe(false);
  });

  test("is kept per session, adds a list on each call and drops unreadable entries", () => {
    narrowSessionEgress("session-a", ["api.example.com", "not a host"]);
    narrowSessionEgress("session-a", ["api.example.com"]);
    expect(sessionEgressNarrowing("session-a")).toEqual([["api.example.com"], ["api.example.com"]]);
    expect(sessionEgressNarrowing("session-b")).toEqual([]);
    expect(sessionEgressNarrowing(undefined)).toEqual([]);
    expect(() => narrowSessionEgress("", ["x.org"])).toThrow();
  });
});

describe("the proxy on loopback", () => {
  let root: string, workspace: string, origin: Server, port: number;
  beforeEach(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "amc-egress-rules-")));
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
    workspace = join(root, "workspace");
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    origin = createServer((req, res) => { req.resume(); res.writeHead(200).end("origin"); });
    await new Promise<void>(done => origin.listen(0, "127.0.0.1", done));
    port = (origin.address() as { port: number }).port;
  });
  afterEach(async () => {
    origin.closeAllConnections();
    await new Promise<void>(done => origin.close(() => done()));
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  async function ask(allowHosts: string[], method: "GET" | "CONNECT", target: string, extra: Record<string, string> = {}) {
    const rows: ShellEgressRow[] = [];
    const proxy = await startShellEgressProxy({ allowHosts, record: row => rows.push(row), workspace, agentId: "default",
      howToAllow: entries => `add ${quoteEntries(entries)} to the test list` });
    try {
      const result = await new Promise<{ status: number; body: string }>((done, fail) => {
        const req = httpRequest({ host: "127.0.0.1", port: proxy.port!, method, path: target,
          headers: { "proxy-authorization": `Basic ${Buffer.from(`amc:${proxy.token}`).toString("base64")}`, ...extra } });
        req.on("response", res => { const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })); });
        req.on("connect", (res, socket) => { socket.destroy(); done({ status: res.statusCode ?? 0, body: "" }); });
        req.on("error", fail);
        req.end();
      });
      return { ...result, rows, refusals: proxy.refusals(), proxy };
    } finally { proxy.close(); }
  }

  test("a listed IP and port is reached; the same IP without the port is refused with a plain message naming how to allow it", async () => {
    expect((await ask([`127.0.0.1:${port}`], "GET", `http://127.0.0.1:${port}/x`)).status).toBe(200);
    expect((await ask([`127.0.0.1:${port}`], "CONNECT", `127.0.0.1:${port}`)).status).toBe(200);
    const refused = await ask(["127.0.0.1"], "GET", `http://127.0.0.1:${port}/x`);
    expect(refused.status).toBe(403);
    const message = `amc: blocked a network connection to 127.0.0.1 port ${port}: port ${port} is not listed for 127.0.0.1; an entry without a port covers port 80 only. To allow it, add "127.0.0.1:${port}" to the test list.`;
    expect(refused.body).toBe(`${message}\n`);
    expect(refused.refusals).toEqual([message]);
    expect(refused.body).not.toMatch(/sandbox|disable|turn off|switch off|unsafe/i);
    expect(withRefusals("curl: (56) CONNECT tunnel failed", refused.proxy)).toBe(`curl: (56) CONNECT tunnel failed\n${message}\n`);
  });

  test("a CONNECT whose Host header names another host is refused", async () => {
    const { status, rows } = await ask([`127.0.0.1:${port}`, "example.com"], "CONNECT", `127.0.0.1:${port}`, { host: "example.com" });
    expect(status).toBe(403);
    expect(rows).toEqual([expect.objectContaining({ host: "127.0.0.1", decision: "deny", reason: "the request's Host header names example.com, not 127.0.0.1" })]);
    // Node's client names its proxy (a loopback address) in Host; that is not another site.
    expect((await ask([`127.0.0.1:${port}`], "CONNECT", `127.0.0.1:${port}`, { host: "localhost:1" })).status).toBe(200);
  });

  test("an unlisted name is refused before any lookup, and the message names it", async () => {
    const { status, refusals, rows } = await ask([`127.0.0.1:${port}`], "CONNECT", "blocked.invalid:443");
    expect(status).toBe(403);
    expect(rows).toHaveLength(1);
    expect(refusals).toEqual(['amc: blocked a network connection to blocked.invalid port 443: blocked.invalid is not in the egress allowlist. To allow it, add "blocked.invalid" to the test list.']);
  });

  test("an unlisted localhost names the loopback entries it also needs, and listing them reaches the server", async () => {
    const local = (await lookup("localhost", { all: true, verbatim: true })).map(row => row.address);
    const spelled = local.map(address => isIP(address) === 6 ? `[${address}]:${port}` : `${address}:${port}`);
    const { status, refusals } = await ask([], "GET", `http://localhost:${port}/x`);
    expect(status).toBe(403);
    expect(refusals[0]).toContain(`To allow it, add ${quoteEntries([`localhost:${port}`, ...spelled])} to the test list.`);
    expect((await ask([`localhost:${port}`, ...spelled], "GET", `http://localhost:${port}/x`)).rows.at(-1)).toMatchObject({ decision: "allow" });
  });

  test("holds its port on ::1 too, so localhost:<port> in Seatbelt reaches only the proxy", async () => {
    const proxy = await startShellEgressProxy({ allowHosts: ["example.com"], record: () => {}, workspace, agentId: "default" });
    try {
      const other = createTcpServer();
      const result = await new Promise<string>(done => {
        other.once("error", (error: NodeJS.ErrnoException) => done(error.code ?? "error"));
        other.listen(proxy.port!, "::1", () => { other.close(); done("bound"); });
      });
      // EADDRNOTAVAIL: this host has no IPv6 loopback, so nothing else can listen there either.
      expect(["EADDRINUSE", "EADDRNOTAVAIL", "EAFNOSUPPORT"]).toContain(result);
    } finally { proxy.close(); }
  });
});

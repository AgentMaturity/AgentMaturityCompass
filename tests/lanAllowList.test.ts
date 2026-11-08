import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { enableLanMode } from "../src/pairing/lanMode.js";
import { ipAllowedByCidrs } from "../src/gateway/server.js";
import { PUBLIC_BIND_REFUSAL } from "../src/studio/listenPolicy.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-03: the signed LAN bind, port and allow list apply when the variables are unset, loopback is always
// admitted, and a public bind open to every address is refused before anything listens or opens a ledger session.
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-lan-allow-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolvePromise) => probe.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = probe.address();
  await new Promise<void>((resolvePromise) => probe.close(() => resolvePromise()));
  return typeof address === "object" && address ? address.port : 0;
}

function status(port: number, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: "/healthz", headers: { connection: "close", ...headers } }, (res) => {
      res.resume();
      res.on("end", () => resolvePromise(res.statusCode ?? 0));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

function openSessions(dir: string): number {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE ended_ts IS NULL").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

const others = { gatewayPort: 0, proxyPort: 0, dashboardPort: 0, metricsPort: 0 };

describe("signed LAN allow list", () => {
  test("applies with the variables unset, binds the signed port, and always admits loopback", async () => {
    const dir = workspace();
    const lanPort = await freePort();
    enableLanMode({ workspace: dir, bind: "127.0.0.1", port: lanPort, allowedCIDRs: ["10.9.0.0/16"] });
    const runtime = await runStudioForeground({ workspace: dir, env: {}, trustedProxyHops: 1, ...others });
    try {
      expect(runtime.state.apiPort, "the signed port is bound").toBe(lanPort);
      expect(await status(lanPort), "loopback is admitted although the signed list omits it").toBe(200);
      expect(await status(lanPort, { "x-forwarded-for": "10.9.1.2" })).toBe(200);
      expect(await status(lanPort, { "x-forwarded-for": "192.0.2.9" })).toBe(403);
    } finally {
      await runtime.stop();
    }
  }, 120_000);

  test("a set AMC_ALLOWED_CIDRS replaces the signed list", async () => {
    const dir = workspace();
    enableLanMode({ workspace: dir, bind: "127.0.0.1", port: await freePort(), allowedCIDRs: ["10.9.0.0/16"] });
    const runtime = await runStudioForeground({ workspace: dir, env: { AMC_ALLOWED_CIDRS: "192.0.2.0/24" }, trustedProxyHops: 1, ...others });
    try {
      expect(await status(runtime.state.apiPort, { "x-forwarded-for": "10.9.1.2" })).toBe(403);
      expect(await status(runtime.state.apiPort, { "x-forwarded-for": "192.0.2.9" })).toBe(200);
    } finally {
      await runtime.stop();
    }
  }, 120_000);
});

describe("public bind open to every address", () => {
  test("is refused before the gateway starts, whatever AMC_LAN_MODE says, and leaves no open session or socket", async () => {
    const dir = workspace();
    const gatewayPort = await freePort();
    const env = { AMC_BIND: "0.0.0.0", AMC_ALLOWED_CIDRS: "0.0.0.0/0", AMC_LAN_MODE: "true" };
    // allowPublicBind mirrors the CLI, which passes AMC_ALLOW_PUBLIC_BIND || AMC_LAN_MODE.
    await expect(runStudioForeground({ workspace: dir, env, allowPublicBind: true, apiPort: 0, ...others, gatewayPort }))
      .rejects.toThrow(PUBLIC_BIND_REFUSAL);
    expect(openSessions(dir)).toBe(0);
    const refused = await new Promise<boolean>((resolvePromise) => {
      const socket = connect(gatewayPort, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolvePromise(false); });
      socket.once("error", () => resolvePromise(true));
    });
    expect(refused, "nothing listens on the gateway port").toBe(true);
    // The acknowledged start (AMC_ALLOW_PUBLIC_BIND=1) is asserted in tests/listenPolicy.test.ts: listening on 0.0.0.0
    // here would raise the application firewall prompt on a developer machine.
  }, 120_000);
});

describe("gateway allow list default", () => {
  test("an absent or empty list is loopback only, never every address", () => {
    expect(ipAllowedByCidrs("127.0.0.1", [])).toBe(true);
    expect(ipAllowedByCidrs("::1", [])).toBe(true);
    expect(ipAllowedByCidrs("127.0.0.2", [])).toBe(false);
    expect(ipAllowedByCidrs("192.0.2.9", [])).toBe(false);
    expect(ipAllowedByCidrs("192.0.2.9", ["192.0.2.0/24"])).toBe(true);
  });
});

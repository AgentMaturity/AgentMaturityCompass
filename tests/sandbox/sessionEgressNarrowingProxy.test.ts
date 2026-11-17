/** Per-session egress narrowing, the proxy environment, and how the per-call proxy fails closed. No outside network. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { EgressUnavailable, narrowSessionEgress, proxyEnvironment, sessionEgressNarrowing, startPolicyEgress, withRefusals }
  from "../../src/sandbox/egress/sessionEgress.js";
import type { SandboxPolicy } from "../../src/sandbox/sandboxTypes.js";
import type { ShellEgressProxy } from "../../src/sandbox/egress/shellEgressProxy.js";

let workspace: string;
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), "amc-session-egress-")); });
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); });

const session = () => `session-${randomUUID()}`;
const base = (extra: Partial<SandboxPolicy>): SandboxPolicy => ({ writableRoots: [], timeoutMs: 1000, network: "deny", ...extra });

describe("session narrowing", () => {
  test("needs a session id", () => {
    expect(() => narrowSessionEgress("", ["example.com"])).toThrow("A session egress narrowing needs a session id.");
  });

  test("each call adds a frozen list; unreadable entries are dropped; other sessions are untouched", () => {
    const id = session(), other = session();
    expect(sessionEgressNarrowing(id)).toEqual([]);
    narrowSessionEgress(id, ["api.example.com", "not a host", "10.0.0.1"]);
    narrowSessionEgress(id, ["api.example.com"]);
    const lists = sessionEgressNarrowing(id);
    expect(lists).toEqual([["api.example.com", "10.0.0.1"], ["api.example.com"]]);
    expect(Object.isFrozen(lists)).toBe(true);
    expect(Object.isFrozen(lists[0])).toBe(true);
    expect(sessionEgressNarrowing(other)).toEqual([]);
    expect(sessionEgressNarrowing(undefined)).toEqual([]);
  });
});

test("proxyEnvironment sets every proxy variable in both cases and tells Node to use them", () => {
  expect(proxyEnvironment("http://amc:t@127.0.0.1:9")).toEqual({
    HTTP_PROXY: "http://amc:t@127.0.0.1:9", http_proxy: "http://amc:t@127.0.0.1:9",
    HTTPS_PROXY: "http://amc:t@127.0.0.1:9", https_proxy: "http://amc:t@127.0.0.1:9",
    ALL_PROXY: "http://amc:t@127.0.0.1:9", all_proxy: "http://amc:t@127.0.0.1:9",
    NODE_USE_ENV_PROXY: "1"
  });
});

describe("startPolicyEgress", () => {
  const scope = () => ({ workspace, agentId: "agent-1" });

  test("no allow-list means no proxy (no network at all)", async () => {
    expect(await startPolicyEgress(base({}))).toBeNull();
  });

  test("an allow-list without a recorder or a scope is refused before anything starts", async () => {
    await expect(startPolicyEgress(base({ allowHosts: ["example.com"], egressScope: scope() }))).rejects.toThrow(
      "The command was not run, so it had no network at all: an allow-list needs a recorder for each network decision, and none was given.");
    const error = await startPolicyEgress(base({ allowHosts: ["example.com"], onEgress: () => {} })).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EgressUnavailable);
    expect((error as Error).message).toContain("needs the call's workspace and agent");
  });

  test("a proxy that cannot listen is a plain refusal, never an open network", async () => {
    const listenPath = join(workspace, "no-such-dir", "proxy.sock");
    await expect(startPolicyEgress(base({ allowHosts: ["example.com"], onEgress: () => {}, egressScope: scope() }), listenPath))
      .rejects.toThrow("The command was not run, so it had no network at all: AMC's network filter (the egress proxy) could not start.");
  });

  test("with everything given, a local proxy starts with a token-bearing URL", async () => {
    const proxy = await startPolicyEgress(base({ allowHosts: ["example.com"], onEgress: () => {}, egressScope: scope(),
      egressNarrowing: [["example.com"]], egressHowToAllow: (entries) => `allow ${entries.join(", ")}` }));
    try {
      expect(proxy).not.toBeNull();
      expect(proxy!.port).toBeGreaterThan(0);
      expect(proxy!.url).toBe(`http://amc:${proxy!.token}@127.0.0.1:${proxy!.port}`);
      expect(proxy!.refusals()).toEqual([]);
    } finally {
      proxy?.close();
    }
  });
});

describe("withRefusals", () => {
  const proxy = (lines: string[]) => ({ refusals: () => lines }) as unknown as ShellEgressProxy;
  test("leaves output alone without a proxy or without refusals", () => {
    expect(withRefusals("err", null)).toBe("err");
    expect(withRefusals("err", proxy([]))).toBe("err");
  });
  test("appends each refusal on its own line", () => {
    expect(withRefusals("", proxy(["amc: blocked a"]))).toBe("amc: blocked a\n");
    expect(withRefusals("err\n", proxy(["a", "b"]))).toBe("err\na\nb\n");
    expect(withRefusals("err", proxy(["a"]))).toBe("err\na\n");
  });
});

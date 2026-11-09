import { afterEach, describe, expect, test, vi } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { resolveSecretOption, warnInlineSecret, watchApiKey, watchSecretHeaders } from "../src/cli/argvSecret.js";
import { LangfuseAdapter } from "../src/watch/observabilityBridge.js";

/** LIVE-VAULT-14: secrets come from a file or the environment before the command line, and an inline secret is warned about. */
afterEach(() => vi.restoreAllMocks());
const files = (map: Record<string, string>) => (path: string) => { if (!(path in map)) throw new Error(`no such file ${path}`); return map[path]!; };
const WARNING = { option: "--api-key", alternatives: "--api-key-file <path> or AMC_WATCH_API_KEY" };

describe("resolveSecretOption", () => {
  test("the file wins (trimmed), then the environment, then the inline value; nothing is null", () => {
    const read = files({ "/run/secret": "  from-file\n" });
    expect(resolveSecretOption({ inline: "inline", file: "/run/secret" }, "AMC_WATCH_API_KEY", undefined, { AMC_WATCH_API_KEY: "from-env" }, read)).toBe("from-file");
    expect(resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", undefined, { AMC_WATCH_API_KEY: "from-env" }, read)).toBe("from-env");
    expect(resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", undefined, { AMC_WATCH_API_KEY: "" }, read)).toBe("inline");
    expect(resolveSecretOption({ inline: "inline" }, null, undefined, { AMC_WATCH_API_KEY: "from-env" }, read)).toBe("inline");
    expect(resolveSecretOption({}, "AMC_WATCH_API_KEY", undefined, {}, read)).toBeNull();
    expect(() => resolveSecretOption({ file: "/run/empty" }, null, undefined, {}, files({ "/run/empty": " \n" }))).toThrow("/run/empty is empty");
  });

  test("warns once on stderr only when the inline value is the one used", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    resolveSecretOption({ inline: "inline", file: "/run/secret" }, "AMC_WATCH_API_KEY", WARNING, {}, files({ "/run/secret": "f" }));
    resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", WARNING, { AMC_WATCH_API_KEY: "e" });
    expect(stderr).not.toHaveBeenCalled();
    resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", WARNING, {});
    expect(stderr.mock.calls.map((call) => String(call[0]))).toEqual([
      "Warning: --api-key is visible to every process on this machine (ps); use --api-key-file <path> or AMC_WATCH_API_KEY.\n"
    ]);
  });

  test("warnInlineSecret writes the one line; watchApiKey reads AMC_WATCH_API_KEY", () => {
    const lines: string[] = [];
    warnInlineSecret("--token", "--token-file <path>", (line) => lines.push(line));
    expect(lines).toEqual(["Warning: --token is visible to every process on this machine (ps); use --token-file <path>.\n"]);
    vi.stubEnv("AMC_WATCH_API_KEY", "env-key");
    expect(watchApiKey({ apiKey: "inline-key" })).toBe("env-key");
    vi.unstubAllEnvs();
  });
});

describe("watchSecretHeaders (Langfuse's secret key for amc watch connect and amc monitor live)", () => {
  test("from a file or AMC_WATCH_SECRET_KEY, never argv; another provider refuses one", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-watch-secret-"));
    try {
      const file = join(dir, "secret");
      writeFileSync(file, "sk-from-file\n", { mode: 0o600 });
      expect(watchSecretHeaders({ provider: "langfuse" }, {})).toBeUndefined();
      expect(watchSecretHeaders({ provider: "langfuse" }, { AMC_WATCH_SECRET_KEY: "sk-env" })).toEqual({ "x-langfuse-secret-key": "sk-env" });
      expect(watchSecretHeaders({ provider: "langfuse", secretKeyFile: file }, { AMC_WATCH_SECRET_KEY: "sk-env" })).toEqual({ "x-langfuse-secret-key": "sk-from-file" });
      expect(() => watchSecretHeaders({ provider: "helicone", secretKeyFile: file }, {})).toThrow(/langfuse only/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the Langfuse adapter then authenticates with the public and the secret key together", async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(String(req.headers.authorization));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const port = (server.address() as { port: number }).port;
      const adapter = new LangfuseAdapter();
      await adapter.connect({ provider: "langfuse", endpoint: `http://127.0.0.1:${port}`, apiKey: "pk-public",
        headers: watchSecretHeaders({ provider: "langfuse" }, { AMC_WATCH_SECRET_KEY: "sk-secret" }) });
      await adapter.fetchTraces(0, 10);
      expect(seen[0]).toBe(`Basic ${Buffer.from("pk-public:sk-secret").toString("base64")}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("amc watch connect --secret-key-file sends both keys (through the built CLI)", { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-watch-connect-"));
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(String(req.headers.authorization));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    writeFileSync(join(dir, "public"), "pk-public\n", { mode: 0o600 });
    writeFileSync(join(dir, "secret"), "sk-secret\n", { mode: 0o600 });
    const port = (server.address() as { port: number }).port;
    const child = spawn(process.execPath, [resolvePath("dist/cli.js"), "watch", "connect", "--provider", "langfuse", "--endpoint", `http://127.0.0.1:${port}`,
      "--api-key-file", join(dir, "public"), "--secret-key-file", join(dir, "secret"), "--poll-interval", "60000"],
      { cwd: dir, stdio: "ignore", env: { ...process.env, AMC_WATCH_API_KEY: "", AMC_WATCH_SECRET_KEY: "" } });
    try {
      for (let i = 0; i < 300 && seen.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      expect(seen[0]).toBe(`Basic ${Buffer.from("pk-public:sk-secret").toString("base64")}`);
    } finally {
      child.kill("SIGKILL");
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

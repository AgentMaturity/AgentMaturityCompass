import { createServer, request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { SmokeStep } from "./smokeSchema.js";

export async function runStep(
  id: string,
  fn: () => Promise<string[] | string | void> | string[] | string | void
): Promise<SmokeStep> {
  const started = Date.now();
  try {
    const result = await fn();
    const details = typeof result === "string" ? [result] : Array.isArray(result) ? result : [];
    return {
      id,
      status: "PASS",
      ms: Date.now() - started,
      details
    };
  } catch (error) {
    return {
      id,
      status: "FAIL",
      ms: Date.now() - started,
      details: [String(error)]
    };
  }
}

export async function pickFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once("error", rejectPromise);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectPromise(new Error("failed to allocate random port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise(port);
      });
    });
  });
}

export async function waitForReady(url: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  let lastStatus = 0;
  let lastBody = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      lastBody = await response.text();
      if (response.status >= 200 && response.status < 300) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`timeout waiting for ready endpoint: ${url} (lastStatus=${lastStatus}, lastBody=${lastBody.slice(0, 1200)})`);
}

export async function startFakeOpenAiServer(host = "127.0.0.1"): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const port = await pickFreePort(host);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname === "/v1/models") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-test" }] }));
      return;
    }
    if (url.pathname === "/v1/chat/completions" && (req.method ?? "GET").toUpperCase() === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model?: string };
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          model: body.model ?? "gpt-test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      );
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => resolvePromise());
  });
  return {
    baseUrl: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      })
  };
}

/** The CLI of the package this module runs from (dist/e2e or src/e2e → <package>/dist/cli.js), else the one under repoRoot. */
export function smokeCliEntrypoint(repoRoot: string): string {
  const running = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
  if (existsSync(running)) return running;
  const distCli = join(repoRoot, "dist", "cli.js");
  if (!existsSync(distCli)) {
    throw new Error("dist/cli.js not found. Run `npm run build` before `amc e2e smoke --mode local`.");
  }
  return distCli;
}

export async function startStudioChildProcess(params: {
  repoRoot: string;
  workspace: string;
  host: string;
  apiPort: number;
  dashboardPort: number;
  gatewayPort: number;
  proxyPort: number;
  metricsPort: number;
  vaultPassphrase: string;
}): Promise<{
  child: ChildProcess;
  close: () => Promise<void>;
}> {
  const cliPath = smokeCliEntrypoint(params.repoRoot);
  const child = spawn(
    process.execPath,
    [
      cliPath,
      "studio",
      "start",
      "--workspace",
      params.workspace,
      "--bind",
      params.host,
      "--port",
      String(params.apiPort),
      "--dashboard-port",
      String(params.dashboardPort)
    ],
    {
      cwd: params.repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AMC_WORKSPACE_DIR: params.workspace,
        AMC_BIND: params.host,
        AMC_STUDIO_PORT: String(params.apiPort),
        AMC_GATEWAY_PORT: String(params.gatewayPort),
        AMC_PROXY_PORT: String(params.proxyPort),
        AMC_METRICS_PORT: String(params.metricsPort),
        AMC_VAULT_PASSPHRASE: params.vaultPassphrase
      }
    }
  );

  let stdoutTail = "";
  let stderrTail = "";
  const appendTail = (current: string, next: string): string => {
    const merged = `${current}${next}`;
    return merged.length > 8000 ? merged.slice(merged.length - 8000) : merged;
  };
  child.stdout?.on("data", (chunk) => {
    stdoutTail = appendTail(stdoutTail, Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
  });
  child.stderr?.on("data", (chunk) => {
    stderrTail = appendTail(stderrTail, Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
  });

  try {
    await waitForReady(`http://${params.host}:${params.apiPort}/readyz`, 25_000);
  } catch (error) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore shutdown errors during startup failure
    }
    throw new Error(
      [
        String(error),
        stdoutTail.trim().length > 0 ? `stdout:\n${stdoutTail.trim()}` : "",
        stderrTail.trim().length > 0 ? `stderr:\n${stderrTail.trim()}` : ""
      ]
        .filter((line) => line.length > 0)
        .join("\n")
    );
  }

  return {
    child,
    close: async () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      await new Promise<void>((resolvePromise) => {
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
          resolvePromise();
        }, 10_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolvePromise();
        });
      });
    }
  };
}

export function runShell(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
} {
  const out = spawnSync(cmd, args, {
    cwd,
    env: env ?? process.env,
    encoding: "utf8"
  });
  const errorText = out.error ? String(out.error) : "";
  const stderrText = `${out.stderr ?? ""}${errorText ? `\n${errorText}` : ""}`.trim();
  return {
    ok: out.status === 0,
    status: out.status ?? (out.error ? -1 : 0),
    stdout: out.stdout ?? "",
    stderr: stderrText
  };
}

export async function httpGetJson(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise) => {
    const parsed = new URL(url);
    const req = httpRequest(
      {
        method: "GET",
        hostname: parsed.hostname,
        port: Number(parsed.port || "80"),
        path: `${parsed.pathname}${parsed.search}`
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", () => resolvePromise({ status: 0, body: "" }));
    req.end();
  });
}

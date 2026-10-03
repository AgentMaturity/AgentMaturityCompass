import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { governedTurnProbe } from "../scripts/deploy/governed-turn-probe.mjs";
import { read, root } from "./helpers/deployPackFixtures.js";

type Handler = (req: IncomingMessage, body: any) => { status: number; body?: unknown; headers?: Record<string, string> };
const servers: Server[] = [];
const dirs: string[] = [];

async function stub(routes: Record<string, Handler>): Promise<string> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let text = "";
    req.on("data", (chunk) => { text += chunk; });
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://stub").pathname;
      const key = Object.keys(routes).find((pattern) => new RegExp(`^${req.method} ${pattern}$`).test(`${req.method} ${path}`));
      const answer = key ? routes[key]!(req, text ? JSON.parse(text) : undefined) : { status: 404, body: { ok: false } };
      res.writeHead(answer.status, { "content-type": "application/json", ...answer.headers });
      res.end(JSON.stringify(answer.body ?? {}));
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ok = () => ({ status: 200, body: { status: "OK" } });
const csrf = "a".repeat(64);
const authRoutes: Record<string, Handler> = {
  "/healthz": ok, "/readyz": ok,
  "/auth/login": () => ({ status: 200, body: { ok: true }, headers: { "set-cookie": "amc_session=s1; HttpOnly" } }),
  "/auth/me": () => ({ status: 200, body: { nativeCsrfToken: csrf } })
};
const options: Handler = () => ({ status: 200, body: { ok: true, data: { agentId: "default", executionBlocked: false, providers: [{ id: "stub" }] } } });

function governedServer(verification: string, seen: string[] = []): Record<string, Handler> {
  return {
    ...authRoutes,
    "/api/v1/native-tasks/options": options,
    "/api/v1/native-tasks": (req, body) => {
      seen.push(`${req.headers["x-amc-native-intent"]}|${req.headers["x-amc-native-csrf"]}|${req.headers.cookie}|${body.provider}|${body.tools}`);
      return { status: 202, body: { ok: true, data: { taskId: "task-00000001" } } };
    },
    "/api/v1/native-tasks/task-00000001": () => ({ status: 200, body: { ok: true, data: { task: { state: "idle", revision: 1 } } } }),
    "/api/v1/native-tasks/task-00000001/verify": (_req, body) => ({ status: 200, body: { ok: true, data: { state: "closed", revision: body.expectedRevision, verification } } })
  };
}

describe("governed-turn probe", () => {
  it("liveness-only server is not verified: 200 on /healthz and /readyz, 503 on native tasks", async () => {
    const native503: Handler = () => ({ status: 503, body: { ok: false, error: "Native tasks require an authenticated Studio workspace." } });
    const base = await stub({ ...authRoutes, "/api/v1/native-tasks.*": native503 });
    const result = await governedTurnProbe({ baseUrl: base, username: "u", password: "p", timeoutMs: 5_000, pollMs: 10 });
    expect(result.status).toBe("failed");
    expect(result.steps.find((s: { id: string }) => s.id === "readyz").status).toBe("passed");
    expect(result.failedStep).toBe("options");

    // The CLI exits non-zero on the same server and prints status "failed".
    const dir = mkdtempSync(join(tmpdir(), "amc-probe-")); dirs.push(dir);
    writeFileSync(join(dir, "user"), "u\n"); writeFileSync(join(dir, "pass"), "p\n");
    const cli = await promisify(execFile)(process.execPath, ["scripts/deploy/governed-turn-probe.mjs", "--base-url", base,
      "--username-file", join(dir, "user"), "--password-file", join(dir, "pass"), "--timeout-ms", "5000"], { cwd: root })
      .then(() => ({ code: 0, stdout: "" }), (error: { code: number; stdout: string }) => ({ code: error.code, stdout: error.stdout }));
    expect(cli.code).toBe(1);
    expect(JSON.parse(cli.stdout).status).toBe("failed");
    expect(cli.stdout).not.toContain("\"p\"");
  });

  it("verifies only a completed stub turn whose evidence Studio verified", async () => {
    const seen: string[] = [];
    const base = await stub(governedServer("workspace-key-consistency", seen));
    const result = await governedTurnProbe({ baseUrl: base, username: "u", password: "p", timeoutMs: 5_000, pollMs: 10 });
    expect(result.status).toBe("verified");
    expect(result.steps.map((s: { id: string; status: string }) => `${s.id}=${s.status}`)).toEqual(
      ["healthz", "readyz", "login", "csrf", "options", "submit", "turn", "verify"].map((id) => `${id}=passed`));
    expect(seen).toEqual([`task-workspace-v1|${csrf}|amc_session=s1|stub|none`]);
  });

  it("fails when Studio's verification verdict is not a verified scope", async () => {
    for (const verdict of ["failed", "not-verified"]) {
      const base = await stub(governedServer(verdict));
      const result = await governedTurnProbe({ baseUrl: base, username: "u", password: "p", timeoutMs: 5_000, pollMs: 10 });
      expect(result.status).toBe("failed");
      expect(result.failedStep).toBe("verify");
    }
  });

  it("the Helm test pod ships a byte-identical copy and the compose verify profile mounts the script", () => {
    expect(read("deploy/helm/amc/files/governed-turn-probe.mjs")).toBe(read("scripts/deploy/governed-turn-probe.mjs"));
    const hook = read("deploy/helm/amc/templates/tests/governed-turn.yaml");
    expect(hook.match(/helm\.sh\/hook: test/g)).toHaveLength(2);
    expect(hook).toContain('.Files.Get "files/governed-turn-probe.mjs"');
    expect(hook).toContain('command: ["node", "/probe/governed-turn-probe.mjs"]');
    expect(read("deploy/helm/amc/templates/networkpolicy.yaml")).toContain("app.kubernetes.io/component: governed-turn-test");
    const compose = read("docker/docker-compose.yml");
    expect(compose).toMatch(/amc-verify:\n\s+profiles: \["verify"\]/);
    expect(compose).toContain("../scripts/deploy/governed-turn-probe.mjs:/probe/governed-turn-probe.mjs:ro");
  });
});
